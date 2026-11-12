import { Flame, Star, TriangleAlert, Undo2 } from 'lucide-react';
import { useQuestStore } from '../store/useQuestStore';
import { useUserStore } from '../store/useUserStore';
import { useAchievementsStore } from '../store/useAchievementsStore';
import { useLevelUpStore } from '../store/useLevelUpStore';
import { useToastStore } from '../components/Toasts';
import { ApiRequestError, type CompleteQuestResult } from './api';
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
  const { complete, completeDaily, uncomplete, uncompleteDaily } = useQuestStore();
  const pushToast = useToastStore((s) => s.push);
  const addUnlockedToStore = useAchievementsStore((s) => s.addUnlocked);
  const removeUnlockedFromStore = useAchievementsStore((s) => s.removeUnlocked);

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

    const newLevel = levelFromXP(result.totalXP).level;
    let levelUpTimer: ReturnType<typeof setTimeout> | undefined;

    // A mis-tap is taken back here, not asked about beforehand. Trophy toasts
    // and the splash have been shown; what Undo restores is the state behind them.
    const undo = async () => {
      if (levelUpTimer) clearTimeout(levelUpTimer);
      if (newLevel > prevLevel && useLevelUpStore.getState().level === newLevel) {
        useLevelUpStore.getState().dismiss();
      }
      try {
        const back = opts?.daily ? await uncompleteDaily(id) : await uncomplete(id);
        // Absolute values, whatever the action's name says.
        useUserStore.getState().applyXPGain(back.totalXP, back.currentStreak, back.multiplier);
        removeUnlockedFromStore(back.relockedAchievements);
        duckReact('undo');
        pushToast({ icon: Undo2, title: 'Taken back', sub: `${result.quest.title} is on your list again`, variant: 'xp' });
        window.dispatchEvent(new CustomEvent('fg:quest-uncompleted', { detail: { questId: id } }));
      } catch (e) {
        const code = e instanceof ApiRequestError ? e.code : '';
        pushToast({
          icon: TriangleAlert,
          title: 'Could not take that back',
          sub:
            code === 'SUPERSEDED'
              ? 'Something was completed since, so this completion stands.'
              : code === 'TOO_LATE'
                ? 'It has been more than a few minutes, so this completion stands.'
                : 'The completion stands.',
          variant: 'error',
        });
      }
    };

    pushToast({
      icon: Star,
      title: `+${result.xpAwarded} XP`,
      sub: opts?.sub ?? 'Quest complete',
      variant: 'xp',
      action: { label: 'Undo', run: () => void undo() },
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

    if (newLevel > prevLevel) {
      levelUpTimer = setTimeout(() => {
        sfxLevelUp();
        useLevelUpStore.getState().show(newLevel);
        duckReact('levelUp');
        spawnConfetti();
      }, 500);
    }
    return result;
  };
}
