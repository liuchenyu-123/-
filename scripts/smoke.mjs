/**
 * Post-deploy smoke check. Run after `npm start` (or against a deployed URL):
 *   SMOKE_URL=https://your-host.example npm run smoke
 *
 * Covers the default Chinese build, the English language switch, the shared engine
 * contract (numbers identical in both languages), the optional vision / live weather
 * providers and their offline degradation paths, plus the pricing optimiser's
 * import → elasticity fit → optimal plan → export chain.
 */
const base = (process.env.SMOKE_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
let failures = 0;

function check(name, condition, detail = '') {
  if (condition) {
    console.log(`PASS  ${name}${detail ? `  ${detail}` : ''}`);
  } else {
    console.error(`FAIL  ${name}${detail ? `  ${detail}` : ''}`);
    failures += 1;
  }
}

async function main() {
  const healthRes = await fetch(`${base}/api/health`);
  const health = await healthRes.json();
  check('health endpoint', healthRes.status === 200 && health.status === 'ok', `engine ${health.engineVersion}`);
  check('engine self-test', health.engineOk === true);
  check('six endpoints registered', Array.isArray(health.endpoints) && health.endpoints.length === 6 && health.endpoints.includes('/api/vision') && health.endpoints.includes('/api/weather') && health.endpoints.includes('/api/pricing'));
  check('provider status exposed', Boolean(health.vision) && Boolean(health.weather));
  check('pricing engine self-test', health.pricing?.selfTest === true, `v${health.pricing?.version}`);

  const getRes = await fetch(`${base}/api/analyse?city=antalya&weather=heat&hour=20`);
  const get = await getRes.json();
  check('GET /api/analyse (default zh)', getRes.status === 200 && get.lang === 'zh' && get.analysis.city.key === 'antalya', `${get.analysis.metrics.foodAtRiskKg} kg`);
  check('Chinese field brief present', typeof get.fieldBrief === 'string' && get.fieldBrief.includes('现场简报'));
  check('city ranking present', Array.isArray(get.cities) && get.cities.length === 3);

  const enRes = await fetch(`${base}/api/analyse?city=antalya&weather=heat&hour=20&lang=en`);
  const en = await enRes.json();
  check('GET /api/analyse?lang=en', enRes.status === 200 && en.lang === 'en' && en.fieldBrief.includes('FIELD BRIEF'));
  check('language does not change numbers', en.analysis.metrics.foodAtRiskKg === get.analysis.metrics.foodAtRiskKg);

  const badLangRes = await fetch(`${base}/api/analyse?lang=klingon`);
  check('invalid lang rejected with 400', badLangRes.status === 400);

  const postRes = await fetch(`${base}/api/analyse`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ city: 'guangzhou', hour: 18, quantities: [24, 18, 12, 16, 20, 15] }),
  });
  const post = await postRes.json();
  check('POST /api/analyse', postRes.status === 200 && post.analysis.metrics.foodAtRiskKg === 8.1 && post.lang === 'zh');

  const invalidRes = await fetch(`${base}/api/analyse`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ city: 'atlantis' }),
  });
  check('invalid input rejected with 400', invalidRes.status === 400);

  const briefRes = await fetch(`${base}/api/brief`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ city: 'manila' }),
  });
  const brief = await briefRes.json();
  check('POST /api/brief (zh)', briefRes.status === 200 && brief.brief.includes('现场简报'));

  const enBriefRes = await fetch(`${base}/api/brief`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ city: 'manila', lang: 'en' }),
  });
  const enBrief = await enBriefRes.json();
  check('POST /api/brief (en)', enBriefRes.status === 200 && enBrief.brief.includes('FIELD BRIEF'));

  // --- Optional providers: vision (photo -> SKUs) and key-free live weather ---
  const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';

  const visionGet = await fetch(`${base}/api/vision`);
  const visionInfo = await visionGet.json();
  check('GET /api/vision capability', visionGet.status === 200 && typeof visionInfo.vision?.configured === 'boolean');

  const visionRes = await fetch(`${base}/api/vision`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ image: TINY_PNG, city: 'guangzhou', lang: 'zh' }),
  });
  const visionBody = await visionRes.json();
  const visionRaw = JSON.stringify(visionBody);
  check('POST /api/vision returns labelled drafts', visionRes.status === 200 && ['vision', 'demo'].includes(visionBody.mode) && Array.isArray(visionBody.skus) && visionBody.skus.length > 0);
  check('vision drafts are whitelisted', visionBody.draftsValidated === visionBody.skus.length && visionBody.skus.every((s) => ['dairy', 'veg', 'bakery', 'prepared', 'fruit', 'grain'].includes(s.category)));
  check('image is never echoed back', visionBody.imageEchoed === false && !visionRaw.includes('iVBORw0KGgo'));

  const badImageRes = await fetch(`${base}/api/vision`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ image: 'not-an-image' }),
  });
  check('malformed image rejected with 400', badImageRes.status === 400);
  const badVisionLangRes = await fetch(`${base}/api/vision`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ image: TINY_PNG, lang: 'klingon' }),
  });
  check('invalid vision lang rejected with 400', badVisionLangRes.status === 400);

  const weatherRes = await fetch(`${base}/api/weather?city=guangzhou&lang=zh`);
  const weather = await weatherRes.json();
  check('GET /api/weather', weatherRes.status === 200 && ['live', 'fallback'].includes(weather.mode) && ['normal', 'heat', 'rain'].includes(weather.weather) && weather.lang === 'zh', `${weather.mode} / ${weather.weather} / ${weather.reason}`);
  check('weather exposes its source and rule reason', typeof weather.source === 'string' && typeof weather.reason === 'string' && typeof weather.provider?.enabled === 'boolean');
  const badWeatherCity = await fetch(`${base}/api/weather?city=atlantis`);
  check('invalid weather city rejected with 400', badWeatherCity.status === 400);
  const badWeatherLang = await fetch(`${base}/api/weather?lang=klingon`);
  check('invalid weather lang rejected with 400', badWeatherLang.status === 400);

  const overrideRes = await fetch(`${base}/api/analyse`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      city: 'guangzhou',
      skuOverrides: [
        { name: '测试酸奶', nameAlt: 'Test yogurt', category: 'dairy', unit: 'cup', qty: 20, expiryDays: 1 },
        { name: '测试面包', nameAlt: 'Test bread', category: 'bakery', unit: 'pc', qty: 10, expiryDays: 2 },
      ],
    }),
  });
  const override = await overrideRes.json();
  check('recognised SKUs drive /api/analyse', overrideRes.status === 200 && override.analysis.shelf.length === 2 && override.analysis.shelf[0].displayName === '测试酸奶');

  const badOverrideRes = await fetch(`${base}/api/analyse`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ skuOverrides: [{ name: 'x', category: 'injected', unit: 'cup', qty: 5, expiryDays: 1 }] }),
  });
  check('untrusted SKU category rejected with 400', badOverrideRes.status === 400);

  // --- Pricing optimiser: sales history -> fitted elasticity -> optimal plan ---
  const pricingGet = await fetch(`${base}/api/pricing`);
  const pricingInfo = await pricingGet.json();
  check('GET /api/pricing capability', pricingGet.status === 200 && pricingInfo.requiredColumns?.includes('selling_price') && typeof pricingInfo.sample?.url === 'string');

  const pricingRes = await fetch(`${base}/api/pricing`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ useSample: true, lang: 'zh' }),
  });
  const pricing = await pricingRes.json();
  const pr = pricing.result;
  check('POST /api/pricing returns a plan', pricingRes.status === 200 && pricing.lang === 'zh' && Array.isArray(pr?.plan) && pr.plan.length === 6);
  check('plan raises revenue and cuts waste', pr.totals.revenueDelta > 0 && pr.totals.foodRescuedKg > 0 && pr.totals.co2eAvoidedKg > 0, `+${pr.totals.revenueDelta} / -${pr.totals.foodRescuedKg} kg`);
  check('elasticity fit is labelled per SKU', pr.plan.every((p) => ['regression', 'fallback'].includes(p.method)) && pr.plan.some((p) => p.method === 'regression' && p.r2 > 0.85));
  check('unit-cost floor respected', pr.plan.every((p) => p.optimized.price >= p.unitCost));
  check('markdown ladder produced', Array.isArray(pr.schedule) && pr.schedule.length === 3 && pr.schedule[0].stages.length === 3);
  check('CSV and brief exports present', typeof pricing.planCsv === 'string' && pricing.planCsv.includes('建议折扣') && pricing.brief.includes('最优售卖方案'));

  const enPricingRes = await fetch(`${base}/api/pricing`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ useSample: true, lang: 'en' }),
  });
  const enPricing = await enPricingRes.json();
  check('POST /api/pricing?lang=en', enPricingRes.status === 200 && enPricing.brief.includes('OPTIMAL SELLING PLAN'));
  check('pricing language does not change numbers', JSON.stringify(enPricing.result.totals) === JSON.stringify(pr.totals));

  for (const [name, body, code] of [
    ['invalid pricing lang', { useSample: true, lang: 'klingon' }, 'invalid-lang'],
    ['invalid pricing city', { useSample: true, city: 'atlantis' }, 'invalid-city'],
    ['invalid pricing hour', { useSample: true, hour: 25 }, 'invalid-hour'],
  ]) {
    const res = await fetch(`${base}/api/pricing`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const json = await res.json();
    check(`${name} rejected with 400`, res.status === 400 && json.error === code);
  }
  const badCsvRes = await fetch(`${base}/api/pricing`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ csv: 'foo,bar\n1,2' }),
  });
  check('CSV missing columns rejected with 400', badCsvRes.status === 400 && (await badCsvRes.json()).error === 'missing-columns');

  const customCsv = [
    'date,sku_id,sku_name,category,unit,unit_kg,unit_cost,list_price,selling_price,qty_received,qty_sold,qty_wasted,weather,day_type,expiry_days',
    '2026-11-01,banana,Banana,fruit,pc,0.15,2,5,5,30,9,12,normal,weekday,1',
    '2026-11-02,banana,Banana,fruit,pc,0.15,2,5,4,30,14,9,normal,weekday,1',
    '2026-11-03,banana,Banana,fruit,pc,0.15,2,5,3.5,30,20,6,normal,weekend,1',
    '2026-11-04,banana,Banana,fruit,pc,0.15,2,5,3,30,25,3,heat,weekday,1',
  ].join('\n');
  const customRes = await fetch(`${base}/api/pricing`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ csv: customCsv, lang: 'zh' }),
  });
  const custom = await customRes.json();
  check('imported CSV drives the optimiser', customRes.status === 200 && custom.result.dataset.source === 'import' && custom.result.plan.length === 1 && custom.result.plan[0].skuId === 'banana');

  for (const path of ['/', '/lab', '/pricing', '/pitch']) {
    const res = await fetch(`${base}${path}`);
    const html = await res.text();
    check(`zh page ${path}`, res.status === 200 && html.includes('临期食物孪生') && html.includes('lang="zh-CN"'));
  }
  const pricingPage = await fetch(`${base}/pricing`);
  const pricingHtml = await pricingPage.text();
  check('pricing page renders dataset and plan controls', pricingPage.status === 200 && pricingHtml.includes('载入示例数据') && pricingHtml.includes('最优售卖方案'));
  const labRes = await fetch(`${base}/lab`);
  const labHtml = await labRes.text();
  check('lab renders photo + live weather controls', labRes.status === 200 && labHtml.includes('从一张货架照片开始') && labHtml.includes('自动带入实时天气'));

  const enPageRes = await fetch(`${base}/`, { headers: { cookie: 'lang=en' } });
  const enPage = await enPageRes.text();
  check('language switch cookie renders English', enPageRes.status === 200 && enPage.includes('Best-Before Twin') && enPage.includes('lang="en"'));

  console.log(`\n${failures === 0 ? 'All smoke checks passed.' : `${failures} smoke check(s) failed.`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`FAIL  smoke run could not reach ${base}: ${err.message}`);
  process.exit(1);
});
