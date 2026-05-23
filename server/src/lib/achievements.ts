/**
 * Achievement evaluator.
 *
 * Each achievement defines a checker function that decides whether the
 * member just unlocked it after a quest completion. Callers pass in a
 * snapshot of the recent activity needed for the checks; the checker
 * returns true if the unlock condition is now met.
 *
 * Achievements defined in FocusGuildInstructions.md:
 *   - early-bird          Top quest done before 10am, 3 days running
 *   - brain-drain         Finished a mental-load 9+ quest in one session
 *   - zero-overdue-week   Ended a week with no overdue quests
 *   - time-whisperer      Estimate within 15% of actual on 5 quests in a row
 *   - chaos-agent         Used Spin the Wheel 10 times
 *   - rescue-ranger       Cleared all Rescue Mode quests in one session
 */

export interface AchievementContext {
  // The quest that was just completed
  completedQuest: {
    id: string;
    mentalLoad: number;
    estimatedMinutes: number;
    actualMinutes: number | null;
    completedAt: Date;
    status: string; // RESCUE if it was overdue
  };
  // Recent history (filled by the caller from the DB)
  recentCompletions: Array<{
    completedAt: Date;
    estimatedMinutes: number;
    actualMinutes: number | null;
  }>;
  // Count of remaining Rescue Mode quests after this completion
  remainingRescueCount: number;
  // Spin the Wheel usage count
  spinWheelUses: number;
  // Whether the user has any overdue quests as of this moment
  hasOverdueQuests: boolean;
  // Days since the user's last "zero-overdue" streak started (null = no streak)
  daysWithZeroOverdue: number;
}

export interface AchievementDef {
  slug: string;
  title: string;
  description: string;
  icon: string;
  xpReward: number;
  check: (ctx: AchievementContext) => boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    slug: 'early-bird',
    title: 'Early Bird',
    description: 'Completed your top quest before 10am, 3 days running.',
    icon: '🌅',
    xpReward: 100,
    check: (ctx) => {
      // Get the earliest-completed quest for each of the last 3 days
      const byDay = new Map<string, Date>();
      for (const c of ctx.recentCompletions) {
        const key = c.completedAt.toISOString().slice(0, 10);
        const existing = byDay.get(key);
        if (!existing || c.completedAt < existing) byDay.set(key, c.completedAt);
      }
      const days = [...byDay.entries()]
        .sort((a, b) => (a[0] < b[0] ? 1 : -1))
        .slice(0, 3);
      if (days.length < 3) return false;
      return days.every(([, earliest]) => earliest.getUTCHours() < 10);
    },
  },
  {
    slug: 'brain-drain',
    title: 'Brain Drain',
    description: 'Finished a mental-load 9+ quest in one sitting.',
    icon: '🧠',
    xpReward: 75,
    check: (ctx) => ctx.completedQuest.mentalLoad >= 9,
  },
  {
    slug: 'zero-overdue-week',
    title: 'Zero Overdue Week',
    description: 'Ended a full week with no overdue quests.',
    icon: '✨',
    xpReward: 200,
    check: (ctx) => !ctx.hasOverdueQuests && ctx.daysWithZeroOverdue >= 7,
  },
  {
    slug: 'time-whisperer',
    title: 'Time Whisperer',
    description: 'Estimated time within 15% of actual on 5 quests in a row.',
    icon: '⏱️',
    xpReward: 150,
    check: (ctx) => {
      const last5 = ctx.recentCompletions.slice(0, 5);
      if (last5.length < 5) return false;
      return last5.every((c) => {
        if (c.actualMinutes === null || c.estimatedMinutes === 0) return false;
        const ratio = Math.abs(c.actualMinutes - c.estimatedMinutes) / c.estimatedMinutes;
        return ratio <= 0.15;
      });
    },
  },
  {
    slug: 'chaos-agent',
    title: 'Chaos Agent',
    description: 'Used Spin the Wheel 10 times.',
    icon: '🎲',
    xpReward: 50,
    check: (ctx) => ctx.spinWheelUses >= 10,
  },
  {
    slug: 'rescue-ranger',
    title: 'Rescue Ranger',
    description: 'Cleared every Rescue Mode quest in a single session.',
    icon: '🚑',
    xpReward: 125,
    check: (ctx) =>
      ctx.completedQuest.status === 'RESCUE' && ctx.remainingRescueCount === 0,
  },
];

/**
 * Returns the slugs of any achievements that just unlocked given the context.
 * The caller is responsible for filtering out achievements the user already has.
 */
export function evaluateAchievements(ctx: AchievementContext): string[] {
  return ACHIEVEMENTS.filter((a) => a.check(ctx)).map((a) => a.slug);
}
