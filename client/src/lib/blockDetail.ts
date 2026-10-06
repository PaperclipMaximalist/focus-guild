/**
 * "Why this?" in the block sheet.
 *
 * It used to fetch the block's reason from the server and print the very
 * sentence already shown above it and on the tile. The sheet now adds what
 * the tile has no room for: the real deadline, how much of the quest is
 * planned after this block, and when it is picked up next.
 *
 * Pure: read from the plan and the quest already on screen.
 */

import type { Quest, ScheduleBlock } from './api';
import { formatMinutes } from './formatters';

function dayAndTime(d: Date): string {
  return `${d.toLocaleDateString([], { weekday: 'short' })} ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

export function blockDetail(block: ScheduleBlock, quest: Quest | null, schedule: ScheduleBlock[]): string {
  const end = new Date(block.end).getTime();
  const later = schedule
    .filter((b) => b.type === 'work' && b.taskId === block.taskId && b.id !== block.id && new Date(b.start).getTime() >= end)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  const laterMin = later.reduce((m, b) => m + b.durationMin, 0);
  const parts: string[] = [];
  parts.push(quest?.deadline ? `Due ${dayAndTime(new Date(quest.deadline))}.` : 'No deadline.');
  if (later.length) {
    parts.push(`After this, ${formatMinutes(laterMin)} more of it is planned; next ${dayAndTime(new Date(later[0]!.start))}.`);
  } else {
    parts.push('This is the last block planned for it.');
  }
  if (block.locked) parts.push('Pinned here by you.');
  return parts.join(' ');
}
