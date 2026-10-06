/**
 * Human-readable explanation of why a block landed where it did.
 *
 * Every work block carries a compact JSON note:
 *   { term: keyof ScoreBreakdown, sign: '+' | '-', total: number, why?: string }
 * `term` is the scoring term that dominated the placement (debugging only);
 * `why` is the sentence the Feed shows. The constructor and reconcile write
 * a first `why` from what one block knows; `explainPlan` rewrites it at the
 * end of plan(), when the whole plan is there to check each claim against.
 *
 * Falls back to type-based stock copy for fixed / break / buffer / locked.
 */

import type { DayInfo } from './budget.js';
import type { Block, FeasibilityIssue, Schedule, Task, UserConfig } from './types.js';
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
const MIN_MS = 60_000;
/** Feed tiles cut a reason off a little after this many characters. */
const TILE_CHARS = 48;
/** A quest the adapter marked HIGH (urgency multiplier lifted to 1.4). */
const HIGH_URGENCY = 1.4 - 1e-9;
/** Energy from here up is "sharp hours"; below LOW is a low-energy hour. */
const SHARP = 0.75;
const LOW = 0.55;

/** Facts only the finished plan knows. Each one unlocks one clause. */
export interface PlanFacts {
  now: number;
  /** Minutes of the quest still to do after this block; null when unknown. */
  leftAfterMin: number | null;
  /** On the quest's last block: minutes the plan could not fit before its deadline. */
  shortAfterMin: number;
  /** Checked against the plan: no free slot that day holds this block with more energy. */
  noSharperToday: boolean;
  /** The same, over every day up to the quest's deadline. */
  noSharperBeforeDue: boolean;
}

export interface WhyContext {
  task: Task;
  start: number;
  end: number;
  /** The work block just before this one today, if any. */
  prev: { task: Task; end: number } | null;
  config: Pick<UserConfig, 'energyCurve' | 'tzOffsetMin'>;
  /** Left out by callers that see one block only: the reason then says less. */
  plan?: PlanFacts;
}

/** "40 min", "2 h", "1 h 20". */
function fmtMin(m: number): string {
  const r = Math.max(1, Math.round(m));
  if (r < 60) return `${r} min`;
  return r % 60 ? `${Math.floor(r / 60)} h ${r % 60}` : `${r / 60} h`;
}

/**
 * The clauses of a reason, most worth reading first, cut to what a tile
 * shows. Each clause is one fact that can be checked against the plan (the
 * population lab's `reason-false` does exactly that):
 *
 *   due today / tomorrow / in N days    the quest has a deadline that day
 *   high priority                       the quest is HIGH
 *   this finishes it                    nothing of it is left after this block
 *   N short after this                  its last block; the plan is N short
 *   short first push / easy start       the day's first block (heavy and
 *                                       at most 30 min / load 5 or less)
 *   lighter, after heavy work           straight after a heavy block
 *   batched with other admin            straight after another admin quest
 *   back to it after a break            same quest as the block before
 *   heavy work, sharp hours             load 7+, energy 0.75+
 *   no sharper time left / free today   heavy, low energy, and no free slot
 *                                       with more energy before it's due / that day
 *   light work, low-energy hour         load 4 or less, energy under 0.55
 *   at the time you asked for           within an hour of the preferred hour
 *   untouched N days                    no deadline, not worked on for a week+
 *   N left after this                   what remains of the quest
 *
 * The reasons before this said "it's the best time left before it's due"
 * and "the sharper ones were full" from the block's own energy alone: with a
 * sharper slot free in half of all first plans (population lab, seeds 7 and
 * 23). A claim about the rest of the day is now made only with `plan` facts,
 * and otherwise left out: saying less beats saying something false.
 */
export function whyClauses(ctx: WhyContext): string[] {
  return pack(rankedClauses(ctx));
}

/** The first fact always; then whatever still fits on a tile, three at most. */
function pack(ranked: string[]): string[] {
  const out: string[] = [];
  let length = 0;
  for (const c of ranked) {
    if (out.length === 3) break;
    if (out.length && length + 3 + c.length > TILE_CHARS) continue;
    out.push(c);
    length += (out.length > 1 ? 3 : 0) + c.length;
  }
  return out;
}

function rankedClauses(ctx: WhyContext): string[] {
  const { task, start, end, prev, config, plan } = ctx;
  const tz = config.tzOffsetMin ?? 0;

  // Deadline, in whole local days from this block. An undated quest has a
  // stand-in deadline two weeks out; "due in 8 days" would be invented.
  const days = Math.round((userMidnightUtc(task.deadline, tz) - userMidnightUtc(start, tz)) / DAY_MS);
  const due = task.undated || days < 0 ? null
    : days === 0 ? 'due today' : days === 1 ? 'due tomorrow' : `due in ${days} days`;
  const soon = due !== null && days <= 3;

  const energy = config.energyCurve(userHourOf(start + (end - start) / 2, tz));
  const load = task.cognitiveLoad;
  const minutes = (end - start) / MIN_MS;
  const gapMin = prev ? (start - prev.end) / MIN_MS : Infinity;
  const sameQuest = prev?.task.id === task.id;
  const follows = prev !== null && !sameQuest && gapMin < 20;

  let slot: string | null = null;
  if (!prev && load >= 0.7 && minutes <= 30) slot = 'short first push';
  else if (!prev && load <= 0.5) slot = 'easy start';
  else if (follows && prev!.task.cognitiveLoad >= 0.7 && load <= 0.5) slot = 'lighter, after heavy work';
  else if (follows && prev!.task.category === 'admin' && task.category === 'admin') slot = 'batched with other admin';
  else if (load >= 0.7 && energy >= SHARP) slot = 'heavy work, sharp hours';
  else if (load >= 0.7 && energy < LOW && soon && plan?.noSharperBeforeDue) slot = 'no sharper time left';
  else if (load >= 0.7 && energy < LOW && plan?.noSharperToday) slot = 'no sharper time free today';
  else if (load <= 0.4 && energy < LOW) slot = 'light work, low-energy hour';
  else if (task.preferredHour !== null && Math.abs(userHourOf(start, tz) - task.preferredHour) <= 1) slot = 'at the time you asked for';
  else if (sameQuest && gapMin >= 5) slot = 'back to it after a break';

  const left = plan?.leftAfterMin ?? null;
  const ending = plan && plan.shortAfterMin > 0 ? `${fmtMin(plan.shortAfterMin)} short after this`
    : left !== null && left < 1 ? 'this finishes it' : null;
  const waited = plan && task.undated ? Math.floor((plan.now - (task.lastWorkedAt ?? task.createdAt)) / DAY_MS) : 0;

  return [
    soon ? due : null,
    task.urgencyMultiplier >= HIGH_URGENCY ? 'high priority' : null,
    ending,
    slot,
    soon ? null : due,
    waited >= 7 ? `untouched ${waited} days` : null,
    !ending && left !== null && left >= 1 ? `${fmtMin(left)} left after this` : null,
  ].filter((c): c is string => c !== null);
}

function sentence(clauses: string[]): string | null {
  if (!clauses.length) return null;
  const text = clauses.join(' · ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * "Why now", from facts a person would recognise, in the Bible's own form:
 * "deadline in 2 days + your energy is high". Null when there is nothing
 * true and worth saying.
 */
export function composeWhy(ctx: WhyContext): string | null {
  return sentence(whyClauses(ctx));
}

/**
 * Write every work block's reason from the finished plan.
 *
 * A reason composed while the day is being built can't know what the rest
 * of the plan will hold: whether this block is the quest's last, how much is
 * left after it, whether a sharper hour stayed free. Reconcile also moves
 * work in after the day was annotated, and a replan keeps blocks whose
 * reasons were true of an older plan. So the sentences are settled here,
 * once, over the whole schedule (kept blocks included). Only notes change:
 * no block is moved, added or removed.
 *
 * A sentence already on three blocks of a day is not said a fourth time:
 * the block keeps the part of it that is its own ("This finishes it" rather
 * than a tenth "Due today · this finishes it").
 */
export function explainPlan(
  schedule: Schedule,
  tasks: Task[],
  days: DayInfo[],
  issues: FeasibilityIssue[],
  config: UserConfig,
  now: number,
): Schedule {
  const tz = config.tzOffsetMin ?? 0;
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const work = schedule
    .filter((b) => b.type === 'work' && b.taskId !== null && taskMap.has(b.taskId))
    .sort((a, b) => a.start - b.start);
  if (!work.length) return schedule;

  // The plan day a moment belongs to: the first whose hours haven't ended
  // yet. (Not "inside workStart..workEnd": today's workStart is `now`, and a
  // kept block already under way starts before it. It then counted as some
  // other day, and the block after it was called the day's "easy start".)
  const dayIndex = (t: number): number => {
    const i = days.findIndex((d) => t < d.workEnd);
    return i >= 0 && t >= days[i]!.workEnd - DAY_MS ? i : -1;
  };
  const dayOf = (t: number): string => {
    const i = dayIndex(t);
    return i >= 0 ? `d${i}` : `m${userMidnightUtc(t, tz)}`;
  };
  const energyAt = (t: number) => config.energyCurve(userHourOf(t, tz));
  const shortBy = new Map(issues.map((i) => [i.taskId, i.shortfallMin]));
  const lastOf = new Map<string, Block>();
  for (const b of work) lastOf.set(b.taskId!, b);

  /** Is there free time, in `inDays` and before `until`, that holds `b` with more energy? */
  const sharperFree = (b: Block, inDays: DayInfo[], until: number): boolean => {
    const len = b.end - b.start;
    const need = energyAt(b.start + len / 2) + 0.05;
    const from = Math.max(now, taskMap.get(b.taskId!)!.notBefore ?? 0);
    for (const d of inDays) {
      for (const iv of d.freeIntervals) {
        // Free = the day's free time less the other work in it. No break
        // margins: counting a slot too many only makes the reason say less.
        let cursor = Math.max(iv.start, from);
        const inside = work.filter((x) => x !== b && x.end > iv.start && x.start < iv.end);
        for (const x of [...inside, null]) {
          const gapEnd = Math.min(until, x ? x.start : iv.end);
          for (let s = Math.ceil(cursor / (5 * MIN_MS)) * 5 * MIN_MS; s + len <= gapEnd; s += 5 * MIN_MS) {
            if (energyAt(s + len / 2) >= need) return true;
          }
          if (x) cursor = Math.max(cursor, x.end);
        }
      }
    }
    return false;
  };

  const done = new Map<string, number>();
  const said = new Map<string, number>();
  const whyById = new Map<string, string | null>();
  let prev: Block | null = null;
  for (const b of work) {
    const task = taskMap.get(b.taskId!)!;
    const day = dayOf(b.start);
    const before = prev && dayOf(prev.start) === day ? { task: taskMap.get(prev.taskId!)!, end: prev.end } : null;
    prev = b;
    const cum = (done.get(task.id) ?? 0) + (b.end - b.start) / MIN_MS;
    done.set(task.id, cum);
    if (!parseNote(b.note)) continue; // a block the user made by hand has no reason to rewrite

    // In a replan the task arrives with its kept blocks already taken off
    // (`committedMin`); add them back for what is really left. Without this
    // a replan that changed nothing turned "this finishes it" into silence.
    const left = Math.max(0, Math.round(task.remainingMin + (task.committedMin ?? 0) - cum));
    const heavyLow = task.cognitiveLoad >= 0.7 && energyAt(b.start + (b.end - b.start) / 2) < LOW;
    const today = dayIndex(b.start) >= 0 ? [days[dayIndex(b.start)]!] : [];
    const ranked = rankedClauses({
      task, start: b.start, end: b.end, prev: before, config,
      plan: {
        now,
        leftAfterMin: left,
        shortAfterMin: lastOf.get(task.id) === b ? shortBy.get(task.id) ?? 0 : 0,
        noSharperToday: heavyLow && today.length > 0 && !sharperFree(b, today, Infinity),
        noSharperBeforeDue: heavyLow && !task.undated && !sharperFree(b, days, task.deadline),
      },
    });
    // Said three times already today: keep what is this block's own.
    const options = [ranked, ranked.slice(1), ranked.slice(2), ranked.slice(0, 1)]
      .map((r) => sentence(pack(r)))
      .filter((s): s is string => s !== null);
    const why = options.find((s) => (said.get(`${day}|${s}`) ?? 0) < 3) ?? options[0] ?? null;
    whyById.set(b.id, why);
    if (why) said.set(`${day}|${why}`, (said.get(`${day}|${why}`) ?? 0) + 1);
  }

  return schedule.map((b) => {
    const why = whyById.get(b.id);
    if (why === undefined) return b;
    // Nothing checkable to say: drop the old sentence rather than keep one
    // that was true of another plan.
    const { why: _old, ...rest } = parseNote(b.note)!;
    return { ...b, note: JSON.stringify(why ? { ...rest, why } : rest) };
  });
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
