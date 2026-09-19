import { describe, expect, it } from 'vitest';
import { PERMAFILE_TEMPLATE, buildAiBundle, localDayKey, parseGuildReply, renderLogMarkdown } from './chronicle.js';

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

describe('parseGuildReply', () => {
  const ok = (raw: string) => {
    const r = parseGuildReply(raw);
    if ('error' in r) throw new Error(`unexpected error: ${r.error}`);
    return r;
  };

  it('reads answer and actions out of fenced JSON', () => {
    const r = ok('```json\n{"answer":"You stalled on A12.","actions":[{"kind":"drop","label":"Let go of A12","code":"a12"}]}\n```');
    expect(r.answer).toBe('You stalled on A12.');
    expect(r.actions).toEqual([{ kind: 'drop', label: 'Let go of A12', code: 'A12' }]);
  });

  it('keeps plain prose when the model ignores the format', () => {
    const r = ok('Nothing moved this week, and that is fine.');
    expect(r.answer).toBe('Nothing moved this week, and that is fine.');
    expect(r.actions).toEqual([]);
  });

  it('drops actions that could not be carried out', () => {
    const r = ok(
      JSON.stringify({
        answer: 'Here.',
        actions: [
          { kind: 'drop', label: 'no code' },
          { kind: 'park', label: 'no text' },
          { kind: 'nuke', label: 'not a kind', text: 'x' },
          { kind: 'park', label: '', text: 'no label' },
          { kind: 'journal', label: 'Log it', text: 'Felt slow today' },
        ],
      }),
    );
    expect(r.actions).toEqual([{ kind: 'journal', label: 'Log it', text: 'Felt slow today' }]);
  });

  it('never returns more than three actions', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ kind: 'park', label: `p${i}`, text: `t${i}` }));
    expect(ok(JSON.stringify({ answer: 'a', actions: many })).actions).toHaveLength(3);
  });

  it('reports unusable replies instead of inventing an answer', () => {
    expect(parseGuildReply('')).toEqual({ error: 'The AI returned nothing.' });
    expect(parseGuildReply('{"actions":[]}')).toEqual({ error: 'The AI returned no answer.' });
    expect(parseGuildReply('[1,2]')).toHaveProperty('error');
  });
});
