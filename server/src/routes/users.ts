import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/client.js';
import { computeMultiplier } from '../lib/streak.js';
import type { User } from '../../generated/prisma/client.js';

export const users = new Hono();

// GET /users/:clerkId — :clerkId param ignored; middleware resolves the user
/** The member's record without what only the server should hold (a token hash, a calendar token). */
function publicUser(user: User) {
  const { personalTokenHash: _hash, googleCalendarToken: _calendar, ...rest } = user;
  return rest;
}

users.get('/:clerkId', async (c) => {
  const user = c.get('user');
  return c.json({ success: true, data: publicUser(user) });
});

// POST /users — upsert from Clerk webhook or first sign-in
const CreateUserSchema = z.object({
  clerkId: z.string().min(1),
});

users.post('/', async (c) => {
  const body = await c.req.json();
  const parsed = CreateUserSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } },
      400,
    );
  }
  // requireUser has already found or created the signed-in member from their
  // token. The body's clerkId is never used to reach a member: on a first
  // sign-in the client can send it before it knows its own id (a child's
  // effect runs before AuthBridge's), so it is not compared either.
  const user = c.get('user');
  return c.json({ success: true, data: publicUser(user) }, 201);
});

// GET /users/:clerkId/achievements — list of unlocked achievement slugs + details
users.get('/:clerkId/achievements', async (c) => {
  const user = c.get('user');
  const unlocked = await db.userAchievement.findMany({
    where: { userId: user.id },
    include: { achievement: true },
    orderBy: { unlockedAt: 'desc' },
  });
  return c.json({
    success: true,
    data: unlocked.map((u) => ({
      slug: u.achievement.slug,
      title: u.achievement.title,
      icon: u.achievement.icon,
      description: u.achievement.description,
      xpReward: u.achievement.xpReward,
      unlockedAt: u.unlockedAt,
    })),
  });
});

// GET /users/:clerkId/xp-events — full XP history (ascending) for charting
users.get('/:clerkId/xp-events', async (c) => {
  const user = c.get('user');
  const events = await db.xPEvent.findMany({
    where: { userId: user.id },
    select: { id: true, amount: true, reason: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
    take: 1000,
  });
  return c.json({ success: true, data: events });
});

// GET /users/:clerkId/stats — level, XP, streak summary
users.get('/:clerkId/stats', async (c) => {
  const authUser = c.get('user');
  const stats = await db.user.findUnique({
    where: { id: authUser.id },
    select: {
      id: true,
      clerkId: true,
      level: true,
      totalXP: true,
      currentStreak: true,
      multiplier: true,
      _count: { select: { quests: true } },
    },
  });
  return c.json({ success: true, data: stats });
});
