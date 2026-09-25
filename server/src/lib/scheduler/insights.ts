/**
 * What the plan can't say on its own.
 *
 * The feasibility report only speaks when a *deadline* is at risk. The
 * scenario lab and a real account found the plan staying silent while:
 *   - overdue quests dropped out of it entirely (only Rescue showed them),
 *   - daily routines took 7 of 9 working hours and quests got 30 min/day,
 *   - 94 hours of undated quests were on course to take months,
 *   - a student's school day ate the default 9–18 working hours,
 *   - estimates were consistently off, so every plan was too optimistic.
 *
 * Pure: callers pass the plan, the quests and the clock.
 */

import { userMidnightUtc, userHourUtc } from './tz.js';
import type { Block, Task, UserConfig } from './types.js';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

// ─── Estimate calibration ─────────────────────────────────────────────────────

export interface CompletedSample {
  category: string | null;
  estimatedMinutes: number;
  actualMinutes: number;
}

export interface Calibration {
  /** Multiplier applied to estimates with no category-specific data. */
  global: number;
  byCategory: Record<string, number>;
  /** How many finished quests the numbers came from. */
  sample: number;
}

/** Fewer finished quests than this and we trust the user's own numbers. */
export const MIN_SAMPLE = 5;
export const MIN_CATEGORY_SAMPLE = 3;
/** Bounds, so one wild session can't make every plan absurd. */
const CLAMP: [number, number] = [0.6, 2.0];
/** Within ±15% of the estimate is noise; don't change the plan for it. */
const DEADBAND = 0.15;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function settle(ratio: number): number {
  const r = Math.min(CLAMP[1], Math.max(CLAMP[0], ratio));
  return Math.abs(r - 1) < DEADBAND ? 1 : Math.round(r * 100) / 100;
}

/**
 * Learn how far estimates run from reality: the median of actual/estimate
 * over finished quests, per category where there's enough data. Median, not
 * mean — one quest left open over a weekend shouldn't set the rate.
 */
export function calibrateEstimates(samples: CompletedSample[]): Calibration | null {
  const usable = samples.filter((s) => s.estimatedMinutes >= 5 && s.actualMinutes >= 5);
  if (usable.length < MIN_SAMPLE) return null;
  const ratio = (s: CompletedSample) => s.actualMinutes / s.estimatedMinutes;
  const byCat = new Map<string, number[]>();
  for (const s of usable) {
    const k = s.category ?? 'deep_work';
    byCat.set(k, [...(byCat.get(k) ?? []), ratio(s)]);
  }
  const byCategory: Record<string, number> = {};
  for (const [k, rs] of byCat) if (rs.length >= MIN_CATEGORY_SAMPLE) byCategory[k] = settle(median(rs));
  return { global: settle(median(usable.map(ratio))), byCategory, sample: usable.length };
}

export function multiplierFor(cal: Calibration | null | undefined, category: string | null | undefined): number {
  if (!cal) return 1;
  return cal.byCategory[category ?? 'deep_work'] ?? cal.global;
}

// ─── Plan insights ────────────────────────────────────────────────────────────

export interface InsightQuest {
  id: string;
  title: string;
  deadline: Date | null;
}

export interface HoursSuggestion {
  startHour: number;
  endHour: number;
  reason: string;
}

export interface PlanInsights {
  overdue: Array<{ id: string; title: string; daysOverdue: number }>;
  /** Average minutes per plan day. */
  capacity: { working: number; routines: number; calendar: number; quests: number };
  backlog: { undatedMin: number; plannedThisWeekMin: number; weeksToClear: number | null } | null;
  hoursSuggestion: HoursSuggestion | null;
  calibration: Calibration | null;
  /** Ready-to-show sentences, most important first. */
  notes: string[];
}

export interface InsightInput {
  schedule: Block[];
  tasks: Task[];
  /** Active, non-recurring quests as stored (deadline null = undated). */
  quests: InsightQuest[];
  /** Fixed blocks from daily routines. */
  routineBlocks: Block[];
  /** Fixed blocks from connected calendars. */
  calendarBlocks: Block[];
  config: UserConfig;
  now: number;
  calibration: Calibration | null;
}

const overlapMin = (b: { start: number; end: number }, s: number, e: number) =>
  Math.max(0, Math.min(b.end, e) - Math.max(b.start, s)) / MIN;

const hours = (m: number) => {
  const h = m / 60;
  return h >= 10 || Number.isInteger(h) ? `${Math.round(h)}h` : `${h.toFixed(1)}h`;
};

/**
 * Suggest evening hours when a calendar (school, a job) fills most of the
 * working window on several weekdays. The default 9–18 plus a school day
 * leaves ~2.5 h and flags coursework infeasible that fits fine after school.
 */
export function suggestWorkingHours(calendarBlocks: Block[], config: UserConfig, now: number): HoursSuggestion | null {
  const tz = config.tzOffsetMin ?? 0;
  const { startHour, endHour } = config.workingHours;
  const today = userMidnightUtc(now, tz);
  const span = endHour - startHour;
  const busyEnds: number[] = [];
  let heavyDays = 0;
  for (let d = 0; d < config.horizonDays; d++) {
    const mid = today + d * DAY;
    const ws = userHourUtc(mid, startHour);
    const we = userHourUtc(mid, endHour);
    const covered = calendarBlocks.reduce((a, b) => a + overlapMin(b, ws, we), 0);
    if (covered >= span * 60 * 0.6) {
      heavyDays++;
      const lastEnd = Math.max(...calendarBlocks.filter((b) => b.end > ws && b.start < we).map((b) => b.end));
      busyEnds.push((lastEnd - mid) / (60 * MIN));
    }
  }
  if (heavyDays < 3) return null;
  // Start 20–40 min after the latest regular finish, on a half hour.
  const suggestedStart = Math.ceil((Math.max(...busyEnds) + 1 / 3) * 2) / 2;
  const suggestedEnd = Math.min(22, suggestedStart + Math.max(span, 5));
  if (suggestedStart >= 21 || suggestedEnd - suggestedStart < 3) return null;
  if (suggestedStart <= startHour) return null;
  return {
    startHour: suggestedStart,
    endHour: suggestedEnd,
    reason: `Your calendar fills most of ${fmtHour(startHour)}–${fmtHour(endHour)} on ${heavyDays} days this week`,
  };
}

export function fmtHour(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${hh}:${String(mm).padStart(2, '0')}`;
}

export function computeInsights(input: InsightInput): PlanInsights {
  const { schedule, tasks, quests, routineBlocks, calendarBlocks, config, now, calibration } = input;
  const tz = config.tzOffsetMin ?? 0;
  const today = userMidnightUtc(now, tz);
  const days = config.horizonDays;
  const notes: string[] = [];

  // Overdue: the planner can't schedule past a deadline, so these vanish.
  const overdue = quests
    .filter((q) => q.deadline && q.deadline.getTime() < now)
    .map((q) => ({ id: q.id, title: q.title, daysOverdue: Math.max(0, Math.floor((now - q.deadline!.getTime()) / DAY)) }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue);
  if (overdue.length) {
    notes.push(
      overdue.length === 1
        ? `"${overdue[0]!.title}" is overdue and isn't in the plan. Rescue it to give it a new date.`
        : `${overdue.length} overdue quests aren't in the plan. Rescue them to give them new dates.`,
    );
  }

  // Capacity, averaged over the plan's days.
  let working = 0;
  let routines = 0;
  let calendar = 0;
  for (let d = 0; d < days; d++) {
    const mid = today + d * DAY;
    const ws = userHourUtc(mid, config.workingHours.startHour);
    const we = userHourUtc(mid, config.workingHours.endHour);
    working += (we - ws) / MIN;
    routines += routineBlocks.reduce((a, b) => a + overlapMin(b, ws, we), 0);
    calendar += calendarBlocks.reduce((a, b) => a + overlapMin(b, ws, we), 0);
  }
  const work = schedule.filter((b) => b.type === 'work' && b.taskId);
  const questMin = work.reduce((a, b) => a + (b.end - b.start) / MIN, 0);
  const capacity = {
    working: Math.round(working / days),
    routines: Math.round(routines / days),
    calendar: Math.round(calendar / days),
    quests: Math.round(questMin / days),
  };
  if (capacity.working > 0 && capacity.routines >= capacity.working * 0.5) {
    notes.push(
      `Daily routines take ${hours(capacity.routines)} of your ${hours(capacity.working)} day, leaving about ${hours(capacity.quests)} for quests.`,
    );
  }

  // Undated backlog: never "infeasible", so it never spoke up.
  const undatedIds = new Set(quests.filter((q) => !q.deadline).map((q) => q.id));
  const undatedMin = tasks.filter((t) => undatedIds.has(t.id)).reduce((a, t) => a + t.remainingMin, 0);
  const plannedUndated = work.filter((b) => undatedIds.has(b.taskId!)).reduce((a, b) => a + (b.end - b.start) / MIN, 0);
  const plannedThisWeekMin = Math.round((plannedUndated * 7) / days);
  const weeksToClear = plannedThisWeekMin > 0 ? Math.ceil(undatedMin / plannedThisWeekMin) : null;
  const backlog = undatedMin > 0 ? { undatedMin, plannedThisWeekMin, weeksToClear } : null;
  if (backlog && undatedMin >= 10 * 60 && (weeksToClear === null || weeksToClear >= 3)) {
    notes.push(
      weeksToClear === null
        ? `${hours(undatedMin)} of undated quests have no time this week. Give the important ones a date, or let some go.`
        : `At this pace your ${hours(undatedMin)} of undated quests take about ${weeksToClear} weeks. Give the important ones a date, or let some go.`,
    );
  }

  const hoursSuggestion = suggestWorkingHours(calendarBlocks, config, now);

  if (calibration && calibration.global !== 1) {
    notes.push(
      calibration.global > 1
        ? `Quests have been taking about ${calibration.global}× your estimates (from ${calibration.sample} finished), so the plan allows for that.`
        : `Quests have been taking about ${calibration.global}× your estimates (from ${calibration.sample} finished): you're faster than you think.`,
    );
  }

  return { overdue, capacity, backlog, hoursSuggestion, calibration, notes };
}
