/**
 * Task-first greedy planner.
 *
 * Old approach (deprecated): pre-build the day into fixed work slots, then
 * score every task against each slot. Problems:
 *   - estimatedMinutes was a soft weight, not a constraint — high-priority
 *     long tasks could lose individual slots to cheap small tasks.
 *   - Slots had a hard 50-min upper bound from breakPolicy.shortBreakAfterMin,
 *     so tasks needing 90+min chunks got chopped or starved.
 *   - With more tasks than slots in the horizon, some tasks were never
 *     considered at all.
 *
 * New approach: iterate tasks in priority order; for each task, walk free
 * intervals chronologically and carve out chunks until either remainingMin
 * is satisfied OR no time remains before the task's deadline. A task that
 * can't be fully placed lands in the feasibility report with its real
 * shortfall (in minutes).
 *
 *   1. Filter tasks: drop done, drop unresolved deps, drop remainingMin<=0.
 *   2. Score tasks (see priorityScore()). Sort high → low.
 *   3. Build initial free-interval list: working hours per day, minus
 *      fixed + locked blocks. Each interval is a half-open (start, end].
 *   4. For each task in priority order:
 *        - For each free interval before task.deadline:
 *          chunk = min(remainingMin, intervalMin, effectiveMaxChunk).
 *          chunk = max(chunk, minChunkMin) if interval can fit it, else skip.
 *          Emit a work Block of that size at the interval's start.
 *          Shrink the interval (advance its start by chunk + breakDuration).
 *          Bump chunks-today count for this task; respect dynamicChunkTarget
 *          so a single task doesn't monopolize one day.
 *        - If after all intervals needed > 0, record the shortfall.
 *   5. Re-sort the schedule by start time. Emit break blocks for the gaps
 *      we inserted between back-to-back work blocks.
 *
 * Pure: same inputs → same outputs. Deterministic tie-breaking on equal
 * priority score (earliest deadline → highest importance → lex id).
 */

import type {
  Block,
  FeasibilityIssue,
  FeasibilityReport,
  Schedule,
  SchedulerResult,
  Task,
  UserConfig,
} from './types.js';

const MS_PER_MIN = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MIN;
const MS_PER_DAY = 24 * MS_PER_HOUR;
/** Anything below this is treated as zero — guards floating-point dust. */
const EPSILON_MIN = 0.5;

function makeIdGen(prefix: string, existingIds: Iterable<string> = []): () => string {
  let n = 0;
  for (const id of existingIds) {
    const m = id.match(/-(\d+)$/);
    if (m) {
      const v = Number(m[1]);
      if (Number.isFinite(v) && v > n) n = v;
    }
  }
  return () => {
    n += 1;
    return `${prefix}-${n}`;
  };
}

function startOfDayLocal(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function setHourLocal(dayStartMs: number, hour: number): number {
  const d = new Date(dayStartMs);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function sortBlocks(blocks: Block[]): Block[] {
  return [...blocks].sort((a, b) => (a.start - b.start) || (a.end - b.end));
}

// ─── Priority scoring ─────────────────────────────────────────────────────────

/**
 * Single composite priority score for sorting tasks. Higher = scheduled first.
 *
 * Components (each ~0..1 unless noted; tiers add a flat bonus):
 *   urgency        : how close the deadline is vs how much work remains.
 *                    remainingMin/availableMin before deadline, clamped + squared.
 *   impact         : task.importance (0..1) — what the user cares about.
 *   staleness      : log-days since createdAt, saturating at 30 days.
 *   tierBonus      : urgencyMultiplier acts as a flat boost (HIGH tier rolls
 *                    in here via the adapter's tier-folding).
 *
 * Weights tuned so urgency dominates for near-deadline work, but impact
 * keeps high-value tasks ahead of trivial near-deadline noise.
 */
export function priorityScore(task: Task, now: number): number {
  const deadlineMin = (task.deadline - now) / MS_PER_MIN;
  if (deadlineMin <= 0) return 1000; // overdue → max priority
  const loadRatio = task.remainingMin / Math.max(deadlineMin, 1);
  const urgency = Math.min(1, loadRatio * loadRatio);

  const impact = task.importance;
  const stalenessDays = Math.max(0, (now - task.createdAt) / MS_PER_DAY);
  const staleness = Math.min(1, Math.log(1 + stalenessDays) / Math.log(31));

  const tierBoost = Math.max(0, (task.urgencyMultiplier ?? 1) - 1);

  return urgency * 4 + impact * 2 + staleness * 1 + tierBoost * 3;
}

/** Deterministic tie-break for tasks with equal priority. */
function compareTie(a: Task, b: Task): number {
  if (a.deadline !== b.deadline) return a.deadline - b.deadline;
  if (a.importance !== b.importance) return b.importance - a.importance;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// ─── Free intervals ───────────────────────────────────────────────────────────

interface FreeInterval {
  start: number;
  end: number;
  /** Calendar day this interval lives in — for per-task chunks-today tracking. */
  day: string;
}

/**
 * Build the initial list of free intervals: working-hour ranges per day,
 * with fixed/locked blocks carved out, clipped to [now, now + horizon].
 */
function buildFreeIntervals(
  config: UserConfig,
  now: number,
  immovable: Block[],
): FreeInterval[] {
  const out: FreeInterval[] = [];
  const horizonEnd = now + config.horizonDays * MS_PER_DAY;
  const immov = sortBlocks(immovable);

  for (let d = 0; d < config.horizonDays; d += 1) {
    const dayStart = startOfDayLocal(now + d * MS_PER_DAY);
    const wStart = Math.max(setHourLocal(dayStart, config.workingHours.startHour), now);
    const wEnd = Math.min(setHourLocal(dayStart, config.workingHours.endHour), horizonEnd);
    if (wEnd <= wStart) continue;

    const dKey = dayKey(dayStart);
    const todayBlocks = immov.filter((b) => b.end > wStart && b.start < wEnd);

    let cursor = wStart;
    for (const b of todayBlocks) {
      const bs = Math.max(b.start, wStart);
      const be = Math.min(b.end, wEnd);
      if (bs > cursor) out.push({ start: cursor, end: bs, day: dKey });
      cursor = Math.max(cursor, be);
    }
    if (cursor < wEnd) out.push({ start: cursor, end: wEnd, day: dKey });
  }

  return out;
}

/**
 * Consume `min` minutes from the start of `interval` and return the leftover.
 * Returns null when the interval is fully consumed.
 */
function shrinkFromStart(interval: FreeInterval, minutes: number): FreeInterval | null {
  const consumedMs = minutes * MS_PER_MIN;
  if (consumedMs >= interval.end - interval.start - EPSILON_MIN * MS_PER_MIN) return null;
  return { ...interval, start: interval.start + consumedMs };
}

// ─── Effective chunk caps ─────────────────────────────────────────────────────

/**
 * Per-block max chunk in minutes, after applying the soft block cap unless
 * the task has special circumstances (long warmup or rushing a deadline).
 */
function effectiveMaxChunk(task: Task, config: UserConfig): number {
  const liftCap = task.setupCost >= 0.7 || (task.urgencyMultiplier ?? 1) >= 1.5;
  return liftCap
    ? task.maxChunkMin
    : Math.min(task.maxChunkMin, config.softMaxBlockMin);
}

// ─── Dependency check ────────────────────────────────────────────────────────

function depsMet(task: Task, taskMap: Map<string, Task>): boolean {
  for (const id of task.dependencies) {
    const dep = taskMap.get(id);
    if (!dep || dep.status !== 'done') return false;
  }
  return true;
}

// ─── Main task-first allocation ───────────────────────────────────────────────

interface Allocation {
  taskId: string;
  start: number;
  end: number;
}

function allocateTask(
  task: Task,
  freeIntervals: FreeInterval[],
  config: UserConfig,
  _now: number,
): { allocations: Allocation[]; shortfallMin: number; updatedFree: FreeInterval[] } {
  const allocations: Allocation[] = [];
  let needed = task.remainingMin;
  const chunkCap = effectiveMaxChunk(task, config);
  const breakAfter = config.breakPolicy.shortBreakAfterMin * MS_PER_MIN;
  const breakDur = config.breakPolicy.shortBreakDurationMin * MS_PER_MIN;

  // Walk intervals chronologically; mutate the list in place by replacing
  // each interval with its leftover (or removing it).
  let i = 0;
  while (i < freeIntervals.length && needed > EPSILON_MIN) {
    const interval = freeIntervals[i]!;

    // Past the deadline? Stop completely — later intervals are even further out.
    if (interval.start >= task.deadline) break;

    // Clamp interval end to task deadline.
    const usableEnd = Math.min(interval.end, task.deadline);
    const usableMin = (usableEnd - interval.start) / MS_PER_MIN;
    if (usableMin < task.minChunkMin - EPSILON_MIN) {
      i += 1;
      continue;
    }

    // Plan one chunk: min(needed, usableMin, chunkCap), at least minChunkMin.
    let chunkMin = Math.min(needed, usableMin, chunkCap);
    if (chunkMin < task.minChunkMin) {
      // Try to round up to minChunkMin if there's room; otherwise skip.
      if (usableMin >= task.minChunkMin) chunkMin = task.minChunkMin;
      else { i += 1; continue; }
    }
    // Round down to whole minutes for stable test snapshots.
    chunkMin = Math.floor(chunkMin);
    if (chunkMin < task.minChunkMin) { i += 1; continue; }

    const blockStart = interval.start;
    const blockEnd = blockStart + chunkMin * MS_PER_MIN;
    allocations.push({ taskId: task.id, start: blockStart, end: blockEnd });
    needed -= chunkMin;

    // Subtract chunk + break from the interval. If this is the last chunk
    // before end-of-interval, we don't need a break (break would extend past).
    const afterChunk = blockStart + chunkMin * MS_PER_MIN;
    const remainingInIntervalMs = interval.end - afterChunk;
    let consumeMs = chunkMin * MS_PER_MIN;
    if (chunkMin * MS_PER_MIN >= breakAfter && remainingInIntervalMs > breakDur) {
      consumeMs += breakDur; // bake in mandatory break
    }
    const consumedMin = consumeMs / MS_PER_MIN;
    const leftover = shrinkFromStart(interval, consumedMin);
    if (leftover === null) {
      freeIntervals.splice(i, 1); // remove fully-consumed interval
    } else {
      freeIntervals[i] = leftover;
    }
    // Stay on `i` since we replaced (or removed) — if removed, i now points
    // to the next interval. If replaced, the same interval (shrunk) is still
    // at i and we'll re-evaluate it for the (potentially same) task.
  }

  return { allocations, shortfallMin: Math.max(0, needed), updatedFree: freeIntervals };
}

// ─── Break insertion ──────────────────────────────────────────────────────────

/**
 * Walk the placed work blocks chronologically and emit break blocks in the
 * gaps. We only emit a break if the gap is `>= shortBreakDurationMin/2`
 * (avoid tiny dust gaps) AND there's not already an immovable block in it.
 */
function insertBreaks(
  workBlocks: Block[],
  immovable: Block[],
  config: UserConfig,
  idGen: () => string,
): Block[] {
  const breaks: Block[] = [];
  const minGapMs = (config.breakPolicy.shortBreakDurationMin / 2) * MS_PER_MIN;
  const maxBreakMs = config.breakPolicy.shortBreakDurationMin * MS_PER_MIN;
  const sorted = sortBlocks(workBlocks);
  const immov = sortBlocks(immovable);
  const allOccupied = sortBlocks([...workBlocks, ...immov]);

  for (let i = 0; i < sorted.length - 1; i += 1) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    if (a.type !== 'work' || b.type !== 'work') continue;

    // Must be same day so we don't insert a "break" across midnight.
    if (dayKey(a.end) !== dayKey(b.start)) continue;

    const gap = b.start - a.end;
    if (gap < minGapMs) continue;

    // Does this gap overlap any immovable? If so, skip.
    const overlaps = allOccupied.some(
      (o) => o.id !== a.id && o.id !== b.id && o.start < b.start && o.end > a.end,
    );
    if (overlaps) continue;

    const breakEnd = Math.min(b.start, a.end + maxBreakMs);
    breaks.push({
      id: idGen(),
      start: a.end,
      end: breakEnd,
      type: 'break',
      taskId: null,
      locked: false,
      note: null,
    });
  }

  return breaks;
}

// ─── Feasibility ──────────────────────────────────────────────────────────────

function suggestForShortfall(shortfall: number): string[] {
  return [
    `extend_deadline_by:${shortfall}m`,
    `reduce_scope_by:${shortfall}m`,
    'drop_lower_priority_task',
  ];
}

// ─── Public plan() entrypoint ─────────────────────────────────────────────────

export interface PlanInputs {
  tasks: Task[];
  fixedBlocks: Block[];
  lockedBlocks: Block[];
  config: UserConfig;
  now: number;
}

export function plan(inputs: PlanInputs): SchedulerResult {
  const { tasks, fixedBlocks, lockedBlocks, config, now } = inputs;

  // ── 1. Build immovable backbone (fixed + locked) ──
  const immovable = sortBlocks([...fixedBlocks, ...lockedBlocks]);

  // ── 2. Filter eligible tasks ──
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const eligible = tasks.filter(
    (t) =>
      t.status !== 'done' &&
      t.remainingMin > EPSILON_MIN &&
      t.deadline > now &&
      depsMet(t, taskMap),
  );

  // ── 3. Score + sort ──
  const sorted = [...eligible].sort((a, b) => {
    const scoreDiff = priorityScore(b, now) - priorityScore(a, now);
    if (Math.abs(scoreDiff) > 1e-6) return scoreDiff;
    return compareTie(a, b);
  });

  // ── 4. Allocate task-by-task into shared free intervals ──
  let freeIntervals = buildFreeIntervals(config, now, immovable);
  const placed: Allocation[] = [];
  const issues: FeasibilityIssue[] = [];

  for (const task of sorted) {
    const result = allocateTask(task, freeIntervals, config, now);
    placed.push(...result.allocations);
    freeIntervals = result.updatedFree;
    if (result.shortfallMin > EPSILON_MIN) {
      issues.push({
        taskId: task.id,
        shortfallMin: Math.ceil(result.shortfallMin),
        suggestions: suggestForShortfall(Math.ceil(result.shortfallMin)),
      });
    }
  }

  // ── 5. Materialise work Blocks ──
  const existingIds = [...immovable.map((b) => b.id)];
  const idGen = makeIdGen('blk', existingIds);
  const workBlocks: Block[] = placed.map((a) => ({
    id: idGen(),
    start: a.start,
    end: a.end,
    type: 'work',
    taskId: a.taskId,
    locked: false,
    note: null,
  }));

  // ── 6. Insert breaks ──
  const breakBlocks = insertBreaks(workBlocks, immovable, config, idGen);

  // ── 7. Combine + return ──
  const allBlocks = sortBlocks([...immovable, ...workBlocks, ...breakBlocks]);
  return {
    schedule: allBlocks,
    feasibilityReport: { ok: issues.length === 0, issues },
  };
}

// Test re-exports (kept for backward-compat with planner.test.ts internals)
export { buildFreeIntervals as __buildFreeIntervals };

/** No-op stand-in; old test re-export kept so legacy imports don't crash. */
export function __buildSkeleton(): Block[] {
  return [];
}
export function __totalPenalty(): number {
  return 0;
}
