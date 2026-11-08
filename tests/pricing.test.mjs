import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRICING_VERSION, SAMPLE_SALES_CSV, SAMPLE_SALES_META, REQUIRED_COLUMNS,
  parseSalesCsv, sampleSalesRows, fitElasticity, optimisePricing,
  buildPricingCsv, buildPricingBrief,
} from '../src/shared/pricing.mjs';

const BASE = { rows: sampleSalesRows(), city: 'guangzhou', hour: 18 };

test('bundled sales history parses cleanly and matches its metadata', () => {
  const p = parseSalesCsv(SAMPLE_SALES_CSV);
  assert.deepEqual(p.errors, []);
  assert.equal(p.rows.length, 84);
  assert.equal(p.stats.skus, 6);
  assert.equal(p.stats.days, 14);
  assert.equal(p.stats.from, '2026-10-26');
  assert.equal(p.stats.to, '2026-11-08');
  assert.equal(SAMPLE_SALES_META.rows, p.stats.rows);
  assert.equal(REQUIRED_COLUMNS.length, 4);
  assert.equal(parseSalesCsv('sku_id,list_price,selling_price,qty_sold\nx,4,4,3').rows.length, 1);
});

test('CSV validation rejects bad headers and whitelists untrusted fields', () => {
  assert.deepEqual(parseSalesCsv('').errors, ['empty']);
  assert.ok(parseSalesCsv('foo,bar\n1,2').errors.includes('missing-columns'));
  const evil = [
    'sku_id,list_price,selling_price,qty_sold,category,unit,qty_received,expiry_days',
    'yogurt,4.5,4.5,10,__proto__,truck,4,-9',
    'milk,7,7,8,dairy,bottle,20,2',
    'bad sku!,4,4,5,dairy,cup,10,2',
    'toast,9,999,3,bakery,loaf,10,2',
  ].join('\n');
  const p = parseSalesCsv(evil);
  assert.equal(p.rows.length, 2);
  assert.equal(p.rows[0].category, 'prepared');
  assert.equal(p.rows[0].unit, 'pc');
  assert.equal(p.rows[0].expiryDays, 1);
  assert.equal(p.rows[0].qtyReceived, 10); // clamped up to qtySold
  assert.ok(p.warnings.length >= 2);
});

test('quoted fields and row caps are handled without throwing', () => {
  const csv = 'sku_id,sku_name,list_price,selling_price,qty_sold\n'
    + 'a,"Yogurt, plain",4.5,4.05,10\n'
    + 'a,"Yogurt, plain",4.5,3.6,12\n';
  assert.equal(parseSalesCsv(csv).rows[0].name, 'Yogurt, plain');
  const many = ['sku_id,list_price,selling_price,qty_sold', ...Array.from({ length: 30 }, (_, i) => `s${i},4,4,5`)].join('\n');
  assert.equal(parseSalesCsv(many, { maxRows: 5 }).stats.truncated, true);
  assert.equal(parseSalesCsv(many, { maxRows: 5 }).rows.length, 5);
});

test('elasticity regression recovers the generating parameters', () => {
  const fits = fitElasticity(sampleSalesRows());
  assert.equal(fits.length, 6);
  const byId = Object.fromEntries(fits.map((f) => [f.skuId, f]));
  assert.ok(byId.meal.method === 'regression' && byId.meal.elasticity > 1.8 && byId.meal.elasticity < 2.3);
  assert.ok(byId.yogurt.elasticity > 1.8 && byId.yogurt.elasticity < 2.3);
  assert.ok(byId.toast.elasticity > 0.9 && byId.toast.elasticity < 1.4);
  assert.ok(fits.every((f) => f.r2 > 0.85));
  assert.ok(fits.every((f) => f.samples >= 10));
});

test('the optimal plan raises revenue and reduces waste at the same time', () => {
  const r = optimisePricing(BASE);
  assert.equal(r.pricingVersion, PRICING_VERSION);
  assert.equal(r.lang, 'zh');
  assert.equal(r.plan.length, 6);
  assert.ok(r.totals.revenueDelta > 0, `revenue delta ${r.totals.revenueDelta}`);
  assert.ok(r.totals.foodRescuedKg > 0, `food rescued ${r.totals.foodRescuedKg}`);
  assert.ok(r.totals.co2eAvoidedKg > 0);
  assert.ok(r.totals.revenueVsRule > 0, 'history beats the risk-only rule engine');
  assert.ok(r.plan.every((p) => p.optimized.price >= p.unitCost));
  assert.ok(r.plan.every((p) => p.optimalDiscount <= r.knobs.maxDiscount));
  assert.ok(r.plan.some((p) => p.optimalDiscount === 0), 'inelastic items keep their list price');
  assert.ok(r.plan.some((p) => p.optimalDiscount >= 30), 'elastic items get a real markdown');
});

test('language never changes a price or a number', () => {
  const zh = optimisePricing({ ...BASE, lang: 'zh' });
  const en = optimisePricing({ ...BASE, lang: 'en' });
  assert.deepEqual(zh.totals, en.totals);
  assert.deepEqual(zh.plan.map((p) => [p.skuId, p.optimalDiscount, p.optimalPrice, p.revenueDelta]),
    en.plan.map((p) => [p.skuId, p.optimalDiscount, p.optimalPrice, p.revenueDelta]));
  assert.deepEqual(zh.schedule.map((s) => s.stages.map((x) => [x.discount, x.price, x.expectedSold])),
    en.schedule.map((s) => s.stages.map((x) => [x.discount, x.price, x.expectedSold])));
  assert.match(buildPricingBrief(zh, 'zh'), /最优售卖方案/);
  assert.match(buildPricingBrief(en, 'en'), /OPTIMAL SELLING PLAN/);
});

test('the waste-weight dial changes the whole plan, not just a label', () => {
  const low = optimisePricing({ ...BASE, wasteWeight: 0 });
  const high = optimisePricing({ ...BASE, wasteWeight: 20 });
  const avg = (r) => r.plan.reduce((a, p) => a + p.optimalDiscount, 0) / r.plan.length;
  assert.ok(avg(high) > avg(low), `${avg(low)} → ${avg(high)}`);
  assert.ok(high.totals.foodRescuedKg >= low.totals.foodRescuedKg);
});

test('discount cap, below-cost switch and time of day are real constraints', () => {
  const capped = optimisePricing({ ...BASE, maxDiscount: 20, wasteWeight: 20 });
  assert.ok(capped.plan.every((p) => p.optimalDiscount <= 20));
  const normal = optimisePricing({ ...BASE, wasteWeight: 20 });
  const below = optimisePricing({ ...BASE, wasteWeight: 20, allowBelowCost: true });
  assert.ok(below.plan.some((p) => p.optimized.price < p.unitCost));
  assert.ok(below.totals.revenueOptimized >= normal.totals.revenueOptimized);
  const late = optimisePricing({ ...BASE, hour: 22 });
  assert.ok(late.totals.revenueBaseline < normal.totals.revenueBaseline);
});

test('editing tonight stock and list prices flows into the plan', () => {
  const base = optimisePricing(BASE);
  const edited = optimisePricing({ ...BASE, todayStock: { yogurt: 5 }, todayPrice: { yogurt: 6 } });
  const a = base.plan.find((p) => p.skuId === 'yogurt');
  const b = edited.plan.find((p) => p.skuId === 'yogurt');
  assert.equal(b.onHand, 5);
  assert.equal(b.listPrice, 6);
  assert.notDeepEqual(a.baseline.revenue, b.baseline.revenue);
});

test('markdown ladder has three phases and flags the relaxed final phase', () => {
  const r = optimisePricing(BASE);
  assert.equal(r.schedule.length, 3);
  assert.ok(r.schedule.every((s) => s.stages.length === 3));
  assert.equal(r.schedule[0].stages[0].time, '18:00');
  assert.equal(r.schedule[0].stages[2].relaxed, true);
  assert.equal(r.schedule[0].stages[0].relaxed, false);
  assert.ok(r.schedule[0].stages.every((s) => s.leftAfter >= 0));
});

test('CSV and brief exports carry every plan row and the figures', () => {
  const r = optimisePricing(BASE);
  const csv = buildPricingCsv(r, 'zh');
  assert.equal(csv.charCodeAt(0), 0xFEFF);
  assert.equal(csv.trim().split('\n').length, 7);
  assert.match(csv, /建议折扣/);
  assert.match(csv, /减少浪费kg/);
  const brief = buildPricingBrief(r, 'zh');
  assert.match(brief, /分时段价格阶梯/);
  assert.match(brief, /方法与假设/);
  assert.match(brief, new RegExp(String(r.totals.foodRescuedKg)));
});

test('invalid datasets fail loudly instead of producing a fake plan', () => {
  assert.throws(() => optimisePricing({ csv: '' }), /empty/);
  assert.throws(() => optimisePricing({ csv: 'a,b\n1,2' }), /missing-columns/);
  assert.throws(() => optimisePricing({ rows: [] }), /no-valid-rows/);
  // One row cannot fit a curve, so it must fall back to a labelled default.
  const tiny = optimisePricing({ csv: 'sku_id,list_price,selling_price,qty_sold\nx,4,4,3\n' });
  assert.equal(tiny.plan.length, 1);
  assert.equal(tiny.plan[0].method, 'fallback');
  assert.equal(tiny.plan[0].confidence, 'fallback');
});
