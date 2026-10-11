/**
 * The quest manifest: many quests in, or all of them out, in one call.
 *
 *   POST /manifest/import   { quests: [...], dryRun? } → create a tree of quests
 *   GET  /manifest/export                              → every unfinished quest, as the same tree
 *
 * The shape and its rules are `lib/questImport.ts`; the text form people write
 * is parsed in the client. Both are specified in `docs/QUEST_MANIFEST.md`.
 * The older `POST /quests/import` (a flat list) still works for anything that
 * calls it.
 */

import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import type { Prisma } from '../../generated/prisma/client.js';
import { db } from '../db/client.js';
import { logActivity } from '../lib/activity.js';
import { ManifestSchema, countQuests, describeIssues, exportTree, manifestRows } from '../lib/questImport.js';

export const manifest = new Hono();

// Shaped like the ids the database makes for itself, so an imported quest looks like any other.
const newId = () => `c${randomUUID().replace(/-/g, '').slice(0, 24)}`;

manifest.post('/import', async (c) => {
  const user = c.get('user');
  const parsed = ManifestSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: describeIssues(parsed.error) } }, 400);
  }

  const { rows, counts } = manifestRows(user.id, parsed.data.quests, newId);
  const created = rows.length;
  if (parsed.data.dryRun) {
    return c.json({ success: true, data: { created: 0, wouldCreate: created, ...counts, dryRun: true } });
  }

  // Parents come before their steps in `rows`, and one transaction means all of it or none.
  await db.$transaction(rows.map((data) => db.quest.create({ data: data as unknown as Prisma.QuestUncheckedCreateInput })));

  const mains = rows.filter((r) => r.parentQuestId === null);
  void logActivity(
    user.id,
    'quest.imported',
    `Imported ${created} quest${created === 1 ? '' : 's'}` +
      (counts.steps ? ` (${counts.steps} of them steps)` : '') +
      ': ' +
      mains.slice(0, 5).map((q) => `"${q.title}"`).join(', ') +
      (mains.length > 5 ? `, and ${mains.length - 5} more` : ''),
  );
  return c.json({ success: true, data: { created, ...counts } }, 201);
});

manifest.get('/export', async (c) => {
  const user = c.get('user');
  const rows = await db.quest.findMany({
    where: { userId: user.id, status: { not: 'COMPLETE' } },
    orderBy: { createdAt: 'asc' },
  });
  const quests = exportTree(rows);
  return c.json({ success: true, data: { quests, count: countQuests(quests) } });
});
