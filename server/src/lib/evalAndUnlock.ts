/**
 * Glue between the pure achievement evaluator and Prisma. Call this right
 * after a quest completion has been persisted; it gathers the recent-activity
 * context, evaluates all achievements, and persists any newly-unlocked rows.
 *
 * Returns the freshly-unlocked Achievement records so the route can include
 * them in the response for client toasts.
 */

import { db } from '../db/client.js';
import { ACHIEVEMENTS, evaluateAchievements } from './achievements.js';
import type { Achievement } from '../../generated/prisma/client.js';

interface CompletedQuestInput {
  id: string;
  userId: string;
  mentalLoad: number;
  estimatedMinutes: number;
  actualMinutes: number | null;
  completedAt: Date;
  /** RESCUE if it was overdue. */
  status: string;
  /** The member's getTimezoneOffset(), from the request; UTC when the client did not send it. */
  tzOffsetMin?: number;
  /**
   * Only these trophies may unlock. For a call that is not a completion (a
   * spin of Dealer's choice), where the "completed quest" is only the one the
   * wheel landed on and must not earn Brain Drain, Marathon or Night Owl.
   */
  only?: string[];
}

export async function evalAndUnlockAchievements(
  completedQuest: CompletedQuestInput,
): Promise<Achievement[]> {
  const userId = completedQuest.userId;

  // Recent completions for early-bird + time-whisperer.
  const recent = await db.quest.findMany({
    where: {
      userId,
      status: 'COMPLETE',
      completedAt: { not: null },
    },
    orderBy: { completedAt: 'desc' },
    take: 10,
    select: { completedAt: true, estimatedMinutes: true, actualMinutes: true },
  });

  // Overdue-quest signal.
  const overdueCount = await db.quest.count({
    where: {
      userId,
      status: { in: ['ACTIVE', 'RESCUE'] },
      deadline: { lt: new Date() },
    },
  });

  // Remaining Rescue quests after this completion (for rescue-ranger).
  const remainingRescueCount = await db.quest.count({
    where: { userId, status: 'RESCUE' },
  });

  // Spin the Wheel usage + streak + XP — sourced from the User row.
  const userRow = await db.user.findUnique({
    where: { id: userId },
    select: { spinCount: true, currentStreak: true, totalXP: true, createdAt: true },
  });

  // daysWithZeroOverdue — count consecutive prior days with no overdue quests.
  // Lightweight approximation until a proper tracker is built: 0 if anything is
  // overdue now, else the account's age capped at 7. Without the cap on age a
  // member who joined today got "Ended a full week with no overdue quests" on
  // their first tick.
  const accountDays = userRow ? Math.floor((Date.now() - userRow.createdAt.getTime()) / 86_400_000) : 0;
  const daysWithZeroOverdue = overdueCount === 0 ? Math.min(7, accountDays) : 0;
  const spinWheelUses = userRow?.spinCount ?? 0;
  const currentStreak = userRow?.currentStreak ?? 0;
  const totalXP = userRow?.totalXP ?? 0;

  // Total completed quests (milestone achievements).
  const totalCompleted = await db.quest.count({
    where: { userId, status: 'COMPLETE' },
  });

  const evaluated = evaluateAchievements({
    completedQuest: {
      id: completedQuest.id,
      mentalLoad: completedQuest.mentalLoad,
      estimatedMinutes: completedQuest.estimatedMinutes,
      actualMinutes: completedQuest.actualMinutes,
      completedAt: completedQuest.completedAt,
      status: completedQuest.status,
    },
    recentCompletions: recent
      .filter((r): r is { completedAt: Date; estimatedMinutes: number; actualMinutes: number | null } => r.completedAt !== null)
      .map((r) => ({
        completedAt: r.completedAt,
        estimatedMinutes: r.estimatedMinutes,
        actualMinutes: r.actualMinutes,
      })),
    remainingRescueCount,
    spinWheelUses,
    hasOverdueQuests: overdueCount > 0,
    daysWithZeroOverdue,
    currentStreak,
    totalXP,
    totalCompleted,
    tzOffsetMin: completedQuest.tzOffsetMin ?? 0,
  });

  const candidateSlugs = completedQuest.only
    ? evaluated.filter((slug) => completedQuest.only!.includes(slug))
    : evaluated;
  if (candidateSlugs.length === 0) return [];

  // Look up the Achievement rows for these slugs.
  let achievements = await db.achievement.findMany({
    where: { slug: { in: candidateSlugs } },
  });
  // A trophy that exists in code but not in the table (added after the last
  // `db:seed`, or a database that was never seeded) would otherwise never
  // unlock, silently. Create its row from the definition the first time it is earned.
  const missing = ACHIEVEMENTS.filter(
    (a) => candidateSlugs.includes(a.slug) && !achievements.some((row) => row.slug === a.slug),
  );
  if (missing.length > 0) {
    for (const a of missing) {
      await db.achievement.upsert({
        where: { slug: a.slug },
        create: { slug: a.slug, title: a.title, description: a.description, icon: a.icon, xpReward: a.xpReward },
        update: {},
      });
    }
    achievements = await db.achievement.findMany({ where: { slug: { in: candidateSlugs } } });
  }

  // Find which ones the user does NOT already have.
  const alreadyUnlocked = await db.userAchievement.findMany({
    where: { userId, achievementId: { in: achievements.map((a) => a.id) } },
    select: { achievementId: true },
  });
  const alreadyUnlockedIds = new Set(alreadyUnlocked.map((u) => u.achievementId));
  const newlyUnlocked = achievements.filter((a) => !alreadyUnlockedIds.has(a.id));

  if (newlyUnlocked.length === 0) return [];

  // Insert UserAchievement rows + bonus XPEvents in one transaction.
  await db.$transaction([
    ...newlyUnlocked.flatMap((a) => [
      db.userAchievement.create({ data: { userId, achievementId: a.id } }),
      db.xPEvent.create({
        data: { userId, amount: a.xpReward, reason: `achievement:${a.slug}` },
      }),
    ]),
    db.user.update({
      where: { id: userId },
      data: {
        totalXP: { increment: newlyUnlocked.reduce((acc, a) => acc + a.xpReward, 0) },
      },
    }),
  ]);

  return newlyUnlocked;
}
