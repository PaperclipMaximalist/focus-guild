/**
 * The status word is the board's whole claim about a quest, so it has to be
 * true. `now` is injected; times are local, so these hold in any timezone.
 */

import { describe, expect, it } from 'vitest';
import { blockStatus, questStatus } from './departure';

// A Thursday, 14:30 local.
const NOW = new Date(2026, 9, 8, 14, 30).getTime();
const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).toISOString();

describe('questStatus', () => {
  it('says Open when there is no deadline, never "on time"', () => {
    expect(questStatus(null, NOW)).toEqual({ label: 'Open', tone: 'dim' });
  });

  it('counts lateness in the largest unit that fits', () => {
    expect(questStatus(at(8, 14, 10), NOW).label).toBe('20m late');
    expect(questStatus(at(8, 9), NOW).label).toBe('5h late');
    expect(questStatus(at(5, 14), NOW).label).toBe('3d late');
    expect(questStatus(at(5, 14), NOW).tone).toBe('late');
  });

  it('warns for today and tomorrow, and is on time after that', () => {
    expect(questStatus(at(8, 21), NOW)).toEqual({ label: 'Due today', tone: 'warn' });
    expect(questStatus(at(9, 9), NOW)).toEqual({ label: 'Tomorrow', tone: 'warn' });
    expect(questStatus(at(12, 9), NOW)).toEqual({ label: 'On time', tone: 'ok' });
  });
});

describe('blockStatus', () => {
  const work = (startH: number, endH: number) => ({ start: at(8, startH), end: at(8, endH), type: 'work' });

  it('follows the clock: departed, boarding, on time', () => {
    expect(blockStatus(work(9, 10), null, NOW).label).toBe('Departed');
    expect(blockStatus(work(14, 15), null, NOW)).toEqual({ label: 'Boarding', tone: 'now' });
    expect(blockStatus(work(16, 17), null, NOW)).toEqual({ label: 'On time', tone: 'ok' });
  });

  it('never calls a block on time when its quest is overdue or it ends past the deadline', () => {
    expect(blockStatus(work(16, 17), at(5, 14), NOW)).toEqual({ label: '3d late', tone: 'late' });
    expect(blockStatus(work(16, 18), at(8, 17), NOW)).toEqual({ label: 'Runs late', tone: 'late' });
    expect(blockStatus(work(16, 17), at(8, 17), NOW).label).toBe('On time');
  });

  it('labels an upcoming routine as a round', () => {
    expect(blockStatus({ start: at(8, 19), end: at(8, 20), type: 'fixed' }, null, NOW)).toEqual({ label: 'Round', tone: 'dim' });
  });
});
