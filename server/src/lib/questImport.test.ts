import { describe, expect, it } from 'vitest';
import {
  MAX_IMPORT,
  ManifestSchema,
  countQuests,
  describeIssues,
  exportTree,
  manifestRows,
  type ExportRow,
  type ManifestQuest,
} from './questImport.js';

const parse = (quests: unknown[]) => ManifestSchema.safeParse({ quests });
const ids = () => {
  let n = 0;
  return () => `id${(n += 1)}`;
};
const rowsOf = (quests: unknown[]) => {
  const r = parse(quests);
  if (!r.success) throw new Error(describeIssues(r.error));
  return manifestRows('u1', r.data.quests, ids());
};

describe('a manifest coming in', () => {
  it('needs nothing but a title, and leaves the rest to the defaults', () => {
    expect(rowsOf([{ title: '  Email the coordinator  ' }]).rows).toEqual([
      { id: 'id1', userId: 'u1', title: 'Email the coordinator', estimatedMinutes: 30, deadline: null, tags: [], status: 'ACTIVE', parentQuestId: null },
    ]);
  });

  it('carries every setting a line can give', () => {
    const line = {
      title: 'Finish IA',
      estimatedMinutes: 90,
      deadline: '2026-10-15T21:00:00.000Z',
      priorityTier: 'HIGH',
      tags: ['chem'],
      mentalLoad: 8,
      impact: 9,
      category: 'deep_work',
      preferredHour: 16,
      minChunkMin: 20,
      maxChunkMin: 45,
      tediousness: 0.7,
      setupCost: 0.1,
      urgencyMult: 1.5,
    };
    expect(rowsOf([line]).rows[0]).toEqual({
      ...line,
      id: 'id1',
      userId: 'u1',
      status: 'ACTIVE',
      parentQuestId: null,
      deadline: new Date('2026-10-15T21:00:00.000Z'),
    });
  });

  it('turns away values the editor could not have made', () => {
    expect(parse([{ title: 'x', mentalLoad: 11 }]).success).toBe(false);
    expect(parse([{ title: 'x', category: 'gym' }]).success).toBe(false);
    expect(parse([{ title: 'x', preferredHour: 24 }]).success).toBe(false);
    expect(parse([{ title: 'x', minChunkMin: 60, maxChunkMin: 30 }]).success).toBe(false);
    expect(parse([{ title: 'x', deadline: 'next friday' }]).success).toBe(false);
    expect(parse([{ title: 'x', colour: 'blue' }]).success).toBe(false);
  });

  it('links steps to their parent, parents first, three tiers deep', () => {
    const { rows, counts } = rowsOf([
      { title: 'Essay', steps: [{ title: 'Outline', steps: [{ title: 'Thesis' }] }, { title: 'Draft', estimatedMinutes: 120 }] },
      { title: 'Other' },
    ]);
    expect(rows.map((r) => [r.id, r.title, r.parentQuestId])).toEqual([
      ['id1', 'Essay', null],
      ['id2', 'Outline', 'id1'],
      ['id3', 'Thesis', 'id2'],
      ['id4', 'Draft', 'id1'],
      ['id5', 'Other', null],
    ]);
    expect(counts).toEqual({ quests: 2, steps: 3, hourLogs: 0, routines: 0 });
  });

  it('refuses a fourth tier instead of dropping it', () => {
    const deep = [{ title: 'a', steps: [{ title: 'b', steps: [{ title: 'c', steps: [{ title: 'd' }] }] }] }];
    const r = parse(deep);
    expect(r.success).toBe(false);
    expect(describeIssues(r.error!)).toBe('quests[0].steps[0].steps[0]: steps go 3 tiers deep at most, and this one has steps of its own');
  });

  it('makes an hour log a quest with no estimate, its time so far in the total', () => {
    const { rows, counts } = rowsOf([{ title: 'Piano', trackHours: true, loggedMinutes: 750, tags: ['music'] }]);
    expect(rows[0]).toEqual({ id: 'id1', userId: 'u1', title: 'Piano', estimatedMinutes: 0, actualMinutes: 750, deadline: null, tags: ['music'], status: 'ACTIVE', parentQuestId: null });
    expect(counts).toEqual({ quests: 0, steps: 0, hourLogs: 1, routines: 0 });
  });

  it('keeps time already spent on an ordinary quest as progress', () => {
    expect(rowsOf([{ title: 'Report', estimatedMinutes: 240, loggedMinutes: 60 }]).rows[0]).toMatchObject({ estimatedMinutes: 240, actualMinutes: 60 });
  });

  it('holds an hour log and a daily round to standing alone', () => {
    const said = (quests: unknown[]) => {
      const r = parse(quests);
      return r.success ? '' : describeIssues(r.error);
    };
    expect(said([{ title: 'x', trackHours: true, estimatedMinutes: 30 }])).toContain('no estimate');
    expect(said([{ title: 'x', trackHours: true, isRecurring: true }])).toContain('repeat daily');
    expect(said([{ title: 'x', trackHours: true, steps: [{ title: 'y' }] }])).toContain('cannot have steps');
    expect(said([{ title: 'x', steps: [{ title: 'y', trackHours: true }] }])).toContain('quests[0].steps[0]: an hour log cannot be a step');
    expect(said([{ title: 'x', isRecurring: true, steps: [{ title: 'y' }] }])).toContain('a daily round cannot have steps');
    expect(said([{ title: 'x', steps: [{ title: 'y', isRecurring: true }] }])).toContain('a daily round cannot be a step');
    expect(rowsOf([{ title: 'Stretch', isRecurring: true }]).counts.routines).toBe(1);
  });

  it('counts steps towards the cap and refuses an empty list', () => {
    expect(parse([]).success).toBe(false);
    const flat = Array.from({ length: MAX_IMPORT }, (_, i) => ({ title: `q${i}` }));
    expect(parse(flat).success).toBe(true);
    const nested = [{ title: 'p', steps: Array.from({ length: MAX_IMPORT }, (_, i) => ({ title: `s${i}` })) }];
    expect(countQuests(nested as ManifestQuest[])).toBe(MAX_IMPORT + 1);
    expect(parse(nested).success).toBe(false);
  });
});

describe('a manifest going out', () => {
  const at = (n: number) => new Date(Date.UTC(2026, 9, 1, 12, n));
  const row = (over: Partial<ExportRow> & { id: string }): ExportRow => ({
    parentQuestId: null,
    title: over.id,
    estimatedMinutes: 30,
    actualMinutes: null,
    deadline: null,
    priorityTier: 'MED',
    tags: [],
    mentalLoad: 5,
    impact: 5,
    category: null,
    preferredHour: null,
    minChunkMin: null,
    maxChunkMin: null,
    tediousness: null,
    setupCost: null,
    urgencyMult: 1,
    isRecurring: false,
    createdAt: at(0),
    ...over,
  });

  it('says only what differs from a quest made with a bare title', () => {
    expect(exportTree([row({ id: 'a', title: 'Plain' })])).toEqual([{ title: 'Plain' }]);
  });

  it('nests steps under their parent, oldest first, and stops at three tiers', () => {
    const tree = exportTree([
      row({ id: 'b', title: 'Second', createdAt: at(5) }),
      row({ id: 'a', title: 'First', createdAt: at(1) }),
      row({ id: 'a2', title: 'Later step', parentQuestId: 'a', createdAt: at(4) }),
      row({ id: 'a1', title: 'Step', parentQuestId: 'a', createdAt: at(2) }),
      row({ id: 'a1x', title: 'Sub-step', parentQuestId: 'a1', createdAt: at(3) }),
      row({ id: 'a1xy', title: 'Too deep', parentQuestId: 'a1x', createdAt: at(3) }),
      row({ id: 'lost', title: 'Step of a finished quest', parentQuestId: 'gone' }),
    ]);
    expect(tree).toEqual([
      { title: 'First', steps: [{ title: 'Step', steps: [{ title: 'Sub-step' }] }, { title: 'Later step' }] },
      { title: 'Second' },
    ]);
  });

  it('comes back in as the same quests', () => {
    const stored = [
      row({
        id: 'a',
        title: 'Finish IA',
        estimatedMinutes: 360,
        actualMinutes: 45,
        deadline: new Date('2026-10-15T21:00:00.000Z'),
        priorityTier: 'HIGH',
        tags: ['chem'],
        mentalLoad: 8,
        impact: 9,
        category: 'deep_work',
        preferredHour: 16,
        minChunkMin: 20,
        maxChunkMin: 45,
        tediousness: 0.7,
        setupCost: 0.1,
        urgencyMult: 1.5,
      }),
      row({ id: 'a1', title: 'Analyse', parentQuestId: 'a', estimatedMinutes: 120, createdAt: at(1) }),
      row({ id: 'p', title: 'Piano', estimatedMinutes: 0, actualMinutes: 750, createdAt: at(2) }),
      row({ id: 's', title: 'Stretch', estimatedMinutes: 10, isRecurring: true, preferredHour: 7, createdAt: at(3) }),
    ];
    const tree = exportTree(stored);
    expect(tree[1]).toEqual({ title: 'Piano', trackHours: true, loggedMinutes: 750 });
    const { rows } = rowsOf(tree);
    const want = (r: ExportRow) => ({
      title: r.title,
      estimatedMinutes: r.estimatedMinutes,
      actualMinutes: r.actualMinutes ?? undefined,
      deadline: r.deadline,
      isRecurring: r.isRecurring || undefined,
      preferredHour: r.preferredHour ?? undefined,
    });
    expect(rows.map((r) => ({
      title: r.title,
      estimatedMinutes: r.estimatedMinutes,
      actualMinutes: r['actualMinutes'],
      deadline: r['deadline'],
      isRecurring: r['isRecurring'],
      preferredHour: r['preferredHour'],
    }))).toEqual(stored.map(want));
    expect(rows[1]!.parentQuestId).toBe(rows[0]!.id);
    expect(rows[0]).toMatchObject({ priorityTier: 'HIGH', tags: ['chem'], mentalLoad: 8, impact: 9, category: 'deep_work', minChunkMin: 20, maxChunkMin: 45, tediousness: 0.7, setupCost: 0.1, urgencyMult: 1.5 });
  });
});
