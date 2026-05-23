/**
 * Planner: builds a schedule from tasks + fixed blocks + locked existing blocks.
 *
 * Phase 1 — Skeleton: working-hour slots, fixed blocks, locked blocks, breaks.
 * Phase 2 — Fill:     iterate empty work slots, score candidates, place winner.
 * Phase 3 — Cleanup:  adjacent-swap if it reduces adjacency+switch penalties.
 * Phase 4 — Feasibility report.
 *
 * Pure: same inputs → same outputs. Deterministic tie-breaking.
 */

import { scoreTask, summarizeBreakdown, slackMin } from './scoring.js';
import type {
  Block,
  FeasibilityIssue,
  FeasibilityReport,
  Schedule,
  ScheduleContext,
  SchedulerResult,
  Task,
  UserConfig,
} from './types.js';

const MS_PER_MIN = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MIN;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/**
 * Stable, deterministic id generator. To avoid collisions with IDs of
 * blocks the caller already owns (e.g. locked blocks carried across replans),
 * the counter is bumped past any numeric suffix found in `existingIds`.
 */
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
  return [...blocks].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return a.end - b.end;
  });
}

function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Phase 1 — build the skeleton:
 *   - Empty work blocks spanning each day's working hours.
 *   - Carve out fixed blocks and locked blocks from those work blocks.
 *   - Insert breaks per policy into remaining work time.
 */
function buildSkeleton(
  fixed: Block[],
  lockedExisting: Block[],
  config: UserConfig,
  now: number,
  idGen: () => string,
): Block[] {
  const allImmovable = sortBlocks([...fixed, ...lockedExisting]);
  const out: Block[] = [...allImmovable];
  const windowStart = now;
  const windowEnd = now + config.horizonDays * MS_PER_DAY;

  for (let day = 0; day < config.horizonDays; day += 1) {
    const dayStart = startOfDayLocal(now + day * MS_PER_DAY);
    const wStart = Math.max(setHourLocal(dayStart, config.workingHours.startHour), windowStart);
    const wEnd = Math.min(setHourLocal(dayStart, config.workingHours.endHour), windowEnd);
    if (wEnd <= wStart) continue;

    // Compute free intervals within [wStart, wEnd] after subtracting immovables.
    const sortedImmovableToday = allImmovable
      .filter((b) => b.end > wStart && b.start < wEnd)
      .sort((a, b) => a.start - b.start);

    let cursor = wStart;
    const freeIntervals: Array<[number, number]> = [];
    for (const b of sortedImmovableToday) {
      const bs = Math.max(b.start, wStart);
      const be = Math.min(b.end, wEnd);
      if (bs > cursor) freeIntervals.push([cursor, bs]);
      cursor = Math.max(cursor, be);
    }
    if (cursor < wEnd) freeIntervals.push([cursor, wEnd]);

    // Within each free interval, lay down work blocks separated by breaks.
    for (const [s, e] of freeIntervals) {
      layWorkAndBreaks(s, e, config, idGen, out);
    }
  }

  return sortBlocks(out);
}

function layWorkAndBreaks(
  start: number,
  end: number,
  config: UserConfig,
  idGen: () => string,
  out: Block[],
): void {
  const { shortBreakAfterMin, shortBreakDurationMin, longBreakAfterMin, longBreakDurationMin } =
    config.breakPolicy;
  let cursor = start;
  let workSinceLongBreak = 0;
  while (cursor < end) {
    const remaining = (end - cursor) / MS_PER_MIN;
    if (remaining <= 0) break;
    const workMin = Math.min(remaining, shortBreakAfterMin);
    const workEnd = cursor + workMin * MS_PER_MIN;
    out.push({
      id: idGen(),
      start: cursor,
      end: workEnd,
      type: 'work',
      taskId: null,
      locked: false,
      note: null,
    });
    cursor = workEnd;
    workSinceLongBreak += workMin;
    if (cursor >= end) break;
    const breakDur = workSinceLongBreak >= longBreakAfterMin
      ? longBreakDurationMin
      : shortBreakDurationMin;
    if (workSinceLongBreak >= longBreakAfterMin) workSinceLongBreak = 0;
    const breakEnd = Math.min(end, cursor + breakDur * MS_PER_MIN);
    if (breakEnd > cursor) {
      out.push({
        id: idGen(),
        start: cursor,
        end: breakEnd,
        type: 'break',
        taskId: null,
        locked: false,
        note: null,
      });
      cursor = breakEnd;
    }
  }
}

/** Are all dependencies of `task` done? */
function depsMet(task: Task, taskMap: Map<string, Task>): boolean {
  for (const depId of task.dependencies) {
    const dep = taskMap.get(depId);
    if (!dep || dep.status !== 'done') return false;
  }
  return true;
}

/** Deterministic tie-break: earliest deadline → highest importance → lex id. */
function compareTie(a: Task, b: Task): number {
  if (a.deadline !== b.deadline) return a.deadline - b.deadline;
  if (a.importance !== b.importance) return b.importance - a.importance;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

interface FillState {
  remainingByTaskId: Map<string, number>;
  chunksTodayByTaskIdByDay: Map<string, Map<string, number>>;
}

function getChunksToday(state: FillState, day: string, taskId: string): number {
  return state.chunksTodayByTaskIdByDay.get(day)?.get(taskId) ?? 0;
}

function bumpChunksToday(state: FillState, day: string, taskId: string): void {
  let m = state.chunksTodayByTaskIdByDay.get(day);
  if (!m) {
    m = new Map();
    state.chunksTodayByTaskIdByDay.set(day, m);
  }
  m.set(taskId, (m.get(taskId) ?? 0) + 1);
}

/**
 * Phase 2 — Fill empty work blocks chronologically, splitting when a chunk
 * doesn't consume the full slot.
 */
function fillSchedule(
  skeleton: Block[],
  tasks: Task[],
  config: UserConfig,
  now: number,
  idGen: () => string,
): { schedule: Block[]; state: FillState } {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const state: FillState = {
    remainingByTaskId: new Map(tasks.map((t) => [t.id, t.remainingMin])),
    chunksTodayByTaskIdByDay: new Map(),
  };

  // We iterate chronologically; blocks may be split mid-iteration so we use
  // an index-based loop on a mutable copy.
  let blocks: Block[] = sortBlocks(skeleton);

  // Track recent work for adjacency. Newest first.
  const recentWork: Task[] = [];
  let prevTask: Task | null = null;

  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i]!;
    if (block.type !== 'work' || block.locked || block.taskId) {
      // Skip non-fillable; update recent context if it's a work block already assigned.
      if (block.type === 'work' && block.taskId) {
        const t = taskMap.get(block.taskId);
        if (t) {
          recentWork.unshift(t);
          if (recentWork.length > 3) recentWork.pop();
          prevTask = t;
        }
      }
      continue;
    }

    const blockDurationMin = (block.end - block.start) / MS_PER_MIN;
    const day = dayKey(block.start);

    // Build candidate list.
    type Scored = { task: Task; total: number; breakdown: ReturnType<typeof scoreTask>['breakdown'] };
    const candidates: Scored[] = [];
    let fallback: Scored | null = null;

    for (const task of tasks) {
      const rem = state.remainingByTaskId.get(task.id) ?? 0;
      if (rem <= 0) continue;
      if (task.status === 'done') continue;
      if (!depsMet(task, taskMap)) continue;
      if (task.minChunkMin > blockDurationMin) continue;
      if (task.deadline <= now) continue;

      const ctx: ScheduleContext = {
        prevTask,
        recentWorkTasks: [...recentWork],
        chunksTodayByTaskId: Object.fromEntries(
          [...(state.chunksTodayByTaskIdByDay.get(day)?.entries() ?? [])],
        ),
        blockStart: block.start,
        blockEnd: block.end,
      };
      const result = scoreTask(task, ctx, config, now);
      const slack = slackMin(task, now);
      const scored = { task, total: result.total, breakdown: result.breakdown };
      if (slack < 0) {
        // Excluded unless no other candidate exists.
        if (!fallback || scored.total > fallback.total) fallback = scored;
        continue;
      }
      candidates.push(scored);
    }

    let pick: Scored | null = null;
    if (candidates.length > 0) {
      candidates.sort((a, b) => {
        if (b.total !== a.total) return b.total - a.total;
        return compareTie(a.task, b.task);
      });
      pick = candidates[0]!;
    } else if (fallback) {
      pick = fallback;
    }

    if (!pick) {
      // Convert to buffer and continue.
      blocks[i] = { ...block, type: 'buffer' };
      continue;
    }

    const remainingForTask = state.remainingByTaskId.get(pick.task.id) ?? 0;
    // Effective max chunk: respect softMaxBlockMin unless the task has special
    // circumstances (high setupCost, high urgencyMultiplier) — keeps blocks ≤ 1.5h
    // by default. Always also respect the per-task hard maxChunkMin.
    const hasSpecial =
      pick.task.setupCost >= 0.7 || (pick.task.urgencyMultiplier ?? 1) >= 1.5;
    const effectiveMax = hasSpecial
      ? pick.task.maxChunkMin
      : Math.min(pick.task.maxChunkMin, config.softMaxBlockMin);
    const chunk = Math.min(effectiveMax, remainingForTask, blockDurationMin);
    const chunkEnd = block.start + chunk * MS_PER_MIN;
    const filled: Block = {
      ...block,
      end: chunkEnd,
      taskId: pick.task.id,
      note: summarizeBreakdown(pick.breakdown),
    };
    blocks[i] = filled;

    state.remainingByTaskId.set(pick.task.id, remainingForTask - chunk);
    bumpChunksToday(state, day, pick.task.id);
    recentWork.unshift(pick.task);
    if (recentWork.length > 3) recentWork.pop();
    prevTask = pick.task;

    // If leftover, splice in a new empty work block right after.
    if (chunkEnd < block.end) {
      const leftover: Block = {
        id: idGen(),
        start: chunkEnd,
        end: block.end,
        type: 'work',
        taskId: null,
        locked: false,
        note: null,
      };
      blocks = [...blocks.slice(0, i + 1), leftover, ...blocks.slice(i + 1)];
    }
  }

  return { schedule: sortBlocks(blocks), state };
}

/** Sum total penalty contribution from adjacency + switch over the whole schedule. */
function totalPenalty(schedule: Block[], taskMap: Map<string, Task>): number {
  let pen = 0;
  const recent: Task[] = [];
  let prev: Task | null = null;
  for (const b of schedule) {
    if (b.type !== 'work' || !b.taskId) {
      // Break resets adjacency window per spec? Spec says "non-break" — keep window across breaks.
      continue;
    }
    const t = taskMap.get(b.taskId);
    if (!t) continue;
    // adjacency
    let acc = 0;
    for (let i = 0; i < recent.length && i < 3; i += 1) {
      acc += recent[i]!.tediousness * Math.pow(0.6, i);
    }
    pen += Math.min(1, Math.max(0, (t.tediousness * acc) / 2));
    if (prev && prev.category !== t.category) pen += 1;
    recent.unshift(t);
    if (recent.length > 3) recent.pop();
    prev = t;
  }
  return pen;
}

/**
 * Phase 3 — Try swapping adjacent non-locked work blocks if it lowers
 * total adjacency + switch penalty, without violating any deadline or
 * chunk constraint. Up to 10 passes.
 */
function localSwap(schedule: Block[], tasks: Task[], now: number): Block[] {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  let current = [...schedule];

  for (let pass = 0; pass < 10; pass += 1) {
    let swapped = false;
    for (let i = 0; i < current.length - 1; i += 1) {
      const a = current[i]!;
      const b = current[i + 1]!;
      if (a.type !== 'work' || b.type !== 'work') continue;
      if (a.locked || b.locked) continue;
      if (!a.taskId || !b.taskId) continue;
      if (a.taskId === b.taskId) continue;

      const ta = taskMap.get(a.taskId);
      const tb = taskMap.get(b.taskId);
      if (!ta || !tb) continue;

      // Build proposed swap: keep time slots, swap taskIds (durations differ — so blocks must be back-to-back).
      // Skip if there's any gap between a and b.
      if (a.end !== b.start) continue;

      const aDur = (a.end - a.start) / MS_PER_MIN;
      const bDur = (b.end - b.start) / MS_PER_MIN;

      // Chunk constraints: each task must still fit the slot it lands in.
      if (tb.minChunkMin > aDur || ta.minChunkMin > bDur) continue;
      if (aDur > tb.maxChunkMin || bDur > ta.maxChunkMin) continue;

      // Deadline: the later block's task must still finish before its deadline.
      if (ta.deadline <= b.end || tb.deadline <= a.end) continue;

      const proposed = [...current];
      proposed[i] = { ...a, taskId: tb.id, note: a.note };
      proposed[i + 1] = { ...b, taskId: ta.id, note: b.note };

      if (totalPenalty(proposed, taskMap) < totalPenalty(current, taskMap)) {
        current = proposed;
        swapped = true;
      }
    }
    if (!swapped) break;
  }
  return current;
}

/**
 * Phase 4 — Feasibility report. A task is infeasible if total scheduled
 * minutes before its deadline are less than its remainingMin.
 */
function buildFeasibility(
  schedule: Block[],
  tasks: Task[],
  now: number,
): FeasibilityReport {
  const scheduledMinBefore = new Map<string, number>();
  for (const b of schedule) {
    if (b.type !== 'work' || !b.taskId) continue;
    if (b.start < now) continue;
    const mins = (b.end - b.start) / MS_PER_MIN;
    scheduledMinBefore.set(b.taskId, (scheduledMinBefore.get(b.taskId) ?? 0) + mins);
  }

  const issues: FeasibilityIssue[] = [];
  for (const t of tasks) {
    if (t.status === 'done' || t.remainingMin <= 0) continue;
    // Only count blocks that end before the deadline.
    let scheduled = 0;
    for (const b of schedule) {
      if (b.type !== 'work' || b.taskId !== t.id) continue;
      if (b.end <= t.deadline) scheduled += (b.end - b.start) / MS_PER_MIN;
    }
    if (scheduled + 1e-6 < t.remainingMin) {
      const shortfall = Math.ceil(t.remainingMin - scheduled);
      issues.push({
        taskId: t.id,
        shortfallMin: shortfall,
        suggestions: [
          `extend_deadline_by:${shortfall}m`,
          `reduce_scope_by:${shortfall}m`,
          'drop_lower_priority_task',
        ],
      });
    }
  }
  return { ok: issues.length === 0, issues };
}

export interface PlanInputs {
  tasks: Task[];
  fixedBlocks: Block[];
  lockedBlocks: Block[];
  config: UserConfig;
  now: number;
}

/** Pure planner entrypoint. Caller controls the id-gen seed for determinism. */
export function plan(inputs: PlanInputs): SchedulerResult {
  const { tasks, fixedBlocks, lockedBlocks, config, now } = inputs;
  const existingIds = [...fixedBlocks.map((b) => b.id), ...lockedBlocks.map((b) => b.id)];
  const idGen = makeIdGen('blk', existingIds);

  const skeleton = buildSkeleton(fixedBlocks, lockedBlocks, config, now, idGen);
  const { schedule: filled } = fillSchedule(skeleton, tasks, config, now, idGen);
  const swapped = config.weights.adjacency + config.weights.switch > 0
    ? localSwap(filled, tasks, now)
    : filled;
  const feasibilityReport = buildFeasibility(swapped, tasks, now);
  return { schedule: swapped, feasibilityReport };
}

// Re-exports for tests
export { buildSkeleton as __buildSkeleton, totalPenalty as __totalPenalty };
