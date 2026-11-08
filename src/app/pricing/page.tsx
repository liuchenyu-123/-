import type { Metadata } from 'next';
import PricingClient from '@/components/PricingClient';
import { getLang } from '@/server/lang';
import { ui } from '@/shared/i18n';

export async function generateMetadata(): Promise<Metadata> {
  const d = ui(await getLang()).pricing;
  return {
    title: ui(await getLang()).nav.pricing,
    description: d.lead,
  };
}

export default async function PricingPage() {
  return <PricingClient lang={await getLang()} />;
}
