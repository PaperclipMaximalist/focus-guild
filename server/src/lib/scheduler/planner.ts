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

/**
 * Compute midnight (00:00) in the user's timezone, returned as UTC ms.
 *
 * `tzOffsetMin` is the value returned by JS `Date.prototype.getTimezoneOffset()`
 * on the client — i.e. minutes to ADD to local time to reach UTC. For PDT
 * (UTC−7) this is +420. Server-local timezone is intentionally ignored: we
 * want the user's day boundaries, not the host process's. Defaults to 0
 * (UTC) when not supplied, which matches old behaviour.
 */
function userMidnightUtc(utcMs: number, tzOffsetMin: number): number {
  const userLocalView = new Date(utcMs - tzOffsetMin * MS_PER_MIN);
  userLocalView.setUTCHours(0, 0, 0, 0);
  return userLocalView.getTime() + tzOffsetMin * MS_PER_MIN;
}

/** Hour `h` (0..24) on the user-local day starting at `midnightUtc`, as UTC ms. */
function userHourUtc(midnightUtc: number, h: number): number {
  return midnightUtc + h * MS_PER_HOUR;
}

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

function dayKey(ms: number, tzOffsetMin = 0): string {
  const d = new Date(ms - tzOffsetMin * MS_PER_MIN);
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
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
  const tz = config.tzOffsetMin ?? 0;
  const horizonEnd = now + config.horizonDays * MS_PER_DAY;
  const immov = sortBlocks(immovable);
  const todayMidnight = userMidnightUtc(now, tz);

  for (let d = 0; d < config.horizonDays; d += 1) {
    const midnight = todayMidnight + d * MS_PER_DAY;
    const wStart = Math.max(userHourUtc(midnight, config.workingHours.startHour), now);
    const wEnd = Math.min(userHourUtc(midnight, config.workingHours.endHour), horizonEnd);
    if (wEnd <= wStart) continue;

    const dKey = dayKey(midnight, tz);
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
function meterAt(timestamp: number, placedRefs: PlacedRef[], taskMap: Map<string, Task>, tzOffsetMin = 0): number {
  let meter = ENERGY_MAX;
  let lastEnd = userMidnightUtc(timestamp, tzOffsetMin);
  const sorted = [...placedRefs].sort((a, b) => a.block.start - b.block.start);

  for (const { block, task } of sorted) {
    if (block.start >= timestamp) break;
    // Day reset if this block starts on a new day (user-local).
    if (userMidnightUtc(block.start, tzOffsetMin) > userMidnightUtc(lastEnd, tzOffsetMin)) {
      meter = ENERGY_MAX;
      lastEnd = userMidnightUtc(block.start, tzOffsetMin);
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

  // Same-task penalty: don't stack the same task back-to-back without break.
  // The round-robin outer loop already discourages this, but in case a single
  // task is the only candidate, this keeps placement scoring honest.
  let sameTaskPenalty = 0;
  if (neighbors.before && neighbors.before.task.id === task.id) {
    sameTaskPenalty = 0.6;
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
       - switchPenalty - cooldownPenalty - sameTaskPenalty - energyPressure - sessionPenalty;
}

// ─── Insertion engine ─────────────────────────────────────────────────────────

/**
 * Place ONE chunk of `task` into the best available interval (if any).
 *
 * Returns null when no interval can host a chunk for this task right now —
 * either there's no usable time before the deadline, or every candidate
 * fails the size floor. The round-robin driver in `plan()` calls this
 * once per task per pass and stops the outer loop when no task makes
 * progress in a full pass.
 *
 * Mutates `freeIntervals` in place (shrinks the consumed interval).
 */
function placeOneChunkFor(
  task: Task,
  needed: number,
  schedule: Block[],
  freeIntervals: FreeInterval[],
  taskMap: Map<string, Task>,
  placedRefs: PlacedRef[],
  weights: { urgency: number; importance: number; energyFit: number },
  config: UserConfig,
  now: number,
): { start: number; end: number; chunkMin: number } | null {
  const setupLifts = task.setupCost >= 0.7 || (task.urgencyMultiplier ?? 1) >= 1.5;
  const hardChunkCap = setupLifts
    ? task.maxChunkMin
    : Math.min(task.maxChunkMin, config.softMaxBlockMin);

  const candidates: PlacementCandidate[] = [];
  for (let i = 0; i < freeIntervals.length; i += 1) {
    const interval = freeIntervals[i]!;
    if (interval.start >= task.deadline) break;
    const usableEnd = Math.min(interval.end, task.deadline);
    const usableMin = (usableEnd - interval.start) / MS_PER_MIN;
    if (usableMin < EPSILON_MIN) continue;
    const ideal = Math.min(needed, usableMin, hardChunkCap);
    const chunkMin = Math.floor(ideal);
    if (chunkMin < 1) continue;
    const start = interval.start;
    const end = start + chunkMin * MS_PER_MIN;
    const score = placementScore(task, chunkMin, start, schedule, taskMap, placedRefs, weights, now);
    candidates.push({ intervalIdx: i, chunkMin, start, end, score });
  }
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.start - b.start));
  const pick = candidates[0]!;

  const consumed = freeIntervals[pick.intervalIdx]!;
  const leftover = shrinkFromStart(consumed, pick.chunkMin);
  if (leftover === null) freeIntervals.splice(pick.intervalIdx, 1);
  else freeIntervals[pick.intervalIdx] = leftover;

  return { start: pick.start, end: pick.end, chunkMin: pick.chunkMin };
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
  const freeIntervals = buildFreeIntervals(config, now, immovable);
  const placedRefs: PlacedRef[] = [];
  const allWorkBlocks: Block[] = [];
  const idGen = makeIdGen('blk', immovable.map((b) => b.id));

  // ── Round-robin allocation ──
  //
  // Old approach: place ALL chunks of task A, then ALL of task B, etc. With
  // a high-priority 4-hour task this produced a morning + afternoon of the
  // same task back-to-back. The user complaint was "no variety, same block
  // for many hours in a row".
  //
  // New approach: each pass tries to place ONE chunk per task in priority
  // order. After all tasks have had a turn, start another pass. Stop when
  // a full pass makes zero progress (every remaining task is infeasible
  // from where its meter / interval / deadline allows). This naturally
  // interleaves tasks throughout the day while still respecting priority
  // (high-pri tasks always get the best slot OF THAT PASS).
  const remainingByTask = new Map<string, number>(sorted.map((t) => [t.id, t.remainingMin]));
  for (let pass = 0; pass < 100; pass += 1) {
    let progress = false;
    for (const task of sorted) {
      const remaining = remainingByTask.get(task.id) ?? 0;
      if (remaining <= EPSILON_MIN) continue;
      const result = placeOneChunkFor(
        task,
        remaining,
        [...immovable, ...allWorkBlocks],
        freeIntervals,
        taskMap,
        placedRefs,
        weights,
        config,
        now,
      );
      if (!result) continue;
      const blk: Block = {
        id: idGen(),
        start: result.start,
        end: result.end,
        type: 'work',
        taskId: task.id,
        locked: false,
        note: null,
      };
      allWorkBlocks.push(blk);
      placedRefs.push({ block: blk, task });
      remainingByTask.set(task.id, remaining - result.chunkMin);
      progress = true;
    }
    if (!progress) break;
  }

  // Any tasks still with remaining > 0 are infeasible.
  const issues: FeasibilityIssue[] = [];
  for (const task of sorted) {
    const left = remainingByTask.get(task.id) ?? 0;
    if (left > EPSILON_MIN) {
      issues.push({
        taskId: task.id,
        shortfallMin: Math.ceil(left),
        suggestions: suggestForShortfall(Math.ceil(left)),
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

