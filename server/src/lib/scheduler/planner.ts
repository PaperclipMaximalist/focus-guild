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

import { allocateBudgets, buildDayInfo } from './budget.js';
import { DEFAULT_SCORE_WEIGHTS } from './config.js';
import { constructDay } from './constructor.js';
import { userHourOf, userMidnightUtc } from './tz.js';
import type {
  Block,
  FeasibilityIssue,
  LoadTier,
  Mode,
  Schedule,
  SchedulerResult,
  ScoreWeights,
  Task,
  TediumTier,
  UserConfig,
} from './types.js';

const MS_PER_MIN = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MIN;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const EPSILON_MIN = 0.5;

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

// (Free-interval types + construction live in budget.ts so the budgeting
//  layer that needs them owns them.)

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

export interface PlacedRef { block: Block; task: Task }

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

// ─── Mode classification (variety axis) ───────────────────────────────────────

function loadTierOf(cogLoad: number): LoadTier {
  if (cogLoad >= 0.7) return 'high';
  if (cogLoad >= 0.4) return 'med';
  return 'low';
}

function tediumTierOf(tedium: number): TediumTier {
  if (tedium >= 0.67) return 'high';
  if (tedium >= 0.33) return 'med';
  return 'low';
}

/** Compute the experiential mode of a task (drives monotony reasoning). */
export function taskMode(task: Task): Mode {
  return {
    category: task.category,
    load: loadTierOf(task.cognitiveLoad),
    tedium: tediumTierOf(task.tediousness),
  };
}

function modesEqual(a: Mode, b: Mode): boolean {
  return a.category === b.category && a.load === b.load && a.tedium === b.tedium;
}

// ─── Ideal session sizing (scales with task size) ─────────────────────────────

/**
 * Returns the [softMin, softMax] minutes the planner *prefers* for a chunk
 * of this task. Bigger tasks earn longer ideal sessions; tiny tasks shrink
 * to match their own remainingMin. Per-task minChunkMin/maxChunkMin are
 * the absolute floor/ceiling.
 *
 *   remaining ≥ 180 min : 30..90 min ideal  (big — full deep-work sessions)
 *   remaining ≥  60 min : 20..60 min ideal  (medium — pomodoro-sized)
 *   remaining <  60 min : 10..remaining   ideal  (small — finish in one go)
 */
export function idealSessionRange(task: Task): [number, number] {
  const rem = task.remainingMin;
  const userMin = task.minChunkMin > 0 ? task.minChunkMin : 1;
  const userMax = task.maxChunkMin > 0 ? task.maxChunkMin : 240;
  let lo: number;
  let hi: number;
  if (rem >= 180) { lo = 30; hi = 90; }
  else if (rem >= 60) { lo = 20; hi = 60; }
  else { lo = 10; hi = rem; }
  // Respect per-task overrides as outer bounds.
  return [Math.max(userMin, Math.min(lo, rem)), Math.max(userMin, Math.min(hi, userMax, rem))];
}

/**
 * Session-size penalty in [0, 1]. 0 if chunk is inside the ideal range;
 * grows linearly with distance from the boundary, saturating at 1 when
 * the chunk is half/double the ideal bound.
 */
export function sessionSizePenalty(chunkMin: number, task: Task): number {
  const [lo, hi] = idealSessionRange(task);
  if (chunkMin >= lo && chunkMin <= hi) return 0;
  if (chunkMin < lo) return clamp((lo - chunkMin) / Math.max(lo, 1), 0, 1);
  return clamp((chunkMin - hi) / Math.max(hi, 1), 0, 1);
}

// ─── Per-decision scoring terms (each returns ~[0,1]) ─────────────────────────

/** Energy fit: how well task's cognitive load matches user's capacity at this hour. */
export function energyFit(task: Task, blockStart: number, config: UserConfig): number {
  const hour = userHourOf(blockStart, config.tzOffsetMin ?? 0);
  const capacity = clamp(config.energyCurve(hour), 0, 1);
  return clamp(1 - Math.abs(task.cognitiveLoad - capacity), 0, 1);
}

/**
 * Slack-gated urgency. Returns ~1 when the task has no buffer beyond its
 * deadline (must place now); decays toward 0 as slack grows beyond
 * `remainingMin` of buffer. Multiplied by `urgencyMultiplier` so HIGH-tier
 * quests still get a steady nudge even when slack is loose.
 */
export function urgencyFit(task: Task, blockStart: number): number {
  const minsToDeadline = (task.deadline - blockStart) / MS_PER_MIN;
  if (minsToDeadline <= 0) return 1;
  const slack = minsToDeadline - task.remainingMin;
  if (slack <= 0) return 1;
  // Half-life of attention at one `remainingMin` of slack — i.e. a 60-min task
  // with 60-min slack scores ~0.37; with 0 slack scores 1; with 4 hours of
  // slack scores ~0.02. Multiplied by tier mult so HIGH still rises above MED.
  const scale = Math.max(task.remainingMin, 60);
  return clamp(Math.exp(-slack / scale), 0, 1) * Math.max(1, task.urgencyMultiplier ?? 1) / 1.5;
}

/** Small reward for chaining short admin/comms blocks back-to-back. */
export function batchBonus(task: Task, chunkMin: number, prev: Task | null): number {
  const isAdmin = task.category === 'admin' || task.category === 'comms';
  if (!isAdmin || !prev || chunkMin > 30) return 0;
  if (prev.category !== task.category) return 0;
  return 0.5;
}

/**
 * Variety/monotony penalty. Counts consecutive same-mode predecessors
 * ending immediately before this block and grows quadratically.
 *
 *   runLen 0  → 0.00  (first of a mode)
 *   runLen 1  → 0.00  (one same-mode predecessor — fine)
 *   runLen 2  → 0.25  (warning — already two in a row)
 *   runLen 3+ → 1.00  (cap)
 */
export function monotonyPenalty(
  task: Task,
  blockStart: number,
  placedRefs: PlacedRef[],
): number {
  const target = taskMode(task);
  const chrono = [...placedRefs]
    .filter((r) => r.block.end <= blockStart)
    .sort((a, b) => b.block.start - a.block.start); // newest first
  let runLen = 0;
  for (const r of chrono) {
    if (modesEqual(taskMode(r.task), target)) runLen += 1;
    else break;
  }
  // (runLen - 1)² / 4, capped at 1. Subtract one so single same-mode preds
  // are free — only escalating runs cost.
  if (runLen <= 1) return 0;
  return Math.min(1, ((runLen - 1) * (runLen - 1)) / 4);
}

/** 1 iff this block and the immediately-prior one are both high-tedium. */
export function tediumClash(task: Task, prev: Task | null): number {
  if (!prev) return 0;
  return tediumTierOf(task.tediousness) === 'high'
    && tediumTierOf(prev.tediousness) === 'high'
    ? 1 : 0;
}

/** 1 iff this block and the immediately-prior one are both high-cognitive-load. */
export function cooldownClash(task: Task, prev: Task | null): number {
  if (!prev) return 0;
  return loadTierOf(task.cognitiveLoad) === 'high'
    && loadTierOf(prev.cognitiveLoad) === 'high'
    ? 1 : 0;
}

// ─── Placement scoring (per-candidate-gap) ────────────────────────────────────

interface PlacementCandidate {
  intervalIdx: number;
  chunkMin: number;
  start: number;
  end: number;
  score: number;
}

/** Most recently-ended placed work block strictly before `blockStart`, or null. */
export function prevPlacedBefore(blockStart: number, placedRefs: PlacedRef[]): Task | null {
  let best: PlacedRef | null = null;
  for (const r of placedRefs) {
    if (r.block.end > blockStart) continue;
    if (!best || r.block.end > best.block.end) best = r;
  }
  return best?.task ?? null;
}

/** Resolve per-user score weights, falling back to defaults for any missing field. */
export function resolveScoreWeights(config: UserConfig): ScoreWeights {
  return { ...DEFAULT_SCORE_WEIGHTS, ...(config.scoreWeights ?? {}) };
}

/**
 * Compose a per-candidate placement score from §4.4 of the design doc.
 *
 *   blockScore =
 *     + w_energy   · energyFit          // capacity match at this hour
 *     + w_urgency  · urgencyFit         // slack-gated deadline pressure
 *     + w_batch    · batchBonus         // chain short admin/comms
 *     − w_monotony · monotonyPenalty    // variety (mode-aware)
 *     − w_tedium   · tediumClash        // back-to-back drag
 *     − w_cooldown · cooldownClash      // back-to-back hard
 *     − w_session  · sessionSizePenalty // chunk outside ideal range
 *
 * Each term is normalized to [0,1] (or [-1,0]) before weighting, so no
 * single weight can swamp the others — fixes the old `1/hoursFromNow`
 * domination bug.
 */
export function placementScore(
  task: Task,
  chunkMin: number,
  start: number,
  placedRefs: PlacedRef[],
  weights: ScoreWeights,
  config: UserConfig,
): number {
  const prev = prevPlacedBefore(start, placedRefs);

  const eFit = energyFit(task, start, config);
  const uFit = urgencyFit(task, start);
  const batch = batchBonus(task, chunkMin, prev);
  const mono = monotonyPenalty(task, start, placedRefs);
  const ted = tediumClash(task, prev);
  const cool = cooldownClash(task, prev);
  const sess = sessionSizePenalty(chunkMin, task);

  return (
    weights.energy * eFit
    + weights.urgency * uFit
    + weights.batch * batch
    - weights.monotony * mono
    - weights.tedium * ted
    - weights.cooldown * cool
    - weights.session * sess
  );
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
 * plan() — Phase B pipeline: budget → construct.
 *
 *   1. Filter eligible tasks (status, remainingMin, deadline, deps).
 *   2. Build DayInfo for every day in horizon (working window minus immovable).
 *   3. allocateBudgets(): give each task a per-day quota sized to its share
 *      of remaining work, drained by priority — owns *cross-day spread*.
 *   4. For each day, constructDay() runs a timeline-driven beam search with
 *      the §4.4 placementScore — owns *within-day texture* (variety, energy
 *      fit, session sizing). Variety floor is a candidate filter, so the
 *      raw construction output is already varied without any polish pass.
 *   5. Any granted budget the constructor couldn't place (e.g. variety floor
 *      ate it on a tight day) folds back into shortfalls; combined with the
 *      budget-level leftovers, we emit one feasibility issue per task short.
 *
 * Public contract preserved: same PlanInputs / SchedulerResult.
 * Pure: deterministic given inputs (beam tie-break is stable).
 */
export function plan(inputs: PlanInputs): SchedulerResult {
  const { tasks, fixedBlocks, lockedBlocks, config, now } = inputs;

  const immovable = sortBlocks([...fixedBlocks, ...lockedBlocks]);
  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  // ── 1. Eligibility filter ─────────────────────────────────────────────
  const eligible = tasks.filter(
    (t) =>
      t.status !== 'done' &&
      t.remainingMin > EPSILON_MIN &&
      t.deadline > now &&
      depsMet(t, taskMap),
  );
  // Stable priority order used both for budgeting and tie-breaks.
  const sorted = [...eligible].sort((a, b) => {
    const diff = priorityScore(b, now) - priorityScore(a, now);
    if (Math.abs(diff) > 1e-6) return diff;
    return compareTie(a, b);
  });

  // ── 2/3. Build per-day capacity + allocate budgets ───────────────────
  const days = buildDayInfo(config, now, immovable);
  const budgets = allocateBudgets(sorted, days, now);

  // ── 4. Construct each day ────────────────────────────────────────────
  const allWorkBlocks: Block[] = [];
  const idGen = makeIdGen('blk', immovable.map((b) => b.id));
  // Track how many minutes each task actually got placed (vs granted).
  const placedByTask = new Map<string, number>();

  for (const budget of budgets) {
    const day = constructDay(budget, taskMap, config);
    for (const b of day.blocks) {
      const blk: Block = { ...b, id: idGen() };
      allWorkBlocks.push(blk);
      if (blk.taskId) {
        const mins = (blk.end - blk.start) / MS_PER_MIN;
        placedByTask.set(blk.taskId, (placedByTask.get(blk.taskId) ?? 0) + mins);
      }
    }
  }

  // ── 5. Feasibility — anything not placed before deadline counts ──────
  const issues: FeasibilityIssue[] = [];
  for (const task of sorted) {
    const placed = placedByTask.get(task.id) ?? 0;
    const short = task.remainingMin - placed;
    if (short > EPSILON_MIN) {
      issues.push({
        taskId: task.id,
        shortfallMin: Math.ceil(short),
        suggestions: suggestForShortfall(Math.ceil(short)),
      });
    }
  }

  // No automatic break-block insertion. Gaps between work blocks ARE the
  // breaks; the client visualizes the energy-meter dip and the user decides.
  const schedule = sortBlocks([...immovable, ...allWorkBlocks]);
  return {
    schedule,
    feasibilityReport: { ok: issues.length === 0, issues },
  };
}

