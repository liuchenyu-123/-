import { CATEGORIES, UNITS, cityKeys, WEATHER, DAY_TYPES } from '@/shared/engine.mjs';
import type { AnalyseInput, SkuDraft } from '@/shared/engine.mjs';
import { resolveLang } from '@/shared/i18n';

export type ValidationResult =
  | { ok: true; input: AnalyseInput }
  | { ok: false; error: string };

const fail = (error: string): ValidationResult => ({ ok: false, error });

export function validateAnalyseInput(raw: unknown): ValidationResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return fail('Request body must be a JSON object');
  }
  const o = raw as Record<string, unknown>;
  const input: AnalyseInput = {};

  if (o.city !== undefined) {
    if (typeof o.city !== 'string' || !cityKeys().includes(o.city)) {
      return fail(`city must be one of: ${cityKeys().join(', ')}`);
    }
    input.city = o.city;
  }
  if (o.weather !== undefined) {
    if (typeof o.weather !== 'string' || !(o.weather in WEATHER)) {
      return fail(`weather must be one of: ${Object.keys(WEATHER).join(', ')}`);
    }
    input.weather = o.weather;
  }
  if (o.dayType !== undefined) {
    if (typeof o.dayType !== 'string' || !(o.dayType in DAY_TYPES)) {
      return fail(`dayType must be one of: ${Object.keys(DAY_TYPES).join(', ')}`);
    }
    input.dayType = o.dayType;
  }
  if (o.hour !== undefined) {
    const hour = Number(o.hour);
    if (!Number.isFinite(hour) || hour < 14 || hour > 22) {
      return fail('hour must be a number between 14 and 22');
    }
    input.hour = Math.round(hour);
  }
  if (o.rescueRate !== undefined) {
    const rate = Number(o.rescueRate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
      return fail('rescueRate must be a number between 0 and 1');
    }
    input.rescueRate = rate;
  }
  if (o.lang !== undefined) {
    if (typeof o.lang !== 'string' || !['zh', 'en'].includes(o.lang)) {
      return fail('lang must be "zh" or "en"');
    }
    input.lang = resolveLang(o.lang);
  }
  if (o.quantities !== undefined && o.quantities !== null) {
    if (!Array.isArray(o.quantities) || o.quantities.length < 1 || o.quantities.length > 8) {
      return fail('quantities must be an array of 1 to 8 numbers (one per SKU)');
    }
    const nums = o.quantities.map(Number);
    if (nums.some((n) => !Number.isFinite(n) || n < 0 || n > 500)) {
      return fail('quantities must contain numbers between 0 and 500');
    }
    input.quantities = nums;
  }
  if (o.skuOverrides !== undefined && o.skuOverrides !== null) {
    if (!Array.isArray(o.skuOverrides) || o.skuOverrides.length < 1 || o.skuOverrides.length > 8) {
      return fail('skuOverrides must be an array of 1 to 8 SKU drafts');
    }
    const drafts: SkuDraft[] = [];
    for (const raw of o.skuOverrides) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return fail('each skuOverrides entry must be an object');
      }
      const r = raw as Record<string, unknown>;
      if (typeof r.name !== 'string' || !r.name.trim() || r.name.length > 60) {
        return fail('skuOverrides.name must be a non-empty string of at most 60 characters');
      }
      if (typeof r.category !== 'string' || !CATEGORIES.includes(r.category)) {
        return fail(`skuOverrides.category must be one of: ${CATEGORIES.join(', ')}`);
      }
      if (typeof r.unit !== 'string' || !UNITS.includes(r.unit)) {
        return fail(`skuOverrides.unit must be one of: ${UNITS.join(', ')}`);
      }
      const qty = Number(r.qty);
      const expiryDays = Number(r.expiryDays);
      if (!Number.isFinite(qty) || qty < 0 || qty > 500 || !Number.isFinite(expiryDays) || expiryDays < 1 || expiryDays > 14) {
        return fail('skuOverrides.qty must be 0..500 and expiryDays must be 1..14');
      }
      const draft: SkuDraft = {
        name: r.name.trim(),
        nameAlt: typeof r.nameAlt === 'string' ? r.nameAlt.trim().slice(0, 60) : '',
        category: r.category,
        unit: r.unit,
        qty: Math.round(qty),
        expiryDays: Math.round(expiryDays),
      };
      // Optional numeric overrides are accepted but always range-checked.
      for (const key of ['unitKg', 'cost', 'soldAverage'] as const) {
        if (r[key] !== undefined) {
          const n = Number(r[key]);
          if (!Number.isFinite(n) || n < 0 || n > 10000) return fail(`skuOverrides.${key} must be a number between 0 and 10000`);
          draft[key] = n;
        }
      }
      drafts.push(draft);
    }
    input.skuOverrides = drafts;
  }
  return { ok: true, input };
}

export function fromSearchParams(sp: URLSearchParams): unknown {
  const o: Record<string, unknown> = {};
  for (const key of ['city', 'weather', 'dayType', 'hour', 'rescueRate', 'lang']) {
    const v = sp.get(key);
    if (v !== null) o[key] = key === 'hour' || key === 'rescueRate' ? Number(v) : v;
  }
  const q = sp.get('quantities');
  if (q) o.quantities = q.split(',').map(Number);
  return o;
}
