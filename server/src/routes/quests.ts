import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/client.js';
import { computePriorityScore } from '../lib/priority.js';
import { computeXP } from '../lib/xp.js';
import { updateStreak, computeMultiplier } from '../lib/streak.js';
import { AI_ENABLED, AI_MODEL, getClient } from '../lib/ai.js';
import { logActivity } from '../lib/activity.js';
import { reviveDeferred } from '../lib/deferral.js';
import { getUserConfig } from '../lib/userConfig.js';
import { evalAndUnlockAchievements } from '../lib/evalAndUnlock.js';
import {
  MAX_QUEST_DEPTH,
  buildTree,
  depthOf,
  descendantIds,
  moveProblem,
  parentChoices,
  parentIds,
  rollupsByRoot,
  type QuestNodeRow,
} from '../lib/questTree.js';
import {
  FOCUS_KIND,
  HOURS_KIND,
  LogHoursSchema,
  entryInstant,
  hourTotals,
  hoursLine,
  isOpenEnded,
  localDay,
  minutesOf,
  weekStart,
} from '../lib/hourLog.js';
import type { Quest, User } from '../../generated/prisma/client.js';

export const quests = new Hono();

// ─── Validation schemas ───────────────────────────────────────────────────────

const SchedulerHintsSchema = {
  tediousness: z.number().min(0).max(1).nullable().optional(),
  category: z.string().nullable().optional(),
  preferredHour: z.number().int().min(0).max(23).nullable().optional(),
  minChunkMin: z.number().int().min(5).max(480).nullable().optional(),
  maxChunkMin: z.number().int().min(5).max(480).nullable().optional(),
  setupCost: z.number().min(0).max(1).nullable().optional(),
  urgencyMult: z.number().min(0).max(5).nullable().optional(),
  isRecurring: z.boolean().optional(),
  priorityTier: z.enum(['HIGH', 'MED', 'LOW']).optional(),
};

const CreateQuestSchema = z.object({
  // clerkId is accepted for legacy clients but ignored — auth comes from middleware.
  clerkId: z.string().optional(),
  title: z.string().min(1).max(280),
  estimatedMinutes: z.number().int().min(1).optional().default(30),
  mentalLoad: z.number().int().min(1).max(10).optional().default(5),
  impact: z.number().int().min(1).max(10).optional().default(5),
  deadline: z.string().datetime({ offset: true }).nullable().optional(),
  parentQuestId: z.string().optional(),
  /** An hour log: no estimate, time is written down as it is spent (lib/hourLog.ts). */
  openEnded: z.boolean().optional(),
  tags: z.array(z.string()).optional().default([]),
  ...SchedulerHintsSchema,
});

/**
 * Bulk import. The client parses each pasted line with the same quick-add
 * grammar the Today bar uses and sends the result here, so the preview it
 * showed and what gets created cannot disagree.
 *
 * Capped, and written in one transaction: a half-finished import of 40
 * quests would be worse than a clean failure. (A bulk import shipped in May
 * once wedged production; this one is all-or-nothing and covered by tests.)
 */
const ImportQuestsSchema = z.object({
  quests: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(280),
        estimatedMinutes: z.number().int().min(1).max(1440).optional(),
        deadline: z.string().datetime({ offset: true }).nullable().optional(),
        priorityTier: z.enum(['LOW', 'MED', 'HIGH']).optional(),
        tags: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
      }),
    )
    .min(1)
    .max(100),
});

const UpdateQuestSchema = z.object({
  title: z.string().min(1).max(280).optional(),
  estimatedMinutes: z.number().int().min(1).optional(),
  mentalLoad: z.number().int().min(1).max(10).optional(),
  impact: z.number().int().min(1).max(10).optional(),
  deadline: z.string().datetime({ offset: true }).nullable().optional(),
  tags: z.array(z.string()).optional(),
  /** File the quest under another (a step of it), or null to make it a main quest. */
  parentQuestId: z.string().nullable().optional(),
  /** Turn a quest into an hour log, or an hour log back into a quest. */
  openEnded: z.boolean().optional(),
  ...SchedulerHintsSchema,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function enrichWithScore(
  quest: {
    id: string;
    estimatedMinutes: number;
    mentalLoad: number;
    impact: number;
    deadline: Date | null;
  },
  availableMinutes: number,
  energyLevel: number,
) {
  const now = new Date();
  const daysUntilDue = quest.deadline
    ? Math.ceil((quest.deadline.getTime() - now.getTime()) / 86_400_000)
    : null;

  const { score } = computePriorityScore({
    daysUntilDue,
    estimatedMinutes: quest.estimatedMinutes,
    availableMinutes,
    mentalLoad: quest.mentalLoad,
    impact: quest.impact,
    energyLevel,
  });

  return { ...quest, priorityScore: score };
}

/**
 * Every quest the user owns, trimmed to the columns the nesting math reads.
 * One query serves a whole page of rows: rollups walk the forest in memory
 * rather than asking the database once per quest.
 */
function questTreeRows(userId: string): Promise<QuestNodeRow[]> {
  return db.quest.findMany({
    where: { userId },
    select: { id: true, parentQuestId: true, status: true, estimatedMinutes: true },
    orderBy: { createdAt: 'asc' },
  });
}

const notFound = (message = 'Quest not found') =>
  ({ success: false as const, error: { code: 'NOT_FOUND', message } });
const refused = (code: string, message: string) => ({ success: false as const, error: { code, message } });

const MOVE_MESSAGE = {
  NOT_FOUND: 'That quest is not there any more.',
  SELF: 'A quest cannot be a step of itself.',
  CYCLE: 'That is one of its own steps.',
  TOO_DEEP: `Sub-quests go ${MAX_QUEST_DEPTH} tiers deep, and this would make a fourth.`,
} as const;

/**
 * Write time against a quest: the total on the quest, one line in the log.
 *
 * On an hour log the time is the whole point and there is no completion to
 * wait for, so it earns XP as it is written down (and, when it is today's,
 * keeps the streak). On an ordinary quest it is progress only; the XP comes
 * when the quest is completed, as before.
 */
async function logTime(
  user: User,
  quest: Quest,
  opts: { minutes: number; note?: string; at: Date; kind: string; isToday: boolean },
) {
  const { minutes, note, at, kind, isToday } = opts;
  const earns = isOpenEnded(quest);

  let streak = { newStreak: user.currentStreak, newMultiplier: user.multiplier, event: 'unchanged' as string };
  if (earns && isToday) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const lastActivity = await db.xPEvent.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    streak = updateStreak({
      currentStreak: user.currentStreak,
      lastActivityDate: lastActivity?.createdAt ?? null,
      today,
      completedQuestToday: true,
    });
  }
  const xp = earns
    ? computeXP({
        estimatedMinutes: minutes,
        mentalLoad: quest.mentalLoad,
        timePressure: 0,
        streakMultiplier: streak.newMultiplier,
      }).xp
    : 0;

  const line =
    kind === HOURS_KIND ? hoursLine(quest.title, minutes, note) : `Focused ${minutes} min on "${quest.title}"`;

  const [updatedQuest, entry, updatedUser] = await db.$transaction([
    db.quest.update({ where: { id: quest.id }, data: { actualMinutes: { increment: minutes } } }),
    db.activityEntry.create({
      data: {
        userId: user.id,
        kind,
        at,
        line: line.slice(0, 500),
        subjectId: quest.id,
        data: { minutes, xp, title: quest.title, ...(note ? { note } : {}) },
      },
    }),
    db.user.update({
      where: { id: user.id },
      data: { totalXP: { increment: xp }, currentStreak: streak.newStreak, multiplier: streak.newMultiplier },
    }),
    ...(xp > 0
      ? [db.xPEvent.create({ data: { userId: user.id, questId: quest.id, amount: xp, reason: 'hours_logged' } })]
      : []),
  ]);

  return {
    quest: updatedQuest,
    entry,
    xpAwarded: xp,
    totalXP: updatedUser.totalXP,
    newStreak: streak.newStreak,
    newMultiplier: streak.newMultiplier,
  };
}

/** One row of a quest's time list, as the client shows it. */
function timeEntry(e: { id: string; at: Date; kind: string; data: unknown }) {
  const note = (e.data as { note?: unknown } | null)?.note;
  return {
    id: e.id,
    at: e.at,
    minutes: minutesOf(e.data),
    note: typeof note === 'string' ? note : null,
    /** Written by hand, or left by the focus timer. */
    source: e.kind === HOURS_KIND ? ('hand' as const) : ('timer' as const),
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /quests — active quests sorted by priority score
quests.get('/', async (c) => {
  const user = c.get('user');

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const checkIn = await db.dailyCheckIn.findUnique({
    where: { userId_date: { userId: user.id, date: today } },
  });

  const availableMinutes = checkIn?.availableMinutes ?? 480;
  const energyLevel = checkIn?.energyLevel ?? 3;

  // "Not Today" lasts until the user's local midnight, then the quest is back
  // (until their session ends, for working hours that run past midnight).
  const tz = Number(c.req.query('tz'));
  await reviveDeferred(user.id, Number.isFinite(tz) ? tz : undefined, Date.now(), getUserConfig(user).workingHours);

  // Non-recurring active quests only — recurring are surfaced via /quests/recurring,
  // and hour logs (no estimate, nothing to prioritise) via /quests/hours.
  const activeQuests = await db.quest.findMany({
    where: {
      userId: user.id,
      status: 'ACTIVE',
      parentQuestId: null,
      isRecurring: false,
      estimatedMinutes: { gt: 0 },
    },
    orderBy: { createdAt: 'asc' },
  });

  // Progress on a row is the whole subtree, not the first tier: a main quest
  // broken into steps that have sub-steps of their own counts every one of
  // them. Minutes come from the leaves, so the number on the row is the work
  // that is actually there rather than the estimate made before the breakdown.
  const rollups = rollupsByRoot(
    await questTreeRows(user.id),
    activeQuests.map((q) => q.id),
  );

  const enriched = await Promise.all(
    activeQuests.map(async (q) => {
      const base = await enrichWithScore(q, availableMinutes, energyLevel);
      const rollup = rollups.get(q.id);
      return {
        ...base,
        subQuestTotal: rollup?.total ?? 0,
        subQuestDone: rollup?.done ?? 0,
        rolledUpMinutes: rollup?.estimatedMinutes ?? q.estimatedMinutes,
      };
    }),
  );
  enriched.sort((a, b) => b.priorityScore - a.priorityScore);

  return c.json({ success: true, data: enriched });
});

// GET /quests/:id/subquests — the nested sub-quest tree beneath a quest.
// The first tier comes back as nodes, each carrying its own `subQuests` and a
// `rollup` (totals for its whole subtree, its depth, and whether it may take
// another tier). MAX_QUEST_DEPTH tiers in all.
quests.get('/:id/subquests', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  // Ensure ownership.
  const parent = await db.quest.findUnique({ where: { id } });
  if (!parent || parent.userId !== user.id) return c.json(notFound(), 404);
  // The whole forest, so one query covers every tier of descendants.
  const rows = await db.quest.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } });
  return c.json({
    success: true,
    data: { subQuests: buildTree(rows, id), rollup: rollupsByRoot(rows, [id]).get(id) },
  });
});

// GET /quests/parents?for=<id> — what the "Part of" menu offers: open quests
// that can still take a step, in tree order. With `for`, the places that
// quest (and the steps it brings along) would fit.
quests.get('/parents', async (c) => {
  const user = c.get('user');
  const rows = await db.quest.findMany({
    where: { userId: user.id, status: { not: 'COMPLETE' } },
    select: {
      id: true,
      title: true,
      parentQuestId: true,
      status: true,
      estimatedMinutes: true,
      isRecurring: true,
    },
    orderBy: { createdAt: 'asc' },
  });
  // Routines and hour logs are not jobs with steps.
  const choices = parentChoices(rows, (r) => !r.isRecurring && !isOpenEnded(r), c.req.query('for') || undefined);
  return c.json({ success: true, data: choices });
});

// GET /quests/hours — hour logs: quests with no estimate, with what has been
// written against each (all time, this week from Monday, today).
quests.get('/hours', async (c) => {
  const user = c.get('user');
  const tzRaw = Number(c.req.query('tz'));
  const tz = Number.isFinite(tzRaw) ? tzRaw : 0;
  const now = new Date();

  const logs = await db.quest.findMany({
    where: {
      userId: user.id,
      estimatedMinutes: 0,
      isRecurring: false,
      status: { in: ['ACTIVE', 'NOT_TODAY', 'RESCUE'] },
    },
    orderBy: { createdAt: 'asc' },
  });
  const ids = logs.map((q) => q.id);
  const written = { userId: user.id, kind: { in: [HOURS_KIND, FOCUS_KIND] }, subjectId: { in: ids } };
  const [thisWeek, last] = await Promise.all([
    db.activityEntry.findMany({
      // Midnight today can fall before Monday's start in no timezone, so the
      // week's rows are enough for both numbers.
      where: { ...written, at: { gte: weekStart(now, tz) } },
      select: { subjectId: true, at: true, data: true },
    }),
    db.activityEntry.groupBy({ by: ['subjectId'], where: written, _max: { at: true } }),
  ]);
  const lastAt = new Map(last.map((g) => [g.subjectId, g._max.at]));

  const data = logs.map((q) => {
    const totals = hourTotals(
      thisWeek.filter((e) => e.subjectId === q.id).map((e) => ({ at: e.at, minutes: minutesOf(e.data) })),
      now,
      tz,
    );
    return {
      ...q,
      loggedMinutes: q.actualMinutes ?? 0,
      todayMinutes: totals.todayMinutes,
      weekMinutes: totals.weekMinutes,
      lastLoggedAt: lastAt.get(q.id) ?? null,
    };
  });
  return c.json({ success: true, data });
});

// GET /quests/:id/hours — what has been written against one quest, newest
// first: entries made by hand and sessions left by the focus timer.
quests.get('/:id/hours', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const quest = await db.quest.findUnique({ where: { id } });
  if (!quest || quest.userId !== user.id) return c.json(notFound(), 404);
  const rows = await db.activityEntry.findMany({
    where: { userId: user.id, subjectId: id, kind: { in: [HOURS_KIND, FOCUS_KIND] } },
    orderBy: { at: 'desc' },
    take: 200,
  });
  return c.json({
    success: true,
    data: {
      loggedMinutes: quest.actualMinutes ?? 0,
      // Timer rows from before minutes were kept on the row have nothing to show.
      entries: rows.map(timeEntry).filter((e) => e.minutes > 0),
    },
  });
});

// POST /quests/:id/hours — write down time spent: { minutes, note?, date?, tz? }.
// Works on any quest (it is progress on an ordinary one); on an hour log it
// is the whole of how the quest is used.
quests.post('/:id/hours', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const parsed = LogHoursSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(refused('VALIDATION_ERROR', parsed.error.message), 400);
  const quest = await db.quest.findUnique({ where: { id } });
  if (!quest || quest.userId !== user.id) return c.json(notFound(), 404);

  const { minutes, note, date, tz = 0 } = parsed.data;
  const now = new Date();
  const at = entryInstant(date, tz, now);
  if (!at) return c.json(refused('BAD_DATE', 'Pick today or a day that has already happened.'), 400);

  const result = await logTime(user, quest, {
    minutes,
    note: note || undefined,
    at,
    kind: HOURS_KIND,
    isToday: localDay(at, tz) === localDay(now, tz),
  });
  return c.json(
    {
      success: true,
      data: {
        entry: timeEntry(result.entry),
        loggedMinutes: result.quest.actualMinutes ?? 0,
        xpAwarded: result.xpAwarded,
        totalXP: result.totalXP,
        newStreak: result.newStreak,
        newMultiplier: result.newMultiplier,
      },
    },
    201,
  );
});

// DELETE /quests/:id/hours/:entryId — take an entry back (a slip of the
// thumb, the wrong quest). The total and any XP it earned go with it.
quests.delete('/:id/hours/:entryId', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const entry = await db.activityEntry.findUnique({ where: { id: c.req.param('entryId') } });
  if (
    !entry ||
    entry.userId !== user.id ||
    entry.subjectId !== id ||
    (entry.kind !== HOURS_KIND && entry.kind !== FOCUS_KIND)
  ) {
    return c.json(notFound('Entry not found'), 404);
  }
  const quest = await db.quest.findUnique({ where: { id } });
  if (!quest || quest.userId !== user.id) return c.json(notFound(), 404);

  const minutes = minutesOf(entry.data);
  const earned = Number((entry.data as { xp?: unknown } | null)?.xp) || 0;
  // Never below zero: XP spent on nothing can still be less than was earned.
  const xpBack = Math.min(earned, user.totalXP);
  const loggedMinutes = Math.max(0, (quest.actualMinutes ?? 0) - minutes);

  const [, , updatedUser] = await db.$transaction([
    db.activityEntry.delete({ where: { id: entry.id } }),
    db.quest.update({ where: { id }, data: { actualMinutes: loggedMinutes } }),
    db.user.update({ where: { id: user.id }, data: { totalXP: { decrement: xpBack } } }),
    ...(xpBack > 0
      ? [db.xPEvent.create({ data: { userId: user.id, questId: id, amount: -xpBack, reason: 'hours_removed' } })]
      : []),
  ]);
  return c.json({ success: true, data: { loggedMinutes, totalXP: updatedUser.totalXP } });
});

// POST /quests/:id/decompose — ask Claude to suggest 3–6 sub-quests.
// Returns suggestions only; the client is responsible for creating the
// approved sub-quests (lets the user edit titles/durations first).
quests.post('/:id/decompose', async (c) => {
  if (!AI_ENABLED) {
    return c.json(
      {
        success: false,
        error: {
          code: 'AI_NOT_CONFIGURED',
          message:
            'ANTHROPIC_API_KEY is not set on the server. Add it to your server env to enable AI quest decomposition.',
        },
      },
      503,
    );
  }
  const user = c.get('user');
  const id = c.req.param('id');
  const quest = await db.quest.findUnique({ where: { id } });
  if (!quest || quest.userId !== user.id) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Quest not found' } }, 404);
  }

  const prompt = `You are a productivity coach helping break a task into smaller, concrete sub-tasks.

Quest: "${quest.title}"
Estimated total time: ${quest.estimatedMinutes} minutes
Mental load (1-10): ${quest.mentalLoad}
Impact (1-10): ${quest.impact}
${quest.deadline ? `Deadline: ${quest.deadline.toISOString().slice(0, 10)}` : ''}
${quest.category ? `Category: ${quest.category}` : ''}

Break this into 3 to 6 sub-tasks. Each sub-task should be:
  - Concrete and actionable (start with a verb)
  - Doable in a single sitting (10–60 minutes)
  - Sum to roughly ${quest.estimatedMinutes} minutes total

Respond ONLY with valid JSON, no prose, of this exact shape:
{ "subQuests": [ { "title": "string", "estimatedMinutes": number, "rationale": "string" }, ... ] }`;

  try {
    const client = getClient();
    const response = await client.messages.create({
      model: AI_MODEL,
      // Opus 5 thinks by default and thinking counts against max_tokens.
      max_tokens: 16000,
      messages: [{ role: 'user', content: prompt }],
    });
    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return c.json(
        { success: false, error: { code: 'AI_EMPTY', message: 'AI returned no text' } },
        502,
      );
    }
    // Be forgiving — strip markdown code fences if Claude wrapped the JSON.
    const raw = textBlock.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
    let parsed: { subQuests?: Array<{ title?: string; estimatedMinutes?: number; rationale?: string }> };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return c.json(
        { success: false, error: { code: 'AI_PARSE_ERROR', message: 'AI returned non-JSON', raw } },
        502,
      );
    }
    const suggestions = (parsed.subQuests ?? [])
      .filter((s) => typeof s.title === 'string' && s.title.length > 0)
      .map((s) => ({
        title: s.title!,
        estimatedMinutes: Math.max(5, Math.min(180, Number(s.estimatedMinutes) || 30)),
        rationale: typeof s.rationale === 'string' ? s.rationale : '',
      }));

    return c.json({ success: true, data: { suggestions } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json(
      { success: false, error: { code: 'AI_ERROR', message: msg } },
      502,
    );
  }
});

// GET /quests/:id/xp-events — XP history for a quest
quests.get('/:id/xp-events', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const events = await db.xPEvent.findMany({
    where: { questId: id, userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return c.json({ success: true, data: events });
});

// GET /quests/rescue — active quests past their deadline (overdue triage)
quests.get('/rescue', async (c) => {
  const user = c.get('user');
  const now = new Date();
  const overdue = await db.quest.findMany({
    where: {
      userId: user.id,
      status: { in: ['ACTIVE', 'RESCUE'] },
      deadline: { lt: now },
      isRecurring: false,
    },
    orderBy: { deadline: 'asc' },
  });
  // Flip them to RESCUE status on read so the UI badge is stable.
  if (overdue.some((q) => q.status === 'ACTIVE')) {
    await db.quest.updateMany({
      where: {
        userId: user.id,
        status: 'ACTIVE',
        deadline: { lt: now },
        isRecurring: false,
      },
      data: { status: 'RESCUE' },
    });
  }
  return c.json({
    success: true,
    data: overdue.map((q) => ({
      ...q,
      status: q.deadline && q.deadline < now ? 'RESCUE' : q.status,
    })),
  });
});

// POST /quests/:id/extend-deadline — bump a quest's deadline forward by N days
quests.post('/:id/extend-deadline', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const days = Math.max(1, Math.min(60, Number(body?.days) || 1));

  const quest = await db.quest.findUnique({ where: { id } });
  if (!quest || quest.userId !== user.id) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Quest not found' } }, 404);
  }
  const newDeadline = quest.deadline
    ? new Date(quest.deadline.getTime() + days * 86_400_000)
    : new Date(Date.now() + days * 86_400_000);
  const updated = await db.quest.update({
    where: { id },
    data: { deadline: newDeadline, status: 'ACTIVE' },
  });
  void logActivity(user.id, 'quest.extended', `Pushed the deadline of quest "${quest.title}" back ${days} day${days === 1 ? '' : 's'}`, { subjectId: id });
  return c.json({ success: true, data: updated });
});

// GET /quests/recurring — recurring (daily) quests with today's completion state
quests.get('/recurring', async (c) => {
  const user = c.get('user');
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const recurring = await db.quest.findMany({
    where: { userId: user.id, isRecurring: true, status: 'ACTIVE' },
    orderBy: { preferredHour: 'asc' },
  });
  const completionsToday = await db.recurringCompletion.findMany({
    where: { userId: user.id, date: today },
    select: { questId: true },
  });
  const completedSet = new Set(completionsToday.map((r) => r.questId));
  const data = recurring.map((q) => ({ ...q, doneToday: completedSet.has(q.id) }));
  return c.json({ success: true, data });
});

// GET /quests/completed — completed quests for weekly chart + history
quests.get('/completed', async (c) => {
  const user = c.get('user');
  const completed = await db.quest.findMany({
    where: { userId: user.id, status: 'COMPLETE' },
    orderBy: { completedAt: 'desc' },
    take: 200,
  });
  return c.json({ success: true, data: completed });
});

// POST /quests — quick-add (title only required)
quests.post('/', async (c) => {
  const body = await c.req.json();
  const parsed = CreateQuestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } },
      400,
    );
  }

  const user = c.get('user');
  const { clerkId: _, deadline, openEnded, ...fields } = parsed.data;

  if (openEnded) {
    // An hour log stands alone: it has no finish to break into steps, and a
    // routine is ticked, not timed.
    if (fields.parentQuestId || fields.isRecurring) {
      return c.json(refused('BAD_HOUR_LOG', 'An hour log cannot be a step or a daily routine.'), 400);
    }
    fields.estimatedMinutes = 0;
  }

  // Nesting is checked here, not in the UI: the REST API and the MCP
  // connector create quests too, and a chain deeper than the cap would be
  // unreachable from the screens that are meant to edit it.
  if (fields.parentQuestId) {
    const parent = await db.quest.findUnique({ where: { id: fields.parentQuestId } });
    // Not the user's quest, or not a quest at all: the same answer either
    // way, so a stray id can't be used to probe for someone else's.
    if (!parent || parent.userId !== user.id) return c.json(notFound('Parent quest not found'), 404);
    if (parent.isRecurring || isOpenEnded(parent)) {
      return c.json(refused('BAD_PARENT', 'Routines and hour logs do not take steps.'), 400);
    }
    const rows = await questTreeRows(user.id);
    if (depthOf(parent.id, new Map(rows.map((r) => [r.id, r]))) >= MAX_QUEST_DEPTH) {
      return c.json(
        refused(
          'MAX_DEPTH',
          `Sub-quests go ${MAX_QUEST_DEPTH} tiers deep. This one is already at the bottom — add the step beside it instead.`,
        ),
        400,
      );
    }
  }

  const quest = await db.quest.create({
    data: {
      userId: user.id,
      ...fields,
      deadline: deadline ? new Date(deadline) : null,
      status: 'ACTIVE',
    },
  });

  void logActivity(
    user.id,
    'quest.created',
    isOpenEnded(quest) ? `Started an hour log: "${quest.title}"` : `Added quest "${quest.title}" (${quest.estimatedMinutes} min)`,
    { subjectId: quest.id },
  );
  return c.json({ success: true, data: quest }, 201);
});

// POST /quests/import — create many quests from parsed lines
quests.post('/import', async (c) => {
  const user = c.get('user');
  const parsed = ImportQuestsSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, 400);
  }

  const rows = parsed.data.quests.map((q) => ({
    userId: user.id,
    title: q.title,
    estimatedMinutes: q.estimatedMinutes ?? 30,
    deadline: q.deadline ? new Date(q.deadline) : null,
    ...(q.priorityTier ? { priorityTier: q.priorityTier } : {}),
    tags: q.tags ?? [],
    status: 'ACTIVE' as const,
  }));

  const created = await db.$transaction(rows.map((data) => db.quest.create({ data })));

  void logActivity(
    user.id,
    'quest.imported',
    `Imported ${created.length} quest${created.length === 1 ? '' : 's'}: ` +
      created.slice(0, 5).map((q) => `"${q.title}"`).join(', ') +
      (created.length > 5 ? `, and ${created.length - 5} more` : ''),
  );
  return c.json({ success: true, data: { created: created.length, quests: created } }, 201);
});

// PATCH /quests/:id — edit quest fields
quests.patch('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const existing = await db.quest.findUnique({ where: { id } });
  if (!existing || existing.userId !== user.id) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Quest not found' } }, 404);
  }
  const body = await c.req.json();
  const parsed = UpdateQuestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } },
      400,
    );
  }

  const { deadline, openEnded, ...rest } = parsed.data;

  // An hour log keeps having no estimate unless it is deliberately turned
  // back into a quest: the editor sends an estimate with every save, and one
  // of those must not quietly put a log into the plan.
  const becomesLog = openEnded ?? isOpenEnded(existing);
  if (becomesLog) {
    const rows = await questTreeRows(user.id);
    if (existing.parentQuestId || rest.parentQuestId || parentIds(rows).has(id) || (rest.isRecurring ?? existing.isRecurring)) {
      return c.json(refused('BAD_HOUR_LOG', 'An hour log cannot be a step, have steps, or be a daily routine.'), 400);
    }
    rest.estimatedMinutes = 0;
  } else if (isOpenEnded(existing)) {
    rest.estimatedMinutes = rest.estimatedMinutes ?? 30;
  }

  // Filing a quest under another is the same rule as creating it there, plus
  // two more: not under itself or its own steps, and its steps come with it.
  if (rest.parentQuestId) {
    const parent = await db.quest.findUnique({ where: { id: rest.parentQuestId } });
    if (!parent || parent.userId !== user.id) return c.json(notFound('Parent quest not found'), 404);
    if (parent.isRecurring || isOpenEnded(parent) || existing.isRecurring) {
      return c.json(refused('BAD_PARENT', 'Routines and hour logs do not take steps.'), 400);
    }
    const problem = moveProblem(await questTreeRows(user.id), id, parent.id);
    if (problem) return c.json(refused(problem === 'TOO_DEEP' ? 'MAX_DEPTH' : 'BAD_PARENT', MOVE_MESSAGE[problem]), 400);
  }

  const quest = await db.quest.update({
    where: { id },
    data: {
      ...rest,
      ...(deadline !== undefined ? { deadline: deadline ? new Date(deadline) : null } : {}),
    },
  });

  return c.json({ success: true, data: quest });
});

// POST /quests/:id/complete — complete a quest, award XP, update streak
quests.post('/:id/complete', async (c) => {
  const questId = c.req.param('id');

  const quest = await db.quest.findUnique({ where: { id: questId } });
  if (!quest) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Quest not found' } }, 404);
  }
  if (quest.status === 'COMPLETE') {
    return c.json({ success: false, error: { code: 'ALREADY_COMPLETE', message: 'Quest already completed' } }, 409);
  }

  const user = await db.user.findUnique({ where: { id: quest.userId } });
  if (!user) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } }, 404);
  }

  // Fetch today's check-in for energy + available time
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const checkIn = await db.dailyCheckIn.findUnique({
    where: { userId_date: { userId: user.id, date: today } },
  });

  const availableMinutes = checkIn?.availableMinutes ?? 480;
  const energyLevel = checkIn?.energyLevel ?? 3;

  // Priority score → time pressure for XP calc
  const daysUntilDue = quest.deadline
    ? Math.ceil((quest.deadline.getTime() - Date.now()) / 86_400_000)
    : null;
  const { timePressure } = computePriorityScore({
    daysUntilDue,
    estimatedMinutes: quest.estimatedMinutes,
    availableMinutes,
    mentalLoad: quest.mentalLoad,
    impact: quest.impact,
    energyLevel,
  });

  // Streak update
  const lastActivity = await db.xPEvent.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });

  const streakResult = updateStreak({
    currentStreak: user.currentStreak,
    lastActivityDate: lastActivity?.createdAt ?? null,
    today,
    completedQuestToday: true,
  });

  // Sub-quests count towards the parent, so completing the parent must not
  // pay for them twice: a quest with steps bills only the minutes nobody has
  // claimed yet. Tick every step first and the capstone still pays the
  // 5-minute floor, so finishing a broken-down quest is never worth nothing.
  // (An hour log has no estimate and was paid as its time was written down.)
  const treeRows = await questTreeRows(user.id);
  const stillOpen = new Set(treeRows.filter((r) => r.status !== 'COMPLETE').map((r) => r.id));
  const openDescendantIds = descendantIds(treeRows, questId).filter((id) => stillOpen.has(id));
  const rollup = rollupsByRoot(treeRows, [questId]).get(questId);
  const billableMinutes = rollup?.childCount
    ? Math.max(5, rollup.estimatedMinutes - rollup.doneMinutes)
    : quest.estimatedMinutes;

  // XP calculation
  const { xp } = computeXP({
    estimatedMinutes: billableMinutes,
    mentalLoad: quest.mentalLoad,
    timePressure,
    streakMultiplier: streakResult.newMultiplier,
  });

  // Persist everything in one transaction
  const [updatedQuest, closedSteps, , updatedUser] = await db.$transaction([
    db.quest.update({
      where: { id: questId },
      data: { status: 'COMPLETE', completedAt: new Date() },
    }),
    // Open steps close with their parent. Left ACTIVE they would be invisible
    // (the lists only show main quests) yet still planned into the day.
    db.quest.updateMany({
      where: { id: { in: openDescendantIds } },
      data: { status: 'COMPLETE', completedAt: new Date() },
    }),
    db.xPEvent.create({
      data: { userId: user.id, questId, amount: xp, reason: 'quest_complete' },
    }),
    db.user.update({
      where: { id: user.id },
      data: {
        totalXP: { increment: xp },
        currentStreak: streakResult.newStreak,
        multiplier: streakResult.newMultiplier,
      },
    }),
  ]);

  // Achievement evaluation runs AFTER the completion transaction so that
  // the freshly-completed quest is visible to the evaluator's recent-history
  // queries. Bonus XP from unlocks is folded into `totalXP` here.
  const newlyUnlocked = await evalAndUnlockAchievements({
    id: updatedQuest.id,
    userId: user.id,
    mentalLoad: updatedQuest.mentalLoad,
    estimatedMinutes: updatedQuest.estimatedMinutes,
    actualMinutes: updatedQuest.actualMinutes,
    completedAt: updatedQuest.completedAt ?? new Date(),
    status: quest.status, // RESCUE flag survives only on the pre-update copy
  });
  const bonusXP = newlyUnlocked.reduce((s, a) => s + a.xpReward, 0);
  const finalTotalXP = updatedUser.totalXP + bonusXP;
  void logActivity(
    user.id,
    'quest.completed',
    `Completed quest "${updatedQuest.title}"` +
      (updatedQuest.actualMinutes ? ` in ${updatedQuest.actualMinutes} min` : '') +
      ` (+${xp} XP${streakResult.newStreak ? `, streak ${streakResult.newStreak}` : ''})` +
      (closedSteps.count ? `, closing ${closedSteps.count} open sub-quest${closedSteps.count === 1 ? '' : 's'} with it` : '') +
      (newlyUnlocked.length ? `. Unlocked ${newlyUnlocked.map((a) => a.title).join(', ')}` : ''),
    { subjectId: updatedQuest.id, data: { xp, estimatedMinutes: updatedQuest.estimatedMinutes, actualMinutes: updatedQuest.actualMinutes } },
  );

  return c.json({
    success: true,
    data: {
      quest: updatedQuest,
      xpAwarded: xp,
      /** Open sub-quests closed out by this completion, if any. */
      closedSubQuests: closedSteps.count,
      streakEvent: streakResult.event,
      newStreak: streakResult.newStreak,
      newMultiplier: streakResult.newMultiplier,
      totalXP: finalTotalXP,
      newlyUnlocked: newlyUnlocked.map((a) => ({
        slug: a.slug,
        title: a.title,
        icon: a.icon,
        description: a.description,
        xpReward: a.xpReward,
      })),
    },
  });
});

// POST /quests/spin-wheel — pick a random active quest, weighted by priority score.
// Increments the user's spinCount (drives Chaos Agent achievement).
quests.post('/spin-wheel', async (c) => {
  const user = c.get('user');

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const checkIn = await db.dailyCheckIn.findUnique({
    where: { userId_date: { userId: user.id, date: today } },
  });
  const availableMinutes = checkIn?.availableMinutes ?? 480;
  const energyLevel = checkIn?.energyLevel ?? 3;

  const active = await db.quest.findMany({
    where: { userId: user.id, status: 'ACTIVE', isRecurring: false, parentQuestId: null, estimatedMinutes: { gt: 0 } },
  });

  if (active.length === 0) {
    return c.json(
      { success: false, error: { code: 'NO_QUESTS', message: 'No active quests to spin' } },
      400,
    );
  }

  // Weight by priority score: clamp+exponentiate so high-priority quests
  // dominate but everything stays reachable.
  const weighted = await Promise.all(
    active.map(async (q) => {
      const enriched = await enrichWithScore(q, availableMinutes, energyLevel);
      // Ensure non-negative weights even if score is 0.
      const weight = Math.max(0.1, (enriched.priorityScore ?? 0) ** 1.5 + 0.5);
      return { quest: q, weight };
    }),
  );

  const total = weighted.reduce((s, w) => s + w.weight, 0);
  let roll = Math.random() * total;
  let picked = weighted[0]!.quest;
  for (const w of weighted) {
    roll -= w.weight;
    if (roll <= 0) {
      picked = w.quest;
      break;
    }
  }

  // Increment spin counter for Chaos Agent achievement evaluation.
  await db.user.update({
    where: { id: user.id },
    data: { spinCount: { increment: 1 } },
  });

  // Run achievement evaluator so Chaos Agent fires when the user hits 10 spins.
  // We don't pass a completed quest, so we use a synthetic context: the evaluator
  // only checks the spin-related slug. Pass minimal completedQuest fields.
  const newlyUnlocked = await evalAndUnlockAchievements({
    id: picked.id,
    userId: user.id,
    mentalLoad: picked.mentalLoad,
    estimatedMinutes: picked.estimatedMinutes,
    actualMinutes: null,
    completedAt: new Date(),
    status: picked.status,
  });

  return c.json({
    success: true,
    data: {
      picked,
      newlyUnlocked: newlyUnlocked.map((a) => ({
        slug: a.slug,
        title: a.title,
        icon: a.icon,
        description: a.description,
        xpReward: a.xpReward,
      })),
    },
  });
});

// POST /quests/:id/complete-daily — log a recurring quest as done for today
// Awards XP + updates streak. Quest stays ACTIVE; will reappear tomorrow.
quests.post('/:id/complete-daily', async (c) => {
  const questId = c.req.param('id');
  const quest = await db.quest.findUnique({ where: { id: questId } });
  if (!quest) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Quest not found' } }, 404);
  }
  if (!quest.isRecurring) {
    return c.json(
      { success: false, error: { code: 'NOT_RECURRING', message: 'Quest is not recurring; use /complete' } },
      400,
    );
  }
  const user = await db.user.findUnique({ where: { id: quest.userId } });
  if (!user) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } }, 404);
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // Check if already completed today.
  const existing = await db.recurringCompletion.findUnique({
    where: { questId_date: { questId, date: today } },
  });
  if (existing) {
    return c.json(
      { success: false, error: { code: 'ALREADY_DONE_TODAY', message: 'Already completed today' } },
      409,
    );
  }

  const checkIn = await db.dailyCheckIn.findUnique({
    where: { userId_date: { userId: user.id, date: today } },
  });
  const availableMinutes = checkIn?.availableMinutes ?? 480;
  const energyLevel = checkIn?.energyLevel ?? 3;

  const { timePressure } = computePriorityScore({
    daysUntilDue: null,
    estimatedMinutes: quest.estimatedMinutes,
    availableMinutes,
    mentalLoad: quest.mentalLoad,
    impact: quest.impact,
    energyLevel,
  });

  const lastActivity = await db.xPEvent.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });

  const streakResult = updateStreak({
    currentStreak: user.currentStreak,
    lastActivityDate: lastActivity?.createdAt ?? null,
    today,
    completedQuestToday: true,
  });

  const { xp } = computeXP({
    estimatedMinutes: quest.estimatedMinutes,
    mentalLoad: quest.mentalLoad,
    timePressure,
    streakMultiplier: streakResult.newMultiplier,
  });

  const [, xpEvent, updatedUser] = await db.$transaction([
    db.recurringCompletion.create({
      data: { questId, userId: user.id, date: today, xpAwarded: xp },
    }),
    db.xPEvent.create({
      data: { userId: user.id, questId, amount: xp, reason: 'recurring_complete' },
    }),
    db.user.update({
      where: { id: user.id },
      data: {
        totalXP: { increment: xp },
        currentStreak: streakResult.newStreak,
        multiplier: streakResult.newMultiplier,
      },
    }),
  ]);

  const newlyUnlocked = await evalAndUnlockAchievements({
    id: quest.id,
    userId: user.id,
    mentalLoad: quest.mentalLoad,
    estimatedMinutes: quest.estimatedMinutes,
    actualMinutes: null,
    completedAt: new Date(),
    status: 'COMPLETE',
  });
  const bonusXP = newlyUnlocked.reduce((s, a) => s + a.xpReward, 0);
  void logActivity(user.id, 'quest.daily', `Did daily quest "${quest.title}" (+${xp} XP)`, { subjectId: quest.id });

  return c.json({
    success: true,
    data: {
      quest,
      xpAwarded: xp,
      streakEvent: streakResult.event,
      newStreak: streakResult.newStreak,
      newMultiplier: streakResult.newMultiplier,
      totalXP: updatedUser.totalXP + bonusXP,
      newlyUnlocked: newlyUnlocked.map((a) => ({
        slug: a.slug,
        title: a.title,
        icon: a.icon,
        description: a.description,
        xpReward: a.xpReward,
      })),
    },
  });
});

// POST /quests/:id/focus — log a focus session's minutes against a quest.
// This is the only place real time enters the app: it lets the planner
// subtract progress on multi-session quests (actualMinutes is already read
// as "done so far"), and finished quests with logged time calibrate future
// estimates (insights.calibrateEstimates).
quests.post('/:id/focus', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const parsed = z
    .object({ minutes: z.number().int().min(1).max(600) })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, 400);
  }
  const existing = await db.quest.findUnique({ where: { id } });
  if (!existing || existing.userId !== user.id) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Quest not found' } }, 404);
  }
  // The same write as an entry made by hand, so a timed session shows in the
  // quest's time list and, on an hour log, earns what a written one would.
  const { quest } = await logTime(user, existing, {
    minutes: parsed.data.minutes,
    at: new Date(),
    kind: FOCUS_KIND,
    isToday: true,
  });
  return c.json({ success: true, data: quest });
});

// POST /quests/:id/not-today — defer a quest to tomorrow
quests.post('/:id/not-today', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const existing = await db.quest.findUnique({ where: { id } });
  if (!existing || existing.userId !== user.id) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Quest not found' } }, 404);
  }
  const quest = await db.quest.update({
    where: { id },
    data: { status: 'NOT_TODAY' },
  });
  void logActivity(user.id, 'quest.not_today', `Deferred quest "${quest.title}" to tomorrow`, { subjectId: id });
  return c.json({ success: true, data: quest });
});

// DELETE /quests/:id
quests.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const existing = await db.quest.findUnique({ where: { id } });
  if (!existing || existing.userId !== user.id) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Quest not found' } }, 404);
  }
  // The whole subtree goes, deepest first. The column's own rule is SET NULL,
  // so without this the steps of a deleted quest would come back as main
  // quests of their own.
  const doomed = descendantIds(await questTreeRows(user.id), id);
  await db.$transaction([
    ...doomed.map((childId) => db.quest.delete({ where: { id: childId } })),
    db.quest.delete({ where: { id } }),
  ]);
  void logActivity(
    user.id,
    'quest.deleted',
    `Deleted quest "${existing.title}"` +
      (doomed.length ? ` and its ${doomed.length} sub-quest${doomed.length === 1 ? '' : 's'}` : ''),
  );
  return c.json({ success: true, data: null });
});
