/**
 * The member's day: what "today" means for a round, a streak or the fuel
 * check.
 *
 * Routes used to take `new Date().setUTCHours(0, 0, 0, 0)`, the UTC calendar
 * date. For a member in Pacific time UTC midnight is 4 pm (5 pm in summer),
 * so a round ticked at 6 pm was filed under tomorrow, every round un-ticked
 * itself mid-afternoon, and two completions either side of 4 pm counted as two
 * streak days. Everything here works on the member's own clock instead.
 *
 * The offset is `Date.prototype.getTimezoneOffset()` from the browser (minutes
 * to ADD to local time to reach UTC: Pacific standard → 480, JST → −540). The
 * client sends it on every request as the `X-Tz-Offset` header; `tzHint`
 * reads it. The day arithmetic itself is the scheduler's (`scheduler/tz.ts`),
 * so the planner and these routes agree on when a day turns over: midnight,
 * or, for working hours that run past midnight (22–06), the hour the session
 * closes ("a person's day ends when their session does").
 *
 * Nothing in this file touches the database, so it can be tested directly.
 */

import { userMidnightUtc, workDayMidnightUtc, workDayStartUtc, type HoursWindow } from './scheduler/tz.js';

/** The request header the client puts its `getTimezoneOffset()` in. */
export const TZ_HEADER = 'X-Tz-Offset';

const MAX_OFFSET_MIN = 14 * 60;
const MS_PER_MIN = 60_000;
export const MS_PER_DAY = 86_400_000;

/** A `getTimezoneOffset()` value, when `raw` is one: finite and within ±14 h. */
export function parseTz(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  return Number.isFinite(n) && Math.abs(n) <= MAX_OFFSET_MIN ? n : undefined;
}

/** Just enough of a Hono context to read a header and the query string. */
interface WithHeaders {
  req: { header(name: string): string | undefined; query?(name: string): string | undefined };
}

/**
 * The member's offset for this request, or undefined when nothing says.
 *
 * Order: the `X-Tz-Offset` header if a caller sends one, then `?tz=` (the
 * web client puts it on every request; a query value rather than a header so
 * a client deployed before its server is not refused by CORS), then the
 * explicit values a route already accepted (a body's `tzOffsetMin`), in the
 * order given. No offset is stored per member, so a caller with no browser
 * (a personal access token, the MCP connector) that sends none of these gets
 * undefined, which callers treat as UTC, as before.
 */
export function tzHint(c: WithHeaders, ...explicit: unknown[]): number | undefined {
  const fromHeader = parseTz(c.req.header(TZ_HEADER));
  if (fromHeader !== undefined) return fromHeader;
  const fromQuery = parseTz(c.req.query?.('tz'));
  if (fromQuery !== undefined) return fromQuery;
  for (const v of explicit) {
    const t = parseTz(v);
    if (t !== undefined) return t;
  }
  return undefined;
}

/** `tzHint`, with UTC (0) when nothing says. */
export function tzOf(c: WithHeaders, ...explicit: unknown[]): number {
  return tzHint(c, ...explicit) ?? 0;
}

export interface MemberDay {
  /**
   * The member's date as the `@db.Date` columns store it: UTC midnight of
   * their LOCAL calendar date (of the date their working day started on, for
   * hours that run past midnight).
   */
  key: Date;
  /** When the member's day began (UTC ms). */
  start: number;
  /** When it ends (UTC ms): 24 hours later. */
  end: number;
}

/**
 * The member's day containing `atMs`. With `hours`, a working window that
 * runs past midnight keeps the small hours on the day the session started
 * (01:00 in a 22–06 window belongs to yesterday); ordinary hours, or none,
 * turn over at local midnight.
 */
export function memberDay(atMs: number, tzOffsetMin: number, hours?: HoursWindow): MemberDay {
  const midnight = hours ? workDayMidnightUtc(atMs, tzOffsetMin, hours) : userMidnightUtc(atMs, tzOffsetMin);
  const start = hours ? workDayStartUtc(atMs, tzOffsetMin, hours) : midnight;
  return { key: new Date(midnight - tzOffsetMin * MS_PER_MIN), start, end: start + MS_PER_DAY };
}

/** True when the instant falls within the member's day. */
export function withinDay(at: Date, day: MemberDay): boolean {
  const t = at.getTime();
  return t >= day.start && t < day.end;
}

/**
 * The key range worth reading when looking for today's rows. Rows written
 * before this file existed are keyed by the UTC date, which is up to a day
 * either side of the member's date; filtering on `createdAt` (see below) then
 * decides which of them are really today's.
 */
export function keyWindow(day: MemberDay): { gte: Date; lte: Date } {
  return { gte: new Date(day.key.getTime() - MS_PER_DAY), lte: new Date(day.key.getTime() + MS_PER_DAY) };
}

// ─── Rounds (daily repeating quests) ─────────────────────────────────────────

export interface CompletionRow {
  id: string;
  date: Date;
  createdAt: Date;
}

export type RoundTick =
  | { kind: 'already-done' }
  | { kind: 'create' }
  /** An older tick occupies today's key (`(questId, date)` is unique): it gives way. */
  | { kind: 'replace-stale'; staleId: string };

/**
 * Whether a round can be ticked now, and how to store the tick.
 *
 * Done today is decided by WHEN a completion happened (`createdAt` within the
 * member's day), not by its key alone: rows from before this change are keyed
 * by the UTC date, so a tick at 6 pm Pacific yesterday sits under today's key
 * and must not read as today's. When such a stale row holds today's key, the
 * new tick replaces it rather than being refused with ALREADY_DONE_TODAY.
 *
 * `rows` are this quest's completions with keys near today (see `keyWindow`).
 */
export function planRoundTick(rows: CompletionRow[], day: MemberDay): RoundTick {
  if (rows.some((r) => withinDay(r.createdAt, day))) return { kind: 'already-done' };
  const occupying = rows.find((r) => r.date.getTime() === day.key.getTime());
  return occupying ? { kind: 'replace-stale', staleId: occupying.id } : { kind: 'create' };
}

/** The quests among `rows` that were done within the member's day. */
export function doneToday(rows: Array<{ questId: string; createdAt: Date }>, day: MemberDay): Set<string> {
  return new Set(rows.filter((r) => withinDay(r.createdAt, day)).map((r) => r.questId));
}

// ─── The fuel check (daily check-in) ─────────────────────────────────────────

/**
 * Today's check-in among `rows`: the latest one made within the member's day,
 * whatever its key (an old row made after 4 pm Pacific is keyed tomorrow).
 */
export function pickTodaysCheckIn<T extends { createdAt: Date }>(rows: T[], day: MemberDay): T | null {
  let best: T | null = null;
  for (const r of rows) {
    if (!withinDay(r.createdAt, day)) continue;
    if (!best || r.createdAt.getTime() > best.createdAt.getTime()) best = r;
  }
  return best;
}
