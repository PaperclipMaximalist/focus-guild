/**
 * Daily filler module — places short recurring tasks as immovable `fixed`
 * blocks before the main scheduler runs.
 *
 * Design:
 *   - Pure: deterministic given inputs.
 *   - Places one occurrence per (working) day per filler.
 *   - Honors preferredHour when set; otherwise spreads filler across the day.
 *   - Skips days where the slot would collide with an existing fixed block.
 *
 * A "filler" is short (default ≤ 15 min) and treated as mandatory but not
 * a high-value scoring contributor — that's why we pre-place them as fixed
 * blocks rather than letting the main scorer pick them (they would always
 * lose to deadline-driven work).
 */

import { crossesMidnight, userHourUtc, windowHours, workDayMidnightUtc, workWindowUtc } from './tz.js';
import type { Block } from './types.js';

export interface DailyFiller {
  id: string;
  name: string;
  durationMin: number;
  /** 0..23, or null for "anywhere in working hours". */
  preferredHour: number | null;
  /** Optional dependency on a quest being in a specific state — not yet used. */
  enabled?: boolean;
}

export interface FillerPlacementInput {
  fillers: DailyFiller[];
  now: number;
  horizonDays: number;
  workingHours: { startHour: number; endHour: number };
  /** Existing fixed/locked blocks to route around. */
  existingFixed: Block[];
  /** ms-epoch generator seed (kept deterministic). */
  idPrefix?: string;
  /**
   * User's timezone offset in minutes (`Date.getTimezoneOffset()` on the
   * client). When omitted defaults to 0 (UTC) — same back-compat default
   * the planner uses. Without this on Railway (UTC host), recurring
   * fillers were placed at user-local 2am-5am instead of their preferred
   * morning hour.
   */
  tzOffsetMin?: number;
}

const MS_PER_MIN = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MIN;
const MS_PER_DAY = 24 * MS_PER_HOUR;

function overlapsAny(s: number, e: number, blocks: Block[]): boolean {
  return blocks.some((b) => b.start < e && s < b.end);
}

/** Space left after a daily when the day has room, so dailies don't wall up. */
const FILLER_GAP_MIN = 10;

/**
 * A time of day implied by the name, for fillers with no preferredHour.
 * "End of day gym walkthrough" was being placed at 11:00 and "Bake morning
 * sourdough" at 12:30, because nothing read the words the user wrote.
 * Deliberately few, unambiguous patterns; an explicit preferredHour wins.
 *
 * Routines are personal time, so the hour isn't squeezed into quest hours:
 * a student whose quest hours start at 15:30 still takes morning meds in
 * the morning (the population lab had them at 15:20 for a quarter of students).
 */
export function inferPreferredHour(name: string, workingHours: { startHour: number; endHour: number }): number | null {
  const n = name.toLowerCase();
  // For hours that run past midnight the end of the day is the end of the
  // session (05:00 for 22–06), not a clamp back up to its start.
  if (/\b(end of (the )?day|eod)\b/.test(n))
    return crossesMidnight(workingHours)
      ? windowHours(workingHours) < 1 ? workingHours.startHour : (workingHours.endHour + 23) % 24
      : Math.max(workingHours.startHour, workingHours.endHour - 1);
  if (/\b(night|bedtime|before bed)\b/.test(n)) return Math.min(23, Math.max(workingHours.endHour - 1, 21));
  if (/\b(evening|tonight)\b/.test(n)) return Math.min(22, Math.max(workingHours.endHour - 1, 19));
  if (/\bafternoon\b/.test(n)) return 14;
  if (/\b(lunch|midday|noon)\b/.test(n)) return 12;
  if (/\b(morning|breakfast|first thing)\b/.test(n)) return Math.min(workingHours.startHour, 8);
  return null;
}

/** A routine whose time has been gone this long is skipped for today, not run late. */
const ROUTINE_MISSED_AFTER_MIN = 120;

/**
 * Place each filler once per day across the horizon as a `fixed` block.
 * Returns the new placements (does not include existingFixed).
 */
export function placeDailyFillers(input: FillerPlacementInput): Block[] {
  const { fillers, now, horizonDays, workingHours, existingFixed } = input;
  const prefix = input.idPrefix ?? 'filler';
  const tz = input.tzOffsetMin ?? 0;
  const placed: Block[] = [];
  let counter = 0;
  const allFixed = [...existingFixed];

  const enabled = fillers.filter((f) => f.enabled !== false);
  // Same days as the planner's (budget.buildDayInfo): the working day `now`
  // is in comes first, and a window that runs past midnight keeps the date it
  // starts on. With hours 22–06 this loop used to find `end <= start` on
  // every day and place no routines at all.
  const todayMidnight = workDayMidnightUtc(now, tz, workingHours);
  const pastMidnight = crossesMidnight(workingHours);

  for (let day = 0; day < horizonDays; day += 1) {
    const midnight = todayMidnight + day * MS_PER_DAY;
    const window = workWindowUtc(midnight, workingHours);
    const wStart = Math.max(window.start, now);
    const wEnd = window.end;
    if (wEnd <= wStart) continue;
    // The person's day ends at midnight, or with the session when it runs later.
    const dayEnd = Math.max(midnight + MS_PER_DAY, wEnd);

    // For each filler, find a slot for the day. We spread fillers by
    // their order in the array: first → near startHour, then linearly
    // distributed across the working window unless they have a preferredHour.
    const routineMin = enabled.reduce((a, f) => a + f.durationMin, 0);
    const roomy = routineMin * MS_PER_MIN <= (wEnd - wStart) / 2;
    const spreadStep = enabled.length > 0
      ? (wEnd - wStart) / Math.max(1, enabled.length)
      : 0;

    enabled.forEach((f, idx) => {
      const durMs = f.durationMin * MS_PER_MIN;
      const hour = f.preferredHour ?? inferPreferredHour(f.name, workingHours);
      // An hour before the session closes belongs to the night that is
      // ending: "02:00" on Monday's 22–06 day is Tuesday 02:00.
      const preferredStart =
        hour !== null
          ? userHourUtc(pastMidnight && hour < workingHours.endHour ? midnight + MS_PER_DAY : midnight, hour)
          : wStart + idx * spreadStep;
      // Morning meds at 16:30 is not morning meds: once the time is well
      // gone, today's is skipped rather than dropped on top of the afternoon.
      if (hour !== null && now - preferredStart > ROUTINE_MISSED_AFTER_MIN * MS_PER_MIN) return;
      // A routine with a time outside quest hours keeps its time.
      const lo = Math.max(now, Math.min(wStart, preferredStart));
      const hi = Math.min(dayEnd, Math.max(wEnd, preferredStart + durMs));

      // Try with breathing room around what's already placed; if the day is
      // too full for that, fall back to packing.
      // Only while routines leave room: when they fill most of the day,
      // spacing them out would just take the last minutes from real work.
      const gapMs = roomy ? FILLER_GAP_MIN * MS_PER_MIN : 0;
      const padded = allFixed.map((b) => ({ ...b, start: b.start - gapMs, end: b.end + gapMs }));
      const slot =
        findNearestSlot(preferredStart, durMs, lo, hi, padded) ??
        findNearestSlot(preferredStart, durMs, lo, hi, allFixed);
      if (slot == null) return; // skip this day for this filler

      counter += 1;
      const block: Block = {
        id: `${prefix}-${f.id}-${day}-${counter}`,
        start: slot,
        end: slot + durMs,
        type: 'fixed',
        taskId: null,
        locked: true,
        note: `Daily: ${f.name}`,
      };
      placed.push(block);
      allFixed.push(block);
    });
  }

  return placed;
}

/**
 * The free slot of length `durMs` inside [lo, hi] closest to `preferredStart`,
 * earlier or later (ties go earlier). Searching forward only lost the evening
 * walk every day for anyone whose bedtime reading sat just after it: the lab
 * found routines missing on 12% of people's days with room to spare.
 */
function findNearestSlot(
  preferredStart: number,
  durMs: number,
  lo: number,
  hi: number,
  taken: Array<{ start: number; end: number }>,
): number | null {
  const candidates = [preferredStart, lo, hi - durMs];
  for (const b of taken) candidates.push(b.end, b.start - durMs);
  let best: number | null = null;
  for (const s of candidates) {
    if (s < lo || s + durMs > hi) continue;
    if (taken.some((b) => b.start < s + durMs && s < b.end)) continue;
    const d = Math.abs(s - preferredStart);
    if (best === null || d < Math.abs(best - preferredStart) || (d === Math.abs(best - preferredStart) && s < best)) best = s;
  }
  return best;
}
