/**
 * Where the Privacy Policy, Terms and Support pages are.
 *
 * On the website they are the site's own pages, plain links. In the iOS app
 * they are the website's copies, as absolute https addresses: native/shell.ts
 * sends any link to another origin to the in-app browser sheet, so the member
 * reads the page the website publishes (the one Apple's reviewers see too)
 * and stays in the app.
 */

import { WEB_URL, isNativeApp } from '../native/platform';

export type LegalPage = 'privacy' | 'terms' | 'support';

export const LEGAL_PAGES: Array<{ page: LegalPage; label: string }> = [
  { page: 'privacy', label: 'Privacy policy' },
  { page: 'terms', label: 'Terms of use' },
  { page: 'support', label: 'Support' },
];

/** The address of a public page, for an `<a href>`. */
export function legalHref(page: LegalPage, native = isNativeApp, webUrl = WEB_URL): string {
  const path = `/${page}.html`;
  return native ? `${webUrl.replace(/\/+$/, '')}${path}` : path;
}
