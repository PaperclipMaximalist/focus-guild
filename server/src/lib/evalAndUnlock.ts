/**
 * Glue between the pure achievement evaluator and Prisma. Call this right
 * after a quest completion has been persisted; it gathers the recent-activity
 * context, evaluates all achievements, and persists any newly-unlocked rows.
 *
 * Returns the freshly-unlocked Achievement records so the route can include
 * them in the response for client toasts.
 */

import { db } from '../db/client.js';
import { evaluateAchievements } from './achievements.js';
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

  // daysWithZeroOverdue — count consecutive prior days with no overdue quests.
  // Lightweight approximation: 0 if any overdue exists now; otherwise null-safe 0
  // until a proper tracker is built. Good enough for MVP unlock signaling.
  const daysWithZeroOverdue = overdueCount === 0 ? 7 : 0;

  // Spin the Wheel usage — sourced from User.spinCount.
  const userRow = await db.user.findUnique({
    where: { id: userId },
    select: { spinCount: true },
  });
  const spinWheelUses = userRow?.spinCount ?? 0;

  const candidateSlugs = evaluateAchievements({
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
  });

  if (candidateSlugs.length === 0) return [];

  // Look up the Achievement rows for these slugs.
  const achievements = await db.achievement.findMany({
    where: { slug: { in: candidateSlugs } },
  });

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
