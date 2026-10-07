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
import { MIN_SITTING_MIN, isToday, minSitting } from './budget.js';
import { userHourOf } from './tz.js';
import { composeWhy } from './explain.js';
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

/** Load at or above which a quest counts as heavy (a brain-killer). */
const HEAVY_LOAD = 0.7;
/** Load at or below which a quest counts as light. */
const LIGHT_LOAD = 0.5;
/** Shortest block for a quest that isn't small itself. */
const SLIVER_MIN = 15;
/** Length of the day's opening push on a heavy quest. */
const STARTER_MIN = 25;

/** Strength of the peak guard, on the same scale as the score weights. */
const PEAK_GUARD_WEIGHT = 1.2;

/**
 * Longest stretch of one quest with only short breaks in it. Past this a
 * person needs a real change of pace, however the sittings are counted (the
 * scenario lab flags "same quest for N min nearly straight" above it).
 */
const SAME_QUEST_RUN_MAX_MIN = 150;

/**
 * Cost, on the score scale, of a deadline errand cutting into the session of
 * the quest in hand. It lands on every candidate at that slot alike, so it
 * never picks between them: it makes the beam prefer the day that put the
 * errand first.
 */
const INTERRUPT_PENALTY = 1;

/** Smallest share of the day that opens with a starter push. */
const STARTER_SHARE_MIN = 60;
/** Score pull, on the weights' scale, for a quest that is due today. */
const DUE_TODAY_PULL = 1;
/** Free time to keep before a deadline inside the working day, beyond the work itself. */
const DEADLINE_MARGIN_MIN = 30;

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
  // Next start snaps up to a 5-minute mark: "14:01" reads like a machine
  // made it, "14:05" like a plan. Costs at most four minutes of slack.
  const start = Math.ceil((iv.start + minutes * MS_PER_MIN) / SNAP_MS) * SNAP_MS;
  if (iv.end - start < EPSILON_MIN * MS_PER_MIN) return null;
  return { ...iv, start };
}

const SNAP_MS = 5 * MS_PER_MIN;

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
 * How strictly variety is enforced on candidates. The caller walks down the
 * levels when one leaves the slot empty, so free time is never wasted:
 *
 *   mode    — the variety floor: no same-mode run past `floorN`.
 *   session — the floor is off (everything left is the same kind of work),
 *             but a quest that has just had its session still steps aside
 *             for the others: on a day of four essays, two sittings each in
 *             turn, not whichever scores best block by block.
 *   off     — anything that fits.
 */
type Variety = 'mode' | 'session' | 'off';

/**
 * Enumerate the candidate placements that could go at the current cursor,
 * at the given variety level.
 */
function enumerateCandidates(
  state: BeamState,
  budget: DayBudget,
  immovable: Block[],
  taskMap: Map<string, Task>,
  config: UserConfig,
  variety: Variety,
  floorN: number,
): Candidate[] {
  const iv = state.freeIntervals[0];
  if (!iv) return [];
  const refs = refsForState(state, immovable, taskMap);
  const out: Candidate[] = [];
  const weights = resolveScoreWeights(config);
  const inHand = questInHand(refs, iv.start);
  const dueToday = (t: Task) => t.deadline <= budget.day.midnightUtc + 24 * 60 * MS_PER_MIN;

  for (const q of budget.quotas) {
    const left = state.remaining.get(q.task.id) ?? 0;
    if (left < EPSILON_MIN) continue;
    if (iv.start >= q.task.deadline) continue;

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
    // A sitting is never longer than the quest's own max session. With "max
    // session 15" and 45 minutes to go, a sitting was the whole 45: no chunk
    // could leave a "real" tail, nothing was placed here, and the deadline
    // fill then put the 45 minutes down as one block.
    const sitting = Math.min(minSitting(q.task, left), Math.max(1, cap));
    const tail = left - chunkMin;
    if (tail > 0 && tail < sitting) {
      const whole = Math.floor(Math.min(left, usableMin, cap + TAIL_ABSORB_MIN));
      chunkMin = whole >= left ? left : Math.max(0, left - sitting);
    }
    // Momentum first: the day's opening block on a heavy quest is a short
    // starter push. Starting is the hard part with ADHD; 25 minutes on the
    // essay is easy to begin and still uses the morning peak for it.
    // "First" counts every work block of the day, the ones a replan kept in
    // place included: looking only at blocks placed in this pass, each replan
    // opened its new stretch with another 25-minute starter (a Saturday of 17
    // blocks, 16 of them 30 minutes or less).
    const firstOfDay = !refs.some((r) => r.block.end <= iv.start);
    // Only when today's share is an hour or more: a 50-minute share cut into
    // 25 + 25 is two fragments, not a warm-up and the work.
    if (firstOfDay && q.task.cognitiveLoad >= HEAVY_LOAD && chunkMin > STARTER_MIN && left - STARTER_MIN >= sitting && left >= STARTER_SHARE_MIN) {
      chunkMin = STARTER_MIN;
    }
    // And don't open a sliver at the end of an interval.
    if (chunkMin < sitting && chunkMin < left) continue;
    // Nor a last few minutes of a real quest on their own: ten minutes of a
    // three-hour chapter edit is a block nobody starts. They wait for a sitting.
    // (A quest capped below that by its own max session sits in full sessions.)
    if (chunkMin < Math.min(SLIVER_MIN, cap) && q.task.totalMin >= 2 * SLIVER_MIN && q.task.remainingMin > chunkMin) continue;
    if (chunkMin < 1) continue;

    if (variety !== 'off') {
      const session = sessionOf(q.task, refs, iv.start);
      // A session's last sitting shrinks to what the run still has room for,
      // if that is a real sitting: 25 + 50 + 50 + 25 on a crunch day, rather
      // than leaving at 125 minutes and coming back a third time for the rest.
      const room = SAME_QUEST_RUN_MAX_MIN - session.minutes;
      if (session.blocks > 0 && chunkMin > room && room >= MIN_SITTING_MIN && left - room >= minSitting(q.task, left - room)) {
        chunkMin = room;
      }
      if (!sessionAllows(q.task, chunkMin, left, q.targetMin, session, floorN, config)) continue;
      // Variety floor: no same-mode run past `floorN`, except for what the
      // quest in hand may do with its own session (see sessionAllows).
      if (variety === 'mode') {
        const run = sameModeRun(refs, iv.start, taskMode(q.task));
        if (run.length >= floorN && !run.every((r) => r.task.id === q.task.id)) continue;
      }
    }

    // Work due today goes before work that can wait, unless the hour suits
    // it badly enough to outweigh that (the peak guard, energy fit).
    // A cost on the work that can wait while today's is still open, not a
    // bonus on today's: a bonus is the same wherever in the day the block
    // lands, so the beam's totals never saw the order.
    const jumpsQueue = !dueToday(q.task) && budget.quotas.some((o) => dueToday(o.task) && (state.remaining.get(o.task.id) ?? 0) > EPSILON_MIN);
    const score =
      placementScore(q.task, chunkMin, iv.start, refs, weights, config) +
      peakGuard(q.task, iv.start, state, budget, config) -
      (jumpsQueue ? DUE_TODAY_PULL : 0);
    out.push({ task: q.task, chunkMin, start: iv.start, score });
  }

  // Determinism: stable order on score-tied candidates.
  out.sort((a, b) =>
    b.score !== a.score
      ? b.score - a.score
      : a.task.id < b.task.id ? -1 : 1,
  );
  // With a margin first: a quest due at 20:31 used to be placed 20:10–20:30,
  // after 25 minutes on something due in six days, because that was still
  // "feasible". Only when nothing leaves the margin does bare feasibility do.
  const roomy = out.filter((c) => keepsDeadlines(c, state, budget, config, DEADLINE_MARGIN_MIN));
  const safe = roomy.length ? roomy : out.filter((c) => keepsDeadlines(c, state, budget, config));
  // Stay with the quest in hand. While its session is open (the rules above
  // still allow it) and a deadline doesn't need the slot, it is the only
  // candidate: every score term judged one slot at a time, so the essay's
  // second sitting lost to whatever fit this hour a little better, and came
  // back later as a third and fourth pickup.
  if (variety !== 'off' && inHand) {
    const stay = out.find((c) => c.task.id === inHand.id);
    if (stay && safe.includes(stay)) return [stay];
    // A deadline inside the day needs this slot instead. That splits the
    // session, so a day that got the errand out of the way first should win.
    if (stay) for (const c of safe) c.score -= INTERRUPT_PENALTY;
  }
  return safe.length ? safe : out;
}

/**
 * Earliest-deadline feasibility: would placing `c` leave a quest due later
 * today without enough free time before its deadline? The beam orders the
 * day by score, and a 10-minute task due at 17:00 watched a two-week-away
 * errand take 16:55, then couldn't be placed at all (3% of simulated people
 * had a quest flagged short with the time sitting right there).
 */
function keepsDeadlines(c: Candidate, state: BeamState, budget: DayBudget, config: UserConfig, marginMin = 0): boolean {
  const after = c.start + (c.chunkMin + config.breakPolicy.shortBreakDurationMin) * MS_PER_MIN;
  // Only deadlines inside the working day: one at the end of it (or tonight)
  // is the budget's and reconcile's business, and guarding it here too turned
  // the whole day into strict deadline order, starving paced work.
  const checkpoints = new Set<number>();
  for (const q of budget.quotas) {
    const left = state.remaining.get(q.task.id) ?? 0;
    const d = q.task.deadline;
    if (left > EPSILON_MIN && q.task.id !== c.task.id && d < c.task.deadline && d > c.start && d < budget.day.workEnd)
      checkpoints.add(d);
  }
  for (const d of checkpoints) {
    let need = 0;
    for (const q of budget.quotas) {
      if (q.task.id === c.task.id || q.task.deadline > d) continue;
      need += Math.max(0, state.remaining.get(q.task.id) ?? 0);
    }
    let free = 0;
    for (const iv of state.freeIntervals) {
      const a = Math.max(iv.start, after);
      const b = Math.min(iv.end, d);
      if (b > a) free += (b - a) / MS_PER_MIN;
    }
    if (free < need + marginMin) return false;
  }
  return true;
}

/**
 * Keep the day's best hours for the work that needs them.
 *
 * energyFit only scores the slot being filled, so the beam, walking the day
 * from its first free minute, happily spent a 16:00 peak on a light
 * reflection and pushed two load-8 quests to 20:00 — then explained them as
 * "the sharper hours were full". This term looks at what is still owed
 * today: light work in a high-energy slot costs more while heavy work is
 * waiting, and heavy work in a low slot costs more while light work could
 * take it instead.
 */
function peakGuard(task: Task, start: number, state: BeamState, budget: DayBudget, config: UserConfig): number {
  const energy = config.energyCurve(userHourOf(start, config.tzOffsetMin ?? 0));
  let heavyLeft = 0;
  let lightLeft = 0;
  for (const q of budget.quotas) {
    if (q.task.id === task.id) continue;
    const left = state.remaining.get(q.task.id) ?? 0;
    if (left <= 0) continue;
    if (q.task.cognitiveLoad >= HEAVY_LOAD) heavyLeft += left;
    else if (q.task.cognitiveLoad <= LIGHT_LOAD) lightLeft += left;
  }
  if (task.cognitiveLoad <= LIGHT_LOAD && heavyLeft >= MIN_SITTING_MIN && energy >= 0.65) {
    return -PEAK_GUARD_WEIGHT * (energy - 0.5) * 2;
  }
  if (task.cognitiveLoad >= HEAVY_LOAD && lightLeft >= 15 && energy < 0.55) {
    return -PEAK_GUARD_WEIGHT * (0.55 - energy) * 2;
  }
  return 0;
}

/**
 * Same-mode run length ending at `cursor`, counting only a CONTIGUOUS chain
 * of blocks (each within ADJACENT_GAP_MAX_MIN of the next). A lunch gap or
 * an overnight boundary resets the run — mirrors monotonyPenalty's
 * adjacency semantics so the floor and the soft penalty agree.
 */
function sameModeRun(
  refs: PlacedRef[],
  cursor: number,
  targetMode: ReturnType<typeof taskMode>,
): PlacedRef[] {
  const gapMs = ADJACENT_GAP_MAX_MIN * 60_000;
  const chrono = [...refs]
    .filter((r) => r.block.end <= cursor)
    .sort((a, b) => b.block.end - a.block.end); // most recently ended first
  const run: PlacedRef[] = [];
  let at = cursor;
  for (const r of chrono) {
    if (at - r.block.end > gapMs) break; // real break — run over
    const m = taskMode(r.task);
    if (m.category === targetMode.category && m.load === targetMode.load && m.tedium === targetMode.tedium) {
      run.push(r);
      at = r.block.start;
    } else break;
  }
  return run;
}

/** The sittings of `task` that run up to `cursor` with only short breaks between. */
function sessionOf(task: Task, refs: PlacedRef[], cursor: number): { blocks: number; minutes: number } {
  const gapMs = ADJACENT_GAP_MAX_MIN * MS_PER_MIN;
  const chrono = refs.filter((r) => r.block.end <= cursor).sort((a, b) => b.block.end - a.block.end);
  let blocks = 0;
  let minutes = 0;
  let at = cursor;
  for (const r of chrono) {
    if (at - r.block.end > gapMs || r.task.id !== task.id) break;
    blocks += 1;
    minutes += (r.block.end - r.block.start) / MS_PER_MIN;
    at = r.block.start;
  }
  return { blocks, minutes };
}

/**
 * How long one quest's session may run before it makes way.
 *
 * Counting blocks alone treated "the essay again" like "a third essay": after
 * two sittings the quest had to leave, and its last 25 minutes came back two
 * quests later (25 reading, 25 portfolio, 50 reading, 25 inbox, 50 reading:
 * a third of simulated people had a quest picked up three or more times in
 * a day). A session is `floorN` sittings, and may go on a little:
 *
 *   - one short closing sitting that finishes the quest's work for today
 *     (25 + 50 + 25 is one session, not a session and an orphan);
 *   - one more full sitting when today holds more than two sessions' worth
 *     of it (a deadline crunch), so 250 minutes is two pickups of three
 *     sittings rather than three pickups of two;
 *
 * and never past SAME_QUEST_RUN_MAX_MIN of it nearly straight.
 */
function sessionAllows(
  task: Task,
  chunkMin: number,
  left: number,
  quotaMin: number,
  session: { blocks: number; minutes: number },
  floorN: number,
  config: UserConfig,
): boolean {
  if (session.blocks === 0) return true;
  if (session.minutes + chunkMin > SAME_QUEST_RUN_MAX_MIN) return false;
  if (session.blocks < floorN) return true;
  const closes = chunkMin >= left - EPSILON_MIN && chunkMin <= MIN_SITTING_MIN;
  const crunch = Math.ceil(quotaMin / Math.max(1, maxBlockMin(task, config))) > 2 * floorN;
  return session.blocks < floorN + (crunch ? 1 : 0) + (closes ? 1 : 0);
}

/**
 * The quest in hand at `cursor`: whatever the day's last work block was on,
 * however long ago. After lunch or a class it is still the thing to pick
 * back up; going to something else first makes that a separate pickup.
 */
function questInHand(refs: PlacedRef[], cursor: number): Task | null {
  return workBefore(refs, cursor)?.task ?? null;
}

/** The day's last work block ending at or before `cursor`, for "why now". */
export function workBefore(refs: PlacedRef[], cursor: number): { task: Task; end: number } | null {
  let last: PlacedRef | null = null;
  for (const r of refs) {
    if (r.block.end > cursor) continue;
    if (!last || r.block.end > last.block.end) last = r;
  }
  return last ? { task: last.task, end: last.block.end } : null;
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
function restAfter(blocks: BeamState['blocks'], end: number, config: UserConfig, task: Task, chunkMin: number): number {
  const p = config.breakPolicy;
  const { run, sinceLong } = runsEndingAt(blocks, end, config);
  if (sinceLong >= p.longBreakAfterMin) return p.longBreakDurationMin;
  if (run >= p.shortBreakAfterMin) return p.shortBreakDurationMin;
  // "No back-to-back brain-killers": a heavy sitting always earns a breather,
  // even when it was too short to trip the run threshold.
  if (task.cognitiveLoad >= HEAVY_LOAD && chunkMin >= MIN_SITTING_MIN) return p.shortBreakDurationMin;
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
  const rest = restAfter(blocks, c.start + c.chunkMin * MS_PER_MIN, config, c.task, c.chunkMin);
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

/** Load at which a day's work is worth moving to its best hours. */
const WINDOW_LOAD = 0.6;
/** Minutes of rest and slack the window allows per minute of work. */
const WINDOW_SLACK = 1.3;
/** A later window must be at least this much better on the energy curve to be worth it. */
const WINDOW_MIN_GAIN = 0.05;

/**
 * On a light day, where the work should go. The constructor walks the day
 * from its first free minute, so two hours of work always landed at the
 * start of the window: 13:30 for a night owl with hours until midnight,
 * whose sharp hours are 20–23 (the population lab had two thirds of owls'
 * heavy work in their slump). The energy curve only ordered work inside
 * that opening stretch. This picks the stretch of the day, long enough for
 * the work and its rests, with the best energy for it.
 *
 * Not today: opening the app to "start at 8pm" kills momentum, so today's
 * work still starts now. Not for a full day, a day with a preferred-hour
 * quest, or a light-work-only day, where it doesn't matter.
 */
export function focusWindow(budget: DayBudget, config: UserConfig, now: number): FreeInterval[] | null {
  const day = budget.day;
  if (isToday(day, now, config.tzOffsetMin ?? 0)) return null;
  const need = budget.quotas.reduce((m, q) => m + q.targetMin, 0);
  if (need <= 0) return null;
  if (!budget.quotas.some((q) => q.task.cognitiveLoad >= WINDOW_LOAD)) return null;
  if (budget.quotas.some((q) => q.task.preferredHour !== null)) return null;
  const span = Math.ceil((need * WINDOW_SLACK + 20) / 5) * 5;
  if (span >= day.freeMinutes * 0.8) return null;

  // Wrapped to 0–24: a window that runs past midnight (22–06) reaches hour 30
  // of its day, and the energy curves read that as "no energy at all".
  const hourAt = (t: number) => ((t - day.midnightUtc) / (60 * MS_PER_MIN)) % 24;
  const score = (s: number, e: number): { free: number; energy: number } => {
    let free = 0;
    let sum = 0;
    let n = 0;
    for (const iv of day.freeIntervals) {
      const a = Math.max(iv.start, s);
      const b = Math.min(iv.end, e);
      if (b <= a) continue;
      free += (b - a) / MS_PER_MIN;
      for (let t = a; t < b; t += 15 * MS_PER_MIN) { sum += config.energyCurve(hourAt(t)); n += 1; }
    }
    return { free, energy: n ? sum / n : 0 };
  };

  let first: number | null = null;
  let best: number | null = null;
  let bestEnergy = -Infinity;
  for (let s = day.workStart; s + span * MS_PER_MIN <= day.workEnd; s += 15 * MS_PER_MIN) {
    const { free, energy } = score(s, s + span * MS_PER_MIN);
    if (free < need * 1.15) continue;
    if (first === null) first = energy;
    if (energy > bestEnergy + 1e-9) { best = s; bestEnergy = energy; }
  }
  if (best === null || first === null || bestEnergy < first + WINDOW_MIN_GAIN) return null;
  const until = Math.min(day.workEnd, best + (span + 60) * MS_PER_MIN);
  return day.freeIntervals
    .map((iv) => ({ ...iv, start: Math.max(iv.start, best!), end: Math.min(iv.end, until) }))
    .filter((iv) => iv.end - iv.start >= MS_PER_MIN);
}

/**
 * Build a day: in its best window when it has room to spare (focusWindow),
 * across the whole day otherwise, or when the window couldn't hold it all.
 */
export function buildDay(
  budget: DayBudget,
  taskMap: Map<string, Task>,
  config: UserConfig,
  now: number,
): ConstructedDay {
  const window = focusWindow(budget, config, now);
  if (window) {
    const freeMinutes = window.reduce((m, iv) => m + (iv.end - iv.start) / MS_PER_MIN, 0);
    const focused = constructDay({ ...budget, day: { ...budget.day, freeIntervals: window, freeMinutes } }, taskMap, config);
    if (focused.unfulfilledByTaskId.size === 0) return focused;
  }
  return constructDay(budget, taskMap, config);
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

      let candidates = enumerateCandidates(state, budget, immovable, taskMap, config, 'mode', floorN);
      // Variety floor falls back to relaxed if it would leave the slot empty.
      if (candidates.length === 0) {
        candidates = enumerateCandidates(state, budget, immovable, taskMap, config, 'session', floorN);
        if (candidates.length === 0) candidates = enumerateCandidates(state, budget, immovable, taskMap, config, 'off', floorN);
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
    // The block before this one among ALL of today's work, kept blocks
    // included: with only the new ones, a replan's 16:00 block read "a short
    // first push" after a morning of work.
    const why = composeWhy({ task: t, start: blk.start, end: blk.end, prev: workBefore(replayRefs, blk.start), config });
    // Compact JSON: explain.ts shows `why`, falling back to `term` + `sign`;
    // `total` is handy for debugging.
    annotated[i] = {
      ...blk,
      note: JSON.stringify({
        term: dom.term,
        sign: dom.sign,
        total: Number(total.toFixed(2)),
        ...(why ? { why } : {}),
      }),
    };
    replayRefs.push({ block: { ...blk, id: 'tmp' } as Block, task: t });
  }

  return {
    blocks: annotated,
    totalScore: winner.totalScore,
    unfulfilledByTaskId: unfulfilled,
  };
}
