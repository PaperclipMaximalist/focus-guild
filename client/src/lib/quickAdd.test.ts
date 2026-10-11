/**
 * The quick-add grammar is now load-bearing twice over: the Today bar and
 * bulk import both parse with it, so a change here silently changes what an
 * import creates. `now` is injected, so these are timezone-stable.
 */

import { describe, expect, it } from 'vitest';
import { parseQuickAdd, questFields } from './quickAdd';

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

describe('exact deadlines', () => {
  const local = (iso?: string) => {
    const d = new Date(iso!);
    return [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()];
  };

  it('reads a full date, at 17:00 unless a time is given', () => {
    expect(local(parse('Essay by 2026-10-15').deadline)).toEqual([2026, 10, 15, 17, 0]);
    expect(local(parse('Essay by 2026-10-15 9pm').deadline)).toEqual([2026, 10, 15, 21, 0]);
    expect(local(parse('Essay due 2026-10-15T21:30').deadline)).toEqual([2026, 10, 15, 21, 30]);
    expect(local(parse('Essay due:2026-10-15').deadline)).toEqual([2026, 10, 15, 17, 0]);
  });

  it('reads a month and a day either way round, with or without a year', () => {
    expect(local(parse('Essay by oct 15').deadline)).toEqual([2026, 10, 15, 17, 0]);
    expect(local(parse('Essay by 15 October').deadline)).toEqual([2026, 10, 15, 17, 0]);
    expect(local(parse('Essay by Oct 15th, 2027 at 8:30am').deadline)).toEqual([2027, 10, 15, 8, 30]);
  });

  it('takes a date with no year as the next time it comes round', () => {
    // Parsed on 16 September: 3 March has gone this year.
    expect(local(parse('Essay by mar 3').deadline)).toEqual([2027, 3, 3, 17, 0]);
  });

  it('adds a time to the words it already knew', () => {
    expect(local(parse('Essay by fri 9pm').deadline)).toEqual([2026, 9, 18, 21, 0]);
    expect(local(parse('Essay by tomorrow 08:00').deadline)).toEqual([2026, 9, 17, 8, 0]);
    expect(local(parse('Essay by 9pm').deadline)).toEqual([2026, 9, 16, 21, 0]);
    // 9am has gone by noon, so it is tomorrow's.
    expect(local(parse('Essay by 9am').deadline)).toEqual([2026, 9, 17, 9, 0]);
  });

  it('strips the whole phrase from the title and nothing more', () => {
    expect(parse('Essay by 2026-10-15 9pm draft two').title).toBe('Essay draft two');
    expect(parse('Read by fri 3 chapters').title).toBe('Read 3 chapters');
    expect(parse('Stand by 15 pages').title).toBe('Stand by 15 pages');
    expect(parse('Book by Orwell').deadline).toBeUndefined();
  });

  it('does not guess at a date it cannot read', () => {
    const slash = parse('Essay by 10/15');
    expect(slash.deadline).toBeUndefined();
    expect(slash.title).toBe('Essay');
    expect(slash.warnings[0]).toMatch(/10\/15/);

    const never = parse('Essay by feb 30');
    expect(never.deadline).toBeUndefined();
    expect(never.warnings[0]).toMatch(/isn't a real date/);
  });

  it('keeps a date that has passed, and says so', () => {
    const r = parse('Essay by 2026-09-01');
    expect(local(r.deadline)).toEqual([2026, 9, 1, 17, 0]);
    expect(r.warnings[0]).toMatch(/already passed/);
  });
});

describe('settings', () => {
  it('reads every setting on one line, in any order', () => {
    const r = parse(
      'load:hard Finish IA 1h30m impact:9 cat:comms hour:7pm min:20 max:45m tedious:70% setup:10 urgency:1.5x repeat:daily !med #chem by oct 15',
    );
    expect(r.title).toBe('Finish IA');
    expect(r.warnings).toEqual([]);
    expect(r).toMatchObject({
      estimatedMinutes: 90,
      mentalLoad: 8,
      impact: 9,
      category: 'comms',
      preferredHour: 19,
      minChunkMin: 20,
      maxChunkMin: 45,
      tediousness: 0.7,
      setupCost: 0.1,
      urgencyMult: 1.5,
      isRecurring: true,
      priorityTier: 'MED',
      tags: ['chem'],
    });
  });

  it('leaves out what the line did not say, so the defaults apply', () => {
    const fields = questFields(parse('Email the CAS coordinator'));
    expect(fields).toEqual({ title: 'Email the CAS coordinator' });
  });

  it('sends exactly what was typed', () => {
    expect(questFields(parse('Past paper 2h load:4 max:1h'))).toEqual({
      title: 'Past paper',
      estimatedMinutes: 120,
      mentalLoad: 8,
      maxChunkMin: 60,
    });
  });

  it('drops a value it cannot use and says why', () => {
    const r = parse('Essay load:9 impact:high cat:gym hour:25 max:2 urgency:9');
    expect(r.title).toBe('Essay');
    expect(questFields(r)).toEqual({ title: 'Essay' });
    expect(r.warnings).toHaveLength(6);
    expect(r.warnings[0]).toMatch(/load:9/);
  });

  it('refuses a shortest session longer than the longest', () => {
    const r = parse('Essay min:60');
    expect(r.minChunkMin).toBeUndefined();
    expect(r.warnings[0]).toMatch(/60m.*50m/);
    expect(parse('Essay min:60 max:90').minChunkMin).toBe(60);
  });

  it('leaves a word with a colon in the title, and mentions it', () => {
    const typo = parse('Essay laod:4');
    expect(typo.title).toBe('Essay laod:4');
    expect(typo.warnings[0]).toMatch(/laod:4/);
    // Punctuation and links are not settings.
    expect(parse('Chem: revise unit 3').warnings).toEqual([]);
    expect(parse('Read https://example.com/page').warnings).toEqual([]);
    expect(parse('Meeting at 10:30').title).toBe('Meeting at 10:30');
  });

  it('gives each recognised setting a chip', () => {
    const labels = parse('Essay load:hard max:45 repeat:daily').chips.map((c) => c.label);
    expect(labels).toEqual(['daily', 'load hard', 'sessions up to 45m']);
  });
});
