import Link from 'next/link';
import { analyse, cityKeys, cityMeta, ENGINE_VERSION } from '@/shared/engine.mjs';
import { ui, fill } from '@/shared/i18n';
import { getLang } from '@/server/lang';

export default async function HomePage() {
  const lang = await getLang();
  const d = ui(lang);
  const snapshot = analyse({ city: 'guangzhou', weather: 'normal', dayType: 'weekday', hour: 18, lang });

  const cities = cityKeys().map((key) => {
    const meta = cityMeta(key, lang);
    return {
      key,
      name: meta.short,
      sub: lang === 'zh' ? meta.city : meta.label,
      channel: meta.channels[0],
      dishes: meta.dishes.slice(0, 2).join(' / '),
      note: meta.note,
    };
  });

  return (
    <>
      <header className="wrap hero">
        <div>
          <span className="eyebrow">{d.home.eyebrow}</span>
          <h1>
            {d.home.h1a} <em>{d.home.h1em}</em>
          </h1>
          <p className="lead">{d.home.lead}</p>
          <div className="buttons">
            <Link className="btn btn-primary" href="/lab">{d.home.btnDemo}</Link>
            <Link className="btn" href="/pitch">{d.home.btnPitch}</Link>
          </div>
          <p className="note" style={{ marginTop: 16 }}>
            {fill(d.home.techNote, { version: ENGINE_VERSION })}
          </p>
        </div>

        <div className="pred">
          <div className="top">
            <b>{d.home.predTitle}</b>
            <span className="live">{d.home.predLive}</span>
          </div>
          {snapshot.actions.map((a) => (
            <div className="row" key={a.id}>
              <span className="bar" />
              <div className="nm">
                <b>{a.displayName}</b>
                <span>{fill(d.home.onShelf, { n: a.onShelf, d: a.expiryDays })}</span>
              </div>
              <span className="pc">{a.risk}%</span>
            </div>
          ))}
          <div className="sum">
            <div>
              <div className="n">{snapshot.metrics.foodAtRiskKg} kg</div>
              <div className="l">{fill(d.home.foodRisk, { city: snapshot.city.short })}</div>
            </div>
            <span>{snapshot.metrics.co2eKg} kg CO₂e</span>
          </div>
        </div>
      </header>

      <section className="wrap block">
        <div className="sechead">
          <span className="eyebrow">{d.home.problem.eyebrow}</span>
          <h2>{d.home.problem.h2}</h2>
          <p>{d.home.problem.p}</p>
        </div>
        <div className="grid3">
          {d.home.problem.facts.map((f) => (
            <div className="pf" key={f.n}>
              <div className="n">{f.n}</div>
              <div className="t">{f.t}</div>
              <div className="s">{f.s}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="wrap block">
        <div className="sechead">
          <span className="eyebrow">{d.home.how.eyebrow}</span>
          <h2>{d.home.how.h2}</h2>
        </div>
        <div className="grid3">
          {d.home.how.cards.map((c) => (
            <div className="card" key={c.idx}>
              <div className="idx">{c.idx}</div>
              <b>{c.title}</b>
              <span>{c.body}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="wrap block">
        <div className="sechead">
          <span className="eyebrow">{d.home.cities.eyebrow}</span>
          <h2>{d.home.cities.h2}</h2>
          <p>{d.home.cities.p}</p>
        </div>
        <div className="grid3">
          {cities.map((c) => (
            <div className="card city" key={c.key}>
              <div className="cn">{c.name}</div>
              <div className="en">{c.sub}</div>
              <dl>
                <dt>{d.home.cities.labels.channel}</dt><dd>{c.channel}</dd>
                <dt>{d.home.cities.labels.rescue}</dt><dd>{c.dishes}</dd>
                <dt>{d.home.cities.labels.twist}</dt><dd>{c.note}</dd>
              </dl>
            </div>
          ))}
        </div>
      </section>

      <section className="wrap block">
        <div className="sechead">
          <span className="eyebrow">{d.home.engineering.eyebrow}</span>
          <h2>{d.home.engineering.h2}</h2>
        </div>
        <div className="grid3">
          {d.home.engineering.cards.map((c) => (
            <div className="card" key={c.idx}>
              <div className="idx">{c.idx}</div>
              <b>{c.title}</b>
              <span>{c.body}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="wrap block">
        <div className="sechead">
          <span className="eyebrow">{d.home.timeline.eyebrow}</span>
          <h2>{d.home.timeline.h2}</h2>
        </div>
        <div className="timeline">
          {d.home.timeline.items.map((item) => (
            <div className="tl" key={item.when}>
              <div className="when">{item.when}</div>
              <p>{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="wrap block">
        <div className="cta">
          <h2>{d.home.cta.h2}</h2>
          <p>{d.home.cta.p}</p>
          <div className="roles">
            {d.home.cta.roles.map((role) => (
              <span className="role" key={role}>{role}</span>
            ))}
          </div>
          <div className="buttons">
            <Link className="btn btn-primary" href="/lab">{d.home.cta.btnDemo}</Link>
            <Link className="btn btn-ghost" href="/pitch">{d.home.cta.btnPitch}</Link>
          </div>
          <p className="small" style={{ marginTop: 18, opacity: 0.75 }}>
            {d.home.cta.deadline}
          </p>
        </div>
      </section>
    </>
  );
}
