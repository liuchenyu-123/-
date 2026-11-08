import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyse,
  buildFieldBrief,
  buildShiftCard,
  buildShelf,
  CATEGORIES,
  UNITS,
  cityKeys,
  compareCities,
  discountFor,
  shelfFor,
  ENGINE_VERSION,
} from '../src/shared/engine.mjs';

test('exposes three city packs and a versioned engine', () => {
  assert.deepEqual(cityKeys(), ['guangzhou', 'antalya', 'manila']);
  assert.equal(typeof ENGINE_VERSION, 'string');
  assert.equal(shelfFor('guangzhou').length, 6);
  assert.throws(() => shelfFor('atlantis'), /Unknown city pack/);
});

test('baseline scenario matches the published illustrative number', () => {
  const r = analyse({ city: 'guangzhou', weather: 'normal', dayType: 'weekday', hour: 18 });
  assert.equal(r.metrics.foodAtRiskKg, 8.1);
  assert.equal(r.metrics.co2eKg, 18.0);
  assert.equal(r.actions.length, 3);
  assert.equal(r.ladder.length, 9);
  assert.equal(r.mode, 'rules');
});

test('later hours increase risk and markdown', () => {
  const early = analyse({ hour: 14 });
  const mid = analyse({ hour: 18 });
  const late = analyse({ hour: 22 });
  assert.ok(early.metrics.foodAtRiskKg < mid.metrics.foodAtRiskKg);
  assert.ok(mid.metrics.foodAtRiskKg < late.metrics.foodAtRiskKg);
  assert.ok(discountFor(0.62, 14) < discountFor(0.62, 22));
  assert.equal(mid.ladder[0].hour, 14);
  assert.equal(mid.ladder[8].hour, 22);
});

test('weather scenarios move the result in the expected direction', () => {
  const normal = analyse({ weather: 'normal' });
  const heat = analyse({ weather: 'heat' });
  const rain = analyse({ weather: 'rain' });
  assert.ok(normal.metrics.foodAtRiskKg < heat.metrics.foodAtRiskKg);
  assert.ok(heat.metrics.foodAtRiskKg < rain.metrics.foodAtRiskKg);
});

test('editable shelf overrides are honoured and stay safe at zero', () => {
  const base = analyse({ city: 'guangzhou' });
  const zeroed = analyse({ city: 'guangzhou', quantities: [0, 0, 0, 0, 0, 0] });
  assert.equal(zeroed.metrics.foodAtRiskKg, 0);
  assert.equal(zeroed.actions[0].unitsAtRisk, 0);
  assert.ok(zeroed.metrics.foodAtRiskKg < base.metrics.foodAtRiskKg);
});

test('unknown inputs fall back instead of throwing', () => {
  const r = analyse({ city: 'nowhere', weather: 'blizzard', hour: 99 });
  assert.equal(r.city.key, 'guangzhou');
  assert.equal(r.scenario.hour, 22);
});

test('comparison keeps the rescue assumption explicit', () => {
  const r = analyse({ rescueRate: 0.5 });
  assert.equal(r.comparison.rescueRate, 0.5);
  assert.equal(r.comparison.followPlan.foodRescuedKg, 4.1);
  assert.equal(r.comparison.doNothing.revenueRecovered, 0);
});

test('city ranking is sorted descending and deterministic', () => {
  const ranking = compareCities({ weather: 'normal', dayType: 'weekday', hour: 18 });
  assert.equal(ranking.length, 3);
  assert.ok(ranking[0].foodAtRiskKg >= ranking[1].foodAtRiskKg);
  assert.ok(ranking[1].foodAtRiskKg >= ranking[2].foodAtRiskKg);
});

test('English generated text contains the figures and the assumptions', () => {
  const r = analyse({ lang: 'en' });
  const shift = buildShiftCard(r, [true, false, true]);
  const brief = buildFieldBrief(r);
  assert.match(shift, /SHIFT CARD/);
  assert.match(shift, /Assumption/);
  assert.equal((shift.match(/^\d\. /gm) ?? []).length, 2);
  assert.match(brief, /FIELD BRIEF/);
  assert.match(brief, /8\.1 kg/);
  assert.match(brief, /COP31 Antalya/);
});

test('Chinese is the default and localises engine output', () => {
  const r = analyse();
  assert.equal(r.lang, 'zh');
  assert.equal(r.city.short, '广州');
  assert.equal(r.scenario.weatherLabel, '典型日');
  assert.equal(r.actions[0].displayName, '原味酸奶杯');
  assert.equal(r.actions[0].unitLabel, '杯');
  assert.match(buildShiftCard(r), /今晚值班表/);
  assert.match(buildShiftCard(r), /假设/);
  assert.match(buildFieldBrief(r), /现场简报/);
  assert.match(buildFieldBrief(r), /8\.1 kg/);
  assert.match(r.advice.window, /推送与转化/);
  assert.equal(r.assumptions.length, 3);
});

test('language never changes the numbers', () => {
  const zh = analyse({ city: 'antalya', weather: 'heat', hour: 20 });
  const en = analyse({ city: 'antalya', weather: 'heat', hour: 20, lang: 'en' });
  assert.deepEqual(zh.metrics, en.metrics);
  assert.deepEqual(zh.ladder, en.ladder);
  assert.deepEqual(zh.comparison, en.comparison);
  assert.deepEqual(zh.ranked.map((x) => x.risk), en.ranked.map((x) => x.risk));
  assert.equal(zh.actions[0].discount, en.actions[0].discount);
});

test('unknown language falls back to Chinese instead of throwing', () => {
  assert.equal(analyse({ lang: 'klingon' }).lang, 'zh');
  assert.equal(compareCities({ lang: 'en' })[0].label, 'Antalya');
  assert.equal(compareCities()[0].label, '安塔利亚');
});

const DEMO_DRAFTS = () => shelfFor('guangzhou', 'zh').map((s) => ({
  name: s.displayName,
  nameAlt: s.altName,
  category: s.category,
  unit: s.unit,
  qty: s.qty,
  expiryDays: s.expiryDays,
  unitKg: s.unitKg,
  cost: s.cost,
  soldAverage: s.soldAverage,
}));

test('demo recognition drafts reproduce the published baseline exactly', () => {
  const r = analyse({ skuOverrides: DEMO_DRAFTS() });
  assert.equal(r.metrics.foodAtRiskKg, 8.1);
  assert.equal(r.metrics.co2eKg, 18.0);
  assert.equal(r.shelf.length, 6);
  assert.equal(r.actions[0].displayName, '原味酸奶杯');
});

test('vision-only drafts (no prices) are safe and inherit local prices by category', () => {
  const drafts = shelfFor('guangzhou', 'zh').slice(0, 3).map((s) => ({
    name: s.displayName,
    category: s.category,
    unit: s.unit,
    qty: s.qty,
    expiryDays: s.expiryDays,
  }));
  const shelf = buildShelf('guangzhou', drafts);
  assert.equal(shelf.length, 3);
  assert.equal(shelf[0].cost, shelfFor('guangzhou')[0].cost);
  assert.ok(shelf.every((s) => s.unitKg > 0 && s.soldAverage >= 0 && s.soldAverage <= s.qty));
  const r = analyse({ skuOverrides: drafts });
  assert.equal(r.shelf.length, 3);
  assert.ok(r.metrics.foodAtRiskKg > 0);
  assert.ok(r.metrics.revenueRecovered > 0);
  assert.equal(r.actions.length, 3);
});

test('untrusted draft fields are whitelisted rather than injected', () => {
  const shelf = buildShelf('guangzhou', [{
    name: 'Mystery item',
    category: '__proto__',
    unit: 'truck',
    qty: 99999,
    expiryDays: -5,
    cost: -100,
  }]);
  assert.equal(shelf.length, 1);
  assert.equal(shelf[0].category, 'prepared');
  assert.equal(shelf[0].unit, 'pc');
  assert.equal(shelf[0].qty, 500);
  assert.equal(shelf[0].expiryDays, 1);
  assert.equal(shelf[0].cost, 0);
  assert.equal(shelf[0].unitLabel, '个');
  assert.ok(CATEGORIES.includes('dairy') && UNITS.includes('cup'));
});

test('a recognised shelf still reacts to time, weather and language', () => {
  const drafts = DEMO_DRAFTS();
  const base = analyse({ skuOverrides: drafts });
  const late = analyse({ skuOverrides: drafts, hour: 22 });
  const rain = analyse({ skuOverrides: drafts, weather: 'rain' });
  const en = analyse({ skuOverrides: drafts, lang: 'en' });
  assert.ok(base.metrics.foodAtRiskKg < late.metrics.foodAtRiskKg);
  assert.ok(base.metrics.foodAtRiskKg < rain.metrics.foodAtRiskKg);
  assert.deepEqual(base.metrics, en.metrics);
  assert.deepEqual(base.ladder, en.ladder);
});

test('city comparison ignores a recognised shelf and uses each city pack', () => {
  const withOverrides = compareCities({ skuOverrides: DEMO_DRAFTS(), hour: 18 });
  const without = compareCities({ hour: 18 });
  assert.deepEqual(withOverrides, without);
});
