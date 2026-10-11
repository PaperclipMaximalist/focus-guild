import { describe, it, expect } from 'vitest';
import {
  MAX_QUEST_DEPTH,
  buildTree,
  depthOf,
  descendantIds,
  moveProblem,
  parentChoices,
  parentIds,
  rollupsByRoot,
  subtreeHeight,
  type QuestNodeRow,
} from './questTree.js';

/** A quest row with only the columns the tree math reads. */
function q(
  id: string,
  parentQuestId: string | null,
  status: 'ACTIVE' | 'COMPLETE' = 'ACTIVE',
  estimatedMinutes = 30,
): QuestNodeRow {
  return { id, parentQuestId, status, estimatedMinutes };
}

/** main → step → sub-step, with a second step left flat. */
const threeTiers = [
  q('main', null),
  q('step-a', 'main'),
  q('sub-a1', 'step-a'),
  q('sub-a2', 'step-a'),
  q('step-b', 'main'),
];

const byId = (rows: QuestNodeRow[]) => new Map(rows.map((r) => [r.id, r]));

describe('depthOf', () => {
  it('counts a main quest as the first tier', () => {
    expect(depthOf('main', byId(threeTiers))).toBe(1);
    expect(depthOf('step-a', byId(threeTiers))).toBe(2);
    expect(depthOf('sub-a1', byId(threeTiers))).toBe(3);
  });

  it('reads a chain longer than the cap as over it', () => {
    const tooDeep = [...threeTiers, q('sub-sub', 'sub-a1')];
    expect(depthOf('sub-sub', byId(tooDeep))).toBeGreaterThan(MAX_QUEST_DEPTH);
  });

  it('does not hang on a parent cycle', () => {
    const cyclic = [q('x', 'y'), q('y', 'x')];
    expect(depthOf('x', byId(cyclic))).toBeGreaterThan(0);
  });
});

describe('buildTree', () => {
  it('nests the subtree under a main quest', () => {
    const tree = buildTree(threeTiers, 'main');
    expect(tree.map((n) => n.id)).toEqual(['step-a', 'step-b']);
    expect(tree[0]!.subQuests.map((n) => n.id)).toEqual(['sub-a1', 'sub-a2']);
    expect(tree[1]!.subQuests).toEqual([]);
  });

  it('marks the deepest tier as unable to take more', () => {
    const tree = buildTree(threeTiers, 'main');
    expect(tree[0]!.rollup.canNest).toBe(true);
    expect(tree[0]!.subQuests[0]!.rollup.canNest).toBe(false);
    expect(tree[0]!.subQuests[0]!.rollup.depth).toBe(MAX_QUEST_DEPTH);
  });

  it('truncates anything already written past the cap', () => {
    const tooDeep = [...threeTiers, q('sub-sub', 'sub-a1')];
    const tree = buildTree(tooDeep, 'main');
    expect(tree[0]!.subQuests[0]!.subQuests).toEqual([]);
    // …and it is not counted twice as part of the total either.
    expect(tree[0]!.rollup.total).toBe(2);
  });

  it('rolls a step up from its own sub-steps', () => {
    const tree = buildTree(threeTiers, 'main');
    // step-a has two sub-steps of 30 min each; its own 30 is replaced.
    expect(tree[0]!.rollup).toMatchObject({ total: 2, done: 0, estimatedMinutes: 60 });
  });
});

describe('rollupsByRoot — what a main quest card shows', () => {
  it('counts the whole subtree, not just direct children', () => {
    const rollup = rollupsByRoot(threeTiers, ['main']).get('main')!;
    // step-a, step-b and step-a's two sub-steps — four tickable items.
    expect(rollup).toMatchObject({ total: 4, done: 0, childCount: 2, depth: 1 });
  });

  it('counts a completed sub-step towards the main quest', () => {
    const rows = threeTiers.map((r) => (r.id === 'sub-a1' ? { ...r, status: 'COMPLETE' } : r));
    const rollup = rollupsByRoot(rows, ['main']).get('main')!;
    expect(rollup.done).toBe(1);
    expect(rollup.total).toBe(4);
    expect(rollup.doneMinutes).toBe(30);
  });

  it('sums leaf minutes and ignores the parents own estimate', () => {
    const rows = [
      q('main', null, 'ACTIVE', 999),
      q('step-a', 'main', 'ACTIVE', 999),
      q('sub-a1', 'step-a', 'ACTIVE', 20),
      q('sub-a2', 'step-a', 'ACTIVE', 25),
      q('step-b', 'main', 'ACTIVE', 45),
    ];
    // 20 + 25 under step-a, plus step-b's own 45. The 999s never count.
    expect(rollupsByRoot(rows, ['main']).get('main')!.estimatedMinutes).toBe(90);
  });

  it('leaves a childless quest reading its own estimate and no steps', () => {
    const rows = [q('lonely', null, 'ACTIVE', 40)];
    expect(rollupsByRoot(rows, ['lonely']).get('lonely')).toMatchObject({
      total: 0,
      childCount: 0,
      estimatedMinutes: 40,
    });
  });

  it('keeps one main quests steps out of anothers total', () => {
    const rows = [...threeTiers, q('other', null), q('other-step', 'other')];
    const rollups = rollupsByRoot(rows, ['main', 'other']);
    expect(rollups.get('main')!.total).toBe(4);
    expect(rollups.get('other')!.total).toBe(1);
  });
});

describe('descendantIds — what a delete has to take with it', () => {
  it('returns the whole subtree deepest first', () => {
    const ids = descendantIds(threeTiers, 'main');
    expect(new Set(ids)).toEqual(new Set(['step-a', 'sub-a1', 'sub-a2', 'step-b']));
    expect(ids.indexOf('sub-a1')).toBeLessThan(ids.indexOf('step-a'));
  });

  it('is empty for a leaf', () => {
    expect(descendantIds(threeTiers, 'sub-a2')).toEqual([]);
  });
});

describe('parentIds — who the planner should skip', () => {
  it('names every quest that has steps of its own', () => {
    expect(parentIds(threeTiers)).toEqual(new Set(['main', 'step-a']));
  });
});

describe('moving a quest under another', () => {
  it('lets a lone quest become a step or a sub-step', () => {
    const rows = [...threeTiers, q('loose', null)];
    expect(moveProblem(rows, 'loose', 'main')).toBeNull();
    expect(moveProblem(rows, 'loose', 'step-b')).toBeNull();
  });

  it('refuses the bottom tier, itself, and its own steps', () => {
    const rows = [...threeTiers, q('loose', null)];
    expect(moveProblem(rows, 'loose', 'sub-a1')).toBe('TOO_DEEP');
    expect(moveProblem(rows, 'main', 'main')).toBe('SELF');
    expect(moveProblem(rows, 'main', 'sub-a1')).toBe('CYCLE');
    expect(moveProblem(rows, 'loose', 'nope')).toBe('NOT_FOUND');
  });

  it('counts the steps a quest brings with it', () => {
    // step-a has sub-steps, so it is two tiers tall: it fits under a main
    // quest but not under another step.
    const rows = [...threeTiers, q('other', null), q('other-step', 'other')];
    expect(subtreeHeight(rows, 'step-a')).toBe(2);
    expect(moveProblem(rows, 'step-a', 'other')).toBeNull();
    expect(moveProblem(rows, 'step-a', 'other-step')).toBe('TOO_DEEP');
  });
});

describe('parentChoices — the "Part of" menu', () => {
  const titled = (rows: QuestNodeRow[]) => rows.map((r) => ({ ...r, title: r.id }));
  const open = (r: QuestNodeRow) => r.status !== 'COMPLETE';

  it('lists main quests and steps in tree order, never the bottom tier', () => {
    expect(parentChoices(titled(threeTiers), open).map((c) => `${c.depth}:${c.id}`)).toEqual([
      '1:main',
      '2:step-a',
      '2:step-b',
    ]);
  });

  it('leaves out the quest being moved, its steps, and places it would not fit', () => {
    const rows = titled([...threeTiers, q('other', null), q('other-step', 'other')]);
    // step-a is two tiers tall, so only main quests can hold it.
    expect(parentChoices(rows, open, 'step-a').map((c) => c.id)).toEqual(['main', 'other']);
  });

  it('skips finished quests and everything under them', () => {
    const rows = titled(threeTiers.map((r) => (r.id === 'step-a' ? { ...r, status: 'COMPLETE' } : r)));
    expect(parentChoices(rows, open).map((c) => c.id)).toEqual(['main', 'step-b']);
  });
});
