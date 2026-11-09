import { describe, expect, it } from 'vitest';
import { evaluateAchievements, type AchievementContext } from './achievements.js';

/** A plain mid-sized completion with nothing special about it. */
function ctx({
  completedAt = new Date('2026-11-08T18:00:00Z'),
  ...over
}: Omit<Partial<AchievementContext>, 'completedQuest'> & { completedAt?: Date } = {}): AchievementContext {
  return {
    completedQuest: { id: 'q1', mentalLoad: 5, estimatedMinutes: 30, actualMinutes: null, completedAt, status: 'COMPLETE' },
    recentCompletions: [{ completedAt, estimatedMinutes: 30, actualMinutes: null }],
    remainingRescueCount: 0,
    spinWheelUses: 0,
    hasOverdueQuests: false,
    daysWithZeroOverdue: 0,
    currentStreak: 1,
    totalXP: 10,
    totalCompleted: 1,
    tzOffsetMin: 0,
    ...over,
  };
}

const PACIFIC = 480; // getTimezoneOffset() in November: UTC-8

describe('Night Owl is judged on the member’s clock', () => {
  it('8:15 pm in Los Angeles (04:15 UTC) is not late at night', () => {
    const at = new Date('2026-11-09T04:15:00Z');
    expect(evaluateAchievements(ctx({ completedAt: at, tzOffsetMin: PACIFIC }))).not.toContain('night-owl');
  });

  it('11:30 pm in Los Angeles (07:30 UTC) is', () => {
    const at = new Date('2026-11-09T07:30:00Z');
    expect(evaluateAchievements(ctx({ completedAt: at, tzOffsetMin: PACIFIC }))).toContain('night-owl');
  });

  it('with no offset sent it falls back to UTC, as before', () => {
    const at = new Date('2026-11-09T04:15:00Z');
    expect(evaluateAchievements(ctx({ completedAt: at }))).toContain('night-owl');
  });
});

describe('Early Bird counts the member’s own mornings', () => {
  // 9 am Pacific is 17:00 UTC: a morning there, the afternoon on the server.
  const mornings = ['2026-11-06T17:00:00Z', '2026-11-07T17:00:00Z', '2026-11-08T17:00:00Z'].map((s) => ({
    completedAt: new Date(s),
    estimatedMinutes: 30,
    actualMinutes: null,
  }));

  it('three 9 am finishes in Los Angeles earn it', () => {
    expect(evaluateAchievements(ctx({ recentCompletions: mornings, tzOffsetMin: PACIFIC }))).toContain('early-bird');
  });

  it('the same instants judged in UTC (5 pm) do not', () => {
    expect(evaluateAchievements(ctx({ recentCompletions: mornings }))).not.toContain('early-bird');
  });
});

describe('Zero Overdue Week needs a week', () => {
  it('is not earned with fewer than 7 clean days', () => {
    expect(evaluateAchievements(ctx({ daysWithZeroOverdue: 0 }))).not.toContain('zero-overdue-week');
  });

  it('is earned after 7 clean days', () => {
    expect(evaluateAchievements(ctx({ daysWithZeroOverdue: 7 }))).toContain('zero-overdue-week');
  });
});

describe('First Steps', () => {
  it('is earned by the first completion', () => {
    expect(evaluateAchievements(ctx({ totalCompleted: 1 }))).toContain('first-blood');
  });
});
