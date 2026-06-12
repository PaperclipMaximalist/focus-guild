/**
 * Top-level scheduler entrypoints.
 *
 *   generateSchedule  full clean build (used by "Reflow day" + first load).
 *                     Throws nothing away beyond past + fixed + user-locked.
 *   replan            minimal-perturbation reflow for edits/inserts. Keeps
 *                     every still-valid unlocked block exactly where it is;
 *                     only fills the gaps left by deleted/invalidated work.
 *                     Implementation: delegates to reflow.ts.
 *
 * The split matters: a "I added one quest" call hitting plan() would
 * shuffle the user's entire afternoon. reflow() preserves visual
 * continuity by treating stable blocks as additional locked blocks.
 */

import { plan } from './planner.js';
import { reflow } from './reflow.js';
import type { Block, Schedule, SchedulerResult, Task, UserConfig, ReplanOptions } from './types.js';

export function generateSchedule(
  tasks: Task[],
  fixedBlocks: Block[],
  config: UserConfig,
  now: number,
): SchedulerResult {
  return plan({ tasks, fixedBlocks, lockedBlocks: [], config, now });
}

/**
 * Replan / reflow: keeps past + locked + still-valid unlocked blocks intact;
 * only fills gaps with newly-needed work. Idempotent — running twice with
 * no input change produces the same schedule.
 *
 * `_options` is kept for backward-compat but ignored. Callers used to pass
 * `skipSwapPass`; that lever doesn't make sense for the new constructor.
 */
export function replan(
  currentSchedule: Schedule,
  tasks: Task[],
  config: UserConfig,
  now: number,
  _options: ReplanOptions = {},
): SchedulerResult {
  return reflow(currentSchedule, tasks, config, now);
}
