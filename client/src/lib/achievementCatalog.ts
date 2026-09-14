/**
 * Client-side catalog of all achievements — mirrors server/src/lib/achievements.ts.
 * Used by the Trophy Room + Badges panel to render locked/unlocked state for
 * every achievement, whether or not the user has it yet.
 *
 * `hint` is shown for still-locked trophies so the user knows how to earn them.
 * Keep slugs in sync with the server.
 */
import type { LucideIcon } from 'lucide-react';
import { Brain, CalendarCheck, Dices, Dumbbell, Footprints, Gem, Landmark, LifeBuoy, Moon, Sparkles, Sprout, Sunrise, Target, Timer, Trophy } from 'lucide-react';

export interface AchievementMeta {
  slug: string;
  icon: LucideIcon;
  name: string;
  desc: string;
  xp: number;
  /** Loose grouping for the Trophy Room layout. */
  group: 'Milestones' | 'Streaks' | 'Mastery' | 'Wildcards';
}

export const ACHIEVEMENT_CATALOG: AchievementMeta[] = [
  // ── Milestones ──
  { slug: 'first-blood', icon: Sprout, name: 'First Steps', desc: 'Complete your very first quest.', xp: 25, group: 'Milestones' },
  { slug: 'dedicated', icon: Target, name: 'Dedicated', desc: 'Complete 25 quests.', xp: 150, group: 'Milestones' },
  { slug: 'centurion', icon: Landmark, name: 'Centurion', desc: 'Complete 100 quests.', xp: 500, group: 'Milestones' },
  { slug: 'flow-state', icon: Gem, name: 'Flow State', desc: 'Reach Level 5 — Flow Master.', xp: 0, group: 'Milestones' },

  // ── Streaks ──
  { slug: 'week-warrior', icon: CalendarCheck, name: 'Week Warrior', desc: 'Hold a 7-day streak.', xp: 175, group: 'Streaks' },
  { slug: 'unbreakable', icon: Dumbbell, name: 'Unbreakable', desc: 'Hold a 30-day streak.', xp: 750, group: 'Streaks' },
  { slug: 'zero-overdue-week', icon: Sparkles, name: 'Zero Overdue', desc: 'End a full week with no overdue quests.', xp: 200, group: 'Streaks' },

  // ── Mastery ──
  { slug: 'early-bird', icon: Sunrise, name: 'Early Bird', desc: 'Finish your top quest before 10am, 3 days running.', xp: 100, group: 'Mastery' },
  { slug: 'brain-drain', icon: Brain, name: 'Brain Drain', desc: 'Finish a mental-load 9+ quest in one sitting.', xp: 75, group: 'Mastery' },
  { slug: 'time-whisperer', icon: Timer, name: 'Time Whisperer', desc: 'Estimate within 15% of actual on 5 quests in a row.', xp: 150, group: 'Mastery' },
  { slug: 'marathon', icon: Footprints, name: 'Marathon', desc: 'Complete a single quest estimated at 2+ hours.', xp: 120, group: 'Mastery' },

  // ── Wildcards ──
  { slug: 'rescue-ranger', icon: LifeBuoy, name: 'Rescue Ranger', desc: 'Clear every Rescue quest in one session.', xp: 125, group: 'Wildcards' },
  { slug: 'chaos-agent', icon: Dices, name: 'Chaos Agent', desc: 'Use Spin the Wheel 10 times.', xp: 50, group: 'Wildcards' },
  { slug: 'night-owl', icon: Moon, name: 'Night Owl', desc: 'Finish a quest late at night.', xp: 60, group: 'Wildcards' },
];

export const ACHIEVEMENT_GROUPS: AchievementMeta['group'][] = [
  'Milestones', 'Streaks', 'Mastery', 'Wildcards',
];

export const TOTAL_ACHIEVEMENTS = ACHIEVEMENT_CATALOG.length;

const BY_SLUG = new Map(ACHIEVEMENT_CATALOG.map((a) => [a.slug, a]));

/** Icon for an achievement slug; unknown slugs (a newer server) get a trophy. */
export function achievementIcon(slug: string): LucideIcon {
  return BY_SLUG.get(slug)?.icon ?? Trophy;
}
