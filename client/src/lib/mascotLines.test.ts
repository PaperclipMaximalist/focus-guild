import { describe, expect, it } from 'vitest';
import { MASCOT_EVENTS, linesFor, type MascotEvent } from './mascotLines';

const events = Object.keys(MASCOT_EVENTS) as MascotEvent[];

describe('mascot lines', () => {
  it.each([1, 5])('leaves no {n} placeholder behind for n = %i', (n) => {
    for (const event of events) {
      for (const line of linesFor(event, n)) expect(line).not.toContain('{n}');
    }
  });

  it('counts correctly for one', () => {
    for (const event of events) {
      for (const line of linesFor(event, 1)) {
        expect(line).not.toMatch(/\b1 (stragglers|days|late ones|quests)\b/);
      }
    }
  });

  it('uses the plural wording for other counts', () => {
    expect(linesFor('overdue', 5)).toContain('5 stragglers. we triage, we don’t panic.');
    expect(linesFor('overdue', 1)).toContain('1 straggler. we triage, we don’t panic.');
  });

  it('never says overdue', () => {
    for (const event of events) {
      for (const line of linesFor(event, 5)) expect(line).not.toMatch(/overdue/i);
    }
  });
});
