'use client';

import { useMemo, useState, type ChangeEvent } from 'react';
import Link from 'next/link';
import { ui, fill, type Lang } from '@/shared/i18n';
import {
  PRICING_VERSION, SAMPLE_SALES_CSV, SAMPLE_SALES_META,
  buildPricingBrief, buildPricingCsv, optimisePricing, parseSalesCsv,
} from '@/shared/pricing.mjs';
import type { PricingResult } from '@/shared/pricing.mjs';
import { ENGINE_VERSION } from '@/shared/engine.mjs';

interface Knobs {
  hour: number;
  weather: string;
  dayType: string;
  maxDiscount: number;
  wasteWeight: number;
  allowBelowCost: boolean;
}

const DEFAULT_KNOBS: Knobs = {
  hour: 18,
  weather: 'normal',
  dayType: 'weekday',
  maxDiscount: 60,
  wasteWeight: 5,
  allowBelowCost: false,
};

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ''));

function download(text: string, filename: string, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function PricingClient({ lang }: { lang: Lang }) {
  const d = ui(lang).pricing;
  const errors = d.data.errors as Record<string, string>;
  const weatherOptions = d.weatherOptions as Record<string, string>;
  const dayOptions = d.dayOptions as Record<string, string>;

  const [csv, setCsv] = useState<string>(SAMPLE_SALES_CSV);
  const [source, setSource] = useState<'sample' | 'import' | null>('sample');
  const [knobs, setKnobs] = useState<Knobs>(DEFAULT_KNOBS);
  const [stockEdits, setStockEdits] = useState<Record<string, number>>({});
  const [priceEdits, setPriceEdits] = useState<Record<string, number>>({});
  const [fileError, setFileError] = useState('');
  const [verify, setVerify] = useState<'idle' | 'busy' | 'ok' | 'mismatch' | 'error'>('idle');
  const [copied, setCopied] = useState(false);

  const parsed = useMemo(() => parseSalesCsv(csv), [csv]);
  const result = useMemo<PricingResult | null>(() => {
    if (!parsed.rows.length || parsed.errors.length) return null;
    try {
      return optimisePricing({
        rows: parsed.rows,
        city: 'guangzhou',
        ...knobs,
        todayStock: stockEdits,
        todayPrice: priceEdits,
        lang,
      });
    } catch {
      return null;
    }
  }, [parsed, knobs, stockEdits, priceEdits, lang]);

  const brief = useMemo(() => (result ? buildPricingBrief(result, lang) : ''), [result, lang]);
  const planCsv = useMemo(() => (result ? buildPricingCsv(result, lang) : ''), [result, lang]);
  const cur = result?.city.currency ?? '¥';

  const setKnob = <K extends keyof Knobs>(key: K, value: Knobs[K]) =>
    setKnobs((prev) => ({ ...prev, [key]: value }));

  function resetEdits() {
    setStockEdits({});
    setPriceEdits({});
    setVerify('idle');
  }

  function loadSample() {
    setCsv(SAMPLE_SALES_CSV);
    setSource('sample');
    setFileError('');
    resetEdits();
  }

  function clearData() {
    setCsv('');
    setSource(null);
    setFileError('');
    resetEdits();
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 2_000_000) {
      setFileError(errors['csv-too-large']);
      return;
    }
    const text = await file.text();
    const check = parseSalesCsv(text);
    if (check.errors.length) {
      setFileError(errors[check.errors[0]] ?? check.errors[0]);
      return;
    }
    setCsv(text);
    setSource('import');
    setFileError('');
    resetEdits();
    event.target.value = '';
  }

  async function verifyAgainstServer() {
    if (!parsed.rows.length) return;
    setVerify('busy');
    try {
      const res = await fetch('/api/pricing', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          rows: parsed.rows, city: 'guangzhou', ...knobs,
          todayStock: stockEdits, todayPrice: priceEdits, lang,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'error');
      setVerify(
        body.result?.totals?.revenueOptimized === result?.totals.revenueOptimized ? 'ok' : 'mismatch',
      );
    } catch {
      setVerify('error');
    }
  }

  async function copyBrief() {
    try {
      await navigator.clipboard.writeText(brief);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  }

  const winCount = result?.plan.filter(
    (p) => p.revenueDelta >= 0 && p.foodRescuedKg >= 0 && p.optimized.wastedKg <= p.baseline.wastedKg,
  ).length ?? 0;

  return (
    <main className="wrap pricing">
      <section className="block" style={{ borderTop: 0, paddingTop: 54 }}>
        <div className="eyebrow">{d.eyebrow}</div>
        <h1 style={{ maxWidth: 860, margin: '15px 0 16px' }}>{d.h1}</h1>
        <p className="lead" style={{ maxWidth: 780 }}>{d.lead}</p>
        <p className="note" style={{ marginTop: 14 }}>
          {fill(d.meta, { version: PRICING_VERSION, engine: ENGINE_VERSION })}
        </p>
        <div className="buttons" style={{ marginTop: 18 }}>
          <a className="btn" href="/data/sample-sales-history.csv" download>{d.data.downloadBtn}</a>
          <Link className="btn" href="/lab">{ui(lang).nav.lab} →</Link>
        </div>
      </section>

      {/* 01 · Data import */}
      <section className="block">
        <div className="sechead">
          <div className="eyebrow">{d.s1.eyebrow}</div>
          <h2>{d.s1.h2}</h2>
        </div>
        <div className="panel">
          <div className="buttons">
            <button className="btn btn-primary" onClick={loadSample}>{d.data.sampleBtn}</button>
            <label className="btn" style={{ cursor: 'pointer' }}>
              {d.data.fileLabel}
              <input type="file" accept=".csv,text/csv" onChange={onFile} style={{ display: 'none' }} />
            </label>
            <button className="btn" onClick={clearData} disabled={!csv}>{d.data.clearBtn}</button>
          </div>
          {fileError && <div className="errline">{fileError}</div>}
          {parsed.errors.length > 0 && <div className="errline">{errors[parsed.errors[0]] ?? parsed.errors[0]}</div>}
          {source && parsed.rows.length > 0 && (
            <>
              <div className="appliedline">
                {fill(d.data.loaded, {
                  rows: parsed.stats.rows, skus: parsed.stats.skus, days: parsed.stats.days,
                  from: parsed.stats.from || '—', to: parsed.stats.to || '—',
                })}
                <br />
                <span className="muted">
                  {source === 'sample' ? d.data.sourceSample : d.data.sourceImport}
                </span>
              </div>
              <h3 style={{ margin: '20px 0 8px' }}>{d.data.previewTitle}</h3>
              <div className="ptable-wrap">
                <table className="ptable">
                  <thead>
                    <tr>
                      {Object.values(d.data.cols).map((c) => <th key={c}>{c}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.slice(0, 6).map((r, i) => (
                      <tr key={`${r.skuId}-${r.date}-${i}`}>
                        <td>{r.date || '—'}</td>
                        <td>{lang === 'zh' ? r.name : (r.nameEn || r.name)}</td>
                        <td>{fmt(r.listPrice)}</td>
                        <td>{fmt(r.sellingPrice)}</td>
                        <td>{r.qtySold}</td>
                        <td>{r.qtyWasted}</td>
                        <td>{weatherOptions[r.weather] ?? r.weather}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <p className="note" style={{ marginTop: 14 }}>{d.data.colsNote}</p>
        </div>
      </section>

      {/* 02 · Constraints */}
      <section className="block">
        <div className="sechead">
          <div className="eyebrow">{d.s2.eyebrow}</div>
          <h2>{d.s2.h2}</h2>
        </div>
        <div className="sim">
          <div className="panel ctrl">
            <div className="field">
              <label>{d.knobs.hour}<b>{knobs.hour}:00</b></label>
              <input type="range" min={14} max={22} step={1} value={knobs.hour}
                onChange={(e) => setKnob('hour', Number(e.target.value))} />
            </div>
            <div className="field">
              <label>{d.knobs.maxDiscount}<b>{knobs.maxDiscount}%</b></label>
              <input type="range" min={0} max={60} step={5} value={knobs.maxDiscount}
                onChange={(e) => setKnob('maxDiscount', Number(e.target.value))} />
            </div>
            <div className="field">
              <label>{d.knobs.wasteWeight}<b>{knobs.wasteWeight} {cur}/kg</b></label>
              <input type="range" min={0} max={20} step={1} value={knobs.wasteWeight}
                onChange={(e) => setKnob('wasteWeight', Number(e.target.value))} />
              <span className="note">{d.knobs.wasteNote}</span>
            </div>
            <div className="sep" />
            <div className="field">
              <label htmlFor="pricing-weather">{d.knobs.weather}</label>
              <select id="pricing-weather" value={knobs.weather}
                onChange={(e) => setKnob('weather', e.target.value)}>
                {Object.entries(weatherOptions).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="pricing-day">{d.knobs.dayType}</label>
              <select id="pricing-day" value={knobs.dayType}
                onChange={(e) => setKnob('dayType', e.target.value)}>
                {Object.entries(dayOptions).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <label className="act" style={{ cursor: 'pointer' }}>
              <input type="checkbox" checked={knobs.allowBelowCost}
                onChange={(e) => setKnob('allowBelowCost', e.target.checked)} />
              <span className="tx"><b>{d.knobs.allowBelowCost}</b><span>{d.knobs.costNote}</span></span>
            </label>
          </div>

          <div className="panel">
            <h3>{d.knobs.stockTitle}</h3>
            <p className="note" style={{ margin: '5px 0 12px' }}>{d.knobs.stockNote}</p>
            <div className="ptable-wrap">
              <table className="ptable compact">
                <thead>
                  <tr>
                    <th>{d.knobs.cols.sku}</th>
                    <th>{d.knobs.cols.stock}</th>
                    <th>{d.knobs.cols.price}</th>
                    <th>{d.knobs.cols.cost}</th>
                    <th>{d.knobs.cols.expiry}</th>
                  </tr>
                </thead>
                <tbody>
                  {(result?.plan ?? []).map((p) => (
                    <tr key={p.skuId}>
                      <td>{p.name}</td>
                      <td><input className="cellnum" type="number" min={0} max={500} value={p.onHand}
                        onChange={(e) => setStockEdits((s) => ({ ...s, [p.skuId]: Number(e.target.value) }))} /></td>
                      <td><input className="cellnum" type="number" min={0.1} max={100000} step={0.1} value={p.listPrice}
                        onChange={(e) => setPriceEdits((s) => ({ ...s, [p.skuId]: Number(e.target.value) }))} /></td>
                      <td>{fmt(p.unitCost)}</td>
                      <td>{p.expiryDays}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="note" style={{ marginTop: 10 }}>
              {d.knobs.city}：{result?.city.label ?? '广州 · 社区小店'} · {result?.city.currency ?? '¥'}
            </p>
          </div>
        </div>
      </section>

      {/* 03 · Plan */}
      <section className="block">
        <div className="sechead">
          <div className="eyebrow">{d.s3.eyebrow}</div>
          <h2>{d.s3.h2}</h2>
        </div>

        {!result ? (
          <div className="panel"><p className="muted">{d.empty}</p></div>
        ) : (
          <>
            <div className="metrics" style={{ marginBottom: 14 }}>
              <div className="met"><div className="n">+{fmt(result.totals.revenueDelta)}</div>
                <div className="l">{d.totals.revenue}</div></div>
              <div className="met"><div className="n">{fmt(result.totals.foodRescuedKg)} kg</div>
                <div className="l">{d.totals.waste}</div></div>
              <div className="met"><div className="n">{fmt(result.totals.co2eAvoidedKg)} kg</div>
                <div className="l">{d.totals.co2}</div></div>
              <div className="met"><div className="n">{fmt(result.totals.profitDelta)}</div>
                <div className="l">{d.totals.profit}</div></div>
            </div>
            <div className="statusline">
              <span>{fill(d.totals.revenueSub, {
                from: fmt(result.totals.revenueBaseline), to: fmt(result.totals.revenueOptimized),
                cur, pct: result.totals.revenueDeltaPct,
              })}</span>
              <span>{fill(d.totals.wasteSub, {
                from: fmt(result.totals.foodWastedKgBaseline), to: fmt(result.totals.foodWastedKgOptimized),
              })}</span>
              <span>{fill(d.totals.vsRule, { amount: fmt(result.totals.revenueVsRule), cur })}</span>
              <span>{fill(d.totals.winNote, { n: winCount, total: result.plan.length })}</span>
            </div>

            <h3 style={{ margin: '30px 0 8px' }}>{d.fit.title}</h3>
            <p className="note" style={{ marginBottom: 10 }}>{d.fit.note}</p>
            <div className="ptable-wrap">
              <table className="ptable">
                <thead><tr>{Object.values(d.fit.cols).map((c) => <th key={c}>{c}</th>)}</tr></thead>
                <tbody>
                  {result.plan.map((p) => (
                    <tr key={p.skuId}>
                      <td>{p.name}</td>
                      <td><b>{p.elasticity}</b></td>
                      <td>{p.samples}</td>
                      <td>{p.priceLevels}</td>
                      <td>{p.method === 'regression' ? p.r2 : '—'}</td>
                      <td><span className={`badge ${p.method === 'regression' ? 'ok' : 'demo'}`}>
                        {p.method === 'regression' ? d.fit.fitted : d.fit.fallback}
                      </span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 style={{ margin: '30px 0 8px' }}>{d.plan.title}</h3>
            <p className="note" style={{ marginBottom: 10 }}>{d.plan.note}</p>
            <div className="ptable-wrap">
              <table className="ptable">
                <thead><tr>{Object.values(d.plan.cols).map((c) => <th key={c}>{c}</th>)}</tr></thead>
                <tbody>
                  {result.plan.map((p) => {
                    const win = p.revenueDelta > 0 && p.foodRescuedKg > 0;
                    return (
                      <tr key={p.skuId}>
                        <td><b>{p.name}</b><br /><span className="faint small">{p.optimalDiscount === 0 ? d.plan.keep : (win ? d.plan.win : d.plan.tradeoff)}</span></td>
                        <td>{p.onHand}</td>
                        <td>{cur}{fmt(p.listPrice)}</td>
                        <td><b className="tealtext">−{p.optimalDiscount}%</b></td>
                        <td><b>{cur}{fmt(p.optimalPrice)}</b></td>
                        <td>{p.expectedSold}</td>
                        <td>{cur}{fmt(p.optimized.revenue)}</td>
                        <td className={p.revenueDelta >= 0 ? 'tealtext' : 'coraltext'}>
                          {p.revenueDelta >= 0 ? '+' : ''}{cur}{fmt(p.revenueDelta)}</td>
                        <td>{fmt(p.foodRescuedKg)} kg</td>
                        <td>{p.ruleDiscount}%</td>
                        <td>{p.startTime}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <h3 style={{ margin: '30px 0 8px' }}>{d.ladder.title}</h3>
            <p className="note" style={{ marginBottom: 12 }}>{d.ladder.note}</p>
            <div className="grid3">
              {result.schedule.map((s) => (
                <div className="card" key={s.skuId}>
                  <b>{s.name}</b>
                  {s.stages.map((st, i) => (
                    <div className="ladderstep" key={`${st.time}-${i}`}>
                      <span className="lt">{st.time}</span>
                      <span className="ln">{cur}{fmt(st.price)} <b>−{st.discount}%</b></span>
                      <span className="ld">{st.label}{st.relaxed ? ` · ${d.ladder.relaxed}` : ''}{st.belowCost ? ` · ${d.ladder.belowCost}` : ''}</span>
                      <span className="ld">{fmt(st.expectedSold)} / {fmt(st.leftAfter)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <div className="grid2" style={{ marginTop: 26 }}>
              <div className="panel">
                <h3>{d.compare.title}</h3>
                <p className="abline">{fill(d.compare.rule, {
                  discount: result.plan[0].ruleDiscount, cur, revenue: fmt(result.plan[0].ruleRevenue),
                })}</p>
                <p className="abline">{fill(d.compare.fitted, {
                  discount: result.plan[0].optimalDiscount, cur, revenue: fmt(result.plan[0].optimized.revenue),
                })}</p>
                <p className="note" style={{ marginTop: 10 }}>{d.compare.note}</p>
              </div>
              <div className="panel">
                <h3>{d.export.csvNote}</h3>
                <div className="buttons" style={{ marginTop: 14 }}>
                  <button className="btn btn-primary" onClick={() => download(planCsv, 'optimal-selling-plan.csv')}>
                    {d.export.csvBtn}
                  </button>
                  <button className="btn" onClick={copyBrief}>{copied ? d.export.copied : d.export.briefBtn}</button>
                  <button className="btn" onClick={() => window.print()}>{d.export.printBtn}</button>
                </div>
                <div className="buttons" style={{ marginTop: 10 }}>
                  <button className="btn btn-mini" onClick={verifyAgainstServer} disabled={verify === 'busy'}>
                    {verify === 'busy' ? d.loading : lang === 'zh' ? '用 /api/pricing 验证前后端一致' : 'Verify against /api/pricing'}
                  </button>
                  {verify === 'ok' && <span className="badge ok">{lang === 'zh' ? '前后端一致' : 'Browser and server agree'}</span>}
                  {verify === 'mismatch' && <span className="badge demo">{lang === 'zh' ? '数字不一致' : 'Mismatch'}</span>}
                  {verify === 'error' && <span className="badge demo">{d.networkError}</span>}
                </div>
              </div>
            </div>

            <h3 style={{ margin: '30px 0 8px' }}>{d.export.briefTitle}</h3>
            <div className="shift"><pre>{brief}</pre></div>

            <h3 style={{ margin: '30px 0 8px' }}>{d.assumptionsTitle}</h3>
            <div className="panel">
              {result.assumptions.map((a, i) => <p className="note" key={i} style={{ marginBottom: 8 }}>· {a}</p>)}
            </div>
            <p className="note" style={{ marginTop: 14 }}>{d.footnote}</p>
          </>
        )}
      </section>
    </main>
  );
}
