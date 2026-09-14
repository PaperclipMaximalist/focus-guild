/**
 * Rank-driven theming.
 *
 * Each guild rank has a colour (see levels.ts). With rank theming on
 * (default), the rank badge and XP bar wear it, so levelling up is visible.
 *
 * It deliberately no longer re-skins the whole app's accent: at rank 1 that
 * turned every primary button slate grey, and a colour that shifts with your
 * XP can't also be the one reliable "do this" signal. The accent stays amber;
 * only `--color-rank` moves.
 */

const LS_KEY = 'fg:rank-theme';

// Matches --color-rank in index.css; used when rank theming is off.
const DEFAULT_RANK = '#8A8478';

function readBool(key: string, dflt: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? dflt : v === '1';
  } catch {
    return dflt;
  }
}

let enabled = readBool(LS_KEY, true);

type Listener = () => void;
const listeners = new Set<Listener>();
export function subscribeTheme(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function isRankThemeEnabled(): boolean { return enabled; }

// ─── apply ─────────────────────────────────────────────────────────────────────

/** Apply (or clear) the rank colour based on the current enabled flag. */
export function applyRankAccent(accent: string): void {
  document.documentElement.style.setProperty('--color-rank', enabled ? accent : DEFAULT_RANK);
}

let lastAccent = DEFAULT_RANK;
/** Remember the last rank accent so toggling re-applies the right colors. */
export function rememberAccent(accent: string): void { lastAccent = accent; }

export function setRankThemeEnabled(on: boolean): void {
  enabled = on;
  try { localStorage.setItem(LS_KEY, on ? '1' : '0'); } catch { /* ignore */ }
  applyRankAccent(lastAccent);
  listeners.forEach((l) => l());
}
