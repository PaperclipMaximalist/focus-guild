import { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useQuestStore } from '../store/useQuestStore';
import { useUserStore } from '../store/useUserStore';
import { useCheckInStore } from '../store/useCheckInStore';
import { Header } from '../components/Header';
import { StatsRow } from '../components/StatsRow';
import { QuestCard } from '../components/QuestCard';
import { CompletedSection } from '../components/CompletedSection';
import { DailySection } from '../components/DailySection';
import { BadgesPanel } from '../components/BadgesPanel';
import { WeekChart } from '../components/WeekChart';
import { DeepStatsPanel } from '../components/DeepStatsPanel';
import { FAB } from '../components/FAB';
import { QuestModal } from '../components/QuestModal';
import { QuestDetail } from '../components/QuestDetail';
import { LevelUpSplash } from '../components/LevelUpSplash';
import { SpinWheel } from '../components/SpinWheel';
import { EndOfDayReflection } from '../components/EndOfDayReflection';
import { useToastStore } from '../components/Toasts';
import { useAchievementsStore } from '../store/useAchievementsStore';
import { api } from '../lib/api';
import { spawnConfetti } from '../lib/confetti';
import { levelFromXP } from '../lib/levels';
import { type Quest } from '../lib/api';

export default function Today() {
  const { quests, completed, load, loadCompleted, loadRecurring, complete, remove } = useQuestStore();
  const { user, applyXPGain } = useUserStore();
  const { today: checkIn, load: loadCheckIn } = useCheckInStore();
  const completionsToday = (() => {
    const t = new Date();
    return completed.filter((q) => {
      if (!q.completedAt) return false;
      const c = new Date(q.completedAt);
      return c.getFullYear() === t.getFullYear() && c.getMonth() === t.getMonth() && c.getDate() === t.getDate();
    }).length;
  })();
  const pushToast = useToastStore((s) => s.push);
  const addUnlockedToStore = useAchievementsStore((s) => s.addUnlocked);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Quest | null>(null);
  const [levelUp, setLevelUp] = useState<number | null>(null);
  const [spinOpen, setSpinOpen] = useState(false);
  const [overdueCount, setOverdueCount] = useState(0);
  const [detailQuest, setDetailQuest] = useState<Quest | null>(null);

  useEffect(() => {
    api.quests.rescue().then((r) => setOverdueCount(r.length)).catch(() => {});
  }, []);

  // Global keyboard shortcuts fire custom events; wire them here.
  useEffect(() => {
    const onNew = () => {
      setEditing(null);
      setModalOpen(true);
    };
    const onSpin = () => setSpinOpen(true);
    window.addEventListener('quest-modal:open', onNew);
    window.addEventListener('spin-wheel:open', onSpin);
    return () => {
      window.removeEventListener('quest-modal:open', onNew);
      window.removeEventListener('spin-wheel:open', onSpin);
    };
  }, []);

  useEffect(() => {
    load();
    loadCompleted();
    loadRecurring();
    loadCheckIn();
  }, [load, loadCompleted, loadRecurring, loadCheckIn]);

  const handleComplete = async (id: string) => {
    if (!user) return;
    const prevLevel = levelFromXP(user.totalXP).level;
    const result = await complete(id);
    applyXPGain(result.totalXP, result.newStreak, result.newMultiplier);

    pushToast({
      icon: '⭐',
      title: `+${result.xpAwarded} XP`,
      sub: `Quest completed`,
      variant: 'xp',
    });

    if (result.streakEvent === 'extended' && [3, 5, 7, 10, 14, 21, 30].includes(result.newStreak)) {
      pushToast({
        icon: '🔥',
        title: `${result.newStreak}-day streak!`,
        sub: 'Keep the momentum.',
        variant: 'streak',
      });
    } else if (result.streakEvent === 'started') {
      pushToast({
        icon: '🔥',
        title: 'Streak started!',
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
          pushToast({
            icon: a.icon,
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
        setLevelUp(newLevel);
        spawnConfetti();
      }, 500);
    }
  };

  const openNew = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (q: Quest) => {
    setEditing(q);
    setModalOpen(true);
  };

  return (
    <>
      <Header />

      <div className="mx-auto max-w-6xl px-4 pb-20">
        <StatsRow />

        {!checkIn && (
          <Link
            to="/checkin"
            className="mt-5 block rounded-(--radius-card) border border-amber-500/30 bg-amber-500/10 p-3 text-amber-200 transition hover:bg-amber-500/15"
          >
            ⚡ Daily check-in not done yet — tell the Guild your energy level →
          </Link>
        )}

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <Link
            to="/feed"
            className="flex items-center gap-3 rounded-(--radius-card) border border-(--color-border) bg-(--color-surface) px-4 py-3 transition hover:border-(--color-primary)/40 hover:bg-(--color-surface2)"
          >
            <span className="text-2xl">📅</span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm" style={{ color: 'var(--color-text)' }}>Guild Feed</p>
              <p className="text-xs truncate" style={{ color: 'var(--color-muted)' }}>Auto-scheduled day →</p>
            </div>
          </Link>

          <button
            onClick={() => setSpinOpen(true)}
            className="flex items-center gap-3 rounded-(--radius-card) border border-(--color-border) bg-(--color-surface) px-4 py-3 transition hover:border-(--color-gold)/40 hover:bg-(--color-surface2) text-left"
          >
            <span className="text-2xl">🎲</span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm" style={{ color: 'var(--color-text)' }}>Spin the Wheel</p>
              <p className="text-xs truncate" style={{ color: 'var(--color-muted)' }}>Random quest pick →</p>
            </div>
          </button>

          <Link
            to="/rescue"
            className="flex items-center gap-3 rounded-(--radius-card) border px-4 py-3 transition hover:bg-(--color-surface2)"
            style={{
              background: overdueCount > 0 ? 'rgba(239,68,68,0.06)' : 'var(--color-surface)',
              borderColor: overdueCount > 0 ? 'rgba(239,68,68,0.35)' : 'var(--color-border)',
            }}
          >
            <span className="text-2xl">🚑</span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm" style={{ color: 'var(--color-text)' }}>
                Rescue {overdueCount > 0 && <span className="text-(--color-fire)">· {overdueCount}</span>}
              </p>
              <p className="text-xs truncate" style={{ color: 'var(--color-muted)' }}>
                {overdueCount > 0 ? `${overdueCount} overdue →` : 'Overdue triage →'}
              </p>
            </div>
          </Link>
        </div>

        <EndOfDayReflection completionsToday={completionsToday} />

        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_300px]">
          {/* Active quests */}
          <div>
            <div className="mb-3.5 flex items-center justify-between gap-2.5">
              <div className="flex items-center gap-1.5 text-base font-bold">⚡ Active Quests</div>
              <Link to="/stats" className="text-xs text-(--color-muted) hover:text-(--color-text)">
                View ranks →
              </Link>
            </div>

            <div className="flex flex-col gap-2.5">
              <AnimatePresence>
                {quests.map((q) => (
                  <QuestCard
                    key={q.id}
                    quest={q}
                    onComplete={() => handleComplete(q.id)}
                    onEdit={() => openEdit(q)}
                    onOpen={() => setDetailQuest(q)}
                    onDelete={() => {
                      if (confirm('Remove this quest?')) remove(q.id);
                    }}
                  />
                ))}
              </AnimatePresence>
            </div>

            {quests.length === 0 && (
              <div className="rounded-(--radius-card) border border-(--color-border) bg-(--color-surface) px-5 py-12 text-center text-(--color-muted)">
                <div className="mb-3 text-5xl">🗺️</div>
                <p>
                  No active quests yet.
                  <br />
                  Tap the <span className="rounded bg-white/10 px-1.5 py-0.5 font-semibold">+</span> button to begin.
                </p>
              </div>
            )}

            <DailySection onEdit={openEdit} />

            <CompletedSection />
          </div>

          {/* Sidebar */}
          <aside className="flex flex-col gap-4">
            <BadgesPanel />
            <WeekChart />
            <DeepStatsPanel />
          </aside>
        </div>
      </div>

      <FAB onClick={openNew} />
      <QuestModal open={modalOpen} onClose={() => setModalOpen(false)} editing={editing} />
      <QuestDetail
        open={!!detailQuest}
        quest={detailQuest}
        onClose={() => setDetailQuest(null)}
        onEdit={() => {
          if (detailQuest) openEdit(detailQuest);
          setDetailQuest(null);
        }}
      />
      <LevelUpSplash newLevel={levelUp} onDismiss={() => setLevelUp(null)} />
      <SpinWheel
        open={spinOpen}
        onClose={() => setSpinOpen(false)}
        onAccept={(id) => {
          // Scroll the picked quest into view & flash the card.
          const el = document.querySelector(`[data-quest-id="${id}"]`);
          if (el instanceof HTMLElement) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.style.transition = 'box-shadow 0.4s';
            el.style.boxShadow = '0 0 0 3px var(--color-gold)';
            setTimeout(() => (el.style.boxShadow = ''), 1600);
          }
        }}
      />
    </>
  );
}
