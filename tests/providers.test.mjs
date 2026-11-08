import test from 'node:test';
import assert from 'node:assert/strict';
import { CITY_COORDS, classifyWeather } from '../src/shared/weather-rules.mjs';

test('three city coordinates are available for the live provider', () => {
  assert.deepEqual(Object.keys(CITY_COORDS).sort(), ['antalya', 'guangzhou', 'manila']);
  for (const c of Object.values(CITY_COORDS)) {
    assert.ok(c.latitude > -90 && c.latitude < 90);
    assert.ok(c.longitude > -180 && c.longitude < 180);
  }
});

test('typical observation stays normal on a weekday', () => {
  const r = classifyWeather({ temperature: 24, dailyMax: 27, precipitation: 0, weatherCode: 0, localDate: '2026-11-09' });
  assert.equal(r.weather, 'normal');
  assert.equal(r.dayType, 'weekday');
  assert.equal(r.reason, 'typical');
  assert.equal(r.weekend, false);
});

test('rain wins over heat and is explained by a stable reason code', () => {
  const now = classifyWeather({ temperature: 37, dailyMax: 39, precipitation: 3.2, weatherCode: 95, localDate: '2026-11-08' });
  assert.equal(now.weather, 'rain');
  assert.equal(now.reason, 'rain-now');
  assert.equal(now.dayType, 'weekend');
  const codeOnly = classifyWeather({ temperature: 30, precipitation: 0, weatherCode: 82, localDate: '2026-11-09' });
  assert.equal(codeOnly.weather, 'rain');
  assert.equal(codeOnly.reason, 'rain-code');
  const wetDay = classifyWeather({ temperature: 25, dailyPrecipitation: 25, localDate: '2026-11-09' });
  assert.equal(wetDay.weather, 'rain');
  assert.equal(wetDay.reason, 'wet-day');
});

test('heat thresholds are explicit and deterministic', () => {
  assert.equal(classifyWeather({ temperature: 35, dailyMax: 35.5 }).weather, 'heat');
  assert.equal(classifyWeather({ temperature: 30, dailyMax: 36 }).reason, 'heat-peak');
  assert.equal(classifyWeather({ temperature: 36, dailyMax: 30 }).reason, 'heat-now');
  assert.equal(classifyWeather({ temperature: 34.9, dailyMax: 35.9 }).weather, 'normal');
});

test('weekend detection uses the local date, not the server timezone', () => {
  assert.equal(classifyWeather({ localDate: '2026-11-08' }).dayType, 'weekend');
  assert.equal(classifyWeather({ localDate: '2026-11-07' }).dayType, 'weekend');
  assert.equal(classifyWeather({ localDate: '2026-11-06' }).dayType, 'weekday');
});

test('missing or malformed observations never throw', () => {
  assert.doesNotThrow(() => classifyWeather());
  assert.equal(classifyWeather({ temperature: 'hot', precipitation: null }).weather, 'normal');
  assert.equal(classifyWeather({ localDate: 'not-a-date' }).dayType, 'weekday');
});
