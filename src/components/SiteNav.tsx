import Link from 'next/link';
import LangToggle from '@/components/LangToggle';
import { ui, type Lang } from '@/shared/i18n';

export default function SiteNav({ lang }: { lang: Lang }) {
  const d = ui(lang);
  return (
    <div className="wrap">
      <nav className="nav">
        <Link className="brand" href="/">
          <span className="mark">B</span> {d.nav.brand}
        </Link>
        <div className="navlinks">
          <Link href="/">{d.nav.project}</Link>
          <Link href="/lab">{d.nav.lab}</Link>
          <Link href="/pricing">{d.nav.pricing}</Link>
          <Link href="/pitch">{d.nav.pitch}</Link>
          <Link href="/api/health">{d.nav.health}</Link>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <LangToggle lang={lang} label={d.nav.switchTo} />
          <Link className="navcta" href="/lab">{d.nav.demo}</Link>
        </div>
      </nav>
    </div>
  );
}
