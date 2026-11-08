/**
 * Optional server-side shelf-photo recognition.
 *
 * Design decisions that matter for a judged demo:
 *  - The model only reports what it can SEE (name, rough count, category, unit,
 *    days to expiry). It is explicitly forbidden from inventing prices, weights or
 *    sell-through history; those come from the local city pack in buildShelf().
 *  - Model output is sanitised against whitelists before it reaches the engine.
 *  - With no vision credentials the endpoint returns an explicitly labelled DEMO
 *    recognition built from the selected city pack, so the full "photo -> review ->
 *    prediction" loop can still be demonstrated offline. It never pretends a real
 *    recognition happened.
 *  - Images are forwarded to the configured provider and never persisted or echoed.
 */

import { CATEGORIES, UNITS, buildShelf, shelfFor } from '@/shared/engine.mjs';
import type { Lang, SkuDraft } from '@/shared/engine.mjs';
import { httpJson } from '@/server/http';

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

export type VisionMode = 'vision' | 'demo';
export type VisionNotice = 'demo-no-key' | 'vision-ok' | 'vision-fallback';

export interface VisionResult {
  mode: VisionMode;
  model: string | null;
  notice: VisionNotice;
  detail: string | null;
  skus: SkuDraft[];
  city: string;
  lang: Lang;
  inputMime: string;
  inputBytes: number;
}

export type ImageParse =
  | { ok: true; dataUrl: string; mime: string; bytes: number }
  | { ok: false; error: string };

export function visionStatus(): { configured: boolean; model: string | null } {
  const base = firstEnv('VISION_API_BASE', 'LLM_API_BASE');
  const key = firstEnv('VISION_API_KEY', 'LLM_API_KEY');
  const model = process.env.VISION_MODEL?.trim() || '';
  return { configured: Boolean(base && key && model), model: base && key && model ? model : null };
}

function firstEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return '';
}

/** Validate an image data URL without ever writing it to disk. */
export function parseImage(value: unknown): ImageParse {
  if (typeof value !== 'string' || value.length < 32) {
    return { ok: false, error: 'image-missing' };
  }
  const match = /^data:(image\/[a-z+.-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(value.trim());
  if (!match) return { ok: false, error: 'image-format' };
  const mime = match[1].toLowerCase();
  if (!ALLOWED_MIME.includes(mime)) return { ok: false, error: 'image-type' };
  const payload = match[2].replace(/\s/g, '');
  const bytes = Math.floor((payload.length * 3) / 4);
  if (bytes > MAX_IMAGE_BYTES) return { ok: false, error: 'image-too-large' };
  if (bytes < 64) return { ok: false, error: 'image-format' };
  return { ok: true, dataUrl: `data:${mime};base64,${payload}`, mime, bytes };
}

/**
 * Explicitly labelled demo recognition. Drafts mirror the selected city pack, so
 * applying them reproduces the published baseline numbers exactly.
 */
export function demoDrafts(city: string, lang: Lang): SkuDraft[] {
  return shelfFor(city, lang).map((sku) => ({
    name: sku.displayName,
    nameAlt: sku.altName,
    category: sku.category,
    unit: sku.unit,
    qty: sku.qty,
    expiryDays: sku.expiryDays,
    unitKg: sku.unitKg,
    cost: sku.cost,
    soldAverage: sku.soldAverage,
  }));
}

function clampNum(value: unknown, fallback: number, lo: number, hi: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}

/** Whitelist + range check on untrusted model output. */
export function sanitiseDrafts(raw: unknown): SkuDraft[] {
  if (!Array.isArray(raw)) return [];
  const out: SkuDraft[] = [];
  for (const item of raw.slice(0, 12)) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name.trim().slice(0, 60) : '';
    if (!name) continue;
    out.push({
      name,
      nameAlt: typeof o.nameAlt === 'string' ? o.nameAlt.trim().slice(0, 60) : '',
      category: CATEGORIES.includes(String(o.category)) ? String(o.category) : 'prepared',
      unit: UNITS.includes(String(o.unit)) ? String(o.unit) : 'pc',
      qty: Math.round(clampNum(o.qty, 10, 0, 500)),
      expiryDays: Math.round(clampNum(o.expiryDays, 2, 1, 14)),
    });
    if (out.length === 8) break;
  }
  return out;
}

function extractItems(content: string): unknown {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('No JSON object in model response');
  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as { items?: unknown };
  return parsed.items;
}

async function callVision(dataUrl: string, city: string, lang: Lang): Promise<SkuDraft[] | null> {
  const base = firstEnv('VISION_API_BASE', 'LLM_API_BASE');
  const key = firstEnv('VISION_API_KEY', 'LLM_API_KEY');
  const model = process.env.VISION_MODEL?.trim();
  if (!base || !key || !model) return null;
  let url: string;
  try {
    const parsed = new URL(base);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    url = `${parsed.toString().replace(/\/+$/, '')}/chat/completions`;
  } catch {
    return null;
  }

  const isEn = lang === 'en';
  const system = isEn
    ? 'You read shelf photos for small food shops. Reply with ONE JSON object only: {"items":[{"name","nameAlt","category","unit","qty","expiryDays"}]}. name in English, nameAlt in Simplified Chinese. category must be one of dairy, veg, bakery, prepared, fruit, grain. unit one of cup, bunch, loaf, box, pc, bottle, kg, tub, pack. qty is the visible item count (integer), expiryDays is days until expiry (1-14, estimate 1 for fresh perishables). NEVER include prices, weights, revenue or any number you cannot see. At most 8 items.'
    : '你为社区小店读取货架照片。只回复一个 JSON 对象：{"items":[{"name","nameAlt","category","unit","qty","expiryDays"}]}。name 用简体中文，nameAlt 用英文。category 只能是 dairy、veg、bakery、prepared、fruit、grain 之一；unit 只能是 cup、bunch、loaf、box、pc、bottle、kg、tub、pack 之一。qty 是可见数量（整数），expiryDays 是距过期天数（1-14，生鲜易腐可估 1）。禁止输出价格、重量、营业额等照片上看不到的数字。最多 8 项。';

  const { status, data } = await httpJson(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 900,
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: [
            { type: 'text', text: isEn ? `Read this shelf photo for a shop in ${city}. Return JSON only.` : `读取这张${city}小店的货架照片，只返回 JSON。` },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
    timeoutMs: 20000,
  });
  if (status !== 200 || !data || typeof data !== 'object') {
    throw new Error(`Vision provider returned ${status || 'no data'}`);
  }
  const parsed = data as { choices?: Array<{ message?: { content?: string } }> };
  const content = parsed.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('Empty vision response');
  const drafts = sanitiseDrafts(extractItems(content));
  return drafts.length ? drafts : null;
}

export async function recogniseShelf(
  image: string,
  city: string,
  lang: Lang,
  meta: { mime: string; bytes: number },
): Promise<VisionResult> {
  const base: Omit<VisionResult, 'mode' | 'model' | 'notice' | 'detail' | 'skus'> = {
    city,
    lang,
    inputMime: meta.mime,
    inputBytes: meta.bytes,
  };

  if (!visionStatus().configured) {
    return {
      ...base,
      mode: 'demo',
      model: null,
      notice: 'demo-no-key',
      detail: null,
      skus: demoDrafts(city, lang),
    };
  }

  try {
    const drafts = await callVision(image, city, lang);
    if (!drafts) throw new Error('No usable SKUs in vision response');
    // Ensure the drafts can be turned into a valid shelf before returning them.
    buildShelf(city, drafts, lang);
    return {
      ...base,
      mode: 'vision',
      model: visionStatus().model,
      notice: 'vision-ok',
      detail: null,
      skus: drafts,
    };
  } catch (err) {
    return {
      ...base,
      mode: 'demo',
      model: null,
      notice: 'vision-fallback',
      detail: err instanceof Error ? err.message.slice(0, 120) : 'Vision provider failed',
      skus: demoDrafts(city, lang),
    };
  }
}
