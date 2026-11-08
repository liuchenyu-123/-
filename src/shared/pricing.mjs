/**
 * Best-Before Twin - pricing optimiser (shared, deterministic, zero dependencies).
 *
 * Pipeline: historical sales CSV -> normalised rows -> per-SKU price elasticity
 * fitted by log-log regression -> grid search for the markdown that maximises
 * "gross profit + value of waste avoided" under a unit-cost floor -> an executable
 * selling plan with a time-phased markdown ladder.
 *
 * The exact same module runs in the browser (instant what-if on every slider) and
 * in /api/pricing (authoritative result). Only display strings are localised; all
 * numbers are language-independent.
 *
 * NOTE: emission factors are illustrative placeholders pending a published food
 * LCA dataset, and the bundled sales history is synthetic (see sample-sales.mjs).
 */

import {
  CATEGORIES, UNITS, CO2_FACTORS, WEATHER, DAY_TYPES,
  cityKeys, cityMeta, analyse, discountFor, ENGINE_VERSION,
} from './engine.mjs';
import { text as engineText, resolveLang } from './engine-lang.mjs';
import { pricingText } from './pricing-lang.mjs';
import { SAMPLE_SALES_CSV, SAMPLE_SALES_META } from './sample-sales.mjs';

export const PRICING_VERSION = '1.0.0';

export const SALES_COLUMNS = Object.freeze([
  'date', 'sku_id', 'sku_name', 'sku_name_en', 'category', 'unit',
  'unit_kg', 'unit_cost', 'list_price', 'selling_price',
  'qty_received', 'qty_sold', 'qty_wasted', 'weather', 'day_type', 'expiry_days',
]);

export const REQUIRED_COLUMNS = Object.freeze(['sku_id', 'list_price', 'selling_price', 'qty_sold']);

/** Elasticity priors used when a SKU has too little price variation to fit a curve. */
export const DEFAULT_ELASTICITY = Object.freeze({
  dairy: 1.8, veg: 1.5, bakery: 1.2, prepared: 2.0, fruit: 1.4, grain: 1.0,
});

export const WEATHER_DEMAND_FACTOR = Object.freeze({ normal: 1, heat: 0.92, rain: 0.80 });
export const DAY_DEMAND_FACTOR = Object.freeze({ weekday: 1, weekend: 1.12, holiday: 0.88 });

/** Fraction of leftovers that can be carried to the next day when shelf life allows. */
const CARRY_RATE = 0.35;
const SELLING_WINDOW_HOURS = 8; // 14:00 - 22:00

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round1 = (v) => Math.round(v * 10) / 10;
const round2 = (v) => Math.round(v * 100) / 100;
const num = (v, fallback, lo, hi) => {
  const n = Number(v);
  return Number.isFinite(n) ? clamp(n, lo, hi) : fallback;
};
const safeStr = (v, fallback, max) =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : fallback;

/** Minimal RFC-4180-ish line splitter: supports quoted fields and escaped quotes. */
function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i += 1; } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

/**
 * Parse and validate an uploaded sales CSV. Untrusted input is whitelisted:
 * unknown columns are ignored, categories/units are constrained, and every
 * numeric field is range-checked. Never throws.
 *
 * @param {string} csvText
 * @param {{maxRows?:number,maxSkus?:number}} [options]
 */
export function parseSalesCsv(csvText, options = {}) {
  const maxRows = clamp(Math.round(num(options.maxRows, 5000, 1, 20000)), 1, 20000);
  const maxSkus = clamp(Math.round(num(options.maxSkus, 40, 1, 200)), 1, 200);
  const errors = [];
  const warnings = [];

  if (typeof csvText !== 'string' || !csvText.trim()) {
    return { rows: [], errors: ['empty'], warnings, stats: emptyStats() };
  }

  const lines = csvText.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return { rows: [], errors: ['no-valid-rows'], warnings, stats: emptyStats() };
  }

  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const idx = {};
  SALES_COLUMNS.forEach((c) => { const i = header.indexOf(c); if (i >= 0) idx[c] = i; });
  const missing = REQUIRED_COLUMNS.filter((c) => idx[c] === undefined);
  if (missing.length) {
    return { rows: [], errors: ['missing-columns'], warnings, stats: emptyStats(), missing };
  }

  const get = (cells, key) => (idx[key] === undefined ? '' : (cells[idx[key]] ?? '').trim());
  const rows = [];
  const seenSkus = new Set();
  let truncated = false;

  for (let li = 1; li < lines.length; li += 1) {
    if (rows.length >= maxRows) { truncated = true; break; }
    const cells = splitCsvLine(lines[li]);
    const skuIdRaw = get(cells, 'sku_id');
    if (!skuIdRaw || !/^[\w\-\u4e00-\u9fa5]{1,40}$/.test(skuIdRaw)) {
      warnings.push(`line ${li + 1}: skipped (invalid sku_id)`);
      continue;
    }
    if (!seenSkus.has(skuIdRaw) && seenSkus.size >= maxSkus) {
      warnings.push(`line ${li + 1}: skipped (more than ${maxSkus} SKUs)`);
      continue;
    }
    seenSkus.add(skuIdRaw);

    const listPrice = Number(get(cells, 'list_price'));
    if (!Number.isFinite(listPrice) || listPrice <= 0 || listPrice > 100000) {
      warnings.push(`line ${li + 1}: skipped (invalid list_price)`);
      continue;
    }
    const sellingPrice = Number(get(cells, 'selling_price'));
    if (!Number.isFinite(sellingPrice) || sellingPrice <= 0 || sellingPrice > listPrice * 1.2) {
      warnings.push(`line ${li + 1}: skipped (invalid selling_price)`);
      continue;
    }
    const qtySold = Math.round(num(get(cells, 'qty_sold'), NaN, 0, 100000));
    if (!Number.isFinite(qtySold)) {
      warnings.push(`line ${li + 1}: skipped (invalid qty_sold)`);
      continue;
    }
    const receivedRaw = get(cells, 'qty_received');
    let qtyReceived = Math.round(num(receivedRaw, Math.ceil(qtySold * 1.5), 0, 100000));
    if (qtyReceived < qtySold) qtyReceived = qtySold;
    const category = CATEGORIES.includes(get(cells, 'category')) ? get(cells, 'category') : 'prepared';
    const unit = UNITS.includes(get(cells, 'unit')) ? get(cells, 'unit') : 'pc';
    rows.push({
      date: /^\d{4}-\d{2}-\d{2}$/.test(get(cells, 'date')) ? get(cells, 'date') : '',
      skuId: skuIdRaw,
      name: safeStr(get(cells, 'sku_name'), skuIdRaw, 60),
      nameEn: safeStr(get(cells, 'sku_name_en'), skuIdRaw, 60),
      category,
      unit,
      unitKg: num(get(cells, 'unit_kg'), 0.25, 0.01, 20),
      unitCost: num(get(cells, 'unit_cost'), round2(listPrice * 0.5), 0, 100000),
      listPrice,
      sellingPrice,
      qtyReceived,
      qtySold,
      qtyWasted: Math.round(num(get(cells, 'qty_wasted'), Math.max(0, qtyReceived - qtySold), 0, 100000)),
      weather: WEATHER[get(cells, 'weather')] ? get(cells, 'weather') : 'normal',
      dayType: DAY_TYPES[get(cells, 'day_type')] ? get(cells, 'day_type') : 'weekday',
      expiryDays: clamp(Math.round(num(get(cells, 'expiry_days'), 2, 1, 14)), 1, 14),
    });
  }

  if (truncated) warnings.push(`dataset truncated to ${maxRows} rows`);
  if (!rows.length) errors.push('no-valid-rows');
  if (!idx.qty_received) warnings.push('qty_received missing: stock-censored rows cannot be detected');
  if (!idx.unit_cost) warnings.push('unit_cost missing: defaulted to 50% of list price');

  const dates = rows.map((r) => r.date).filter(Boolean).sort();
  const stats = {
    rows: rows.length,
    skus: seenSkus.size,
    days: new Set(dates).size,
    from: dates[0] ?? '',
    to: dates[dates.length - 1] ?? '',
    truncated,
  };
  return { rows, errors, warnings, stats };
}

function emptyStats() {
  return { rows: 0, skus: 0, days: 0, from: '', to: '', truncated: false };
}

/** @returns {ReturnType<typeof parseSalesCsv>['rows']} */
export function sampleSalesRows() {
  return parseSalesCsv(SAMPLE_SALES_CSV).rows;
}

export { SAMPLE_SALES_CSV, SAMPLE_SALES_META };

function median(values) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function ols(points) {
  const n = points.length;
  const sx = points.reduce((a, p) => a + p.x, 0);
  const sy = points.reduce((a, p) => a + p.y, 0);
  const mx = sx / n;
  const my = sy / n;
  let sxx = 0; let sxy = 0;
  for (const p of points) { sxx += (p.x - mx) ** 2; sxy += (p.x - mx) * (p.y - my); }
  if (sxx < 1e-9) return null;
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  let ssRes = 0; let ssTot = 0;
  for (const p of points) {
    ssRes += (p.y - (intercept + slope * p.x)) ** 2;
    ssTot += (p.y - my) ** 2;
  }
  return { slope, intercept, r2: ssTot > 1e-9 ? clamp(1 - ssRes / ssTot, 0, 1) : 0 };
}

/**
 * Fit a constant-elasticity demand curve per SKU.
 *   adjustedQty = qtySold / (weatherFactor * dayFactor)
 *   ln(adjustedQty + 0.5) = a + b * ln(paidPrice / listPrice)
 *   elasticity = -b
 * Rows where demand was capped by stock are excluded (right-censored).
 */
export function fitElasticity(rows) {
  const groups = new Map();
  for (const r of rows) {
    if (!groups.has(r.skuId)) groups.set(r.skuId, []);
    groups.get(r.skuId).push(r);
  }
  return [...groups.entries()].map(([skuId, group]) => {
    const last = group[group.length - 1];
    const listPrice = median(group.map((r) => r.listPrice));
    const points = [];
    let usable = 0;
    for (const r of group) {
      const capped = r.qtyReceived > 0 && r.qtySold >= r.qtyReceived * 0.95;
      if (capped) continue;
      const adj = r.qtySold / (WEATHER_DEMAND_FACTOR[r.weather] * DAY_DEMAND_FACTOR[r.dayType]);
      points.push({ x: Math.log(r.sellingPrice / listPrice), y: Math.log(adj + 0.5) });
      usable += 1;
    }
    const spread = points.length ? Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x)) : 0;
    const fit = points.length >= 4 && spread >= 0.08 ? ols(points) : null;
    const method = fit && fit.slope < 0 && Number.isFinite(fit.intercept) ? 'regression' : 'fallback';
    const elasticity = method === 'regression'
      ? clamp(-fit.slope, 0.3, 4)
      : (DEFAULT_ELASTICITY[last.category] ?? 1.5);
    const baselineDemand = method === 'regression'
      ? clamp(Math.exp(fit.intercept) - 0.5, 0.5, 500)
      : clamp(median(group.map((r) => r.qtySold / (WEATHER_DEMAND_FACTOR[r.weather] * DAY_DEMAND_FACTOR[r.dayType]))), 0.5, 500);
    return {
      skuId,
      name: last.name,
      nameEn: last.nameEn,
      category: last.category,
      unit: last.unit,
      unitKg: last.unitKg,
      unitCost: median(group.map((r) => r.unitCost)),
      listPrice,
      onHand: last.qtyReceived,
      expiryDays: last.expiryDays,
      elasticity: round2(elasticity),
      baselineDemand: round2(baselineDemand),
      samples: usable,
      priceLevels: new Set(group.map((r) => round2(r.sellingPrice))).size,
      method,
      r2: method === 'regression' ? round2(fit.r2) : 0,
      days: group.length,
      avgSold: round1(group.reduce((a, r) => a + r.qtySold, 0) / group.length),
      avgWasted: round1(group.reduce((a, r) => a + r.qtyWasted, 0) / group.length),
    };
  });
}

/**
 * Evaluate one markdown for one SKU in a given remaining selling window.
 * Prices are rounded to one decimal before use so the number on the shelf label
 * is exactly the number used in the calculation.
 */
function evaluateMarkdown(profile, discount, windowRatio, scenarioFactor, onHand, wasteWeight) {
  const price = round1(profile.listPrice * (1 - discount / 100));
  const ratio = price / profile.listPrice;
  const demand = profile.baselineDemand * windowRatio * scenarioFactor
    * Math.pow(ratio, -profile.elasticity);
  const sold = clamp(Math.round(demand), 0, onHand);
  const leftover = onHand - sold;
  const carry = profile.expiryDays >= 2 ? leftover * CARRY_RATE : 0;
  const wastedUnits = Math.max(0, leftover - carry);
  const wastedKg = round2(wastedUnits * profile.unitKg);
  const revenue = round2(price * sold);
  const profit = round2((price - profile.unitCost) * sold);
  return {
    discount,
    price,
    sold,
    leftover,
    wastedUnits,
    wastedKg,
    revenue,
    profit,
    co2eKg: round2(wastedKg * (CO2_FACTORS[profile.category] ?? 1.5)),
    wasteCredit: round2(wasteWeight * wastedKg),
  };
}

function bestMarkdown(profile, windowRatio, scenarioFactor, onHand, cfg) {
  const baseline = evaluateMarkdown(profile, 0, windowRatio, scenarioFactor, onHand, cfg.wasteWeight);
  let best = null;
  for (let d = 0; d <= cfg.maxDiscount; d += 5) {
    const ev = evaluateMarkdown(profile, d, windowRatio, scenarioFactor, onHand, cfg.wasteWeight);
    if (!cfg.allowBelowCost && ev.price < profile.unitCost) continue;
    const score = ev.profit + cfg.wasteWeight * (baseline.wastedKg - ev.wastedKg);
    const candidate = { ...ev, score: round2(score) };
    if (!best
      || candidate.score > best.score + 1e-9
      || (Math.abs(candidate.score - best.score) <= 1e-9 && (
        candidate.wastedKg < best.wastedKg
        || (candidate.wastedKg === best.wastedKg && candidate.revenue > best.revenue)
      ))) best = candidate;
  }
  return { baseline, best: best ?? { ...baseline, score: baseline.profit } };
}

/**
 * Main entry point. Pure and deterministic: same rows + same knobs = same plan.
 *
 * @param {{rows?:Array|null,csv?:string|null,useSample?:boolean,city?:string,hour?:number,
 *          weather?:string,dayType?:string,maxDiscount?:number,wasteWeight?:number,
 *          allowBelowCost?:boolean,todayStock?:Record<string,number>|null,
 *          todayPrice?:Record<string,number>|null,lang?:string}} input
 */
export function optimisePricing(input = {}) {
  const lang = resolveLang(input.lang);
  const t = pricingText(lang);
  const et = engineText(lang);

  let rows = Array.isArray(input.rows) ? input.rows : null;
  let parse = null;
  if (!rows) {
    const source = input.useSample ? SAMPLE_SALES_CSV : (typeof input.csv === 'string' ? input.csv : SAMPLE_SALES_CSV);
    parse = parseSalesCsv(source);
    if (parse.errors.length) {
      const err = new Error(parse.errors[0]);
      err.code = parse.errors[0];
      throw err;
    }
    rows = parse.rows;
  }
  if (!rows.length) {
    const err = new Error('no-valid-rows');
    err.code = 'no-valid-rows';
    throw err;
  }
  const stats = parse?.stats ?? summariseRows(rows);
  const dataset = { ...stats, source: input.useSample || (!input.csv && !input.rows) ? 'sample' : 'import' };

  const city = cityKeys().includes(input.city) ? input.city : 'guangzhou';
  const meta = cityMeta(city, lang);
  const hour = clamp(Math.round(num(input.hour, 18, 14, 22)), 14, 22);
  const weather = WEATHER[input.weather] ? input.weather : 'normal';
  const dayType = DAY_TYPES[input.dayType] ? input.dayType : 'weekday';
  const cfg = {
    maxDiscount: clamp(Math.round(num(input.maxDiscount, 60, 0, 60) / 5) * 5, 0, 60),
    // 5 currency units per kg is the default shadow price of avoided waste.
    // Low enough that the optimiser still distinguishes elasticities between
    // SKUs; drag it on the UI and the whole plan re-shapes (0 = profit only).
    wasteWeight: clamp(num(input.wasteWeight, 5, 0, 60), 0, 60),
    allowBelowCost: input.allowBelowCost === true,
  };
  const scenarioFactor = WEATHER_DEMAND_FACTOR[weather] * DAY_DEMAND_FACTOR[dayType];
  const windowRatio = Math.max(0.05, (22 - hour) / SELLING_WINDOW_HOURS);

  const profiles = fitElasticity(rows).map((p) => {
    const stock = input.todayStock?.[p.skuId];
    const price = input.todayPrice?.[p.skuId];
    return {
      ...p,
      onHand: clamp(Math.round(num(stock, p.onHand, 0, 500)), 0, 500),
      listPrice: clamp(num(price, p.listPrice, 0.1, 100000), 0.1, 100000),
      unitLabel: et.units[p.unit] ?? p.unit,
      displayName: lang === 'zh' ? p.name : (p.nameEn || p.name),
    };
  });

  // The existing rule engine is the honest baseline: "what would we have
  // suggested before we had any sales history?".
  const ruleAnalysis = analyse({ city, hour, weather, dayType });
  const ruleRisk = new Map(ruleAnalysis.ranked.map((r) => [r.id, r.risk / 100]));

  const plan = profiles.map((p) => {
    const { baseline, best } = bestMarkdown(p, windowRatio, scenarioFactor, p.onHand, cfg);
    const ruleDiscount = Math.round(ruleRisk.get(p.skuId) !== undefined
      ? discountFor(ruleRisk.get(p.skuId), hour)
      : discountFor(0.62, hour));
    const rule = evaluateMarkdown(p, ruleDiscount, windowRatio, scenarioFactor, p.onHand, cfg.wasteWeight);
    const revenueDelta = round2(best.revenue - baseline.revenue);
    return {
      skuId: p.skuId,
      name: p.displayName,
      altName: lang === 'zh' ? (p.nameEn || p.name) : p.name,
      category: p.category,
      unit: p.unit,
      unitLabel: p.unitLabel,
      unitKg: p.unitKg,
      onHand: p.onHand,
      expiryDays: p.expiryDays,
      listPrice: p.listPrice,
      unitCost: round2(p.unitCost),
      elasticity: p.elasticity,
      samples: p.samples,
      priceLevels: p.priceLevels,
      method: p.method,
      methodLabel: t.methods[p.method],
      r2: p.r2,
      confidence: p.method === 'regression' ? 'fitted' : 'fallback',
      optimalDiscount: best.discount,
      optimalPrice: best.price,
      expectedSold: best.sold,
      expectedLeftover: best.leftover,
      baseline,
      optimized: best,
      revenueDelta,
      revenueDeltaPct: baseline.revenue > 0 ? round1((revenueDelta / baseline.revenue) * 100) : 0,
      foodRescuedKg: round2(Math.max(0, baseline.wastedKg - best.wastedKg)),
      co2eAvoidedKg: round2(Math.max(0, baseline.co2eKg - best.co2eKg)),
      profitDelta: round2(best.profit - baseline.profit),
      ruleDiscount,
      rulePrice: rule.price,
      ruleRevenue: rule.revenue,
      revenueVsRule: round2(best.revenue - rule.revenue),
      startTime: `${Math.max(hour, 18)}:00`,
      history: { days: p.days, avgSold: p.avgSold, avgWasted: p.avgWasted },
    };
  }).sort((a, b) => b.revenueDelta - a.revenueDelta);

  const totals = {
    currency: meta.currency,
    revenueBaseline: round2(plan.reduce((a, p) => a + p.baseline.revenue, 0)),
    revenueOptimized: round2(plan.reduce((a, p) => a + p.optimized.revenue, 0)),
    revenueRule: round2(plan.reduce((a, p) => a + p.ruleRevenue, 0)),
    unitsSoldBaseline: plan.reduce((a, p) => a + p.baseline.sold, 0),
    unitsSoldOptimized: plan.reduce((a, p) => a + p.optimized.sold, 0),
    foodWastedKgBaseline: round2(plan.reduce((a, p) => a + p.baseline.wastedKg, 0)),
    foodWastedKgOptimized: round2(plan.reduce((a, p) => a + p.optimized.wastedKg, 0)),
    co2eKgBaseline: round2(plan.reduce((a, p) => a + p.baseline.co2eKg, 0)),
    co2eKgOptimized: round2(plan.reduce((a, p) => a + p.optimized.co2eKg, 0)),
    profitBaseline: round2(plan.reduce((a, p) => a + p.baseline.profit, 0)),
    profitOptimized: round2(plan.reduce((a, p) => a + p.optimized.profit, 0)),
  };
  totals.revenueDelta = round2(totals.revenueOptimized - totals.revenueBaseline);
  totals.revenueDeltaPct = totals.revenueBaseline > 0
    ? round1((totals.revenueDelta / totals.revenueBaseline) * 100) : 0;
  totals.foodRescuedKg = round2(totals.foodWastedKgBaseline - totals.foodWastedKgOptimized);
  totals.co2eAvoidedKg = round2(totals.co2eKgBaseline - totals.co2eKgOptimized);
  totals.profitDelta = round2(totals.profitOptimized - totals.profitBaseline);
  totals.revenueVsRule = round2(totals.revenueOptimized - totals.revenueRule);

  const schedule = buildSchedule(plan.slice(0, 3), profiles, hour, scenarioFactor, cfg, t, lang);

  return {
    engineVersion: ENGINE_VERSION,
    pricingVersion: PRICING_VERSION,
    lang,
    city: { key: city, label: meta.label, short: meta.short, currency: meta.currency },
    scenario: { hour, weather, dayType, sellingHoursLeft: 22 - hour, windowRatio: round2(windowRatio) },
    knobs: { ...cfg, currency: meta.currency },
    dataset,
    warnings: parse?.warnings ?? [],
    totals,
    plan,
    schedule,
    assumptions: [
      ...t.assumptions,
      lang === 'zh'
        ? `本次参数：${hour}:00 起剩 ${22 - hour} 小时可卖，最大折扣 ${cfg.maxDiscount}%，避免浪费权重 ${cfg.wasteWeight} ${meta.currency}/kg，${cfg.allowBelowCost ? '允许' : '不允许'}低于成本定价。`
        : `Run settings: ${hour}:00 with ${22 - hour} selling hours left, discount cap ${cfg.maxDiscount}%, waste credit ${cfg.wasteWeight} ${meta.currency}/kg, below-cost pricing ${cfg.allowBelowCost ? 'allowed' : 'blocked'}.`,
    ],
  };
}

function summariseRows(rows) {
  const dates = rows.map((r) => r.date).filter(Boolean).sort();
  return {
    rows: rows.length,
    skus: new Set(rows.map((r) => r.skuId)).size,
    days: new Set(dates).size,
    from: dates[0] ?? '',
    to: dates[dates.length - 1] ?? '',
    truncated: false,
  };
}

/** Time-phased ladder: re-optimise at each stage with the inventory left over. */
function buildSchedule(top3, profiles, hour, scenarioFactor, cfg, t, lang) {
  const start = Math.max(hour, 18);
  const windows = [
    { at: `${start}:00`, ratio: Math.max(0, (20 - start) / SELLING_WINDOW_HOURS), label: t.stages[0].label },
    { at: '20:00', ratio: start >= 20 ? 0 : 1 / SELLING_WINDOW_HOURS, label: t.stages[1].label },
    { at: '21:00', ratio: start >= 21 ? 0 : 1 / SELLING_WINDOW_HOURS, label: t.stages[2].label },
  ].filter((w) => w.ratio > 0);
  if (!windows.length) return [];
  return top3.map((item) => {
    const p = profiles.find((x) => x.skuId === item.skuId);
    let stock = item.onHand;
    const lastIndex = windows.length - 1;
    const stages = windows.map((w, i) => {
      // In the final hour, selling below unit cost is allowed: the alternative
      // is a 100% write-off at closing time. The relaxation is flagged in the
      // output so the UI never hides it.
      const relaxed = i === lastIndex;
      const stageCfg = relaxed
        ? { ...cfg, allowBelowCost: true, maxDiscount: Math.max(cfg.maxDiscount, 60) }
        : cfg;
      const { best } = bestMarkdown(p, w.ratio, scenarioFactor, stock, stageCfg);
      stock = Math.max(0, stock - best.sold);
      return {
        time: w.at,
        label: w.label,
        discount: best.discount,
        price: best.price,
        expectedSold: best.sold,
        leftAfter: stock,
        wastedKg: best.wastedKg,
        relaxed,
        belowCost: best.price < p.unitCost,
      };
    });
    return { skuId: item.skuId, name: item.name, stages };
  });
}

/** Export the plan as a UTF-8 (BOM) CSV a shop owner can open in Excel. */
export function buildPricingCsv(result, lang = 'zh') {
  const t = pricingText(lang);
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const lines = [t.csv.headers.map(esc).join(',')];
  for (const p of result.plan) {
    lines.push([
      p.name, p.category, p.onHand, p.listPrice, p.unitCost, p.elasticity, p.samples, p.methodLabel,
      `${p.optimalDiscount}%`, p.optimalPrice, p.expectedSold, p.expectedLeftover,
      p.baseline.revenue, p.optimized.revenue, p.revenueDelta, `${p.revenueDeltaPct}%`,
      p.baseline.wastedKg, p.optimized.wastedKg, p.foodRescuedKg, p.co2eAvoidedKg,
      `${p.ruleDiscount}%`, p.revenueVsRule, p.startTime,
    ].map(esc).join(','));
  }
  return '\uFEFF' + lines.join('\n') + '\n';
}

/** Human-readable version of the plan, in the selected language. */
export function buildPricingBrief(result, lang = 'zh') {
  const t = pricingText(lang);
  const b = t.brief;
  const cur = result.city.currency;
  const lines = [
    b.title,
    b.intro(result.dataset.days, result.dataset.rows, result.dataset.skus, result.city.label),
    '',
    b.tableTitle,
    ...result.plan.map((p) => '  - ' + b.line(
      p.name, p.optimalDiscount, p.optimalPrice, cur, p.expectedSold, p.foodRescuedKg, p.revenueDelta,
    )),
    '',
    b.totalsTitle,
    b.totals(cur, result.totals.revenueDelta, result.totals.revenueDeltaPct,
      result.totals.foodRescuedKg, result.totals.co2eAvoidedKg),
    '',
    b.ladderTitle,
    ...result.schedule.flatMap((s) => s.stages.map(
      (st) => '  - ' + b.ladderLine(st.time, s.name, st.discount, cur, st.price),
    )),
    '',
    b.assumptionsTitle,
    ...result.assumptions.map((a) => `  - ${a}`),
    '',
    b.footer,
  ];
  return lines.join('\n');
}
