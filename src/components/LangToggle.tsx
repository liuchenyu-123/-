'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Lang } from '@/shared/i18n';

/**
 * Switches the whole site between 中文 (default) and English.
 * The cookie is read by server components via getLang(); router.refresh() re-renders
 * them without changing the URL, so shared links stay valid.
 */
export default function LangToggle({ lang, label }: { lang: Lang; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const next: Lang = lang === 'zh' ? 'en' : 'zh';

  return (
    <button
      type="button"
      className="langtoggle"
      disabled={pending}
      aria-label={lang === 'zh' ? 'Switch to English' : '切换为中文'}
      onClick={() => {
        document.cookie = `lang=${next};path=/;max-age=31536000;samesite=lax`;
        startTransition(() => router.refresh());
      }}
    >
      {label}
    </button>
  );
}
