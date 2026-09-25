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

import { userHourUtc, userMidnightUtc } from './tz.js';
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
 */
export function inferPreferredHour(name: string, workingHours: { startHour: number; endHour: number }): number | null {
  const n = name.toLowerCase();
  const clamp = (h: number) => Math.min(Math.max(h, workingHours.startHour), workingHours.endHour - 1);
  if (/\b(end of (the )?day|eod|evening|tonight|night|bedtime)\b/.test(n)) return clamp(workingHours.endHour - 1);
  if (/\bafternoon\b/.test(n)) return clamp(14);
  if (/\b(lunch|midday|noon)\b/.test(n)) return clamp(12);
  if (/\b(morning|breakfast|first thing)\b/.test(n)) return clamp(workingHours.startHour);
  return null;
}

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
  const todayMidnight = userMidnightUtc(now, tz);

  for (let day = 0; day < horizonDays; day += 1) {
    const midnight = todayMidnight + day * MS_PER_DAY;
    const wStart = Math.max(userHourUtc(midnight, workingHours.startHour), now);
    const wEnd = userHourUtc(midnight, workingHours.endHour);
    if (wEnd <= wStart) continue;

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
      const preferredStart =
        hour !== null
          ? userHourUtc(midnight, hour)
          : wStart + idx * spreadStep;

      // Try with breathing room around what's already placed; if the day is
      // too full for that, fall back to packing.
      // Only while routines leave room: when they fill most of the day,
      // spacing them out would just take the last minutes from real work.
      const gapMs = roomy ? FILLER_GAP_MIN * MS_PER_MIN : 0;
      const padded = allFixed.map((b) => ({ ...b, start: b.start - gapMs, end: b.end + gapMs }));
      const slot =
        findNonOverlappingSlot(preferredStart, durMs, wStart, wEnd, padded) ??
        findNonOverlappingSlot(preferredStart, durMs, wStart, wEnd, allFixed);
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
 * Find the earliest slot ≥ preferredStart of length `durMs` that fits inside
 * [wStart, wEnd] and doesn't overlap any block in `taken`. If preferredStart
 * is inside a taken block, advance to its end. Returns null if no fit.
 */
function findNonOverlappingSlot(
  preferredStart: number,
  durMs: number,
  wStart: number,
  wEnd: number,
  taken: Block[],
): number | null {
  let s = Math.max(preferredStart, wStart);
  if (s + durMs > wEnd) s = wStart; // wrap to earliest possible
  // Walk through taken blocks in order of start.
  const sorted = [...taken].sort((a, b) => a.start - b.start);
  for (let attempt = 0; attempt < sorted.length + 2; attempt += 1) {
    if (s + durMs > wEnd) return null;
    const conflict = sorted.find((b) => b.start < s + durMs && s < b.end);
    if (!conflict) return s;
    s = conflict.end;
  }
  return null;
}
