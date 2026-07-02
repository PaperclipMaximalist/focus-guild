/**
 * Rank-driven theming.
 *
 * Each guild rank has an accent color (see levels.ts). When rank theming is
 * on (default), the app's primary accent CSS variables shift to match the
 * user's current rank — so leveling up literally re-skins the app. This
 * turns the otherwise-decorative level accent into a tangible progression
 * reward.
 *
 * Toggleable + persisted; falls back to the static violet default.
 */

const LS_KEY = 'fg:rank-theme';

// The static defaults from index.css — restored when rank theming is off.
const DEFAULT_PRIMARY = '#8b5cf6';
const DEFAULT_PRIMARY_D = '#6d28d9';
const DEFAULT_BORDER = 'rgba(139, 92, 246, 0.18)';

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

// ─── color helpers ──────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Multiply toward black for the "dark" primary variant. */
function darken(hex: string, factor = 0.7): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r * factor, g * factor, b * factor);
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ─── apply ─────────────────────────────────────────────────────────────────────

function setVars(primary: string, primaryD: string, border: string): void {
  const root = document.documentElement;
  root.style.setProperty('--color-primary', primary);
  root.style.setProperty('--color-primary-d', primaryD);
  root.style.setProperty('--color-border', border);
}

/** Apply (or clear) the rank accent based on the current enabled flag. */
export function applyRankAccent(accent: string): void {
  if (enabled) {
    setVars(accent, darken(accent), rgba(accent, 0.18));
  } else {
    setVars(DEFAULT_PRIMARY, DEFAULT_PRIMARY_D, DEFAULT_BORDER);
  }
}

let lastAccent = DEFAULT_PRIMARY;
/** Remember the last rank accent so toggling re-applies the right colors. */
export function rememberAccent(accent: string): void { lastAccent = accent; }

export function setRankThemeEnabled(on: boolean): void {
  enabled = on;
  try { localStorage.setItem(LS_KEY, on ? '1' : '0'); } catch { /* ignore */ }
  applyRankAccent(lastAccent);
  listeners.forEach((l) => l());
}
