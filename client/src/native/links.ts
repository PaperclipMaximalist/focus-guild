/**
 * Where a link goes in the iOS app. Pure, so it is tested without a device;
 * native/shell.ts acts on the answer.
 *
 *   'browser': a web page that is not the app's own. It opens in the in-app
 *              browser sheet (SFSafariViewController), so the member stays in
 *              the app and the WebView never navigates away from it.
 *   'system':  mailto:, tel:, sms:. Left to iOS, which opens Mail, Phone or
 *              Messages (Capacitor hands any outside URL to the system).
 *   null:      the app's own pages, in-page anchors, blob: and data: URLs,
 *              javascript:, and anything unreadable. Left alone.
 */

export type LinkRoute = { kind: 'browser'; url: string } | { kind: 'system'; url: string } | null;

const SYSTEM_SCHEMES = new Set(['mailto:', 'tel:', 'sms:']);

/** `href` as written in the page; `base` the page's own address (location.href). */
export function routeLink(href: string | null | undefined, base: string): LinkRoute {
  if (!href) return null;
  let url: URL;
  let here: URL;
  try {
    here = new URL(base);
    url = new URL(href, here);
  } catch {
    return null;
  }
  if (SYSTEM_SCHEMES.has(url.protocol)) return { kind: 'system', url: url.href };
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  // The app's own bundle (capacitor://localhost, or the dev server).
  if (url.origin === here.origin) return null;
  return { kind: 'browser', url: url.href };
}
