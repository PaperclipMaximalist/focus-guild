/**
 * What makes the iOS app behave like an app rather than a page in a frame.
 * main.tsx calls startShell() once, before the first render, in the app only.
 *
 *   - `native` on <html>, which index.css and the `native:` variant key off
 *     (safe-area padding, no page bounce, no selecting the chrome)
 *   - status bar: light text, on the app's dark ground in every line
 *   - launch screen: stays up until the first real screen has painted, then
 *     fades; never longer than SPLASH_MAX_MS (and capacitor.config.ts tells
 *     the native side the same, in case this file never runs)
 *   - keyboard: the tab bar steps aside while it is up, and the field being
 *     typed in is kept in view
 *   - no pinch or double-tap zoom
 *   - links to other sites open in the in-app browser sheet
 *   - back from the background after a while: the stores refetch (resume.ts)
 *
 * In a desktop browser with `?native=1` (platform.ts) the plugins are their
 * web versions or missing, so every call goes through quietly(): a rejection
 * or "not implemented" can never break the app.
 */

import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Keyboard } from '@capacitor/keyboard';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { routeLink } from './links';
import { isStale, refreshAfterResume } from './resume';
import { useNativeAuth } from './auth';
import { useUserStore } from '../store/useUserStore';

/** The launch screen is never up longer than this, whatever happens. */
export const SPLASH_MAX_MS = 4000;
const SPLASH_FADE_MS = 250;
/** The app's ground colour (index.css --color-bg), for the browser sheet's bars. */
const GROUND = '#06081A';

/** True on a real iPhone; false in the desktop browser's `?native=1` preview. */
const onDevice = Capacitor.isNativePlatform();

/** Run a plugin call; whatever it throws or rejects with is swallowed. */
function quietly(run: () => unknown): void {
  try {
    const result = run();
    if (result instanceof Promise) result.catch(() => undefined);
  } catch {
    // Missing plugin, or not implemented on the web.
  }
}

/** Only plugins that exist here: no "not implemented" noise in the dev preview. */
const has = (name: string) => Capacitor.isPluginAvailable(name);

let started = false;

export function startShell(): void {
  if (started) return;
  started = true;
  document.documentElement.classList.add('native');
  lockZoom();
  styleStatusBar();
  handOffSplash();
  watchKeyboard();
  keepLinksInApp();
  refreshOnResume();
}

// ─── Zoom ─────────────────────────────────────────────────────────────────────

/**
 * A WKWebView honours user-scalable=no (Safari does not, which is why the
 * website's index.html leaves it out). Capacitor already refuses pinch
 * (ios.zoomEnabled defaults to false); this also stops the zoom iOS does on
 * focusing a small field. Double-tap zoom is index.css's touch-action.
 */
function lockZoom(): void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!meta || /user-scalable/.test(meta.content)) return;
  meta.content = `${meta.content}, maximum-scale=1, user-scalable=no`;
}

// ─── Status bar ───────────────────────────────────────────────────────────────

/**
 * Style.Dark is "light text for dark backgrounds" (@capacitor/status-bar).
 * Every line is dark, so it is set once. The page draws under the bar
 * (contentInset 'never'), so there is no bar colour to set: the top bar's own
 * background shows through it.
 */
function styleStatusBar(): void {
  if (!has('StatusBar')) return;
  quietly(() => StatusBar.setStyle({ style: Style.Dark }));
}

// ─── Launch screen ────────────────────────────────────────────────────────────

/**
 * Ready means the screen the member will actually use is on the page: the
 * sign-in screen, or (signed in) the app with the member loaded, or the
 * "Can't reach the Guild" stop. Not "Opening the guild…", not the skeleton.
 */
function firstScreenReady(): boolean {
  const auth = useNativeAuth.getState().status;
  if (auth === 'loading') return false;
  if (auth !== 'signedIn') return true;
  const { user, error } = useUserStore.getState();
  return Boolean(user || error);
}

function handOffSplash(): void {
  if (!has('SplashScreen')) return;
  let done = false;
  const unsubscribers: Array<() => void> = [];
  const hide = () => {
    if (done) return;
    done = true;
    clearTimeout(safety);
    unsubscribers.forEach((off) => off());
    quietly(() => SplashScreen.hide({ fadeOutDuration: SPLASH_FADE_MS }));
  };
  // If anything below never happens, the launch screen still goes.
  const safety = setTimeout(hide, SPLASH_MAX_MS);
  const check = () => {
    if (done || !firstScreenReady()) return;
    // Two frames: React has committed the screen and the WebView has painted it.
    requestAnimationFrame(() => requestAnimationFrame(hide));
  };
  unsubscribers.push(useNativeAuth.subscribe(check), useUserStore.subscribe(check));
  check();
}

// ─── Keyboard ─────────────────────────────────────────────────────────────────

/**
 * capacitor.config.ts sets Keyboard.resize to 'native': the whole WebView
 * shrinks to the space above the keyboard, so fixed and sticky things (the
 * quest editor's Add/Cancel bar, the jot box) stay above it. The tab bar would
 * then ride up on top of the keyboard, so it is hidden meanwhile (index.css,
 * .keyboard-up). Once the WebView has shrunk, the field is brought into view
 * in case the resize left it underneath.
 */
function watchKeyboard(): void {
  if (!has('Keyboard')) return;
  const root = document.documentElement;
  quietly(() => Keyboard.addListener('keyboardWillShow', () => root.classList.add('keyboard-up')));
  quietly(() => Keyboard.addListener('keyboardWillHide', () => root.classList.remove('keyboard-up')));
  quietly(() =>
    Keyboard.addListener('keyboardDidShow', () => {
      const el = document.activeElement;
      if (el instanceof HTMLElement && el.matches('input, textarea, select, [contenteditable="true"]')) {
        el.scrollIntoView({ block: 'nearest' });
      }
    }),
  );
}

// ─── Links that leave the app ─────────────────────────────────────────────────

/** Another site, in the in-app browser sheet; in the dev preview, a new tab. */
function openInBrowser(url: string, fallback: (url: string) => unknown): void {
  if (!onDevice) {
    fallback(url);
    return;
  }
  Browser.open({ url, toolbarColor: GROUND }).catch(() => {
    // No sheet: Safari then, which is still better than nothing happening.
    fallback(url);
  });
}

/**
 * One handler for the whole document instead of one per link. It runs after
 * React's own (which sit on #root, below document), so a link a page already
 * handled is left alone. mailto:, tel: and sms: are not touched: Capacitor
 * hands every URL outside the app to iOS, which opens Mail, Phone or Messages.
 */
function keepLinksInApp(): void {
  const systemOpen = window.open.bind(window);
  const newTab = (url: string) => systemOpen(url, '_blank', 'noopener');

  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0) return;
    const a = e.target instanceof Element ? e.target.closest('a[href]') : null;
    if (!(a instanceof HTMLAnchorElement) || a.hasAttribute('download')) return;
    const route = routeLink(a.getAttribute('href'), window.location.href);
    if (route?.kind !== 'browser') return;
    e.preventDefault();
    openInBrowser(route.url, newTab);
  });

  // window.open('https://…') from code gets the same treatment.
  window.open = ((url?: string | URL, target?: string, features?: string) => {
    const route = url == null ? null : routeLink(String(url), window.location.href);
    if (route?.kind === 'browser') {
      openInBrowser(route.url, newTab);
      return null;
    }
    return systemOpen(url, target, features);
  }) as typeof window.open;
}

// ─── Back from the background ─────────────────────────────────────────────────

/** `pause` and `resume` are @capacitor/app's; on the web it fires them on visibilitychange. */
function refreshOnResume(): void {
  if (!has('App')) return;
  let pausedAt: number | null = null;
  quietly(() =>
    App.addListener('pause', () => {
      pausedAt = Date.now();
    }),
  );
  quietly(() =>
    App.addListener('resume', () => {
      const now = Date.now();
      if (isStale(pausedAt, now)) refreshAfterResume(now - (pausedAt ?? now));
      pausedAt = null;
    }),
  );
}
