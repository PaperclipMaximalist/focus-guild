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
import { crossesMidnight, dayKey, userHourUtc, userMidnightUtc, workDayMidnightUtc, workWindowUtc } from './tz.js';
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
  // The first day is the working day `now` falls in. For hours that run past
  // midnight (22–06) that is yesterday's date until the window closes: at
  // 01:00 the person is mid-session, and the rest of tonight is day one.
  const todayMidnight = workDayMidnightUtc(now, tz, config.workingHours);
  const out: DayInfo[] = [];

  for (let d = 0; d < config.horizonDays; d += 1) {
    const midnight = todayMidnight + d * MS_PER_DAY;
    // An end before the start is tomorrow's: the window, and so a work block,
    // may run past midnight. The day keeps the date its window starts on.
    const window = workWindowUtc(midnight, config.workingHours);
    const wStart = Math.max(window.start, now);
    const wEnd = Math.min(window.end, horizonEnd);
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
    if (config.mealGap && !crossesMidnight(config.workingHours)) keepMealFree(free, todayImmov, midnight, wStart, wEnd, config.mealGap);

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
 * Take the meal out of a day's free time. A day of quests from 9 to 6 was
 * planned straight through midday: a third of simulated people had no half
 * hour without a quest between 11:30 and 14:00 on such a day. Nothing is
 * taken when the span is mostly gone or outside quest hours, or when
 * something that isn't quest work already breaks it (a class, a lunch
 * date, a routine). The meal sits as near the middle of the span as the
 * day allows, so a replan finds the same half hour between its kept blocks.
 */
function keepMealFree(
  free: FreeInterval[],
  immovable: Block[],
  midnight: number,
  wStart: number,
  wEnd: number,
  meal: { fromHour: number; toHour: number; minutes: number },
): void {
  const len = meal.minutes * MS_PER_MIN;
  const spanStart = userHourUtc(midnight, meal.fromHour);
  const spanEnd = userHourUtc(midnight, meal.toHour);
  const from = Math.max(spanStart, wStart);
  const to = Math.min(spanEnd, wEnd);
  if (len <= 0 || to - from < 2 * len) return;
  const busy = immovable.reduce(
    (m, b) => (b.type === 'work' ? m : m + Math.max(0, Math.min(b.end, to) - Math.max(b.start, from))),
    0,
  );
  if (busy >= len) return;

  const ideal = spanStart + (spanEnd - spanStart - len) / 2;
  let best: { i: number; start: number } | null = null;
  for (let i = 0; i < free.length; i += 1) {
    const lo = Math.max(free[i]!.start, from);
    const hi = Math.min(free[i]!.end, to) - len;
    if (hi < lo) continue;
    const start = Math.min(hi, Math.max(lo, ideal));
    if (!best || Math.abs(start - ideal) < Math.abs(best.start - ideal)) best = { i, start };
  }
  if (!best) return;
  const iv = free[best.i]!;
  const parts: FreeInterval[] = [];
  if (best.start > iv.start) parts.push({ ...iv, end: best.start });
  if (best.start + len < iv.end) parts.push({ ...iv, start: best.start + len });
  free.splice(best.i, 1, ...parts);
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

/** Below this many minutes a day, nobody's day is crowded enough to level. */
const LEVEL_FLOOR_MIN = 120;

/** A day's grant below this, for a quest that isn't small, is a sliver to fold away. */
const SLIVER_MIN = 15;

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

/** A quest with this much left or less is one day's work: a single session, not a spread. */
export const ONE_DAY_MAX_MIN = 90;
/** A full sitting: what a day gives a bigger quest at the least, when it gives it anything. */
const FULL_SITTING_MIN = 50;

/**
 * The least a day gives `task` in the fair spread. `minSitting` is the
 * smallest block worth sitting down for; this is the smallest DAY of it.
 * With the two the same, every quest that could wait got 25 minutes a day:
 * a 90-minute reading as 25 today and 25 tomorrow, six essays a day at 25
 * minutes each (two thirds of simulated people had a heavy quest with 90+
 * minutes to go given under half an hour in a day). Up to 90 minutes goes on
 * one day, whole; more than that moves in full sittings on fewer days.
 */
export function dayDose(task: Task, left: number): number {
  if (left <= ONE_DAY_MAX_MIN) return left;
  const [, hi] = idealSessionRange(task);
  return Math.min(left, Math.max(minSitting(task, left), Math.min(hi, FULL_SITTING_MIN)));
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

/**
 * Minutes of one free interval left for work after the policy's breaks: a
 * short one every cycle, and the long one after `longBreakAfterMin` of work.
 * Ignoring the long break had the budget promise 420 minutes of a 510-minute
 * Sunday that the constructor, which does take it, could only fit 410 of.
 */
export function workableMin(
  lengthMin: number,
  policy?: { shortBreakAfterMin: number; shortBreakDurationMin: number; longBreakAfterMin?: number; longBreakDurationMin?: number },
): number {
  if (!policy || policy.shortBreakDurationMin <= 0) return lengthMin;
  const cycle = Math.max(1, policy.shortBreakAfterMin) + policy.shortBreakDurationMin;
  const breaks = Math.floor(lengthMin / cycle);
  let work = lengthMin - breaks * policy.shortBreakDurationMin;
  const longAfter = policy.longBreakAfterMin ?? 0;
  const extra = (policy.longBreakDurationMin ?? 0) - policy.shortBreakDurationMin;
  if (longAfter > 0 && extra > 0) work -= Math.floor(work / (longAfter + extra)) * extra;
  return work;
}

/**
 * The check-in's "minutes available today", if the plan's first day really
 * is today. Opened after working hours, the first day is tomorrow, and the
 * cap used to land on it: a Monday-night check-in of "2 hours" left all of
 * Tuesday idle after 11:55 with three hours of Tuesday deadlines unplaced.
 */
export function todayCap(days: DayInfo[], now: number, config: Pick<UserConfig, 'todayCapMin' | 'tzOffsetMin'>): number | undefined {
  if (config.todayCapMin === undefined || !days.length) return undefined;
  return isToday(days[0]!, now, config.tzOffsetMin ?? 0) ? config.todayCapMin : undefined;
}

/**
 * Is `day` the working day the user is in right now? Its date is today's, or
 * yesterday's when the window runs past midnight and is still open: at 01:00
 * with hours 22–06, the day that began on yesterday's date is "today" (the
 * check-in's minutes are for this session, and its work starts now).
 */
export function isToday(day: DayInfo, now: number, tzOffsetMin: number): boolean {
  return day.midnightUtc <= userMidnightUtc(now, tzOffsetMin);
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
  /**
   * Quests due in the plan that can't all make it (see `triage`). They are
   * repaired last, and never take time from a quest that can still finish.
   */
  dropped: ReadonlySet<string> = new Set(),
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

  // Level target: the work this plan owes, spread evenly over its days.
  // Small tasks go in whole, and used to land on the first day with room,
  // so a Monday collected every chore due that week (276 min against 28 on
  // Sunday) and the heavy work spilled into the evening low.
  let owed = 0;
  for (const t of tasks) owed += paceLeft.get(t.id) ?? t.remainingMin;
  // Floored, so levelling only acts when days are genuinely crowded: with a
  // light week, doing a lone chore today beats deferring it for balance.
  const levelTarget = days.length ? Math.max(LEVEL_FLOOR_MIN, Math.ceil(owed / days.length)) : Infinity;

  // ── PASS 1: fair spread ──
  for (let dayIdx = 0; dayIdx < days.length; dayIdx += 1) {
    const day = days[dayIdx]!;
    if (residuals[dayIdx]! < EPSILON_MIN) continue;
    let grantedToday = 0;

    // Working days `task` has from this one to its deadline. A deadline past
    // the horizon still has working days after it: counting only the horizon
    // days crammed a 12-day essay into 7, and then called the part that
    // didn't fit a shortfall.
    const daysFor = (task: Task): number => {
      let n = 0;
      for (let j = dayIdx; j < days.length; j += 1) {
        if (days[j]!.workStart >= task.deadline) break;
        n += 1;
      }
      return n === 0 ? 0 : n + daysBeyondHorizon(task, days);
    };
    // Work with days to spare can wait for a lighter day: a small task, or a
    // bigger one whose pace would still be a sitting a day after skipping
    // today. It still lands in time: once its deadline is two days out, or
    // the pace tightens, it goes in regardless (work due after the plan must
    // get this week's share inside it), and pass 2 guarantees it after that.
    // Only small tasks used to wait, so every day carried a slice of every
    // big quest.
    const canWait = (task: Task): boolean => {
      const left = remaining.get(task.id) ?? 0;
      const daysAvailable = daysFor(task);
      const dose = dayDose(task, left);
      const owedThisPlan = Math.min(left, paceLeft.get(task.id) ?? Infinity);
      return (
        daysAvailable > 2 &&
        owedThisPlan <= (days.length - dayIdx - 1) * dose &&
        (left <= ONE_DAY_MAX_MIN || Math.ceil(left / (daysAvailable - 1)) <= dose)
      );
    };

    // Work that can't wait first, then the rest in priority order: the day's
    // level has to count what must land on it before anything optional does.
    // In plain priority order an undated backlog quest took its sitting on a
    // Wednesday that a 10-hour report due Saturday then filled to the brim,
    // with Sunday to Tuesday nearly empty.
    const waits = new Map<string, boolean>();
    const eligible = tasks
      .filter(
        (t) =>
          (remaining.get(t.id) ?? 0) > EPSILON_MIN &&
          t.deadline > day.workStart &&
          (t.notBefore ?? 0) < day.workEnd,
      );
    for (const t of eligible) waits.set(t.id, canWait(t));
    eligible.sort((a, b) => {
      const w = Number(waits.get(a.id)) - Number(waits.get(b.id));
      if (w !== 0) return w;
      const diff = (priority.get(b.id) ?? 0) - (priority.get(a.id) ?? 0);
      if (Math.abs(diff) > 1e-6) return diff;
      return a.deadline - b.deadline || (a.id < b.id ? -1 : 1);
    });

    // A day too small for anyone's full dose (40 free minutes after school
    // and a club) still gets a real sitting of something: the second round
    // only runs if the first left the day empty. An empty day with quests
    // waiting is worse than a short sitting ("today's work starts now").
    for (const smallDay of [false, true]) {
    if (smallDay && grantedToday > 0) break;
    for (const task of eligible) {
      if (residuals[dayIdx]! < EPSILON_MIN) break;
      const left = remaining.get(task.id) ?? 0;
      if (left <= EPSILON_MIN) continue;

      const daysAvailable = daysFor(task);
      if (daysAvailable === 0) continue;

      // An even split alone shreds work: a 15-min chore over 7 days became
      // 3 min/day and a 2-hour reading 17 min/day, and nobody sits down for
      // 3 minutes. So every grant is at least one real sitting (`minSitting`)
      // and never leaves a remainder smaller than one — the spread still
      // happens for big tasks, it just moves in whole sessions.
      const sitting = minSitting(task, left);
      // A day's share is a full dose (see dayDose), not the smallest sitting.
      const dose = dayDose(task, left);
      const perDayWant = Math.max(Math.ceil(left / daysAvailable), dose);
      const placeable = usable(day, task.deadline);
      const pace = paceLeft.get(task.id) ?? Infinity;
      if (pace < 1) continue;
      const cap = Math.floor(Math.min(softMaxPerDay(task), residuals[dayIdx]!, placeable, left, pace + dose));
      let grant = Math.min(perDayWant, cap);
      // Absorb a sliver remainder today rather than stranding it for later.
      if (left - grant > 0 && left - grant < sitting && left <= cap) grant = left;
      // Too little room today for a real sitting: leave it for a later day
      // (or the deadline-safety pass), instead of placing a crumb. For work
      // that can wait the same goes for less than a full dose; work that
      // can't takes any real sitting.
      if (grant < (waits.get(task.id) && !smallDay ? dose : sitting) && grant < left) continue;
      if (waits.get(task.id) && grantedToday > 0 && grantedToday + grant > levelTarget) continue;
      if (grant < 1) continue;

      addQuota(budgets[dayIdx]!, task, grant);
      residuals[dayIdx]! -= grant;
      grantedToday += grant;
      remaining.set(task.id, left - grant);
      if (paceLeft.has(task.id)) paceLeft.set(task.id, pace - grant);
    }
    }
  }

  // ── PASS 2: deadline-safety repair ──
  // Only for work due inside the plan. Work due after it is on pace if pass 1
  // kept its daily share; pulling the rest forward would be exactly the
  // front-loading pass 1 exists to prevent.
  // Quests that can still finish come first; the ones that can't (triage)
  // get what's left, so a hopeless 5-hour problem set due in two hours
  // doesn't eat the only slot a 10-minute task due tonight had.
  const short = tasks
    .filter((t) => (remaining.get(t.id) ?? 0) > EPSILON_MIN && dueWithinPlan(t, days))
    .sort((a, b) => Number(dropped.has(a.id)) - Number(dropped.has(b.id)) || a.deadline - b.deadline || (a.id < b.id ? -1 : 1));

  /**
   * Grant `task` leftover capacity on days before its deadline. Strict mode
   * only takes whole sittings (or the whole remainder); the permissive
   * retry accepts any size, because a deadline beats a tidy block.
   */
  const fillFromResidual = (task: Task, left: number, strict: boolean, order: number[] = days.map((_, i) => i)): number => {
    for (const dayIdx of order) {
      if (left <= EPSILON_MIN) break;
      const day = days[dayIdx]!;
      if (day.workStart >= task.deadline) continue;
      if ((task.notBefore ?? 0) >= day.workEnd) continue;
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

  // Minutes each donor gave up, so it can be paid back where there's room.
  const donorsTouched = new Map<string, number>();
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
      if ((task.notBefore ?? 0) >= day.workEnd) continue;
      const budget = budgets[dayIdx]!;
      let room = usable(day, task.deadline) - grantedOnDay(budget, task.id);
      const donors = budget.quotas
        .filter((q) => canDonate(q.task, task, days, dropped))
        .sort((a, b) => Number(dropped.has(b.task.id)) - Number(dropped.has(a.task.id)) || b.task.deadline - a.task.deadline || (a.task.id < b.task.id ? -1 : 1));
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
        donorsTouched.set(donor.task.id, (donorsTouched.get(donor.task.id) ?? 0) + take);
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

  // Donors get their time back from what's left, whole sittings first. Work
  // due after the plan only needs back what it gave: it used to get nothing,
  // so a HIGH quest due in two weeks lent its Monday slot to Monday's
  // deadline and then sat out a week with three empty days in it.
  for (const task of tasks) {
    const gave = donorsTouched.get(task.id);
    if (!gave) continue;
    const owed = remaining.get(task.id) ?? 0;
    if (dueWithinPlan(task, days)) {
      let left = fillFromResidual(task, owed, true);
      left = fillFromResidual(task, left, false);
      remaining.set(task.id, left);
    } else {
      const back = Math.min(owed, gave);
      // Lightest day first, not the earliest: paid back in date order, every
      // quest that lent Monday and Tuesday to a deadline landed together on
      // Wednesday (316 of its 368 minutes, in a week at 42% load).
      const load = budgets.map((b) => b.quotas.reduce((m, q) => m + q.targetMin, 0));
      const lightest = days.map((_, i) => i).sort((a, b) => load[a]! - load[b]! || a - b);
      const left = fillFromResidual(task, back, true, lightest);
      remaining.set(task.id, owed - (back - left));
    }
  }

  // Slivers: a few minutes of a real quest alone on a day become a 4-minute
  // block. Fold them into a day that already has a sitting of it, if it has
  // room; work due after the plan just leaves them for a later week.
  for (let i = 0; i < budgets.length; i += 1) {
    for (const q of [...budgets[i]!.quotas]) {
      if (q.targetMin >= SLIVER_MIN || q.task.totalMin < 2 * SLIVER_MIN) continue;
      let folded = false;
      for (let j = 0; j < budgets.length && !folded; j += 1) {
        if (j === i) continue;
        const host = budgets[j]!.quotas.find((x) => x.task.id === q.task.id);
        if (!host || residuals[j]! < q.targetMin) continue;
        if (usable(days[j]!, q.task.deadline) - host.targetMin < q.targetMin) continue;
        host.targetMin += q.targetMin;
        residuals[j]! -= q.targetMin;
        residuals[i]! += q.targetMin;
        budgets[i]!.quotas = budgets[i]!.quotas.filter((x) => x !== q);
        folded = true;
      }
      if (!folded && !dueWithinPlan(q.task, days)) {
        residuals[i]! += q.targetMin;
        budgets[i]!.quotas = budgets[i]!.quotas.filter((x) => x !== q);
      }
    }
  }

  return budgets;
}

/**
 * May `donor` give up budgeted time to `task`, which is short of its deadline?
 * Normally only work due later gives way. A quest that can't make its
 * deadline anyway (triage) gives way to one that can, whatever the dates,
 * and never takes time from a quest due in the plan that could still finish.
 */
export function canDonate(donor: Task, task: Task, days: DayInfo[], dropped: ReadonlySet<string>): boolean {
  if (donor.id === task.id) return false;
  const donorDropped = dropped.has(donor.id);
  const taskDropped = dropped.has(task.id);
  if (donorDropped && !taskDropped) return true;
  if (taskDropped && !donorDropped && dueWithinPlan(donor, days)) return false;
  return donor.deadline > task.deadline;
}

/**
 * Which quests due inside the plan to give up on when they can't all fit,
 * keeping as many on time as possible (Moore–Hodgson): walk the deadlines in
 * order, and whenever the work so far overflows the time before the current
 * deadline, drop the quest that frees the most time for the least value.
 * Dropped quests still get any time that's left over; they just stop
 * outranking quests that can finish.
 */
export function triage(
  tasks: Task[],
  days: DayInfo[],
  todayCapMin?: number,
  policy?: { shortBreakAfterMin: number; shortBreakDurationMin: number },
): Set<string> {
  const dropped = new Set<string>();
  const due = tasks.filter((t) => dueWithinPlan(t, days)).sort((a, b) => a.deadline - b.deadline || (a.id < b.id ? -1 : 1));
  if (!due.length) return dropped;
  const capacityBefore = (deadline: number) => {
    let mins = 0;
    days.forEach((d, i) => {
      let m = usableMinBeforeDeadline(d, deadline, policy);
      if (i === 0 && todayCapMin !== undefined) m = Math.min(m, Math.max(0, todayCapMin));
      mins += m;
    });
    return mins;
  };
  // What the user said comes first: LOW-tier quests go before MED, and a HIGH
  // one only when nothing else is left to give up (the adapter marks the tier
  // in urgencyMultiplier). Within a tier, the most minutes per unit of
  // importance go first.
  const tier = (x: Task) => ((x.urgencyMultiplier ?? 1) >= 1.39 ? 2 : (x.urgencyMultiplier ?? 1) <= 0.71 ? 0 : 1);
  const cost = (x: Task) => x.remainingMin / (0.5 + x.importance);
  const worse = (a: Task, b: Task) => tier(a) < tier(b) || (tier(a) === tier(b) && cost(a) > cost(b));
  const kept: Task[] = [];
  let sum = 0;
  for (const t of due) {
    kept.push(t);
    sum += t.remainingMin;
    const cap = capacityBefore(t.deadline);
    while (sum > cap + EPSILON_MIN && kept.length) {
      let worst = 0;
      for (let i = 1; i < kept.length; i += 1) if (worse(kept[i]!, kept[worst]!)) worst = i;
      const [gone] = kept.splice(worst, 1);
      sum -= gone!.remainingMin;
      dropped.add(gone!.id);
    }
  }
  return dropped;
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
