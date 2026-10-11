import { describe, expect, it } from 'vitest';
import { MANIFEST_EXAMPLE, MANIFEST_HEADER, MAX_IMPORT, manifestGuide, parseManifest, toManifest, type ManifestQuest } from './manifest';

// A Wednesday, mid-morning, local time.
const NOW = new Date(2026, 9, 7, 10, 0, 0);
const parse = (text: string) => parseManifest(text, NOW);
const local = (y: number, mo: number, d: number, h = 17, mi = 0) => new Date(y, mo - 1, d, h, mi).toISOString();

describe('lines', () => {
  it('reads one quest per line in the quick-add grammar', () => {
    const r = parse('Finish chem IA 2h by 2026-10-15 21:00 #chem !high\nEmail the coordinator');
    expect(r.quests).toEqual([
      { title: 'Finish chem IA', estimatedMinutes: 120, deadline: local(2026, 10, 15, 21), priorityTier: 'HIGH', tags: ['chem'] },
      { title: 'Email the coordinator' },
    ]);
    expect(r.counts).toEqual({ quests: 2, steps: 0, hourLogs: 0, routines: 0, total: 2 });
  });

  it('ignores the header, comments, blank lines, list markers and code fences', () => {
    const r = parse(['```text', MANIFEST_HEADER, '', '// school', '- Read chapter 4', '2. Maths past paper 1h', '* [ ] Tidy desk', '```'].join('\n'));
    expect(r.version).toBe(1);
    expect(r.quests.map((q) => q.title)).toEqual(['Read chapter 4', 'Maths past paper', 'Tidy desk']);
    expect(r.rows.map((x) => x.line)).toEqual([5, 6, 7]);
    expect(r.notes).toEqual([]);
  });

  it('reads only the code block of a reply that has one, and says what it passed over', () => {
    const reply = ['Here is your manifest:', '', '```', MANIFEST_HEADER, 'Read chapter 4 45m', '  Take notes', '```', '', 'Let me know if you want changes!', '```', 'Not this block', '```'];
    const r = parse(reply.join('\n'));
    expect(r.version).toBe(1);
    expect(r.quests).toEqual([{ title: 'Read chapter 4', estimatedMinutes: 45, steps: [{ title: 'Take notes' }] }]);
    expect(r.notes).toEqual(['3 lines outside the code block were not read.']);
  });

  it('starts at the header when a reply has one but no code block', () => {
    const r = parse(['Sure, here it is.', MANIFEST_HEADER, 'Read chapter 4'].join('\n'));
    expect(r.quests).toEqual([{ title: 'Read chapter 4' }]);
    expect(r.notes).toEqual(['1 line outside the manifest (above its first line) was not read.']);
  });

  it('reads every line of a plain list with no header', () => {
    const r = parse('Buy milk\nCall the dentist');
    expect(r.version).toBeNull();
    expect(r.quests).toHaveLength(2);
    expect(r.notes).toEqual([]);
  });

  it('leaves out a line that is already ticked, and says so', () => {
    const r = parse('- [x] Hand in the form\n- [ ] Book the room');
    expect(r.quests.map((q) => q.title)).toEqual(['Book the room']);
    expect(r.rows[0]!.skipped).toMatch(/ticked/);
  });

  it('skips a line with nothing left for a title', () => {
    const r = parse('2h #chem\nReal one');
    expect(r.rows[0]!.quest).toBeNull();
    expect(r.rows[0]!.skipped).toMatch(/title/);
    expect(r.quests).toEqual([{ title: 'Real one' }]);
  });

  it('says so when the manifest is from a newer version', () => {
    const r = parse('focus-guild manifest 2\nA quest');
    expect(r.version).toBe(2);
    expect(r.notes[0]).toMatch(/version 2/);
    expect(r.quests).toHaveLength(1);
  });

  it('carries a warning from the line grammar through to the row', () => {
    const r = parse('Essay load:11');
    expect(r.rows[0]!.warnings[0]).toMatch(/load:11/);
    expect(r.quests).toEqual([{ title: 'Essay' }]);
  });
});

describe('steps', () => {
  it('makes an indented line a step of the quest above it', () => {
    const r = parse(['Essay 4h', '  Outline 30m', '    Thesis sentence 10m', '  Draft 2h', 'Other'].join('\n'));
    expect(r.quests).toEqual([
      {
        title: 'Essay',
        estimatedMinutes: 240,
        steps: [
          { title: 'Outline', estimatedMinutes: 30, steps: [{ title: 'Thesis sentence', estimatedMinutes: 10 }] },
          { title: 'Draft', estimatedMinutes: 120 },
        ],
      },
      { title: 'Other' },
    ]);
    expect(r.rows.map((x) => x.tier)).toEqual([1, 2, 3, 2, 1]);
    expect(r.counts).toMatchObject({ quests: 2, steps: 3, total: 5 });
  });

  it('goes by more or less indent, whatever its width, tabs and nested bullets included', () => {
    const r = parse(['- Trip', '\t- Book train', '\t\t- Compare times', '    - Pack', 'Next'].join('\n'));
    expect(r.rows.map((x) => [x.raw, x.tier])).toEqual([['Trip', 1], ['Book train', 2], ['Compare times', 3], ['Pack', 2], ['Next', 1]]);
  });

  it('keeps a fourth tier at the third and says so', () => {
    const r = parse(['A', ' B', '  C', '   D', '    E'].join('\n'));
    expect(r.rows.map((x) => x.tier)).toEqual([1, 2, 3, 3, 3]);
    expect(r.rows[3]!.warnings[0]).toMatch(/3 tiers/);
    expect(r.quests[0]!.steps![0]!.steps!.map((q) => q.title)).toEqual(['C', 'D', 'E']);
  });

  it('lets only a main quest be an hour log or a round', () => {
    const r = parse(['Essay', '  Read track:hours', '  Stretch repeat:daily'].join('\n'));
    expect(r.quests[0]!.steps).toEqual([{ title: 'Read' }, { title: 'Stretch' }]);
    expect(r.rows[1]!.warnings[0]).toMatch(/main quest/);
    expect(r.rows[1]!.chips.map((c) => c.label)).not.toContain('hour log');
    expect(r.rows[2]!.warnings[0]).toMatch(/main quest/);
    expect(r.rows[2]!.chips.map((c) => c.label)).not.toContain('daily');
  });

  it('leaves out a line set under an hour log or a round, and everything under that', () => {
    const r = parse(['Piano track:hours', '  Scales', '    C major', 'Stretch repeat:daily', '  Hamstrings', 'After'].join('\n'));
    expect(r.quests).toEqual([{ title: 'Piano', trackHours: true }, { title: 'Stretch', isRecurring: true }, { title: 'After' }]);
    expect(r.rows.filter((x) => x.skipped).map((x) => x.raw)).toEqual(['Scales', 'C major', 'Hamstrings']);
    expect(r.rows[1]!.skipped).toMatch(/hour log/);
    expect(r.rows[4]!.skipped).toMatch(/daily round/);
    expect(r.counts).toEqual({ quests: 1, steps: 0, hourLogs: 1, routines: 1, total: 3 });
  });

  it('notes a page that is over the cap', () => {
    const r = parse(Array.from({ length: MAX_IMPORT + 1 }, (_, i) => `Quest ${i}`).join('\n'));
    expect(r.notes[0]).toMatch(/at most 200/);
  });
});

describe('hour logs and time already spent', () => {
  it('reads track:hours as a quest with no estimate', () => {
    const r = parse('Piano practice track:hours #music logged:12h30m');
    expect(r.quests).toEqual([{ title: 'Piano practice', tags: ['music'], trackHours: true, loggedMinutes: 750 }]);
    expect(r.rows[0]!.chips.map((c) => c.label)).toEqual(['hour log', '#music', '12h30m logged']);
  });

  it('drops a duration from an hour log and says so', () => {
    const r = parse('Reading 2h track:hours');
    expect(r.quests).toEqual([{ title: 'Reading', trackHours: true }]);
    expect(r.rows[0]!.warnings[0]).toMatch(/no estimate/);
    expect(r.rows[0]!.chips.map((c) => c.label)).toEqual(['hour log']);
  });

  it('reads time already spent on an ordinary quest', () => {
    expect(parse('Report 4h logged:90m').quests).toEqual([{ title: 'Report', estimatedMinutes: 240, loggedMinutes: 90 }]);
    expect(parse('Report logged:1.5h').quests[0]!.loggedMinutes).toBe(90);
  });

  it('does not guess at a value it cannot read', () => {
    const r = parse('Report track:steps logged:lots');
    expect(r.quests).toEqual([{ title: 'Report' }]);
    expect(r.rows[0]!.warnings).toHaveLength(2);
  });
});

describe('quoted titles', () => {
  it('takes a quoted title as written', () => {
    const r = parse('"Read 2h of lectures by fri #1" 45m !high');
    expect(r.quests).toEqual([{ title: 'Read 2h of lectures by fri #1', estimatedMinutes: 45, priorityTier: 'HIGH' }]);
    expect(r.rows[0]!.warnings).toEqual([]);
  });

  it('understands an escaped quote inside one', () => {
    expect(parse('"Reply to \\"the\\" email" 10m').quests[0]!.title).toBe('Reply to "the" email');
  });

  it('flags words it could not place after the title', () => {
    const r = parse('"Essay" quickly 1h');
    expect(r.quests).toEqual([{ title: 'Essay', estimatedMinutes: 60 }]);
    expect(r.rows[0]!.warnings[0]).toMatch(/quickly/);
  });

  it('treats a lone quote mark as part of an ordinary title', () => {
    expect(parse('"Unfinished thought 1h').quests).toEqual([{ title: '"Unfinished thought', estimatedMinutes: 60 }]);
  });
});

describe('writing a manifest', () => {
  const tree: ManifestQuest[] = [
    {
      title: 'Finish chem IA',
      estimatedMinutes: 360,
      loggedMinutes: 45,
      deadline: local(2026, 10, 15, 21),
      priorityTier: 'HIGH',
      tags: ['chem', 'ia-2'],
      mentalLoad: 8,
      impact: 9,
      category: 'deep_work',
      preferredHour: 16,
      minChunkMin: 20,
      maxChunkMin: 45,
      tediousness: 0.7,
      setupCost: 0.1,
      urgencyMult: 1.5,
      steps: [
        { title: 'Analyse the data', estimatedMinutes: 120, steps: [{ title: 'Plot the graphs', estimatedMinutes: 45 }] },
        { title: 'Write the evaluation', estimatedMinutes: 90, deadline: local(2026, 10, 14) },
      ],
    },
    { title: 'Piano practice', trackHours: true, loggedMinutes: 750, tags: ['music'] },
    { title: 'Stretch', estimatedMinutes: 10, isRecurring: true, preferredHour: 7, priorityTier: 'LOW' },
    { title: 'Plain' },
  ];

  it('writes one line per quest, steps indented two spaces', () => {
    expect(toManifest(tree, NOW)).toBe(
      [
        'focus-guild manifest 1',
        'Finish chem IA 6h logged:45m by 2026-10-15 21:00 !high #chem #ia-2 load:4 impact:9 cat:deep hour:16 min:20 max:45 tedious:70 setup:10 urgency:1.5',
        '  Analyse the data 2h',
        '    Plot the graphs 45m',
        '  Write the evaluation 1h30m by 2026-10-14',
        'Piano practice track:hours logged:12h30m #music',
        'Stretch 10m !low hour:7 repeat:daily',
        'Plain',
        '',
      ].join('\n'),
    );
  });

  it('reads back what it wrote as the same tree', () => {
    const back = parse(toManifest(tree, NOW));
    expect(back.quests).toEqual(tree);
    expect(back.rows.every((r) => r.warnings.length === 0 && !r.skipped)).toBe(true);
  });

  it('quotes a title only when it would not survive bare', () => {
    const awkward = [
      'Read 2h of lectures',
      'Meet by fri about the trip',
      'Fix issue #42',
      'Reply re:invoice',
      '- dash first',
      '// not a comment',
      'focus-guild manifest 1',
      'Say "hello" twice 10m',
      'Back\\slash 5h',
      'Double  space',
      '[x] looks ticked',
      '3. looks numbered',
      'Shout !high',
      'Log track:hours later',
    ];
    const fine = ['Plain title', 'Reply re: invoice', 'Stand by Sam', 'Pay 10/15 invoice', 'Visit https://example.com/a', "Don't quote me"];
    const text = toManifest([...awkward, ...fine].map((title) => ({ title, estimatedMinutes: 25 })), NOW);
    const lines = text.trim().split('\n').slice(1);
    expect(lines.slice(0, awkward.length).every((l) => l.startsWith('"'))).toBe(true);
    expect(lines.slice(awkward.length)).toEqual(fine.map((t) => `${t} 25m`));
    const back = parse(text);
    expect(back.quests).toEqual([...awkward, ...fine].map((title) => ({ title, estimatedMinutes: 25 })));
    expect(back.rows.every((r) => r.warnings.length === 0)).toBe(true);
  });

  it('gives a long shortest session a longest to match, so the line is not refused', () => {
    const text = toManifest([{ title: 'Refactor', minChunkMin: 60 }, { title: 'Short', minChunkMin: 20 }], NOW);
    expect(text).toBe('focus-guild manifest 1\nRefactor min:60 max:60\nShort min:20\n');
    const back = parse(text);
    expect(back.quests).toEqual([{ title: 'Refactor', minChunkMin: 60, maxChunkMin: 60 }, { title: 'Short', minChunkMin: 20 }]);
    expect(back.rows.every((r) => r.warnings.length === 0)).toBe(true);
  });

  it('stops at the third tier', () => {
    const deep = [{ title: 'a', steps: [{ title: 'b', steps: [{ title: 'c', steps: [{ title: 'd' }] }] }] }];
    expect(toManifest(deep, NOW)).toBe('focus-guild manifest 1\na\n  b\n    c\n');
  });
});

describe('the guide and the example', () => {
  it('ships an example that imports clean', () => {
    const r = parse(MANIFEST_EXAMPLE);
    expect(r.rows.every((x) => x.warnings.length === 0 && !x.skipped)).toBe(true);
    expect(r.counts).toEqual({ quests: 2, steps: 3, hourLogs: 1, routines: 1, total: 7 });
  });

  it('gives a guide with the date, every setting and an example that imports clean', () => {
    const guide = manifestGuide(NOW);
    expect(guide).toContain('Today is 2026-10-07');
    expect(guide).toContain('track:hours');
    expect(guide).toContain('load:4');
    const example = guide.slice(guide.indexOf('Example\n') + 'Example\n'.length);
    const r = parse(example);
    expect(r.version).toBe(1);
    expect(r.rows.every((x) => x.warnings.length === 0 && !x.skipped)).toBe(true);
  });
});
