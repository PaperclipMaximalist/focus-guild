/**
 * Natural-language quick-add parser.
 *
 *   "Write report 2h by fri #work !high"
 *     → { title: "Write report", estimatedMinutes: 120,
 *         deadline: next Friday 17:00, priorityTier: 'HIGH', tags: ['work'] }
 *
 * Grammar (order-independent; matched tokens are stripped from the title).
 * Only the title is required: everything left out keeps the quest editor's
 * default, listed in `PARAMETERS` below.
 *
 *   duration  — 2h, 1.5h, 90m, 45min, 1h30m, 2 hours, 30 minutes
 *   deadline  — by | due, then a day and an optional time:
 *                 today | tonight | tomorrow | tmr | mon…sun (next occurrence)
 *                 2026-10-15 | oct 15 | 15 oct | oct 15 2027
 *                 … 9pm | 9:30pm | 21:00   (17:00 when no time is given)
 *   priority  — !high / !h · !med / !m · !low / !l
 *   tags      — #word (repeatable)
 *   settings  — key:value, one per setting (see `PARAMETERS`):
 *                 load: impact: cat: hour: min: max: tedious: setup: urgency: repeat:
 *
 * A value that can't be read is never guessed at: the token is dropped, the
 * default applies, and `warnings` says so. The import preview shows them.
 *
 * Pure + timezone-local; `now` injectable for tests.
 */
import type { LucideIcon } from 'lucide-react';

import type { PriorityTier } from './api';
import { CalendarDays, Clock, Flame, Leaf, Minus, Repeat, SlidersHorizontal, Tag } from 'lucide-react';

export interface QuickAddParse {
  title: string;
  estimatedMinutes?: number;
  /** ISO string, or undefined when no deadline phrase found. */
  deadline?: string;
  priorityTier?: PriorityTier;
  tags: string[];
  /** 1..10, as stored (the editor's five levels are 2, 4, 6, 8, 10). */
  mentalLoad?: number;
  /** 1..10 */
  impact?: number;
  category?: Category;
  /** 0..23 */
  preferredHour?: number;
  minChunkMin?: number;
  maxChunkMin?: number;
  /** 0..1 */
  tediousness?: number;
  /** 0..1 */
  setupCost?: number;
  urgencyMult?: number;
  isRecurring?: boolean;
  /** Human-readable chips describing what was recognized (for live preview). */
  chips: Array<{ icon: LucideIcon; label: string }>;
  /** What was typed but could not be used, in words for the person who typed it. */
  warnings: string[];
}

export type Category = 'deep_work' | 'comms' | 'admin' | 'creative';

/** Every setting a line can carry, for the on-page reference and the copyable guide. */
export const PARAMETERS: Array<{ token: string; means: string; values: string; fallback: string }> = [
  { token: '2h', means: 'Estimate', values: '2h · 1.5h · 90m · 1h30m', fallback: '30m' },
  { token: 'by oct 15', means: 'Deadline', values: '2026-10-15 · oct 15 · 15 oct · fri · tomorrow, then an optional time: 9pm · 21:00', fallback: 'none; 17:00 if no time' },
  { token: '!high', means: 'Priority', values: '!high · !med · !low', fallback: 'med' },
  { token: '#tag', means: 'Tag', values: 'any word, repeatable', fallback: 'none' },
  { token: 'load:4', means: 'Mental load', values: '1–5, or easy · mild · medium · hard · brutal', fallback: '3 (medium)' },
  { token: 'impact:8', means: 'Impact', values: '1–10', fallback: '5' },
  { token: 'cat:deep', means: 'Category', values: 'deep · comms · admin · creative', fallback: 'deep' },
  { token: 'hour:10', means: 'Preferred hour', values: '0–23, or 7am · 7pm', fallback: 'no preference' },
  { token: 'min:15', means: 'Shortest session', values: '5m–8h', fallback: '15m' },
  { token: 'max:50', means: 'Longest session', values: '5m–8h', fallback: '50m' },
  { token: 'tedious:70', means: 'Tediousness', values: '0–100 (%)', fallback: '40' },
  { token: 'setup:30', means: 'Setup cost', values: '0–100 (%)', fallback: '30' },
  { token: 'urgency:1.5', means: 'Urgency multiplier', values: '0.5–3', fallback: '1' },
  { token: 'repeat:daily', means: 'Daily routine', values: 'daily', fallback: 'one-off' },
];

/** The same reference as plain text, to keep beside a list or hand to whoever writes it. */
export const FORMAT_GUIDE = [
  'Focus Guild quest list: one quest per line. Only the title is required.',
  'Put any of these anywhere on the line; what is left over is the title.',
  '',
  ...PARAMETERS.map((p) => `${p.token.padEnd(13)} ${p.means}: ${p.values}. Default: ${p.fallback}.`),
  '',
  'Example:',
  'Finish chem IA analysis 2h by 2026-10-15 9pm #chem !high load:hard impact:9 max:45',
].join('\n');

const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const DAY_WORD = 'today|tonight|tomorrow|tmr|sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?';
/** What may follow a token: the input is padded, so there is always something. */
const EDGE = '(?=[\\s.,!?])';

const LOAD_WORDS: Record<string, number> = { easy: 1, mild: 2, medium: 3, med: 3, hard: 4, brutal: 5 };
const LOAD_NAMES = ['', 'easy', 'mild', 'medium', 'hard', 'brutal'];
const CATEGORY_WORDS: Record<string, Category> = {
  deep: 'deep_work', deep_work: 'deep_work', deepwork: 'deep_work', focus: 'deep_work',
  comms: 'comms', comm: 'comms',
  admin: 'admin',
  creative: 'creative',
};
const CATEGORY_NAMES: Record<Category, string> = { deep_work: 'deep work', comms: 'comms', admin: 'admin', creative: 'creative' };

/** Spellings of each setting's key. */
const KEYS: Record<string, 'load' | 'impact' | 'cat' | 'hour' | 'min' | 'max' | 'tedious' | 'setup' | 'urgency' | 'repeat' | 'priority'> = {
  load: 'load', effort: 'load',
  impact: 'impact',
  cat: 'cat', category: 'cat',
  hour: 'hour', at: 'hour', around: 'hour',
  min: 'min',
  max: 'max', session: 'max',
  tedious: 'tedious', tedium: 'tedious', boring: 'tedious',
  setup: 'setup', warmup: 'setup',
  urgency: 'urgency', urg: 'urgency',
  repeat: 'repeat', every: 'repeat', recurring: 'repeat',
  pri: 'priority', priority: 'priority',
};

function fmtDuration(min: number): string {
  if (min % 60 === 0) return `${min / 60}h`;
  if (min > 60) return `${Math.floor(min / 60)}h ${min % 60}m`;
  return `${min}m`;
}

/** "9pm", "9:30pm", "21:00" → hour and minute. A bare "9" is a number, not a time, unless `bare`. */
function readClock(s: string, bare = false): { hour: number; minute: number } | null {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(s.trim());
  if (!m) return null;
  if (!bare && m[2] === undefined && m[3] === undefined) return null;
  let hour = parseInt(m[1]!, 10);
  const minute = m[2] ? parseInt(m[2], 10) : 0;
  const half = m[3]?.toLowerCase();
  if (half) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (half === 'pm' ? 12 : 0);
  }
  return hour <= 23 && minute <= 59 ? { hour, minute } : null;
}

/** "50", "50m", "1h", "1.5h" → minutes. */
function readMinutes(s: string): number | null {
  const m = /^(\d+(?:[.,]\d+)?)\s*(h|hr|hrs|hours?|m|min|mins|minutes?)?$/i.exec(s);
  if (!m) return null;
  const n = parseFloat(m[1]!.replace(',', '.'));
  return Math.round(m[2] && /^h/i.test(m[2]) ? n * 60 : n);
}

interface When {
  /** Characters of `rest` the phrase took. */
  length: number;
  date: Date | null;
  timed: boolean;
}

/** The day (and time) at the start of `rest`, or null when it isn't one. */
function readWhen(rest: string, now: Date): When | null {
  let day: Date | null = null;
  let used = 0;
  let word = '';
  let dated = false;

  const exact = (y: number, mo: number, d: number) => {
    const at = new Date(y, mo, d, 17, 0, 0, 0);
    // The 30th of February is not the 2nd of March.
    return at.getFullYear() === y && at.getMonth() === mo && at.getDate() === d ? at : null;
  };
  /** A month and day with no year: the next time that date comes round. */
  const coming = (mo: number, d: number, year?: string) => {
    if (year) return exact(parseInt(year, 10), mo, d);
    const thisYear = exact(now.getFullYear(), mo, d);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return thisYear && thisYear.getTime() < today ? exact(now.getFullYear() + 1, mo, d) : thisYear;
  };
  const monthOf = (s: string) => MONTH_NAMES.indexOf(s.slice(0, 3).toLowerCase());

  let m: RegExpExecArray | null;
  if ((m = new RegExp(`^(\\d{4})-(\\d{1,2})-(\\d{1,2})(?=[\\sT.,!?])`, 'i').exec(rest))) {
    day = exact(parseInt(m[1]!, 10), parseInt(m[2]!, 10) - 1, parseInt(m[3]!, 10));
    dated = true;
  } else if ((m = new RegExp(`^(${MONTH})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?${EDGE}`, 'i').exec(rest))) {
    day = coming(monthOf(m[1]!), parseInt(m[2]!, 10), m[3]);
    dated = true;
  } else if ((m = new RegExp(`^(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH})\\.?(?:,?\\s+(\\d{4}))?${EDGE}`, 'i').exec(rest))) {
    day = coming(monthOf(m[2]!), parseInt(m[1]!, 10), m[3]);
    dated = true;
  } else if ((m = new RegExp(`^(${DAY_WORD})${EDGE}`, 'i').exec(rest))) {
    word = m[1]!.toLowerCase();
    day = new Date(now);
    day.setHours(17, 0, 0, 0);
    if (word === 'tonight') {
      day.setHours(21, 0, 0, 0);
    } else if (word === 'tomorrow' || word === 'tmr') {
      day.setDate(day.getDate() + 1);
    } else if (word !== 'today') {
      let delta = (WEEKDAYS[word]! - day.getDay() + 7) % 7;
      if (delta === 0) delta = 7; // "by fri" on a Friday = NEXT Friday
      day.setDate(day.getDate() + delta);
    }
  }
  if (m) used = m[0].length;

  // An optional time after the day ("fri 9pm", "2026-10-15T21:00", "oct 15 at 9:30pm"), or a time alone.
  const t = new RegExp(`^(?:T|\\s+(?:(?:at|@)\\s*)?)?(\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)?)${EDGE}`, 'i').exec(rest.slice(used));
  const clock = t ? readClock(t[1]!) : null;
  if (!m && !clock) return null;
  if (clock) used += t![0].length;
  if (dated && !day) return { length: used, date: null, timed: false };

  if (clock) {
    if (!day) {
      // "by 9pm": today, or tomorrow once that hour has gone.
      day = new Date(now);
      day.setHours(clock.hour, clock.minute, 0, 0);
      if (day.getTime() <= now.getTime()) day.setDate(day.getDate() + 1);
    } else {
      day.setHours(clock.hour, clock.minute, 0, 0);
    }
  } else if (word === 'today' && day!.getTime() <= now.getTime()) {
    // keep today 17:00; if that's already past, end of today (23:00)
    day!.setHours(23, 0, 0, 0);
  }
  return { length: used, date: day, timed: clock !== null };
}

export function parseQuickAdd(input: string, now: Date = new Date()): QuickAddParse {
  let text = ` ${input} `; // pad so \s-anchored patterns hit at string edges
  const chips: QuickAddParse['chips'] = [];
  const warnings: string[] = [];
  const out: QuickAddParse = { title: '', tags: [], chips, warnings };
  const cut = (start: number, length: number) => {
    text = `${text.slice(0, start)} ${text.slice(start + length)}`;
  };

  // ── deadline ── (first, so "by fri 9pm" and "due:2026-10-15" are whole before anything else reads them)
  const lead = /\s(?:by|due)(?:\s+|:\s*)/gi;
  let timed = false;
  for (let m = lead.exec(text); m; m = lead.exec(text)) {
    const from = m.index + m[0].length;
    const when = readWhen(text.slice(from), now);
    if (!when) {
      // "by 10/15" is the 15th of October to some and the 10th of May to others.
      const tried = /^\d{1,4}[/.-]\d{1,2}(?:[/.-]\d{1,4})?/.exec(text.slice(from));
      if (tried) {
        warnings.push(`Couldn't read "${tried[0]}" as a date: write it as 2026-10-15 or "oct 15"`);
        cut(m.index, m[0].length + tried[0].length);
        break;
      }
      continue;
    }
    const typed = text.slice(from, from + when.length).trim();
    cut(m.index, m[0].length + when.length);
    if (!when.date) {
      warnings.push(`"${typed}" isn't a real date, so no deadline was set`);
    } else {
      out.deadline = when.date.toISOString();
      timed = when.timed;
      if (when.date.getTime() < now.getTime()) warnings.push(`The deadline "${typed}" has already passed`);
    }
    break;
  }

  // ── duration ──
  const dur = new RegExp(`\\s(\\d+(?:[.,]\\d+)?)\\s*h(?:ours?|rs?)?(?:\\s*(\\d{1,2})\\s*m(?:in(?:ute)?s?)?)?${EDGE}`, 'i').exec(text);
  const durM = new RegExp(`\\s(\\d+)\\s*m(?:in(?:ute)?s?)?${EDGE}`, 'i').exec(text);
  if (dur) {
    const min = parseFloat(dur[1]!.replace(',', '.')) * 60 + (dur[2] ? parseInt(dur[2], 10) : 0);
    out.estimatedMinutes = Math.max(5, Math.round(min));
    cut(dur.index, dur[0].length);
  } else if (durM) {
    out.estimatedMinutes = Math.max(5, parseInt(durM[1]!, 10));
    cut(durM.index, durM[0].length);
  }

  // ── priority ──
  const pri = new RegExp(`\\s!(high|medium|med|low|h|m|l)${EDGE}`, 'i').exec(text);
  if (pri) {
    const p = pri[1]!.toLowerCase()[0];
    out.priorityTier = p === 'h' ? 'HIGH' : p === 'l' ? 'LOW' : 'MED';
    cut(pri.index, pri[0].length);
  }

  // ── settings ── key:value. Read right to left, so cutting one out doesn't
  // move those still to come, and the leftmost of a repeated key wins.
  for (const m of [...text.matchAll(/\s([a-z]+)[:=]([^\s]+)/gi)].reverse()) {
    const key = KEYS[m[1]!.toLowerCase()];
    const raw = m[2]!.replace(/[.,!?]+$/, '');
    const token = `${m[1]}:${raw}`;
    if (!key) {
      // A web address is a title, not a mistyped setting.
      if (!raw.startsWith('//')) warnings.unshift(`"${token}" isn't a setting, so it stayed in the title`);
      continue;
    }
    cut(m.index!, m[0].length);
    const bad = (expected: string) => {
      warnings.unshift(`"${token}" isn't ${expected}, so the default was kept`);
    };
    const v = raw.toLowerCase();
    const num = Number(v.replace(/[%x×]$/, '').replace(',', '.'));
    if (key === 'load') {
      const five = LOAD_WORDS[v] ?? (Number.isInteger(num) && num >= 1 && num <= 5 ? num : null);
      if (five === null) bad('1–5 or easy, mild, medium, hard, brutal');
      else out.mentalLoad = five * 2;
    } else if (key === 'impact') {
      if (Number.isInteger(num) && num >= 1 && num <= 10) out.impact = num;
      else bad('a whole number from 1 to 10');
    } else if (key === 'cat') {
      if (CATEGORY_WORDS[v]) out.category = CATEGORY_WORDS[v];
      else bad('deep, comms, admin or creative');
    } else if (key === 'hour') {
      const clock = readClock(v, true);
      if (clock) out.preferredHour = clock.hour;
      else bad('an hour such as 10, 7am or 19:00');
    } else if (key === 'min' || key === 'max') {
      const min = readMinutes(v);
      if (min === null || min < 5 || min > 480) bad('between 5 minutes and 8 hours');
      else if (key === 'min') out.minChunkMin = min;
      else out.maxChunkMin = min;
    } else if (key === 'tedious' || key === 'setup') {
      if (!Number.isFinite(num) || num < 0 || num > 100) bad('a percentage from 0 to 100');
      else if (key === 'tedious') out.tediousness = num / 100;
      else out.setupCost = num / 100;
    } else if (key === 'urgency') {
      if (Number.isFinite(num) && num >= 0.5 && num <= 3) out.urgencyMult = num;
      else bad('between 0.5 and 3');
    } else if (key === 'repeat') {
      if (/^(daily|day|yes|true)$/.test(v)) out.isRecurring = true;
      else if (/^(no|none|never|false)$/.test(v)) out.isRecurring = false;
      else bad('"daily" (the only repeat there is)');
    } else if (!pri) {
      const p = v[0];
      if (/^(high|h|medium|med|m|low|l)$/.test(v)) out.priorityTier = p === 'h' ? 'HIGH' : p === 'l' ? 'LOW' : 'MED';
      else bad('high, med or low');
    }
  }
  const longest = out.maxChunkMin ?? 50;
  if (out.minChunkMin !== undefined && out.minChunkMin > longest) {
    warnings.push(`The shortest session (${out.minChunkMin}m) is longer than the longest (${longest}m), so the default was kept`);
    delete out.minChunkMin;
  }

  // ── tags ──
  let tagMatch: RegExpExecArray | null;
  const tagRe = /\s#([\w-]+)/g;
  while ((tagMatch = tagRe.exec(text)) !== null) {
    if (!out.tags.includes(tagMatch[1]!)) out.tags.push(tagMatch[1]!);
  }
  if (out.tags.length > 0) text = text.replace(/\s#[\w-]+/g, ' ');

  // ── chips: one per thing recognised, read off the result so they cannot disagree with it ──
  if (out.estimatedMinutes) chips.push({ icon: Clock, label: fmtDuration(out.estimatedMinutes) });
  if (out.deadline) {
    const d = new Date(out.deadline);
    chips.push({
      icon: CalendarDays,
      label: d.toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
        ...(timed ? { hour: 'numeric', minute: '2-digit' } : {}),
      }),
    });
  }
  if (out.priorityTier) {
    chips.push({ icon: out.priorityTier === 'HIGH' ? Flame : out.priorityTier === 'LOW' ? Leaf : Minus, label: out.priorityTier.toLowerCase() });
  }
  if (out.tags.length > 0) chips.push({ icon: Tag, label: out.tags.map((t) => `#${t}`).join(' ') });
  if (out.isRecurring) chips.push({ icon: Repeat, label: 'daily' });
  const settings = [
    out.mentalLoad !== undefined && `load ${LOAD_NAMES[out.mentalLoad / 2]}`,
    out.impact !== undefined && `impact ${out.impact}`,
    out.category !== undefined && CATEGORY_NAMES[out.category],
    out.preferredHour !== undefined && `around ${String(out.preferredHour).padStart(2, '0')}:00`,
    out.minChunkMin !== undefined && `sessions from ${fmtDuration(out.minChunkMin)}`,
    out.maxChunkMin !== undefined && `sessions up to ${fmtDuration(out.maxChunkMin)}`,
    out.tediousness !== undefined && `tedious ${Math.round(out.tediousness * 100)}%`,
    out.setupCost !== undefined && `setup ${Math.round(out.setupCost * 100)}%`,
    out.urgencyMult !== undefined && `urgency ${out.urgencyMult}×`,
  ].filter((s): s is string => typeof s === 'string');
  for (const label of settings) chips.push({ icon: SlidersHorizontal, label });

  out.title = text.replace(/\s+/g, ' ').trim();
  return out;
}

/**
 * What a parsed line creates, in the API's words. Only what was typed is sent:
 * the server and the planner fill in the rest, the same for the quick-add bar
 * and for an import.
 */
export function questFields(p: QuickAddParse) {
  return {
    title: p.title,
    ...(p.estimatedMinutes !== undefined ? { estimatedMinutes: p.estimatedMinutes } : {}),
    ...(p.deadline !== undefined ? { deadline: p.deadline } : {}),
    ...(p.priorityTier !== undefined ? { priorityTier: p.priorityTier } : {}),
    ...(p.tags.length > 0 ? { tags: p.tags } : {}),
    ...(p.mentalLoad !== undefined ? { mentalLoad: p.mentalLoad } : {}),
    ...(p.impact !== undefined ? { impact: p.impact } : {}),
    ...(p.category !== undefined ? { category: p.category } : {}),
    ...(p.preferredHour !== undefined ? { preferredHour: p.preferredHour } : {}),
    ...(p.minChunkMin !== undefined ? { minChunkMin: p.minChunkMin } : {}),
    ...(p.maxChunkMin !== undefined ? { maxChunkMin: p.maxChunkMin } : {}),
    ...(p.tediousness !== undefined ? { tediousness: p.tediousness } : {}),
    ...(p.setupCost !== undefined ? { setupCost: p.setupCost } : {}),
    ...(p.urgencyMult !== undefined ? { urgencyMult: p.urgencyMult } : {}),
    ...(p.isRecurring ? { isRecurring: true } : {}),
  };
}
