/**
 * Schedule API.
 *
 * In-memory store keyed by clerkId for now — the scheduler module is pure,
 * so persistence is a separate concern. Persist to Prisma later by writing
 * to ScheduleBlock after `generate`/`replan` and reading back on `get`.
 *
 * Routes
 *   POST   /schedule/generate          { clerkId } → regenerate from quests
 *   GET    /schedule/:clerkId          → current schedule + feasibility
 *   POST   /schedule/:clerkId/replan   → re-flow around locked blocks
 *   POST   /schedule/:clerkId/edit     { edit } → apply user edit + replan
 *   POST   /schedule/:clerkId/fillers  { fillers } → set daily fillers
 *   GET    /schedule/:clerkId/explain  ?blockId=... → human-readable reason
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/client.js';
import {
  generateSchedule,
  replan,
  applyEdit,
  explainBlock,
  questsToTasks,
  placeDailyFillers,
  type Schedule,
  type Block,
  type DailyFiller,
  type Edit,
  type SchedulerResult,
  type QuestSchedulerOverrides,
} from '../lib/scheduler/index.js';
import { getUserConfig } from '../lib/userConfig.js';
import { blockToRow, rowToBlock } from '../lib/scheduler/persistence.js';

export const schedule = new Hono();

// ─── In-memory state per user ─────────────────────────────────────────────────

interface UserScheduleState {
  schedule: Schedule;
  feasibilityReport: SchedulerResult['feasibilityReport'];
  fillers: DailyFiller[];
  overrides: Record<string, QuestSchedulerOverrides>;
  lastGeneratedAt: number;
}

const stateByUserId = new Map<string, UserScheduleState>();

function getState(userId: string): UserScheduleState {
  let s = stateByUserId.get(userId);
  if (!s) {
    s = {
      schedule: [],
      feasibilityReport: { ok: true, issues: [] },
      fillers: [],
      overrides: {},
      lastGeneratedAt: 0,
    };
    stateByUserId.set(userId, s);
  }
  return s;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function loadQuestsForUser(user: { id: string }) {
  const all = await db.quest.findMany({
    where: { userId: user.id, status: { in: ['ACTIVE', 'RESCUE'] } },
  });
  // Split: planner consumes non-recurring; recurring become daily fillers.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const completionsToday = await db.recurringCompletion.findMany({
    where: { userId: user.id, date: today },
    select: { questId: true },
  });
  const completedSet = new Set(completionsToday.map((r) => r.questId));
  const regular = all.filter((q) => !q.isRecurring);
  const recurring = all.filter((q) => q.isRecurring && !completedSet.has(q.id));
  return { user, regular, recurring };
}

/**
 * Convert recurring quests into DailyFillers. estimatedMinutes ≤ 60 stays as
 * a single fixed block; longer recurring quests still go in but get clipped
 * to a max 60-minute filler block so they don't crowd the day.
 */
function recurringToFillers(
  recurring: Array<{ id: string; title: string; estimatedMinutes: number; preferredHour: number | null }>,
): DailyFiller[] {
  return recurring.map((q) => ({
    // Prefix to namespace away from user-configured state.fillers ids.
    id: `recurring:${q.id}`,
    name: q.title,
    durationMin: Math.min(60, Math.max(5, q.estimatedMinutes)),
    preferredHour: q.preferredHour,
    enabled: true,
  }));
}

function regenerate(
  state: UserScheduleState,
  loaded: Awaited<ReturnType<typeof loadQuestsForUser>> & { user: { id: string } },
  cfg: ReturnType<typeof getUserConfig>,
) {
  if (!loaded) return;
  const now = Date.now();
  const tasks = questsToTasks(loaded.regular, state.overrides, now);

  const recurringFillers = recurringToFillers(loaded.recurring);
  const allFillers = [...recurringFillers, ...state.fillers];

  const fillerBlocks = placeDailyFillers({
    fillers: allFillers,
    now,
    horizonDays: cfg.horizonDays,
    workingHours: cfg.workingHours,
    existingFixed: [],
  });

  const { schedule, feasibilityReport } = generateSchedule(tasks, fillerBlocks, cfg, now);
  state.schedule = schedule;
  state.feasibilityReport = feasibilityReport;
  state.lastGeneratedAt = now;
}

// ─── Persistence helpers ──────────────────────────────────────────────────────

/**
 * Persist the in-memory schedule to ScheduleBlock for this user. Strategy:
 * delete all future blocks (end > now), then insert the new schedule. Past
 * blocks are preserved as a historical record. Wrapped in a transaction so
 * a partial write can't leave the row set inconsistent.
 */
async function persistSchedule(
  userId: string,
  blocks: Block[],
  questIdSet: Set<string>,
  now: number,
): Promise<void> {
  const rows = blocks
    // Only persist future + active blocks. Past blocks already in DB stay.
    .filter((b) => b.end > now)
    .map((b) => blockToRow(b, userId, (id) => questIdSet.has(id)));

  await db.$transaction([
    db.scheduleBlock.deleteMany({
      where: { userId, endTime: { gt: new Date(now) } },
    }),
    db.scheduleBlock.createMany({ data: rows }),
  ]);
}

/**
 * Load persisted schedule from DB into an in-memory Block[].
 *
 * We trust the DB IDs over freshly-generated ones so that a `locked` block's
 * id survives across requests (lets the client reference it by id).
 */
async function hydrateSchedule(userId: string): Promise<Block[]> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  // Show today + future. Past blocks live in DB but we don't push them
  // through the API unless explicitly requested elsewhere.
  const rows = await db.scheduleBlock.findMany({
    where: { userId, endTime: { gte: today } },
    orderBy: { startTime: 'asc' },
  });
  return rows.map((r) => rowToBlock(r));
}

function serializeBlock(b: Block) {
  return {
    id: b.id,
    start: new Date(b.start).toISOString(),
    end: new Date(b.end).toISOString(),
    durationMin: Math.round((b.end - b.start) / 60_000),
    type: b.type,
    taskId: b.taskId,
    locked: b.locked,
    note: b.note,
  };
}

// Wrap the response under `data:` to match the rest of the API contract
// (the client's request() helper returns body.data, so spreading at top
// level would leave body.data === undefined — exactly the bug behind
// the "Cannot read properties of undefined (reading 'schedule')" error).
function ok(c: any, payload: object) {
  return c.json({ success: true, data: payload });
}

function err(c: any, code: string, message: string, status: 400 | 404 | 500 = 400) {
  return c.json({ success: false, error: { code, message } }, status);
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const GenerateSchema = z.object({ clerkId: z.string().min(1) });
const FillersSchema = z.object({
  fillers: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      durationMin: z.number().int().min(1).max(60),
      preferredHour: z.number().int().min(0).max(23).nullable(),
      enabled: z.boolean().optional(),
    }),
  ),
});
const EditSchema = z.object({
  edit: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('move_block'), blockId: z.string(), newStart: z.string() }),
    z.object({ kind: z.literal('swap_blocks'), aId: z.string(), bId: z.string() }),
    z.object({ kind: z.literal('delete_block'), blockId: z.string() }),
    z.object({ kind: z.literal('pin_block'), blockId: z.string() }),
    z.object({ kind: z.literal('unpin_block'), blockId: z.string() }),
  ]),
});

// ─── Routes ───────────────────────────────────────────────────────────────────

schedule.post('/generate', async (c) => {
  // Body is parsed for compatibility but clerkId is ignored — user from middleware.
  await c.req.json().catch(() => null);

  const user = c.get('user');
  const loaded = await loadQuestsForUser(user);

  const state = getState(user.id);
  const cfg = getUserConfig(user);
  regenerate(state, { ...loaded, user }, cfg);

  const questIdSet = new Set(loaded.regular.map((q) => q.id));
  await persistSchedule(user.id, state.schedule, questIdSet, Date.now());

  return ok(c, {
    schedule: state.schedule.map(serializeBlock),
    feasibilityReport: state.feasibilityReport,
    generatedAt: new Date(state.lastGeneratedAt).toISOString(),
  });
});

schedule.get('/:clerkId', async (c) => {
  const user = c.get('user');
  const state = getState(user.id);

  // Hydrate from DB on cold cache. Subsequent requests use in-memory state
  // (which mutations keep in sync).
  if (state.schedule.length === 0) {
    const persisted = await hydrateSchedule(user.id);
    if (persisted.length > 0) {
      state.schedule = persisted;
      const latest = await db.scheduleBlock.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      if (latest) state.lastGeneratedAt = latest.createdAt.getTime();
    }
  }

  return ok(c, {
    schedule: state.schedule.map(serializeBlock),
    feasibilityReport: state.feasibilityReport,
    generatedAt: state.lastGeneratedAt
      ? new Date(state.lastGeneratedAt).toISOString()
      : null,
  });
});

schedule.post('/:clerkId/replan', async (c) => {
  const user = c.get('user');
  const loaded = await loadQuestsForUser(user);

  const state = getState(user.id);
  const now = Date.now();
  const cfg = getUserConfig(user);
  const tasks = questsToTasks(loaded.regular, state.overrides, now);
  const result = replan(state.schedule, tasks, cfg, now);
  state.schedule = result.schedule;
  state.feasibilityReport = result.feasibilityReport;
  state.lastGeneratedAt = now;

  const questIdSet = new Set(loaded.regular.map((q) => q.id));
  await persistSchedule(user.id, state.schedule, questIdSet, now);

  return ok(c, {
    schedule: state.schedule.map(serializeBlock),
    feasibilityReport: state.feasibilityReport,
    generatedAt: new Date(state.lastGeneratedAt).toISOString(),
  });
});

schedule.post('/:clerkId/edit', async (c) => {
  const user = c.get('user');
  const parsed = EditSchema.safeParse(await c.req.json());
  if (!parsed.success) return err(c, 'BAD_REQUEST', parsed.error.message);

  const state = getState(user.id);
  if (state.schedule.length === 0) {
    return err(c, 'EMPTY_SCHEDULE', 'Generate a schedule first', 400);
  }

  let edit: Edit;
  const raw = parsed.data.edit;
  if (raw.kind === 'move_block') {
    edit = { kind: 'move_block', blockId: raw.blockId, newStart: new Date(raw.newStart).getTime() };
  } else {
    edit = raw as Edit;
  }
  state.schedule = applyEdit(state.schedule, edit);

  // Re-flow around the new edit.
  const loaded = await loadQuestsForUser(user);
  const now = Date.now();
  const cfg = getUserConfig(user);
  const tasks = questsToTasks(loaded.regular, state.overrides, now);
  const result = replan(state.schedule, tasks, cfg, now);
  state.schedule = result.schedule;
  state.feasibilityReport = result.feasibilityReport;
  state.lastGeneratedAt = now;

  const questIdSet = new Set(loaded.regular.map((q) => q.id));
  await persistSchedule(user.id, state.schedule, questIdSet, now);

  return ok(c, {
    schedule: state.schedule.map(serializeBlock),
    feasibilityReport: state.feasibilityReport,
  });
});

schedule.post('/:clerkId/fillers', async (c) => {
  const user = c.get('user');
  const parsed = FillersSchema.safeParse(await c.req.json());
  if (!parsed.success) return err(c, 'BAD_REQUEST', parsed.error.message);
  const state = getState(user.id);
  state.fillers = parsed.data.fillers;
  return ok(c, { fillers: state.fillers });
});

schedule.get('/:clerkId/fillers', (c) => {
  const user = c.get('user');
  const state = getState(user.id);
  return ok(c, { fillers: state.fillers });
});

schedule.get('/:clerkId/explain', (c) => {
  const user = c.get('user');
  const blockId = c.req.query('blockId');
  if (!blockId) return err(c, 'BAD_REQUEST', 'blockId query param required');
  const state = getState(user.id);
  return ok(c, { explanation: explainBlock(blockId, state.schedule) });
});

// Test-only reset hook — never invoked in production.
export function __resetScheduleStateForTests() {
  stateByUserId.clear();
}
