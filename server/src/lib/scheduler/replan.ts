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

import { routinesAside, type DailyFiller } from './dailyFiller.js';
import { plan } from './planner.js';
import { reflow } from './reflow.js';
import type { Block, Schedule, SchedulerResult, Task, UserConfig, ReplanOptions } from './types.js';

const shortfall = (r: SchedulerResult) => r.feasibilityReport.issues.reduce((m, i) => m + i.shortfallMin, 0);

/**
 * A plan that is short on a deadline gets one more try with the untimed
 * routines in its way moved aside. Kept only when it is less short: a
 * routine doesn't move for nothing.
 */
function aroundRoutines(
  first: SchedulerResult,
  blocks: Block[],
  routines: readonly DailyFiller[] | undefined,
  tasks: Task[],
  config: UserConfig,
  now: number,
  again: (blocks: Block[]) => SchedulerResult,
): SchedulerResult {
  if (!routines?.length || !first.feasibilityReport.issues.length) return first;
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const moved = routinesAside({
    blocks,
    shortfalls: first.feasibilityReport.issues.flatMap((i) => {
      const t = byId.get(i.taskId);
      return t ? [{ deadline: t.deadline, shortMin: i.shortfallMin, notBefore: t.notBefore }] : [];
    }),
    fillers: [...routines],
    now,
    workingHours: config.workingHours,
    tzOffsetMin: config.tzOffsetMin,
  });
  if (!moved) return first;
  const second = again(moved);
  return shortfall(second) < shortfall(first) ? second : first;
}

export function generateSchedule(
  tasks: Task[],
  fixedBlocks: Block[],
  config: UserConfig,
  now: number,
  /** The user's routines, so untimed ones can step aside for a deadline. */
  routines?: readonly DailyFiller[],
): SchedulerResult {
  const build = (fixed: Block[]) => plan({ tasks, fixedBlocks: fixed, lockedBlocks: [], config, now });
  return aroundRoutines(build(fixedBlocks), fixedBlocks, routines, tasks, config, now, build);
}

/**
 * Replan / reflow: keeps past + locked + still-valid unlocked blocks intact;
 * only fills gaps with newly-needed work. Idempotent — running twice with
 * no input change produces the same schedule.
 *
 * `options.addTaskIds` names quests the user just asked for, which may land
 * today whatever their deadline (see reflow.ts). `skipSwapPass` is kept for
 * backward-compat but ignored.
 */
export function replan(
  currentSchedule: Schedule,
  tasks: Task[],
  config: UserConfig,
  now: number,
  options: ReplanOptions = {},
): SchedulerResult {
  const flow = (blocks: Block[]) => reflow(blocks, tasks, config, now, options);
  return aroundRoutines(flow(currentSchedule), currentSchedule, options.routines, tasks, config, now, flow);
}
