import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/client.js';

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

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const record = await db.dailyCheckIn.upsert({
    where: { userId_date: { userId: user.id, date: today } },
    create: { userId: user.id, date: today, energyLevel, availableMinutes },
    update: { energyLevel, availableMinutes },
  });

  return c.json({ success: true, data: record });
});

// GET /checkin/today — fetch today's check-in if it exists (auth via middleware)
// Param :clerkId kept in URL for back-compat but ignored — user comes from middleware.
checkin.get('/today/:clerkId', async (c) => {
  const user = c.get('user');

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const record = await db.dailyCheckIn.findUnique({
    where: { userId_date: { userId: user.id, date: today } },
  });

  return c.json({ success: true, data: record ?? null });
});
