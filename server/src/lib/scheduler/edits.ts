/**
 * Pure edit operations on a Schedule. Each returns a new Schedule —
 * never mutates the input. User-applied edits set `locked = true`
 * so the planner respects them on replan.
 */

import type { Edit, Schedule } from './types.js';

function shiftBlock(block: Schedule[number], newStart: number): Schedule[number] {
  const duration = block.end - block.start;
  return { ...block, start: newStart, end: newStart + duration, locked: true };
}

export function applyEdit(schedule: Schedule, edit: Edit): Schedule {
  switch (edit.kind) {
    case 'move_block': {
      const target = schedule.find((b) => b.id === edit.blockId);
      if (!target) return schedule;
      const moved = shiftBlock(target, edit.newStart);
      return schedule.map((b) => (b.id === edit.blockId ? moved : b));
    }
    case 'swap_blocks': {
      const a = schedule.find((b) => b.id === edit.aId);
      const b = schedule.find((bb) => bb.id === edit.bId);
      if (!a || !b) return schedule;
      const aLen = a.end - a.start;
      const bLen = b.end - b.start;
      const newA = { ...a, start: b.start, end: b.start + aLen, locked: true };
      const newB = { ...b, start: a.start, end: a.start + bLen, locked: true };
      return schedule.map((blk) => {
        if (blk.id === a.id) return newA;
        if (blk.id === b.id) return newB;
        return blk;
      });
    }
    case 'delete_block': {
      return schedule.filter((b) => b.id !== edit.blockId);
    }
    case 'pin_block': {
      return schedule.map((b) => (b.id === edit.blockId ? { ...b, locked: true } : b));
    }
    case 'unpin_block': {
      return schedule.map((b) => (b.id === edit.blockId ? { ...b, locked: false } : b));
    }
  }
}
