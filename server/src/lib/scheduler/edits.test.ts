import { describe, it, expect } from 'vitest';
import { applyEdit } from './edits.js';
import type { Schedule } from './types.js';

const NOW = Date.UTC(2026, 4, 18, 9, 0, 0);
const MS_PER_HOUR = 60 * 60_000;

function sched(): Schedule {
  return [
    { id: 'a', start: NOW, end: NOW + MS_PER_HOUR, type: 'work', taskId: 'ta', locked: false, note: null },
    { id: 'b', start: NOW + MS_PER_HOUR, end: NOW + 2 * MS_PER_HOUR, type: 'work', taskId: 'tb', locked: false, note: null },
  ];
}

describe('applyEdit', () => {
  it('move_block preserves duration and sets locked=true', () => {
    const s = applyEdit(sched(), { kind: 'move_block', blockId: 'a', newStart: NOW + 5 * MS_PER_HOUR });
    const a = s.find((b) => b.id === 'a')!;
    expect(a.start).toBe(NOW + 5 * MS_PER_HOUR);
    expect(a.end - a.start).toBe(MS_PER_HOUR);
    expect(a.locked).toBe(true);
  });

  it('swap_blocks swaps start times and locks both', () => {
    const s = applyEdit(sched(), { kind: 'swap_blocks', aId: 'a', bId: 'b' });
    const a = s.find((x) => x.id === 'a')!;
    const b = s.find((x) => x.id === 'b')!;
    expect(a.start).toBe(NOW + MS_PER_HOUR);
    expect(b.start).toBe(NOW);
    expect(a.locked).toBe(true);
    expect(b.locked).toBe(true);
  });

  it('delete_block removes the block', () => {
    const s = applyEdit(sched(), { kind: 'delete_block', blockId: 'a' });
    expect(s.find((b) => b.id === 'a')).toBeUndefined();
    expect(s).toHaveLength(1);
  });

  it('pin_block / unpin_block toggles locked', () => {
    const s1 = applyEdit(sched(), { kind: 'pin_block', blockId: 'a' });
    expect(s1.find((b) => b.id === 'a')!.locked).toBe(true);
    const s2 = applyEdit(s1, { kind: 'unpin_block', blockId: 'a' });
    expect(s2.find((b) => b.id === 'a')!.locked).toBe(false);
  });

  it('is pure — does not mutate the input', () => {
    const s = sched();
    const before = JSON.stringify(s);
    applyEdit(s, { kind: 'move_block', blockId: 'a', newStart: NOW + 5 * MS_PER_HOUR });
    expect(JSON.stringify(s)).toBe(before);
  });
});
