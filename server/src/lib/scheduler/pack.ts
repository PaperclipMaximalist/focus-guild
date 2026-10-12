/**
 * Packing — the last step of a plan, when the config asks for a fixed gap
 * between blocks (`gapMin`) or for days filled in order (`fillDays`).
 *
 * The budget and the constructor get a day nearly right: the budget counts a
 * day's room with a guess at how many gaps it will hold, and the constructor
 * leaves the end of a stretch empty when the next sitting doesn't fit. Both
 * show: a plan that stops forty minutes before the day does, and gaps of
 * anything from nothing to twenty minutes. This pass makes the two promises
 * exact, working through the days in order:
 *
 *   1. Close up. Inside each stretch of free time, every block slides up to
 *      the one before it, `gapMin` apart, in the order it already had, and
 *      never before its quest may start.
 *   2. Fill the end (`fillDays` only). Free time left at the end of a
 *      stretch takes work from later in the plan: the next blocks in time
 *      order, whole or in part, never leaving a crumb behind.
 *
 * It only ever moves work earlier, so no deadline can be broken by it. Fixed
 * and pinned blocks are not in `built` and are never touched; they are the
 * edges of the free stretches (see buildDayInfo). Nor is a block that isn't
 * inside a free stretch to begin with: the others are packed round it.
 */

import type { DayInfo, FreeInterval } from './budget.js';
import type { ConstructedDay } from './constructor.js';
import type { Block, Task, UserConfig } from './types.js';

const MS_PER_MIN = 60_000;
/** The least free time worth pulling work into, and the least a block may be left with. */
const MIN_PULL_MIN = 15;
/** A block cut down to less than this to make room for a gap is dropped instead. */
const MIN_KEEP_MIN = 5;

type Work = Omit<Block, 'id'>;

export function packDays(
  days: DayInfo[],
  built: ConstructedDay[],
  taskMap: Map<string, Task>,
  config: Pick<UserConfig, 'gapMin' | 'fillDays' | 'todayCapMin'>,
  /** Is this day the one the check-in's cap applies to? Its total is the budget's business, not ours. */
  capped: (day: DayInfo) => boolean = () => false,
  /** Called on a piece split off a block, for a caller whose blocks carry ids. */
  split: (piece: Work) => Work = (piece) => piece,
): ConstructedDay[] {
  const gap = (config.gapMin ?? 0) * MS_PER_MIN;
  const blocks: Work[][] = built.map((d) => d.blocks.map((b) => ({ ...b })).sort((a, b) => a.start - b.start));
  const inside = (b: Work, iv: FreeInterval) => b.start >= iv.start - 1 && b.end <= iv.end + 1;
  const startOf = (b: Work) => (b.taskId ? taskMap.get(b.taskId)?.notBefore ?? 0 : 0);

  /** Slide the blocks of one stretch together. Returns where the next block would start. */
  const closeUp = (i: number, iv: FreeInterval): number => {
    let cursor = iv.start;
    for (const b of blocks[i]!.filter((x) => inside(x, iv))) {
      const len = b.end - b.start;
      const start = Math.max(cursor, startOf(b));
      const due = b.taskId ? taskMap.get(b.taskId)?.deadline ?? Infinity : Infinity;
      if (start <= b.start || (start + len <= iv.end && start + len <= due)) {
        // Up to the block before it; or later by the gap it arrived without, where that fits.
        b.start = start;
        b.end = start + len;
      } else if (b.end - start >= MIN_KEEP_MIN * MS_PER_MIN) {
        // It arrived touching the block before it and has nowhere to go: the gap comes off its start.
        b.start = start;
      } else {
        // Nothing worth keeping would be left of it.
        blocks[i] = blocks[i]!.filter((x) => x !== b);
        continue;
      }
      cursor = b.end + gap;
    }
    return cursor;
  };

  /** The next block later in the plan that could start by `cursor` in this stretch. */
  const nextSource = (i: number, iv: FreeInterval, cursor: number): { day: number; block: Work; start: number } | null => {
    for (let j = i; j < blocks.length; j += 1) {
      for (const b of blocks[j]!) {
        if (j === i && b.start < iv.end) continue;
        if (b.type !== 'work' || !b.taskId) continue;
        const start = Math.max(cursor, startOf(b));
        if ((iv.end - start) / MS_PER_MIN < MIN_PULL_MIN) continue;
        return { day: j, block: b, start };
      }
    }
    return null;
  };

  /**
   * The stretches of a day this pass may use. A block that isn't inside one of
   * the day's free intervals (the meal half hour moved under it on a replan,
   * say) stays exactly where it is, and the stretches go round it.
   */
  const stretches = (i: number): FreeInterval[] => {
    let out = days[i]!.freeIntervals;
    for (const b of blocks[i]!) {
      if (days[i]!.freeIntervals.some((iv) => inside(b, iv))) continue;
      out = out.flatMap((iv) =>
        b.end + gap <= iv.start || b.start - gap >= iv.end
          ? [iv]
          : [{ ...iv, end: b.start - gap }, { ...iv, start: b.end + gap }].filter((x) => x.end - x.start >= MS_PER_MIN),
      );
    }
    return out;
  };

  for (let i = 0; i < days.length; i += 1) {
    const day = days[i]!;
    for (const iv of stretches(i)) {
      let cursor = closeUp(i, iv);
      if (!config.fillDays || (config.todayCapMin !== undefined && capped(day))) continue;

      for (let guard = 0; guard < 60; guard += 1) {
        if ((iv.end - cursor) / MS_PER_MIN < MIN_PULL_MIN) break;
        const src = nextSource(i, iv, cursor);
        if (!src) break;
        const len = (src.block.end - src.block.start) / MS_PER_MIN;
        let take = Math.min(len, Math.floor((iv.end - src.start) / MS_PER_MIN));
        // Leave the rest a real sitting, or take it all.
        if (len - take > 0 && len - take < MIN_PULL_MIN) take = len - MIN_PULL_MIN;
        if (take < MIN_PULL_MIN) break;
        const whole = take >= len;
        const moved: Work = { ...src.block, start: src.start, end: src.start + take * MS_PER_MIN };
        const piece = whole ? moved : split(moved);
        if (whole) blocks[src.day] = blocks[src.day]!.filter((b) => b !== src.block);
        else src.block.end -= take * MS_PER_MIN;
        blocks[i]!.push(piece);
        blocks[i]!.sort((a, b) => a.start - b.start);
        cursor = piece.end + gap;
      }
    }
  }

  return built.map((d, i) => ({ ...d, blocks: blocks[i]! }));
}
