/**
 * Natural-language quick-add parser.
 *
 *   "Write report 2h by fri #work !high"
 *     → { title: "Write report", estimatedMinutes: 120,
 *         deadline: next Friday 17:00, priorityTier: 'HIGH', tags: ['work'] }
 *
 * Grammar (order-independent; matched tokens are stripped from the title):
 *   duration  — 2h, 1.5h, 90m, 45min, 2 hours, 30 minutes
 *   deadline  — by today | tonight | tomorrow | tmr | mon…sun (next occurrence, 17:00)
 *   priority  — !high / !h → HIGH · !low / !l → LOW
 *   tags      — #word (repeatable)
 *
 * Pure + timezone-local; `now` injectable for tests.
 */

import type { PriorityTier } from './api';

export interface QuickAddParse {
  title: string;
  estimatedMinutes?: number;
  /** ISO string, or undefined when no deadline phrase found. */
  deadline?: string;
  priorityTier?: PriorityTier;
  tags: string[];
  /** Human-readable chips describing what was recognized (for live preview). */
  chips: Array<{ icon: string; label: string }>;
}

const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

function fmtDuration(min: number): string {
  if (min % 60 === 0) return `${min / 60}h`;
  if (min > 60) return `${Math.floor(min / 60)}h ${min % 60}m`;
  return `${min}m`;
}

export function parseQuickAdd(input: string, now: Date = new Date()): QuickAddParse {
  let text = ` ${input} `; // pad so \s-anchored patterns hit at string edges
  const chips: QuickAddParse['chips'] = [];
  const out: QuickAddParse = { title: '', tags: [], chips };

  // ── duration ──
  const durH = /\s(\d+(?:[.,]\d+)?)\s*h(?:ours?|rs?)?(?=[\s.,!?])/i.exec(text);
  const durM = /\s(\d+)\s*m(?:in(?:ute)?s?)?(?=[\s.,!?])/i.exec(text);
  if (durH) {
    out.estimatedMinutes = Math.max(5, Math.round(parseFloat(durH[1]!.replace(',', '.')) * 60));
    text = text.replace(durH[0], ' ');
  } else if (durM) {
    out.estimatedMinutes = Math.max(5, parseInt(durM[1]!, 10));
    text = text.replace(durM[0], ' ');
  }
  if (out.estimatedMinutes) chips.push({ icon: '🕐', label: fmtDuration(out.estimatedMinutes) });

  // ── deadline ──
  const dl = /\sby\s+(today|tonight|tomorrow|tmr|sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?)(?=[\s.,!?])/i.exec(text);
  if (dl) {
    const word = dl[1]!.toLowerCase();
    const d = new Date(now);
    d.setHours(17, 0, 0, 0);
    if (word === 'today') {
      // keep today 17:00; if that's already past, end of today (23:00)
      if (d.getTime() <= now.getTime()) d.setHours(23, 0, 0, 0);
    } else if (word === 'tonight') {
      d.setHours(21, 0, 0, 0);
    } else if (word === 'tomorrow' || word === 'tmr') {
      d.setDate(d.getDate() + 1);
    } else {
      const target = WEEKDAYS[word];
      if (target !== undefined) {
        let delta = (target - d.getDay() + 7) % 7;
        if (delta === 0) delta = 7; // "by fri" on a Friday = NEXT Friday
        d.setDate(d.getDate() + delta);
      }
    }
    out.deadline = d.toISOString();
    text = text.replace(dl[0], ' ');
    chips.push({
      icon: '📅',
      label: d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
    });
  }

  // ── priority ──
  const pri = /\s!(high|low|h|l)(?=[\s.,!?])/i.exec(text);
  if (pri) {
    const p = pri[1]!.toLowerCase();
    out.priorityTier = p === 'high' || p === 'h' ? 'HIGH' : 'LOW';
    text = text.replace(pri[0], ' ');
    chips.push({ icon: out.priorityTier === 'HIGH' ? '🔥' : '🌙', label: out.priorityTier.toLowerCase() });
  }

  // ── tags ──
  let tagMatch: RegExpExecArray | null;
  const tagRe = /\s#([\w-]+)/g;
  while ((tagMatch = tagRe.exec(text)) !== null) {
    out.tags.push(tagMatch[1]!);
  }
  if (out.tags.length > 0) {
    text = text.replace(/\s#[\w-]+/g, ' ');
    chips.push({ icon: '🏷️', label: out.tags.map((t) => `#${t}`).join(' ') });
  }

  out.title = text.replace(/\s+/g, ' ').trim();
  return out;
}
