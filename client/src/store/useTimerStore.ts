/**
 * Focus Timer store.
 *
 * Tracks a single active focus session:
 *   - questId / questTitle / durationMin — what to work on
 *   - startedAt — when the session began
 *   - paused — true if user clicked pause
 *
 * The UI countdown is computed from `startedAt` + accumulated paused time,
 * so a page refresh doesn't break the timer (we persist active session to
 * localStorage).
 */

import { create } from 'zustand';

interface ActiveSession {
  questId: string;
  questTitle: string;
  durationMin: number;
  startedAt: number; // ms-epoch
  pausedAt: number | null; // ms-epoch when paused; null when running
  /** Cumulative paused milliseconds, applied as offset to expected-end. */
  pausedTotalMs: number;
}

interface TimerState {
  active: ActiveSession | null;
  start: (input: { questId: string; questTitle: string; durationMin: number }) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  /** Returns ms until end, accounting for pauses. Negative if past end. */
  remainingMs: () => number;
}

const STORAGE_KEY = 'focusGuild.activeSession';

function loadFromStorage(): ActiveSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ActiveSession;
  } catch {
    return null;
  }
}

function saveToStorage(session: ActiveSession | null) {
  if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  else localStorage.removeItem(STORAGE_KEY);
}

export const useTimerStore = create<TimerState>((set, get) => ({
  active: loadFromStorage(),

  start: (input) => {
    const session: ActiveSession = {
      questId: input.questId,
      questTitle: input.questTitle,
      durationMin: input.durationMin,
      startedAt: Date.now(),
      pausedAt: null,
      pausedTotalMs: 0,
    };
    saveToStorage(session);
    set({ active: session });
  },

  pause: () => {
    const s = get().active;
    if (!s || s.pausedAt !== null) return;
    const next = { ...s, pausedAt: Date.now() };
    saveToStorage(next);
    set({ active: next });
  },

  resume: () => {
    const s = get().active;
    if (!s || s.pausedAt === null) return;
    const pausedMs = Date.now() - s.pausedAt;
    const next = {
      ...s,
      pausedAt: null,
      pausedTotalMs: s.pausedTotalMs + pausedMs,
    };
    saveToStorage(next);
    set({ active: next });
  },

  stop: () => {
    saveToStorage(null);
    set({ active: null });
  },

  remainingMs: () => {
    const s = get().active;
    if (!s) return 0;
    const expectedEnd = s.startedAt + s.durationMin * 60_000 + s.pausedTotalMs;
    const effectiveNow = s.pausedAt ?? Date.now();
    return expectedEnd - effectiveNow;
  },
}));
