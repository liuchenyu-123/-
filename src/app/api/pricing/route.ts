import { NextRequest, NextResponse } from 'next/server';
import {
  PRICING_VERSION, SALES_COLUMNS, REQUIRED_COLUMNS, SAMPLE_SALES_META,
  buildPricingBrief, buildPricingCsv, optimisePricing, parseSalesCsv,
} from '@/shared/pricing.mjs';
import type { PricingInput, SalesRow } from '@/shared/pricing.mjs';
import { ENGINE_VERSION, CATEGORIES, UNITS, cityKeys, WEATHER, DAY_TYPES } from '@/shared/engine.mjs';
import { resolveLang, type Lang } from '@/shared/i18n';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'cache-control': 'no-store' };
const MAX_CSV_CHARS = 2_000_000;

const CAPABILITY = {
  engineVersion: ENGINE_VERSION,
  pricingVersion: PRICING_VERSION,
  requiredColumns: REQUIRED_COLUMNS,
  optionalColumns: SALES_COLUMNS.filter((c) => !REQUIRED_COLUMNS.includes(c)),
  sample: {
    url: '/data/sample-sales-history.csv',
    ...SAMPLE_SALES_META,
  },
  defaults: {
    city: 'guangzhou', hour: 18, weather: 'normal', dayType: 'weekday',
    maxDiscount: 60, wasteWeight: 5, allowBelowCost: false,
  },
  limits: {
    maxCsvChars: MAX_CSV_CHARS, maxRows: 5000, maxSkus: 40,
    hour: '14..22', maxDiscount: '0..60 (step 5)', wasteWeight: '0..60',
  },
  method: 'log-log elasticity regression → constrained markdown grid search',
};

function bad(error: string) {
  return NextResponse.json(
    { error, accepted: CAPABILITY.defaults, requiredColumns: REQUIRED_COLUMNS },
    { status: 400, headers: noStore },
  );
}

export function GET() {
  return NextResponse.json(CAPABILITY, { headers: noStore });
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const numOr = (v: unknown, fallback: number, lo: number, hi: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? clamp(n, lo, hi) : fallback;
};
const strOr = (v: unknown, fallback: string, max: number) =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : fallback;

/** Programmatic callers may send rows directly; every field is whitelisted here. */
function safeRows(raw: unknown): SalesRow[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 5000) {
    throw new Error('rows must be an array of 1 to 5000 records');
  }
  return raw.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('invalid row');
    const r = entry as Record<string, unknown>;
    const skuId = typeof r.skuId === 'string' ? r.skuId.trim() : '';
    if (!/^[\w\-\u4e00-\u9fa5]{1,40}$/.test(skuId)) throw new Error('invalid skuId');
    const listPrice = numOr(r.listPrice, NaN, 0.01, 100000);
    if (!Number.isFinite(listPrice)) throw new Error('invalid listPrice');
    const category = typeof r.category === 'string' && CATEGORIES.includes(r.category) ? r.category : 'prepared';
    const unit = typeof r.unit === 'string' && UNITS.includes(r.unit) ? r.unit : 'pc';
    const qtySold = Math.round(numOr(r.qtySold, NaN, 0, 100000));
    if (!Number.isFinite(qtySold)) throw new Error('invalid qtySold');
    const qtyReceived = Math.max(qtySold, Math.round(numOr(r.qtyReceived, qtySold, 0, 100000)));
    return {
      date: typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : '',
      skuId,
      name: strOr(r.name, skuId, 60),
      nameEn: strOr(r.nameEn, skuId, 60),
      category,
      unit,
      unitKg: numOr(r.unitKg, 0.25, 0.01, 20),
      unitCost: numOr(r.unitCost, Math.round(listPrice * 50) / 100, 0, 100000),
      listPrice,
      sellingPrice: numOr(r.sellingPrice, listPrice, 0.01, listPrice * 1.2),
      qtyReceived,
      qtySold,
      qtyWasted: Math.round(numOr(r.qtyWasted, Math.max(0, qtyReceived - qtySold), 0, 100000)),
      weather: typeof r.weather === 'string' && r.weather in WEATHER ? r.weather : 'normal',
      dayType: typeof r.dayType === 'string' && r.dayType in DAY_TYPES ? r.dayType : 'weekday',
      expiryDays: Math.round(numOr(r.expiryDays, 2, 1, 14)),
    } satisfies SalesRow;
  });
}

function safeNumberMap(raw: unknown, lo: number, hi: number): Record<string, number> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^[\w\-\u4e00-\u9fa5]{1,40}$/.test(key)) continue;
    const n = Number(value);
    if (Number.isFinite(n)) out[key] = clamp(n, lo, hi);
  }
  return Object.keys(out).length ? out : null;
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return bad('invalid-json');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return bad('invalid-body');

  const rawLang = body.lang;
  if (rawLang !== undefined && (typeof rawLang !== 'string' || !['zh', 'en'].includes(rawLang))) {
    return bad('invalid-lang');
  }
  const lang: Lang = resolveLang(rawLang);
  const city = body.city === undefined ? 'guangzhou' : body.city;
  if (typeof city !== 'string' || !cityKeys().includes(city)) return bad('invalid-city');
  if (body.weather !== undefined && (typeof body.weather !== 'string' || !(body.weather in WEATHER))) return bad('invalid-weather');
  if (body.dayType !== undefined && (typeof body.dayType !== 'string' || !(body.dayType in DAY_TYPES))) return bad('invalid-day-type');
  for (const [key, lo, hi] of [['hour', 14, 22], ['maxDiscount', 0, 60], ['wasteWeight', 0, 60]] as const) {
    if (body[key] !== undefined) {
      const n = Number(body[key]);
      if (!Number.isFinite(n) || n < lo || n > hi) return bad(`invalid-${key}`);
    }
  }
  if (typeof body.csv === 'string' && body.csv.length > MAX_CSV_CHARS) return bad('csv-too-large');

  let rows: SalesRow[] | null = null;
  if (body.rows !== undefined && body.rows !== null) {
    try {
      rows = safeRows(body.rows);
    } catch {
      return bad('invalid-rows');
    }
  }
  if (typeof body.csv === 'string' && body.csv.trim() && !rows) {
    const parsed = parseSalesCsv(body.csv);
    if (parsed.errors.length) return bad(parsed.errors[0]);
    rows = parsed.rows;
  }

  const input: PricingInput = {
    city,
    hour: body.hour === undefined ? 18 : Number(body.hour),
    weather: typeof body.weather === 'string' ? body.weather : 'normal',
    dayType: typeof body.dayType === 'string' ? body.dayType : 'weekday',
    maxDiscount: body.maxDiscount === undefined ? 60 : Number(body.maxDiscount),
    wasteWeight: body.wasteWeight === undefined ? 5 : Number(body.wasteWeight),
    allowBelowCost: body.allowBelowCost === true,
    todayStock: safeNumberMap(body.todayStock, 0, 500),
    todayPrice: safeNumberMap(body.todayPrice, 0.1, 100000),
    lang,
    useSample: body.useSample === true,
    rows,
    csv: typeof body.csv === 'string' ? body.csv : null,
  };

  try {
    const result = optimisePricing(input);
    return NextResponse.json(
      {
        engineVersion: ENGINE_VERSION,
        pricingVersion: PRICING_VERSION,
        lang,
        result,
        brief: buildPricingBrief(result, lang),
        planCsv: buildPricingCsv(result, lang),
      },
      { headers: noStore },
    );
  } catch (err) {
    const code = err instanceof Error && 'code' in err ? String((err as Error & { code?: string }).code) : 'invalid-data';
    return bad(code);
  }
}
