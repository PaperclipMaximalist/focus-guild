/**
 * The database side of `memberDay.ts`: today's check-in and today's rounds,
 * read the way that file decides them (by when the row was written, within
 * the member's day), so rows keyed by the UTC date before the change read
 * correctly too.
 */

import { db } from '../db/client.js';
import { doneToday, keyWindow, pickTodaysCheckIn, type MemberDay } from './memberDay.js';

/** The member's check-in for today, or null. */
export async function todaysCheckIn(userId: string, day: MemberDay) {
  const rows = await db.dailyCheckIn.findMany({
    where: { userId, date: keyWindow(day), createdAt: { gte: new Date(day.start), lt: new Date(day.end) } },
  });
  return pickTodaysCheckIn(rows, day);
}

/** Ids of the rounds the member has ticked today. */
export async function roundsDoneToday(userId: string, day: MemberDay): Promise<Set<string>> {
  const rows = await db.recurringCompletion.findMany({
    where: { userId, date: keyWindow(day), createdAt: { gte: new Date(day.start), lt: new Date(day.end) } },
    select: { questId: true, createdAt: true },
  });
  return doneToday(rows, day);
}
