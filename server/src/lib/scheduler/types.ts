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
}

export interface ScoreBreakdown {
  urgency: number;
  staleness: number;
  timeFit: number;
  energyFit: number;
  chunkFit: number;
  adjacency: number;
  switch: number;
  fragmentation: number;
  oversize: number;
}

export interface ScoreResult {
  total: number;
  breakdown: ScoreBreakdown;
}

export interface ScheduleContext {
  /** Most recent non-break work block, or null. */
  prevTask: Task | null;
  /** Last up-to-3 non-break work tasks, newest first — used for windowed adjacency. */
  recentWorkTasks: Task[];
  /** Count of chunks for each taskId already placed today (calendar day of the block). */
  chunksTodayByTaskId: Record<string, number>;
  /** Block being filled. */
  blockStart: number;
  blockEnd: number;
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
