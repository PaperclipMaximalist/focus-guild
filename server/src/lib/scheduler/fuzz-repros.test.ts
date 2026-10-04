/**
 * Repros from the fuzz lab (scripts/fuzz-lab.ts, `npm run lab:fuzz`).
 *
 * Each test is the smallest case the lab's shrinker found for one violation
 * class, rewritten by hand with round numbers. They are `it.fails`: the
 * assertion states the property, the scheduler breaks it today, and the
 * suite stays green. Whoever fixes one flips it to `it`.
 *
 * The seed in each comment is `npm run lab:fuzz -- --seed 1 --shrink <case>
 * --class "<class>"`. Ordered by what a user would notice most.
 */
import { describe, it, expect } from 'vitest';
import { generateSchedule, replan } from './replan.js';
import { applyEdit } from './edits.js';
import { placeDailyFillers } from './dailyFiller.js';
import { defaultConfig } from './config.js';
import type { Block, Task, UserConfig } from './types.js';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** Monday 5 Oct 2026, midnight UTC; configs here have no tzOffsetMin, so hours are UTC hours. */
const D0 = Date.UTC(2026, 9, 5);
const at = (day: number, hour: number) => D0 + day * DAY + hour * HOUR;

/** A quest as the adapter hands it over: every field at the quest form's default. */
function task(id: string, over: Partial<Task> = {}): Task {
  return {
    id,
    name: id,
    remainingMin: 60,
    totalMin: over.remainingMin ?? 60,
    deadline: at(14, 9),
    tediousness: 0.4,
    cognitiveLoad: 0.5,
    importance: 0.5,
    setupCost: 0.3,
    minChunkMin: 15,
    maxChunkMin: 50,
    category: 'deep_work',
    preferredHour: null,
    dependencies: [],
    createdAt: D0 - DAY,
    lastWorkedAt: null,
    status: 'pending',
    urgencyMultiplier: 1,
    ...over,
  };
}

const cfg = (over: Partial<UserConfig> = {}): UserConfig => ({ ...defaultConfig(), ...over });
const work = (id: string, taskId: string, start: number, mins: number, locked = false): Block => ({
  id, start, end: start + mins * MIN, type: 'work', taskId, locked, note: null,
});
const minutesFor = (blocks: Block[], taskId: string) =>
  blocks.filter((b) => b.type === 'work' && b.taskId === taskId).reduce((m, b) => m + (b.end - b.start) / MIN, 0);
const overlaps = (blocks: Block[]) => {
  const w = blocks.filter((b) => b.type === 'work').sort((a, b) => a.start - b.start);
  const out: string[] = [];
  for (let i = 1; i < w.length; i++) if (w[i]!.start < w[i - 1]!.end) out.push(`${w[i - 1]!.id} × ${w[i]!.id}`);
  return out;
};

describe('fuzz lab repros (each one fails today)', () => {
  // Seed 1, case 105, "minutes:over-planned, generate placed more than is left"
  // (3% of cases, all settings at their defaults).
  // What a user sees: a 2-hour quest gets 2 h 40 min of blocks. Five plain
  // quests on a busy day; reconcile lends one quest's time to a tighter
  // deadline, then pays the loan back on a later day without checking the
  // quest still needs it.
  it.fails('never plans more minutes for a quest than it has left', () => {
    const now = at(0, 5);
    const tasks = [
      task('report', { remainingMin: 120, deadline: at(2, 22) }),
      task('someday', { remainingMin: 60, deadline: now + 14 * DAY }),
      task('slides', { remainingMin: 120, deadline: at(1, 6) }),
      task('essay', { remainingMin: 120, deadline: at(0, 22) }),
      task('problem-set', { remainingMin: 120, deadline: at(0, 21) }),
    ];
    const { schedule } = generateSchedule(tasks, [], cfg(), now);
    for (const t of tasks) expect(minutesFor(schedule, t.id), t.id).toBeLessThanOrEqual(t.remainingMin);
  });

  // Seed 1, case 9, "block:duplicate-id" (17% of cases: the most common class).
  // What a user sees: skip this morning's block, replan, and the new block has
  // the same id as the skipped one, which is still in the Feed. Two tiles
  // share a React key; pin or delete acts on both; a swap picks up the past
  // block (`find` returns the first match) and overwrites the new one.
  // plan()'s id generator only looks at the blocks it was handed, and reflow
  // doesn't hand it the past ones.
  it.fails('gives a new block an id no other block in the schedule has', () => {
    const quest = task('email', { remainingMin: 25, deadline: at(0, 18) });
    const first = generateSchedule([quest], [], cfg(), at(0, 9));
    expect(first.schedule.map((b) => b.id)).toEqual(['blk-1']);
    // 10:00: the 09:00 block went by untouched.
    const next = replan(first.schedule, [quest], cfg(), at(0, 10));
    const ids = next.schedule.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // Seed 1, case 12, "overlap:kept/pinned" (6% of cases).
  // What a user sees: drag a 25-minute block onto a 35-minute one. The longer
  // block lands in the shorter one's slot and runs into its neighbour; the
  // replan leaves both, so the Feed shows two quests at 09:25. reflow only
  // checks unpinned work against fixed blocks, not against pins.
  it.fails('leaves no two work blocks overlapping after a swap of unequal blocks', () => {
    const now = at(0, 8);
    const tasks = [task('a', { remainingMin: 25 }), task('b', { remainingMin: 70 })];
    const plan: Block[] = [
      work('blk-1', 'a', at(0, 9), 25),
      work('blk-2', 'b', at(0, 9) + 25 * MIN, 35),
      work('blk-3', 'b', at(1, 9), 35),
    ];
    const swapped = applyEdit(plan, { kind: 'swap_blocks', aId: 'blk-1', bId: 'blk-3' });
    const { schedule } = replan(swapped, tasks, cfg(), now);
    expect(overlaps(schedule)).toEqual([]);
  });

  // Seed 1, case 19, "minutes:pin-after-deadline-counts-as-on-time" (4% of cases).
  // What a user sees: a swap drags a block to the day after its quest is due.
  // The plan still says everything fits: no shortfall, no warning, and the
  // quest is quietly 50 minutes late. reflow counts every pinned minute as
  // done, wherever the pin sits.
  it.fails('reports a shortfall when a pinned block sits after its deadline', () => {
    const now = at(0, 8);
    const due = task('due-today', { remainingMin: 50, deadline: at(0, 18) });
    const later = task('later', { remainingMin: 50, deadline: at(5, 18) });
    const plan = [work('blk-1', 'due-today', at(0, 9), 50), work('blk-2', 'later', at(1, 9), 50)];
    const swapped = applyEdit(plan, { kind: 'swap_blocks', aId: 'blk-1', bId: 'blk-2' });
    const result = replan(swapped, [due, later], cfg(), now);
    const onTime = result.schedule
      .filter((b) => b.taskId === 'due-today' && b.end <= due.deadline)
      .reduce((m, b) => m + (b.end - b.start) / MIN, 0);
    const reported = result.feasibilityReport.issues.find((i) => i.taskId === 'due-today')?.shortfallMin ?? 0;
    expect(onTime + reported).toBe(50);
  });

  // Seed 1, case 114, "orphan:pinned-block-for-absent-task" (2% of cases).
  // What a user sees: pin tomorrow's block, finish the quest today. The pin
  // stays in tomorrow's plan, for a quest that no longer exists, and work is
  // routed around it.
  it.fails('drops a pinned block once its quest is finished or deleted', () => {
    const now = at(0, 8);
    const plan = [work('blk-1', 'done-early', at(1, 9), 60, true)];
    const { schedule } = replan(plan, [], cfg(), now);
    expect(schedule.filter((b) => b.type === 'work')).toEqual([]);
  });

  // Seed 1, case 3, "time:kept-work-before-notBefore" (4% of cases).
  // What a user sees: "Not Today" on a quest, and its block is still in
  // today's plan after the replan. The adapter holds the quest to tomorrow
  // (notBefore), but reflow's "still valid" test never looks at it.
  // (POST /quests/:id/not-today; the client has the store action but no button yet.)
  it.fails('moves a quest out of today after Not Today', () => {
    const now = at(0, 15);
    const plan = [work('blk-1', 'essay', at(0, 15), 25), work('blk-2', 'essay', at(1, 9), 35)];
    const deferred = task('essay', { remainingMin: 60, notBefore: at(1, 0) });
    const { schedule } = replan(plan, [deferred], cfg(), now);
    expect(schedule.filter((b) => b.taskId === 'essay' && b.start < at(1, 0))).toEqual([]);
  });

  // Seed 1, case 151, "time:kept-work-outside-working-hours" (0.7% of cases).
  // What a user sees: change working hours (or tap the "Plan 15:30–21:30
  // instead?" suggestion) and the blocks already planned stay at the old
  // hours until they go by.
  it.fails('keeps no unpinned block outside the working hours after they change', () => {
    const now = at(0, 7);
    const quest = task('essay', { remainingMin: 25 });
    const late = generateSchedule([quest], [], cfg({ workingHours: { startHour: 20, endHour: 24 } }), now);
    const { schedule } = replan(late.schedule, [quest], cfg({ workingHours: { startHour: 9, endHour: 18 } }), now);
    for (const b of schedule.filter((x) => x.type === 'work')) {
      const hour = ((b.start - D0) % DAY) / HOUR;
      expect(hour).toBeGreaterThanOrEqual(9);
      expect(hour).toBeLessThan(18);
    }
  });

  // Seed 1, case 49, "chunk:new-block-longer-than-maxChunkMin+20" (4% of cases).
  // What a user sees: a quest with "max session 15 min" gets a 45-minute
  // block. The constructor's tail rule (`left - sitting`) and the starter
  // push ignore the cap; reconcile's fill only knows softMaxBlockMin.
  it.fails('keeps blocks within a quest’s max session (plus the 20-minute tail)', () => {
    const quest = task('flashcards', { remainingMin: 120, maxChunkMin: 15, deadline: at(14, 21) });
    const { schedule } = generateSchedule([quest], [], cfg({ horizonDays: 30 }), at(-1, 21));
    const longest = Math.max(...schedule.map((b) => (b.end - b.start) / MIN));
    expect(longest).toBeLessThanOrEqual(15 + 20);
  });

  // Seed 1, case 239, "block:non-finite-time (work, pinned)" (api tier).
  // What happens: POST /schedule/:id/edit takes newStart as any string, so
  // "tomorrow" becomes NaN. The block is pinned at NaN, the replan counts
  // its minutes as planned (25 of the quest's 60 vanish, no shortfall), and
  // serializeBlock's toISOString throws on every later response. Not
  // reachable from the client, which never sends move_block.
  it.fails('never keeps a block whose time is not a number', () => {
    const now = at(0, 7);
    const quest = task('essay', { remainingMin: 60 });
    const first = generateSchedule([quest], [], cfg(), now);
    const moved = applyEdit(first.schedule, { kind: 'move_block', blockId: first.schedule[0]!.id, newStart: new Date('tomorrow').getTime() });
    const { schedule } = replan(moved, [quest], cfg(), now);
    expect(schedule.every((b) => Number.isFinite(b.start) && Number.isFinite(b.end))).toBe(true);
  });

  // Seed 1, case 192, "block:non-integer-ms" (0.7% of cases).
  // What happens: routines without a preferred hour are spread over what is
  // left of the day by division, so opened at 09:00:00.001 the second one
  // starts on half a millisecond, and so does the work placed after it. The
  // stored Date truncates it; the in-memory plan and the stored one differ.
  it.fails('places routines on whole milliseconds', () => {
    const blocks = placeDailyFillers({
      fillers: [
        { id: 'a', name: 'Duolingo', durationMin: 15, preferredHour: null },
        { id: 'b', name: 'Journal', durationMin: 15, preferredHour: null },
      ],
      now: at(0, 9) + 1,
      horizonDays: 1,
      workingHours: { startHour: 9, endHour: 18 },
      existingFixed: [],
    });
    expect(blocks.length).toBe(2);
    expect(blocks.every((b) => Number.isInteger(b.start) && Number.isInteger(b.end))).toBe(true);
  });
});
