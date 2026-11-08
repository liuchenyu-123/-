import { NextRequest, NextResponse } from 'next/server';
import { analyse, buildFieldBrief, compareCities, cityKeys, ENGINE_VERSION } from '@/shared/engine.mjs';
import type { AnalyseInput } from '@/shared/engine.mjs';
import { resolveLang } from '@/shared/i18n';
import { validateAnalyseInput, fromSearchParams } from '@/server/validate';
import { enrichText, llmStatus } from '@/server/agent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function payloadFor(input: AnalyseInput) {
  const analysis = analyse(input);
  return {
    engineVersion: ENGINE_VERSION,
    lang: analysis.lang,
    mode: 'rules' as 'rules' | 'llm',
    llm: llmStatus(),
    analysis,
    fieldBrief: buildFieldBrief(analysis),
    cities: compareCities(input),
    narrative: null as string | null,
    llmError: undefined as string | undefined,
  };
}

function ok(payload: ReturnType<typeof payloadFor>) {
  return NextResponse.json(payload, { headers: { 'cache-control': 'no-store' } });
}

function bad(error: string) {
  return NextResponse.json(
    { error, accepted: { city: cityKeys(), weather: ['normal', 'heat', 'rain'], dayType: ['weekday', 'weekend', 'holiday'], hour: '14..22', lang: ['zh', 'en'] } },
    { status: 400, headers: { 'cache-control': 'no-store' } },
  );
}

export async function GET(req: NextRequest) {
  const validated = validateAnalyseInput(fromSearchParams(req.nextUrl.searchParams));
  if (!validated.ok) return bad(validated.error);
  return ok(payloadFor(validated.input));
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad('Invalid JSON body');
  }
  const validated = validateAnalyseInput(body);
  if (!validated.ok) return bad(validated.error);

  const payload = payloadFor(validated.input);
  const wantsEnrichment = (body as Record<string, unknown>).enrich === true;
  if (wantsEnrichment) {
    const { analysis } = payload;
    const isEn = resolveLang(analysis.lang) === 'en';
    const facts = isEn
      ? [
          `Store: ${analysis.city.city}. Weather: ${analysis.scenario.weatherLabel}. Time: ${analysis.scenario.hour}:00.`,
          `At-risk SKUs: ${analysis.actions.map((a) => `${a.displayName} (${a.risk}% risk, ${a.discount}% markdown suggested)`).join('; ')}.`,
          `Impact: ${analysis.metrics.foodAtRiskKg} kg food, ${analysis.metrics.co2eKg} kg CO2e, ${analysis.metrics.currency}${analysis.metrics.revenueRecovered} recoverable.`,
          'Write two short, plain-English sentences a shop owner would act on tonight. No jargon, no bullet points.',
        ]
      : [
          `门店：${analysis.city.city}。天气：${analysis.scenario.weatherLabel}。时间：${analysis.scenario.hour}:00。`,
          `风险商品：${analysis.actions.map((a) => `${a.displayName}（风险 ${a.risk}%，建议降价 ${a.discount}%）`).join('；')}。`,
          `影响：${analysis.metrics.foodAtRiskKg} kg 食物、${analysis.metrics.co2eKg} kg CO₂e、可回收 ${analysis.metrics.currency}${analysis.metrics.revenueRecovered}。`,
          '用两句简短的中文，写出店主今晚就能照做的动作。不要术语，不要列表。',
        ];
    const enrichment = await enrichText(
      isEn
        ? 'You are a concise assistant for small food retailers. Never invent numbers; use only the figures provided.'
        : '你是小店经营助手，只用给定的数字，不得编造；回答用简体中文。',
      facts.join('\n'),
    );
    payload.mode = enrichment.mode;
    payload.narrative = enrichment.text;
    payload.llmError = enrichment.error;
  }
  return ok(payload);
}
