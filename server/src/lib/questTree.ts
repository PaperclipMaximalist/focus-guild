/**
 * Sub-quest nesting: how deep it may go, and what a parent's "total" means.
 *
 * A quest can hold sub-quests, and those can hold their own, three tiers in
 * all — main quest, step, sub-step. Three is a cap, not a target: past it the
 * list stops being a plan and becomes an outline of an outline, which is the
 * exact failure mode this app exists to avoid. The cap is enforced on write
 * (the route refuses a fourth tier) rather than trusted to the UI, because the
 * REST API and the MCP connector can both create quests.
 *
 * "Counts towards the total" means a parent's progress is its whole subtree,
 * not its direct children: a main quest with two steps that each have three
 * sub-steps reads 0/6 while every sub-step is open, and its minutes are the
 * sum of its leaves — the parent's own estimate is ignored once it has
 * children, so breaking a quest down never inflates the day's workload. The
 * planner follows the same rule and schedules leaves only (see
 * routes/schedule.ts → loadQuestsForUser).
 *
 * Everything here is pure and works off plain rows so the route, the planner
 * and the tests all agree on one definition of depth and of a total.
 */

/** Main quest → step → sub-step. A quest at this depth may not take children. */
export const MAX_QUEST_DEPTH = 3;

/** The columns the tree math needs; any wider row is accepted and carried. */
export interface QuestNodeRow {
  id: string;
  parentQuestId: string | null;
  status: string;
  estimatedMinutes: number;
}

export interface QuestRollup {
  /** Sub-quests anywhere beneath this one. */
  total: number;
  /** …of which complete. */
  done: number;
  /** Direct children only — what the next tier of the UI shows. */
  childCount: number;
  /** Leaf minutes beneath this quest, or its own estimate when it has none. */
  estimatedMinutes: number;
  /** Leaf minutes already completed. */
  doneMinutes: number;
  /** 1 for a main quest, up to MAX_QUEST_DEPTH. */
  depth: number;
  /** False at the cap — the UI hides "add a step" and the route refuses one. */
  canNest: boolean;
}

export type QuestTreeNode<T extends QuestNodeRow> = T & {
  subQuests: QuestTreeNode<T>[];
  rollup: QuestRollup;
};

const isDone = (row: QuestNodeRow) => row.status === 'COMPLETE';

/**
 * Depth of `id` counting its ancestors: 1 for a main quest, 2 for its step.
 * Returns MAX_QUEST_DEPTH + 1 for a chain longer than the cap, so a row that
 * predates the cap (or a cycle written by hand) reads as "too deep" and is
 * refused rather than crashing the walk.
 */
export function depthOf(id: string, byId: Map<string, QuestNodeRow>): number {
  let depth = 1;
  const seen = new Set<string>([id]);
  let cursor = byId.get(id)?.parentQuestId ?? null;
  while (cursor && !seen.has(cursor)) {
    depth += 1;
    if (depth > MAX_QUEST_DEPTH) return MAX_QUEST_DEPTH + 1;
    seen.add(cursor);
    cursor = byId.get(cursor)?.parentQuestId ?? null;
  }
  return depth;
}

/** Every quest beneath `rootId`, deepest first — the order a delete needs. */
export function descendantIds(rows: QuestNodeRow[], rootId: string): string[] {
  const childrenOf = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.parentQuestId) continue;
    const siblings = childrenOf.get(row.parentQuestId) ?? [];
    siblings.push(row.id);
    childrenOf.set(row.parentQuestId, siblings);
  }

  const out: string[] = [];
  const visited = new Set<string>([rootId]);
  const walk = (id: string) => {
    for (const childId of childrenOf.get(id) ?? []) {
      if (visited.has(childId)) continue;
      visited.add(childId);
      walk(childId);
      // Pushed after its own children, so the list runs deepest-first.
      out.push(childId);
    }
  };
  walk(rootId);
  return out;
}

/** Ids of quests that have at least one sub-quest — the ones not worth planning. */
export function parentIds(rows: QuestNodeRow[]): Set<string> {
  const out = new Set<string>();
  for (const row of rows) if (row.parentQuestId) out.add(row.parentQuestId);
  return out;
}

/**
 * The subtree under `rootId` as nested nodes, each carrying its own rollup.
 * Siblings keep the order they arrive in, so the caller's `orderBy` decides.
 */
export function buildTree<T extends QuestNodeRow>(
  rows: T[],
  rootId: string,
): QuestTreeNode<T>[] {
  const byId = new Map<string, QuestNodeRow>(rows.map((r) => [r.id, r]));
  const childrenOf = new Map<string, T[]>();
  for (const row of rows) {
    if (!row.parentQuestId) continue;
    const siblings = childrenOf.get(row.parentQuestId) ?? [];
    siblings.push(row);
    childrenOf.set(row.parentQuestId, siblings);
  }

  // A cycle can only get in through hand-written SQL, but it would hang the
  // recursion, so every id is taken at most once.
  const visited = new Set<string>([rootId]);
  const take = (rows: T[]) => rows.filter((row) => {
    if (visited.has(row.id)) return false;
    visited.add(row.id);
    return true;
  });

  const build = (row: T, depth: number): QuestTreeNode<T> => {
    const children = depth >= MAX_QUEST_DEPTH ? [] : take(childrenOf.get(row.id) ?? []);
    const subQuests = children.map((child) => build(child, depth + 1));
    return { ...row, subQuests, rollup: rollupOf(row, subQuests, depth) };
  };

  const rootDepth = depthOf(rootId, byId);
  return take(childrenOf.get(rootId) ?? []).map((child) => build(child, rootDepth + 1));
}

/** A node's totals, given its already-rolled-up children. */
function rollupOf<T extends QuestNodeRow>(
  row: T,
  subQuests: QuestTreeNode<T>[],
  depth: number,
): QuestRollup {
  const total = subQuests.reduce((sum, s) => sum + 1 + s.rollup.total, 0);
  const done = subQuests.reduce((sum, s) => sum + (isDone(s) ? 1 : 0) + s.rollup.done, 0);
  // A parent's own estimate is the pre-breakdown guess; its steps replace it.
  const estimatedMinutes = subQuests.length
    ? subQuests.reduce((sum, s) => sum + s.rollup.estimatedMinutes, 0)
    : row.estimatedMinutes;
  const doneMinutes = subQuests.length
    ? subQuests.reduce((sum, s) => sum + s.rollup.doneMinutes, 0)
    : isDone(row)
      ? row.estimatedMinutes
      : 0;

  return {
    total,
    done,
    childCount: subQuests.length,
    estimatedMinutes,
    doneMinutes,
    depth,
    canNest: depth < MAX_QUEST_DEPTH,
  };
}

/**
 * Rollups for a set of main quests in one pass — what GET /quests needs to put
 * a progress count on every card without a query per quest.
 */
export function rollupsByRoot(
  rows: QuestNodeRow[],
  rootIds: string[],
): Map<string, QuestRollup> {
  const out = new Map<string, QuestRollup>();
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const rootId of rootIds) {
    const root = byId.get(rootId);
    if (!root) continue;
    const subQuests = buildTree(rows, rootId);
    out.set(rootId, rollupOf(root, subQuests, depthOf(rootId, byId)));
  }
  return out;
}

/** Tiers a quest and everything under it occupy: 1 for a quest with no steps. */
export function subtreeHeight(rows: QuestNodeRow[], id: string): number {
  const childrenOf = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.parentQuestId) continue;
    childrenOf.set(row.parentQuestId, [...(childrenOf.get(row.parentQuestId) ?? []), row.id]);
  }
  const seen = new Set<string>();
  const height = (node: string): number => {
    if (seen.has(node)) return 0;
    seen.add(node);
    const kids = childrenOf.get(node) ?? [];
    return 1 + Math.max(0, ...kids.map(height));
  };
  return height(id);
}

export type MoveProblem = 'NOT_FOUND' | 'SELF' | 'CYCLE' | 'TOO_DEEP';

/**
 * Why `questId` may not be filed under `parentId`, or null when it may.
 * A quest brings its own steps with it, so what has to fit under the cap is
 * the parent's depth plus the height of the whole subtree being moved.
 */
export function moveProblem(rows: QuestNodeRow[], questId: string, parentId: string): MoveProblem | null {
  const byId = new Map(rows.map((r) => [r.id, r]));
  if (!byId.has(parentId) || !byId.has(questId)) return 'NOT_FOUND';
  if (parentId === questId) return 'SELF';
  if (descendantIds(rows, questId).includes(parentId)) return 'CYCLE';
  if (depthOf(parentId, byId) + subtreeHeight(rows, questId) > MAX_QUEST_DEPTH) return 'TOO_DEEP';
  return null;
}

export interface ParentChoice {
  id: string;
  title: string;
  /** 1 for a main quest, 2 for a step: how far to indent it in the menu. */
  depth: number;
}

/**
 * What the "Part of" menu offers: every open quest that can still take a
 * step, in tree order so a step sits under its main quest. With `forQuestId`
 * (an existing quest being re-filed) it leaves out the quest itself, its own
 * steps, and anywhere its subtree would not fit.
 */
export function parentChoices<T extends QuestNodeRow & { title: string }>(
  rows: T[],
  eligible: (row: T) => boolean,
  forQuestId?: string,
): ParentChoice[] {
  const byId = new Map<string, QuestNodeRow>(rows.map((r) => [r.id, r]));
  const childrenOf = new Map<string, T[]>();
  for (const row of rows) {
    if (!row.parentQuestId) continue;
    childrenOf.set(row.parentQuestId, [...(childrenOf.get(row.parentQuestId) ?? []), row]);
  }
  const moving = forQuestId ? subtreeHeight(rows, forQuestId) : 1;
  const out: ParentChoice[] = [];
  const seen = new Set<string>();
  const walk = (row: T, depth: number) => {
    if (seen.has(row.id) || row.id === forQuestId || !eligible(row)) return;
    seen.add(row.id);
    if (depth + moving <= MAX_QUEST_DEPTH) out.push({ id: row.id, title: row.title, depth });
    if (depth + 1 < MAX_QUEST_DEPTH) for (const child of childrenOf.get(row.id) ?? []) walk(child, depth + 1);
  };
  for (const row of rows) if (!row.parentQuestId || !byId.has(row.parentQuestId)) walk(row, 1);
  return out;
}
