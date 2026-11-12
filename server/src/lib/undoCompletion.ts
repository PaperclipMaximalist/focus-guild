/**
 * Undo for a mistaken tick: what a completion has to remember so it can be
 * taken back, and the decision of what taking it back means.
 *
 * A tick completes a quest at once (XP, streak, trophies), and a mis-tap on a
 * phone's row of tick circles is easy. The app's rule is "never ask
 * are-you-sure; do it and offer Undo", so a completion leaves a RECEIPT: the
 * values it replaced and the rows it wrote. There is no table for it: it rides
 * in the `data` of the activity-log entry the completion writes anyway
 * (`quest.completed` / `quest.daily`), under `receipt`.
 *
 * Rules:
 * - Only a fresh completion can be taken back: within UNDO_WINDOW_MS.
 * - A receipt is spent once its XP event is gone (the undo deletes it), so a
 *   second Undo finds nothing to undo. The log itself stays append-only: the
 *   undo adds a `quest.uncompleted` entry naming the receipt it used.
 * - If anything has earned or moved XP since (another completion, a round,
 *   hours on an hour log), the "before" values in the receipt are no longer
 *   the right ones to put back: the undo is refused (SUPERSEDED) rather than
 *   guessing. Undoing the later one first makes this one undoable again.
 * - With no receipt (its write failed, or the completion predates receipts)
 *   only what is certain is reversed: the quest's status, its XP event and
 *   that event's amount. Streak and trophies are left alone and the result
 *   says `partial`.
 *
 * Nothing here touches the database, so it is tested directly.
 */

export const UNDO_WINDOW_MS = 10 * 60_000;

export type QuestStatus = 'ACTIVE' | 'COMPLETE' | 'NOT_TODAY' | 'RESCUE';
const OPEN_STATUSES: readonly QuestStatus[] = ['ACTIVE', 'NOT_TODAY', 'RESCUE'];

export interface CompletionReceipt {
  v: 1;
  kind: 'quest' | 'round';
  /** When the completion happened (ISO). */
  at: string;
  /** The quest's status before the tick: ACTIVE, NOT_TODAY, or RESCUE (a straggler). Rounds stay ACTIVE. */
  priorStatus: QuestStatus;
  priorStreak: number;
  priorMultiplier: number;
  /** The completion's own XP event, and its amount. */
  xpEventId: string;
  xp: number;
  /** Open steps this completion closed with their parent, and the status each had. */
  closedSteps: Array<{ id: string; status: QuestStatus }>;
  /** Trophies this completion unlocked, with the XP each added. */
  unlocked: Array<{ slug: string; achievementId: string; xpReward: number }>;
  /** The trophies' bonus XP events. */
  achievementEventIds: string[];
  /** Rounds: the tick row written, and an older row it replaced (kept to put back). */
  roundCompletionId?: string;
  replacedStale?: { date: string; createdAt: string; xpAwarded: number } | null;
}

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isOpen = (v: unknown): v is QuestStatus => OPEN_STATUSES.includes(v as QuestStatus);

/** The receipt in an activity entry's `data`, or null when it has none (or a malformed one). */
export function readReceipt(data: unknown): CompletionReceipt | null {
  const r = (data as { receipt?: unknown } | null)?.receipt as Record<string, unknown> | undefined;
  if (!r || typeof r !== 'object' || r['v'] !== 1) return null;
  if (r['kind'] !== 'quest' && r['kind'] !== 'round') return null;
  if (!isStr(r['at']) || !isStr(r['xpEventId']) || !isNum(r['xp'])) return null;
  if (!isOpen(r['priorStatus']) || !isNum(r['priorStreak']) || !isNum(r['priorMultiplier'])) return null;
  const steps = r['closedSteps'];
  const unlocked = r['unlocked'];
  const events = r['achievementEventIds'];
  if (!Array.isArray(steps) || !steps.every((s) => isStr(s?.id) && isOpen(s?.status))) return null;
  if (!Array.isArray(unlocked) || !unlocked.every((u) => isStr(u?.slug) && isStr(u?.achievementId) && isNum(u?.xpReward))) {
    return null;
  }
  if (!Array.isArray(events) || !events.every(isStr)) return null;
  if (r['kind'] === 'round' && !isStr(r['roundCompletionId'])) return null;
  return r as unknown as CompletionReceipt;
}

export interface XPEventRow {
  id: string;
  amount: number;
  createdAt: Date;
}

export interface UndoInput {
  kind: 'quest' | 'round';
  now: number;
  /** The member's XP total now (an undo never takes it below zero). */
  totalXP: number;
  /** Plain quests: the quest as it is now. */
  quest: { status: QuestStatus; completedAt: Date | null; deadline: Date | null };
  /** Rounds: the most recent tick of this round, and whether it falls within the member's day. */
  tick?: { id: string; createdAt: Date; xpAwarded: number; isToday: boolean } | null;
  /** The newest receipt logged for this quest, if any. */
  receipt: CompletionReceipt | null;
  /** The receipt's XP event as it is now; null once it has been undone. */
  receiptEvent: XPEventRow | null;
  /** No receipt to go on: the completion's own XP event, found by quest and reason. */
  fallbackEvent: XPEventRow | null;
  /** The member's XP events from the completion's time on (the route reads them; ours are filtered out here). */
  eventsSince: Array<{ id: string; createdAt: Date }>;
}

export type UndoRefusal = 'NOT_COMPLETE' | 'TOO_LATE' | 'SUPERSEDED';

export interface UndoPlan {
  partial: boolean;
  /** Plain quests: the status to put back. Rounds: undefined (they stay ACTIVE). */
  questStatus?: QuestStatus;
  /** Steps to reopen, grouped by the status to give back. */
  reopenSteps: Array<{ id: string; status: QuestStatus }>;
  /** The completion's own XP event (deleted strictly: gone already means someone else undid it). */
  ownEventId: string | null;
  /** The trophies' bonus XP events. */
  achievementEventIds: string[];
  /** Taken off the total: the completion's XP plus its trophies'. */
  xpBack: number;
  /** Put back; null leaves streak and multiplier as they are. */
  streak: { currentStreak: number; multiplier: number } | null;
  relock: Array<{ slug: string; achievementId: string }>;
  /** Rounds: the tick row to delete, and an older row to put back in its place. */
  deleteTickId: string | null;
  restoreStale: { date: Date; createdAt: Date; xpAwarded: number } | null;
}

export type UndoDecision = { ok: false; code: UndoRefusal } | { ok: true; plan: UndoPlan };

const refuse = (code: UndoRefusal): UndoDecision => ({ ok: false, code });

/**
 * Where a quest goes when its completion is taken back without a receipt:
 * a straggler (overdue, not a round) if its deadline has passed, as the
 * Stragglers page would mark it on its next read, and ACTIVE otherwise.
 */
export function fallbackStatus(deadline: Date | null, now: number): QuestStatus {
  return deadline && deadline.getTime() < now ? 'RESCUE' : 'ACTIVE';
}

export function planUndo(input: UndoInput): UndoDecision {
  const { kind, now } = input;

  // Is there a completion at all, and is it fresh?
  let completedAt: Date;
  if (kind === 'quest') {
    if (input.quest.status !== 'COMPLETE') return refuse('NOT_COMPLETE');
    completedAt = input.quest.completedAt ?? new Date(0);
  } else {
    const tick = input.tick;
    if (!tick) return refuse('NOT_COMPLETE');
    const fresh = now - tick.createdAt.getTime() <= UNDO_WINDOW_MS;
    // A tick from an earlier day is not "this round is complete" any more.
    if (!fresh) return refuse(tick.isToday ? 'TOO_LATE' : 'NOT_COMPLETE');
    completedAt = tick.createdAt;
  }
  if (now - completedAt.getTime() > UNDO_WINDOW_MS) return refuse('TOO_LATE');

  // The receipt counts only while its XP event stands (an undo deletes it)
  // and, for a round, only when it belongs to the tick being taken back.
  const r = input.receipt;
  const receiptLive =
    r !== null &&
    r.kind === kind &&
    input.receiptEvent !== null &&
    input.receiptEvent.id === r.xpEventId &&
    (kind === 'quest' || r.roundCompletionId === input.tick?.id);

  const deleteTickId = kind === 'round' ? input.tick!.id : null;

  if (receiptLive) {
    const own = new Set([r.xpEventId, ...r.achievementEventIds]);
    const since = input.receiptEvent!.createdAt.getTime();
    const later = input.eventsSince.some((e) => !own.has(e.id) && e.createdAt.getTime() >= since);
    if (later) return refuse('SUPERSEDED');

    const xpBack = r.xp + r.unlocked.reduce((s, u) => s + u.xpReward, 0);
    return {
      ok: true,
      plan: {
        partial: false,
        questStatus: kind === 'quest' ? r.priorStatus : undefined,
        reopenSteps: r.closedSteps,
        ownEventId: r.xpEventId,
        achievementEventIds: r.achievementEventIds,
        xpBack: Math.max(0, Math.min(xpBack, input.totalXP)),
        streak: { currentStreak: r.priorStreak, multiplier: r.priorMultiplier },
        relock: r.unlocked.map(({ slug, achievementId }) => ({ slug, achievementId })),
        deleteTickId,
        restoreStale:
          kind === 'round' && r.replacedStale
            ? {
                date: new Date(r.replacedStale.date),
                createdAt: new Date(r.replacedStale.createdAt),
                xpAwarded: r.replacedStale.xpAwarded,
              }
            : null,
      },
    };
  }

  // No receipt: only what is certain. A round's tick row records the XP it
  // paid (written in the same transaction as the event), so that amount is
  // known even when the event cannot be found.
  const ev = input.fallbackEvent;
  const amount = ev ? ev.amount : kind === 'round' ? input.tick!.xpAwarded : 0;
  return {
    ok: true,
    plan: {
      partial: true,
      questStatus: kind === 'quest' ? fallbackStatus(input.quest.deadline, now) : undefined,
      reopenSteps: [],
      ownEventId: ev?.id ?? null,
      achievementEventIds: [],
      xpBack: Math.max(0, Math.min(amount, input.totalXP)),
      streak: null,
      relock: [],
      deleteTickId,
      restoreStale: null,
    },
  };
}
