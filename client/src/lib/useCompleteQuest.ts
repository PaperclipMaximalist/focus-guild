import { Flame, Star, TriangleAlert } from 'lucide-react';
import { useQuestStore } from '../store/useQuestStore';
import { useUserStore } from '../store/useUserStore';
import { useAchievementsStore } from '../store/useAchievementsStore';
import { useLevelUpStore } from '../store/useLevelUpStore';
import { useToastStore } from '../components/Toasts';
import type { CompleteQuestResult } from './api';
import { duckReact } from '../store/useMascotStore';
import { achievementIcon } from './achievementCatalog';
import { spawnConfetti } from './confetti';
import { levelFromXP } from './levels';
import { sfxAchievement, sfxComplete, sfxLevelUp } from './sfx';

/**
 * The one way a quest gets completed: store call, XP, sounds, toasts, streak,
 * trophies and the level-up splash. Rethrows on failure so a row can put its
 * tick back.
 */
export function useCompleteQuest() {
  const user = useUserStore((s) => s.user);
  const applyXPGain = useUserStore((s) => s.applyXPGain);
  const { complete, completeDaily } = useQuestStore();
  const pushToast = useToastStore((s) => s.push);
  const addUnlockedToStore = useAchievementsStore((s) => s.addUnlocked);

  return async (id: string, opts?: { daily?: boolean; sub?: string }): Promise<CompleteQuestResult> => {
    if (!user) throw new Error('No member');
    const prevLevel = levelFromXP(user.totalXP).level;
    let result: CompleteQuestResult;
    try {
      result = opts?.daily ? await completeDaily(id) : await complete(id);
    } catch (e) {
      // The row puts its tick back; say why.
      pushToast({ icon: TriangleAlert, title: 'Could not complete that quest', sub: 'Nothing changed. Check your connection and try again.', variant: 'error' });
      throw e;
    }
    applyXPGain(result.totalXP, result.newStreak, result.newMultiplier);
    sfxComplete();

    pushToast({
      icon: Star,
      title: `+${result.xpAwarded} XP`,
      sub: opts?.sub ?? 'Quest complete',
      variant: 'xp',
    });

    if (result.streakEvent === 'extended' && [3, 5, 7, 10, 14, 21, 30].includes(result.newStreak)) {
      pushToast({
        icon: Flame,
        title: `${result.newStreak}-day streak`,
        sub: 'Keep the momentum.',
        variant: 'streak',
      });
    } else if (result.streakEvent === 'started') {
      pushToast({
        icon: Flame,
        title: 'Streak started',
        sub: 'Show up tomorrow to keep it.',
        variant: 'streak',
      });
    }

    if (result.newlyUnlocked && result.newlyUnlocked.length > 0) {
      addUnlockedToStore(
        result.newlyUnlocked.map((a) => ({ ...a, unlockedAt: new Date().toISOString() })),
      );
      result.newlyUnlocked.forEach((a, idx) => {
        setTimeout(() => {
          sfxAchievement();
          pushToast({
            icon: achievementIcon(a.slug),
            title: `Achievement unlocked: ${a.title}`,
            sub: `+${a.xpReward} XP — ${a.description}`,
            variant: 'badge',
          });
        }, 400 + idx * 350);
      });
    }

    const newLevel = levelFromXP(result.totalXP).level;
    if (newLevel > prevLevel) {
      setTimeout(() => {
        sfxLevelUp();
        useLevelUpStore.getState().show(newLevel);
        duckReact('levelUp');
        spawnConfetti();
      }, 500);
    }
    return result;
  };
}
