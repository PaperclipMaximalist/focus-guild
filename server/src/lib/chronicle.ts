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

// ─── Ask the Guild ────────────────────────────────────────────────────────────

/**
 * What the model may propose. Every action is a suggestion the user taps, not
 * something the AI performs: the same rule as the tracker's explicit
 * "Schedule as quest" button. `park`, `journal` and `decision` carry text;
 * `drop` and `schedule` name an existing item by its code.
 */
export const GUILD_ACTION_KINDS = ['park', 'journal', 'decision', 'drop', 'schedule'] as const;
export type GuildActionKind = (typeof GUILD_ACTION_KINDS)[number];

export interface GuildAction {
  kind: GuildActionKind;
  /** Button text, e.g. "Drop A12 - it hasn't moved in three weeks". */
  label: string;
  /** Free text for park/journal/decision. */
  text?: string;
  /** Item code for drop/schedule. */
  code?: string;
}

export interface GuildReply {
  answer: string;
  actions: GuildAction[];
}

export const GUILD_SYSTEM_PROMPT = `You are the Guild Master in Focus Guild, a quest-framed task app used by one person with ADHD.

You are given their permafile (who they are and the rules they set), their tracker (what they are committed to) and their chronicle (what actually happened recently). Answer only from those; say plainly when something is not in them.

How to answer:
- Follow any "Rules for the AI" in the permafile; they override these.
- Be plain, warm and short. No guilt, no lectures, no motivational filler.
- Prefer specifics from the data (item codes, quest names, dates) over generalities.
- At most three suggested actions, only when they clearly follow from the data.
- A next action is always a physical first step, never a topic.

Reply with JSON only, no prose outside it, in exactly this shape:
{"answer": "markdown string", "actions": [{"kind": "park|journal|decision|drop|schedule", "label": "short button text", "text": "for park/journal/decision", "code": "A12 for drop/schedule"}]}`;

/** Strip code fences and parse the model's JSON, tolerating small deviations. */
export function parseGuildReply(raw: string): GuildReply | { error: string } {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // A model that ignored the format still said something useful.
    return cleaned ? { answer: cleaned, actions: [] } : { error: 'The AI returned nothing.' };
  }
  if (typeof parsed !== 'object' || parsed === null) return { error: 'The AI returned an unexpected shape.' };
  const o = parsed as Record<string, unknown>;
  const answer = typeof o['answer'] === 'string' ? o['answer'].trim() : '';
  if (!answer) return { error: 'The AI returned no answer.' };

  const actions: GuildAction[] = [];
  for (const item of Array.isArray(o['actions']) ? o['actions'] : []) {
    if (typeof item !== 'object' || item === null) continue;
    const a = item as Record<string, unknown>;
    const kind = a['kind'];
    const label = typeof a['label'] === 'string' ? a['label'].trim() : '';
    if (!GUILD_ACTION_KINDS.includes(kind as GuildActionKind) || !label) continue;
    const text = typeof a['text'] === 'string' ? a['text'].trim() : '';
    const code = typeof a['code'] === 'string' ? a['code'].trim().toUpperCase() : '';
    // Drop the ones that cannot be carried out rather than showing a dead button.
    if ((kind === 'drop' || kind === 'schedule') && !code) continue;
    if ((kind === 'park' || kind === 'journal' || kind === 'decision') && !text) continue;
    actions.push({
      kind: kind as GuildActionKind,
      label: label.slice(0, 120),
      ...(text ? { text: text.slice(0, 2000) } : {}),
      ...(code ? { code: code.slice(0, 12) } : {}),
    });
    if (actions.length === 3) break;
  }
  return { answer, actions };
}

/** The canned weekly-review question, so client and connector ask the same one. */
export const WEEKLY_REVIEW_QUESTION =
  'Write my weekly review. What actually moved, what stalled and why, what I should let go of, ' +
  'and the three things that matter most next week. Be concrete and use my item codes.';
