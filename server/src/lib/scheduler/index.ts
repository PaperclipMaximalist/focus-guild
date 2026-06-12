/**
 * Auto-scheduler public API.
 *
 * Pure functions only — no DB, no I/O. See README.md for the formulas
 * and how to tune the weights.
 */

export { generateSchedule, replan } from './replan.js';
export { reflow } from './reflow.js';
export { applyEdit } from './edits.js';
export { explainBlock } from './explain.js';
export { priorityScore, computeEnergyTrace, taskMode, placementScore } from './planner.js';
export type { ScoreBreakdown, PlacedRef } from './planner.js';
export { suggestPreferredHour, recordMove } from './preferences.js';
export { questToTask, questsToTasks, ADAPTER_DEFAULTS } from './adapter.js';
export type { QuestLike, QuestSchedulerOverrides } from './adapter.js';
export { placeDailyFillers } from './dailyFiller.js';
export type { DailyFiller, FillerPlacementInput } from './dailyFiller.js';
export {
  defaultConfig,
  DEFAULT_WEIGHTS,
  DEFAULT_SCORE_WEIGHTS,
  DEFAULT_BREAK_POLICY,
  DEFAULT_WORKING_HOURS,
  DEFAULT_ENERGY_CURVE,
  DEFAULT_HORIZON_DAYS,
} from './config.js';
export type {
  Task,
  TaskStatus,
  Block,
  BlockType,
  Schedule,
  UserConfig,
  Weights,
  ScoreWeights,
  Mode,
  LoadTier,
  TediumTier,
  BreakPolicy,
  WorkingHours,
  EnergyCurve,
  FeasibilityIssue,
  FeasibilityReport,
  SchedulerResult,
  ReplanOptions,
  Edit,
} from './types.js';
export type { MoveRecord, PreferenceSuggestion } from './preferences.js';
