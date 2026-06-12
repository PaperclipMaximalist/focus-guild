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

import type { Schedule, Task } from './types.js';
import type { ScoreBreakdown } from './planner.js';

interface NoteShape {
  term: keyof ScoreBreakdown;
  sign: '+' | '-';
  total: number;
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
  if (b.type === 'fixed') return b.note?.startsWith('Daily:')
    ? `Recurring: ${b.note.slice('Daily:'.length).trim()}`
    : 'Fixed block (meeting, recurring task, or external commitment).';
  if (b.type === 'buffer') return 'Buffer — no eligible task fit this slot.';
  if (b.locked) return 'Pinned — you placed this here; the planner respects it on every replan.';
  if (!b.taskId) return 'Empty work block.';

  const note = parseNote(b.note);
  const task = tasks.find((t) => t.id === b.taskId) ?? null;
  if (!note) return task ? `Working on ${task.name}.` : 'Working on this quest.';
  return reasonFor(note, task);
}
