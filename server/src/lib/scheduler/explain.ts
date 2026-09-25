/**
 * Human-readable explanation of why a block landed where it did.
 *
 * The constructor stashes a compact JSON note on each placed work block:
 *   { term: keyof ScoreBreakdown, sign: '+' | '-', total: number }
 * indicating the term that dominated the placement score. We translate
 * that into a sentence here.
 *
 * Falls back to type-based stock copy for fixed / break / buffer / locked.
 */

import type { Schedule, Task, UserConfig } from './types.js';
import type { ScoreBreakdown } from './planner.js';
import { userHourOf, userMidnightUtc } from './tz.js';

interface NoteShape {
  term: keyof ScoreBreakdown;
  sign: '+' | '-';
  total: number;
  /** Plain-language "why now", composed from facts at placement time. */
  why?: string;
}

const DAY_MS = 24 * 60 * 60_000;

export interface WhyContext {
  task: Task;
  start: number;
  end: number;
  /** The work block just before this one today, if any. */
  prev: { task: Task; end: number } | null;
  config: Pick<UserConfig, 'energyCurve' | 'tzOffsetMin'>;
}

/**
 * "Why now", from facts a person would recognise, in the Bible's own form:
 * "deadline in 2 days + your energy is high". At most two clauses.
 *
 * The old reasons named whichever scoring term won, so an energy win at
 * 19:43 still said "your capacity is high right now" when the curve was at
 * its evening low. These only say what is true about this block.
 */
export function composeWhy(ctx: WhyContext): string | null {
  const { task, start, end, prev, config } = ctx;
  const tz = config.tzOffsetMin ?? 0;
  const clauses: string[] = [];

  // Deadline, in whole local days from this block.
  const days = Math.round((userMidnightUtc(task.deadline, tz) - userMidnightUtc(start, tz)) / DAY_MS);
  const soon = days >= 0 && days <= 3;
  if (days === 0) clauses.push('due today');
  else if (days === 1) clauses.push('due tomorrow');
  else if (soon) clauses.push(`due in ${days} days`);

  const energy = config.energyCurve(userHourOf(start + (end - start) / 2, tz));
  const load = task.cognitiveLoad;
  const minutes = (end - start) / 60_000;
  const gapMin = prev ? (start - prev.end) / 60_000 : Infinity;

  let situation: string | null = null;
  if (!prev && load >= 0.7 && minutes <= 30) situation = 'a short first push to get into it';
  else if (!prev && (load <= 0.5 || minutes <= 30)) situation = 'an easy start to get moving';
  else if (prev && gapMin < 20 && prev.task.cognitiveLoad >= 0.7 && load <= 0.5)
    situation = `a lighter change of pace after ${prev.task.name}`;
  else if (prev && gapMin < 20 && prev.task.category === 'admin' && task.category === 'admin')
    situation = 'batched with the admin before it';
  else if (load >= 0.7 && energy >= 0.75) situation = 'heavy work in your sharpest hours';
  else if (load >= 0.7 && energy < 0.55)
    situation = soon ? "heavy, but it's the best time left before it's due" : 'heavy work at a lower-energy hour, the sharper ones were full';
  else if (load <= 0.4 && energy < 0.55) situation = 'light work for a lower-energy stretch';
  else if (task.preferredHour !== null && Math.abs(userHourOf(start, tz) - task.preferredHour) <= 1)
    situation = 'at the time you asked for';
  else if (prev && gapMin < 20 && prev.task.category !== task.category) situation = 'a change of subject to keep it fresh';
  if (situation) clauses.push(situation);

  // Nothing notable: still say something true rather than nothing.
  if (!clauses.length) {
    if (days >= 0 && days <= 7) clauses.push(`due in ${days} days, so a piece of it now`);
    else if (load >= 0.7 && energy >= 0.65) clauses.push('heavy work while your energy is up');
    else if (energy >= 0.6) clauses.push('a steady block while your energy holds');
    else clauses.push('a steady piece of it, so it never piles up');
  }
  const text = clauses.join(' · ');
  return text.charAt(0).toUpperCase() + text.slice(1) + '.';
}

function parseNote(raw: string | null): NoteShape | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as NoteShape;
    if (typeof v.term === 'string' && (v.sign === '+' || v.sign === '-')) return v;
  } catch {}
  return null;
}

/**
 * Render the dominant-term reason as a one-line sentence the user can
 * read. Tries to fold in the task title when available.
 */
function reasonFor(note: NoteShape, task: Task | null): string {
  const name = task?.name ?? 'this task';
  const pos = note.sign === '+';
  switch (note.term) {
    case 'energy':
      return pos
        ? `Your capacity is high right now — good fit for ${name}.`
        : `Your capacity dipped at this hour — a lighter task would normally win, but ${name} still beat the alternatives.`;
    case 'urgency':
      return `Deadline is close enough that ${name} needed a slot soon.`;
    case 'batch':
      return `Chained with the previous admin/comms block to stay in flow.`;
    case 'prefHour':
      return `Placed at the time of day you asked for on ${name}.`;
    case 'monotony':
      return pos
        ? `Picked to keep variety — different mode from recent blocks.`
        : `No better candidate fit; this extends a same-mode run.`;
    case 'tedium':
      return `Last choice — every other candidate would have put two tedious blocks in a row.`;
    case 'cooldown':
      return `No lighter task was available; this back-to-back cognitive load is unavoidable here.`;
    case 'session':
      return `Chunk size is outside the ideal range, but it's the best slot available.`;
    default:
      return `Best fit for this slot.`;
  }
}

export function explainBlock(blockId: string, schedule: Schedule, tasks: Task[] = []): string {
  const b = schedule.find((x) => x.id === blockId);
  if (!b) return `Block ${blockId} not found.`;
  if (b.type === 'break') return 'Break — natural gap between work blocks.';
  if (b.type === 'fixed' && b.note?.startsWith('Calendar: ')) {
    return `From your calendar: ${b.note.slice('Calendar: '.length)}. That time is busy, so nothing is planned over it.`;
  }
  if (b.type === 'fixed') return b.note?.startsWith('Daily:')
    ? `Recurring: ${b.note.slice('Daily:'.length).trim()}`
    : 'Fixed block (meeting, recurring task, or external commitment).';
  if (b.type === 'buffer') return 'Buffer — no eligible task fit this slot.';
  if (b.locked) return 'Pinned — you placed this here; the planner respects it on every replan.';
  if (!b.taskId) return 'Empty work block.';

  const note = parseNote(b.note);
  const task = tasks.find((t) => t.id === b.taskId) ?? null;
  if (!note) return task ? `Working on ${task.name}.` : 'Working on this quest.';
  return note.why ?? reasonFor(note, task);
}

/** The composed "why now" stored on a work block's note, if any. */
export function whyFromNote(raw: string | null): string | null {
  return parseNote(raw)?.why ?? null;
}
