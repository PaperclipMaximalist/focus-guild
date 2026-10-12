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
      // An unparseable time ("tomorrow") arrives as NaN: moving the block
      // there pinned it at no time at all, and its minutes vanished.
      if (!target || !Number.isFinite(edit.newStart)) return schedule;
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
    case 'reorder_block': {
      // Only the order changes: the block is given its new neighbour's start
      // (or a moment after it), and the packing pass lays the day
      // out again in that order. Its length is kept, and it is not pinned.
      const moved = schedule.find((b) => b.id === edit.blockId);
      const anchor = schedule.find((b) => b.id === (edit.beforeId ?? edit.afterId));
      if (!moved || !anchor || moved.id === anchor.id || moved.locked) return schedule;
      // Before: it takes the neighbour's start and the neighbour steps a moment
      // later, so neither leaves the working window (the first block of a day
      // starts exactly when the window opens).
      const start = edit.beforeId ? anchor.start : anchor.start + 1;
      return schedule.map((b) => {
        if (b.id === moved.id) return { ...b, start, end: start + (moved.end - moved.start) };
        if (edit.beforeId && b.id === anchor.id) return { ...b, start: b.start + 1, end: b.end + 1 };
        return b;
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
