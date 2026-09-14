import { describe, expect, it } from 'vitest';
import { PERMAFILE_TEMPLATE, buildAiBundle, localDayKey, renderLogMarkdown } from './chronicle.js';

// Vancouver in September: getTimezoneOffset() === 420 (UTC-7).
const PDT = 420;

describe('localDayKey', () => {
  it('uses the local day, not the UTC day', () => {
    // 03:00 UTC on the 14th is still 20:00 on the 13th in Vancouver.
    expect(localDayKey(new Date('2026-09-14T03:00:00Z'), PDT)).toBe('2026-09-13');
    expect(localDayKey(new Date('2026-09-14T03:00:00Z'), 0)).toBe('2026-09-14');
  });

  it('handles offsets east of UTC', () => {
    expect(localDayKey(new Date('2026-09-13T22:30:00Z'), -120)).toBe('2026-09-14');
  });
});

describe('renderLogMarkdown', () => {
  const entries = [
    { at: new Date('2026-09-13T16:05:00Z'), kind: 'quest.completed', line: 'Completed quest "EE lit review"' },
    { at: new Date('2026-09-12T18:00:00Z'), kind: 'checkin', line: 'Checked in: energy 3' },
    { at: new Date('2026-09-13T15:00:00Z'), kind: 'journal', line: 'Journal: slow start\nbut fine' },
  ];

  it('groups by local day, newest day first, chronological within a day', () => {
    const md = renderLogMarkdown(entries, PDT);
    expect(md).toBe(
      '## 2026-09-13\n- 08:00 Journal: slow start but fine\n- 09:05 Completed quest "EE lit review"\n\n' +
        '## 2026-09-12\n- 11:00 Checked in: energy 3\n',
    );
  });

  it('does not mutate the input order', () => {
    const copy = [...entries];
    renderLogMarkdown(entries, PDT);
    expect(entries).toEqual(copy);
  });

  it('says so when empty', () => {
    expect(renderLogMarkdown([], PDT)).toMatch(/Nothing logged/);
  });
});

describe('buildAiBundle', () => {
  const bundle = buildAiBundle({
    permafile: PERMAFILE_TEMPLATE,
    trackerMarkdown: '---\nschema: 1\n---\n# Tracker\n## Academics\n- [~] A1 | EE',
    logMarkdown: '## 2026-09-13\n- 09:05 Did a thing\n',
    days: 7,
    generatedAt: new Date('2026-09-13T20:00:00Z'),
  });

  it('keeps the three sections in slowest-to-fastest order', () => {
    const p = bundle.indexOf('## 1. Permafile');
    const t = bundle.indexOf('## 2. Tracker');
    const l = bundle.indexOf('## 3. Chronicle (last 7 days)');
    expect(p).toBeGreaterThan(0);
    expect(t).toBeGreaterThan(p);
    expect(l).toBeGreaterThan(t);
  });

  it('demotes headings inside sections so they nest under the bundle', () => {
    expect(bundle).toContain('\n### Permafile\n');
    expect(bundle).toContain('\n### Tracker\n#### Academics');
    expect(bundle).toContain('#### 2026-09-13');
    expect(bundle).not.toMatch(/^# Permafile/m);
  });

  it('strips the tracker export frontmatter', () => {
    expect(bundle).not.toContain('schema: 1');
  });

  it('marks an empty permafile instead of leaving a blank section', () => {
    const empty = buildAiBundle({ permafile: '', trackerMarkdown: '', logMarkdown: '_Nothing._', days: 1, generatedAt: new Date(0) });
    expect(empty).toContain('## 1. Permafile\n\n_Empty._');
  });
});
