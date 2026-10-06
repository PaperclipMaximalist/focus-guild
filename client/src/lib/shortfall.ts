/**
 * What the Feed's "won't finish" banner says and offers for one short quest.
 *
 * The banner used to list "<quest> — short 90m" and stop: no word on what
 * the plan did manage, and nothing to tap. Each line now says how much of
 * the quest fits before its deadline and offers the two things a person can
 * actually decide, both of which the app already does through a quest edit:
 * give it another day, or cut it down to what fits. Nothing is applied
 * until tapped.
 *
 * Pure: `now` and the plan are passed in, so it is tested without a clock.
 */

import type { FeasibilityIssue, Quest, ScheduleBlock } from './api';
import { formatMinutes } from './formatters';

const DAY_MS = 24 * 60 * 60_000;

export interface ShortfallChoice {
  kind: 'deadline' | 'estimate';
  /** Button text; says exactly what a tap changes. */
  label: string;
  /** The quest edit a tap sends. */
  fields: { deadline: string } | { estimatedMinutes: number };
}

export interface ShortfallLine {
  taskId: string;
  title: string;
  /** Minutes of the quest the plan placed before its deadline. */
  fitsMin: number;
  /** Minutes it needed there. */
  neededMin: number;
  sentence: string;
  choices: ShortfallChoice[];
}

function dayAndTime(d: Date): string {
  const day = d.toLocaleDateString([], { weekday: 'short' });
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${day} ${time}`;
}

export function shortfallLine(
  issue: FeasibilityIssue,
  quest: Quest | undefined,
  schedule: ScheduleBlock[],
  now: number,
): ShortfallLine {
  const deadline = quest?.deadline ? new Date(quest.deadline) : null;
  const fitsMin = schedule
    .filter((b) => b.type === 'work' && b.taskId === issue.taskId)
    .filter((b) => new Date(b.end).getTime() > now && (!deadline || new Date(b.end).getTime() <= deadline.getTime()))
    .reduce((m, b) => m + b.durationMin, 0);
  const neededMin = fitsMin + issue.shortfallMin;
  const before = deadline ? ` before ${dayAndTime(deadline)}` : ' in this plan';
  const sentence = fitsMin > 0
    ? `${formatMinutes(fitsMin)} of ${formatMinutes(neededMin)} fits${before}`
    : `None of its ${formatMinutes(neededMin)} fits${before}`;

  const choices: ShortfallChoice[] = [];
  if (quest && deadline) {
    // A day later, never a deadline already gone: from now if it has passed.
    const later = new Date(Math.max(deadline.getTime(), now) + DAY_MS);
    choices.push({ kind: 'deadline', label: `Due ${dayAndTime(later)} instead`, fields: { deadline: later.toISOString() } });
  }
  // Cutting scope only when something is left to do afterwards.
  const trimmed = quest ? quest.estimatedMinutes - issue.shortfallMin : 0;
  if (quest && fitsMin > 0 && trimmed >= 5) {
    choices.push({ kind: 'estimate', label: `Trim it by ${formatMinutes(issue.shortfallMin)}`, fields: { estimatedMinutes: trimmed } });
  }
  return { taskId: issue.taskId, title: quest?.title ?? 'A quest', fitsMin, neededMin, sentence, choices };
}
