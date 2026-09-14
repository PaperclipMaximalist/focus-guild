/**
 * The rubber duck's brain: what it's saying, how it feels, and when to stay
 * quiet.
 *
 * A mascot that talks over everything is noise, and noise is the enemy for
 * an ADHD brain — so the duck rate-limits itself. Each event has a priority;
 * while a line is on screen, only something more important may interrupt it.
 * Tapping the duck always gets an answer, because you asked.
 *
 * Visibility persists per device. Turning the duck off silences every
 * `react()` call, so callers never need to check.
 */

import { create } from 'zustand';
import { MASCOT_EVENTS, pickLine, type MascotEvent, type MascotMood } from '../lib/mascotLines';

const ENABLED_KEY = 'fg:mascot-enabled';
/** How long a line stays up. Long enough to read, short enough to not nag. */
const SHOW_MS = 5200;

function readEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) !== '0';
  } catch {
    return true;
  }
}

interface MascotState {
  enabled: boolean;
  mood: MascotMood;
  message: string | null;
  /** Bumps on every reaction, so the duck can play its animation again. */
  beat: number;
  priority: number;
  react: (event: MascotEvent, n?: number) => void;
  dismiss: () => void;
  setEnabled: (on: boolean) => void;
}

let hideTimer: ReturnType<typeof setTimeout> | null = null;

export const useMascotStore = create<MascotState>((set, get) => ({
  enabled: readEnabled(),
  mood: 'idle',
  message: null,
  beat: 0,
  priority: 0,

  react: (event, n) => {
    const { enabled, message, priority } = get();
    if (!enabled) return;
    const spec = MASCOT_EVENTS[event];
    // Something is being said: only a more important event cuts in.
    if (message && spec.priority <= priority && event !== 'poke') return;

    set({
      mood: spec.mood,
      message: pickLine(event, n, message),
      beat: get().beat + 1,
      priority: spec.priority,
    });

    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      set({ message: null, priority: 0, mood: 'idle' });
    }, SHOW_MS);
  },

  dismiss: () => {
    if (hideTimer) clearTimeout(hideTimer);
    set({ message: null, priority: 0, mood: 'idle' });
  },

  setEnabled: (on) => {
    try {
      localStorage.setItem(ENABLED_KEY, on ? '1' : '0');
    } catch {
      // Non-fatal — the choice just won't survive a reload.
    }
    if (hideTimer) clearTimeout(hideTimer);
    set({ enabled: on, message: null, priority: 0, mood: 'idle' });
  },
}));

/** Fire-and-forget helper for code outside React (stores, handlers). */
export function duckReact(event: MascotEvent, n?: number): void {
  useMascotStore.getState().react(event, n);
}
