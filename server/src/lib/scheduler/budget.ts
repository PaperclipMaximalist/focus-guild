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
      // Nobody walks out of six hours of school straight into an essay.
      // After a long fixed block, the next free time starts a little later.
      const long = b.end - b.start >= TRANSITION_AFTER_MIN * MS_PER_MIN;
      const be = Math.min(b.end + (long ? TRANSITION_MIN * MS_PER_MIN : 0), wEnd);
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

/** Smallest piece the permissive deadline repair will hand out. */
const REPAIR_MIN_GRAB = 10;

/** A fixed block at least this long earns a transition gap after it. */
export const TRANSITION_AFTER_MIN = 90;
/** Minutes of transition after a long fixed block. */
export const TRANSITION_MIN = 20;

/** Tasks at or under this size are done in one sitting, never split. */
export const WHOLE_TASK_MAX_MIN = 45;
/** The shortest sitting worth scheduling for a task that isn't tiny. */
export const MIN_SITTING_MIN = 25;

/**
 * Smallest per-day grant worth making for `task` with `left` minutes to go.
 * Small tasks go in whole; bigger ones get at least half an ideal session
 * (30 min for mid-size, 45 for big), never less than MIN_SITTING_MIN.
 */
export function minSitting(task: Task, left: number): number {
  if (left <= WHOLE_TASK_MAX_MIN) return left;
  const [, hi] = idealSessionRange(task);
  return Math.min(left, Math.max(MIN_SITTING_MIN, Math.round(hi / 2)));
}

/**
 * Minutes of free time on `day` that fall strictly before `deadline`.
 * The constructor can never place a chunk past the deadline, so any
 * budget granted beyond this number is physically unplaceable.
 */
function usableMinBeforeDeadline(
  day: DayInfo,
  deadline: number,
  policy?: { shortBreakAfterMin: number; shortBreakDurationMin: number },
): number {
  let mins = 0;
  for (const iv of day.freeIntervals) {
    const end = Math.min(iv.end, deadline);
    if (end > iv.start) mins += workableMin((end - iv.start) / MS_PER_MIN, policy);
  }
  return Math.floor(mins);
}

/** Minutes of one free interval left for work after the policy's short breaks. */
export function workableMin(
  lengthMin: number,
  policy?: { shortBreakAfterMin: number; shortBreakDurationMin: number },
): number {
  if (!policy || policy.shortBreakDurationMin <= 0) return lengthMin;
  const cycle = Math.max(1, policy.shortBreakAfterMin) + policy.shortBreakDurationMin;
  const breaks = Math.floor(lengthMin / cycle);
  return lengthMin - breaks * policy.shortBreakDurationMin;
}

/** Whole days between the end of the horizon and `task`'s deadline. */
export function daysBeyondHorizon(task: Task, days: DayInfo[]): number {
  const last = days[days.length - 1];
  if (!last || task.deadline <= last.workEnd) return 0;
  return Math.floor((task.deadline - last.workEnd) / MS_PER_DAY);
}

/**
 * True when every working minute before `task`'s deadline is inside the plan.
 * The budget, the repair passes and the feasibility report all use this one
 * definition; they used to disagree by a few hours at the end of the week,
 * and a quest due Sunday night was skipped by one and flagged by another.
 */
export function dueWithinPlan(task: Task, days: DayInfo[]): boolean {
  return daysBeyondHorizon(task, days) === 0;
}

/** Minutes already granted to `taskId` in this day's budget. */
function grantedOnDay(budget: DayBudget, taskId: string): number {
  let mins = 0;
  for (const q of budget.quotas) if (q.task.id === taskId) mins += q.targetMin;
  return mins;
}

/** Add `mins` to a task's quota on a day, merging with an existing entry. */
function addQuota(budget: DayBudget, task: Task, mins: number): void {
  const existing = budget.quotas.find((q) => q.task.id === task.id);
  if (existing) existing.targetMin += mins;
  else budget.quotas.push({ task, targetMin: mins });
}

/**
 * Allocate per-day quotas in two passes.
 *
 * PASS 1 — fair spread. Day-by-day in time order; within each day tasks in
 * priority order, each granted its per-day share:
 *
 *   perDayWant = ceil(remainingForTask / daysAvailableForTask)
 *   grant      = min(perDayWant, softMaxPerDay, dayResidual,
 *                    usableMinBeforeDeadline − alreadyGranted, remaining)
 *
 * The usable-before-deadline cap is what makes the spread *deadline-
 * capacity* aware, not just deadline-day aware: a task due tomorrow 10am
 * can only receive tomorrow's pre-10am minutes there — day COUNT alone
 * would grant it a full half share that physically can't be placed.
 *
 * PASS 2 — deadline-safety repair. Any task still short after the fair
 * spread (in deadline order) grabs leftover residual from the earliest
 * days that still have usable pre-deadline time, ignoring softMaxPerDay —
 * day-balance is a preference, deadline safety is a guarantee. After this
 * pass, a feasibility shortfall means the time GENUINELY doesn't exist
 * before the deadline (or the user's check-in cap excludes it), never
 * that the budgeter mis-shaped the spread.
 */
export function allocateBudgets(
  tasks: Task[],
  days: DayInfo[],
  now: number,
  /** Optional cap on today's total budget (from the daily check-in). */
  todayCapMin?: number,
  /**
   * The break policy, so capacity is counted after the rests the constructor
   * will take. Without it the budget handed out every free minute and the
   * constructor couldn't place the last hour of a full day. Subtracted per
   * interval: a lone 30-minute gap needs no break and keeps all 30.
   */
  policy?: { shortBreakAfterMin: number; shortBreakDurationMin: number },
): DayBudget[] {
  const usable = (day: DayInfo, deadline: number) => usableMinBeforeDeadline(day, deadline, policy);
  const remaining = new Map<string, number>(tasks.map((t) => [t.id, t.remainingMin]));
  const priority = new Map<string, number>(tasks.map((t) => [t.id, priorityScore(t, now)]));

  // Pace for work due after the horizon: this plan owes it only the share of
  // its whole remaining work that falls on the plan's days. Counting minutes
  // already committed (reflow's stable blocks) keeps that share fixed, so a
  // no-change replan adds nothing.
  const paceLeft = new Map<string, number>();
  for (const t of tasks) {
    const beyond = daysBeyondHorizon(t, days);
    if (beyond === 0) continue;
    const inPlan = days.filter((d) => d.workStart < t.deadline).length;
    const committed = t.committedMin ?? 0;
    const share = Math.ceil(((t.remainingMin + committed) * inPlan) / Math.max(1, inPlan + beyond));
    paceLeft.set(t.id, Math.max(0, share - committed));
  }

  const budgets: DayBudget[] = days.map((d) => ({ day: d, quotas: [] }));
  // Per-day residual capacity, surviving into the repair pass.
  const residuals: number[] = days.map((d, i) => {
    let r = usableMinBeforeDeadline(d, Infinity, policy);
    if (i === 0 && todayCapMin !== undefined) r = Math.min(r, Math.max(0, todayCapMin));
    return r;
  });

  // ── PASS 1: fair spread ──
  for (let dayIdx = 0; dayIdx < days.length; dayIdx += 1) {
    const day = days[dayIdx]!;
    if (residuals[dayIdx]! < EPSILON_MIN) continue;

    const eligible = tasks
      .filter((t) => (remaining.get(t.id) ?? 0) > EPSILON_MIN && t.deadline > day.workStart)
      .sort((a, b) => {
        const diff = (priority.get(b.id) ?? 0) - (priority.get(a.id) ?? 0);
        if (Math.abs(diff) > 1e-6) return diff;
        return a.deadline - b.deadline || (a.id < b.id ? -1 : 1);
      });

    for (const task of eligible) {
      if (residuals[dayIdx]! < EPSILON_MIN) break;
      const left = remaining.get(task.id) ?? 0;
      if (left <= EPSILON_MIN) continue;

      let daysAvailable = 0;
      for (let j = dayIdx; j < days.length; j += 1) {
        if (days[j]!.workStart >= task.deadline) break;
        daysAvailable += 1;
      }
      if (daysAvailable === 0) continue;
      // A deadline past the horizon still has working days after it. Counting
      // only the horizon days crammed a 12-day essay into 7, and then called
      // the part that didn't fit a shortfall.
      daysAvailable += daysBeyondHorizon(task, days);

      // An even split alone shreds work: a 15-min chore over 7 days became
      // 3 min/day and a 2-hour reading 17 min/day, and nobody sits down for
      // 3 minutes. So every grant is at least one real sitting (`minSitting`)
      // and never leaves a remainder smaller than one — the spread still
      // happens for big tasks, it just moves in whole sessions.
      const sitting = minSitting(task, left);
      const perDayWant = Math.max(Math.ceil(left / daysAvailable), sitting);
      const placeable = usable(day, task.deadline);
      const pace = paceLeft.get(task.id) ?? Infinity;
      if (pace < 1) continue;
      const cap = Math.floor(Math.min(softMaxPerDay(task), residuals[dayIdx]!, placeable, left, pace + sitting));
      let grant = Math.min(perDayWant, cap);
      // Absorb a sliver remainder today rather than stranding it for later.
      if (left - grant > 0 && left - grant < sitting && left <= cap) grant = left;
      // Too little room today for a real sitting: leave it for a later day
      // (or the deadline-safety pass), instead of placing a crumb.
      if (grant < sitting && grant < left) continue;
      if (grant < 1) continue;

      addQuota(budgets[dayIdx]!, task, grant);
      residuals[dayIdx]! -= grant;
      remaining.set(task.id, left - grant);
      if (paceLeft.has(task.id)) paceLeft.set(task.id, pace - grant);
    }
  }

  // ── PASS 2: deadline-safety repair ──
  // Only for work due inside the plan. Work due after it is on pace if pass 1
  // kept its daily share; pulling the rest forward would be exactly the
  // front-loading pass 1 exists to prevent.
  const short = tasks
    .filter((t) => (remaining.get(t.id) ?? 0) > EPSILON_MIN && dueWithinPlan(t, days))
    .sort((a, b) => a.deadline - b.deadline || (a.id < b.id ? -1 : 1));

  /**
   * Grant `task` leftover capacity on days before its deadline. Strict mode
   * only takes whole sittings (or the whole remainder); the permissive
   * retry accepts any size, because a deadline beats a tidy block.
   */
  const fillFromResidual = (task: Task, left: number, strict: boolean): number => {
    for (let dayIdx = 0; dayIdx < days.length && left > EPSILON_MIN; dayIdx += 1) {
      const day = days[dayIdx]!;
      if (day.workStart >= task.deadline) break;
      if (residuals[dayIdx]! < EPSILON_MIN) continue;
      const placeable = usable(day, task.deadline) - grantedOnDay(budgets[dayIdx]!, task.id);
      const grab = Math.floor(Math.min(residuals[dayIdx]!, Math.max(0, placeable), left));
      if (grab < 1) continue;
      if (strict && grab < left && grab < minSitting(task, left)) continue;
      // Even a deadline doesn't justify a 3-minute block.
      if (!strict && grab < left && grab < REPAIR_MIN_GRAB) continue;
      addQuota(budgets[dayIdx]!, task, grab);
      residuals[dayIdx]! -= grab;
      left -= grab;
    }
    return left;
  };

  const donorsTouched = new Set<string>();
  for (const task of short) {
    let left = remaining.get(task.id) ?? 0;
    left = fillFromResidual(task, left, true);
    left = fillFromResidual(task, left, false);

    // Still short: take time back from work that is due LATER. Pass 1 hands
    // out fair shares in priority order, so an essay due in twelve days could
    // hold the only free hour before a 15-minute email due tomorrow, and the
    // email got reported as infeasible. Deadline safety outranks spread, so
    // the loosest grants on each pre-deadline day give way first.
    for (let dayIdx = 0; dayIdx < days.length && left > EPSILON_MIN; dayIdx += 1) {
      const day = days[dayIdx]!;
      if (day.workStart >= task.deadline) break;
      const budget = budgets[dayIdx]!;
      let room = usable(day, task.deadline) - grantedOnDay(budget, task.id);
      const donors = budget.quotas
        .filter((q) => q.task.deadline > task.deadline && q.task.id !== task.id)
        .sort((a, b) => b.task.deadline - a.task.deadline || (a.task.id < b.task.id ? -1 : 1));
      for (const donor of donors) {
        if (left <= EPSILON_MIN || room <= EPSILON_MIN) break;
        let take = Math.floor(Math.min(donor.targetMin, left, room));
        // Don't leave the donor a crumb: give up its whole grant instead.
        const donorLeft = donor.targetMin - take;
        if (donorLeft > 0 && donorLeft < minSitting(donor.task, donor.targetMin) && donor.targetMin <= room) {
          take = donor.targetMin;
        }
        if (take < 1) continue;
        donor.targetMin -= take;
        remaining.set(donor.task.id, (remaining.get(donor.task.id) ?? 0) + take);
        donorsTouched.add(donor.task.id);
        // Any surplus beyond this task's need returns to the day's residual.
        const used = Math.min(take, left);
        addQuota(budget, task, used);
        residuals[dayIdx]! += take - used;
        left -= used;
        room -= used;
      }
      budget.quotas = budget.quotas.filter((q) => q.targetMin >= 1);
    }
    remaining.set(task.id, left);
  }

  // Donors due inside the plan get their time back from what's left,
  // whole sittings first.
  for (const task of tasks) {
    if (!donorsTouched.has(task.id) || !dueWithinPlan(task, days)) continue;
    let left = remaining.get(task.id) ?? 0;
    left = fillFromResidual(task, left, true);
    left = fillFromResidual(task, left, false);
    remaining.set(task.id, left);
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
