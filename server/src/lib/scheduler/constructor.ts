/**
 * Within-day timeline-driven constructor with bounded beam search.
 *
 * Replaces the old "task-first, place each task to completion" loop with:
 *   For each cursor in the day's free intervals (time order):
 *     1. Enumerate candidate tasks with quota left + valid deadline.
 *     2. Apply the variety floor: filter candidates whose mode would
 *        extend a same-mode run beyond `varietyFloorN` (default 2 — so
 *        a third consecutive same-mode block is rejected).
 *     3. If the variety filter empties the candidates, *relax it* — we
 *        prefer placing something to leaving free time on the table.
 *     4. Score each surviving candidate (Phase A's placementScore).
 *     5. Fork the beam: each state in the beam expands by one option
 *        per candidate (plus a "skip this interval" no-op). Sort by
 *        cumulative score, prune to `beamWidth` (default 3).
 *
 * A small beam (3) with no explicit lookahead is enough at this scale:
 * by keeping multiple partial-day hypotheses alive, a locally-bad early
 * choice doesn't doom the rest of the day.
 *
 * Pure & deterministic: tie-breaks are stable (`taskId` lex, then start).
 */

import {
  ADJACENT_GAP_MAX_MIN,
  dominantTerm,
  idealSessionRange,
  placementBreakdown,
  placementScore,
  resolveScoreWeights,
  taskMode,
  totalFromBreakdown,
  type PlacedRef,
} from './planner.js';
import { minSitting } from './budget.js';
import type { DayBudget, FreeInterval } from './budget.js';
import type { Block, Task, UserConfig } from './types.js';

const MS_PER_MIN = 60_000;
const EPSILON_MIN = 0.5;

/** Number of partial-day states kept alive during construction. */
const DEFAULT_BEAM_WIDTH = 3;

/**
 * A break long enough to end a same-mode run (the run logic resets after
 * ADJACENT_GAP_MAX_MIN of daylight between blocks). A function, not a const:
 * planner.ts and this module import each other, so a module-level read of
 * the planner's constant runs before it is initialised.
 */
const varietyResetMin = () => ADJACENT_GAP_MAX_MIN + 1;

/** How far past the ideal ceiling a block may run to finish a task's quota. */
const TAIL_ABSORB_MIN = 20;
/**
 * Variety floor: reject a candidate that would make the same-mode run
 * length (including the candidate) exceed this. Default 2 = "no more
 * than 2 same-mode in a row." Tightened per-config via UserConfig.
 */
const DEFAULT_VARIETY_FLOOR = 2;

export interface ConstructedDay {
  /** Placed work blocks (no id yet — caller assigns via its own idGen). */
  blocks: Array<Omit<Block, 'id'>>;
  /** Cumulative placementScore across all placed blocks; useful for replan + tests. */
  totalScore: number;
  /** Per-task minutes that *should* have been placed today but weren't. */
  unfulfilledByTaskId: Map<string, number>;
}

interface BeamState {
  blocks: Array<Omit<Block, 'id'>>;
  freeIntervals: FreeInterval[];
  /** Quota minutes still available for each task today. */
  remaining: Map<string, number>;
  totalScore: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

function shrinkFromStart(iv: FreeInterval, minutes: number): FreeInterval | null {
  const consumedMs = minutes * MS_PER_MIN;
  const remainingMs = iv.end - iv.start - consumedMs;
  if (remainingMs < EPSILON_MIN * MS_PER_MIN) return null;
  return { ...iv, start: iv.start + consumedMs };
}

/** Build PlacedRef list from a state's placed blocks + immovable backdrop. */
function refsForState(
  state: BeamState,
  immovable: Block[],
  taskMap: Map<string, Task>,
): PlacedRef[] {
  const refs: PlacedRef[] = [];
  for (const b of state.blocks) {
    if (b.type !== 'work' || !b.taskId) continue;
    const t = taskMap.get(b.taskId);
    if (t) refs.push({ block: { ...b, id: 'tmp' } as Block, task: t });
  }
  for (const b of immovable) {
    if (b.type !== 'work' || !b.taskId) continue;
    const t = taskMap.get(b.taskId);
    if (t) refs.push({ block: b, task: t });
  }
  return refs;
}

function maxBlockMin(task: Task, config: UserConfig): number {
  const setupLifts = task.setupCost >= 0.7 || (task.urgencyMultiplier ?? 1) >= 1.5;
  return setupLifts ? task.maxChunkMin : Math.min(task.maxChunkMin, config.softMaxBlockMin);
}

interface Candidate {
  task: Task;
  chunkMin: number;
  start: number;
  score: number;
}

/**
 * Enumerate the candidate placements that could go at the current cursor.
 * `applyFloor` toggles the variety filter; the caller falls back to false
 * if the floor empties the candidate set, so we never waste a free slot.
 */
function enumerateCandidates(
  state: BeamState,
  budget: DayBudget,
  immovable: Block[],
  taskMap: Map<string, Task>,
  config: UserConfig,
  applyFloor: boolean,
  floorN: number,
): Candidate[] {
  const iv = state.freeIntervals[0];
  if (!iv) return [];
  const refs = refsForState(state, immovable, taskMap);
  const out: Candidate[] = [];
  const weights = resolveScoreWeights(config);

  for (const q of budget.quotas) {
    const left = state.remaining.get(q.task.id) ?? 0;
    if (left < EPSILON_MIN) continue;
    if (iv.start >= q.task.deadline) continue;

    // Variety floor: reject candidates that would make a same-mode run
    // longer than `floorN`. We estimate the prospective run length as
    // `monotonyPenalty > 0 IFF prior runLen > 1`. Use the underlying
    // primitive directly here for clarity.
    if (applyFloor) {
      const targetMode = taskMode(q.task);
      const runLen = countSameModeRun(refs, iv.start, targetMode);
      if (runLen >= floorN) continue;
    }

    // Chunk sizing: pull toward ideal, never exceed slot or hard cap.
    const [idealLo, idealHi] = idealSessionRange(q.task);
    const cap = maxBlockMin(q.task, config);
    const usableEnd = Math.min(iv.end, q.task.deadline);
    const usableMin = (usableEnd - iv.start) / MS_PER_MIN;
    const target = clamp(left, idealLo, idealHi);
    let chunkMin = Math.floor(Math.min(target, usableMin, cap, left));
    // Never leave a tail shorter than a real sitting: a 60-min quota placed
    // as 50 + 10 gives a 10-minute block nobody will start. Either finish it
    // in this block (small overshoot of the ideal) or leave a proper sitting.
    const sitting = minSitting(q.task, left);
    const tail = left - chunkMin;
    if (tail > 0 && tail < sitting) {
      const whole = Math.floor(Math.min(left, usableMin, cap + TAIL_ABSORB_MIN));
      chunkMin = whole >= left ? left : Math.max(0, left - sitting);
    }
    // And don't open a sliver at the end of an interval.
    if (chunkMin < sitting && chunkMin < left) continue;
    if (chunkMin < 1) continue;

    const score = placementScore(q.task, chunkMin, iv.start, refs, weights, config);
    out.push({ task: q.task, chunkMin, start: iv.start, score });
  }

  // Determinism: stable order on score-tied candidates.
  out.sort((a, b) =>
    b.score !== a.score
      ? b.score - a.score
      : a.task.id < b.task.id ? -1 : 1,
  );
  return out;
}

/**
 * Same-mode run length ending at `cursor`, counting only a CONTIGUOUS chain
 * of blocks (each within ADJACENT_GAP_MAX_MIN of the next). A lunch gap or
 * an overnight boundary resets the run — mirrors monotonyPenalty's
 * adjacency semantics so the floor and the soft penalty agree.
 */
function countSameModeRun(
  refs: PlacedRef[],
  cursor: number,
  targetMode: ReturnType<typeof taskMode>,
): number {
  const gapMs = ADJACENT_GAP_MAX_MIN * 60_000;
  const chrono = [...refs]
    .filter((r) => r.block.end <= cursor)
    .sort((a, b) => b.block.end - a.block.end); // most recently ended first
  let n = 0;
  let at = cursor;
  for (const r of chrono) {
    if (at - r.block.end > gapMs) break; // real break — run over
    const m = taskMode(r.task);
    if (m.category === targetMode.category && m.load === targetMode.load && m.tedium === targetMode.tedium) {
      n += 1;
      at = r.block.start;
    } else break;
  }
  return n;
}

/**
 * Work minutes in the unbroken run that ends at `end` (this block included),
 * plus the minutes worked since the last LONG rest. A gap of at least
 * `shortBreakDurationMin` ends a run; one of `longBreakDurationMin` resets the
 * long counter.
 */
function runsEndingAt(
  blocks: BeamState['blocks'],
  end: number,
  config: UserConfig,
): { run: number; sinceLong: number } {
  const shortGap = config.breakPolicy.shortBreakDurationMin * MS_PER_MIN;
  const longGap = config.breakPolicy.longBreakDurationMin * MS_PER_MIN;
  const work = blocks.filter((b) => b.type === 'work' && b.end <= end).sort((a, b) => b.end - a.end);
  let run = 0;
  let sinceLong = 0;
  let cursor = end;
  let inRun = true;
  for (const b of work) {
    const gap = cursor - b.end;
    if (gap >= longGap) break;
    if (gap >= shortGap) inRun = false;
    const m = (b.end - b.start) / MS_PER_MIN;
    if (inRun) run += m;
    sinceLong += m;
    cursor = b.start;
  }
  return { run, sinceLong };
}

/**
 * Rest owed after a block ending at `end`, per the user's break policy.
 * This is what makes `breakPolicy` real: the old planner packed intervals
 * edge to edge, so the "gaps are the breaks" design never produced a gap
 * and four straight hours of work was normal.
 */
function restAfter(blocks: BeamState['blocks'], end: number, config: UserConfig): number {
  const p = config.breakPolicy;
  const { run, sinceLong } = runsEndingAt(blocks, end, config);
  if (sinceLong >= p.longBreakAfterMin) return p.longBreakDurationMin;
  if (run >= p.shortBreakAfterMin) return p.shortBreakDurationMin;
  return 0;
}

/** Apply a candidate to a state, returning the successor state. */
function applyCandidate(state: BeamState, c: Candidate, config: UserConfig): BeamState {
  const iv = state.freeIntervals[0]!;
  // Note: we don't compute the explain-note here — that's only worth doing
  // for the WINNING candidate, so we defer it until after beam selection.
  const blocks = [
    ...state.blocks,
    {
      start: c.start,
      end: c.start + c.chunkMin * MS_PER_MIN,
      type: 'work' as const,
      taskId: c.task.id,
      locked: false,
      note: null,
    },
  ];
  const rest = restAfter(blocks, c.start + c.chunkMin * MS_PER_MIN, config);
  const leftoverIv = shrinkFromStart(iv, c.chunkMin + rest);
  const freeIntervals = leftoverIv === null
    ? state.freeIntervals.slice(1)
    : [leftoverIv, ...state.freeIntervals.slice(1)];
  const remaining = new Map(state.remaining);
  remaining.set(c.task.id, (remaining.get(c.task.id) ?? 0) - c.chunkMin);
  return {
    blocks,
    freeIntervals,
    remaining,
    totalScore: state.totalScore + c.score,
  };
}

/** Free minutes left today beyond what the remaining quotas need. */
function slackMin(state: BeamState): number {
  const free = state.freeIntervals.reduce((s, iv) => s + (iv.end - iv.start) / MS_PER_MIN, 0);
  let need = 0;
  for (const v of state.remaining.values()) need += Math.max(0, v);
  return free - need;
}

/** Leave `minutes` of the current interval empty: a rest, not a skip. */
function restFor(state: BeamState, minutes: number): BeamState {
  const iv = state.freeIntervals[0]!;
  const rest = shrinkFromStart(iv, minutes);
  return { ...state, freeIntervals: rest ? [rest, ...state.freeIntervals.slice(1)] : state.freeIntervals.slice(1) };
}

/** Drop the current free interval (skip-the-rest-of-this-gap). */
function skipInterval(state: BeamState): BeamState {
  return { ...state, freeIntervals: state.freeIntervals.slice(1) };
}

/**
 * Construct the day. Beam search across cursor decisions; expand each
 * state by placing one of the candidates or skipping the interval; prune
 * to `beamWidth` after every expansion round. Returns the best state.
 */
export function constructDay(
  budget: DayBudget,
  taskMap: Map<string, Task>,
  config: UserConfig,
): ConstructedDay {
  const beamWidth = (config as { beamWidth?: number }).beamWidth ?? DEFAULT_BEAM_WIDTH;
  const floorN = (config as { varietyFloorN?: number }).varietyFloorN ?? DEFAULT_VARIETY_FLOOR;
  const immovable = budget.day.immovableThisDay;

  const seed: BeamState = {
    blocks: [],
    freeIntervals: budget.day.freeIntervals,
    remaining: new Map(budget.quotas.map((q) => [q.task.id, q.targetMin])),
    totalScore: 0,
  };

  let beam: BeamState[] = [seed];

  // Bounded outer loop: in the worst case we walk one interval per round
  // (skip with no candidates). Free intervals × beam states bounds total work.
  // Safety: hard upper bound of 200 rounds — more than enough for 9-hour
  // working day chopped by handful of fixed blocks.
  for (let round = 0; round < 200; round += 1) {
    let progressed = false;
    const next: BeamState[] = [];

    for (const state of beam) {
      if (state.freeIntervals.length === 0) {
        next.push(state); // terminal
        continue;
      }

      let candidates = enumerateCandidates(state, budget, immovable, taskMap, config, true, floorN);
      // Variety floor falls back to relaxed if it would leave the slot empty.
      if (candidates.length === 0) {
        candidates = enumerateCandidates(state, budget, immovable, taskMap, config, false, floorN);
        // Everything left would extend a same-mode run. If the day has room,
        // step away long enough for the run to end (a walk between two
        // essays) rather than chaining a fourth heavy block. On a tight day
        // the work goes in anyway: finishing beats variety.
        if (candidates.length > 0 && slackMin(state) >= varietyResetMin()) {
          next.push(restFor(state, varietyResetMin()));
          progressed = true;
          continue;
        }
      }

      if (candidates.length === 0) {
        // No task can use this interval at all — skip it.
        next.push(skipInterval(state));
        progressed = true;
        continue;
      }

      // Branch on the candidates only. There used to be a "skip the rest of
      // this interval" branch too; it scored 0 while a tedious chore scored
      // below 0, so the beam preferred an empty evening to doing the chores
      // and reported them as infeasible. The budget already decided how much
      // work today holds; here we only decide its order. Rest comes from the
      // break policy in applyCandidate, not from abandoning free time.
      for (const c of candidates) next.push(applyCandidate(state, c, config));
      progressed = true;
    }

    if (!progressed) break;

    next.sort((a, b) => b.totalScore - a.totalScore);
    beam = next.slice(0, beamWidth);

    // Stop when every surviving state is terminal.
    if (beam.every((s) => s.freeIntervals.length === 0)) break;
  }

  const winner = beam[0]!;
  const unfulfilled = new Map<string, number>();
  for (const q of budget.quotas) {
    const left = winner.remaining.get(q.task.id) ?? 0;
    if (left > EPSILON_MIN) unfulfilled.set(q.task.id, left);
  }

  // Compute explain-notes for the winning placements. Replay the winning
  // sequence so the breakdown for each block sees only its prior context
  // (otherwise later blocks would leak into earlier blocks' "why").
  const weights = resolveScoreWeights(config);
  const replayRefs: PlacedRef[] = [];
  for (const b of immovable) {
    if (b.type !== 'work' || !b.taskId) continue;
    const t = taskMap.get(b.taskId);
    if (t) replayRefs.push({ block: b, task: t });
  }
  const annotated = [...winner.blocks].sort((a, b) => a.start - b.start);
  for (let i = 0; i < annotated.length; i += 1) {
    const blk = annotated[i]!;
    const t = blk.taskId ? taskMap.get(blk.taskId) : null;
    if (!t) continue;
    const chunkMin = (blk.end - blk.start) / MS_PER_MIN;
    const breakdown = placementBreakdown(t, chunkMin, blk.start, replayRefs, weights, config);
    const total = totalFromBreakdown(breakdown);
    const dom = dominantTerm(breakdown);
    // Compact JSON: explain.ts reads `term` + `sign` to phrase the reason;
    // `total` is handy for debugging.
    annotated[i] = {
      ...blk,
      note: JSON.stringify({ term: dom.term, sign: dom.sign, total: Number(total.toFixed(2)) }),
    };
    replayRefs.push({ block: { ...blk, id: 'tmp' } as Block, task: t });
  }

  return {
    blocks: annotated,
    totalScore: winner.totalScore,
    unfulfilledByTaskId: unfulfilled,
  };
}
