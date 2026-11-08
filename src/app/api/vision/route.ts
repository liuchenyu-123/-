import { NextRequest, NextResponse } from 'next/server';
import { cityKeys, ENGINE_VERSION } from '@/shared/engine.mjs';
import { resolveLang } from '@/shared/i18n';
import { parseImage, recogniseShelf, sanitiseDrafts, visionStatus } from '@/server/vision';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStore = { 'cache-control': 'no-store' };

function bad(error: string, status = 400) {
  return NextResponse.json({ error, accepted: { city: cityKeys(), lang: ['zh', 'en'], image: 'data:image/(jpeg|png|webp);base64,… (max 6 MB)' } }, { status, headers: noStore });
}

export function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      engineVersion: ENGINE_VERSION,
      vision: visionStatus(),
      note: 'POST an image data URL to receive reviewed SKU drafts. Without VISION_MODEL + credentials, demo drafts are returned and clearly labelled.',
    },
    { headers: noStore },
  );
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad('invalid-json');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return bad('invalid-body');
  const o = body as Record<string, unknown>;

  const city = typeof o.city === 'string' && cityKeys().includes(o.city) ? o.city : 'guangzhou';
  if (o.city !== undefined && (typeof o.city !== 'string' || !cityKeys().includes(o.city))) {
    return bad('invalid-city');
  }
  if (o.lang !== undefined && (typeof o.lang !== 'string' || !['zh', 'en'].includes(o.lang))) {
    return bad('invalid-lang');
  }
  const lang = resolveLang(o.lang);

  const parsed = parseImage(o.image);
  if (!parsed.ok) return bad(parsed.error);

  const result = await recogniseShelf(parsed.dataUrl, city, lang, { mime: parsed.mime, bytes: parsed.bytes });
  return NextResponse.json(
    {
      engineVersion: ENGINE_VERSION,
      ...result,
      // Never echo the image back to the client.
      imageEchoed: false,
      draftsValidated: sanitiseDrafts(result.skus).length,
    },
    { headers: noStore },
  );
}
