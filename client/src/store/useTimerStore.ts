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
import { cancelTimerEnd, scheduleTimerEnd } from '../native/notify';

interface ActiveSession {
  questId: string;
  questTitle: string;
  durationMin: number;
  startedAt: number; // ms-epoch
  pausedAt: number | null; // ms-epoch when paused; null when running
  /** Cumulative paused milliseconds, applied as offset to expected-end. */
  pausedTotalMs: number;
  /**
   * The quest is a round (repeats). Kept with the session because the timer can
   * be finished from any page, including ones that never loaded the rounds, and
   * a round finished through the ordinary route would be closed for good.
   */
  daily?: boolean;
}

interface TimerState {
  active: ActiveSession | null;
  /** Whether the timer's screen is showing. Never persisted: after a reload the session runs and the screen is closed. */
  open: boolean;
  show: () => void;
  hide: () => void;
  start: (input: { questId: string; questTitle: string; durationMin: number; daily?: boolean }) => void;
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

/** Milliseconds until the session ends, as of `now` (the pause clock if paused). */
function msLeft(s: ActiveSession, now: number): number {
  return s.startedAt + s.durationMin * 60_000 + s.pausedTotalMs - (s.pausedAt ?? now);
}

/** Tells the "time's up" notification when this session ends. A no-op on the website. */
function scheduleEnd(s: ActiveSession, askPermission = true) {
  const now = Date.now();
  void scheduleTimerEnd({
    questTitle: s.questTitle,
    durationMin: s.durationMin,
    endsAt: new Date(now + msLeft(s, now)),
    askPermission,
  });
}

export const useTimerStore = create<TimerState>((set, get) => ({
  active: loadFromStorage(),
  open: false,

  show: () => set({ open: true }),
  hide: () => set({ open: false }),

  start: (input) => {
    const session: ActiveSession = {
      questId: input.questId,
      questTitle: input.questTitle,
      durationMin: input.durationMin,
      daily: input.daily ?? false,
      startedAt: Date.now(),
      pausedAt: null,
      pausedTotalMs: 0,
    };
    saveToStorage(session);
    set({ active: session, open: true });
    scheduleEnd(session);
  },

  pause: () => {
    const s = get().active;
    if (!s || s.pausedAt !== null) return;
    const next = { ...s, pausedAt: Date.now() };
    saveToStorage(next);
    set({ active: next });
    void cancelTimerEnd();
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
    scheduleEnd(next);
  },

  stop: () => {
    saveToStorage(null);
    set({ active: null, open: false });
    void cancelTimerEnd();
  },

  remainingMs: () => {
    const s = get().active;
    if (!s) return 0;
    const expectedEnd = s.startedAt + s.durationMin * 60_000 + s.pausedTotalMs;
    const effectiveNow = s.pausedAt ?? Date.now();
    return expectedEnd - effectiveNow;
  },
}));

// A session restored from storage that is still running: make sure the notification is set for its end
// (the same id, so scheduling again is harmless). One that ended while the app was closed schedules nothing.
// Never shows the permission prompt here: that is asked when a timer is started.
{
  const restored = useTimerStore.getState().active;
  if (restored && restored.pausedAt === null && msLeft(restored, Date.now()) > 0) scheduleEnd(restored, false);
}
