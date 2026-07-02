/**
 * Juice engine — synthesized sound effects + haptics.
 *
 * No audio assets: every sound is generated on the fly with the Web Audio
 * API, so the bundle stays tiny and the sounds are crisp at any volume.
 *
 * The AudioContext is created lazily on first use (browsers require a user
 * gesture before audio can play) and reused thereafter.
 *
 * Mute state persists to localStorage and is exposed via a tiny pub/sub so
 * UI toggles can reflect it without prop-drilling.
 */

const LS_KEY = 'fg:sfx-enabled';
const LS_HAPTIC_KEY = 'fg:haptics-enabled';

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;

function readBool(key: string, dflt: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? dflt : v === '1';
  } catch {
    return dflt;
  }
}

let sfxEnabled = readBool(LS_KEY, true);
let hapticsEnabled = readBool(LS_HAPTIC_KEY, true);

// ─── pub/sub so toggles re-render ──────────────────────────────────────────────
type Listener = () => void;
const listeners = new Set<Listener>();
function emit() { listeners.forEach((l) => l()); }
export function subscribeSfx(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function isSfxEnabled(): boolean { return sfxEnabled; }
export function isHapticsEnabled(): boolean { return hapticsEnabled; }

export function setSfxEnabled(on: boolean): void {
  sfxEnabled = on;
  try { localStorage.setItem(LS_KEY, on ? '1' : '0'); } catch { /* ignore */ }
  // Audible confirmation when turning ON.
  if (on) blip(660, 0.08, 'sine', 0.18);
  emit();
}
export function setHapticsEnabled(on: boolean): void {
  hapticsEnabled = on;
  try { localStorage.setItem(LS_HAPTIC_KEY, on ? '1' : '0'); } catch { /* ignore */ }
  emit();
}

// ─── core audio ────────────────────────────────────────────────────────────────

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    ctx = new AC();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.5;
    masterGain.connect(ctx.destination);
  }
  // Resume if suspended (autoplay policy).
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/**
 * Play a single tone. `decay` shapes a quick exponential fade so notes
 * never click. Safe to call when muted (no-ops).
 */
function blip(
  freq: number,
  durSec: number,
  type: OscillatorType = 'sine',
  gain = 0.25,
  startOffset = 0,
): void {
  if (!sfxEnabled) return;
  const audio = getCtx();
  if (!audio || !masterGain) return;
  const t0 = audio.currentTime + startOffset;
  const osc = audio.createOscillator();
  const g = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  // Tiny attack + exponential release for a pleasant pluck.
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + durSec);
  osc.connect(g);
  g.connect(masterGain);
  osc.start(t0);
  osc.stop(t0 + durSec + 0.02);
}

/** Play a sequence of [freq, atSec, durSec] notes — used for chords/arpeggios. */
function sequence(notes: Array<[number, number, number]>, type: OscillatorType = 'sine', gain = 0.22): void {
  for (const [freq, at, dur] of notes) blip(freq, dur, type, gain, at);
}

// ─── haptics ─────────────────────────────────────────────────────────────────

function vibrate(pattern: number | number[]): void {
  if (!hapticsEnabled) return;
  try {
    navigator.vibrate?.(pattern);
  } catch { /* unsupported */ }
}

// ─── named effects ─────────────────────────────────────────────────────────────

// Notes (Hz) — a pentatonic-ish palette so combinations always sound nice.
const C5 = 523.25, D5 = 587.33, E5 = 659.25, G5 = 783.99, A5 = 880, C6 = 1046.5, E6 = 1318.5, G6 = 1568;

/** Quest completed — a bright rising two-note "ding". */
export function sfxComplete(): void {
  sequence([[E5, 0, 0.12], [A5, 0.07, 0.18]], 'triangle', 0.28);
  vibrate(18);
}

/** XP earned — a soft tick. Use for incremental gains. */
export function sfxXp(): void {
  blip(G5, 0.07, 'sine', 0.16);
}

/** Achievement unlocked — sparkly ascending arpeggio. */
export function sfxAchievement(): void {
  sequence([[C5, 0, 0.1], [E5, 0.08, 0.1], [G5, 0.16, 0.1], [C6, 0.24, 0.22]], 'triangle', 0.24);
  vibrate([12, 30, 12]);
}

/** Level up — triumphant fanfare. */
export function sfxLevelUp(): void {
  sequence(
    [[C5, 0, 0.12], [E5, 0.1, 0.12], [G5, 0.2, 0.12], [C6, 0.3, 0.16], [E6, 0.4, 0.16], [G6, 0.5, 0.4]],
    'sawtooth',
    0.16,
  );
  // soft harmony layer
  sequence([[C5, 0.3, 0.5], [G5, 0.5, 0.5]], 'sine', 0.1);
  vibrate([20, 40, 20, 40, 60]);
}

/** Wheel spin — a quick whoosh-ish descending blip cluster. */
export function sfxSpin(): void {
  sequence([[G6, 0, 0.05], [E6, 0.05, 0.05], [C6, 0.1, 0.05], [G5, 0.15, 0.06]], 'square', 0.1);
}

/** Generic UI click / confirm. */
export function sfxClick(): void {
  blip(A5, 0.04, 'sine', 0.12);
  vibrate(8);
}

/** Timer started — calm low confirm. */
export function sfxStart(): void {
  sequence([[D5, 0, 0.1], [A5, 0.06, 0.14]], 'sine', 0.2);
  vibrate(12);
}
