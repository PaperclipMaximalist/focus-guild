import { Hono } from 'hono';
import { z } from 'zod';
import { logActivity } from '../lib/activity.js';
import { db } from '../db/client.js';
import { memberDay, tzOf } from '../lib/memberDay.js';
import { todaysCheckIn } from '../lib/memberDayStore.js';
import { getUserConfig } from '../lib/userConfig.js';

export const checkin = new Hono();

const CheckInSchema = z.object({
  clerkId: z.string().optional(), // legacy; ignored
  energyLevel: z.number().int().min(1).max(5),
  availableMinutes: z.number().int().min(0).max(1440),
});

// POST /checkin — record today's energy level and available hours
checkin.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const parsed = CheckInSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } },
      400,
    );
  }

  const { energyLevel, availableMinutes } = parsed.data;

  // Filed under the member's own date. A row already on that key may be an
  // old one (keyed by the UTC date: yesterday evening, Pacific); it is
  // overwritten and re-stamped, so it reads as today's from now on.
  const day = memberDay(Date.now(), tzOf(c), getUserConfig(user).workingHours);
  const record = await db.dailyCheckIn.upsert({
    where: { userId_date: { userId: user.id, date: day.key } },
    create: { userId: user.id, date: day.key, energyLevel, availableMinutes },
    update: { energyLevel, availableMinutes, createdAt: new Date() },
  });
  void logActivity(user.id, 'checkin', `Checked in: energy ${energyLevel}` + (availableMinutes != null ? `, ${availableMinutes} min available` : ''));

  return c.json({ success: true, data: record });
});

// GET /checkin/today — fetch today's check-in if it exists (auth via middleware)
// Param :clerkId kept in URL for back-compat but ignored — user comes from middleware.
checkin.get('/today/:clerkId', async (c) => {
  const user = c.get('user');

  const day = memberDay(Date.now(), tzOf(c), getUserConfig(user).workingHours);
  const record = await todaysCheckIn(user.id, day);

  return c.json({ success: true, data: record ?? null });
});
