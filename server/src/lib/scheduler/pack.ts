/**
 * Packing — the last step of a plan, when the config asks for a fixed gap
 * between blocks (`gapMin`), long breaks (`breakMin`), or days filled in order
 * (`fillDays`).
 *
 * The budget and the constructor decide what is worked on and in what order.
 * This pass decides exactly when: it takes every unpinned work block of the
 * plan, in the order it has, and lays the lot out again from the first free
 * minute, one after another:
 *
 *   - `gapMin` between consecutive blocks, no more and no less;
 *   - a break of `breakMin` once about `breakEveryMin` of work has gone by
 *     without a pause that long (a routine, lunch and the night all count as
 *     one), put between two blocks, never at the start or the end of a stretch;
 *   - a block that doesn't fit before the next fixed thing is cut there and
 *     carries on after it, in pieces no shorter than MIN_PIECE_MIN;
 *   - with `fillDays`, a day takes the next day's blocks while it has room;
 *     without it a block only ever moves to a later day, when its own is full.
 *
 * The order is the plan's own (or the one a drag gave it), with one exception:
 * a block that would miss its deadline by waiting its turn goes first.
 * Fixed and pinned blocks are not in `built` and never move; they are the
 * edges of the free stretches (see buildDayInfo), and pinned work counts
 * toward the run of work a break is measured from.
 */

import { WHOLE_TASK_MAX_MIN, type DayInfo } from './budget.js';
import type { ConstructedDay } from './constructor.js';
import type { Block, Task, UserConfig } from './types.js';

const MS_PER_MIN = 60_000;
/** The shortest piece of a block worth placing by itself. */
export const MIN_PIECE_MIN = 15;
/** "About" every `breakEveryMin`: a break is due this early, and a run may overshoot by twice this. */
const BREAK_SLOP_MIN = 15;
/** A block shorter than this (or than its quest's piece) joins another block of its quest, if the quest has one. */
const CRUMB_MIN = MIN_PIECE_MIN;
/** The shortest piece of heavy work worth sitting down to: less is a fragment. */
export const MIN_HEAVY_PIECE_MIN = 25;
/** Work this demanding (cognitiveLoad) is heavy; as in the constructor. */
const HEAVY = 0.7;
/**
 * Work due soon goes first while it still has this much room to spare: half
 * of what is left of it, and never under an hour. People run over their
 * estimates; a quest planned to end just before its deadline misses it.
 */
const DEADLINE_SPARE_SHARE = 0.5;
const DEADLINE_SPARE_MIN = 60;
/** Work between long breaks when the config doesn't say. */
export const DEFAULT_BREAK_EVERY_MIN = 120;

type Work = Omit<Block, 'id'>;

export interface PackOptions {
  /** Is this the day the check-in's cap applies to? Then it takes no work from later days. */
  capped?: (day: DayInfo) => boolean;
  /** Called on every block this pass creates (a later piece of a cut block, a break), for a caller whose blocks carry ids. */
  mint?: (piece: Work) => Work;
  /** Minutes of quest work already behind `now` with no long pause in them. */
  runBefore?: number;
  now?: number;
}

export function packDays(
  days: DayInfo[],
  built: ConstructedDay[],
  taskMap: Map<string, Task>,
  config: Pick<UserConfig, 'gapMin' | 'breakMin' | 'breakEveryMin' | 'fillDays' | 'todayCapMin'>,
  options: PackOptions = {},
): ConstructedDay[] {
  const gap = Math.max(0, config.gapMin ?? 0) * MS_PER_MIN;
  const breakLen = Math.max(0, config.breakMin ?? 0) * MS_PER_MIN;
  const every = Math.max(MIN_PIECE_MIN, config.breakEveryMin ?? DEFAULT_BREAK_EVERY_MIN);
  const mint = options.mint ?? ((piece: Work) => piece);
  const least = MIN_PIECE_MIN * MS_PER_MIN;

  const startOf = (b: Work) => (b.taskId ? taskMap.get(b.taskId)?.notBefore ?? 0 : 0);
  const dueOf = (b: Work) => (b.taskId ? taskMap.get(b.taskId)?.deadline ?? Infinity : Infinity);
  const lengthOf = (b: Work) => b.end - b.start;
  const taskOf = (b: Work) => (b.taskId ? taskMap.get(b.taskId) : undefined);
  /** The shortest piece of this block's quest worth placing: longer for heavy work. */
  const pieceOf = (b: Work) => ((taskOf(b)?.cognitiveLoad ?? 0) >= HEAVY ? MIN_HEAVY_PIECE_MIN : MIN_PIECE_MIN) * MS_PER_MIN;
  /** The least of a block that may be placed: a real piece, or all of it when it is too short to cut in two. */
  // ... and all of a small quest's block, whatever its length: a small quest is
  // done in one sitting (WHOLE_TASK_MAX_MIN, as the budget treats it).
  const needOf = (b: Work) =>
    lengthOf(b) < 2 * pieceOf(b) || (taskOf(b)?.remainingMin ?? Infinity) <= WHOLE_TASK_MAX_MIN ? lengthOf(b) : pieceOf(b);
  /** How long one sitting of a quest may grow to when pieces of it are joined. */
  const longestOf = (b: Work) => Math.max(taskOf(b)?.maxChunkMin ?? 90, 15) * MS_PER_MIN;

  // Every movable work block, in plan order. `cut` once a piece of it has been placed.
  interface Item { b: Work; home: number; cut: boolean }
  const queue: Item[] = [];
  built.forEach((d, i) => {
    for (const b of d.blocks.filter((x) => x.type === 'work' && x.taskId).sort((x, y) => x.start - y.start)) {
      queue.push({ b: { ...b }, home: i, cut: false });
    }
  });
  // A crumb (a replan can leave a quest's last few minutes as a block of their
  // own) joins the nearest other block of the same quest, if it has one.
  for (const it of [...queue]) {
    if (lengthOf(it.b) >= Math.max(CRUMB_MIN * MS_PER_MIN, pieceOf(it.b))) continue;
    const at = queue.indexOf(it);
    const others = queue.filter((x) => x !== it && x.b.taskId === it.b.taskId);
    if (!others.length) continue;
    const host = others.reduce((best, x) => (Math.abs(queue.indexOf(x) - at) < Math.abs(queue.indexOf(best) - at) ? x : best));
    host.b.end += lengthOf(it.b);
    queue.splice(at, 1);
  }
  const out: Work[][] = built.map(() => []);

  // Work since the last long pause, and when the last of it ended.
  let run = options.runBefore ?? 0;
  let lastEnd = run > 0 && options.now !== undefined ? options.now : -Infinity;

  for (let i = 0; i < days.length; i += 1) {
    const day = days[i]!;
    const takesLater = !!config.fillDays && !(config.todayCapMin !== undefined && options.capped?.(day));
    const mayTake = (it: Item) => it.home <= i || takesLater;
    const held = day.immovableThisDay.filter((b) => b.type === 'work').sort((a, b) => a.start - b.start);

    for (const iv of day.freeIntervals) {
      // Work already in place before this stretch (a pin, the sitting under way) is part of the run.
      // Does this stretch open exactly one gap after such a block? Then a break
      // due at once starts when that block ends, not a gap later.
      let afterHeld: number | null = null;
      for (const h of held) {
        if (h.end > iv.start + 1) continue;
        if (Math.abs(iv.start - (h.end + gap)) <= 1) afterHeld = h.end;
        if (h.end <= lastEnd) continue;
        if (breakLen > 0 && h.start - lastEnd >= breakLen) run = 0;
        run += (h.end - Math.max(h.start, lastEnd)) / MS_PER_MIN;
        lastEnd = h.end;
      }
      if (breakLen > 0 && iv.start - lastEnd >= breakLen) run = 0;
      let cursor = iv.start;

      // Blocks that turned out not to fit this stretch after all (a break moved
      // them, or a deadline cut them short): the next in line is tried instead,
      // so one awkward block doesn't leave the end of a stretch empty.
      const passed = new Set<Item>();
      for (let guard = 0; guard < 1000; guard += 1) {
        const fits = (it: Item) => Math.max(cursor, startOf(it.b)) + needOf(it.b) <= iv.end;
        const ready = queue.filter((it) => !passed.has(it) && mayTake(it) && fits(it));
        if (!ready.length) break;

        // The next in order, unless work due soon is running out of room to spare:
        // then the quest due first among those goes now. The room counts all of
        // that quest's blocks still to place, and the gaps between them.
        let pick = ready[0]!;
        let urgent: { it: Item; due: number } | null = null;
        const seen = new Set<string>();
        for (const it of ready) {
          const id = it.b.taskId!;
          if (seen.has(id)) continue;
          seen.add(id);
          const due = dueOf(it.b);
          if (!Number.isFinite(due)) continue;
          const own = queue.filter((x) => x.b.taskId === id);
          const need = own.reduce((m, x) => m + lengthOf(x.b), 0) + (own.length - 1) * gap;
          const spare = due - Math.max(cursor, startOf(it.b)) - need;
          const wanted = Math.max(DEADLINE_SPARE_MIN * MS_PER_MIN, need * DEADLINE_SPARE_SHARE);
          // Past saving (it can't make it however soon it starts) is triage's business, not this.
          if (spare < wanted && spare > -least && (!urgent || due < urgent.due)) urgent = { it, due };
        }
        if (urgent && urgent.it.b.taskId !== pick.b.taskId) pick = urgent.it;
        else {
          const headEnd = Math.max(cursor, startOf(pick.b)) + lengthOf(pick.b);
          for (const it of ready) {
            if (it !== pick && dueOf(it.b) < headEnd + gap + lengthOf(it.b) && dueOf(it.b) < dueOf(pick.b)) pick = it;
          }
        }

        const b = pick.b;
        const len = lengthOf(b);
        const due = dueOf(b);
        const first = needOf(b);
        const piece = pieceOf(b);
        let start = Math.max(cursor, startOf(b));
        // Straight on from a block of the same quest, with no break between:
        // one longer sitting, not two with a gap in the middle.
        const prev = out[i]![out[i]!.length - 1];
        const joins =
          prev !== undefined && prev.type === 'work' && prev.taskId === b.taskId && prev.end === lastEnd && cursor === lastEnd + gap && start === cursor;

        // A long break first, if the run has earned one and both it and a piece of this block fit.
        // The run alone decides it, never the length of what comes next: then laying
        // out a plan that is already laid out changes nothing.
        let pendingBreak: Work | null = null;
        if (breakLen > 0 && run > 0 && start - lastEnd < breakLen) {
          const earned = run >= every - BREAK_SLOP_MIN;
          const from = afterHeld !== null && lastEnd === afterHeld ? afterHeld : Math.max(lastEnd, iv.start);
          const resume = Math.max(from + breakLen, startOf(b));
          if (earned && resume + first <= iv.end && resume + first <= due) {
            // Only put in once a piece of this block is placed after it.
            pendingBreak = { start: from, end: from + breakLen, type: 'break', taskId: null, locked: false, note: 'Break' };
            start = resume;
          }
        }

        // Only while the joined sitting still has room for a real piece of this one.
        const joined = joins && start === cursor && prev!.start + longestOf(b) - prev!.end >= first;
        if (joined) start = prev!.end;
        const room = Math.min(iv.end, due, joined ? prev!.start + longestOf(b) : Infinity) - start;
        if (room < first) {
          // Past the point it could still finish by its deadline: later only gets worse.
          if (due - start < first) {
            queue.splice(queue.indexOf(pick), 1);
            continue;
          }
          passed.add(pick);
          continue;
        }
        let take = Math.min(len, Math.floor(room / MS_PER_MIN) * MS_PER_MIN);
        // A run stops at about `breakEveryMin` and a quarter of an hour: the block is
        // cut there, the break comes, and the rest of it follows the break.
        const cap = (every + BREAK_SLOP_MIN - (pendingBreak ? 0 : run)) * MS_PER_MIN;
        if (breakLen > 0 && take > cap) {
          // As close to the limit as leaves the rest a real piece.
          const cut = Math.floor(Math.min(cap, len - piece) / MS_PER_MIN) * MS_PER_MIN;
          // (Never a small quest: that is done in one sitting, a few minutes over or not.)
          if (cut >= piece && cut >= first) take = cut;
        }
        // Leave the rest a real piece, or take it all.
        if (len - take > 0 && len - take < piece) take = len - piece;
        // (Only whole minutes fit: a block may fall a few seconds short of `first` here.)
        if (take < first) {
          passed.add(pick);
          continue;
        }

        if (pendingBreak) {
          out[i]!.push(mint(pendingBreak));
          run = 0;
        }
        let placed: Work;
        if (joined) {
          prev!.end = start + take;
          placed = prev!;
        } else {
          placed = { ...b, start, end: start + take };
          out[i]!.push(pick.cut ? mint(placed) : placed);
        }
        if (take >= len) queue.splice(queue.indexOf(pick), 1);
        else {
          pick.b = { ...b, end: b.start + (len - take) };
          pick.cut = true;
        }
        run += take / MS_PER_MIN;
        lastEnd = placed.end;
        cursor = placed.end + gap;
      }
    }
  }

  return built.map((d, i) => ({ ...d, blocks: out[i]!.sort((a, b) => a.start - b.start) }));
}
