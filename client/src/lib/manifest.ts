/**
 * The quest manifest: many quests as plain text, in and out.
 *
 *   focus-guild manifest 1
 *   Finish chem IA 6h by 2026-10-15 21:00 #chem !high load:hard
 *     Analyse the data 2h
 *       Plot the graphs 45m
 *     Write the evaluation 1h30m
 *   Piano practice track:hours #music logged:12h30m
 *   Stretch 10m repeat:daily hour:7
 *
 * One quest per line, written in the quick-add grammar (`lib/quickAdd.ts`), so
 * there is one syntax to learn and the import preview cannot disagree with
 * what the Jot bar would make. This file adds what a whole page needs and a
 * single line does not:
 *
 *   steps      — a line indented further than the quest above it is a step of
 *                that quest; three tiers at most
 *   hour logs  — `track:hours`: no estimate, time is written down as it is spent
 *   progress   — `logged:1h30m`: time already put in
 *   "titles"   — a title in double quotes is taken as written, for one that
 *                contains something the grammar would read as a setting
 *   //         — a comment; blank lines and list markers are ignored
 *   ```        — when the text has a code block, only the block is read, and
 *                when it has the header line, nothing above that is: an AI
 *                wraps its answer in a sentence or two, and those are not quests
 *
 * `parseManifest` reads the text into the tree the API takes
 * (`POST /manifest/import`); `toManifest` writes a tree (`GET /manifest/export`)
 * back as text that parses to the same tree. The written specification is
 * `docs/QUEST_MANIFEST.md`.
 *
 * A value that can't be read is never guessed at: it is dropped, the default
 * applies, and the row's `warnings` say so. A line that can't be a quest is
 * skipped and says why. Pure and timezone-local; `now` injectable for tests.
 */

import { Clock, History, Hourglass, Repeat } from 'lucide-react';
import { PARAMETERS, parseQuickAdd, questFields, type QuickAddParse } from './quickAdd';

export const MANIFEST_VERSION = 1;
export const MANIFEST_HEADER = `focus-guild manifest ${MANIFEST_VERSION}`;
/** Main quest, step, sub-step. The server refuses a fourth. */
export const MAX_TIERS = 3;
/** Quests and steps together, in one import. The server's cap. */
export const MAX_IMPORT = 200;

/** One quest as the API takes it: what a line said, and its steps. */
export type ManifestQuest = ReturnType<typeof questFields> & {
  /** An hour log: no estimate. */
  trackHours?: boolean;
  /** Minutes already put in. */
  loggedMinutes?: number;
  steps?: ManifestQuest[];
};

export interface ManifestRow {
  /** 1-based line of the text it came from. */
  line: number;
  /** The line as typed, without its indent and list marker. */
  raw: string;
  tier: 1 | 2 | 3;
  /** Null when the line was skipped. */
  quest: ManifestQuest | null;
  chips: QuickAddParse['chips'];
  /** Parts of the line that could not be used; the quest is still made. */
  warnings: string[];
  /** Why the whole line was left out. */
  skipped?: string;
}

export interface ManifestParse {
  /** The version the header named, or null when there was no header. */
  version: number | null;
  rows: ManifestRow[];
  /** Main quests with their steps: the body of `POST /manifest/import`. */
  quests: ManifestQuest[];
  counts: { quests: number; steps: number; hourLogs: number; routines: number; total: number };
  /** Things to know about the page as a whole. */
  notes: string[];
}

/** The settings a manifest line can carry beyond the quick-add ones. */
export const MANIFEST_PARAMETERS: typeof PARAMETERS = [
  ...PARAMETERS,
  { token: 'track:hours', means: 'Hour log', values: 'hours (write no duration)', fallback: 'an ordinary quest' },
  { token: 'logged:1h30m', means: 'Time already spent', values: '45m · 2h · 1h30m', fallback: 'none' },
];

const HEADER = /^focus-guild manifest (\d+)$/i;
/**
 * A plain system monospace for showing and typing manifests. The app's own
 * mono face draws a colon in the middle of a wide cell, so `load:hard` reads
 * as `load: hard`, and with that space the setting no longer parses.
 */
export const MANIFEST_FONT = 'ui-monospace, "Cascadia Mono", Consolas, "SF Mono", Menlo, "Liberation Mono", monospace';
const MARKER = /^(?:[-*•–]|\d+[.)])\s+/;
const CHECKBOX = /^\[( |x)\]\s+/i;

/** Width of a line's indent. A tab counts as four spaces. */
function indentOf(line: string): number {
  let n = 0;
  for (const ch of line) {
    if (ch === ' ') n += 1;
    else if (ch === '\t') n += 4;
    else break;
  }
  return n;
}

/** "45m", "2h", "1.5h", "1h30m", "90" → minutes. */
function readSpan(s: string): number | null {
  const m = /^(?:(\d+(?:[.,]\d+)?)h)?(?:(\d+)(?:m|min)?)?$/i.exec(s);
  if (!m || (m[1] === undefined && m[2] === undefined)) return null;
  const min = Math.round((m[1] ? parseFloat(m[1].replace(',', '.')) * 60 : 0) + (m[2] ? parseInt(m[2], 10) : 0));
  return min > 0 ? min : null;
}

/** 90 → "1h30m": the spelling both the grammar and a person read the same way. */
export function writeSpan(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h${m}m`;
}

/** A leading "quoted title" and what follows it, or null when the line doesn't start with one. */
function readQuoted(body: string): { title: string; rest: string } | null {
  if (!body.startsWith('"')) return null;
  let title = '';
  for (let i = 1; i < body.length; i += 1) {
    const ch = body[i]!;
    if (ch === '\\' && i + 1 < body.length) {
      title += body[i + 1];
      i += 1;
    } else if (ch === '"') {
      return { title: title.trim(), rest: body.slice(i + 1) };
    } else {
      title += ch;
    }
  }
  return null; // no closing quote: the mark is part of an ordinary title
}

interface LineParse {
  quest: ManifestQuest;
  chips: QuickAddParse['chips'];
  warnings: string[];
}

/** One line, already stripped of its indent and list marker. */
function parseLine(body: string, now: Date): LineParse {
  const quoted = readQuoted(body);
  let text = ` ${quoted ? quoted.rest : body} `;
  const warnings: string[] = [];
  let trackHours = false;
  let loggedMinutes: number | undefined;

  // The two settings only a manifest has come out first, so the line grammar never sees them.
  text = text.replace(/\s(track|log)[:=](\S+)(?=\s)/gi, (_all, key: string, value: string) => {
    if (/^(hours?|time)$/i.test(value)) trackHours = true;
    else warnings.push(`"${key}:${value}" isn't "track:hours", so this stayed an ordinary quest`);
    return ' ';
  });
  text = text.replace(/\slogged[:=](\S+)(?=\s)/gi, (_all, value: string) => {
    const min = readSpan(value);
    if (min === null || min > 100_000) warnings.push(`"logged:${value}" isn't a length of time such as 45m or 1h30m, so it was left out`);
    else loggedMinutes = min;
    return ' ';
  });

  const parsed = parseQuickAdd(text, now);
  warnings.push(...parsed.warnings);
  let chips = parsed.chips;
  const quest: ManifestQuest = questFields(parsed);
  if (quoted) {
    if (parsed.title) warnings.push(`"${parsed.title}" after the quoted title was not understood and was left out`);
    quest.title = quoted.title;
  }
  if (trackHours) {
    if (quest.estimatedMinutes !== undefined) {
      warnings.push(`An hour log has no estimate, so "${writeSpan(quest.estimatedMinutes)}" was left out`);
      delete quest.estimatedMinutes;
      chips = chips.filter((c) => c.icon !== Clock);
    }
    quest.trackHours = true;
    chips = [{ icon: Hourglass, label: 'hour log' }, ...chips];
  }
  if (loggedMinutes !== undefined) {
    quest.loggedMinutes = loggedMinutes;
    chips = [...chips, { icon: History, label: `${writeSpan(loggedMinutes)} logged` }];
  }
  return { quest, chips, warnings };
}

export function parseManifest(text: string, now: Date = new Date()): ManifestParse {
  const rows: ManifestRow[] = [];
  const quests: ManifestQuest[] = [];
  const notes: string[] = [];
  let version: number | null = null;
  /** The quests the next line could be a step of, outermost first. */
  const open: Array<{ indent: number; quest: ManifestQuest }> = [];

  // Which lines are the manifest: the first code block when there is one, and
  // from the header down when there is one. What an AI says around its answer
  // ("Here is your manifest:") is not a quest.
  const lines = text.split(/\r?\n/);
  const isFence = (l: string) => l.trim().startsWith('```');
  let from = 0;
  let to = lines.length;
  const fence = lines.findIndex(isFence);
  if (fence >= 0) {
    from = fence + 1;
    const close = lines.findIndex((l, i) => i > fence && isFence(l));
    if (close >= 0) to = close;
  }
  const headerAt = lines.findIndex((l, i) => i >= from && i < to && HEADER.test(l.trim()));
  if (headerAt >= 0) from = headerAt;
  const outside = lines.filter((l, i) => (i < from || i >= to) && l.trim() && !isFence(l)).length;
  if (outside > 0) {
    notes.push(
      `${outside === 1 ? '1 line' : `${outside} lines`} outside the ${fence >= 0 ? 'code block' : 'manifest (above its first line)'} ${outside === 1 ? 'was' : 'were'} not read.`,
    );
  }

  lines.forEach((full, i) => {
    if (i < from || i >= to || !full.trim()) return;
    const indent = indentOf(full);
    let body = full.trim();
    if (body.startsWith('//')) return;
    const header = HEADER.exec(body);
    if (header) {
      version = parseInt(header[1]!, 10);
      if (version > MANIFEST_VERSION) {
        notes.push(`This manifest says version ${version}; this app reads version ${MANIFEST_VERSION}. Check the preview: anything newer shows as a note on its line.`);
      }
      return;
    }

    body = body.replace(MARKER, '');
    const box = CHECKBOX.exec(body);
    if (box) body = body.slice(box[0].length);

    // Where it sits: a step of the nearest line above that is indented less.
    while (open.length > 0 && open[open.length - 1]!.indent >= indent) open.pop();
    const tooDeep = open.length >= MAX_TIERS;
    if (tooDeep) open.length = MAX_TIERS - 1;
    const parent = open[open.length - 1]?.quest ?? null;
    const tier = (open.length + 1) as 1 | 2 | 3;
    const row: ManifestRow = { line: i + 1, raw: body, tier, quest: null, chips: [], warnings: [] };
    rows.push(row);

    if (box && box[1]!.toLowerCase() === 'x') {
      row.skipped = 'Already ticked off, so it was left out';
      return;
    }
    const { quest, chips, warnings } = parseLine(body, now);
    if (!quest.title.trim()) {
      row.skipped = 'Nothing left for a title once the settings were read';
      return;
    }
    if (parent?.trackHours || parent?.isRecurring) {
      row.skipped = `${parent.trackHours ? 'An hour log' : 'A daily round'} can't have steps, so this line was left out. Move it out to the margin to make it a quest of its own`;
      return;
    }
    if (tooDeep) warnings.push(`Steps go ${MAX_TIERS} tiers deep, so this one was kept at the third`);
    if (parent && quest.trackHours) {
      warnings.push('Only a main quest can be an hour log, so this is an ordinary step');
      delete quest.trackHours;
    }
    if (parent && quest.isRecurring) {
      warnings.push('Only a main quest can repeat daily, so this is an ordinary step');
      delete quest.isRecurring;
    }
    if (quest.trackHours && quest.isRecurring) {
      warnings.push("An hour log can't also repeat daily, so the repeat was left out");
      delete quest.isRecurring;
    }
    row.quest = quest;
    // A chip says what will be made, so one for a setting that was just taken back goes too.
    row.chips = chips.filter((c) => !(c.icon === Hourglass && !quest.trackHours) && !(c.icon === Repeat && !quest.isRecurring));
    row.warnings = warnings;
    if (parent) (parent.steps ??= []).push(quest);
    else quests.push(quest);
    open.push({ indent, quest });
  });

  const counts = { quests: 0, steps: 0, hourLogs: 0, routines: 0, total: 0 };
  for (const row of rows) {
    if (!row.quest) continue;
    counts.total += 1;
    if (row.tier > 1) counts.steps += 1;
    else if (row.quest.trackHours) counts.hourLogs += 1;
    else if (row.quest.isRecurring) counts.routines += 1;
    else counts.quests += 1;
  }
  if (counts.total > MAX_IMPORT) {
    notes.push(`That is ${counts.total} quests and steps. One import takes at most ${MAX_IMPORT}: split the list and run it twice.`);
  }
  return { version, rows, quests, counts, notes };
}

/** The longest session the line grammar assumes when a line gives none (`lib/quickAdd.ts`). */
const DEFAULT_LONGEST_MIN = 50;
const CATEGORY_TOKEN: Record<string, string> = { deep_work: 'deep', comms: 'comms', admin: 'admin', creative: 'creative' };
const pad = (n: number) => String(n).padStart(2, '0');

/** The deadline the way the grammar reads it back: local, and 17:00 goes without saying. */
function writeDeadline(iso: string): string {
  const d = new Date(iso);
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return d.getHours() === 17 && d.getMinutes() === 0 ? `by ${day}` : `by ${day} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Trim a float for print: 0.7000000001 → "0.7". */
const num = (n: number) => String(Math.round(n * 100) / 100);

function writeSettings(q: ManifestQuest): string[] {
  const out: string[] = [];
  if (q.trackHours) out.push('track:hours');
  else if (q.estimatedMinutes !== undefined) out.push(writeSpan(q.estimatedMinutes));
  if (q.loggedMinutes) out.push(`logged:${writeSpan(q.loggedMinutes)}`);
  if (q.deadline) out.push(writeDeadline(q.deadline));
  if (q.priorityTier === 'HIGH') out.push('!high');
  if (q.priorityTier === 'LOW') out.push('!low');
  for (const t of q.tags ?? []) if (/^[\w-]+$/.test(t)) out.push(`#${t}`);
  // The grammar's five levels of load are the stored 2, 4, 6, 8, 10.
  if (q.mentalLoad !== undefined) out.push(`load:${Math.min(5, Math.max(1, Math.round(q.mentalLoad / 2)))}`);
  if (q.impact !== undefined) out.push(`impact:${q.impact}`);
  if (q.category !== undefined) out.push(`cat:${CATEGORY_TOKEN[q.category] ?? q.category}`);
  if (q.preferredHour !== undefined) out.push(`hour:${q.preferredHour}`);
  if (q.minChunkMin !== undefined) out.push(`min:${q.minChunkMin}`);
  if (q.maxChunkMin !== undefined) out.push(`max:${q.maxChunkMin}`);
  // The grammar refuses a shortest session above the longest, and the longest is 50m when
  // unsaid. An old quest can hold just such a shortest one; it is written with a longest to match.
  else if (q.minChunkMin !== undefined && q.minChunkMin > DEFAULT_LONGEST_MIN) out.push(`max:${q.minChunkMin}`);
  if (q.tediousness !== undefined) out.push(`tedious:${num(q.tediousness * 100)}`);
  if (q.setupCost !== undefined) out.push(`setup:${num(q.setupCost * 100)}`);
  if (q.urgencyMult !== undefined) out.push(`urgency:${num(q.urgencyMult)}`);
  if (q.isRecurring) out.push('repeat:daily');
  return out;
}

/** The title as it must be written to come back unchanged: bare when it can be, quoted when it can't. */
function writeTitle(title: string, now: Date): string {
  const clean = title.replace(/\s*[\r\n]+\s*/g, ' ').trim();
  const back = parseManifest(clean, now);
  const row = back.rows[0];
  const plain =
    back.rows.length === 1 &&
    back.version === null &&
    row!.quest !== null &&
    row!.warnings.length === 0 &&
    Object.keys(row!.quest).length === 1 &&
    row!.quest.title === clean;
  return plain ? clean : `"${clean.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * A tree of quests as manifest text. What it writes, `parseManifest` reads
 * back as the same tree (tested), on a device in the same timezone.
 */
export function toManifest(quests: ManifestQuest[], now: Date = new Date()): string {
  const lines: string[] = [MANIFEST_HEADER];
  const write = (list: ManifestQuest[], tier: number) => {
    for (const q of list) {
      lines.push(`${'  '.repeat(tier - 1)}${[writeTitle(q.title, now), ...writeSettings(q)].join(' ')}`);
      if (q.steps?.length && tier < MAX_TIERS) write(q.steps, tier + 1);
    }
  };
  write(quests, 1);
  return `${lines.join('\n')}\n`;
}

export const MANIFEST_EXAMPLE = `${MANIFEST_HEADER}
// Steps are indented under their quest
Finish chem IA 6h by 2026-10-15 !high
  Analyse the data 2h load:hard
    Plot the graphs 45m
  Write the evaluation 1h30m #chem
Email the coordinator 10m by tomorrow
// No finish line: an hour log
Piano practice track:hours #music
// Every day
Stretch 10m repeat:daily hour:7`;

/**
 * The whole format as plain text, written to be handed to an AI (or a person)
 * along with a brain-dump, so what comes back can be pasted straight into the
 * importer. Dated, because "by friday" means nothing a week later.
 */
export function manifestGuide(now: Date = new Date()): string {
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return [
    'You are writing a Focus Guild quest manifest: plain text that the Focus Guild app imports as quests.',
    'Turn what I give you into a manifest. Reply with the manifest only, in one code block.',
    '',
    'Rules',
    `- The first line is exactly: ${MANIFEST_HEADER}`,
    '- One quest per line. Only the title is required. Titles are short and start with a verb.',
    `- A step of a quest goes on a line below it, indented two spaces further. A step can have steps of its own; ${MAX_TIERS} tiers is the limit.`,
    '- Settings go after the title, in any order, separated by spaces.',
    '- Leave out any setting you were not told or cannot fairly infer. The app has a sensible default for each. Never invent a deadline.',
    `- Write deadlines as "by 2026-10-15" or "by 2026-10-15 21:00" (24-hour clock, my local time). Today is ${today}.`,
    '- A quest with steps needs no duration of its own: its time is the sum of its steps.',
    '- Something with no finish line (practice, reading, hours on a long project) is an hour log: write track:hours and no duration. An hour log has no steps.',
    '- Something done every day is a round: write repeat:daily. A round has no steps.',
    '- If a title contains something that reads as a setting (a duration such as 2h, a # or ! word, "by" and a day, or word:value), put the title in double quotes.',
    '- A line that starts with // is a comment.',
    `- At most ${MAX_IMPORT} quests and steps.`,
    '',
    'Settings',
    ...MANIFEST_PARAMETERS.map((p) => `${p.token.padEnd(13)} ${p.means}: ${p.values}. Left out: ${p.fallback}.`),
    '',
    'Example',
    MANIFEST_EXAMPLE.replace('by tomorrow', `by ${today}`),
  ].join('\n');
}
