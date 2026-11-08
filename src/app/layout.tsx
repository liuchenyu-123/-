import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import SiteNav from '@/components/SiteNav';
import { getLang } from '@/server/lang';
import { ui } from '@/shared/i18n';
import './globals.css';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export async function generateMetadata(): Promise<Metadata> {
  const d = ui(await getLang());
  return {
    metadataBase: new URL(siteUrl),
    title: { default: d.meta.title, template: d.meta.template },
    description: d.meta.description,
    openGraph: {
      title: d.meta.ogTitle,
      description: d.meta.ogDescription,
      type: 'website',
    },
  };
}

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const lang = await getLang();
  const d = ui(lang);
  return (
    <html lang={lang === 'zh' ? 'zh-CN' : 'en'}>
      <body>
        <SiteNav lang={lang} />
        {children}
        <footer className="wrap site">
          <span>{d.footer.line}</span>
          <span>
            <Link href="/">{d.footer.project}</Link> · <Link href="/lab">{d.footer.lab}</Link> ·{' '}
            <Link href="/pricing">{d.footer.pricing}</Link> · <Link href="/pitch">{d.footer.pitch}</Link> ·{' '}
            <Link href="/api/health">{d.footer.health}</Link>
          </span>
        </footer>
      </body>
    </html>
  );
}
