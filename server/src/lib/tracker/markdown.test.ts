import { describe, expect, it } from 'vitest';
import {
  diffImport,
  MD_SCHEMA_VERSION,
  parse,
  serialize,
  type MdDoc,
  type MdItem,
} from './markdown.js';

const AT = new Date('2026-09-12T04:00:00.000Z');

function item(over: Partial<MdItem> & { code: string }): MdItem {
  return { title: 'Untitled', status: 'TODO', ...over };
}

function doc(items: MdItem[], over: Partial<MdDoc> = {}): MdDoc {
  return { items, parkingLot: [], decisions: [], ...over };
}

describe('serialize', () => {
  it('writes frontmatter with schema, tier, timestamp and counts', () => {
    const md = serialize(doc([item({ code: 'A1', status: 'ACTIVE', nextAction: 'Open the file' })]), {
      tier: 'working',
      generatedAt: AT,
    });
    expect(md).toContain(`schema: ${MD_SCHEMA_VERSION}`);
    expect(md).toContain('tier: working');
    expect(md).toContain('generated: 2026-09-12T04:00:00.000Z');
    expect(md).toContain('items: 1');
    expect(md).toContain('active: 1');
  });

  it('uses the documented status marks', () => {
    const md = serialize(
      doc([
        item({ code: 'A1', status: 'TODO' }),
        item({ code: 'A2', status: 'ACTIVE', nextAction: 'x' }),
        item({ code: 'A3', status: 'BLOCKED' }),
        item({ code: 'A4', status: 'DONE' }),
        item({ code: 'A5', status: 'DROPPED' }),
      ]),
      { tier: 'archive', generatedAt: AT },
    );
    expect(md).toContain('- [ ] A1');
    expect(md).toContain('- [~] A2');
    expect(md).toContain('- [!] A3');
    expect(md).toContain('- [x] A4');
    expect(md).toContain('- [-] A5');
  });

  it('excludes done and dropped from every tier except archive', () => {
    const items = [
      item({ code: 'A1', status: 'ACTIVE', nextAction: 'go' }),
      item({ code: 'A2', status: 'DONE' }),
      item({ code: 'A3', status: 'DROPPED' }),
    ];
    for (const tier of ['working', 'full'] as const) {
      const md = serialize(doc(items), { tier, generatedAt: AT });
      expect(md).not.toContain('A2');
      expect(md).not.toContain('A3');
    }
    const archive = serialize(doc(items), { tier: 'archive', generatedAt: AT });
    expect(archive).toContain('A2');
    expect(archive).toContain('A3');
  });

  it('shows next action for active items', () => {
    const md = serialize(
      doc([item({ code: 'A7', status: 'ACTIVE', title: 'Ship it', nextAction: 'Email Dana' })]),
      { tier: 'compact', generatedAt: AT },
    );
    expect(md).toContain('next: Email Dana');
  });

  it('keeps compact under its budget by trimming completions', () => {
    const items: MdItem[] = [
      item({ code: 'A1', status: 'ACTIVE', nextAction: 'Do the thing' }),
      ...Array.from({ length: 40 }, (_, n) =>
        item({
          code: `B${n + 1}`,
          status: 'DONE',
          title: `A fairly long completed item title number ${n + 1}`,
          completedAt: `2026-09-${String((n % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
        }),
      ),
    ];
    const md = serialize(doc(items), { tier: 'compact', generatedAt: AT });
    expect(md.length).toBeLessThanOrEqual(500);
    expect(md).toContain('A1');
  });

  it('only includes notes at full and archive', () => {
    const items = [item({ code: 'A1', notes: 'a private note' })];
    expect(serialize(doc(items), { tier: 'working', generatedAt: AT })).not.toContain('private note');
    expect(serialize(doc(items), { tier: 'full', generatedAt: AT })).toContain('notes: a private note');
  });

  it('only includes reflections at archive', () => {
    const items = [
      item({
        code: 'A1',
        casStrands: ['service'],
        reflections: [{ text: 'Learned a lot', date: '2026-08-01T00:00:00.000Z', loTags: [1, 4] }],
      }),
    ];
    expect(serialize(doc(items), { tier: 'full', generatedAt: AT })).not.toContain('Learned a lot');
    const archive = serialize(doc(items), { tier: 'archive', generatedAt: AT });
    expect(archive).toContain('reflect: 2026-08-01 | lo: 1,4 | Learned a lot');
  });

  it('groups unfinished items by domain', () => {
    const md = serialize(
      doc([
        item({ code: 'A1', domain: 'Zoology' }),
        item({ code: 'A2', domain: 'Archery' }),
      ]),
      { tier: 'working', generatedAt: AT },
    );
    expect(md.indexOf('## Archery')).toBeLessThan(md.indexOf('## Zoology'));
  });

  it('hides hours unless the toggle is on', () => {
    const items = [item({ code: 'A1', hours: 12 })];
    expect(serialize(doc(items), { tier: 'full', generatedAt: AT })).not.toContain('hours:');
    expect(serialize(doc(items), { tier: 'full', generatedAt: AT, showHours: true })).toContain('hours: 12');
  });

  it('includes decisions and parking lot at full', () => {
    const md = serialize(
      doc([], {
        decisions: [{ text: 'Dropped the podcast', decidedAt: '2026-07-04T00:00:00.000Z' }],
        parkingLot: [{ text: 'maybe learn welding' }],
      }),
      { tier: 'full', generatedAt: AT },
    );
    expect(md).toContain('- 2026-07-04 — Dropped the podcast');
    expect(md).toContain('- maybe learn welding');
  });

  it('restricts a delta export to items changed since a date', () => {
    const md = serialize(
      doc([
        item({ code: 'A1', updatedAt: '2026-09-10T00:00:00.000Z' }),
        item({ code: 'A2', updatedAt: '2026-06-01T00:00:00.000Z' }),
      ]),
      { tier: 'working', generatedAt: AT, since: new Date('2026-09-01T00:00:00.000Z') },
    );
    expect(md).toContain('A1');
    expect(md).not.toContain('A2');
    expect(md).toContain('since: 2026-09-01T00:00:00.000Z');
  });
});

describe('parse', () => {
  it('reads frontmatter', () => {
    const p = parse(`---\nschema: 1\ntier: full\ngenerated: 2026-09-12T04:00:00.000Z\n---\n`);
    expect(p.schema).toBe(1);
    expect(p.tier).toBe('full');
    expect(p.generated).toBe('2026-09-12T04:00:00.000Z');
  });

  it('parses an item line with every field', () => {
    const p = parse(
      '- [~] A29 | Build the kiln | next: Buy firebrick | domain: CAS | due: 2026-10-01 ' +
        '| cas: creativity,service | lo: 1,3,5 | from: 2026-09-01 | to: 2026-12-01 | project | coursework | hours: 4',
    );
    expect(p.items).toHaveLength(1);
    const it = p.items[0]!;
    expect(it).toMatchObject({
      code: 'A29',
      title: 'Build the kiln',
      status: 'ACTIVE',
      nextAction: 'Buy firebrick',
      domain: 'CAS',
      dueDate: '2026-10-01',
      isCasProject: true,
      isCourseworkLinked: true,
      hours: 4,
    });
    expect(it.casStrands).toEqual(['creativity', 'service']);
    expect(it.learningOutcomes).toEqual([1, 3, 5]);
  });

  it('recognises item lines regardless of section', () => {
    const p = parse('## Something Hand Written\n\n- [ ] A4 | Loose item\n');
    expect(p.items.map((i) => i.code)).toEqual(['A4']);
  });

  it('attaches notes and reflections to the preceding item', () => {
    const p = parse(
      ['- [ ] A1 | Thing', '  notes: some note', '  reflect: 2026-08-01 | lo: 2 | went well'].join('\n'),
    );
    const it = p.items[0]!;
    expect(it.notes).toBe('some note');
    expect(it.reflections?.[0]).toMatchObject({ date: '2026-08-01', text: 'went well', loTags: [2] });
  });

  it('classifies parking lot and decision bullets by heading', () => {
    const p = parse(
      ['## Parking lot', '- learn welding', '', '## Decisions', '- 2026-07-04 — dropped podcast'].join('\n'),
    );
    expect(p.parkingLot).toEqual(['learn welding']);
    expect(p.decisions).toEqual([{ decidedAt: '2026-07-04', text: 'dropped podcast' }]);
  });

  it('warns on an unknown status mark instead of guessing', () => {
    const p = parse('- [?] A1 | Thing');
    expect(p.items).toHaveLength(0);
    expect(p.warnings.join()).toMatch(/unknown status mark/i);
  });

  it('ignores unknown keys so newer exports stay importable', () => {
    const p = parse('- [ ] A1 | Thing | somethingNew: 42 | domain: X');
    expect(p.items[0]).toMatchObject({ code: 'A1', domain: 'X' });
  });

  it('drops out-of-range learning outcomes and unknown strands', () => {
    const p = parse('- [ ] A1 | Thing | lo: 0,3,9 | cas: creativity,cooking');
    expect(p.items[0]!.learningOutcomes).toEqual([3]);
    expect(p.items[0]!.casStrands).toEqual(['creativity']);
  });
});

describe('round trip', () => {
  it('survives export → import unchanged', () => {
    const items: MdItem[] = [
      item({
        code: 'A1',
        title: 'Pipe | in title',
        status: 'ACTIVE',
        nextAction: 'Call the studio',
        domain: 'CAS',
        dueDate: '2026-10-01',
        casStrands: ['creativity', 'service'],
        learningOutcomes: [1, 5],
        isCasProject: true,
        notes: 'multi word note',
        hours: 3,
      }),
      item({ code: 'A2', title: 'Plain todo', status: 'TODO', domain: 'Academics' }),
      item({ code: 'A3', title: 'Waiting on reply', status: 'BLOCKED' }),
    ];

    const md = serialize(doc(items), { tier: 'full', generatedAt: AT, showHours: true });
    const back = parse(md);

    expect(back.items).toHaveLength(3);
    const a1 = back.items.find((i) => i.code === 'A1')!;
    expect(a1.title).toBe('Pipe | in title');
    expect(a1.status).toBe('ACTIVE');
    expect(a1.nextAction).toBe('Call the studio');
    expect(a1.domain).toBe('CAS');
    expect(a1.dueDate).toBe('2026-10-01');
    expect(a1.casStrands).toEqual(['creativity', 'service']);
    expect(a1.learningOutcomes).toEqual([1, 5]);
    expect(a1.isCasProject).toBe(true);
    expect(a1.notes).toBe('multi word note');
    expect(a1.hours).toBe(3);
    expect(back.items.find((i) => i.code === 'A3')!.status).toBe('BLOCKED');
  });

  it('is stable across a second export', () => {
    const items = [
      item({ code: 'A1', title: 'One', status: 'ACTIVE', nextAction: 'Step', domain: 'D' }),
      item({ code: 'A2', title: 'Two', domain: 'D' }),
    ];
    const first = serialize(doc(items), { tier: 'full', generatedAt: AT });
    const second = serialize(doc(parse(first).items), { tier: 'full', generatedAt: AT });
    expect(second).toBe(first);
  });
});

describe('diffImport', () => {
  const existing: MdItem[] = [
    item({ code: 'A1', title: 'Old title', status: 'TODO', domain: 'D' }),
    item({ code: 'A2', title: 'Untouched', status: 'TODO' }),
  ];

  it('creates items whose codes are new', () => {
    const d = diffImport(existing, parse('- [ ] A9 | Brand new'));
    expect(d.creates.map((i) => i.code)).toEqual(['A9']);
  });

  it('updates on code match rather than duplicating', () => {
    const d = diffImport(existing, parse('- [~] A1 | New title | next: Step'));
    expect(d.creates).toHaveLength(0);
    expect(d.updates).toHaveLength(1);
    const fields = d.updates[0]!.changes.map((c) => c.field).sort();
    expect(fields).toContain('title');
    expect(fields).toContain('status');
    expect(fields).toContain('nextAction');
  });

  it('reports identical items as unchanged', () => {
    const d = diffImport(existing, parse('- [ ] A1 | Old title | domain: D'));
    expect(d.unchanged).toEqual(['A1']);
    expect(d.updates).toHaveLength(0);
  });

  it('never deletes items missing from the import', () => {
    const d = diffImport(existing, parse('- [ ] A1 | Old title | domain: D'));
    expect(d.untouched).toEqual(['A2']);
  });

  it('ignores a duplicate code in the import and warns', () => {
    const d = diffImport(existing, parse('- [ ] A9 | First\n- [ ] A9 | Second'));
    expect(d.creates).toHaveLength(1);
    expect(d.creates[0]!.title).toBe('First');
    expect(d.warnings.join()).toMatch(/duplicate code a9/i);
  });

  it('treats a field absent from the import as not asserted', () => {
    // No `domain:` on the line, so the existing domain must not be cleared.
    const d = diffImport(existing, parse('- [ ] A1 | Old title'));
    expect(d.updates).toHaveLength(0);
  });
});
