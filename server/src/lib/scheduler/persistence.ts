/**
 * ScheduleBlock <-> Prisma persistence.
 *
 * The in-memory Block type uses 'work' | 'break' | 'fixed' | 'buffer';
 * the DB BlockType enum carries those plus legacy values from before
 * the rewrite. Mapping is handled here so the scheduler module stays
 * pure (no Prisma).
 */

import type { Block, BlockType } from './types.js';

// Prisma's BlockType enum, written as a string-union to avoid pulling the
// generated client into this module.
type PrismaBlockType =
  | 'WORK'
  | 'BREAK'
  | 'FIXED'
  | 'BUFFER'
  | 'FOCUS'
  | 'DEADLINE_ANCHOR'
  | 'CALENDAR';

export function blockTypeToPrisma(t: BlockType): PrismaBlockType {
  switch (t) {
    case 'work': return 'WORK';
    case 'break': return 'BREAK';
    case 'fixed': return 'FIXED';
    case 'buffer': return 'BUFFER';
  }
}

export function prismaToBlockType(t: PrismaBlockType): BlockType {
  switch (t) {
    case 'WORK': return 'work';
    case 'BREAK': return 'break';
    case 'FIXED': return 'fixed';
    case 'BUFFER': return 'buffer';
    // Legacy fallthroughs — pre-rewrite blocks map onto the new model.
    case 'FOCUS': return 'work';
    case 'DEADLINE_ANCHOR': return 'work';
    case 'CALENDAR': return 'fixed';
  }
}

/** Row shape we write to schedule_blocks (excluding id which Prisma generates). */
export interface ScheduleBlockRow {
  userId: string;
  /** Quest id, or filler/recurring/buffer → null. We strip non-quest taskIds. */
  questId: string | null;
  startTime: Date;
  endTime: Date;
  durationMins: number;
  reason: string;
  blockType: PrismaBlockType;
  isFlexible: boolean;
  /** YYYY-MM-DD UTC. */
  date: Date;
  locked: boolean;
  note: string | null;
}

/**
 * Convert an in-memory Block to the Prisma row shape.
 *
 * `isQuestId(taskId)` is a callback because filler/recurring blocks carry a
 * synthetic id (e.g. "recurring:cuid…" or "filler-…") that isn't a Quest FK.
 * Passing false sets questId to null so the row inserts cleanly.
 */
export function blockToRow(
  block: Block,
  userId: string,
  isQuestId: (id: string) => boolean,
): ScheduleBlockRow {
  const date = new Date(block.start);
  date.setUTCHours(0, 0, 0, 0);
  return {
    userId,
    questId: block.taskId && isQuestId(block.taskId) ? block.taskId : null,
    startTime: new Date(block.start),
    endTime: new Date(block.end),
    durationMins: Math.round((block.end - block.start) / 60_000),
    reason: block.note ?? '',
    blockType: blockTypeToPrisma(block.type),
    isFlexible: !block.locked,
    date,
    locked: block.locked,
    note: block.note,
  };
}

/**
 * Convert a persisted row back to an in-memory Block.
 *
 * We use the row's id as the block id so locked-pin references survive a
 * server restart cycle.
 */
export function rowToBlock(row: {
  id: string;
  questId: string | null;
  startTime: Date;
  endTime: Date;
  blockType: PrismaBlockType;
  locked: boolean;
  note: string | null;
}): Block {
  return {
    id: row.id,
    start: row.startTime.getTime(),
    end: row.endTime.getTime(),
    type: prismaToBlockType(row.blockType),
    taskId: row.questId,
    locked: row.locked,
    note: row.note,
  };
}
