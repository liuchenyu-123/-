import { cookies } from 'next/headers';
import { DEFAULT_LANG, resolveLang, type Lang } from '@/shared/i18n';

/**
 * Resolve the UI language on the server.
 *
 * A cookie set by the language toggle wins; otherwise DEFAULT_LANG (default zh)
 * applies. Using a cookie keeps one URL per page, so a link shared at the COP31
 * booth works for everyone and each visitor can still switch language in place.
 */
export async function getLang(): Promise<Lang> {
  const store = await cookies();
  const fromCookie = store.get('lang')?.value;
  return resolveLang(fromCookie ?? process.env.DEFAULT_LANG ?? DEFAULT_LANG);
}
