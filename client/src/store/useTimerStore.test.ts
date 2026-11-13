/**
 * The timer's session survives a minimise; its screen is separate state.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// The test environment may not provide localStorage; the store persists the session there.
if (typeof globalThis.localStorage === 'undefined' || typeof globalThis.localStorage.getItem !== 'function') {
  const mem = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
  });
}

vi.mock('../native/notify', () => ({
  scheduleTimerEnd: vi.fn(() => Promise.resolve()),
  cancelTimerEnd: vi.fn(() => Promise.resolve()),
}));

import { useTimerStore } from './useTimerStore';
import { cancelTimerEnd, scheduleTimerEnd } from '../native/notify';

const s = () => useTimerStore.getState();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T10:00:00Z'));
  s().stop();
  vi.mocked(scheduleTimerEnd).mockClear();
  vi.mocked(cancelTimerEnd).mockClear();
});

describe('useTimerStore screen state', () => {
  it('start opens the screen', () => {
    s().start({ questId: 'q', questTitle: 'Quest', durationMin: 25 });
    expect(s().active?.questId).toBe('q');
    expect(s().open).toBe(true);
  });

  it('hide keeps the session and show reopens it', () => {
    s().start({ questId: 'q', questTitle: 'Quest', durationMin: 25 });
    s().hide();
    expect(s().open).toBe(false);
    expect(s().active).not.toBeNull();
    s().show();
    expect(s().open).toBe(true);
  });

  it('stop clears the session and closes the screen', () => {
    s().start({ questId: 'q', questTitle: 'Quest', durationMin: 25 });
    s().stop();
    expect(s().active).toBeNull();
    expect(s().open).toBe(false);
  });
});

describe('remainingMs', () => {
  it('counts down and goes negative past the end', () => {
    s().start({ questId: 'q', questTitle: 'Quest', durationMin: 10 });
    vi.advanceTimersByTime(4 * 60_000);
    expect(s().remainingMs()).toBe(6 * 60_000);
    vi.advanceTimersByTime(8 * 60_000);
    expect(s().remainingMs()).toBe(-2 * 60_000);
  });

  it('ignores time spent paused', () => {
    s().start({ questId: 'q', questTitle: 'Quest', durationMin: 10 });
    vi.advanceTimersByTime(3 * 60_000);
    s().pause();
    vi.advanceTimersByTime(30 * 60_000);
    expect(s().remainingMs()).toBe(7 * 60_000); // frozen while paused
    s().resume();
    expect(s().remainingMs()).toBe(7 * 60_000);
    vi.advanceTimersByTime(60_000);
    expect(s().remainingMs()).toBe(6 * 60_000);
  });
});

const T0 = new Date('2026-01-01T10:00:00Z').getTime();

describe('time\'s-up notification', () => {
  it('start schedules for now + duration', () => {
    s().start({ questId: 'q', questTitle: 'Write', durationMin: 25 });
    expect(scheduleTimerEnd).toHaveBeenCalledTimes(1);
    expect(scheduleTimerEnd).toHaveBeenCalledWith({
      questTitle: 'Write',
      durationMin: 25,
      endsAt: new Date(T0 + 25 * 60_000),
      askPermission: true,
    });
  });

  it('pause cancels', () => {
    s().start({ questId: 'q', questTitle: 'Write', durationMin: 25 });
    vi.mocked(cancelTimerEnd).mockClear();
    s().pause();
    expect(cancelTimerEnd).toHaveBeenCalledTimes(1);
  });

  it('resume reschedules with the time that was left', () => {
    s().start({ questId: 'q', questTitle: 'Write', durationMin: 25 });
    vi.advanceTimersByTime(10 * 60_000);
    s().pause();
    vi.advanceTimersByTime(60 * 60_000);
    vi.mocked(scheduleTimerEnd).mockClear();
    s().resume();
    expect(scheduleTimerEnd).toHaveBeenCalledTimes(1);
    expect(vi.mocked(scheduleTimerEnd).mock.calls[0][0].endsAt).toEqual(new Date(Date.now() + 15 * 60_000));
  });

  it('stop cancels', () => {
    s().start({ questId: 'q', questTitle: 'Write', durationMin: 25 });
    vi.mocked(cancelTimerEnd).mockClear();
    s().stop();
    expect(cancelTimerEnd).toHaveBeenCalledTimes(1);
  });

  const base = { questId: 'q', questTitle: 'Write', durationMin: 25, pausedAt: null, pausedTotalMs: 0 };

  /** Loads a fresh copy of the store with `session` already in storage, as at app launch. */
  async function launchWith(session: object) {
    localStorage.setItem('focusGuild.activeSession', JSON.stringify(session));
    vi.resetModules();
    const notify = await import('../native/notify');
    await import('./useTimerStore');
    return notify;
  }

  it('a restored running session reschedules for its end, without asking permission', async () => {
    const notify = await launchWith({ ...base, startedAt: T0 - 5 * 60_000 });
    expect(notify.scheduleTimerEnd).toHaveBeenCalledTimes(1);
    expect(notify.scheduleTimerEnd).toHaveBeenCalledWith({
      questTitle: 'Write',
      durationMin: 25,
      endsAt: new Date(T0 + 20 * 60_000),
      askPermission: false,
    });
  });

  it('a restored session that already ended schedules nothing', async () => {
    const notify = await launchWith({ ...base, startedAt: T0 - 30 * 60_000 });
    expect(notify.scheduleTimerEnd).not.toHaveBeenCalled();
  });

  it('a restored paused session schedules nothing', async () => {
    const notify = await launchWith({ ...base, startedAt: T0 - 5 * 60_000, pausedAt: T0 - 60_000 });
    expect(notify.scheduleTimerEnd).not.toHaveBeenCalled();
  });
});
