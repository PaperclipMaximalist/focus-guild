/**
 * Markdown is the tracker's interchange format — export and import both,
 * round-trip clean.
 *
 * Layout: YAML frontmatter (schema version, tier, timestamp, counts) then
 * structured markdown. One item per line, code first, so a line is both
 * regex-parseable and readable by a human.
 *
 * Item line grammar:
 *
 *   - [~] A29 | Title | next: Email the coordinator | domain: CAS | due: 2026-10-01
 *
 * The leading mark is the status; everything after the code is a sequence of
 * ` | `-separated fields. The first is always the title; the rest are
 * `key: value` pairs and may appear in any order. Free text has `|` escaped
 * as `\|`, so titles containing pipes survive a round trip.
 *
 * Notes and reflections attach as indented continuation lines, keeping the
 * "one item per line" rule intact for the item itself.
 *
 * Everything here is pure: no DB, no clock (callers pass `generatedAt`), so
 * it unit-tests like the scheduler libs do.
 */

import { CAS_STRANDS, TRACKER_STATUSES } from './config.js';
import type { CasStrand, TrackerStatusName } from './config.js';

export const MD_SCHEMA_VERSION = 1;

export type ExportTier = 'compact' | 'working' | 'full' | 'archive';

/** Status marks, per spec: `[ ] [~] [x] [-] [!]`. */
const STATUS_MARK: Record<TrackerStatusName, string> = {
  TODO: ' ',
  ACTIVE: '~',
  DONE: 'x',
  DROPPED: '-',
  BLOCKED: '!',
};

const MARK_STATUS: Record<string, TrackerStatusName> = {
  ' ': 'TODO',
  '~': 'ACTIVE',
  x: 'DONE',
  X: 'DONE',
  '-': 'DROPPED',
  '!': 'BLOCKED',
};

/** Statuses excluded from every tier except `archive`. */
const TERMINAL: TrackerStatusName[] = ['DONE', 'DROPPED'];

export interface MdReflection {
  text: string;
  date: string;
  loTags: number[];
  mediaUrl?: string | null;
}

/**
 * DB-agnostic item shape. `domain` is the domain *name*, not an id, so a
 * document stays portable between installs.
 */
export interface MdItem {
  code: string;
  title: string;
  status: TrackerStatusName;
  domain?: string | null;
  nextAction?: string | null;
  notes?: string | null;
  dueDate?: string | null;
  casStrands?: string[];
  learningOutcomes?: number[];
  isCourseworkLinked?: boolean;
  casStartDate?: string | null;
  casEndDate?: string | null;
  isCasProject?: boolean;
  hours?: number | null;
  completedAt?: string | null;
  updatedAt?: string | null;
  reflections?: MdReflection[];
}

export interface MdDoc {
  items: MdItem[];
  parkingLot: Array<{ text: string; createdAt?: string | null }>;
  decisions: Array<{ text: string; decidedAt: string }>;
}

export interface SerializeOptions {
  tier: ExportTier;
  generatedAt: Date;
  /** Only include items touched at or after this instant (delta export). */
  since?: Date | null;
  /** Soft cap for the compact tier; completions are trimmed to fit. */
  compactBudget?: number;
  showHours?: boolean;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Collapse newlines and escape the field separator. */
function esc(s: string): string {
  return s.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();
}

function unesc(s: string): string {
  return s.replace(/\\\|/g, '|').trim();
}

/** Split on ` | ` while honouring `\|` escapes. */
function splitFields(s: string): string[] {
  const out: string[] = [];
  let buf = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') {
      buf += '\\|';
      i++;
      continue;
    }
    if (s[i] === '|' && s[i - 1] === ' ' && s[i + 1] === ' ') {
      out.push(buf.trim());
      buf = '';
      i++;
      continue;
    }
    buf += s[i];
  }
  out.push(buf.trim());
  return out.filter((f) => f.length > 0);
}

/** ISO instant → `YYYY-MM-DD`. */
function day(v: string | Date | null | undefined): string | null {
  if (!v) return null;
  const d = typeof v === 'string' ? new Date(v) : v;
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function isStatus(v: string): v is TrackerStatusName {
  return (TRACKER_STATUSES as readonly string[]).includes(v);
}

function isStrand(v: string): v is CasStrand {
  return (CAS_STRANDS as readonly string[]).includes(v);
}

// ─── serialize ───────────────────────────────────────────────────────────────

function itemLine(it: MdItem, showHours: boolean): string {
  const parts: string[] = [esc(it.title)];

  if (it.nextAction) parts.push(`next: ${esc(it.nextAction)}`);
  if (it.domain) parts.push(`domain: ${esc(it.domain)}`);
  const due = day(it.dueDate);
  if (due) parts.push(`due: ${due}`);
  if (it.casStrands?.length) parts.push(`cas: ${it.casStrands.join(',')}`);
  if (it.learningOutcomes?.length) {
    parts.push(`lo: ${[...it.learningOutcomes].sort((a, b) => a - b).join(',')}`);
  }
  const casStart = day(it.casStartDate);
  const casEnd = day(it.casEndDate);
  if (casStart) parts.push(`from: ${casStart}`);
  if (casEnd) parts.push(`to: ${casEnd}`);
  if (it.isCasProject) parts.push('project');
  if (it.isCourseworkLinked) parts.push('coursework');
  if (showHours && typeof it.hours === 'number') parts.push(`hours: ${it.hours}`);

  return `- [${STATUS_MARK[it.status]}] ${it.code} | ${parts.join(' | ')}`;
}

function continuationLines(it: MdItem, tier: ExportTier): string[] {
  const out: string[] = [];
  if ((tier === 'full' || tier === 'archive') && it.notes) {
    out.push(`  notes: ${esc(it.notes)}`);
  }
  if (tier === 'archive') {
    for (const r of it.reflections ?? []) {
      const bits = [day(r.date) ?? ''];
      if (r.loTags.length) bits.push(`lo: ${r.loTags.join(',')}`);
      if (r.mediaUrl) bits.push(`media: ${esc(r.mediaUrl)}`);
      bits.push(esc(r.text));
      out.push(`  reflect: ${bits.join(' | ')}`);
    }
  }
  return out;
}

function frontmatter(
  tier: ExportTier,
  generatedAt: Date,
  counts: Record<string, number>,
  since?: Date | null,
): string {
  const lines = [
    '---',
    `schema: ${MD_SCHEMA_VERSION}`,
    `tier: ${tier}`,
    `generated: ${generatedAt.toISOString()}`,
  ];
  if (since) lines.push(`since: ${since.toISOString()}`);
  lines.push('counts:');
  for (const [k, v] of Object.entries(counts)) lines.push(`  ${k}: ${v}`);
  lines.push('---');
  return lines.join('\n');
}

/**
 * Render a document. Done/dropped items appear only in `archive`; the
 * `compact` tier additionally trims recent completions to stay near budget.
 */
export function serialize(doc: MdDoc, opts: SerializeOptions): string {
  const { tier, generatedAt } = opts;
  const showHours = opts.showHours ?? false;
  const since = opts.since ?? null;

  const inWindow = (it: MdItem): boolean => {
    if (!since) return true;
    const stamp = it.updatedAt ? new Date(it.updatedAt) : null;
    return stamp !== null && stamp.getTime() >= since.getTime();
  };

  const all = doc.items.filter(inWindow);
  const live = all.filter((i) => !TERMINAL.includes(i.status));
  const active = live.filter((i) => i.status === 'ACTIVE');
  const blocked = live.filter((i) => i.status === 'BLOCKED');
  const done = all.filter((i) => i.status === 'DONE');
  const dropped = all.filter((i) => i.status === 'DROPPED');

  const counts: Record<string, number> = {
    items: tier === 'archive' ? all.length : live.length,
    active: active.length,
    blocked: blocked.length,
  };
  if (tier === 'archive') {
    counts['done'] = done.length;
    counts['dropped'] = dropped.length;
  }

  const out: string[] = [frontmatter(tier, generatedAt, counts, since), ''];

  const section = (heading: string, items: MdItem[]): void => {
    if (items.length === 0) return;
    out.push(`## ${heading}`, '');
    for (const it of items) {
      out.push(itemLine(it, showHours));
      out.push(...continuationLines(it, tier));
    }
    out.push('');
  };

  section('Active', active);
  section('Blocked', blocked);

  if (tier === 'compact') {
    // Newest completions first, trimmed to the character budget.
    const budget = opts.compactBudget ?? 500;
    const recent = [...done]
      .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
      .slice(0, 10);
    const soFar = out.join('\n').length;
    const picked: MdItem[] = [];
    let used = soFar + '## Recent completions\n\n'.length;
    for (const it of recent) {
      const line = itemLine(it, showHours);
      if (used + line.length + 1 > budget) break;
      picked.push(it);
      used += line.length + 1;
    }
    section('Recent completions', picked);
    return out.join('\n').trimEnd() + '\n';
  }

  // working / full / archive: every unfinished item, grouped by domain.
  const rest = live.filter((i) => i.status !== 'ACTIVE' && i.status !== 'BLOCKED');
  const byDomain = new Map<string, MdItem[]>();
  for (const it of rest) {
    const key = it.domain?.trim() || 'Unsorted';
    const bucket = byDomain.get(key);
    if (bucket) bucket.push(it);
    else byDomain.set(key, [it]);
  }
  for (const name of [...byDomain.keys()].sort((a, b) => a.localeCompare(b))) {
    section(name, byDomain.get(name)!);
  }

  if (tier === 'full' || tier === 'archive') {
    if (doc.decisions.length > 0) {
      out.push('## Decisions', '');
      for (const d of doc.decisions) out.push(`- ${day(d.decidedAt)} — ${esc(d.text)}`);
      out.push('');
    }
    if (doc.parkingLot.length > 0) {
      out.push('## Parking lot', '');
      for (const p of doc.parkingLot) out.push(`- ${esc(p.text)}`);
      out.push('');
    }
  }

  if (tier === 'archive') {
    section('Done', done);
    section('Dropped', dropped);
  }

  return out.join('\n').trimEnd() + '\n';
}

// ─── parse ───────────────────────────────────────────────────────────────────

export interface ParsedDoc {
  schema: number | null;
  tier: ExportTier | null;
  generated: string | null;
  items: MdItem[];
  parkingLot: string[];
  decisions: Array<{ text: string; decidedAt: string }>;
  /** Lines that looked like items but could not be parsed. */
  warnings: string[];
}

const ITEM_RE = /^\s*[-*]\s*\[(.)\]\s*([A-Za-z][A-Za-z0-9_]*\d+)\s*\|\s*(.+)$/;
const DECISION_RE = /^\s*[-*]\s*(\d{4}-\d{2}-\d{2})\s*[—–-]\s*(.+)$/;

/**
 * Parse a document. Item lines are recognised anywhere, so import tolerates
 * hand-edited section layouts — only `## Parking lot` / `## Decisions` need
 * their headings to classify their plain bullets.
 */
export function parse(text: string): ParsedDoc {
  const lines = text.split(/\r?\n/);
  const result: ParsedDoc = {
    schema: null,
    tier: null,
    generated: null,
    items: [],
    parkingLot: [],
    decisions: [],
    warnings: [],
  };

  let i = 0;

  // Frontmatter (optional).
  if (lines[0]?.trim() === '---') {
    i = 1;
    for (; i < lines.length && lines[i]?.trim() !== '---'; i++) {
      const line = lines[i] ?? '';
      const m = /^(\w+):\s*(.*)$/.exec(line.trim());
      if (!m) continue;
      const [, key, value] = m;
      if (key === 'schema') result.schema = Number(value) || null;
      else if (key === 'tier' && value) {
        result.tier = (['compact', 'working', 'full', 'archive'] as const).find((t) => t === value) ?? null;
      } else if (key === 'generated') result.generated = value || null;
    }
    i++; // consume closing ---
  }

  let section = '';
  let current: MdItem | null = null;

  for (; i < lines.length; i++) {
    const raw = lines[i] ?? '';
    const line = raw.trim();
    if (!line) continue;

    const heading = /^#{1,6}\s*(.+)$/.exec(line);
    if (heading) {
      section = (heading[1] ?? '').toLowerCase();
      current = null;
      continue;
    }

    // Continuation lines belong to the item above.
    const cont = /^(notes|reflect):\s*(.+)$/.exec(line);
    if (cont && current) {
      const [, key, value] = cont;
      if (key === 'notes') {
        current.notes = unesc(value ?? '');
      } else {
        const bits = splitFields(value ?? '');
        const date = bits.find((b) => /^\d{4}-\d{2}-\d{2}$/.test(b)) ?? '';
        const loBit = bits.find((b) => b.startsWith('lo:'));
        const mediaBit = bits.find((b) => b.startsWith('media:'));
        const body = bits.filter(
          (b) => b !== date && b !== loBit && b !== mediaBit,
        );
        (current.reflections ??= []).push({
          text: unesc(body.join(' | ')),
          date,
          loTags: loBit
            ? (loBit.slice(3).split(',').map((n) => Number(n.trim())).filter((n) => n >= 1 && n <= 7))
            : [],
          mediaUrl: mediaBit ? unesc(mediaBit.slice(6)) : null,
        });
      }
      continue;
    }

    const item = ITEM_RE.exec(raw);
    if (item) {
      const [, mark, code, rest] = item;
      const status = MARK_STATUS[mark ?? ''];
      if (!status) {
        result.warnings.push(`Unknown status mark "${mark}" on: ${line}`);
        current = null;
        continue;
      }
      const fields = splitFields(rest ?? '');
      const title = unesc(fields.shift() ?? '');
      if (!title) {
        result.warnings.push(`Item ${code} has no title: ${line}`);
        current = null;
        continue;
      }

      const parsed: MdItem = { code: code ?? '', title, status };

      for (const f of fields) {
        if (f === 'project') { parsed.isCasProject = true; continue; }
        if (f === 'coursework') { parsed.isCourseworkLinked = true; continue; }
        const kv = /^(\w+):\s*(.*)$/.exec(f);
        if (!kv) continue;
        const [, key, value = ''] = kv;
        switch (key) {
          case 'next': parsed.nextAction = unesc(value); break;
          case 'domain': parsed.domain = unesc(value); break;
          case 'due': parsed.dueDate = value || null; break;
          case 'from': parsed.casStartDate = value || null; break;
          case 'to': parsed.casEndDate = value || null; break;
          case 'hours': {
            const n = Number(value);
            parsed.hours = Number.isFinite(n) ? n : null;
            break;
          }
          case 'cas':
            parsed.casStrands = value
              .split(',')
              .map((s) => s.trim().toLowerCase())
              .filter(isStrand);
            break;
          case 'lo':
            parsed.learningOutcomes = value
              .split(',')
              .map((n) => Number(n.trim()))
              .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7);
            break;
          default: break; // forward-compatible: ignore unknown keys
        }
      }

      result.items.push(parsed);
      current = parsed;
      continue;
    }

    // Plain bullets, classified by the section they sit under.
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      const body = bullet[1] ?? '';
      if (section.includes('parking')) {
        result.parkingLot.push(unesc(body));
      } else if (section.includes('decision')) {
        const d = DECISION_RE.exec(line);
        if (d) result.decisions.push({ decidedAt: d[1] ?? '', text: unesc(d[2] ?? '') });
        else result.decisions.push({ decidedAt: '', text: unesc(body) });
      }
      current = null;
    }
  }

  return result;
}

// ─── diff ────────────────────────────────────────────────────────────────────

/** Fields an import is allowed to change on an existing item. */
const DIFFABLE = [
  'title', 'status', 'domain', 'nextAction', 'notes', 'dueDate',
  'casStrands', 'learningOutcomes', 'isCourseworkLinked',
  'casStartDate', 'casEndDate', 'isCasProject', 'hours',
] as const;

export interface FieldChange {
  field: string;
  from: unknown;
  to: unknown;
}

export interface ImportDiff {
  creates: MdItem[];
  updates: Array<{ code: string; changes: FieldChange[]; incoming: MdItem }>;
  /** Present in the import and identical — nothing to do. */
  unchanged: string[];
  /**
   * Present in the app but absent from the import. Reported for visibility
   * and deliberately never deleted.
   */
  untouched: string[];
  warnings: string[];
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    const x = [...((a as unknown[]) ?? [])].map(String).sort();
    const y = [...((b as unknown[]) ?? [])].map(String).sort();
    return x.length === y.length && x.every((v, i) => v === y[i]);
  }
  // Compare dates by calendar day; everything else loosely by emptiness.
  const aDay = typeof a === 'string' && /^\d{4}-\d{2}-\d{2}/.test(a) ? a.slice(0, 10) : null;
  const bDay = typeof b === 'string' && /^\d{4}-\d{2}-\d{2}/.test(b) ? b.slice(0, 10) : null;
  if (aDay && bDay) return aDay === bDay;
  const norm = (v: unknown): unknown => (v === '' || v === undefined ? null : v);
  return norm(a) === norm(b);
}

/**
 * Compare an import against current state. Matching is on item code:
 * update if it exists, create if it doesn't, never duplicate. Items missing
 * from the import are left alone.
 */
export function diffImport(existing: MdItem[], incoming: ParsedDoc): ImportDiff {
  const byCode = new Map(existing.map((i) => [i.code, i]));
  const seen = new Set<string>();
  const out: ImportDiff = {
    creates: [],
    updates: [],
    unchanged: [],
    untouched: [],
    warnings: [...incoming.warnings],
  };

  const dupes = new Set<string>();
  for (const inc of incoming.items) {
    if (seen.has(inc.code)) {
      dupes.add(inc.code);
      continue;
    }
    seen.add(inc.code);

    const cur = byCode.get(inc.code);
    if (!cur) {
      out.creates.push(inc);
      continue;
    }

    const changes: FieldChange[] = [];
    for (const field of DIFFABLE) {
      if (!(field in inc)) continue; // absent ⇒ not asserted by the import
      const to = inc[field];
      const from = cur[field];
      if (!sameValue(from, to)) changes.push({ field, from: from ?? null, to: to ?? null });
    }
    if (changes.length > 0) out.updates.push({ code: inc.code, changes, incoming: inc });
    else out.unchanged.push(inc.code);
  }

  for (const code of dupes) {
    out.warnings.push(`Duplicate code ${code} in import — only the first was used.`);
  }
  for (const cur of existing) {
    if (!seen.has(cur.code)) out.untouched.push(cur.code);
  }

  return out;
}

/** Status name → mark, for UI that wants to show the same glyphs. */
export function statusMark(status: TrackerStatusName): string {
  return STATUS_MARK[status];
}

export function isTerminal(status: TrackerStatusName): boolean {
  return TERMINAL.includes(status);
}
