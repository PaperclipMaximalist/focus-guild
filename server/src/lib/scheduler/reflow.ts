/**
 * Minimal-perturbation reflow for `/edit` and `/insert` paths.
 *
 * The old replan() called plan() to rebuild the entire future from scratch
 * on every edit. That's overkill and disruptive — a one-quest add or a
 * single block move should NOT shuffle the rest of the user's day.
 *
 * reflow() instead:
 *   1. Preserves past blocks and immovable (fixed + locked) future blocks
 *      verbatim. They can't move and shouldn't.
 *   2. Keeps every still-valid future unlocked work block exactly where
 *      it is. "Still valid" = its task still exists, hasn't completed,
 *      the block still ends before the task's deadline, and the task's
 *      dependencies are still met. Treats those as additional locked
 *      blocks so plan() routes around them.
 *   3. Computes leftover task work (each task's remainingMin minus what's
 *      already in stable blocks) and runs plan() ONLY against the gaps
 *      and the leftover work. The constructor naturally fills the empty
 *      time without touching what's stable.
 *   4. Strips the "temporarily locked" flag back off stable blocks in the
 *      output, so the user can still drag/pin/unpin them normally.
 *
 * This preserves the spec invariants AND the implicit "tap a quest, only
 * the new block appears; nothing else moves" UX expectation.
 */

import { plan } from './planner.js';
import type { Block, Schedule, SchedulerResult, Task, UserConfig } from './types.js';

const MS_PER_MIN = 60_000;

function depsMet(task: Task, taskMap: Map<string, Task>): boolean {
  for (const id of task.dependencies) {
    const dep = taskMap.get(id);
    if (!dep || dep.status !== 'done') return false;
  }
  return true;
}

/** A block is "stable" if it can stay exactly where it is during reflow. */
function isStable(b: Block, taskMap: Map<string, Task>, now: number): boolean {
  if (b.type !== 'work' || !b.taskId) return false;
  if (b.end <= now) return false; // past — handled separately
  if (b.locked) return false;     // already explicitly locked — separate bucket
  const t = taskMap.get(b.taskId);
  if (!t) return false;            // task deleted
  if (t.status === 'done') return false;
  if (b.end > t.deadline) return false;
  if (!depsMet(t, taskMap)) return false;
  return true;
}

export function reflow(
  currentSchedule: Schedule,
  tasks: Task[],
  config: UserConfig,
  now: number,
): SchedulerResult {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  const past: Block[] = [];
  const fixedFuture: Block[] = [];
  const userLockedFuture: Block[] = [];
  const stableFuture: Block[] = [];
  // unlockedFuture-non-stable = dropped silently (they're invalidated)

  for (const b of currentSchedule) {
    if (b.end <= now) { past.push(b); continue; }
    if (b.type === 'fixed') { fixedFuture.push(b); continue; }
    if (b.locked) { userLockedFuture.push(b); continue; }
    if (isStable(b, taskMap, now)) stableFuture.push(b);
    // else: dropped (invalidated unlocked block — its time becomes free)
  }

  // Subtract minutes already committed by stable + user-locked work blocks
  // from each task's remainingMin so the planner doesn't double-book.
  const consumed = new Map<string, number>();
  for (const b of [...stableFuture, ...userLockedFuture]) {
    if (b.type !== 'work' || !b.taskId) continue;
    const mins = (b.end - b.start) / MS_PER_MIN;
    consumed.set(b.taskId, (consumed.get(b.taskId) ?? 0) + mins);
  }
  const adjusted = tasks.map((t) => {
    const used = consumed.get(t.id) ?? 0;
    if (used <= 0) return t;
    return { ...t, remainingMin: Math.max(0, t.remainingMin - used) };
  });

  // Run the full planner over the remaining work. Treat stable blocks as
  // ADDITIONAL locked blocks: that's the trick — plan() routes around them
  // exactly as it routes around user-pinned blocks, so the constructor only
  // ever places into the freed gaps.
  const result = plan({
    tasks: adjusted,
    fixedBlocks: fixedFuture,
    lockedBlocks: [...userLockedFuture, ...stableFuture],
    config,
    now,
  });

  // Strip our temporary `locked=true` off the stable blocks so they look the
  // same to the client as they did before reflow. User-locked blocks keep
  // their locked flag (they were genuinely pinned).
  const stableIds = new Set(stableFuture.map((b) => b.id));
  const restored: Block[] = result.schedule.map((b) =>
    stableIds.has(b.id) ? { ...b, locked: false } : b,
  );

  // Stitch past at the front.
  const merged = [...past, ...restored].sort((a, b) => a.start - b.start);
  return { schedule: merged, feasibilityReport: result.feasibilityReport };
}
