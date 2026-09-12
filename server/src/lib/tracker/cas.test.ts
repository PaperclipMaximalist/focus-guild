import { describe, expect, it } from 'vitest';
import {
  buildCoverageMatrix,
  buildStrandBalance,
  courseworkConflicts,
  evidencedOutcomes,
  type CasItemLike,
} from './cas.js';

const NOW = new Date('2026-09-12T00:00:00.000Z');

function casItem(over: Partial<CasItemLike> & { code: string }): CasItemLike {
  return {
    title: 'Item',
    casStrands: [],
    learningOutcomes: [],
    isCourseworkLinked: false,
    isCasProject: false,
    ...over,
  };
}

describe('evidencedOutcomes', () => {
  it('unions item outcomes with reflection tags', () => {
    const it = casItem({
      code: 'A1',
      learningOutcomes: [1, 2],
      reflections: [{ date: NOW, loTags: [2, 5] }],
    });
    expect(evidencedOutcomes(it)).toEqual([1, 2, 5]);
  });

  it('drops out-of-range outcomes', () => {
    expect(evidencedOutcomes(casItem({ code: 'A1', learningOutcomes: [0, 3, 8] }))).toEqual([3]);
  });
});

describe('buildCoverageMatrix', () => {
  it('is always 7 outcomes by 3 strands', () => {
    const m = buildCoverageMatrix([]);
    expect(m.outcomes).toHaveLength(7);
    expect(m.strands).toHaveLength(3);
    expect(m.cells).toHaveLength(21);
    expect(m.totalCells).toBe(21);
  });

  it('places an item in every cell it evidences', () => {
    const m = buildCoverageMatrix([
      casItem({ code: 'A1', casStrands: ['creativity', 'service'], learningOutcomes: [1, 4] }),
    ]);
    const filled = m.cells.filter((c) => c.codes.length > 0);
    expect(filled).toHaveLength(4); // 2 strands × 2 outcomes
    expect(
      m.cells.find((c) => c.outcome === 4 && c.strand === 'service')!.codes,
    ).toEqual(['A1']);
    expect(
      m.cells.find((c) => c.outcome === 4 && c.strand === 'activity')!.codes,
    ).toEqual([]);
  });

  it('ignores items that are not CAS-tagged', () => {
    const m = buildCoverageMatrix([casItem({ code: 'A1', learningOutcomes: [1, 2, 3] })]);
    expect(m.coveredCount).toBe(0);
  });

  it('counts reflection tags as evidence', () => {
    const m = buildCoverageMatrix([
      casItem({
        code: 'A1',
        casStrands: ['activity'],
        reflections: [{ date: NOW, loTags: [6] }],
      }),
    ]);
    expect(m.cells.find((c) => c.outcome === 6 && c.strand === 'activity')!.codes).toEqual(['A1']);
  });

  it('reports outcomes with no evidence anywhere as gaps', () => {
    const m = buildCoverageMatrix([
      casItem({ code: 'A1', casStrands: ['service'], learningOutcomes: [1, 2] }),
    ]);
    expect(m.uncoveredOutcomes).toEqual([3, 4, 5, 6, 7]);
  });
});

describe('buildStrandBalance', () => {
  it('returns one row per strand even with no items', () => {
    const b = buildStrandBalance([], NOW);
    expect(b.map((r) => r.strand)).toEqual(['creativity', 'activity', 'service']);
    expect(b.every((r) => r.itemCount === 0 && r.daysSinceLastActivity === null)).toBe(true);
  });

  it('measures recency from the newest signal', () => {
    const b = buildStrandBalance(
      [
        casItem({
          code: 'A1',
          casStrands: ['service'],
          casStartDate: '2026-01-01T00:00:00.000Z',
          reflections: [{ date: '2026-09-02T00:00:00.000Z', loTags: [] }],
        }),
      ],
      NOW,
    );
    expect(b.find((r) => r.strand === 'service')!.daysSinceLastActivity).toBe(10);
  });

  it('ignores future-dated stamps when measuring recency', () => {
    const b = buildStrandBalance(
      [
        casItem({
          code: 'A1',
          casStrands: ['activity'],
          casStartDate: '2026-09-05T00:00:00.000Z',
          casEndDate: '2027-01-01T00:00:00.000Z',
        }),
      ],
      NOW,
    );
    expect(b.find((r) => r.strand === 'activity')!.daysSinceLastActivity).toBe(7);
  });

  it('sums duration only for items with both dates', () => {
    const b = buildStrandBalance(
      [
        casItem({
          code: 'A1',
          casStrands: ['creativity'],
          casStartDate: '2026-01-01T00:00:00.000Z',
          casEndDate: '2026-01-11T00:00:00.000Z',
        }),
        casItem({ code: 'A2', casStrands: ['creativity'], casStartDate: '2026-02-01T00:00:00.000Z' }),
      ],
      NOW,
    );
    expect(b.find((r) => r.strand === 'creativity')!.totalDurationDays).toBe(10);
  });

  it('omits hours unless the toggle is on', () => {
    const items = [casItem({ code: 'A1', casStrands: ['service'], hours: 4.25 })];
    expect(buildStrandBalance(items, NOW)[2]!.totalHours).toBeUndefined();
    expect(buildStrandBalance(items, NOW, { showHours: true })[2]!.totalHours).toBe(4.25);
  });

  it('counts an item once per strand it belongs to', () => {
    const b = buildStrandBalance(
      [casItem({ code: 'A1', casStrands: ['creativity', 'activity'] })],
      NOW,
    );
    expect(b.find((r) => r.strand === 'creativity')!.itemCount).toBe(1);
    expect(b.find((r) => r.strand === 'activity')!.itemCount).toBe(1);
    expect(b.find((r) => r.strand === 'service')!.itemCount).toBe(0);
  });
});

describe('courseworkConflicts', () => {
  it('flags items that are both coursework-linked and CAS-tagged', () => {
    const conflicts = courseworkConflicts([
      casItem({ code: 'A1', casStrands: ['service'], isCourseworkLinked: true, title: 'Both' }),
      casItem({ code: 'A2', casStrands: ['service'] }),
      casItem({ code: 'A3', isCourseworkLinked: true }),
    ]);
    expect(conflicts).toEqual([{ code: 'A1', title: 'Both' }]);
  });
});
