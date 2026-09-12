import { describe, expect, it } from 'vitest';
import {
  defaultTrackerConfig,
  getTrackerConfig,
  getTrackerOverrides,
  hasCourseworkConflict,
  isCasTagged,
  nextItemCode,
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
});
