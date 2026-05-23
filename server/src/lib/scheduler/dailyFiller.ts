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
}

const MS_PER_MIN = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MIN;
const MS_PER_DAY = 24 * MS_PER_HOUR;

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

function overlapsAny(s: number, e: number, blocks: Block[]): boolean {
  return blocks.some((b) => b.start < e && s < b.end);
}

/**
 * Place each filler once per day across the horizon as a `fixed` block.
 * Returns the new placements (does not include existingFixed).
 */
export function placeDailyFillers(input: FillerPlacementInput): Block[] {
  const { fillers, now, horizonDays, workingHours, existingFixed } = input;
  const prefix = input.idPrefix ?? 'filler';
  const placed: Block[] = [];
  let counter = 0;
  const allFixed = [...existingFixed];

  const enabled = fillers.filter((f) => f.enabled !== false);

  for (let day = 0; day < horizonDays; day += 1) {
    const dayStart = startOfDayLocal(now + day * MS_PER_DAY);
    const wStart = Math.max(setHourLocal(dayStart, workingHours.startHour), now);
    const wEnd = setHourLocal(dayStart, workingHours.endHour);
    if (wEnd <= wStart) continue;

    // For each filler, find a slot for the day. We spread fillers by
    // their order in the array: first → near startHour, then linearly
    // distributed across the working window unless they have a preferredHour.
    const spreadStep = enabled.length > 0
      ? (wEnd - wStart) / Math.max(1, enabled.length)
      : 0;

    enabled.forEach((f, idx) => {
      const durMs = f.durationMin * MS_PER_MIN;
      const preferredStart =
        f.preferredHour !== null
          ? setHourLocal(dayStart, f.preferredHour)
          : wStart + idx * spreadStep;

      const slot = findNonOverlappingSlot(
        preferredStart,
        durMs,
        wStart,
        wEnd,
        allFixed,
      );
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
