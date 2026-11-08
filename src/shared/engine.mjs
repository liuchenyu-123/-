/**
 * Best-Before Twin - shared deterministic engine.
 *
 * Pure ESM with zero dependencies and no Node/browser APIs. The exact same module is
 * imported by the browser (instant interaction) and by the API routes (authoritative
 * calculation + optional LLM enrichment). Changing a rule here changes both sides.
 *
 * Display strings are localised via engine-lang.mjs; all numbers and rules are
 * language-independent, so switching language can never change a result.
 *
 * NOTE: emission and water factors are illustrative placeholders. Replace them with a
 * published food LCA dataset before presenting numbers as measured results.
 */

import { text, resolveLang } from './engine-lang.mjs';

export const ENGINE_VERSION = '1.2.0';

/** Whitelists shared with the vision provider so model output can never inject a category. */
export const CATEGORIES = Object.freeze(['dairy', 'veg', 'bakery', 'prepared', 'fruit', 'grain']);
export const UNITS = Object.freeze(['cup', 'bunch', 'loaf', 'box', 'pc', 'bottle', 'kg', 'tub', 'pack']);

export const CO2_FACTORS = Object.freeze({
  dairy: 3.2, veg: 1.1, bakery: 1.6, prepared: 2.5, fruit: 1.1, grain: 1.4,
});

export const WATER_FACTORS = Object.freeze({
  dairy: 1000, veg: 300, bakery: 500, prepared: 800, fruit: 400, grain: 600,
});

export const WEATHER = Object.freeze({
  normal: { label: 'Typical day', factor: 0 },
  heat: { label: 'Heat wave', factor: 0.11 },
  rain: { label: 'Heavy rain / typhoon', factor: 0.17 },
});

export const DAY_TYPES = Object.freeze({
  weekday: { label: 'Weekday', factor: 0 },
  weekend: { label: 'Weekend', factor: -0.06 },
  holiday: { label: 'Holiday / event', factor: -0.10 },
});

const RAW = {
  guangzhou: {
    currency: '¥',
    temp: 33,
    items: [
      ['yogurt', 'Plain yogurt cups', '原味酸奶杯', 24, 'cup', 0.15, 4.5, 1, 14, 'dairy'],
      ['greens', 'Leafy greens', '本地叶菜', 18, 'bunch', 0.30, 3.8, 2, 11, 'veg'],
      ['toast', 'Whole-wheat toast', '全麦吐司', 12, 'loaf', 0.40, 9, 2, 7, 'bakery'],
      ['meal', 'Ready-meal boxes', '熟食盒饭', 16, 'box', 0.35, 12, 1, 12, 'prepared'],
      ['mango', 'Mangoes', '芒果', 20, 'pc', 0.25, 6, 3, 9, 'fruit'],
      ['milk', 'Fresh milk', '鲜牛奶', 15, 'bottle', 0.50, 7, 2, 10, 'dairy'],
    ],
  },
  antalya: {
    currency: '₺',
    temp: 26,
    items: [
      ['yogurt', 'Süzme yoğurt', '过滤酸奶', 22, 'tub', 0.20, 38, 1, 13, 'dairy'],
      ['tomato', 'Tomatoes', '番茄', 20, 'kg', 1.0, 32, 3, 12, 'veg'],
      ['simit', 'Simit', '芝麻圈面包', 30, 'pc', 0.12, 12, 1, 22, 'bakery'],
      ['pide', 'Pide boxes', '皮塔盒餐', 14, 'box', 0.35, 95, 1, 9, 'prepared'],
      ['feta', 'Feta cheese', '菲达奶酪', 12, 'pack', 0.25, 78, 4, 6, 'dairy'],
      ['ayran', 'Ayran', '咸酸奶饮', 24, 'bottle', 0.25, 18, 2, 16, 'dairy'],
    ],
  },
  manila: {
    currency: '₱',
    temp: 31,
    items: [
      ['pandesal', 'Pandesal', '菲式小面包', 40, 'pc', 0.06, 8, 1, 28, 'bakery'],
      ['banana', 'Saba bananas', '沙巴香蕉', 26, 'pc', 0.15, 12, 2, 14, 'fruit'],
      ['rice', 'Cooked rice boxes', '盒装米饭', 18, 'box', 0.30, 35, 1, 13, 'grain'],
      ['greens', 'Leafy greens', '叶菜', 16, 'bunch', 0.30, 25, 2, 8, 'veg'],
      ['yogurtdrink', 'Yogurt drink', '酸奶饮', 20, 'bottle', 0.20, 28, 2, 11, 'dairy'],
      ['mango', 'Mangoes', '芒果', 22, 'pc', 0.25, 30, 3, 10, 'fruit'],
    ],
  },
};

/** @returns {string[]} */
export function cityKeys() {
  return Object.keys(RAW);
}

/**
 * @param {string} cityKey
 * @param {'zh'|'en'} [lang]
 * @returns {Array<{id:string,name:string,cn:string,displayName:string,altName:string,qty:number,unit:string,unitLabel:string,unitKg:number,cost:number,expiryDays:number,soldAverage:number,category:string}>}
 */
export function shelfFor(cityKey, lang = 'zh') {
  const pack = RAW[cityKey];
  if (!pack) throw new Error(`Unknown city pack: ${cityKey}`);
  const t = text(lang);
  const isZh = resolveLang(lang) === 'zh';
  return pack.items.map(([id, name, cn, qty, unit, unitKg, cost, expiryDays, soldAverage, category]) => ({
    id, name, cn,
    displayName: isZh ? cn : name,
    altName: isZh ? name : cn,
    qty, unit,
    unitLabel: t.units[unit] ?? unit,
    unitKg, cost, expiryDays, soldAverage, category,
  }));
}

/**
 * @param {string} cityKey
 * @param {'zh'|'en'} [lang]
 * @returns {{key:string,label:string,city:string,short:string,currency:string,temp:number,note:string,channels:string[],dishes:string[]}}
 */
export function cityMeta(cityKey, lang = 'zh') {
  const pack = RAW[cityKey];
  if (!pack) throw new Error(`Unknown city pack: ${cityKey}`);
  const t = text(lang).cities[cityKey];
  return {
    key: cityKey,
    label: t.label,
    city: t.city,
    short: t.short,
    currency: pack.currency,
    temp: pack.temp,
    note: t.note,
    channels: t.channels,
    dishes: t.dishes,
  };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round1 = (v) => Math.round(v * 10) / 10;

const numOr = (value, fallback, lo, hi) => {
  const n = Number(value);
  return Number.isFinite(n) ? clamp(n, lo, hi) : fallback;
};
const strOr = (value, fallback, maxLength) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : fallback;

/**
 * Turn a photo-recognition draft into a safe, fully typed shelf.
 *
 * A vision model can only see the shelf: names, rough counts, category and days to
 * expiry. Price, unit weight and sell-through history are NOT guessed by the model;
 * they are inherited from the local city pack (matched by category), so a recognised
 * shelf automatically uses local currency and local price levels. The shop owner can
 * still override every number in the confirmation table before applying it.
 *
 * @param {string} cityKey
 * @param {Array<object>|null|undefined} drafts
 * @param {'zh'|'en'} [lang]
 */
export function buildShelf(cityKey, drafts, lang = 'zh') {
  const base = shelfFor(cityKey, lang);
  if (!Array.isArray(drafts) || drafts.length === 0) return base;
  const t = text(lang);
  return drafts.slice(0, 8).map((d, i) => {
    const category = CATEGORIES.includes(d?.category) ? d.category : 'prepared';
    const unit = UNITS.includes(d?.unit) ? d.unit : 'pc';
    const qty = clamp(Math.round(numOr(d?.qty, 10, 0, 500)), 0, 500);
    const ref = base.find((s) => s.category === category) ?? base[0];
    const name = strOr(d?.name, ref.displayName, 60);
    const alt = strOr(d?.nameAlt, name, 60);
    return {
      id: `sku-${i}-${category}`,
      name,
      cn: alt,
      displayName: name,
      altName: alt,
      qty,
      unit,
      unitLabel: t.units[unit] ?? unit,
      unitKg: numOr(d?.unitKg, ref.unitKg, 0.01, 20),
      cost: numOr(d?.cost, ref.cost, 0, 10000),
      expiryDays: clamp(Math.round(numOr(d?.expiryDays, 2, 1, 14)), 1, 14),
      soldAverage: numOr(d?.soldAverage, Math.round(qty * 0.6), 0, 500),
      category,
    };
  });
}

function riskOf(sku, weatherFactor, dayFactor, timeFactor) {
  const near = (Math.max(0, 4 - sku.expiryDays) / 4) * 0.34;
  const pile = sku.qty > 0 ? Math.max(0, (sku.qty - sku.soldAverage) / sku.qty) * 0.46 : 0;
  const perish = ['dairy', 'prepared', 'veg'].includes(sku.category) ? 0.07 : 0;
  return clamp(0.10 + near + pile + perish + weatherFactor + dayFactor + timeFactor * 0.12, 0.06, 0.95);
}

export function discountFor(risk, hour) {
  const base = risk > 0.70 ? 30 : risk > 0.55 ? 20 : risk > 0.40 ? 10 : 0;
  return Math.min(60, base + Math.round(((hour - 14) / 8) * 25));
}

/** @param {number} hour @param {'zh'|'en'} [lang] */
export function adviceFor(hour, lang = 'zh') {
  const t = text(lang);
  if (hour < 16) return t.advice[0];
  if (hour < 18) return t.advice[1];
  if (hour < 20) return t.advice[2];
  return t.advice[3];
}

/**
 * Core calculation. Shared by browser and server, so a demo shown on a booth screen
 * and the JSON returned by /api/analyse can never drift apart.
 *
 * @param {{city?:string,weather?:string,dayType?:string,hour?:number,quantities?:number[]|null,
 *          skuOverrides?:Array<object>|null,rescueRate?:number,lang?:string}} input
 */
export function analyse(input = {}) {
  const lang = resolveLang(input.lang);
  const t = text(lang);
  const city = RAW[input.city] ? input.city : 'guangzhou';
  const weather = WEATHER[input.weather] ? input.weather : 'normal';
  const dayType = DAY_TYPES[input.dayType] ? input.dayType : 'weekday';
  const hour = clamp(Number.isFinite(input.hour) ? input.hour : 18, 14, 22);
  const rescueRate = clamp(Number.isFinite(input.rescueRate) ? input.rescueRate : 0.75, 0, 1);
  const meta = cityMeta(city, lang);

  const shelf = buildShelf(city, input.skuOverrides, lang).map((sku, i) => {
    const override = Array.isArray(input.quantities) ? Number(input.quantities[i]) : NaN;
    return { ...sku, qty: Number.isFinite(override) ? clamp(Math.round(override), 0, 500) : sku.qty };
  });

  const w = WEATHER[weather].factor + DAY_TYPES[dayType].factor;
  const timeFactor = (hour - 18) / 8;
  const ranked = shelf
    .map((sku) => ({ sku, risk: riskOf(sku, w, 0, timeFactor) }))
    .sort((a, b) => b.risk - a.risk);

  let foodAtRiskKg = 0;
  let co2eKg = 0;
  let waterLitres = 0;
  let revenueRecovered = 0;

  const actions = ranked.slice(0, 3).map(({ sku, risk }, i) => {
    const unitsAtRisk = Math.min(sku.qty, Math.max(1, Math.round(sku.qty * risk)));
    const discount = discountFor(risk, hour);
    const massKg = unitsAtRisk * sku.unitKg;
    const startTime = hour < 18 ? '18:00' : `${hour}:00`;
    foodAtRiskKg += massKg;
    co2eKg += massKg * CO2_FACTORS[sku.category];
    waterLitres += massKg * WATER_FACTORS[sku.category];
    revenueRecovered += unitsAtRisk * sku.cost * (1 - discount / 100);
    return {
      id: sku.id,
      name: sku.name,
      cn: sku.cn,
      displayName: sku.displayName,
      altName: sku.altName,
      category: sku.category,
      onShelf: sku.qty,
      unit: sku.unit,
      unitLabel: sku.unitLabel,
      expiryDays: sku.expiryDays,
      risk: round1(risk * 100),
      unitsAtRisk,
      discount,
      startTime,
      channel: meta.channels[i % meta.channels.length],
      dish: meta.dishes[i % meta.dishes.length],
      massKg: round1(massKg),
    };
  });

  const ladder = [];
  for (let h = 14; h <= 22; h += 1) {
    const probe = analyseOnce(city, weather, dayType, h, shelf, lang);
    ladder.push({ hour: h, discount: probe.actions[0]?.discount ?? 0 });
  }

  return {
    engineVersion: ENGINE_VERSION,
    mode: 'rules',
    lang,
    city: meta,
    scenario: {
      weather,
      weatherLabel: t.weather[weather],
      dayType,
      dayTypeLabel: t.dayTypes[dayType],
      hour,
      sellingHoursLeft: 22 - hour,
    },
    shelf,
    metrics: {
      foodAtRiskKg: round1(foodAtRiskKg),
      co2eKg: round1(co2eKg),
      waterLitres: Math.round(waterLitres),
      revenueRecovered: Math.round(revenueRecovered),
      currency: meta.currency,
    },
    ranked: ranked.map(({ sku, risk }) => ({ id: sku.id, name: sku.displayName, risk: round1(risk * 100) })),
    actions,
    advice: adviceFor(hour, lang),
    ladder,
    comparison: {
      rescueRate,
      doNothing: {
        foodWastedKg: round1(foodAtRiskKg),
        co2eKg: round1(co2eKg),
        revenueRecovered: 0,
      },
      followPlan: {
        foodRescuedKg: round1(foodAtRiskKg * rescueRate),
        co2eAvoidedKg: round1(co2eKg * rescueRate),
        revenueRecovered: Math.round(revenueRecovered),
      },
    },
    assumptions: t.assumptions,
  };
}

function analyseOnce(city, weather, dayType, hour, shelf, lang) {
  const w = WEATHER[weather].factor + DAY_TYPES[dayType].factor;
  const timeFactor = (hour - 18) / 8;
  const ranked = shelf.map((sku) => ({ sku, risk: riskOf(sku, w, 0, timeFactor) })).sort((a, b) => b.risk - a.risk);
  const meta = cityMeta(city, lang);
  const actions = ranked.slice(0, 3).map(({ sku, risk }, i) => ({
    discount: discountFor(risk, hour),
    channel: meta.channels[i % meta.channels.length],
  }));
  return { actions };
}

/** Ranking used by the booth "guess the city" interaction. */
export function compareCities(input = {}) {
  return cityKeys()
    .map((key) => {
      // The booth comparison always uses each city's own pack, even when the lab is
      // currently running a recognised shelf from a photo.
      const r = analyse({ ...input, city: key, quantities: null, skuOverrides: null });
      return { key, label: r.city.short, foodAtRiskKg: r.metrics.foodAtRiskKg, currency: r.city.currency };
    })
    .sort((a, b) => b.foodAtRiskKg - a.foodAtRiskKg);
}

/** @param {ReturnType<typeof analyse>} result @param {boolean[]} picked */
export function buildShiftCard(result, picked = [true, true, true]) {
  const t = text(result.lang);
  const s = t.shift;
  const lines = [
    s.title,
    `${result.city.label}  ·  ${result.scenario.hour}:00  ·  ${result.scenario.weatherLabel} / ${result.scenario.dayTypeLabel}`,
    '',
  ];
  const chosen = result.actions.filter((_, i) => picked[i] !== false);
  if (!chosen.length) lines.push(s.empty);
  chosen.forEach((a, i) => {
    lines.push(`${i + 1}. ${a.displayName} (${a.altName}) - ${s.unitsAtRisk(a.unitsAtRisk, a.unitLabel)}`);
    lines.push(`   - ${s.discount(a.discount, a.startTime)}`);
    lines.push(`   - ${s.channel(a.channel)}`);
    lines.push(`   - ${s.dish(a.dish)}`);
  });
  lines.push('');
  lines.push(s.expected(
    result.comparison.followPlan.foodRescuedKg,
    result.comparison.followPlan.co2eAvoidedKg,
    result.city.currency,
    result.metrics.revenueRecovered,
  ));
  lines.push(s.assumption);
  return lines.join('\n');
}

/** @param {ReturnType<typeof analyse>} result */
export function buildFieldBrief(result) {
  const t = text(result.lang);
  const b = t.brief;
  const { city, scenario, metrics, actions, comparison } = result;
  return [
    b.title,
    `${city.city}  ·  ${city.temp}°C  ·  ${scenario.weatherLabel}  ·  ${scenario.dayTypeLabel}  ·  ${scenario.hour}:00`,
    '',
    b.scan(result.shelf.length, metrics.foodAtRiskKg, metrics.co2eKg),
    '',
    b.actions(
      actions.map((a) => `${a.discount}%`).join(' / '),
      actions[0]?.startTime ?? '18:00',
      city.channels[0],
      city.dishes[0],
    ),
    '',
    b.week(
      round1(comparison.followPlan.foodRescuedKg * 7),
      city.currency,
      Math.round(metrics.revenueRecovered * 7),
    ),
    '',
    b.input,
    '',
    b.footer,
  ].join('\n');
}
