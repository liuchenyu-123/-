'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  analyse,
  buildShelf,
  buildShiftCard,
  CATEGORIES,
  cityKeys,
  cityMeta,
  compareCities,
  ENGINE_VERSION,
} from '@/shared/engine.mjs';
import type { SkuDraft } from '@/shared/engine.mjs';
import { ui, fill, type Lang } from '@/shared/i18n';

type LabState = {
  city: string;
  weather: string;
  dayType: string;
  hour: number;
  quantities: number[] | null;
  skuOverrides: SkuDraft[] | null;
};

type ServerCheck = {
  ok: boolean;
  food?: number;
  mode?: string;
  version?: string;
  llm?: boolean;
  error?: string;
};

type VisionResult = {
  mode: 'vision' | 'demo';
  notice: string;
  detail: string | null;
  skus: SkuDraft[];
};

type LiveResult = {
  mode: 'live' | 'fallback';
  weather: 'normal' | 'heat' | 'rain';
  dayType: 'weekday' | 'weekend';
  reason: string;
  source: string;
  observedAt: string | null;
  detail: string | null;
  cached: boolean;
  temperature: number | null;
  weekend: boolean;
};

const INITIAL: LabState = {
  city: 'guangzhou',
  weather: 'normal',
  dayType: 'weekday',
  hour: 18,
  quantities: null,
  skuOverrides: null,
};

/** Draw a synthetic "shelf photo" so the whole loop can be demoed with one click. */
function drawSampleShelf(lang: Lang): string {
  const cv = document.createElement('canvas');
  cv.width = 960;
  cv.height = 540;
  const x = cv.getContext('2d');
  if (!x) return '';
  x.fillStyle = '#e8e4da';
  x.fillRect(0, 0, 960, 540);
  x.fillStyle = '#d5cfc0';
  x.fillRect(0, 0, 960, 26);
  const labels = lang === 'zh'
    ? ['原味酸奶', '本地叶菜', '全麦吐司', '熟食盒饭', '芒果', '鲜牛奶']
    : ['Yoghurt', 'Leafy greens', 'Toast', 'Meal boxes', 'Mangoes', 'Fresh milk'];
  const colours = ['#f4f1e7', '#8fb98a', '#d9ad70', '#e6c7a8', '#e8b24c', '#f2f5f4'];
  for (let row = 0; row < 2; row += 1) {
    const baseY = 70 + row * 230;
    for (let col = 0; col < 3; col += 1) {
      const idx = row * 3 + col;
      const px = 50 + col * 305;
      x.fillStyle = '#fbfaf6';
      x.fillRect(px - 8, baseY + 4, 258, 164);
      x.fillStyle = colours[idx];
      x.fillRect(px + 14, baseY + 26, 112, 116);
      x.fillStyle = 'rgba(0,0,0,0.10)';
      x.fillRect(px + 14, baseY + 26, 112, 16);
      x.fillStyle = '#2f3a33';
      x.font = '600 19px system-ui, sans-serif';
      x.fillText(labels[idx], px + 138, baseY + 70, 110);
      x.fillStyle = '#87928a';
      x.font = '15px system-ui, sans-serif';
      x.fillText(`SKU 0${idx + 1}`, px + 138, baseY + 100, 110);
    }
    x.fillStyle = '#9c8e74';
    x.fillRect(20, baseY + 172, 920, 14);
  }
  return cv.toDataURL('image/jpeg', 0.82);
}

export default function LabClient({ lang }: { lang: Lang }) {
  const d = ui(lang);
  const [state, setState] = useState<LabState>(INITIAL);
  const [picked, setPicked] = useState<boolean[]>([true, true, true]);
  const [shift, setShift] = useState<string | null>(null);
  const [weekDay, setWeekDay] = useState(0);
  const [weekRunning, setWeekRunning] = useState(false);
  const [guess, setGuess] = useState<string | null>(null);
  const [server, setServer] = useState<ServerCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [brief, setBrief] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const [imageData, setImageData] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<SkuDraft[] | null>(null);
  const [vision, setVision] = useState<VisionResult | null>(null);
  const [visionBusy, setVisionBusy] = useState(false);
  const [visionError, setVisionError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const [live, setLive] = useState<LiveResult | null>(null);
  const [liveBusy, setLiveBusy] = useState(false);

  const baseShelf = useMemo(
    () => buildShelf(state.city, state.skuOverrides, lang),
    [state.city, state.skuOverrides, lang],
  );
  const quantities = useMemo(
    () => state.quantities ?? baseShelf.map((s) => s.qty),
    [state.quantities, baseShelf],
  );
  const result = useMemo(() => analyse({ ...state, quantities, lang }), [state, quantities, lang]);
  const meta = cityMeta(state.city, lang);
  const ranking = useMemo(
    () => compareCities({ weather: state.weather, dayType: state.dayType, hour: state.hour, lang }),
    [state.weather, state.dayType, state.hour, lang],
  );

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  // Generated text is language-specific: clear it when the visitor switches language.
  useEffect(() => {
    setShift(null);
    setBrief(null);
    setServer(null);
    setVisionError(null);
  }, [lang]);

  function patch(next: Partial<LabState>) {
    setState((s) => ({ ...s, ...next }));
    setShift(null);
    setGuess(null);
    setServer(null);
  }

  function changeQty(index: number, value: number) {
    const next = [...quantities];
    next[index] = value;
    patch({ quantities: next });
  }

  async function recognise(dataUrl?: string) {
    const image = dataUrl ?? imageData;
    if (!image) {
      setVisionError('image-missing');
      return;
    }
    setVisionBusy(true);
    setVisionError(null);
    try {
      const res = await fetch('/api/vision', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ image, city: state.city, lang }),
      });
      const data = await res.json();
      if (!res.ok) {
        setVisionError(typeof data.error === 'string' ? data.error : 'generic');
        return;
      }
      setVision({
        mode: data.mode,
        notice: data.notice,
        detail: data.detail ?? null,
        skus: data.skus as SkuDraft[],
      });
      setDrafts(data.skus as SkuDraft[]);
      setApplied(false);
    } catch {
      setVisionError('network');
    } finally {
      setVisionBusy(false);
    }
  }

  function useSample() {
    const url = drawSampleShelf(lang);
    if (!url) return;
    setImageData(url);
    void recognise(url);
  }

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) {
      setVisionError('image-too-large');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      setImageData(url);
      void recognise(url);
    };
    reader.readAsDataURL(file);
  }

  function editDraft(index: number, key: string, value: string | number) {
    setDrafts((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[index] = { ...next[index], [key]: value } as SkuDraft;
      return next;
    });
    setApplied(false);
  }

  function applyDrafts() {
    if (!drafts || drafts.length === 0) return;
    patch({ skuOverrides: drafts, quantities: null });
    setApplied(true);
  }

  function clearDrafts() {
    patch({ skuOverrides: null, quantities: null });
    setDrafts(null);
    setVision(null);
    setImageData(null);
    setApplied(false);
    setVisionError(null);
  }

  async function autoWeather() {
    setLiveBusy(true);
    try {
      const res = await fetch(`/api/weather?city=${state.city}&lang=${lang}`);
      const data = await res.json();
      if (!res.ok) {
        setLive({ mode: 'fallback', weather: 'normal', dayType: 'weekday', reason: 'typical', source: '—', observedAt: null, detail: String(data.error ?? 'request failed'), cached: false, temperature: null, weekend: false });
        return;
      }
      setLive({
        mode: data.mode,
        weather: data.weather,
        dayType: data.dayType,
        reason: data.reason,
        source: data.source,
        observedAt: data.observedAt ?? null,
        detail: data.detail ?? null,
        cached: Boolean(data.cached),
        temperature: typeof data.observation?.temperature === 'number' ? data.observation.temperature : null,
        weekend: Boolean(data.weekend),
      });
      if (data.mode === 'live') patch({ weather: data.weather, dayType: data.dayType });
    } catch {
      setLive({ mode: 'fallback', weather: 'normal', dayType: 'weekday', reason: 'typical', source: '—', observedAt: null, detail: 'network error', cached: false, temperature: null, weekend: false });
    } finally {
      setLiveBusy(false);
    }
  }

  function runWeek() {
    if (timer.current) clearInterval(timer.current);
    setWeekDay(0);
    setWeekRunning(true);
    let day = 0;
    timer.current = setInterval(() => {
      day += 1;
      setWeekDay(day);
      if (day >= 7) {
        if (timer.current) clearInterval(timer.current);
        timer.current = null;
        setWeekRunning(false);
      }
    }, 420);
  }

  async function verifyOnServer() {
    setBusy(true);
    try {
      const res = await fetch('/api/analyse', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...state, quantities, lang }),
      });
      const data = await res.json();
      setServer({
        ok: res.ok,
        food: data.analysis?.metrics?.foodAtRiskKg,
        mode: data.mode,
        version: data.engineVersion,
        llm: data.llm?.configured,
        error: data.error,
      });
    } catch {
      setServer({ ok: false, error: d.lab.networkError });
    } finally {
      setBusy(false);
    }
  }

  async function fetchBrief() {
    setBusy(true);
    try {
      const res = await fetch('/api/brief', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...state, quantities, lang }),
      });
      const data = await res.json();
      setBrief(data.brief ?? data.error ?? d.lab.noBrief);
    } catch {
      setBrief(d.lab.networkError);
    } finally {
      setBusy(false);
    }
  }

  function exportCard() {
    const cv = document.createElement('canvas');
    cv.width = 1000;
    cv.height = 560;
    const x = cv.getContext('2d');
    if (!x) return;
    const card = d.lab.exportCard;
    x.fillStyle = '#f7f9f7';
    x.fillRect(0, 0, 1000, 560);
    x.fillStyle = '#0f6e56';
    x.fillRect(0, 0, 1000, 12);
    x.fillStyle = '#16211d';
    x.font = '600 40px system-ui, sans-serif';
    x.fillText(d.nav.brand, 60, 90);
    x.fillStyle = '#5f6c66';
    x.font = '22px system-ui, sans-serif';
    x.fillText(card.subtitle, 60, 132);
    x.fillStyle = '#0f6e56';
    x.font = '600 17px system-ui, sans-serif';
    x.fillText(
      `${meta.label}  ·  ${state.hour}:00  ·  ${result.scenario.weatherLabel} / ${result.scenario.dayTypeLabel}`,
      60, 180,
    );
    const cells = [
      [card.labels[0], `${result.metrics.foodAtRiskKg} kg`],
      [card.labels[1], `${result.metrics.co2eKg} kg`],
      [card.labels[2], `${meta.currency}${result.metrics.revenueRecovered}`],
    ];
    cells.forEach(([label, value], i) => {
      const px = 60 + i * 300;
      x.fillStyle = '#e6f4ee';
      x.fillRect(px, 230, 270, 170);
      x.fillStyle = '#0f6e56';
      x.font = '600 46px system-ui, sans-serif';
      x.fillText(value, px + 22, 315);
      x.fillStyle = '#4a7466';
      x.font = '18px system-ui, sans-serif';
      x.fillText(label, px + 22, 360);
    });
    x.fillStyle = '#8d9a94';
    x.font = '16px system-ui, sans-serif';
    x.fillText(card.note1, 60, 470);
    x.fillText(card.note2, 60, 500);
    const a = document.createElement('a');
    a.download = 'best-before-twin-impact.png';
    a.href = cv.toDataURL('image/png');
    a.click();
  }

  const match = server?.ok && server.food === result.metrics.foodAtRiskKg;
  const errorTexts = d.lab.vision.errors as Record<string, string>;
  const reasonTexts = d.lab.live.reasons as Record<string, string>;
  const categoryLabels = d.lab.vision.categories as Record<string, string>;
  const noticeText = vision?.notice === 'demo-no-key'
    ? d.lab.vision.noticeDemo
    : vision?.notice === 'vision-ok'
      ? d.lab.vision.noticeVision
      : vision
        ? fill(d.lab.vision.noticeFallback, { detail: vision.detail ?? '—' })
        : '';

  return (
    <>
      <header className="wrap" style={{ padding: '44px 0 34px' }}>
        <span className="eyebrow">{d.lab.eyebrow}</span>
        <h1 style={{ maxWidth: 780, margin: '14px 0' }}>{d.lab.h1}</h1>
        <p className="lead" style={{ marginBottom: 16 }}>{d.lab.lead}</p>
        <p className="note">{fill(d.lab.note, { version: ENGINE_VERSION, cities: cityKeys().length })}</p>
      </header>

      <section className="block">
        <div className="wrap">
          <div className="sechead">
            <span className="eyebrow">{d.lab.vision.eyebrow}</span>
            <h2>{d.lab.vision.h2}</h2>
            <p>{d.lab.vision.p}</p>
          </div>
          <div className="vision">
            <div className="panel">
              <label className="filelabel">
                <span>{d.lab.vision.fileLabel}</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onFile} />
              </label>
              <div className="buttons" style={{ marginTop: 12 }}>
                <button className="btn" onClick={useSample} disabled={visionBusy}>{d.lab.vision.sampleBtn}</button>
                <button className="btn btn-primary" onClick={() => void recognise()} disabled={!imageData || visionBusy}>
                  {visionBusy ? d.lab.vision.recognising : d.lab.vision.recogniseBtn}
                </button>
              </div>
              {imageData && <img className="preview" src={imageData} alt={d.lab.vision.previewAlt} />}
              {vision && (
                <div className="visionstatus">
                  <span className={`badge ${vision.mode === 'vision' ? 'ok' : 'demo'}`}>
                    {vision.mode === 'vision' ? d.lab.vision.modeVision : d.lab.vision.modeDemo}
                  </span>
                  <p>{noticeText}</p>
                </div>
              )}
              {visionError && (
                <div className="errline">{errorTexts[visionError] ?? errorTexts.generic}</div>
              )}
            </div>

            <div className="panel">
              <div className="subhead">{d.lab.vision.tableTitle}</div>
              {drafts && drafts.length > 0 ? (
                <>
                  <div className="skutable">
                    <div className="skrow skhead">
                      <span>{d.lab.vision.cols.name}</span>
                      <span>{d.lab.vision.cols.category}</span>
                      <span>{d.lab.vision.cols.qty}</span>
                      <span>{d.lab.vision.cols.expiry}</span>
                    </div>
                    {drafts.map((sku, i) => (
                      <div className="skrow" key={`${sku.name}-${i}`}>
                        <input
                          type="text" value={sku.name} maxLength={60}
                          onChange={(e) => editDraft(i, 'name', e.target.value)}
                        />
                        <select
                          value={sku.category}
                          onChange={(e) => editDraft(i, 'category', e.target.value)}
                        >
                          {CATEGORIES.map((c) => (
                            <option key={c} value={c}>{categoryLabels[c] ?? c}</option>
                          ))}
                        </select>
                        <input
                          type="number" min={0} max={500} value={sku.qty}
                          onChange={(e) => editDraft(i, 'qty', Math.min(500, Math.max(0, Number(e.target.value) || 0)))}
                        />
                        <input
                          type="number" min={1} max={14} value={sku.expiryDays}
                          onChange={(e) => editDraft(i, 'expiryDays', Math.min(14, Math.max(1, Number(e.target.value) || 1)))}
                        />
                      </div>
                    ))}
                  </div>
                  <p className="note" style={{ marginTop: 10 }}>
                    {fill(d.lab.vision.tableNote, { city: meta.short })}
                  </p>
                  <div className="buttons" style={{ marginTop: 12 }}>
                    <button className="btn btn-primary" onClick={applyDrafts}>{d.lab.vision.applyBtn}</button>
                    <button className="btn" onClick={clearDrafts}>{d.lab.vision.clearBtn}</button>
                  </div>
                  {applied && (
                    <div className="appliedline">{fill(d.lab.vision.applied, { n: drafts.length })}</div>
                  )}
                </>
              ) : (
                <p className="note">{d.lab.vision.empty}</p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="block">
        <div className="wrap">
          <div className="sechead">
            <span className="eyebrow">{d.lab.s1.eyebrow}</span>
            <h2>{d.lab.s1.h2}</h2>
            <p>{meta.city} · {meta.temp}°C · {meta.note}</p>
          </div>

          <div className="sim">
            <div className="panel ctrl">
              <div className="field">
                <label>{d.lab.fields.store}</label>
                <select value={state.city} onChange={(e) => patch({ city: e.target.value, quantities: null })}>
                  {cityKeys().map((key) => (
                    <option key={key} value={key}>{cityMeta(key, lang).label}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>{d.lab.fields.weather}</label>
                <select value={state.weather} onChange={(e) => patch({ weather: e.target.value })}>
                  <option value="normal">{d.lab.weatherOptions.normal}</option>
                  <option value="heat">{d.lab.weatherOptions.heat}</option>
                  <option value="rain">{d.lab.weatherOptions.rain}</option>
                </select>
                <button className="btn btn-mini" onClick={() => void autoWeather()} disabled={liveBusy}>
                  {liveBusy ? d.lab.live.busy : d.lab.live.btn}
                </button>
                {live ? (
                  <div className="livestatus">
                    {live.mode === 'live' ? (
                      <>
                        <b>{fill(d.lab.live.appliedLive, {
                          city: meta.short,
                          weather: result.scenario.weatherLabel,
                          dayType: result.scenario.dayTypeLabel,
                          temp: live.temperature ?? '—',
                        })}</b>
                        <span>{fill(d.lab.live.source, {
                          source: live.source,
                          time: live.observedAt ?? '—',
                          cached: live.cached ? d.lab.live.cachedYes : d.lab.live.cachedNo,
                        })}</span>
                        <span>{reasonTexts[live.reason] ?? live.reason} · {live.weekend ? d.lab.live.weekend : d.lab.live.weekday}</span>
                      </>
                    ) : (
                      <span>{fill(d.lab.live.fallback, { detail: live.detail ?? '—' })}</span>
                    )}
                  </div>
                ) : (
                  <span className="small faint">{d.lab.live.idle}</span>
                )}
              </div>
              <div className="field">
                <label>{d.lab.fields.dayType}</label>
                <select value={state.dayType} onChange={(e) => patch({ dayType: e.target.value })}>
                  <option value="weekday">{d.lab.dayOptions.weekday}</option>
                  <option value="weekend">{d.lab.dayOptions.weekend}</option>
                  <option value="holiday">{d.lab.dayOptions.holiday}</option>
                </select>
              </div>
              <div className="field">
                <label>{d.lab.fields.time} <b>{state.hour}:00</b></label>
                <input
                  type="range" min={14} max={22} step={1} value={state.hour}
                  onChange={(e) => patch({ hour: Number(e.target.value) })}
                />
                <span className="small faint">{fill(d.lab.fields.hoursLeft, { n: result.scenario.sellingHoursLeft })}</span>
              </div>
              <div className="sep" />
              <div>
                <div className="subhead">{d.lab.fields.shelf}</div>
                {baseShelf.slice(0, 4).map((sku, i) => (
                  <div className="field" key={sku.id} style={{ marginBottom: 10 }}>
                    <label>{sku.displayName} <b>{quantities[i]} {sku.unitLabel}</b></label>
                    <input
                      type="range" min={0} max={Math.max(8, Math.round(sku.qty * 1.8))}
                      value={quantities[i]}
                      onChange={(e) => changeQty(i, Number(e.target.value))}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <div className="metrics">
                <div className="met"><div className="n">{result.metrics.foodAtRiskKg}<small>kg</small></div><div className="l">{d.lab.metrics.food}</div></div>
                <div className="met"><div className="n">{result.metrics.co2eKg}<small>kg</small></div><div className="l">{d.lab.metrics.co2}</div></div>
                <div className="met"><div className="n">{result.metrics.waterLitres.toLocaleString()}<small>L</small></div><div className="l">{d.lab.metrics.water}</div></div>
                <div className="met"><div className="n">{meta.currency}{result.metrics.revenueRecovered}</div><div className="l">{d.lab.metrics.revenue}</div></div>
              </div>

              <div className="subhead">{d.lab.top3}</div>
              {result.actions.map((a) => (
                <div className="riskrow" key={a.id}>
                  <div className="nm">{a.displayName} <span className="faint">/ {a.altName}</span></div>
                  <div className="track"><div className="fill" style={{ width: `${a.risk}%` }} /></div>
                  <div className="pc">{a.risk}%</div>
                </div>
              ))}

              <div className="advice"><b>{result.advice.window}</b><p>{result.advice.text}</p></div>

              <div className="subhead" style={{ marginTop: 18 }}>{d.lab.ladderTitle}</div>
              <div className="ladderbars">
                {result.ladder.map((step) => (
                  <div className={`lb ${step.hour === state.hour ? 'on' : ''}`} key={step.hour}>
                    <div className="b" style={{ height: `${Math.max(4, step.discount * 1.4)}px` }} />
                    <div className="t">{step.hour}</div>
                  </div>
                ))}
              </div>
              <p className="note" style={{ marginTop: 8 }}>
                {fill(d.lab.ladderNote, {
                  hour: state.hour,
                  d: result.actions[0]?.discount ?? 0,
                  d2: result.ladder[result.ladder.length - 1]?.discount ?? 0,
                })}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="block">
        <div className="wrap">
          <div className="sechead">
            <span className="eyebrow">{d.lab.s2.eyebrow}</span>
            <h2>{d.lab.s2.h2}</h2>
            <p>{fill(d.lab.s2.assumption, { rate: Math.round(result.comparison.rescueRate * 100) })}</p>
          </div>

          <div className="grid2">
            <div className="panel">
              <div className="ab bad">
                <div className="tag">{d.lab.ab.doNothing}</div>
                <h3 style={{ margin: '8px 0 10px' }}>{d.lab.ab.headBad}</h3>
                <div className="abline"><span>{d.lab.ab.foodWasted}</span><b>{result.comparison.doNothing.foodWastedKg} kg</b></div>
                <div className="abline"><span>{d.lab.ab.emissions}</span><b>{result.comparison.doNothing.co2eKg} kg CO₂e</b></div>
                <div className="abline"><span>{d.lab.ab.revenue}</span><b>{meta.currency}0</b></div>
              </div>
              <div className="ab good" style={{ marginTop: 12 }}>
                <div className="tag">{d.lab.ab.followPlan}</div>
                <h3 style={{ margin: '8px 0 10px' }}>{d.lab.ab.headGood}</h3>
                <div className="abline"><span>{d.lab.ab.foodRescued}</span><b>{result.comparison.followPlan.foodRescuedKg} kg</b></div>
                <div className="abline"><span>{d.lab.ab.emissionsAvoided}</span><b>{result.comparison.followPlan.co2eAvoidedKg} kg CO₂e</b></div>
                <div className="abline"><span>{d.lab.ab.revenue}</span><b>{meta.currency}{result.comparison.followPlan.revenueRecovered}</b></div>
              </div>
              <div className="week">
                <div className="w">
                  {weekRunning
                    ? fill(d.lab.week.titleRunning, { d: weekDay })
                    : weekDay ? d.lab.week.titleDone : d.lab.week.titleIdle}
                </div>
                <div className="big">{fill(d.lab.week.big, { kg: (result.comparison.followPlan.foodRescuedKg * weekDay).toFixed(1) })}</div>
                <div style={{ marginTop: 10 }}>
                  <button className="btn btn-primary" onClick={runWeek} disabled={weekRunning}>
                    {weekRunning ? d.lab.week.btnRunning : weekDay ? d.lab.week.btnAgain : d.lab.week.btnRun}
                  </button>
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="subhead">{d.lab.actions.subhead}</div>
              {result.actions.map((a, i) => (
                <label className="act" key={a.id} style={{ marginBottom: 8 }}>
                  <input
                    type="checkbox" checked={picked[i] ?? true}
                    onChange={(e) => {
                      const next = [...picked];
                      next[i] = e.target.checked;
                      setPicked(next);
                      setShift(null);
                    }}
                  />
                  <span className="tx">
                    <b>{fill(d.lab.actions.line, { time: a.startTime, name: a.displayName, d: a.discount })}</b>
                    <span>{fill(d.lab.actions.detail, { n: a.unitsAtRisk, unit: a.unitLabel, channel: a.channel, dish: a.dish })}</span>
                  </span>
                </label>
              ))}
              <div className="buttons">
                <button className="btn btn-primary" onClick={() => setShift(buildShiftCard(result, picked))}>{d.lab.actions.btnGenerate}</button>
                <button className="btn" onClick={() => { if (shift) void navigator.clipboard?.writeText(shift); }}>{d.lab.actions.btnCopy}</button>
              </div>
              {shift !== null && (
                <div className="shift">
                  <div className="subhead">{d.lab.actions.shiftTitle}</div>
                  <pre>{shift}</pre>
                </div>
              )}
              <p className="note" style={{ marginTop: 12 }}>{d.lab.actions.note}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="block">
        <div className="wrap">
          <div className="sechead">
            <span className="eyebrow">{d.lab.s3.eyebrow}</span>
            <h2>{d.lab.s3.h2}</h2>
            <p>{d.lab.s3.p}</p>
          </div>

          <div className="panel">
            <div className="buttons">
              <button className="btn btn-primary" onClick={verifyOnServer} disabled={busy}>{d.lab.btnVerify}</button>
              <button className="btn" onClick={fetchBrief} disabled={busy}>{d.lab.btnBrief}</button>
            </div>
            {server && (
              <div className="statusline">
                <span>
                  {server.ok
                    ? fill(d.lab.statusOk, {
                        food: server.food,
                        mode: server.mode,
                        version: server.version,
                        llm: server.llm ? d.lab.llmOn : d.lab.llmOff,
                      })
                    : fill(d.lab.statusFail, { error: server.error })}
                </span>
                <b style={{ color: match ? 'var(--teal)' : 'var(--coral)' }}>
                  {match ? d.lab.agree : server.ok ? d.lab.mismatch : d.lab.unverified}
                </b>
              </div>
            )}
            {brief && <div className="shift" style={{ marginTop: 12 }}><div className="subhead">{d.lab.briefTitle}</div><pre>{brief}</pre></div>}

            <div className="subhead" style={{ marginTop: 22 }}>{d.lab.guessTitle}</div>
            <div className="guess">
              {ranking.map((c) => (
                <button
                  key={c.key}
                  className={`gbtn ${guess ? (c.key === ranking[0].key ? 'win' : 'wrong') : ''}`}
                  onClick={() => setGuess(c.key)}
                >
                  {c.label} · {c.foodAtRiskKg} kg
                </button>
              ))}
            </div>
            {guess && (
              <div className="revealbox">
                {fill(d.lab.reveal, { city: cityMeta(ranking[0].key, lang).short })}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginTop: 20, paddingTop: 18, borderTop: '1px solid var(--line)' }}>
              <p className="small muted" style={{ maxWidth: 520 }}>{d.lab.exportNote}</p>
              <button className="btn btn-primary" onClick={exportCard}>{d.lab.exportBtn}</button>
            </div>
          </div>
          <p className="note" style={{ marginTop: 14 }}>{d.lab.footnote}</p>
        </div>
      </section>
    </>
  );
}
