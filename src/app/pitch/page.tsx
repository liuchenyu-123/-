import type { Metadata } from 'next';
import { analyse, ENGINE_VERSION } from '@/shared/engine.mjs';
import { ui, fill } from '@/shared/i18n';
import { getLang } from '@/server/lang';

export async function generateMetadata(): Promise<Metadata> {
  return { title: ui(await getLang()).nav.pitch };
}

export default async function PitchPage() {
  const lang = await getLang();
  const d = ui(lang);
  const r = analyse({ city: 'guangzhou', weather: 'normal', dayType: 'weekday', hour: 18, lang });

  return (
    <div className="wrap pitch" style={{ paddingTop: 40, paddingBottom: 40 }}>
      <div className="no-print" style={{ marginBottom: 18 }}>
        <p className="note">{d.pitch.printNote}</p>
      </div>

      <div style={{ borderBottom: '2px solid var(--teal)', paddingBottom: 16, marginBottom: 22 }}>
        <h1 style={{ fontSize: 30 }}>{d.nav.brand}</h1>
        <p className="muted" style={{ fontSize: 15 }}>{d.pitch.subtitle}</p>
        <p className="small faint" style={{ marginTop: 8 }}>
          {fill(d.pitch.metaLine, { version: ENGINE_VERSION })}
        </p>
      </div>

      <h2>{d.pitch.h.problem}</h2>
      <p>{d.pitch.p.problem}</p>

      <h2>{d.pitch.h.built}</h2>
      <table>
        <tbody>
          {d.pitch.builtRows.map((row) => (
            <tr key={row.k}><td>{row.k}</td><td>{row.v}</td></tr>
          ))}
        </tbody>
      </table>

      <h2>{d.pitch.h.ai}</h2>
      <p>{d.pitch.p.ai}</p>

      <h2>{d.pitch.h.impact}</h2>
      <div className="grid3" style={{ marginBottom: 10 }}>
        <div className="pf"><div className="n">{r.metrics.foodAtRiskKg} kg</div><div className="t">{d.pitch.impactLabels[0]}</div></div>
        <div className="pf"><div className="n">{r.metrics.co2eKg} kg</div><div className="t">{d.pitch.impactLabels[1]}</div></div>
        <div className="pf"><div className="n">{(r.comparison.followPlan.foodRescuedKg * 7).toFixed(0)} kg</div><div className="t">{d.pitch.impactLabels[2]}</div></div>
      </div>
      <p className="note">{d.pitch.p.impactNote}</p>

      <h2>{d.pitch.h.arch}</h2>
      <table>
        <tbody>
          {d.pitch.archRows.map((row) => (
            <tr key={row.k}><td>{row.k}</td><td>{row.v}</td></tr>
          ))}
        </tbody>
      </table>

      <h2>{d.pitch.h.demo}</h2>
      <p>{d.pitch.p.demo}</p>

      <h2>{d.pitch.h.why}</h2>
      <p>{d.pitch.p.why}</p>

      <div className="pitchline">
        “{d.pitch.p.closing}”
      </div>
    </div>
  );
}
