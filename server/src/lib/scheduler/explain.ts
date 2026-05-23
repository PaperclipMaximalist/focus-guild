/**
 * Human-readable explanations for placed blocks.
 */

import type { Schedule } from './types.js';

export function explainBlock(blockId: string, schedule: Schedule): string {
  const b = schedule.find((x) => x.id === blockId);
  if (!b) return `Block ${blockId} not found.`;
  if (b.type === 'break') return 'Break: scheduled per break policy.';
  if (b.type === 'fixed') return 'Fixed block (meeting, recurring task, or external commitment).';
  if (b.type === 'buffer') return 'Buffer: no eligible task fit this slot.';
  if (b.locked) return `Locked work block${b.taskId ? ` for task ${b.taskId}` : ''} — user-pinned, planner will not move.`;
  if (!b.taskId) return 'Empty work block.';
  return `Working on ${b.taskId}. Top contributors: ${b.note ?? 'n/a'}.`;
}
