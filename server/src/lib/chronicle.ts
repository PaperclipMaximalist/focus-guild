/**
 * Chronicle + permafile: the pure parts.
 *
 * Three layers of truth, each changing at a different speed, which together
 * give an AI enough context to answer "why did I fall behind this week?":
 *   - permafile: who I am, what matters, the rules (changes monthly)
 *   - tracker:   what I'm committed to (weekly; the existing markdown export)
 *   - chronicle: what actually happened (constantly)
 *
 * Nothing here touches the DB or the clock; callers pass times in, so it
 * unit-tests like the tracker markdown module.
 */

export interface LogEntry {
  at: Date;
  kind: string;
  line: string;
}

/** Starter text for a user who has never saved a permafile. */
export const PERMAFILE_TEMPLATE = `# Permafile

The slow-changing truth about me. An AI reads this before anything else.

## Who I am
- Year / program:
- How my ADHD shows up (time blindness, starting tasks, ...):
- When I work best:

## This season
- What this term is about:
- What a good week looks like:

## Standing commitments
- (weekly things that aren't in a calendar)

## Rules for me
- Three fronts at most. Let go rather than carry.
- Every active item has a physical first step.

## Rules for the AI
- No guilt, no lectures. Plain and kind.
- Suggest at most three actions, each with a physical first step.
- Ask before assuming something is dropped.
`;

/**
 * Local calendar day for a UTC instant, given a `getTimezoneOffset()` value
 * (minutes, positive west of UTC). Matches how the scheduler receives tz.
 */
export function localDayKey(at: Date, tzOffsetMin: number): string {
  const local = new Date(at.getTime() - tzOffsetMin * 60_000);
  return local.toISOString().slice(0, 10);
}

function localTime(at: Date, tzOffsetMin: number): string {
  return new Date(at.getTime() - tzOffsetMin * 60_000).toISOString().slice(11, 16);
}

/**
 * Render entries as markdown grouped by local day, newest day first and
 * chronological within a day, one bullet per event.
 */
export function renderLogMarkdown(entries: LogEntry[], tzOffsetMin: number): string {
  if (entries.length === 0) return '_Nothing logged in this range._\n';
  const byDay = new Map<string, LogEntry[]>();
  for (const e of [...entries].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    const key = localDayKey(e.at, tzOffsetMin);
    const list = byDay.get(key) ?? [];
    list.push(e);
    byDay.set(key, list);
  }
  const days = [...byDay.keys()].sort().reverse();
  return days
    .map((day) => {
      const lines = byDay.get(day)!.map((e) => `- ${localTime(e.at, tzOffsetMin)} ${e.line.replace(/\s*\n\s*/g, ' ')}`);
      return `## ${day}\n${lines.join('\n')}`;
    })
    .join('\n\n')
    .concat('\n');
}

export interface BundleInput {
  permafile: string;
  trackerMarkdown: string;
  logMarkdown: string;
  days: number;
  generatedAt: Date;
}

/**
 * One paste-able document for an AI: instructions, then the three layers from
 * slowest- to fastest-changing. Headings are demoted inside each section so the
 * bundle's own structure stays unambiguous.
 */
export function buildAiBundle(input: BundleInput): string {
  const demote = (md: string) => md.trim().replace(/^(#{1,5}) /gm, '$1## ');
  const stripFrontmatter = (md: string) => md.replace(/^---\n[\s\S]*?\n---\n/, '');
  return [
    '# Focus Guild context bundle',
    '',
    `Generated ${input.generatedAt.toISOString()}. Three sections: my permafile (who I am and the rules),` +
      ` my tracker (what I am committed to), and my chronicle for the last ${input.days} days (what actually happened).` +
      ' Read all three before answering. Follow the "Rules for the AI" in the permafile.',
    '',
    '## 1. Permafile',
    '',
    demote(input.permafile) || '_Empty._',
    '',
    '## 2. Tracker',
    '',
    demote(stripFrontmatter(input.trackerMarkdown)) || '_Empty._',
    '',
    `## 3. Chronicle (last ${input.days} days)`,
    '',
    demote(input.logMarkdown),
    '',
  ].join('\n');
}
