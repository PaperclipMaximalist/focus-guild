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

import { useTimerStore } from './useTimerStore';

const s = () => useTimerStore.getState();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T10:00:00Z'));
  s().stop();
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
