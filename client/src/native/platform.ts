/**
 * Where the client is running: in a browser, or inside the iOS app (the same
 * build in Capacitor's native shell, served from capacitor://localhost).
 *
 * Everything that differs in the app hangs off `isNativeApp`: sign-in
 * (native/auth.ts), the status bar and keyboard, notifications, and the
 * web-only parts that are left out (the service worker, Clerk).
 */

import { Capacitor } from '@capacitor/core';

const DEV_FLAG = 'focusGuild.devNative';

/**
 * Development only: open the dev server with `?native=1` to see the app's
 * screens in a desktop browser (`?native=0` to go back). The flag is kept for
 * the tab's session so it survives navigation. Never true in a production
 * web build.
 */
function devForced(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    const asked = new URLSearchParams(window.location.search).get('native');
    if (asked === '1') sessionStorage.setItem(DEV_FLAG, '1');
    if (asked === '0') sessionStorage.removeItem(DEV_FLAG);
    return sessionStorage.getItem(DEV_FLAG) === '1';
  } catch {
    return false;
  }
}

/** True inside the iOS app; false in every browser, including the installed web app. */
export const isNativeApp: boolean = Capacitor.isNativePlatform() || devForced();

/** The website's address: where the app sends people to sign in, and where the public pages (privacy, terms, support) live. */
export const WEB_URL: string = (import.meta.env.VITE_WEB_URL as string | undefined) || window.location.origin;

/** The custom URL scheme the iOS app answers to (Info.plist → CFBundleURLSchemes). */
export const APP_SCHEME = 'focusguild';
