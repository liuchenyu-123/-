import type { Metadata } from 'next';
import LabClient from '@/components/LabClient';
import { getLang } from '@/server/lang';
import { ui } from '@/shared/i18n';

export async function generateMetadata(): Promise<Metadata> {
  const d = ui(await getLang());
  return {
    title: d.nav.lab,
    description: d.lab.lead,
  };
}

export default async function LabPage() {
  return <LabClient lang={await getLang()} />;
}
