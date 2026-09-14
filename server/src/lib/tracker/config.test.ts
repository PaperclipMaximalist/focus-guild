import { describe, expect, it } from 'vitest';
import {
  defaultTrackerConfig,
  getTrackerConfig,
  getTrackerOverrides,
  hasCourseworkConflict,
  isCasTagged,
  nextItemCode,
  bumpHighWater,
  readHighWater,
} from './config.js';

describe('defaults', () => {
  it('caps active items at 5 and requires a next action to activate', () => {
    const c = defaultTrackerConfig();
    expect(c.activeCap).toBe(5);
    expect(c.requiredFields.nextActionForActive).toBe(true);
  });

  it('hides hours by default — IB requires no hour counting', () => {
    expect(defaultTrackerConfig().showHours).toBe(false);
  });
});

describe('getTrackerConfig', () => {
  it('returns defaults when nothing is stored', () => {
    expect(getTrackerConfig({})).toEqual(defaultTrackerConfig());
    expect(getTrackerConfig({ trackerSettings: null })).toEqual(defaultTrackerConfig());
  });

  it('merges a partial override over defaults', () => {
    const c = getTrackerConfig({ trackerSettings: { activeCap: 3 } });
    expect(c.activeCap).toBe(3);
    expect(c.reviewCadenceDays).toBe(defaultTrackerConfig().reviewCadenceDays);
  });

  it('merges status labels field by field', () => {
    const c = getTrackerConfig({ trackerSettings: { statusLabels: { BLOCKED: 'Waiting' } } });
    expect(c.statusLabels.BLOCKED).toBe('Waiting');
    expect(c.statusLabels.ACTIVE).toBe('Active');
  });

  it('ignores an empty code-prefix list rather than leaving codes unassignable', () => {
    expect(getTrackerConfig({ trackerSettings: { codePrefixes: [] } }).codePrefixes).toEqual(['A']);
  });

  it('ignores a non-object settings blob', () => {
    expect(getTrackerConfig({ trackerSettings: ['nope'] })).toEqual(defaultTrackerConfig());
    expect(getTrackerConfig({ trackerSettings: 'nope' })).toEqual(defaultTrackerConfig());
  });

  it('exposes raw overrides for the presets editor', () => {
    expect(getTrackerOverrides({ trackerSettings: { activeCap: 2 } })).toEqual({ activeCap: 2 });
    expect(getTrackerOverrides({})).toEqual({});
  });
});

describe('CAS tagging', () => {
  it('treats any strand as CAS-tagged', () => {
    expect(isCasTagged({ casStrands: [] })).toBe(false);
    expect(isCasTagged({ casStrands: ['service'] })).toBe(true);
  });

  it('flags coursework double-counting only when both are true', () => {
    expect(hasCourseworkConflict({ casStrands: ['activity'], isCourseworkLinked: true })).toBe(true);
    expect(hasCourseworkConflict({ casStrands: [], isCourseworkLinked: true })).toBe(false);
    expect(hasCourseworkConflict({ casStrands: ['activity'], isCourseworkLinked: false })).toBe(false);
  });
});

describe('nextItemCode', () => {
  it('starts at 1 for an unused prefix', () => {
    expect(nextItemCode([], 'A')).toBe('A1');
    expect(nextItemCode(['B4'], 'A')).toBe('A1');
  });

  it('increments past the highest used number, not the count', () => {
    expect(nextItemCode(['A1', 'A2', 'A9'], 'A')).toBe('A10');
  });

  it('never reuses a freed code', () => {
    // A2 deleted; next must still be A4 so old exports never collide.
    expect(nextItemCode(['A1', 'A3'], 'A')).toBe('A4');
  });

  it('keeps prefixes independent', () => {
    expect(nextItemCode(['A7', 'B2'], 'B')).toBe('B3');
  });

  it('is not confused by a prefix that is a substring of another', () => {
    expect(nextItemCode(['AB5', 'A2'], 'A')).toBe('A3');
  });
  it('does not reissue the highest code after it is deleted', () => {
    // A5 was the top item and got deleted; only the high-water mark remembers it.
    expect(nextItemCode(['A1', 'A2'], 'A', { A: 5 })).toBe('A6');
    // Even after every item is gone.
    expect(nextItemCode([], 'A', { A: 5 })).toBe('A6');
  });

  it('ignores a stale high-water mark below live codes', () => {
    expect(nextItemCode(['A9'], 'A', { A: 3 })).toBe('A10');
    expect(nextItemCode([], 'B', { A: 3 })).toBe('B1');
  });
});

describe('bumpHighWater / readHighWater', () => {
  it('raises the mark for the deleted code prefix only', () => {
    expect(bumpHighWater({}, 'A7')).toEqual({ A: 7 });
    expect(bumpHighWater({ A: 9, B: 2 }, 'B4')).toEqual({ A: 9, B: 4 });
  });

  it('never lowers the mark', () => {
    const hw = { A: 9 };
    expect(bumpHighWater(hw, 'A3')).toBe(hw);
  });

  it('handles multi-letter prefixes and ignores malformed codes', () => {
    expect(bumpHighWater({}, 'AB12')).toEqual({ AB: 12 });
    expect(bumpHighWater({ A: 1 }, 'nonsense')).toEqual({ A: 1 });
  });

  it('tolerates junk JSON from the DB', () => {
    expect(readHighWater(null)).toEqual({});
    expect(readHighWater([1, 2])).toEqual({});
    expect(readHighWater({ A: 4, B: 'x' })).toEqual({ A: 4 });
  });
});
