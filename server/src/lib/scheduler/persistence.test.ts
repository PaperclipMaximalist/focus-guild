import { describe, it, expect } from 'vitest';
import {
  blockToRow,
  blockTypeToPrisma,
  prismaToBlockType,
  rowToBlock,
} from './persistence.js';
import type { Block } from './types.js';

const NOW = new Date(2026, 4, 18, 9, 0, 0, 0).getTime();
const HOUR = 60 * 60_000;

function workBlock(overrides: Partial<Block> = {}): Block {
  return {
    id: 'b1',
    start: NOW,
    end: NOW + HOUR,
    type: 'work',
    taskId: 'task-1',
    locked: false,
    note: 'urgency=2.0, energyFit=0.9',
    ...overrides,
  };
}

describe('blockTypeToPrisma / prismaToBlockType', () => {
  it('round-trips the 4 in-memory types', () => {
    for (const t of ['work', 'break', 'fixed', 'buffer'] as const) {
      expect(prismaToBlockType(blockTypeToPrisma(t))).toBe(t);
    }
  });

  it('maps legacy enum values back to the new model', () => {
    expect(prismaToBlockType('FOCUS')).toBe('work');
    expect(prismaToBlockType('DEADLINE_ANCHOR')).toBe('work');
    expect(prismaToBlockType('CALENDAR')).toBe('fixed');
  });
});

describe('blockToRow', () => {
  it('keeps the questId when isQuestId returns true', () => {
    const row = blockToRow(workBlock(), 'user-1', () => true);
    expect(row.questId).toBe('task-1');
    expect(row.userId).toBe('user-1');
    expect(row.blockType).toBe('WORK');
    expect(row.locked).toBe(false);
    expect(row.note).toBe('urgency=2.0, energyFit=0.9');
  });

  it('strips the questId for synthetic taskIds (filler/recurring)', () => {
    const row = blockToRow(workBlock({ taskId: 'recurring:cuid-abc' }), 'user-1', () => false);
    expect(row.questId).toBeNull();
  });

  it('handles a null taskId (buffer/break)', () => {
    const row = blockToRow(workBlock({ taskId: null, type: 'buffer' }), 'user-1', () => true);
    expect(row.questId).toBeNull();
    expect(row.blockType).toBe('BUFFER');
  });

  it('mirrors locked → isFlexible (inverse)', () => {
    const lockedRow = blockToRow(workBlock({ locked: true }), 'user-1', () => true);
    expect(lockedRow.isFlexible).toBe(false);
    expect(lockedRow.locked).toBe(true);
  });

  it('computes durationMins from start/end', () => {
    const row = blockToRow(workBlock({ start: NOW, end: NOW + 25 * 60_000 }), 'user-1', () => true);
    expect(row.durationMins).toBe(25);
  });

  it('normalizes the date field to UTC midnight', () => {
    const row = blockToRow(workBlock(), 'user-1', () => true);
    expect(row.date.getUTCHours()).toBe(0);
    expect(row.date.getUTCMinutes()).toBe(0);
    expect(row.date.getUTCSeconds()).toBe(0);
  });
});

describe('rowToBlock', () => {
  it('reconstructs a block from a persisted row', () => {
    const original = workBlock({ locked: true, note: 'urgency=3.0' });
    const row = blockToRow(original, 'user-1', () => true);
    const block = rowToBlock({
      id: original.id,
      questId: row.questId,
      startTime: row.startTime,
      endTime: row.endTime,
      blockType: row.blockType,
      locked: row.locked,
      note: row.note,
    });
    expect(block.id).toBe(original.id);
    expect(block.start).toBe(original.start);
    expect(block.end).toBe(original.end);
    expect(block.type).toBe('work');
    expect(block.locked).toBe(true);
    expect(block.note).toBe('urgency=3.0');
  });
});
