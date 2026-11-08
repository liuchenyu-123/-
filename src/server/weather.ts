/**
 * Live weather signal via Open-Meteo (free, no API key).
 *
 * The provider only FETCHES observations. The judgement "is this a heat wave or a
 * rain event" lives in src/shared/weather-rules.mjs, a pure module shared with the
 * browser and unit tests, so the mapping is inspectable rather than buried in a fetch.
 *
 * Failure is always graceful: the endpoint returns mode "fallback" with typical-day
 * values and a detail string, never a fabricated live reading. Results are cached
 * in-process for 10 minutes so a booth screen polling the API stays within limits.
 */

import { CITY_COORDS, classifyWeather } from '@/shared/weather-rules.mjs';
import type { WeatherClassification, WeatherObservation } from '@/shared/weather-rules.mjs';
import type { Lang } from '@/shared/engine.mjs';
import { httpJson } from '@/server/http';

const DEFAULT_ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
const CACHE_TTL_MS = 10 * 60 * 1000;
const FALLBACK_TTL_MS = 60 * 1000;

export interface LiveWeather extends WeatherClassification {
  mode: 'live' | 'fallback';
  city: string;
  lang: Lang;
  source: string;
  observedAt: string | null;
  observation: WeatherObservation;
  cached: boolean;
  detail: string | null;
}

type CacheEntry = { at: number; value: LiveWeather };
const cache = new Map<string, CacheEntry>();

export function weatherStatus(): { enabled: boolean; endpoint: string } {
  const enabled = (process.env.WEATHER_MODE?.trim() || 'on').toLowerCase() !== 'off';
  const endpoint = process.env.WEATHER_API_BASE?.trim() || DEFAULT_ENDPOINT;
  return { enabled, endpoint };
}

function fallback(city: string, lang: Lang, detail: string): LiveWeather {
  return {
    ...classifyWeather({}),
    mode: 'fallback',
    city,
    lang,
    source: 'city pack (offline)',
    observedAt: null,
    observation: {},
    cached: false,
    detail,
  };
}

function readNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export async function fetchLiveWeather(city: string, lang: Lang): Promise<LiveWeather> {
  const { enabled, endpoint } = weatherStatus();
  if (!enabled) return fallback(city, lang, 'Live weather disabled by WEATHER_MODE=off');
  const coord = CITY_COORDS[city];
  if (!coord) return fallback(city, lang, `No coordinates for city: ${city}`);

  const key = `${city}:${lang}`;
  const hit = cache.get(key);
  const ttl = hit?.value.mode === 'fallback' ? FALLBACK_TTL_MS : CACHE_TTL_MS;
  if (hit && Date.now() - hit.at < ttl) return { ...hit.value, cached: true };

  let value: LiveWeather;
  try {
    const url = new URL(endpoint);
    url.searchParams.set('latitude', String(coord.latitude));
    url.searchParams.set('longitude', String(coord.longitude));
    url.searchParams.set('current', 'temperature_2m,precipitation,weather_code');
    url.searchParams.set('daily', 'temperature_2m_max,precipitation_sum');
    url.searchParams.set('timezone', 'auto');
    url.searchParams.set('forecast_days', '1');
    const { status, data } = await httpJson(url, { method: 'GET', timeoutMs: 12000 });
    if (status !== 200 || !data || typeof data !== 'object') {
      throw new Error(`Open-Meteo returned ${status || 'no data'}`);
    }
    const parsed = data as {
      current?: Record<string, unknown>;
      daily?: Record<string, unknown>;
    };
    const current = parsed.current ?? {};
    const daily = parsed.daily ?? {};
    const dailyMax = Array.isArray(daily.temperature_2m_max)
      ? readNumber(daily.temperature_2m_max[0])
      : undefined;
    const dailyPrecipitation = Array.isArray(daily.precipitation_sum)
      ? readNumber(daily.precipitation_sum[0])
      : undefined;
    const localTime = typeof current.time === 'string' ? current.time : '';
    const observation: WeatherObservation = {
      temperature: readNumber(current.temperature_2m),
      dailyMax,
      precipitation: readNumber(current.precipitation),
      dailyPrecipitation,
      weatherCode: readNumber(current.weather_code),
      localDate: localTime.slice(0, 10),
    };
    if (observation.temperature === undefined && dailyMax === undefined) {
      throw new Error('Open-Meteo response missing temperature');
    }
    value = {
      ...classifyWeather(observation),
      mode: 'live',
      city,
      lang,
      source: 'Open-Meteo (current + today)',
      observedAt: localTime || null,
      observation,
      cached: false,
      detail: null,
    };
  } catch (err) {
    value = fallback(city, lang, err instanceof Error ? err.message.slice(0, 120) : 'Weather provider unreachable');
  }

  cache.set(key, { at: Date.now(), value });
  return value;
}
