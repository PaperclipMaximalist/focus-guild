import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/client.js';
import { computePriorityScore } from '../lib/priority.js';
import { computeXP } from '../lib/xp.js';
import { updateStreak, computeMultiplier } from '../lib/streak.js';
import { AI_ENABLED, getClient } from '../lib/ai.js';
import { evalAndUnlockAchievements } from '../lib/evalAndUnlock.js';

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
};

const CreateQuestSchema = z.object({
  // clerkId is accepted for legacy clients but ignored — auth comes from middleware.
  clerkId: z.string().optional(),
  title: z.string().min(1).max(280),
  estimatedMinutes: z.number().int().min(1).optional().default(30),
  mentalLoad: z.number().int().min(1).max(10).optional().default(5),
  impact: z.number().int().min(1).max(10).optional().default(5),
  deadline: z.string().datetime({ offset: true }).optional(),
  parentQuestId: z.string().optional(),
  tags: z.array(z.string()).optional().default([]),
  ...SchedulerHintsSchema,
});

const UpdateQuestSchema = z.object({
  title: z.string().min(1).max(280).optional(),
  estimatedMinutes: z.number().int().min(1).optional(),
  mentalLoad: z.number().int().min(1).max(10).optional(),
  impact: z.number().int().min(1).max(10).optional(),
  deadline: z.string().datetime({ offset: true }).nullable().optional(),
  tags: z.array(z.string()).optional(),
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

  // Non-recurring active quests only — recurring are surfaced via /quests/recurring.
  const activeQuests = await db.quest.findMany({
    where: { userId: user.id, status: 'ACTIVE', parentQuestId: null, isRecurring: false },
    orderBy: { createdAt: 'asc' },
    include: {
      subQuests: {
        select: { id: true, status: true },
      },
    },
  });

  const enriched = await Promise.all(
    activeQuests.map(async (q) => {
      const { subQuests, ...rest } = q;
      const base = await enrichWithScore(rest, availableMinutes, energyLevel);
      const subTotal = subQuests.length;
      const subDone = subQuests.filter((s) => s.status === 'COMPLETE').length;
      return {
        ...base,
        subQuestTotal: subTotal,
        subQuestDone: subDone,
      };
    }),
  );
  enriched.sort((a, b) => b.priorityScore - a.priorityScore);

  return c.json({ success: true, data: enriched });
});

// GET /quests/:id/subquests — list sub-quests of a parent
quests.get('/:id/subquests', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  // Ensure ownership.
  const parent = await db.quest.findUnique({ where: { id } });
  if (!parent || parent.userId !== user.id) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Quest not found' } }, 404);
  }
  const subs = await db.quest.findMany({
    where: { parentQuestId: id },
    orderBy: { createdAt: 'asc' },
  });
  return c.json({ success: true, data: subs });
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
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
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
  const { clerkId: _, deadline, ...fields } = parsed.data;
  const quest = await db.quest.create({
    data: {
      userId: user.id,
      ...fields,
      deadline: deadline ? new Date(deadline) : null,
      status: 'ACTIVE',
    },
  });

  return c.json({ success: true, data: quest }, 201);
});

// PATCH /quests/:id — edit quest fields
quests.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = UpdateQuestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } },
      400,
    );
  }

  const { deadline, ...rest } = parsed.data;
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

  // XP calculation
  const { xp } = computeXP({
    estimatedMinutes: quest.estimatedMinutes,
    mentalLoad: quest.mentalLoad,
    timePressure,
    streakMultiplier: streakResult.newMultiplier,
  });

  // Persist everything in one transaction
  const [updatedQuest, xpEvent, updatedUser] = await db.$transaction([
    db.quest.update({
      where: { id: questId },
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

  return c.json({
    success: true,
    data: {
      quest: updatedQuest,
      xpAwarded: xp,
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
    where: { userId: user.id, status: 'ACTIVE', isRecurring: false, parentQuestId: null },
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

// POST /quests/:id/not-today — defer a quest to tomorrow
quests.post('/:id/not-today', async (c) => {
  const id = c.req.param('id');
  const quest = await db.quest.update({
    where: { id },
    data: { status: 'NOT_TODAY' },
  });
  return c.json({ success: true, data: quest });
});

// DELETE /quests/:id
quests.delete('/:id', async (c) => {
  const id = c.req.param('id');
  await db.quest.delete({ where: { id } });
  return c.json({ success: true, data: null });
});
