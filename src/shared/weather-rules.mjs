/**
 * Pure weather classification rules.
 *
 * Kept dependency-free and shared by the server provider, the browser and unit tests.
 * The live provider only fetches observations; ALL judgement about what counts as a
 * heat wave or a rain event lives here so it is inspectable, testable and identical
 * everywhere. Returns reason codes, not translated strings.
 */

export const CITY_COORDS = Object.freeze({
  guangzhou: { latitude: 23.13, longitude: 113.26 },
  antalya: { latitude: 36.90, longitude: 30.71 },
  manila: { latitude: 14.60, longitude: 120.98 },
});

/** WMO weather codes that mean rain or thunderstorms (Open-Meteo / ECMWF). */
const RAIN_CODES = Object.freeze([
  51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99,
]);

/**
 * @param {{temperature?:number, dailyMax?:number, precipitation?:number,
 *          dailyPrecipitation?:number, weatherCode?:number, localDate?:string}} observation
 * @returns {{weather:'normal'|'heat'|'rain', dayType:'weekday'|'weekend',
 *           reason:'rain-now'|'rain-code'|'wet-day'|'heat-now'|'heat-peak'|'typical',
 *           weekend:boolean}}
 */
export function classifyWeather(observation = {}) {
  const temp = Number.isFinite(observation.temperature) ? observation.temperature : NaN;
  const max = Number.isFinite(observation.dailyMax) ? observation.dailyMax : NaN;
  const precip = Number.isFinite(observation.precipitation) ? observation.precipitation : 0;
  const code = Number(observation.weatherCode);

  // Rain wins: a storm suppresses evening footfall regardless of temperature.
  let weather = 'normal';
  let reason = 'typical';
  if (precip >= 1 || RAIN_CODES.includes(code)) {
    weather = 'rain';
    reason = precip >= 1 ? 'rain-now' : 'rain-code';
  } else if (Number.isFinite(observation.dailyPrecipitation) && observation.dailyPrecipitation >= 20) {
    weather = 'rain';
    reason = 'wet-day';
  } else if ((Number.isFinite(max) && max >= 36) || (Number.isFinite(temp) && temp >= 35)) {
    weather = 'heat';
    reason = Number.isFinite(max) && max >= 36 ? 'heat-peak' : 'heat-now';
  }

  let weekend = false;
  if (typeof observation.localDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(observation.localDate)) {
    const day = new Date(`${observation.localDate.slice(0, 10)}T12:00:00Z`).getUTCDay();
    weekend = day === 0 || day === 6;
  }
  return { weather, dayType: weekend ? 'weekend' : 'weekday', reason, weekend };
}
