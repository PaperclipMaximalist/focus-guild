/**
 * The quick-add grammar is now load-bearing twice over: the Today bar and
 * bulk import both parse with it, so a change here silently changes what an
 * import creates. `now` is injected, so these are timezone-stable.
 */

import { describe, expect, it } from 'vitest';
import { parseQuickAdd } from './quickAdd';

// A Wednesday, local noon.
const NOW = new Date(2026, 8, 16, 12, 0, 0);

const parse = (s: string) => parseQuickAdd(s, NOW);

describe('title', () => {
  it('strips every recognised token out of the title', () => {
    const r = parse('Write report 2h by fri #work !high');
    expect(r.title).toBe('Write report');
  });

  it('keeps a plain line intact', () => {
    const r = parse('Email the CAS coordinator');
    expect(r.title).toBe('Email the CAS coordinator');
    expect(r.estimatedMinutes).toBeUndefined();
    expect(r.deadline).toBeUndefined();
    expect(r.tags).toEqual([]);
  });

  it('leaves nothing behind when the line is only shorthand', () => {
    // Bulk import relies on this to flag a line as unusable instead of
    // creating a quest with an empty title.
    expect(parse('!high').title).toBe('');
    expect(parse('#tag 2h').title).toBe('');
  });
});

describe('duration', () => {
  it('reads hours, fractional hours and minutes', () => {
    expect(parse('Essay 2h').estimatedMinutes).toBe(120);
    expect(parse('Essay 1.5h').estimatedMinutes).toBe(90);
    expect(parse('Essay 90m').estimatedMinutes).toBe(90);
    expect(parse('Essay 45 min').estimatedMinutes).toBe(45);
  });

  it('does not mistake a number in the title for a duration', () => {
    const r = parse('Read chapter 7');
    expect(r.estimatedMinutes).toBeUndefined();
    expect(r.title).toBe('Read chapter 7');
  });
});

describe('deadline', () => {
  const day = (iso?: string) => (iso ? new Date(iso).getDay() : null);

  it('understands tomorrow and named weekdays', () => {
    expect(new Date(parse('Thing by tomorrow').deadline!).getDate()).toBe(17);
    expect(day(parse('Thing by fri').deadline)).toBe(5);
    expect(day(parse('Thing by monday').deadline)).toBe(1);
  });

  it('picks the next occurrence, not one in the past', () => {
    // Parsed on a Wednesday: "by mon" must land after now.
    const d = new Date(parse('Thing by mon').deadline!);
    expect(d.getTime()).toBeGreaterThan(NOW.getTime());
  });
});

describe('priority and tags', () => {
  it('reads both spellings of priority', () => {
    expect(parse('Thing !high').priorityTier).toBe('HIGH');
    expect(parse('Thing !h').priorityTier).toBe('HIGH');
    expect(parse('Thing !low').priorityTier).toBe('LOW');
    expect(parse('Thing').priorityTier).toBeUndefined();
  });

  it('collects repeated tags', () => {
    expect(parse('Thing #chem #ia').tags).toEqual(['chem', 'ia']);
  });
});

describe('preview chips', () => {
  it('describes everything it recognised, so the preview cannot lie', () => {
    const r = parse('Write report 2h by fri #work !high');
    const labels = r.chips.map((c) => c.label);
    expect(labels).toHaveLength(4);
    expect(labels).toContain('2h');
    expect(labels).toContain('high');
    expect(labels).toContain('#work');
  });
});
