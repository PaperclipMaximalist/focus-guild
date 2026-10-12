/**
 * The quest manifest, server side: what an import may carry, the rows it
 * becomes, and the same shape read back out for an export.
 *
 * A manifest is a list of quests, each with optional steps, three tiers deep
 * at most. People write it as text (one quest per line, steps indented; the
 * grammar is `client/src/lib/quickAdd.ts` for a line and
 * `client/src/lib/manifest.ts` for the page) and the client sends the parsed
 * tree here, so the preview it showed and what gets created cannot disagree.
 * A program can skip the text and post the tree itself. Both forms are
 * specified in `docs/QUEST_MANIFEST.md`.
 *
 * A quest carries only what was said about it. Whatever is left out is left
 * unset, and the column defaults and the planner's own defaults apply, exactly
 * as for a quest made in the editor. Nothing is inherited from a parent.
 *
 * Capped, and written in one transaction by the route: a half-finished import
 * of 40 quests would be worse than a clean failure. (A bulk import shipped in
 * May once wedged production; this one is all-or-nothing.)
 *
 * Everything here is pure; `routes/manifest.ts` does the reading and writing.
 */

import { z } from 'zod';

/** Main quest, step, sub-step. The same number as `MAX_QUEST_DEPTH` in `lib/questTree.ts`. */
export const MAX_TIERS = 3;
/** Quests and steps together, in one import. */
export const MAX_IMPORT = 200;
/**
 * An hour log is a quest with no estimate: `estimatedMinutes` is 0 and the
 * running total is `actualMinutes`. `lib/hourLog.ts` owns that convention
 * (`isOpenEnded`); this value must stay equal to its own.
 *
 * Time an hour log arrives with goes into the total and nowhere else. It is
 * not given an entry: an entry has a day, the manifest does not say which, and
 * one stamped with the moment of the import would count as hours done today.
 */
export const OPEN_ENDED_MINUTES = 0;

const fields = {
  title: z.string().trim().min(1).max(280),
  estimatedMinutes: z.number().int().min(1).max(100 * 60).optional(),
  /** An hour log: no estimate, time is written down as it is spent. */
  trackHours: z.boolean().optional(),
  /** Time already put in. On an hour log it is the opening total. */
  loggedMinutes: z.number().int().min(1).max(100_000).optional(),
  deadline: z.string().datetime({ offset: true }).nullable().optional(),
  priorityTier: z.enum(['LOW', 'MED', 'HIGH']).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  mentalLoad: z.number().int().min(1).max(10).optional(),
  impact: z.number().int().min(1).max(10).optional(),
  category: z.enum(['deep_work', 'comms', 'admin', 'creative']).optional(),
  preferredHour: z.number().int().min(0).max(23).optional(),
  minChunkMin: z.number().int().min(5).max(480).optional(),
  maxChunkMin: z.number().int().min(5).max(480).optional(),
  tediousness: z.number().min(0).max(1).optional(),
  setupCost: z.number().min(0).max(1).optional(),
  urgencyMult: z.number().min(0).max(5).optional(),
  isRecurring: z.boolean().optional(),
};

// Strict, so a fourth tier (or a misspelt key) is refused rather than dropped without a word.
const Tier3 = z.object(fields).strict();
const Tier2 = z.object({ ...fields, steps: z.array(Tier3).optional() }).strict();
const Tier1 = z.object({ ...fields, steps: z.array(Tier2).optional() }).strict();

export type ManifestQuest = z.infer<typeof Tier3> & { steps?: ManifestQuest[] };

/** Every quest in the tree with where it sits, parents before their steps. */
function walk(
  quests: ManifestQuest[],
  visit: (q: ManifestQuest, at: { path: Array<string | number>; tier: number; parent: ManifestQuest | null }) => void,
  path: Array<string | number> = ['quests'],
  tier = 1,
  parent: ManifestQuest | null = null,
): void {
  quests.forEach((q, i) => {
    const here = [...path, i];
    visit(q, { path: here, tier, parent });
    if (q.steps?.length) walk(q.steps, visit, [...here, 'steps'], tier + 1, q);
  });
}

export function countQuests(quests: ManifestQuest[]): number {
  let n = 0;
  walk(quests, () => {
    n += 1;
  });
  return n;
}

export const ManifestSchema = z
  .object({
    quests: z.array(Tier1).min(1),
    /** Check the manifest and report what it would make, without making it. */
    dryRun: z.boolean().optional(),
  })
  .superRefine((body, ctx) => {
    const total = countQuests(body.quests);
    if (total > MAX_IMPORT) {
      ctx.addIssue({ code: 'custom', path: ['quests'], message: `${total} quests and steps; one import takes at most ${MAX_IMPORT}` });
    }
    walk(body.quests, (q, { path, parent }) => {
      const no = (message: string) => ctx.addIssue({ code: 'custom', path, message });
      if (q.minChunkMin !== undefined && q.maxChunkMin !== undefined && q.minChunkMin > q.maxChunkMin) {
        no('minChunkMin is longer than maxChunkMin');
      }
      // The same rules POST /quests keeps: an hour log and a daily round stand alone.
      if (q.trackHours) {
        if (q.estimatedMinutes !== undefined) no('an hour log has no estimate: send trackHours or estimatedMinutes, not both');
        if (q.isRecurring) no('an hour log cannot also repeat daily');
        if (parent) no('an hour log cannot be a step of another quest');
        if (q.steps?.length) no('an hour log cannot have steps');
      }
      if (q.isRecurring) {
        if (parent) no('a daily round cannot be a step of another quest');
        if (q.steps?.length) no('a daily round cannot have steps');
      }
    });
  });

/** Zod's issues as one sentence a person (or the model that wrote the manifest) can act on. */
export function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 8)
    .map((i) => {
      const where = i.path
        .map((p) => (typeof p === 'number' ? `[${p}]` : `.${String(p)}`))
        .join('')
        .replace(/^\./, '');
      // A `steps` key where none is allowed is a fourth tier, and should be called that.
      const fourthTier = i.code === 'unrecognized_keys' && i.keys.includes('steps') && i.path.filter((p) => p === 'steps').length === MAX_TIERS - 1;
      const message = fourthTier ? `steps go ${MAX_TIERS} tiers deep at most, and this one has steps of its own` : i.message;
      return where ? `${where}: ${message}` : message;
    })
    .join('; ');
}

export interface ManifestRows {
  /** Quest rows, parents before their steps, so they can be created in order. */
  rows: Array<Record<string, unknown> & { id: string; userId: string; title: string; parentQuestId: string | null }>;
  counts: { quests: number; steps: number; hourLogs: number; routines: number };
}

/**
 * One quest row per quest in the manifest. Only what the manifest said is set.
 *
 * Each row is stamped a millisecond after the one before. Lists are read back
 * oldest first, and rows written in one transaction would otherwise all carry
 * the transaction's single timestamp, leaving the order of steps to chance.
 */
export function manifestRows(userId: string, quests: ManifestQuest[], newId: () => string, now: Date = new Date()): ManifestRows {
  const out: ManifestRows = { rows: [], counts: { quests: 0, steps: 0, hourLogs: 0, routines: 0 } };
  const ids = new Map<ManifestQuest, string>();
  walk(quests, (q, { parent }) => {
    const id = newId();
    const createdAt = new Date(now.getTime() + out.rows.length);
    ids.set(q, id);
    const { title, estimatedMinutes, trackHours, loggedMinutes, deadline, tags, steps: _steps, isRecurring, ...said } = q;
    out.rows.push({
      id,
      userId,
      title,
      estimatedMinutes: trackHours ? OPEN_ENDED_MINUTES : (estimatedMinutes ?? 30),
      deadline: deadline ? new Date(deadline) : null,
      tags: tags ?? [],
      status: 'ACTIVE',
      parentQuestId: parent ? ids.get(parent)! : null,
      createdAt,
      ...(loggedMinutes ? { actualMinutes: loggedMinutes } : {}),
      ...(isRecurring ? { isRecurring: true } : {}),
      ...said,
    });
    if (parent) out.counts.steps += 1;
    else if (trackHours) out.counts.hourLogs += 1;
    else if (isRecurring) out.counts.routines += 1;
    else out.counts.quests += 1;
  });
  return out;
}

/** The columns an export reads. */
export interface ExportRow {
  id: string;
  parentQuestId: string | null;
  title: string;
  estimatedMinutes: number;
  actualMinutes: number | null;
  deadline: Date | null;
  priorityTier: 'LOW' | 'MED' | 'HIGH';
  tags: string[];
  mentalLoad: number;
  impact: number;
  category: string | null;
  preferredHour: number | null;
  minChunkMin: number | null;
  maxChunkMin: number | null;
  tediousness: number | null;
  setupCost: number | null;
  urgencyMult: number | null;
  isRecurring: boolean;
  createdAt: Date;
}

const CATEGORIES = new Set(['deep_work', 'comms', 'admin', 'creative']);

/** A stored quest in the manifest's words: only what differs from a quest made with a bare title. */
function toManifestQuest(r: ExportRow): ManifestQuest {
  const q: ManifestQuest = { title: r.title };
  if (r.estimatedMinutes === OPEN_ENDED_MINUTES) q.trackHours = true;
  else if (r.estimatedMinutes !== 30) q.estimatedMinutes = r.estimatedMinutes;
  if (r.actualMinutes && r.actualMinutes > 0) q.loggedMinutes = r.actualMinutes;
  if (r.deadline) q.deadline = r.deadline.toISOString();
  if (r.priorityTier !== 'MED') q.priorityTier = r.priorityTier;
  if (r.tags.length) q.tags = [...r.tags];
  if (r.mentalLoad !== 5) q.mentalLoad = r.mentalLoad;
  if (r.impact !== 5) q.impact = r.impact;
  if (r.category && CATEGORIES.has(r.category)) q.category = r.category as ManifestQuest['category'];
  if (r.preferredHour !== null) q.preferredHour = r.preferredHour;
  if (r.minChunkMin !== null) q.minChunkMin = r.minChunkMin;
  if (r.maxChunkMin !== null) q.maxChunkMin = r.maxChunkMin;
  if (r.tediousness !== null) q.tediousness = r.tediousness;
  if (r.setupCost !== null) q.setupCost = r.setupCost;
  if (r.urgencyMult !== null && r.urgencyMult !== 1) q.urgencyMult = r.urgencyMult;
  if (r.isRecurring) q.isRecurring = true;
  return q;
}

/**
 * Unfinished quests as a manifest tree, oldest first. Pass only the rows to
 * carry (the route leaves finished ones out): a step whose parent is not among
 * them goes with its parent, and anything below the third tier is left behind.
 */
export function exportTree(rows: ExportRow[]): ManifestQuest[] {
  const sorted = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const byParent = new Map<string | null, ExportRow[]>();
  for (const r of sorted) {
    const list = byParent.get(r.parentQuestId) ?? [];
    list.push(r);
    byParent.set(r.parentQuestId, list);
  }
  const build = (parent: string | null, tier: number): ManifestQuest[] =>
    (byParent.get(parent) ?? []).map((r) => {
      const q = toManifestQuest(r);
      const steps = tier < MAX_TIERS ? build(r.id, tier + 1) : [];
      // A round and an hour log stand alone, on the way out as on the way in.
      if (steps.length && !q.isRecurring && !q.trackHours) q.steps = steps;
      return q;
    });
  return build(null, 1);
}
