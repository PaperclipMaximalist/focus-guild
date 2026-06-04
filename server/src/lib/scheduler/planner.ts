/**
 * Task-first insertion planner with adaptive scoring.
 *
 * Pipeline:
 *   1. Filter eligible tasks (status, remainingMin, deps, deadline).
 *   2. Score + sort tasks by priorityScore() — desc.
 *   3. For each task in priority order, call insertOne() which scores every
 *      candidate gap and splices the highest-scoring chunk in. Repeats until
 *      the task is satisfied or no gap is acceptable.
 *   4. Tasks that couldn't be fully placed land in feasibilityReport with
 *      their real shortfall in minutes.
 *
 * Key differences from earlier versions:
 *   - NO auto-break blocks. Gaps between work blocks ARE the breaks. The
 *     client visualizes the energy meter dipping so the user knows when to
 *     leave a gap.
 *   - Soft min/max session penalties (not hard caps). A chunk outside the
 *     ideal range is allowed if no better gap exists, just with a score
 *     penalty proportional to how far outside it lands.
 *   - 3 weights instead of 9: urgency, importance, energy-fit. The other
 *     factors (clustering, cooldown, switch) are flat coefficients inside
 *     placementScore(), not user-tunable.
 *   - Same insertion engine drives both batch generate (Reflow Day) and
 *     incremental add-one-quest, so behavior is consistent.
 *
 * Pure: same inputs → same outputs. Deterministic tie-break on equal score.
 */

import type {
  Block,
  FeasibilityIssue,
  Schedule,
  SchedulerResult,
  Task,
  UserConfig,
} from './types.js';

const MS_PER_MIN = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MIN;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const EPSILON_MIN = 0.5;

// ─── Defaults for sitting-time soft bounds ────────────────────────────────────
// A "big" task (≥60 min remaining) wants sessions in this range. The planner
// will violate these if no better gap exists, but each violation costs score.

/** Default soft floor on per-session length, in minutes. */
const DEFAULT_SOFT_MIN_SESSION = 20;
/** Default soft ceiling on per-session length, in minutes (3 hours). */
const DEFAULT_SOFT_MAX_SESSION = 180;

// ─── Util ─────────────────────────────────────────────────────────────────────

function makeIdGen(prefix: string, existingIds: Iterable<string> = []): () => string {
  let n = 0;
  for (const id of existingIds) {
    const m = id.match(/-(\d+)$/);
    if (m) {
      const v = Number(m[1]);
      if (Number.isFinite(v) && v > n) n = v;
    }
  }
  return () => {
    n += 1;
    return `${prefix}-${n}`;
  };
}

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

function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function sortBlocks(blocks: Block[]): Block[] {
  return [...blocks].sort((a, b) => (a.start - b.start) || (a.end - b.end));
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

// ─── Priority scoring (task-level sort key) ───────────────────────────────────

/**
 * Composite priority score. Higher = scheduled first.
 *
 *   urgency   : squared time-pressure (remaining / minutesUntilDeadline)
 *   impact    : task.importance (0..1)
 *   staleness : log-days since createdAt, saturating at 30 days
 *   tierBoost : flat bump from urgencyMultiplier (HIGH-tier quests carry
 *               urgencyMultiplier ≥ 1.4 via the adapter)
 *
 * Overdue tasks short-circuit to 1000 so they always sort first.
 */
export function priorityScore(task: Task, now: number): number {
  const deadlineMin = (task.deadline - now) / MS_PER_MIN;
  if (deadlineMin <= 0) return 1000;
  const loadRatio = task.remainingMin / Math.max(deadlineMin, 1);
  const urgency = Math.min(1, loadRatio * loadRatio);

  const impact = task.importance;
  const stalenessDays = Math.max(0, (now - task.createdAt) / MS_PER_DAY);
  const staleness = Math.min(1, Math.log(1 + stalenessDays) / Math.log(31));

  const tierBoost = Math.max(0, (task.urgencyMultiplier ?? 1) - 1);

  return urgency * 4 + impact * 2 + staleness * 1 + tierBoost * 3;
}

function compareTie(a: Task, b: Task): number {
  if (a.deadline !== b.deadline) return a.deadline - b.deadline;
  if (a.importance !== b.importance) return b.importance - a.importance;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// ─── Free intervals ───────────────────────────────────────────────────────────

interface FreeInterval {
  start: number;
  end: number;
  day: string;
}

function buildFreeIntervals(
  config: UserConfig,
  now: number,
  immovable: Block[],
): FreeInterval[] {
  const out: FreeInterval[] = [];
  const horizonEnd = now + config.horizonDays * MS_PER_DAY;
  const immov = sortBlocks(immovable);

  for (let d = 0; d < config.horizonDays; d += 1) {
    const dayStart = startOfDayLocal(now + d * MS_PER_DAY);
    const wStart = Math.max(setHourLocal(dayStart, config.workingHours.startHour), now);
    const wEnd = Math.min(setHourLocal(dayStart, config.workingHours.endHour), horizonEnd);
    if (wEnd <= wStart) continue;

    const dKey = dayKey(dayStart);
    const todayBlocks = immov.filter((b) => b.end > wStart && b.start < wEnd);

    let cursor = wStart;
    for (const b of todayBlocks) {
      const bs = Math.max(b.start, wStart);
      const be = Math.min(b.end, wEnd);
      if (bs > cursor) out.push({ start: cursor, end: bs, day: dKey });
      cursor = Math.max(cursor, be);
    }
    if (cursor < wEnd) out.push({ start: cursor, end: wEnd, day: dKey });
  }

  return out;
}

/**
 * Subtract the first `minutes` from an interval. Returns the leftover
 * (or null if the interval is fully consumed).
 */
function shrinkFromStart(interval: FreeInterval, minutes: number): FreeInterval | null {
  const consumedMs = minutes * MS_PER_MIN;
  const remainingMs = interval.end - interval.start - consumedMs;
  if (remainingMs < EPSILON_MIN * MS_PER_MIN) return null;
  return { ...interval, start: interval.start + consumedMs };
}

// ─── Energy meter ─────────────────────────────────────────────────────────────

/**
 * Drain a placed work block exerts on the energy meter, in percentage points.
 *
 *   drain = chunkMin × difficultyFactor × (1 + tediousness × 0.4) / 10
 *
 * difficultyFactor comes from cognitiveLoad (0..1) mapped to {0.5, 1.0, 1.8}.
 * Defaults give a 60-min Hard tedious task a ~14% drain; a 30-min Easy
 * non-tedious task a ~1.5% drain.
 */
function blockDrain(task: Task, chunkMin: number): number {
  const difficultyFactor = task.cognitiveLoad >= 0.7 ? 1.8 : task.cognitiveLoad >= 0.4 ? 1.0 : 0.5;
  return (chunkMin * difficultyFactor * (1 + task.tediousness * 0.4)) / 10;
}

/** Recovery rate per minute of gap, in percentage points. */
const ENERGY_RECOVERY_PER_MIN = 0.6;
/** Energy at the start of every working day. */
const ENERGY_MAX = 100;

interface PlacedRef { block: Block; task: Task }

/**
 * Compute the energy meter at a specific timestamp by replaying all
 * placed blocks chronologically (drain on work blocks, recovery on gaps).
 * Resets to ENERGY_MAX at the start of each day.
 */
function meterAt(timestamp: number, placedRefs: PlacedRef[], taskMap: Map<string, Task>): number {
  let meter = ENERGY_MAX;
  let lastEnd = startOfDayLocal(timestamp);
  const sorted = [...placedRefs].sort((a, b) => a.block.start - b.block.start);

  for (const { block, task } of sorted) {
    if (block.start >= timestamp) break;
    // Day reset if this block starts on a new day.
    if (startOfDayLocal(block.start) > startOfDayLocal(lastEnd)) {
      meter = ENERGY_MAX;
      lastEnd = startOfDayLocal(block.start);
    }
    // Recover during gap from lastEnd → block.start.
    if (block.start > lastEnd) {
      const gapMin = (block.start - lastEnd) / MS_PER_MIN;
      meter = Math.min(ENERGY_MAX, meter + gapMin * ENERGY_RECOVERY_PER_MIN);
    }
    // Drain for the work block.
    const chunkMin = (Math.min(block.end, timestamp) - block.start) / MS_PER_MIN;
    if (block.type === 'work' && task) {
      meter -= blockDrain(task, chunkMin);
    }
    lastEnd = Math.min(block.end, timestamp);
  }
  // Recover for any tail gap.
  if (timestamp > lastEnd) {
    const gapMin = (timestamp - lastEnd) / MS_PER_MIN;
    meter = Math.min(ENERGY_MAX, meter + gapMin * ENERGY_RECOVERY_PER_MIN);
  }
  return clamp(meter, 0, ENERGY_MAX);
}

/**
 * Public: sample the energy meter at evenly-spaced points across a day.
 * Used by the client to draw the sparkline above the feed.
 */
export function computeEnergyTrace(
  schedule: Schedule,
  tasks: Task[],
  dayStartMs: number,
  dayEndMs: number,
  sampleStepMin = 10,
): Array<{ time: number; meter: number }> {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const refs: PlacedRef[] = [];
  for (const b of schedule) {
    if (b.type !== 'work' || !b.taskId) continue;
    if (b.end <= dayStartMs || b.start >= dayEndMs) continue;
    const t = taskMap.get(b.taskId);
    if (t) refs.push({ block: b, task: t });
  }
  const step = sampleStepMin * MS_PER_MIN;
  const out: Array<{ time: number; meter: number }> = [];
  for (let ts = dayStartMs; ts <= dayEndMs; ts += step) {
    out.push({ time: ts, meter: meterAt(ts, refs, taskMap) });
  }
  return out;
}

// ─── Soft session-size penalty ────────────────────────────────────────────────

function softSessionMin(task: Task): number {
  // Use task's explicit minChunkMin if set; otherwise default 20 (or the task's
  // remainingMin if it's smaller — a 10-min task can't have a 20-min session).
  const userMin = task.minChunkMin > 0 ? task.minChunkMin : DEFAULT_SOFT_MIN_SESSION;
  return Math.min(userMin, task.remainingMin);
}

function softSessionMax(task: Task): number {
  return task.maxChunkMin > 0 ? task.maxChunkMin : DEFAULT_SOFT_MAX_SESSION;
}

/**
 * Penalty (0..1) for a chunk size outside the soft session range.
 * Linear with distance from boundary, saturating at 1 when chunk is half/double.
 */
function sessionSizePenalty(chunkMin: number, task: Task): number {
  const sMin = softSessionMin(task);
  const sMax = softSessionMax(task);
  if (chunkMin >= sMin && chunkMin <= sMax) return 0;
  if (chunkMin < sMin) {
    return clamp((sMin - chunkMin) / sMin, 0, 1);
  }
  // chunkMin > sMax
  return clamp((chunkMin - sMax) / sMax, 0, 1);
}

// ─── Placement scoring (per-candidate-gap) ────────────────────────────────────

interface NeighborInfo {
  before: { task: Task; type: string } | null;
  after: { task: Task; type: string } | null;
}

function findNeighbors(
  schedule: Block[],
  gapStart: number,
  gapEnd: number,
  taskMap: Map<string, Task>,
): NeighborInfo {
  let before: NeighborInfo['before'] = null;
  let after: NeighborInfo['after'] = null;
  for (const b of schedule) {
    if (b.type !== 'work' || !b.taskId) continue;
    const t = taskMap.get(b.taskId);
    if (!t) continue;
    if (b.end <= gapStart && (!before || b.end > 0)) {
      before = { task: t, type: t.category };
    }
    if (b.start >= gapEnd && !after) {
      after = { task: t, type: t.category };
    }
  }
  return { before, after };
}

interface PlacementCandidate {
  intervalIdx: number;
  chunkMin: number;
  start: number;
  end: number;
  score: number;
}

/**
 * Score a candidate placement of `task` of size `chunkMin` starting at
 * `start`. Higher = better.
 *
 * Components (all soft):
 *   + earliness        sooner placements beat later ones (deadline pressure)
 *   + importance_fit   linear in task.importance
 *   + clustering       adjacent block same-category → bonus
 *   + preferred_time   within preferredHour ± 2h → bonus
 *   − switch_penalty   adjacent block different category → small penalty
 *   − cooldown_penalty back-to-back high cognitive-load → penalty
 *   − energy_pressure  meter < 25% at start → penalty
 *   − session_size     chunk outside soft min/max session range → penalty
 */
function placementScore(
  task: Task,
  chunkMin: number,
  start: number,
  schedule: Block[],
  taskMap: Map<string, Task>,
  placedRefs: PlacedRef[],
  weights: { urgency: number; importance: number; energyFit: number },
  now: number,
): number {
  const neighbors = findNeighbors(schedule, start, start + chunkMin * MS_PER_MIN, taskMap);
  const meter = meterAt(start, placedRefs, taskMap);

  // Earliness: hours from now; smaller = bigger bonus. Capped to avoid extreme
  // bonuses for immediate-now placements.
  const hoursFromNow = Math.max(0.25, (start - now) / MS_PER_HOUR);
  const earliness = weights.urgency * (1 / hoursFromNow);

  // Importance fit: scaled by task importance.
  const importanceFit = weights.importance * task.importance;

  // Clustering: same-category adjacent block on either side.
  let clustering = 0;
  if (neighbors.before && neighbors.before.type === task.category) clustering += 0.3;
  if (neighbors.after && neighbors.after.type === task.category) clustering += 0.2;

  // Preferred-time bonus: gaussian-ish window around preferredHour.
  let preferredTime = 0;
  if (task.preferredHour !== null) {
    const startHour = new Date(start).getHours();
    const diff = Math.abs(startHour - task.preferredHour);
    if (diff <= 2) preferredTime = 0.2 * (1 - diff / 2);
  }

  // Switch penalty: previous block exists, different category.
  let switchPenalty = 0;
  if (neighbors.before && neighbors.before.type !== task.category) switchPenalty = 0.15;

  // Cooldown penalty: two high-cog-load tasks back-to-back.
  let cooldownPenalty = 0;
  if (neighbors.before && task.cognitiveLoad >= 0.7 && neighbors.before.task.cognitiveLoad >= 0.7) {
    cooldownPenalty = 0.4;
  }

  // Energy pressure: meter below threshold makes this slot risky.
  let energyPressure = 0;
  const expectedDrain = blockDrain(task, chunkMin);
  if (meter - expectedDrain < 25) {
    energyPressure = weights.energyFit * 0.3;
  } else if (meter < 50) {
    energyPressure = weights.energyFit * 0.1;
  }

  // Soft session-size penalty (the user-requested soft min/max).
  const sessionPenalty = sessionSizePenalty(chunkMin, task) * 0.5;

  return earliness + importanceFit + clustering + preferredTime
       - switchPenalty - cooldownPenalty - energyPressure - sessionPenalty;
}

// ─── Insertion engine ─────────────────────────────────────────────────────────

interface InsertResult {
  allocations: Array<{ start: number; end: number }>;
  shortfallMin: number;
  /** Mutated free-interval list (caller passes by reference). */
  remainingIntervals: FreeInterval[];
  /** Refs of the blocks we placed, for the energy meter. */
  newRefs: PlacedRef[];
}

/**
 * Place a single task into the schedule by carving chunks from free
 * intervals. Each iteration picks the best-scoring candidate.
 */
export function insertOne(
  task: Task,
  schedule: Block[],
  freeIntervals: FreeInterval[],
  taskMap: Map<string, Task>,
  placedRefs: PlacedRef[],
  weights: { urgency: number; importance: number; energyFit: number },
  config: UserConfig,
  now: number,
): InsertResult {
  const allocations: Array<{ start: number; end: number }> = [];
  let needed = task.remainingMin;
  // softMaxBlockMin from config still applies as a meta-cap, but only for the
  // long-warmup mitigation. We use the per-task maxChunkMin as the actual cap.
  const setupLifts = task.setupCost >= 0.7 || (task.urgencyMultiplier ?? 1) >= 1.5;
  const hardChunkCap = setupLifts
    ? task.maxChunkMin
    : Math.min(task.maxChunkMin, config.softMaxBlockMin);

  const newRefs: PlacedRef[] = [];

  while (needed > EPSILON_MIN) {
    // Build candidates: for each interval, what's the best chunk size we'd
    // try to place from its start?
    const candidates: PlacementCandidate[] = [];

    for (let i = 0; i < freeIntervals.length; i += 1) {
      const interval = freeIntervals[i]!;
      if (interval.start >= task.deadline) break;

      const usableEnd = Math.min(interval.end, task.deadline);
      const usableMin = (usableEnd - interval.start) / MS_PER_MIN;
      if (usableMin < EPSILON_MIN) continue;
      // Soft floor: prefer not to use a chunk smaller than task.minChunkMin,
      // but still try it if needed > 0 — sessionSizePenalty will dock score.
      const ideal = Math.min(needed, usableMin, hardChunkCap);
      const chunkMin = Math.floor(ideal);
      if (chunkMin < 1) continue;

      const start = interval.start;
      const end = start + chunkMin * MS_PER_MIN;
      const score = placementScore(
        task,
        chunkMin,
        start,
        schedule,
        taskMap,
        [...placedRefs, ...newRefs],
        weights,
        now,
      );
      candidates.push({ intervalIdx: i, chunkMin, start, end, score });
    }

    if (candidates.length === 0) break;

    // Pick highest-scoring candidate. Tie-break: earlier start.
    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.start - b.start;
    });
    const pick = candidates[0]!;

    // Emit the chunk.
    allocations.push({ start: pick.start, end: pick.end });
    needed -= pick.chunkMin;

    // Shrink the consumed interval.
    const consumedInterval = freeIntervals[pick.intervalIdx]!;
    const leftover = shrinkFromStart(consumedInterval, pick.chunkMin);
    if (leftover === null) {
      freeIntervals.splice(pick.intervalIdx, 1);
    } else {
      freeIntervals[pick.intervalIdx] = leftover;
    }

    // Push a ref so subsequent chunks of THIS task see the energy meter drop.
    newRefs.push({
      block: {
        id: `tmp-${pick.start}`,
        start: pick.start,
        end: pick.end,
        type: 'work',
        taskId: task.id,
        locked: false,
        note: null,
      },
      task,
    });
  }

  return { allocations, shortfallMin: Math.max(0, needed), remainingIntervals: freeIntervals, newRefs };
}

// ─── Dep check ────────────────────────────────────────────────────────────────

function depsMet(task: Task, taskMap: Map<string, Task>): boolean {
  for (const id of task.dependencies) {
    const dep = taskMap.get(id);
    if (!dep || dep.status !== 'done') return false;
  }
  return true;
}

function suggestForShortfall(shortfall: number): string[] {
  return [
    `extend_deadline_by:${shortfall}m`,
    `reduce_scope_by:${shortfall}m`,
    'drop_lower_priority_task',
  ];
}

// ─── Public plan() entrypoint ─────────────────────────────────────────────────

export interface PlanInputs {
  tasks: Task[];
  fixedBlocks: Block[];
  lockedBlocks: Block[];
  config: UserConfig;
  now: number;
}

/**
 * Effective weights — config has 9 numbers historically, we use the three
 * that map to the new scoring. Defaults are fine if user hasn't tuned.
 */
function effectiveWeights(config: UserConfig): { urgency: number; importance: number; energyFit: number } {
  return {
    urgency: config.weights.urgency,         // default 3.0
    importance: config.weights.timeFit || 1, // re-purpose old timeFit slot as importance weight (legacy compat)
    energyFit: config.weights.energyFit,     // default 1.0
  };
}

export function plan(inputs: PlanInputs): SchedulerResult {
  const { tasks, fixedBlocks, lockedBlocks, config, now } = inputs;

  const immovable = sortBlocks([...fixedBlocks, ...lockedBlocks]);
  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  const eligible = tasks.filter(
    (t) =>
      t.status !== 'done' &&
      t.remainingMin > EPSILON_MIN &&
      t.deadline > now &&
      depsMet(t, taskMap),
  );

  const sorted = [...eligible].sort((a, b) => {
    const scoreDiff = priorityScore(b, now) - priorityScore(a, now);
    if (Math.abs(scoreDiff) > 1e-6) return scoreDiff;
    return compareTie(a, b);
  });

  const weights = effectiveWeights(config);
  let freeIntervals = buildFreeIntervals(config, now, immovable);
  const placedRefs: PlacedRef[] = [];
  const allWorkBlocks: Block[] = [];
  const issues: FeasibilityIssue[] = [];
  const existingIds = [...immovable.map((b) => b.id)];
  const idGen = makeIdGen('blk', existingIds);

  for (const task of sorted) {
    const result = insertOne(
      task,
      [...immovable, ...allWorkBlocks],
      freeIntervals,
      taskMap,
      placedRefs,
      weights,
      config,
      now,
    );
    freeIntervals = result.remainingIntervals;

    for (const alloc of result.allocations) {
      const blk: Block = {
        id: idGen(),
        start: alloc.start,
        end: alloc.end,
        type: 'work',
        taskId: task.id,
        locked: false,
        note: null,
      };
      allWorkBlocks.push(blk);
      placedRefs.push({ block: blk, task });
    }

    if (result.shortfallMin > EPSILON_MIN) {
      issues.push({
        taskId: task.id,
        shortfallMin: Math.ceil(result.shortfallMin),
        suggestions: suggestForShortfall(Math.ceil(result.shortfallMin)),
      });
    }
  }

  // NO automatic break-block insertion. Gaps between work blocks are the
  // breaks; the client visualizes the energy-meter dip and the user decides.

  const schedule = sortBlocks([...immovable, ...allWorkBlocks]);
  return {
    schedule,
    feasibilityReport: { ok: issues.length === 0, issues },
  };
}

