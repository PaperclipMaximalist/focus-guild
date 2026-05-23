/**
 * Top-level generate / replan entrypoints.
 *
 * - generateSchedule: build from scratch from tasks + fixed blocks.
 * - replan: rebuild while preserving every locked block at its exact
 *   start/end, and never altering past blocks. Idempotent.
 */

import { plan } from './planner.js';
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
 * Replan: keeps locked blocks and past blocks intact; rebuilds only
 * unlocked future time. Idempotent — running twice with no input change
 * produces the same schedule.
 */
export function replan(
  currentSchedule: Schedule,
  tasks: Task[],
  config: UserConfig,
  now: number,
  _options: ReplanOptions = {},
): SchedulerResult {
  const past: Block[] = [];
  const lockedFuture: Block[] = [];
  const fixedFuture: Block[] = [];

  for (const b of currentSchedule) {
    if (b.end <= now) {
      past.push(b);
      continue;
    }
    if (b.type === 'fixed') {
      fixedFuture.push(b);
      continue;
    }
    if (b.locked) {
      lockedFuture.push(b);
      continue;
    }
    // unlocked + future: discarded; planner will refill.
  }

  // Adjust task.remainingMin for any locked future blocks that already
  // commit time to a task. The planner treats lockedBlocks as immovable
  // but ALSO needs to know that those minutes are already accounted for.
  const remainingAdjustment = new Map<string, number>();
  for (const b of lockedFuture) {
    if (b.type === 'work' && b.taskId) {
      const mins = (b.end - b.start) / 60_000;
      remainingAdjustment.set(b.taskId, (remainingAdjustment.get(b.taskId) ?? 0) + mins);
    }
  }
  const adjustedTasks = tasks.map((t) => {
    const used = remainingAdjustment.get(t.id) ?? 0;
    if (used <= 0) return t;
    return { ...t, remainingMin: Math.max(0, t.remainingMin - used) };
  });

  const result = plan({
    tasks: adjustedTasks,
    fixedBlocks: fixedFuture,
    lockedBlocks: lockedFuture,
    config,
    now,
  });

  // Stitch past blocks back in at the front.
  const merged = [...past, ...result.schedule].sort((a, b) => a.start - b.start);
  return { schedule: merged, feasibilityReport: result.feasibilityReport };
}
