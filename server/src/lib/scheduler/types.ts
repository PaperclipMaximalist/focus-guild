/**
 * Auto-scheduler core types. Decoupled from Prisma — Quest→Task adaptation
 * lives outside this module.
 */

export type TaskStatus = 'pending' | 'in_progress' | 'done';
export type BlockType = 'work' | 'break' | 'fixed' | 'buffer';

export interface Task {
  id: string;
  name: string;
  remainingMin: number;
  totalMin: number;
  /** Absolute deadline as ms-epoch. */
  deadline: number;
  /** 0..1 */
  tediousness: number;
  /** 0..1 */
  cognitiveLoad: number;
  /** 0..1 */
  importance: number;
  /** 0..1 */
  setupCost: number;
  minChunkMin: number;
  maxChunkMin: number;
  category: string;
  /** 0..23 or null. */
  preferredHour: number | null;
  dependencies: string[];
  /** ms-epoch */
  createdAt: number;
  /** ms-epoch or null */
  lastWorkedAt: number | null;
  status: TaskStatus;
  /** Multiplier on urgency contribution. 1.0 = default. >1 boosts, <1 dampens. */
  urgencyMultiplier: number;
}

export interface Block {
  id: string;
  /** ms-epoch */
  start: number;
  /** ms-epoch */
  end: number;
  type: BlockType;
  taskId: string | null;
  /** true = user-edited; planner must respect. */
  locked: boolean;
  /** Top score contributors / human-readable note. */
  note: string | null;
}

export type Schedule = Block[];

/**
 * Legacy 9-knob weight set. Most fields are unused by the current planner;
 * kept on UserConfig so old persisted overrides don't crash. Will be pruned
 * in Phase C of the revamp once the Settings UI is updated.
 */
export interface Weights {
  urgency: number;
  staleness: number;
  timeFit: number;
  energyFit: number;
  chunkFit: number;
  adjacency: number;
  switch: number;
  fragmentation: number;
  /** Penalty per minute over softMaxBlockMin. Higher = stricter block-size cap. */
  oversize: number;
}

/** Mode = the experiential bucket a block falls into for variety/monotony reasoning. */
export type LoadTier = 'low' | 'med' | 'high';
export type TediumTier = 'low' | 'med' | 'high';
export interface Mode {
  category: string;
  load: LoadTier;
  tedium: TediumTier;
}

/**
 * Per-decision scoring weights, one per term in placementScore. Each term
 * is normalized to ~[0,1] (or [-1,0] for penalties) before weighting, so
 * these are dimensionless multipliers — no single term can swamp another.
 *
 * Defaults live in config.ts (DEFAULT_SCORE_WEIGHTS). Per-user overrides
 * land in UserConfig.scoreWeights (everything optional, deep-merged).
 */
export interface ScoreWeights {
  /** Match task cognitive load to user's capacity curve at the hour. */
  energy: number;
  /** Slack-gated deadline pressure — bites only when (deadline−now)−remaining is small. */
  urgency: number;
  /** Small reward for batching consecutive short admin/comms chunks. */
  batch: number;
  /** Penalty for escalating same-mode runs (the real variety lever). */
  monotony: number;
  /** Penalty for back-to-back high-tedium blocks. */
  tedium: number;
  /** Penalty for back-to-back high-cognitive-load blocks (mental cooldown). */
  cooldown: number;
  /** Penalty for chunks outside the task's task-size-scaled ideal session range. */
  session: number;
}

export interface BreakPolicy {
  shortBreakAfterMin: number;
  shortBreakDurationMin: number;
  longBreakAfterMin: number;
  longBreakDurationMin: number;
}

export interface WorkingHours {
  /** 0..24 */
  startHour: number;
  /** 0..24 */
  endHour: number;
}

/** Hour 0..23 → 0..1 */
export type EnergyCurve = (hour: number) => number;

export interface UserConfig {
  weights: Weights;
  energyCurve: EnergyCurve;
  breakPolicy: BreakPolicy;
  workingHours: WorkingHours;
  horizonDays: number;
  /**
   * Soft cap on work block duration in minutes. Blocks longer than this
   * incur an oversize penalty unless the task has special circumstances
   * (very high urgency, high setupCost, or block exactly fills a tight slot).
   * Default 90.
   */
  softMaxBlockMin: number;
  /**
   * User's timezone offset in minutes (as returned by Date.getTimezoneOffset()
   * on the client — minutes to ADD to local time to reach UTC). When unset
   * defaults to 0 (treat as UTC). Without this, the planner uses server-local
   * time which means "9am working hours" gets interpreted in whatever timezone
   * the host process runs in (UTC on Railway) — that broke today-scheduling
   * for non-UTC users.
   */
  tzOffsetMin?: number;
  /**
   * Per-decision scoring weights. Optional — when absent, falls back to
   * DEFAULT_SCORE_WEIGHTS from config.ts. Each individual field is also
   * optional so partial overrides merge cleanly.
   */
  scoreWeights?: Partial<ScoreWeights>;
}

export interface FeasibilityIssue {
  taskId: string;
  shortfallMin: number;
  suggestions: string[];
}

export interface FeasibilityReport {
  ok: boolean;
  issues: FeasibilityIssue[];
}

export interface SchedulerResult {
  schedule: Schedule;
  feasibilityReport: FeasibilityReport;
}

export interface ReplanOptions {
  /** If true, do not run adjacent-swap optimization. Default false. */
  skipSwapPass?: boolean;
}

// ---------- Edits ----------

export type Edit =
  | { kind: 'move_block'; blockId: string; newStart: number }
  | { kind: 'swap_blocks'; aId: string; bId: string }
  | { kind: 'delete_block'; blockId: string }
  | { kind: 'pin_block'; blockId: string }
  | { kind: 'unpin_block'; blockId: string };
