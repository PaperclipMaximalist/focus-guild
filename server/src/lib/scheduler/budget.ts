/**
 * Per-day budgeting — Phase 0 of the constructive pipeline.
 *
 * Decides each task's quota per day across the horizon, so big tasks
 * spread toward their deadline instead of front-loading day one. This
 * is the layer that owns cross-day spread + deadline safety; the
 * constructor below owns within-day texture (variety, pacing).
 *
 *   1. Build DayInfo for every day in the horizon (free intervals,
 *      total free minutes, working-hour boundaries).
 *   2. For each day in chronological order, walk eligible tasks in
 *      priority order and grant each a per-day chunk: roughly
 *      `remaining / daysAvailable`, clamped to free capacity and to
 *      `idealSessionRange × 3`. Drains as we go so lower-priority
 *      tasks share day's residual.
 *   3. Output: one DayBudget per day with ordered task quotas.
 *
 * Pure — same inputs → same outputs. Deterministic tie-break on
 * priorityScore.
 */

import { idealSessionRange, priorityScore } from './planner.js';
import { dayKey, userHourUtc, userMidnightUtc } from './tz.js';
import type { Block, Task, UserConfig } from './types.js';

const MS_PER_MIN = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MIN;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const EPSILON_MIN = 0.5;

export interface FreeInterval {
  start: number;
  end: number;
  day: string;
}

export interface DayInfo {
  /** Stable key for this day in user-local time (`YYYY-M-D`). */
  key: string;
  /** UTC ms for midnight in the user's timezone on this day. */
  midnightUtc: number;
  /** First instant we'd schedule on this day, clamped to `now`. */
  workStart: number;
  /** Last instant of working hours on this day. */
  workEnd: number;
  /** Free intervals on this day (immovable blocks already carved out). */
  freeIntervals: FreeInterval[];
  /** Sum of free-interval minutes (the total capacity to budget against). */
  freeMinutes: number;
  /** Pre-existing immovable blocks landing on this day (fixed + locked). */
  immovableThisDay: Block[];
}

export interface DayBudget {
  day: DayInfo;
  /** Tasks the planner should try to place today, with target minutes. */
  quotas: Array<{ task: Task; targetMin: number }>;
}

function sortBlocks(blocks: Block[]): Block[] {
  return [...blocks].sort((a, b) => (a.start - b.start) || (a.end - b.end));
}

/**
 * Build a DayInfo for each day in the horizon, in chronological order.
 * Free intervals are computed by subtracting `immovable` from each day's
 * working window — same algorithm the old planner used inline, hoisted
 * so budget + constructor share it.
 */
export function buildDayInfo(
  config: UserConfig,
  now: number,
  immovable: Block[],
): DayInfo[] {
  const tz = config.tzOffsetMin ?? 0;
  const horizonEnd = now + config.horizonDays * MS_PER_DAY;
  const sortedImmov = sortBlocks(immovable);
  const todayMidnight = userMidnightUtc(now, tz);
  const out: DayInfo[] = [];

  for (let d = 0; d < config.horizonDays; d += 1) {
    const midnight = todayMidnight + d * MS_PER_DAY;
    const wStart = Math.max(userHourUtc(midnight, config.workingHours.startHour), now);
    const wEnd = Math.min(userHourUtc(midnight, config.workingHours.endHour), horizonEnd);
    if (wEnd <= wStart) continue;

    const key = dayKey(midnight, tz);
    const todayImmov = sortedImmov.filter((b) => b.end > wStart && b.start < wEnd);

    const free: FreeInterval[] = [];
    let cursor = wStart;
    for (const b of todayImmov) {
      const bs = Math.max(b.start, wStart);
      const be = Math.min(b.end, wEnd);
      if (bs > cursor) free.push({ start: cursor, end: bs, day: key });
      cursor = Math.max(cursor, be);
    }
    if (cursor < wEnd) free.push({ start: cursor, end: wEnd, day: key });

    const freeMinutes = free.reduce((s, iv) => s + (iv.end - iv.start) / MS_PER_MIN, 0);
    out.push({
      key, midnightUtc: midnight,
      workStart: wStart, workEnd: wEnd,
      freeIntervals: free, freeMinutes,
      immovableThisDay: todayImmov,
    });
  }
  return out;
}

/**
 * For task `t`, the largest sensible per-day quota — a soft cap that keeps
 * any one task from monopolizing a day even when its share would technically
 * fit. Formula: 3× the ideal session ceiling. Big tasks (idealHi=90) get up
 * to 270min/day; medium (60) → 180min; small (=remainingMin) → that.
 */
function softMaxPerDay(t: Task): number {
  const [, hi] = idealSessionRange(t);
  return Math.max(hi * 3, hi);
}

/**
 * Allocate per-day quotas. Iterates day-by-day in time order; within each
 * day iterates tasks in priority order, granting each task its fair share
 * of remaining work spread across the days it has left, capped by
 * softMaxPerDay and by the day's residual capacity.
 *
 *   perDayWant = ceil(remainingForTask / daysAvailableForTask)
 *   grant      = min(perDayWant, softMaxPerDay, dayResidual, remainingForTask)
 *
 * Higher-priority tasks claim first → naturally spread, deadline-aware,
 * no task ever silently dropped (anything not granted by horizon end shows
 * up as feasibility shortfall in plan()).
 */
export function allocateBudgets(
  tasks: Task[],
  days: DayInfo[],
  now: number,
): DayBudget[] {
  const tz = 0;
  void tz; // future: tz for deadline-day rollover if we change semantics
  const remaining = new Map<string, number>(tasks.map((t) => [t.id, t.remainingMin]));
  const priority = new Map<string, number>(tasks.map((t) => [t.id, priorityScore(t, now)]));

  const budgets: DayBudget[] = days.map((d) => ({ day: d, quotas: [] }));

  for (let dayIdx = 0; dayIdx < days.length; dayIdx += 1) {
    const day = days[dayIdx]!;
    let residual = day.freeMinutes;
    if (residual < EPSILON_MIN) continue;

    // Tasks still eligible on this day, in priority order.
    const eligible = tasks
      .filter((t) => (remaining.get(t.id) ?? 0) > EPSILON_MIN && t.deadline > day.workStart)
      .sort((a, b) => {
        const diff = (priority.get(b.id) ?? 0) - (priority.get(a.id) ?? 0);
        if (Math.abs(diff) > 1e-6) return diff;
        return a.deadline - b.deadline || (a.id < b.id ? -1 : 1);
      });

    for (const task of eligible) {
      if (residual < EPSILON_MIN) break;
      const left = remaining.get(task.id) ?? 0;
      if (left <= EPSILON_MIN) continue;

      // Count this day's remaining usable days for this task.
      let daysAvailable = 0;
      for (let j = dayIdx; j < days.length; j += 1) {
        if (days[j]!.workStart >= task.deadline) break;
        daysAvailable += 1;
      }
      if (daysAvailable === 0) continue;

      const perDayWant = Math.ceil(left / daysAvailable);
      const grant = Math.floor(Math.min(perDayWant, softMaxPerDay(task), residual, left));
      if (grant < 1) continue;

      budgets[dayIdx]!.quotas.push({ task, targetMin: grant });
      residual -= grant;
      remaining.set(task.id, left - grant);
    }
  }
  return budgets;
}

/**
 * Public: compute remaining minutes per task after the budget pass.
 * `plan()` uses this to emit feasibility shortfalls for tasks that
 * didn't fit before their deadline within the horizon.
 */
export function remainingAfter(budgets: DayBudget[], tasks: Task[]): Map<string, number> {
  const granted = new Map<string, number>();
  for (const b of budgets) {
    for (const q of b.quotas) {
      granted.set(q.task.id, (granted.get(q.task.id) ?? 0) + q.targetMin);
    }
  }
  const remaining = new Map<string, number>();
  for (const t of tasks) {
    const got = granted.get(t.id) ?? 0;
    remaining.set(t.id, Math.max(0, t.remainingMin - got));
  }
  return remaining;
}
