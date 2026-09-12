/**
 * Tracker — long-horizon item tracking, presets, CAS lens and markdown I/O.
 *
 *   GET    /tracker                      → bootstrap: config, domains, items, side lists
 *   POST   /tracker/items                → create (code auto-assigned)
 *   PATCH  /tracker/items/:id            → update (enforces active cap + next action)
 *   POST   /tracker/items/:id/drop       → one-tap drop
 *   DELETE /tracker/items/:id
 *   POST   /tracker/items/:id/schedule  → materialise nextAction as a Quest
 *   DELETE /tracker/items/:id/schedule  → unlink (the Quest itself survives)
 *   POST   /tracker/items/:id/reflections
 *   DELETE /tracker/reflections/:id
 *   GET/POST/PATCH/DELETE /tracker/domains…
 *   GET/POST/DELETE /tracker/parking-lot…, POST /tracker/parking-lot/:id/promote
 *   GET/POST /tracker/decisions          → append-only; no update or delete
 *   PATCH  /tracker/interviews/:ordinal
 *   GET/PUT/DELETE /tracker/config       → presets (PUT accepts a whole set)
 *   GET    /tracker/cas                  → coverage matrix, balance, conflicts
 *   GET    /tracker/export?tier=&since=  → markdown, always current
 *   POST   /tracker/import/preview       → diff only, applies nothing
 *   POST   /tracker/import/apply
 *
 * The active cap is enforced here rather than in the UI so it holds however
 * the item is edited. CAS-tagged items are exempt: CAS experiences run
 * concurrently by nature, and making the exemption a property of the data
 * keeps write behaviour independent of whether the CAS lens is switched on.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client.js';
import { db } from '../db/client.js';
import {
  CAS_STRANDS,
  STARTER_DOMAINS,
  TRACKER_STATUSES,
  getTrackerConfig,
  getTrackerOverrides,
  nextItemCode,
} from '../lib/tracker/config.js';
import { buildCoverageMatrix, buildStrandBalance, courseworkConflicts } from '../lib/tracker/cas.js';
import { diffImport, parse, serialize, type MdItem } from '../lib/tracker/markdown.js';

export const tracker = new Hono();

// ─── Validation ───────────────────────────────────────────────────────────────

const StatusEnum = z.enum(TRACKER_STATUSES);
const StrandEnum = z.enum(CAS_STRANDS);
const IsoDate = z.string().datetime({ offset: true }).nullable().optional();

const CasFields = {
  casStrands: z.array(StrandEnum).optional(),
  learningOutcomes: z.array(z.number().int().min(1).max(7)).optional(),
  isCourseworkLinked: z.boolean().optional(),
  casStartDate: IsoDate,
  casEndDate: IsoDate,
  isCasProject: z.boolean().optional(),
  hours: z.number().min(0).max(10000).nullable().optional(),
};

const CreateItemSchema = z.object({
  title: z.string().min(1).max(280),
  domainId: z.string().nullable().optional(),
  status: StatusEnum.optional(),
  nextAction: z.string().max(280).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  dueDate: IsoDate,
  codePrefix: z.string().min(1).max(6).optional(),
  ...CasFields,
});

const UpdateItemSchema = z.object({
  title: z.string().min(1).max(280).optional(),
  domainId: z.string().nullable().optional(),
  status: StatusEnum.optional(),
  nextAction: z.string().max(280).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  dueDate: IsoDate,
  ...CasFields,
});

const PresetsSchema = z
  .object({
    activeCap: z.number().int().min(1).max(50).optional(),
    statusLabels: z.record(StatusEnum, z.string().min(1).max(40)).optional(),
    codePrefixes: z.array(z.string().min(1).max(6)).min(1).optional(),
    requiredFields: z
      .object({
        nextActionForActive: z.boolean().optional(),
        domain: z.boolean().optional(),
        dueDate: z.boolean().optional(),
      })
      .strict()
      .optional(),
    reviewCadenceDays: z.number().int().min(1).max(365).optional(),
    reviewPrompts: z.array(z.string().min(1).max(280)).optional(),
    showHours: z.boolean().optional(),
  })
  .strict();

const TierEnum = z.enum(['compact', 'working', 'full', 'archive']);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const bad = (message: string) =>
  ({ success: false as const, error: { code: 'BAD_REQUEST', message } });
const notFound = (what: string) =>
  ({ success: false as const, error: { code: 'NOT_FOUND', message: `${what} not found` } });

const ITEM_INCLUDE = {
  domain: { select: { name: true } },
  reflections: { orderBy: { date: 'desc' } },
} as const;

type ItemRow = Prisma.TrackerItemGetPayload<{ include: typeof ITEM_INCLUDE }>;

/** DB row → the DB-agnostic shape the markdown engine and CAS libs use. */
function toMdItem(row: ItemRow): MdItem {
  return {
    code: row.code,
    title: row.title,
    status: row.status,
    domain: row.domain?.name ?? null,
    nextAction: row.nextAction,
    notes: row.notes,
    dueDate: row.dueDate?.toISOString() ?? null,
    casStrands: row.casStrands,
    learningOutcomes: row.learningOutcomes,
    isCourseworkLinked: row.isCourseworkLinked,
    casStartDate: row.casStartDate?.toISOString() ?? null,
    casEndDate: row.casEndDate?.toISOString() ?? null,
    isCasProject: row.isCasProject,
    hours: row.hours,
    completedAt: row.completedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
    reflections: row.reflections.map((r) => ({
      text: r.text,
      date: r.date.toISOString(),
      loTags: r.loTags,
      mediaUrl: r.mediaUrl,
    })),
  };
}

/**
 * Number of items occupying active slots. CAS-tagged items are exempt, so
 * they neither count toward the cap nor are blocked by it.
 */
async function countCappedActive(userId: string, excludeId?: string): Promise<number> {
  const rows = await db.trackerItem.findMany({
    where: { userId, status: 'ACTIVE', ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { casStrands: true },
  });
  return rows.filter((r) => r.casStrands.length === 0).length;
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

tracker.get('/', async (c) => {
  const user = c.get('user');
  const config = getTrackerConfig(user);

  // First visit: seed suggested domains and the three interview slots.
  const domainCount = await db.trackerDomain.count({ where: { userId: user.id } });
  if (domainCount === 0) {
    await db.trackerDomain.createMany({
      data: STARTER_DOMAINS.map((d, i) => ({ ...d, userId: user.id, sortOrder: i })),
    });
  }
  const interviewCount = await db.casInterview.count({ where: { userId: user.id } });
  if (interviewCount === 0) {
    await db.casInterview.createMany({
      data: [1, 2, 3].map((ordinal) => ({ userId: user.id, ordinal })),
    });
  }

  const [domains, items, parkingLot, decisions, interviews] = await Promise.all([
    db.trackerDomain.findMany({ where: { userId: user.id }, orderBy: { sortOrder: 'asc' } }),
    db.trackerItem.findMany({
      where: { userId: user.id },
      include: ITEM_INCLUDE,
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    }),
    db.parkingLotEntry.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } }),
    db.decisionLogEntry.findMany({ where: { userId: user.id }, orderBy: { decidedAt: 'desc' } }),
    db.casInterview.findMany({ where: { userId: user.id }, orderBy: { ordinal: 'asc' } }),
  ]);

  // `questId` has no FK (quests and tracker items are independent lifecycles),
  // so resolve the links here and let the client detect a dangling one.
  const linkedQuests = await db.quest.findMany({
    where: {
      userId: user.id,
      id: { in: items.map((i) => i.questId).filter((id): id is string => Boolean(id)) },
    },
    select: { id: true, title: true, status: true },
  });

  return c.json({
    success: true,
    data: {
      config,
      domains,
      items,
      parkingLot,
      decisions,
      interviews,
      linkedQuests,
      activeUsed: items.filter((i) => i.status === 'ACTIVE' && i.casStrands.length === 0).length,
    },
  });
});

// ─── Items ────────────────────────────────────────────────────────────────────

tracker.post('/items', async (c) => {
  const user = c.get('user');
  const parsed = CreateItemSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json(bad(parsed.error.message), 400);
  const input = parsed.data;
  const config = getTrackerConfig(user);

  const status = input.status ?? 'TODO';
  const isCas = (input.casStrands ?? []).length > 0;

  if (status === 'ACTIVE') {
    if (config.requiredFields.nextActionForActive && !input.nextAction?.trim()) {
      return c.json(
        {
          success: false,
          error: {
            code: 'NEXT_ACTION_REQUIRED',
            message: 'An active item needs a next action — a physical first step, not a topic.',
          },
        },
        400,
      );
    }
    if (!isCas && (await countCappedActive(user.id)) >= config.activeCap) {
      return c.json(
        {
          success: false,
          error: {
            code: 'ACTIVE_CAP_REACHED',
            message: `Already ${config.activeCap} items active. Complete, drop, deactivate or block one first.`,
          },
        },
        409,
      );
    }
  }
  if (config.requiredFields.domain && !input.domainId) {
    return c.json(bad('A domain is required by your presets.'), 400);
  }
  if (config.requiredFields.dueDate && !input.dueDate) {
    return c.json(bad('A due date is required by your presets.'), 400);
  }

  const prefix = input.codePrefix ?? config.codePrefixes[0] ?? 'A';
  if (!config.codePrefixes.includes(prefix)) {
    return c.json(bad(`Unknown code prefix "${prefix}".`), 400);
  }
  const existing = await db.trackerItem.findMany({
    where: { userId: user.id },
    select: { code: true },
  });
  const code = nextItemCode(existing.map((e) => e.code), prefix);

  const item = await db.trackerItem.create({
    data: {
      userId: user.id,
      code,
      title: input.title,
      domainId: input.domainId ?? null,
      status,
      nextAction: input.nextAction ?? null,
      notes: input.notes ?? null,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      casStrands: input.casStrands ?? [],
      learningOutcomes: input.learningOutcomes ?? [],
      isCourseworkLinked: input.isCourseworkLinked ?? false,
      casStartDate: input.casStartDate ? new Date(input.casStartDate) : null,
      casEndDate: input.casEndDate ? new Date(input.casEndDate) : null,
      isCasProject: input.isCasProject ?? false,
      hours: input.hours ?? null,
    },
    include: ITEM_INCLUDE,
  });

  return c.json({ success: true, data: item }, 201);
});

tracker.patch('/items/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const parsed = UpdateItemSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json(bad(parsed.error.message), 400);
  const input = parsed.data;

  const current = await db.trackerItem.findUnique({ where: { id } });
  if (!current || current.userId !== user.id) return c.json(notFound('Item'), 404);

  const config = getTrackerConfig(user);
  const nextStatus = input.status ?? current.status;
  const nextActionAfter =
    input.nextAction !== undefined ? input.nextAction : current.nextAction;
  const strandsAfter = input.casStrands ?? current.casStrands;
  const isCas = strandsAfter.length > 0;

  const becomingActive = nextStatus === 'ACTIVE' && current.status !== 'ACTIVE';

  if (nextStatus === 'ACTIVE' && config.requiredFields.nextActionForActive && !nextActionAfter?.trim()) {
    return c.json(
      {
        success: false,
        error: {
          code: 'NEXT_ACTION_REQUIRED',
          message: 'An active item needs a next action — a physical first step, not a topic.',
        },
      },
      400,
    );
  }
  // Also catches an active item losing its CAS tags and thus its exemption.
  if (nextStatus === 'ACTIVE' && !isCas) {
    const used = await countCappedActive(user.id, id);
    if (used >= config.activeCap) {
      return c.json(
        {
          success: false,
          error: {
            code: 'ACTIVE_CAP_REACHED',
            message: becomingActive
              ? `Already ${config.activeCap} items active. Complete, drop, deactivate or block one first.`
              : `That change would exceed your cap of ${config.activeCap} active items.`,
          },
        },
        409,
      );
    }
  }

  const data: Prisma.TrackerItemUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.domainId !== undefined) {
    data.domain = input.domainId ? { connect: { id: input.domainId } } : { disconnect: true };
  }
  if (input.nextAction !== undefined) data.nextAction = input.nextAction;
  if (input.notes !== undefined) data.notes = input.notes;
  if (input.dueDate !== undefined) data.dueDate = input.dueDate ? new Date(input.dueDate) : null;
  if (input.casStrands !== undefined) data.casStrands = input.casStrands;
  if (input.learningOutcomes !== undefined) data.learningOutcomes = input.learningOutcomes;
  if (input.isCourseworkLinked !== undefined) data.isCourseworkLinked = input.isCourseworkLinked;
  if (input.casStartDate !== undefined) {
    data.casStartDate = input.casStartDate ? new Date(input.casStartDate) : null;
  }
  if (input.casEndDate !== undefined) {
    data.casEndDate = input.casEndDate ? new Date(input.casEndDate) : null;
  }
  if (input.isCasProject !== undefined) data.isCasProject = input.isCasProject;
  if (input.hours !== undefined) data.hours = input.hours;

  if (input.status !== undefined) {
    data.status = input.status;
    data.completedAt = input.status === 'DONE' ? (current.completedAt ?? new Date()) : null;
    data.droppedAt = input.status === 'DROPPED' ? (current.droppedAt ?? new Date()) : null;
  }

  const item = await db.trackerItem.update({ where: { id }, data, include: ITEM_INCLUDE });
  return c.json({ success: true, data: item });
});

/** One tap, no confirmation — dropping is meant to be cheap. */
tracker.post('/items/:id/drop', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const current = await db.trackerItem.findUnique({ where: { id } });
  if (!current || current.userId !== user.id) return c.json(notFound('Item'), 404);

  const item = await db.trackerItem.update({
    where: { id },
    data: { status: 'DROPPED', droppedAt: current.droppedAt ?? new Date(), completedAt: null },
    include: ITEM_INCLUDE,
  });
  return c.json({ success: true, data: item });
});

tracker.delete('/items/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const current = await db.trackerItem.findUnique({ where: { id } });
  if (!current || current.userId !== user.id) return c.json(notFound('Item'), 404);
  await db.trackerItem.delete({ where: { id } });
  return c.json({ success: true, data: { id } });
});

// ─── Scheduler hand-off ───────────────────────────────────────────────────────

/**
 * Materialise an item's `nextAction` as a Quest so the existing scheduler
 * plans it, and record the link on the item.
 *
 * Deliberately explicit rather than automatic on activation: silently
 * creating quests as a side effect of a status change would make the feed
 * fill up with work the user never asked to schedule. Re-scheduling an item
 * whose quest is still open is a no-op that returns the existing quest, so
 * a double tap cannot produce duplicates.
 */
tracker.post('/items/:id/schedule', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const parsed = z
    .object({ estimatedMinutes: z.number().int().min(5).max(600).optional() })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(bad(parsed.error.message), 400);

  const item = await db.trackerItem.findUnique({ where: { id }, include: ITEM_INCLUDE });
  if (!item || item.userId !== user.id) return c.json(notFound('Item'), 404);

  const nextAction = item.nextAction?.trim();
  if (!nextAction) {
    return c.json(
      {
        success: false,
        error: {
          code: 'NEXT_ACTION_REQUIRED',
          message: 'Give the item a next action first — that is what gets scheduled.',
        },
      },
      400,
    );
  }

  if (item.questId) {
    const existing = await db.quest.findFirst({
      where: { id: item.questId, userId: user.id, status: 'ACTIVE' },
    });
    if (existing) return c.json({ success: true, data: { item, quest: existing } });
  }

  const quest = await db.quest.create({
    data: {
      userId: user.id,
      title: nextAction.slice(0, 280),
      deadline: item.dueDate,
      tags: item.domain ? [item.domain.name.toLowerCase().replace(/\s+/g, '-')] : [],
    },
  });
  const updated = await db.trackerItem.update({
    where: { id },
    data: { questId: quest.id },
    include: ITEM_INCLUDE,
  });

  return c.json({ success: true, data: { item: updated, quest } }, 201);
});

/** Drop the link only. The quest keeps its own life in the feed. */
tracker.delete('/items/:id/schedule', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const current = await db.trackerItem.findUnique({ where: { id } });
  if (!current || current.userId !== user.id) return c.json(notFound('Item'), 404);

  const item = await db.trackerItem.update({
    where: { id },
    data: { questId: null },
    include: ITEM_INCLUDE,
  });
  return c.json({ success: true, data: item });
});

// ─── Reflections ──────────────────────────────────────────────────────────────

const ReflectionSchema = z.object({
  text: z.string().min(1).max(8000),
  date: z.string().datetime({ offset: true }).optional(),
  loTags: z.array(z.number().int().min(1).max(7)).optional(),
  mediaUrl: z.string().max(2000).nullable().optional(),
});

tracker.post('/items/:id/reflections', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const parsed = ReflectionSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json(bad(parsed.error.message), 400);

  const item = await db.trackerItem.findUnique({ where: { id } });
  if (!item || item.userId !== user.id) return c.json(notFound('Item'), 404);

  const reflection = await db.reflection.create({
    data: {
      itemId: id,
      text: parsed.data.text,
      date: parsed.data.date ? new Date(parsed.data.date) : new Date(),
      loTags: parsed.data.loTags ?? [],
      mediaUrl: parsed.data.mediaUrl ?? null,
    },
  });
  return c.json({ success: true, data: reflection }, 201);
});

tracker.delete('/reflections/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const row = await db.reflection.findUnique({ where: { id }, include: { item: true } });
  if (!row || row.item.userId !== user.id) return c.json(notFound('Reflection'), 404);
  await db.reflection.delete({ where: { id } });
  return c.json({ success: true, data: { id } });
});

// ─── Domains ──────────────────────────────────────────────────────────────────

const DomainSchema = z.object({
  name: z.string().min(1).max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

tracker.post('/domains', async (c) => {
  const user = c.get('user');
  const parsed = DomainSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json(bad(parsed.error.message), 400);

  const max = await db.trackerDomain.aggregate({
    where: { userId: user.id },
    _max: { sortOrder: true },
  });
  try {
    const domain = await db.trackerDomain.create({
      data: {
        userId: user.id,
        name: parsed.data.name,
        ...(parsed.data.color ? { color: parsed.data.color } : {}),
        sortOrder: (max._max.sortOrder ?? -1) + 1,
      },
    });
    return c.json({ success: true, data: domain }, 201);
  } catch {
    return c.json(bad('A domain with that name already exists.'), 409);
  }
});

tracker.patch('/domains/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const parsed = DomainSchema.partial().safeParse(await c.req.json());
  if (!parsed.success) return c.json(bad(parsed.error.message), 400);

  const current = await db.trackerDomain.findUnique({ where: { id } });
  if (!current || current.userId !== user.id) return c.json(notFound('Domain'), 404);

  try {
    const domain = await db.trackerDomain.update({ where: { id }, data: parsed.data });
    return c.json({ success: true, data: domain });
  } catch {
    return c.json(bad('A domain with that name already exists.'), 409);
  }
});

/** Reorder in one call so a drag doesn't fire N requests. */
tracker.put('/domains/order', async (c) => {
  const user = c.get('user');
  const parsed = z.object({ ids: z.array(z.string()).min(1) }).safeParse(await c.req.json());
  if (!parsed.success) return c.json(bad(parsed.error.message), 400);

  const owned = await db.trackerDomain.findMany({
    where: { userId: user.id },
    select: { id: true },
  });
  const ownedIds = new Set(owned.map((d) => d.id));
  if (parsed.data.ids.some((id) => !ownedIds.has(id))) {
    return c.json(bad('Reorder list contains a domain that is not yours.'), 400);
  }

  await db.$transaction(
    parsed.data.ids.map((id, sortOrder) =>
      db.trackerDomain.update({ where: { id }, data: { sortOrder } }),
    ),
  );
  const domains = await db.trackerDomain.findMany({
    where: { userId: user.id },
    orderBy: { sortOrder: 'asc' },
  });
  return c.json({ success: true, data: domains });
});

/** Items survive: their domainId is nulled by the FK, landing them in Unsorted. */
tracker.delete('/domains/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const current = await db.trackerDomain.findUnique({ where: { id } });
  if (!current || current.userId !== user.id) return c.json(notFound('Domain'), 404);
  await db.trackerDomain.delete({ where: { id } });
  return c.json({ success: true, data: { id } });
});

// ─── Parking lot ──────────────────────────────────────────────────────────────

tracker.post('/parking-lot', async (c) => {
  const user = c.get('user');
  const parsed = z.object({ text: z.string().min(1).max(2000) }).safeParse(await c.req.json());
  if (!parsed.success) return c.json(bad(parsed.error.message), 400);
  const entry = await db.parkingLotEntry.create({
    data: { userId: user.id, text: parsed.data.text },
  });
  return c.json({ success: true, data: entry }, 201);
});

tracker.delete('/parking-lot/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const row = await db.parkingLotEntry.findUnique({ where: { id } });
  if (!row || row.userId !== user.id) return c.json(notFound('Entry'), 404);
  await db.parkingLotEntry.delete({ where: { id } });
  return c.json({ success: true, data: { id } });
});

/** Graduate a captured thought into a real item. */
tracker.post('/parking-lot/:id/promote', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const parsed = z
    .object({ domainId: z.string().nullable().optional(), codePrefix: z.string().min(1).max(6).optional() })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(bad(parsed.error.message), 400);

  const entry = await db.parkingLotEntry.findUnique({ where: { id } });
  if (!entry || entry.userId !== user.id) return c.json(notFound('Entry'), 404);

  const config = getTrackerConfig(user);
  const prefix = parsed.data.codePrefix ?? config.codePrefixes[0] ?? 'A';
  const existing = await db.trackerItem.findMany({
    where: { userId: user.id },
    select: { code: true },
  });
  const code = nextItemCode(existing.map((e) => e.code), prefix);

  const [item] = await db.$transaction([
    db.trackerItem.create({
      data: {
        userId: user.id,
        code,
        title: entry.text.slice(0, 280),
        domainId: parsed.data.domainId ?? null,
        status: 'TODO',
      },
      include: ITEM_INCLUDE,
    }),
    db.parkingLotEntry.update({ where: { id }, data: { promotedToCode: code } }),
  ]);
  return c.json({ success: true, data: item }, 201);
});

// ─── Decision log (append-only) ───────────────────────────────────────────────

tracker.post('/decisions', async (c) => {
  const user = c.get('user');
  const parsed = z
    .object({
      text: z.string().min(1).max(4000),
      decidedAt: z.string().datetime({ offset: true }).optional(),
    })
    .safeParse(await c.req.json());
  if (!parsed.success) return c.json(bad(parsed.error.message), 400);

  const entry = await db.decisionLogEntry.create({
    data: {
      userId: user.id,
      text: parsed.data.text,
      ...(parsed.data.decidedAt ? { decidedAt: new Date(parsed.data.decidedAt) } : {}),
    },
  });
  return c.json({ success: true, data: entry }, 201);
});

// ─── CAS interviews ───────────────────────────────────────────────────────────

tracker.patch('/interviews/:ordinal', async (c) => {
  const user = c.get('user');
  const ordinal = Number(c.req.param('ordinal'));
  if (![1, 2, 3].includes(ordinal)) return c.json(bad('Interview must be 1, 2 or 3.'), 400);

  const parsed = z
    .object({
      date: z.string().datetime({ offset: true }).nullable().optional(),
      notes: z.string().max(8000).nullable().optional(),
    })
    .safeParse(await c.req.json());
  if (!parsed.success) return c.json(bad(parsed.error.message), 400);

  const data: Prisma.CasInterviewUpdateInput = {};
  if (parsed.data.date !== undefined) data.date = parsed.data.date ? new Date(parsed.data.date) : null;
  if (parsed.data.notes !== undefined) data.notes = parsed.data.notes;

  const row = await db.casInterview.upsert({
    where: { userId_ordinal: { userId: user.id, ordinal } },
    update: data,
    create: {
      userId: user.id,
      ordinal,
      date: parsed.data.date ? new Date(parsed.data.date) : null,
      notes: parsed.data.notes ?? null,
    },
  });
  return c.json({ success: true, data: row });
});

// ─── CAS projections ──────────────────────────────────────────────────────────

tracker.get('/cas', async (c) => {
  const user = c.get('user');
  const config = getTrackerConfig(user);
  const rows = await db.trackerItem.findMany({
    where: { userId: user.id },
    include: ITEM_INCLUDE,
  });

  return c.json({
    success: true,
    data: {
      matrix: buildCoverageMatrix(rows),
      balance: buildStrandBalance(rows, new Date(), { showHours: config.showHours }),
      conflicts: courseworkConflicts(rows),
      interviews: await db.casInterview.findMany({
        where: { userId: user.id },
        orderBy: { ordinal: 'asc' },
      }),
    },
  });
});

// ─── Presets ──────────────────────────────────────────────────────────────────

tracker.get('/config', (c) => {
  const user = c.get('user');
  return c.json({
    success: true,
    data: { config: getTrackerConfig(user), overrides: getTrackerOverrides(user) },
  });
});

/** Accepts a whole preset set, which is what preset import posts. */
tracker.put('/config', async (c) => {
  const user = c.get('user');
  const parsed = PresetsSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json(bad(parsed.error.message), 400);

  await db.user.update({
    where: { id: user.id },
    data: { trackerSettings: parsed.data as object },
  });
  const fresh = { trackerSettings: parsed.data };
  return c.json({
    success: true,
    data: { config: getTrackerConfig(fresh), overrides: getTrackerOverrides(fresh) },
  });
});

tracker.delete('/config', async (c) => {
  const user = c.get('user');
  await db.user.update({
    where: { id: user.id },
    data: { trackerSettings: Prisma.JsonNull },
  });
  return c.json({ success: true, data: { config: getTrackerConfig({}), overrides: {} } });
});

// ─── Markdown export / import ─────────────────────────────────────────────────

async function loadDoc(userId: string) {
  const [rows, parkingLot, decisions] = await Promise.all([
    db.trackerItem.findMany({ where: { userId }, include: ITEM_INCLUDE, orderBy: { code: 'asc' } }),
    db.parkingLotEntry.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
    db.decisionLogEntry.findMany({ where: { userId }, orderBy: { decidedAt: 'desc' } }),
  ]);
  return {
    rows,
    doc: {
      items: rows.map(toMdItem),
      parkingLot: parkingLot.map((p) => ({ text: p.text, createdAt: p.createdAt.toISOString() })),
      decisions: decisions.map((d) => ({ text: d.text, decidedAt: d.decidedAt.toISOString() })),
    },
  };
}

/** Always current — there is no generate step to run first. */
tracker.get('/export', async (c) => {
  const user = c.get('user');
  const tier = TierEnum.safeParse(c.req.query('tier') ?? 'working');
  if (!tier.success) return c.json(bad('tier must be compact, working, full or archive.'), 400);

  const sinceRaw = c.req.query('since');
  let since: Date | null = null;
  if (sinceRaw) {
    since = new Date(sinceRaw);
    if (Number.isNaN(since.getTime())) return c.json(bad('since must be a valid date.'), 400);
  }

  const config = getTrackerConfig(user);
  const { doc } = await loadDoc(user.id);
  const markdown = serialize(doc, {
    tier: tier.data,
    generatedAt: new Date(),
    since,
    showHours: config.showHours,
  });

  return c.json({
    success: true,
    data: { tier: tier.data, markdown, chars: markdown.length },
  });
});

/**
 * Character counts for every tier, so the export buttons can show an
 * approximate size without the client rendering all four.
 */
tracker.get('/export/sizes', async (c) => {
  const user = c.get('user');
  const config = getTrackerConfig(user);
  const { doc } = await loadDoc(user.id);
  const generatedAt = new Date();
  const sizes = Object.fromEntries(
    (['compact', 'working', 'full', 'archive'] as const).map((tier) => [
      tier,
      serialize(doc, { tier, generatedAt, showHours: config.showHours }).length,
    ]),
  );
  return c.json({ success: true, data: { sizes } });
});

const ImportSchema = z.object({ markdown: z.string().min(1).max(2_000_000) });

tracker.post('/import/preview', async (c) => {
  const user = c.get('user');
  const parsed = ImportSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json(bad(parsed.error.message), 400);

  const { doc } = await loadDoc(user.id);
  const incoming = parse(parsed.data.markdown);
  return c.json({
    success: true,
    data: { diff: diffImport(doc.items, incoming), schema: incoming.schema, tier: incoming.tier },
  });
});

tracker.post('/import/apply', async (c) => {
  const user = c.get('user');
  const parsed = ImportSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json(bad(parsed.error.message), 400);

  const { doc } = await loadDoc(user.id);
  const incoming = parse(parsed.data.markdown);
  const diff = diffImport(doc.items, incoming);

  // Domains referenced by name; create any that don't exist yet.
  const domains = await db.trackerDomain.findMany({ where: { userId: user.id } });
  const byName = new Map(domains.map((d) => [d.name.toLowerCase(), d.id]));
  const wanted = new Set(
    [...diff.creates, ...diff.updates.map((u) => u.incoming)]
      .map((i) => i.domain?.trim())
      .filter((n): n is string => Boolean(n) && !byName.has(n!.toLowerCase())),
  );
  let order = domains.length;
  for (const name of wanted) {
    const created = await db.trackerDomain.create({
      data: { userId: user.id, name, sortOrder: order++ },
    });
    byName.set(name.toLowerCase(), created.id);
  }

  const resolveDomain = (name?: string | null): string | null =>
    name ? (byName.get(name.trim().toLowerCase()) ?? null) : null;

  const fields = (i: MdItem) => ({
    title: i.title,
    status: i.status,
    ...(i.nextAction !== undefined ? { nextAction: i.nextAction } : {}),
    ...(i.notes !== undefined ? { notes: i.notes } : {}),
    ...(i.dueDate !== undefined ? { dueDate: i.dueDate ? new Date(i.dueDate) : null } : {}),
    ...(i.domain !== undefined ? { domainId: resolveDomain(i.domain) } : {}),
    ...(i.casStrands !== undefined ? { casStrands: i.casStrands } : {}),
    ...(i.learningOutcomes !== undefined ? { learningOutcomes: i.learningOutcomes } : {}),
    ...(i.isCourseworkLinked !== undefined ? { isCourseworkLinked: i.isCourseworkLinked } : {}),
    ...(i.casStartDate !== undefined
      ? { casStartDate: i.casStartDate ? new Date(i.casStartDate) : null }
      : {}),
    ...(i.casEndDate !== undefined
      ? { casEndDate: i.casEndDate ? new Date(i.casEndDate) : null }
      : {}),
    ...(i.isCasProject !== undefined ? { isCasProject: i.isCasProject } : {}),
    ...(i.hours !== undefined ? { hours: i.hours } : {}),
    completedAt: i.status === 'DONE' ? new Date() : null,
    droppedAt: i.status === 'DROPPED' ? new Date() : null,
  });

  await db.$transaction([
    ...diff.creates.map((i) =>
      db.trackerItem.create({ data: { userId: user.id, code: i.code, ...fields(i) } }),
    ),
    ...diff.updates.map((u) =>
      db.trackerItem.update({
        where: { userId_code: { userId: user.id, code: u.code } },
        data: fields(u.incoming),
      }),
    ),
  ]);

  return c.json({
    success: true,
    data: {
      created: diff.creates.length,
      updated: diff.updates.length,
      unchanged: diff.unchanged.length,
      untouched: diff.untouched.length,
      warnings: diff.warnings,
    },
  });
});
