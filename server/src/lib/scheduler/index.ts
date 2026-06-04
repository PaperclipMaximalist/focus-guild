/**
 * Auto-scheduler public API.
 *
 * Pure functions only — no DB, no I/O. See README.md for the formulas
 * and how to tune the weights.
 */

export { generateSchedule, replan } from './replan.js';
export { applyEdit } from './edits.js';
export { explainBlock } from './explain.js';
export { priorityScore, computeEnergyTrace } from './planner.js';
export { suggestPreferredHour, recordMove } from './preferences.js';
export { questToTask, questsToTasks, ADAPTER_DEFAULTS } from './adapter.js';
export type { QuestLike, QuestSchedulerOverrides } from './adapter.js';
export { placeDailyFillers } from './dailyFiller.js';
export type { DailyFiller, FillerPlacementInput } from './dailyFiller.js';
export {
  defaultConfig,
  DEFAULT_WEIGHTS,
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
