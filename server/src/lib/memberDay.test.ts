import { describe, it, expect } from 'vitest';
import {
  doneToday,
  keyWindow,
  memberDay,
  parseTz,
  pickTodaysCheckIn,
  planRoundTick,
  tzHint,
  tzOf,
} from './memberDay.js';

const PST = 480; // getTimezoneOffset() in Pacific standard time
const JST = -540;
const at = (iso: string) => new Date(iso).getTime();
const keyOf = (iso: string, tz: number, hours?: { startHour: number; endHour: number }) =>
  memberDay(at(iso), tz, hours).key.toISOString().slice(0, 10);

// 2026-11-11 is a Wednesday.
describe('memberDay', () => {
  it('6 pm Pacific on Wednesday is Wednesday (UTC already says Thursday)', () => {
    expect(keyOf('2026-11-12T02:00:00Z', PST)).toBe('2026-11-11');
  });

  it('9 am Thursday Pacific is Thursday', () => {
    expect(keyOf('2026-11-12T17:00:00Z', PST)).toBe('2026-11-12');
  });

  it('early morning in UTC+9 is already the next date (UTC still says the day before)', () => {
    // 06:00 Thursday in Tokyo = 21:00 Wednesday UTC
    expect(keyOf('2026-11-11T21:00:00Z', JST)).toBe('2026-11-12');
  });

  it('keys are UTC midnight of the local date, as @db.Date columns store them', () => {
    expect(memberDay(at('2026-11-12T02:00:00Z'), PST).key.toISOString()).toBe('2026-11-11T00:00:00.000Z');
  });

  it('the day runs from local midnight to local midnight', () => {
    const d = memberDay(at('2026-11-12T02:00:00Z'), PST);
    expect(new Date(d.start).toISOString()).toBe('2026-11-11T08:00:00.000Z');
    expect(new Date(d.end).toISOString()).toBe('2026-11-12T08:00:00.000Z');
  });

  it('with a 22:00 to 06:00 working window, 1 am belongs to the previous day', () => {
    const night = { startHour: 22, endHour: 6 };
    // 01:00 Thursday Pacific
    expect(keyOf('2026-11-12T09:00:00Z', PST, night)).toBe('2026-11-11');
    // 07:00 Thursday Pacific: the session is over, it is Thursday
    expect(keyOf('2026-11-12T15:00:00Z', PST, night)).toBe('2026-11-12');
    const d = memberDay(at('2026-11-12T09:00:00Z'), PST, night);
    expect(new Date(d.start).toISOString()).toBe('2026-11-11T14:00:00.000Z'); // Wed 06:00 local
  });

  it('ordinary working hours change nothing', () => {
    expect(keyOf('2026-11-12T02:00:00Z', PST, { startHour: 9, endHour: 17 })).toBe('2026-11-11');
  });

  it('keyWindow spans a day either side, for rows keyed by the UTC date', () => {
    const w = keyWindow(memberDay(at('2026-11-12T02:00:00Z'), PST));
    expect(w.gte.toISOString().slice(0, 10)).toBe('2026-11-10');
    expect(w.lte.toISOString().slice(0, 10)).toBe('2026-11-12');
  });
});

describe('parseTz / tzHint', () => {
  const ctx = (headers: Record<string, string>) => ({
    req: { header: (n: string) => headers[n.toLowerCase()] },
  });

  it('accepts real offsets and refuses nonsense', () => {
    expect(parseTz('480')).toBe(480);
    expect(parseTz(-540)).toBe(-540);
    expect(parseTz('0')).toBe(0);
    expect(parseTz('')).toBeUndefined();
    expect(parseTz('abc')).toBeUndefined();
    expect(parseTz('Infinity')).toBeUndefined();
    expect(parseTz(14 * 60 + 1)).toBeUndefined();
    expect(parseTz(undefined)).toBeUndefined();
  });

  it('the header wins, then explicit values in order, then nothing', () => {
    expect(tzHint(ctx({ 'x-tz-offset': '480' }), '0')).toBe(480);
    expect(tzHint(ctx({}), undefined, '420')).toBe(420);
    expect(tzHint(ctx({ 'x-tz-offset': 'junk' }), '420')).toBe(420);
    expect(tzHint(ctx({}))).toBeUndefined();
  });

  it('a caller with no browser (token, MCP) falls back to UTC', () => {
    expect(tzOf(ctx({}))).toBe(0);
  });

  // What the web client sends: a query value on every request, which needs no CORS allowance.
  it('reads ?tz= on any route, after the header and before a body value', () => {
    const withQuery = (headers: Record<string, string>, query: Record<string, string>) => ({
      req: { header: (n: string) => headers[n.toLowerCase()], query: (n: string) => query[n] },
    });
    expect(tzHint(withQuery({}, { tz: '480' }))).toBe(480);
    expect(tzHint(withQuery({}, { tz: '480' }), '0')).toBe(480);
    expect(tzHint(withQuery({ 'x-tz-offset': '-540' }, { tz: '480' }))).toBe(-540);
    expect(tzHint(withQuery({}, { tz: 'junk' }), '420')).toBe(420);
    expect(tzHint(withQuery({}, {}))).toBeUndefined();
  });
});

describe('rounds: planRoundTick', () => {
  // Thursday 9 am Pacific. The member ticked this round at 6 pm Wednesday,
  // before the fix: the old code filed it under the UTC date, Thursday.
  const now = memberDay(at('2026-11-12T17:00:00Z'), PST);
  const staleRow = { id: 'old', date: new Date('2026-11-12T00:00:00Z'), createdAt: new Date('2026-11-12T02:00:00Z') };

  it('a tick from yesterday evening under today\'s key is not "done today", and gives way', () => {
    expect(planRoundTick([staleRow], now)).toEqual({ kind: 'replace-stale', staleId: 'old' });
  });

  it('a tick made today is done, whatever key the old code gave it', () => {
    const thisMorning = { id: 'm', date: new Date('2026-11-12T00:00:00Z'), createdAt: new Date('2026-11-12T16:30:00Z') };
    expect(planRoundTick([thisMorning], now)).toEqual({ kind: 'already-done' });
    // Ticked today after 4 pm by the old code: keyed tomorrow, still today's.
    const evening = memberDay(at('2026-11-13T03:00:00Z'), PST); // Thu 7 pm
    const lateTick = { id: 'l', date: new Date('2026-11-13T00:00:00Z'), createdAt: new Date('2026-11-13T01:00:00Z') };
    expect(planRoundTick([lateTick], evening)).toEqual({ kind: 'already-done' });
  });

  it('nothing near today: a plain create', () => {
    expect(planRoundTick([], now)).toEqual({ kind: 'create' });
    const twoDaysAgo = { id: 'x', date: new Date('2026-11-10T00:00:00Z'), createdAt: new Date('2026-11-10T20:00:00Z') };
    expect(planRoundTick([twoDaysAgo], now)).toEqual({ kind: 'create' });
  });

  it('doneToday reads the instant, not the key', () => {
    const rows = [
      { questId: 'a', createdAt: staleRow.createdAt }, // yesterday evening
      { questId: 'b', createdAt: new Date('2026-11-12T16:30:00Z') }, // this morning
    ];
    expect([...doneToday(rows, now)]).toEqual(['b']);
  });
});

describe('fuel check: pickTodaysCheckIn', () => {
  const now = memberDay(at('2026-11-12T17:00:00Z'), PST); // Thu 9 am Pacific

  it('yesterday evening\'s check-in (keyed today by the old code) is not today\'s', () => {
    const rows = [{ id: 'y', createdAt: new Date('2026-11-12T02:00:00Z') }];
    expect(pickTodaysCheckIn(rows, now)).toBeNull();
  });

  it('the latest check-in made today wins', () => {
    const rows = [
      { id: 'early', createdAt: new Date('2026-11-12T15:00:00Z') },
      { id: 'later', createdAt: new Date('2026-11-12T16:59:00Z') },
      { id: 'y', createdAt: new Date('2026-11-12T02:00:00Z') },
    ];
    expect(pickTodaysCheckIn(rows, now)?.id).toBe('later');
  });
});
