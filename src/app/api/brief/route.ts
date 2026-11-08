import { NextRequest, NextResponse } from 'next/server';
import { analyse, buildFieldBrief, ENGINE_VERSION } from '@/shared/engine.mjs';
import { validateAnalyseInput } from '@/server/validate';
import { enrichText } from '@/server/agent';
import { resolveLang } from '@/shared/i18n';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const validated = validateAnalyseInput(body);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const analysis = analyse(validated.input);
  const brief = buildFieldBrief(analysis);
  const isEn = resolveLang(analysis.lang) === 'en';
  const wantsPolish = (body as Record<string, unknown>).polish === true;

  if (!wantsPolish) {
    return NextResponse.json({ engineVersion: ENGINE_VERSION, lang: analysis.lang, mode: 'rules', brief, polished: null });
  }

  const result = await enrichText(
    isEn
      ? 'You edit field briefs for climate-action media kits. Keep every number exactly as given. Do not add claims.'
      : '你负责润色气候行动媒体包的现场简报。所有数字必须原样保留，不得添加新论断，用简体中文。',
    isEn
      ? `Rewrite this as one tight press-ready paragraph of at most 70 words:\n\n${brief}`
      : `把下面内容改写成一段紧凑、可直接给媒体的中文简报，不超过 150 字：\n\n${brief}`,
  );
  return NextResponse.json({
    engineVersion: ENGINE_VERSION,
    lang: analysis.lang,
    mode: result.mode,
    brief,
    polished: result.text,
    notice: result.error ?? null,
  });
}
