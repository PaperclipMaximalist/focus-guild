/**
 * Calendar events reach the planner as fixed blocks. The one property that
 * matters: nothing gets scheduled on top of a meeting, on generate or replan.
 */

import { describe, expect, it } from 'vitest';
import { generateSchedule, replan } from '../scheduler/replan.js';
import { defaultConfig } from '../scheduler/config.js';
import type { Block, Task } from '../scheduler/types.js';
import { eventsToFixedBlocks, isCalendarBlock } from './ics.js';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const now = Date.UTC(2026, 4, 18, 9, 0, 0, 0);

function task(id: string, remainingMin: number): Task {
  return {
    id, name: id, remainingMin, totalMin: remainingMin, deadline: now + 2 * DAY,
    tediousness: 0.4, cognitiveLoad: 0.5, importance: 0.5, setupCost: 0.3,
    minChunkMin: 15, maxChunkMin: 90, category: 'deep_work', preferredHour: null,
    dependencies: [], createdAt: now - DAY, lastWorkedAt: null, status: 'pending', urgencyMultiplier: 1,
  };
}

const overlaps = (a: Block, b: Block) => a.start < b.end && b.start < a.end;

const meetings = eventsToFixedBlocks(
  [
    { id: 'm1', title: 'Chem HL', start: new Date(now + 1 * HOUR), end: new Date(now + 2 * HOUR + 15 * MIN) },
    { id: 'm2', title: 'EE check-in', start: new Date(now + 4 * HOUR), end: new Date(now + 4.5 * HOUR) },
    { id: 'm3', title: 'Tomorrow lesson', start: new Date(now + DAY + HOUR), end: new Date(now + DAY + 3 * HOUR) },
  ],
  now,
);

const tasks = [task('essay', 240), task('study', 180), task('admin', 60)];
const cfg = { ...defaultConfig(), tzOffsetMin: 0 };

describe('calendar blocks in the planner', () => {
  it('generate never places work over a calendar event', () => {
    const { schedule } = generateSchedule(tasks, meetings, cfg, now);
    const work = schedule.filter((b) => b.type === 'work' && b.taskId);
    expect(work.length).toBeGreaterThan(0);
    for (const m of meetings) for (const w of work) expect(overlaps(w, m), `${w.taskId} over ${m.note}`).toBe(false);
    // The events themselves survive into the schedule for the feed to show.
    expect(schedule.filter(isCalendarBlock).map((b) => b.note)).toEqual(meetings.map((m) => m.note));
  });

  it('replan respects a calendar event added after generation', () => {
    const { schedule } = generateSchedule(tasks, [], cfg, now);
    const later = now + 30 * MIN;
    const fresh = [...schedule.filter((b) => !isCalendarBlock(b)), ...meetings];
    const result = replan(fresh, tasks, cfg, later);
    const work = result.schedule.filter((b) => b.type === 'work' && b.taskId && b.end > later);
    for (const m of meetings) for (const w of work) expect(overlaps(w, m), `${w.taskId} over ${m.note}`).toBe(false);
  });
});
