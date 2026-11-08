import { NextRequest, NextResponse } from 'next/server';
import { cityKeys, ENGINE_VERSION } from '@/shared/engine.mjs';
import { resolveLang } from '@/shared/i18n';
import { fetchLiveWeather, weatherStatus } from '@/server/weather';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'cache-control': 'no-store' };

function bad(error: string) {
  return NextResponse.json({ error, accepted: { city: cityKeys(), lang: ['zh', 'en'] } }, { status: 400, headers: noStore });
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const city = sp.get('city') ?? 'guangzhou';
  const rawLang = sp.get('lang');
  if (!cityKeys().includes(city)) return bad('invalid-city');
  if (rawLang !== null && !['zh', 'en'].includes(rawLang)) return bad('invalid-lang');
  const lang = resolveLang(rawLang);
  const { enabled, endpoint } = weatherStatus();
  const result = await fetchLiveWeather(city, lang);
  return NextResponse.json(
    { engineVersion: ENGINE_VERSION, provider: { enabled, endpoint }, ...result },
    { headers: noStore },
  );
}
