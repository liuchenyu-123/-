import { NextResponse } from 'next/server';
import { cityKeys, ENGINE_VERSION, analyse } from '@/shared/engine.mjs';
import { PRICING_VERSION, optimisePricing } from '@/shared/pricing.mjs';
import { llmStatus } from '@/server/agent';
import { visionStatus } from '@/server/vision';
import { weatherStatus } from '@/server/weather';
import { httpStatus } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  let engineOk = false;
  let pricingOk = false;
  try {
    engineOk = analyse({ city: 'guangzhou' }).metrics.foodAtRiskKg > 0;
    pricingOk = optimisePricing({ useSample: true }).plan.length === 6;
  } catch {
    engineOk = false;
  }
  return NextResponse.json(
    {
      status: engineOk && pricingOk ? 'ok' : 'degraded',
      engineVersion: ENGINE_VERSION,
      engineOk,
      pricing: { version: PRICING_VERSION, selfTest: pricingOk },
      cityPacks: cityKeys().length,
      llm: llmStatus(),
      vision: visionStatus(),
      weather: weatherStatus(),
      outboundHttp: httpStatus(),
      endpoints: ['/api/analyse', '/api/brief', '/api/health', '/api/vision', '/api/weather', '/api/pricing'],
      timestamp: new Date().toISOString(),
    },
    { status: engineOk ? 200 : 503, headers: { 'cache-control': 'no-store' } },
  );
}
