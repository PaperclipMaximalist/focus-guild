/**
 * Explain integration test: the constructor stashes a dominant-term note,
 * and explainBlock() turns it into a human-readable sentence.
 */

import { describe, it, expect } from 'vitest';
import { generateSchedule } from './replan.js';
import { composeWhy, explainBlock, explainPlan, type PlanFacts } from './explain.js';
import { buildDayInfo } from './budget.js';
import { defaultConfig } from './config.js';
import type { Block, Task, UserConfig } from './types.js';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

function nowAt9amUtc(): number {
  return Date.UTC(2026, 4, 18, 9, 0, 0, 0);
}

function task(id: string, overrides: Partial<Task> = {}): Task {
  const now = nowAt9amUtc();
  return {
    id, name: id, remainingMin: 60, totalMin: 60,
    deadline: now + 3 * DAY,
    tediousness: 0.3, cognitiveLoad: 0.5, importance: 0.5,
    setupCost: 0.3, minChunkMin: 15, maxChunkMin: 60,
    category: 'deep_work', preferredHour: null, dependencies: [],
    createdAt: now - DAY, lastWorkedAt: null,
    status: 'pending', urgencyMultiplier: 1.0,
    ...overrides,
  };
}

const cfg = (): UserConfig => ({ ...defaultConfig(), tzOffsetMin: 0, horizonDays: 1 });

describe('explainBlock', () => {
  it('returns a non-empty sentence for a placed work block', () => {
    const now = nowAt9amUtc();
    const tasks = [task('a', { name: 'Ship feature' })];
    const { schedule } = generateSchedule(tasks, [], cfg(), now);
    const blk = schedule.find((b) => b.type === 'work' && b.taskId === 'a')!;
    const msg = explainBlock(blk.id, schedule, tasks);
    expect(typeof msg).toBe('string');
    expect(msg.length).toBeGreaterThan(0);
    // The dominant-term sentence should always be informative, never the
    // fallback "Working on this quest." when a note exists.
    expect(msg).not.toBe('Working on this quest.');
  });

  it('gives a specific reason, not stock copy', () => {
    // The Feed shows the quest name right above the reason, so reasons
    // composed from facts leave it out; what matters is that they say
    // something true and particular about this block.
    const now = nowAt9amUtc();
    const tasks = [task('a', { name: 'Ship the PR', deadline: now + 26 * 60 * 60_000 })];
    const { schedule } = generateSchedule(tasks, [], cfg(), now);
    const blk = schedule.find((b) => b.type === 'work' && b.taskId === 'a')!;
    const msg = explainBlock(blk.id, schedule, tasks);
    expect(msg).not.toMatch(/^Best fit for this slot|^Working on/);
    expect(msg).toMatch(/due tomorrow|due today|start|hours|pace|subject|energy|asked/i);
  });

  it('returns the not-found message for an unknown id', () => {
    const now = nowAt9amUtc();
    const { schedule } = generateSchedule([task('a')], [], cfg(), now);
    expect(explainBlock('does-not-exist', schedule, [])).toMatch(/not found/);
  });
});

describe('composeWhy says only what it was given the facts for', () => {
  const now = nowAt9amUtc();
  const config = cfg();
  const at = (h: number) => Date.UTC(2026, 4, 18, h, 0, 0, 0);
  const facts = (over: Partial<PlanFacts> = {}): PlanFacts => ({
    now, leftAfterMin: 60, shortAfterMin: 0, noSharperToday: false, noSharperBeforeDue: false, ...over,
  });

  it('heavy work at a low hour: no claim about sharper hours unless the plan checked', () => {
    // 14:00 is the default curve's dip (0.4). The old reason said "the
    // sharper ones were full" from that alone.
    const essay = task('essay', { cognitiveLoad: 0.8, deadline: now + 10 * DAY });
    const base = { task: essay, start: at(14), end: at(15), prev: { task: task('x'), end: at(12) }, config };
    expect(composeWhy(base) ?? '').not.toMatch(/sharper|best time/i);
    expect(composeWhy({ ...base, plan: facts() }) ?? '').not.toMatch(/sharper|best time/i);
    expect(composeWhy({ ...base, plan: facts({ noSharperToday: true }) })).toMatch(/no sharper time free today/i);
  });

  it('never calls a return to the same quest a change of subject', () => {
    const essay = task('essay', { category: 'writing' });
    const why = composeWhy({ task: essay, start: at(16), end: at(17), prev: { task: essay, end: at(16) - 10 * MIN }, config, plan: facts() });
    expect(why).not.toMatch(/change of subject/i);
    expect(why).toMatch(/back to it after a break/i);
  });

  it('an undated quest is never "due"; its last block finishes it', () => {
    const tidy = task('tidy', { undated: true, deadline: now + 14 * DAY });
    const why = composeWhy({ task: tidy, start: at(16), end: at(17), prev: { task: task('x'), end: at(12) }, config, plan: facts({ leftAfterMin: 0 }) });
    expect(why).not.toMatch(/due/i);
    expect(why).toMatch(/finishes it/i);
  });

  it('leads with the deadline and fits a tile', () => {
    const lab = task('lab', { cognitiveLoad: 0.8, urgencyMultiplier: 1.4, deadline: now + DAY });
    const why = composeWhy({ task: lab, start: at(10), end: at(11), prev: { task: task('x'), end: at(9) }, config, plan: facts({ leftAfterMin: 95 }) })!;
    expect(why.startsWith('Due tomorrow · high priority')).toBe(true);
    expect(why.length).toBeLessThanOrEqual(48);
  });
});

describe('reasons in a finished plan', () => {
  const whyOf = (b: Block) => (JSON.parse(b.note ?? '{}') as { why?: string }).why ?? '';
  const workOf = (s: Block[]) => s.filter((b) => b.type === 'work' && b.taskId).sort((a, b) => a.start - b.start);

  it('"no sharper time" is said only when the sharper hours really are taken', () => {
    // A heavy hour at 14:00, the default curve's dip. With the morning free
    // the old reason still said "the sharper ones were full".
    const now = nowAt9amUtc();
    const config = cfg();
    const h = (n: number) => now + (n - 9) * 60 * MIN;
    const essay = task('essay', { cognitiveLoad: 0.8, deadline: now + 10 * DAY });
    const blk: Block = { id: 'b1', start: h(14), end: h(15), type: 'work', taskId: 'essay', locked: false, note: JSON.stringify({ term: 'energy', sign: '-', total: 0 }) };
    const open = explainPlan([blk], [essay], buildDayInfo(config, now, []), [], config, now);
    expect(whyOf(open[0]!)).not.toMatch(/sharper/i);

    const fixed = (id: string, start: number, end: number): Block => ({ id, start, end, type: 'fixed', taskId: null, locked: true, note: 'School' });
    const busy = [fixed('f1', now, h(14)), fixed('f2', h(15), h(24))];
    const full = explainPlan([blk, ...busy], [essay], buildDayInfo(config, now, busy), [], config, now);
    expect(whyOf(full.find((b) => b.id === 'b1')!)).toMatch(/no sharper time free today/i);
  });

  it('the last block of a quest says it finishes it, earlier ones say what is left', () => {
    const now = nowAt9amUtc();
    const tasks = [task('essay', { remainingMin: 180, totalMin: 180, maxChunkMin: 60, deadline: now + 6 * DAY })];
    const { schedule } = generateSchedule(tasks, [], { ...cfg(), horizonDays: 5 }, now);
    const work = workOf(schedule);
    expect(work.length).toBeGreaterThan(1);
    let done = 0;
    work.forEach((b, i) => {
      done += (b.end - b.start) / MIN;
      const why = whyOf(b);
      if (i === work.length - 1) expect(why).toMatch(/finishes it/i);
      else {
        expect(why).not.toMatch(/finishes it/i);
        const m = /(?:(\d+) h)? ?(?:(\d+)(?: min)?)? left after this/.exec(why);
        if (m) expect(Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)).toBe(180 - done);
      }
    });
  });

  it('does not say one sentence four times in a day, and every reason fits a tile', () => {
    // Six small quests all due today used to read "Due today." six times.
    const now = nowAt9amUtc();
    const tasks = Array.from({ length: 6 }, (_, i) =>
      task(`q${i}`, { remainingMin: 30, totalMin: 30, cognitiveLoad: 0.6, deadline: now + 12 * 60 * MIN }));
    const { schedule } = generateSchedule(tasks, [], cfg(), now);
    const reasons = workOf(schedule).map(whyOf);
    expect(reasons.length).toBeGreaterThanOrEqual(5);
    const counts = new Map<string, number>();
    for (const r of reasons) counts.set(r, (counts.get(r) ?? 0) + 1);
    expect(Math.max(...counts.values())).toBeLessThan(4);
    for (const r of reasons) {
      expect(r.length).toBeGreaterThan(0);
      expect(r.length).toBeLessThanOrEqual(48);
    }
  });

  it('explainPlan changes notes and nothing else', () => {
    const now = nowAt9amUtc();
    const tasks = [task('a', { remainingMin: 120, totalMin: 120 }), task('b', { cognitiveLoad: 0.8 })];
    const { schedule, feasibilityReport } = generateSchedule(tasks, [], cfg(), now);
    const days = buildDayInfo(cfg(), now, []);
    const stripped = schedule.map((b) => (b.type === 'work' ? { ...b, note: JSON.stringify({ term: 'energy', sign: '+', total: 0, why: 'stale' }) } : b));
    const again = explainPlan(stripped, tasks, days, feasibilityReport.issues, cfg(), now);
    expect(again).toEqual(schedule.map((b) => (b.type === 'work' ? { ...b, note: expect.any(String) } : b)));
    expect(again.map(whyOf)).toEqual(schedule.map(whyOf));
  });
});
