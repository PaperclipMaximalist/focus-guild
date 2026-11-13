/**
 * Development only: draw the page as an iPhone with a notch would, in a
 * desktop browser. Open the dev server with `?inset=47,34` (top,bottom in px)
 * and --safe-top / --safe-bottom (index.css) take those values for the rest of
 * the tab's session; `?inset=0` puts them back. Add `?native=1` to see the
 * app's own layout (platform.ts).
 *
 * main.tsx calls applyDevInsets() only under import.meta.env.DEV, so none of
 * this is in a production build.
 */

const KEY = 'focusGuild.devInsets';

export interface Insets {
  top: number;
  bottom: number;
}

/**
 * `47,34` → { top: 47, bottom: 34 }. `0`, `off` or `none` → 'clear'. Anything
 * else (missing, malformed, negative, absurd) → null, which changes nothing.
 */
export function parseInsetParam(raw: string | null): Insets | 'clear' | null {
  if (raw == null) return null;
  const s = raw.trim().toLowerCase();
  if (s === '0' || s === 'off' || s === 'none') return 'clear';
  const m = /^(\d{1,3}(?:\.\d+)?)\s*,\s*(\d{1,3}(?:\.\d+)?)$/.exec(s);
  if (!m) return null;
  const top = Number(m[1]);
  const bottom = Number(m[2]);
  if (top > 200 || bottom > 200) return null;
  return { top, bottom };
}

export function applyDevInsets(): void {
  try {
    const asked = parseInsetParam(new URLSearchParams(window.location.search).get('inset'));
    if (asked === 'clear') sessionStorage.removeItem(KEY);
    else if (asked) sessionStorage.setItem(KEY, `${asked.top},${asked.bottom}`);
    const kept = parseInsetParam(sessionStorage.getItem(KEY));
    if (!kept || kept === 'clear') return;
    const root = document.documentElement.style;
    root.setProperty('--safe-top', `${kept.top}px`);
    root.setProperty('--safe-bottom', `${kept.bottom}px`);
  } catch {
    // Storage blocked: the real insets (none, on a desktop) stay.
  }
}
