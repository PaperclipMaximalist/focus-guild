/**
 * CAS aggregations.
 *
 * CAS is a lens over the same tracker items, so nothing here mutates or
 * filters into a separate list — these are read-only projections the CAS
 * views render. Pure functions, no DB, no clock beyond an injected `now`.
 *
 * Deliberately no hour totals in the default shape: IB requires no hour
 * logging, so hours only appear when the user has switched the optional
 * field on (see TrackerConfig.showHours).
 */

import { CAS_STRANDS, LEARNING_OUTCOMES, isCasTagged } from './config.js';
import type { CasStrand } from './config.js';

export interface CasItemLike {
  code: string;
  title: string;
  casStrands: string[];
  learningOutcomes: number[];
  isCourseworkLinked: boolean;
  isCasProject: boolean;
  casStartDate?: Date | string | null;
  casEndDate?: Date | string | null;
  hours?: number | null;
  updatedAt?: Date | string | null;
  reflections?: Array<{ date: Date | string; loTags: number[] }>;
}

function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const DAY_MS = 86_400_000;

/** Every learning outcome an item evidences, from the item and its reflections. */
export function evidencedOutcomes(item: CasItemLike): number[] {
  const set = new Set<number>(item.learningOutcomes);
  for (const r of item.reflections ?? []) for (const lo of r.loTags) set.add(lo);
  return [...set].filter((lo) => lo >= 1 && lo <= 7).sort((a, b) => a - b);
}

export interface MatrixCell {
  outcome: number;
  strand: CasStrand;
  /** Item codes supplying evidence for this pairing. */
  codes: string[];
}

export interface CoverageMatrix {
  outcomes: number[];
  strands: readonly CasStrand[];
  cells: MatrixCell[];
  /** Outcomes with no evidence in any strand — the actual gaps to act on. */
  uncoveredOutcomes: number[];
  coveredCount: number;
  totalCells: number;
}

/**
 * 7×3 coverage matrix: learning outcomes against strands, showing which
 * items supply evidence for each pairing.
 */
export function buildCoverageMatrix(items: CasItemLike[]): CoverageMatrix {
  const cas = items.filter(isCasTagged);
  const cells: MatrixCell[] = [];

  for (const outcome of LEARNING_OUTCOMES) {
    for (const strand of CAS_STRANDS) {
      const codes = cas
        .filter((i) => i.casStrands.includes(strand) && evidencedOutcomes(i).includes(outcome))
        .map((i) => i.code);
      cells.push({ outcome, strand, codes });
    }
  }

  const uncoveredOutcomes = LEARNING_OUTCOMES.filter((lo) =>
    cells.filter((c) => c.outcome === lo).every((c) => c.codes.length === 0),
  );

  return {
    outcomes: [...LEARNING_OUTCOMES],
    strands: CAS_STRANDS,
    cells,
    uncoveredOutcomes: [...uncoveredOutcomes],
    coveredCount: cells.filter((c) => c.codes.length > 0).length,
    totalCells: cells.length,
  };
}

export interface StrandBalance {
  strand: CasStrand;
  itemCount: number;
  /** Days since the most recent signal for this strand; null if never. */
  daysSinceLastActivity: number | null;
  /** Summed span of items with both CAS dates set. */
  totalDurationDays: number;
  /** Only populated when the optional hours field is enabled. */
  totalHours?: number;
}

/**
 * Balance across strands by recency and duration rather than hours.
 * "Last activity" is the newest of CAS end/start date, any reflection date,
 * or the item's own updatedAt — whichever the user actually touched.
 */
export function buildStrandBalance(
  items: CasItemLike[],
  now: Date,
  opts: { showHours?: boolean } = {},
): StrandBalance[] {
  const cas = items.filter(isCasTagged);

  return CAS_STRANDS.map((strand) => {
    const mine = cas.filter((i) => i.casStrands.includes(strand));

    let latest: number | null = null;
    let durationDays = 0;
    let hours = 0;

    for (const i of mine) {
      const start = toDate(i.casStartDate);
      const end = toDate(i.casEndDate);
      const stamps: number[] = [];
      if (start) stamps.push(start.getTime());
      if (end) stamps.push(end.getTime());
      const upd = toDate(i.updatedAt);
      if (upd) stamps.push(upd.getTime());
      for (const r of i.reflections ?? []) {
        const d = toDate(r.date);
        if (d) stamps.push(d.getTime());
      }
      for (const s of stamps) {
        // Ignore future-dated stamps when measuring recency.
        if (s <= now.getTime() && (latest === null || s > latest)) latest = s;
      }
      if (start && end && end.getTime() > start.getTime()) {
        durationDays += Math.round((end.getTime() - start.getTime()) / DAY_MS);
      }
      if (typeof i.hours === 'number') hours += i.hours;
    }

    const out: StrandBalance = {
      strand,
      itemCount: mine.length,
      daysSinceLastActivity:
        latest === null ? null : Math.max(0, Math.floor((now.getTime() - latest) / DAY_MS)),
      totalDurationDays: durationDays,
    };
    // 2dp, so quarter-hours survive while float noise does not.
    if (opts.showHours) out.totalHours = Math.round(hours * 100) / 100;
    return out;
  });
}

/**
 * Items that are both coursework-linked and CAS-tagged. CAS may not
 * double-count with DP coursework, so each of these needs the user to
 * resolve one side or the other.
 */
export function courseworkConflicts(items: CasItemLike[]): Array<{ code: string; title: string }> {
  return items
    .filter((i) => i.isCourseworkLinked && isCasTagged(i))
    .map((i) => ({ code: i.code, title: i.title }));
}
