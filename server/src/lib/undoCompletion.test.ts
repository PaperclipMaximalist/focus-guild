import { describe, expect, it } from 'vitest';
import {
  UNDO_WINDOW_MS,
  fallbackStatus,
  planUndo,
  readReceipt,
  type CompletionReceipt,
  type UndoInput,
} from './undoCompletion.js';

const T0 = new Date('2026-11-11T18:00:00Z').getTime();
const at = (ms: number) => new Date(T0 + ms);

function receipt(over: Partial<CompletionReceipt> = {}): CompletionReceipt {
  return {
    v: 1,
    kind: 'quest',
    at: at(0).toISOString(),
    priorStatus: 'RESCUE',
    priorStreak: 3,
    priorMultiplier: 1.64,
    xpEventId: 'ev1',
    xp: 12,
    closedSteps: [{ id: 's2', status: 'ACTIVE' }],
    unlocked: [{ slug: 'first-quest', achievementId: 'a1', xpReward: 25 }],
    achievementEventIds: ['ev2'],
    ...over,
  };
}

function input(over: Partial<UndoInput> = {}): UndoInput {
  return {
    kind: 'quest',
    now: T0 + 60_000,
    totalXP: 100,
    quest: { status: 'COMPLETE', completedAt: at(0), deadline: null },
    tick: null,
    receipt: receipt(),
    receiptEvent: { id: 'ev1', amount: 12, createdAt: at(0) },
    fallbackEvent: null,
    eventsSince: [
      { id: 'ev1', createdAt: at(0) },
      { id: 'ev2', createdAt: at(5) },
    ],
    ...over,
  };
}

describe('readReceipt', () => {
  it('reads a receipt from an entry’s data', () => {
    expect(readReceipt({ xp: 12, receipt: receipt() })?.xpEventId).toBe('ev1');
  });
  it('is null for an entry from before receipts, or a malformed one', () => {
    expect(readReceipt({ xp: 12, estimatedMinutes: 30 })).toBeNull();
    expect(readReceipt(null)).toBeNull();
    expect(readReceipt({ receipt: { ...receipt(), v: 2 } })).toBeNull();
    expect(readReceipt({ receipt: { ...receipt(), priorStatus: 'COMPLETE' } })).toBeNull();
    expect(readReceipt({ receipt: { ...receipt(), kind: 'round' } })).toBeNull(); // no tick id
  });
});

describe('planUndo: plain quests', () => {
  it('puts back everything the receipt names', () => {
    const d = planUndo(input());
    expect(d).toEqual({
      ok: true,
      plan: {
        partial: false,
        questStatus: 'RESCUE',
        reopenSteps: [{ id: 's2', status: 'ACTIVE' }],
        ownEventId: 'ev1',
        achievementEventIds: ['ev2'],
        xpBack: 37,
        streak: { currentStreak: 3, multiplier: 1.64 },
        relock: [{ slug: 'first-quest', achievementId: 'a1' }],
        deleteTickId: null,
        restoreStale: null,
      },
    });
  });

  it('refuses a quest that is not complete', () => {
    expect(planUndo(input({ quest: { status: 'ACTIVE', completedAt: null, deadline: null } }))).toEqual({
      ok: false,
      code: 'NOT_COMPLETE',
    });
  });

  it('is open for ten minutes, and no longer', () => {
    expect(planUndo(input({ now: T0 + UNDO_WINDOW_MS })).ok).toBe(true);
    expect(planUndo(input({ now: T0 + UNDO_WINDOW_MS + 1 }))).toEqual({ ok: false, code: 'TOO_LATE' });
  });

  it('refuses when something earned XP since: the receipt’s "before" is no longer true', () => {
    const d = planUndo(input({ eventsSince: [...input().eventsSince, { id: 'other', createdAt: at(30_000) }] }));
    expect(d).toEqual({ ok: false, code: 'SUPERSEDED' });
  });

  it('a spent receipt (its event gone) with no other trace undoes the status only, flagged partial', () => {
    const d = planUndo(input({ receiptEvent: null }));
    expect(d.ok && d.plan).toMatchObject({ partial: true, questStatus: 'ACTIVE', ownEventId: null, xpBack: 0, streak: null, relock: [] });
  });

  it('without a receipt: the status, the XP event and its amount; streak and trophies stay', () => {
    const d = planUndo(
      input({
        receipt: null,
        receiptEvent: null,
        fallbackEvent: { id: 'ev9', amount: 9, createdAt: at(0) },
        quest: { status: 'COMPLETE', completedAt: at(0), deadline: at(-86_400_000) },
      }),
    );
    expect(d.ok && d.plan).toMatchObject({
      partial: true,
      questStatus: 'RESCUE',
      reopenSteps: [],
      ownEventId: 'ev9',
      xpBack: 9,
      streak: null,
      relock: [],
      achievementEventIds: [],
    });
  });

  it('never takes the total below zero', () => {
    const d = planUndo(input({ totalXP: 20 }));
    expect(d.ok && d.plan.xpBack).toBe(20);
  });
});

describe('planUndo: rounds', () => {
  const tick = { id: 't1', createdAt: at(0), xpAwarded: 8, isToday: true };
  const roundReceipt = receipt({
    kind: 'round',
    priorStatus: 'ACTIVE',
    closedSteps: [],
    unlocked: [],
    achievementEventIds: [],
    xp: 8,
    roundCompletionId: 't1',
    replacedStale: { date: '2026-11-11T00:00:00.000Z', createdAt: '2026-11-11T02:00:00.000Z', xpAwarded: 5 },
  });
  const round = (over: Partial<UndoInput> = {}) =>
    input({ kind: 'round', tick, receipt: roundReceipt, eventsSince: [{ id: 'ev1', createdAt: at(0) }], ...over });

  it('deletes today’s tick and puts back the older row it replaced', () => {
    const d = planUndo(round());
    expect(d.ok && d.plan).toMatchObject({
      partial: false,
      questStatus: undefined,
      deleteTickId: 't1',
      xpBack: 8,
      restoreStale: { date: new Date('2026-11-11T00:00:00.000Z'), xpAwarded: 5 },
    });
  });

  it('nothing ticked: NOT_COMPLETE; a tick from earlier today: TOO_LATE; from another day: NOT_COMPLETE', () => {
    expect(planUndo(round({ tick: null }))).toEqual({ ok: false, code: 'NOT_COMPLETE' });
    expect(planUndo(round({ now: T0 + UNDO_WINDOW_MS + 1 }))).toEqual({ ok: false, code: 'TOO_LATE' });
    expect(planUndo(round({ now: T0 + UNDO_WINDOW_MS + 1, tick: { ...tick, isToday: false } }))).toEqual({
      ok: false,
      code: 'NOT_COMPLETE',
    });
  });

  it('a receipt for another tick does not count: partial, with the tick’s own XP', () => {
    const d = planUndo(round({ receipt: { ...roundReceipt, roundCompletionId: 'old' } }));
    expect(d.ok && d.plan).toMatchObject({ partial: true, deleteTickId: 't1', xpBack: 8, streak: null });
  });
});

describe('fallbackStatus', () => {
  it('is a straggler when the deadline has passed, active otherwise', () => {
    expect(fallbackStatus(at(-1), T0)).toBe('RESCUE');
    expect(fallbackStatus(at(1), T0)).toBe('ACTIVE');
    expect(fallbackStatus(null, T0)).toBe('ACTIVE');
  });
});
