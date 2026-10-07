import { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useQuestStore } from '../store/useQuestStore';
import { useUserStore } from '../store/useUserStore';
import { useCheckInStore } from '../store/useCheckInStore';
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
import { duckReact } from '../store/useMascotStore';
import { SpinWheel } from '../components/SpinWheel';
import { EndOfDayReflection } from '../components/EndOfDayReflection';
import { UpNextCard } from '../components/UpNextCard';
import { QuickAddBar } from '../components/QuickAddBar';
import { useToastStore } from '../components/Toasts';
import { useAchievementsStore } from '../store/useAchievementsStore';
import { api } from '../lib/api';
import { spawnConfetti } from '../lib/confetti';
import { levelFromXP } from '../lib/levels';
import { sfxComplete, sfxAchievement, sfxLevelUp } from '../lib/sfx';
import { type Quest } from '../lib/api';
import type { LucideIcon } from 'lucide-react';
import { BatteryMedium, ChevronDown, ChevronRight, Dices, Flame, LifeBuoy, Plus, Star } from 'lucide-react';
import { achievementIcon } from '../lib/achievementCatalog';

/** How many quests Today lists before "show more". */
const TOP_N = 7;

/** A slim, tappable line for something that wants attention but isn't an alarm. */
function NoticeRow({ to, icon: Icon, title, sub, tone }: { to: string; icon: LucideIcon; title: string; sub: string; tone?: string }) {
  return (
    <Link to={to} className="flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-white/[0.025]">
      <Icon size={18} className="shrink-0" style={{ color: tone ?? 'var(--color-primary)' }} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block truncate text-xs text-(--color-muted)">{sub}</span>
      </span>
      <ChevronRight size={16} className="shrink-0 text-(--color-muted)" aria-hidden />
    </Link>
  );
}

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
  const [showAll, setShowAll] = useState(false);

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
    sfxComplete();

    pushToast({
      icon: Star,
      title: `+${result.xpAwarded} XP`,
      sub: `Quest completed`,
      variant: 'xp',
    });

    if (result.streakEvent === 'extended' && [3, 5, 7, 10, 14, 21, 30].includes(result.newStreak)) {
      pushToast({
        icon: Flame,
        title: `${result.newStreak}-day streak!`,
        sub: 'Keep the momentum.',
        variant: 'streak',
      });
    } else if (result.streakEvent === 'started') {
      pushToast({
        icon: Flame,
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
        setLevelUp(newLevel);
        duckReact('levelUp');
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

  const hour = new Date().getHours();
  const greeting = hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  // The list here is the short one: what ranks highest right now. The whole
  // backlog lives on the Quests page.
  const shown = showAll ? quests : quests.slice(0, TOP_N);

  return (
    <>
      <div className="page page-wide">
        <header>
          <p className="text-[13px] font-medium text-(--color-muted)">{dateLabel}</p>
          <h1 className="page-title mt-0.5">{greeting}</h1>
          <p className="mt-1.5 text-sm text-(--color-muted)">
            {quests.length === 0
              ? 'Nothing on the list yet.'
              : `${quests.length} active ${quests.length === 1 ? 'quest' : 'quests'}`}
            {completionsToday > 0 && ` · ${completionsToday} done today`}
          </p>
        </header>

        <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1fr)_288px]">
          <div className="min-w-0">
            {/* What should I do right now? The scheduler answers on arrival. */}
            <UpNextCard onCompleteQuest={handleComplete} />

            {(!checkIn || overdueCount > 0) && (
              <div className="panel rows mt-3">
                {!checkIn && (
                  <NoticeRow
                    to="/checkin"
                    icon={BatteryMedium}
                    title="Check in for today"
                    sub="Your energy and free time set how much gets planned"
                  />
                )}
                {overdueCount > 0 && (
                  <NoticeRow
                    to="/rescue"
                    icon={LifeBuoy}
                    tone="var(--color-fire)"
                    title={`${overdueCount} overdue`}
                    sub="Push a date, finish one, or drop one"
                  />
                )}
              </div>
            )}

            {/* Zero-friction capture: "Write report 2h by fri #work !high" */}
            <QuickAddBar />

            <EndOfDayReflection completionsToday={completionsToday} />

            <section className="mt-7">
              <div className="mb-2.5 flex items-center gap-2">
                <h2 className="section-label flex-1">Top quests</h2>
                {quests.length > 1 && (
                  <button type="button" onClick={() => setSpinOpen(true)} className="btn-quiet h-8 min-h-0 px-2.5 text-xs">
                    <Dices size={14} aria-hidden /> Pick for me
                  </button>
                )}
                <Link to="/quests" className="btn-quiet h-8 min-h-0 px-2.5 text-xs">
                  All quests <ChevronRight size={14} aria-hidden />
                </Link>
              </div>

              {quests.length > 0 ? (
                <div className="panel rows overflow-hidden">
                  <AnimatePresence initial={false}>
                    {shown.map((q) => (
                      <div key={q.id} data-quest-id={q.id}>
                        <QuestCard
                          quest={q}
                          onComplete={() => handleComplete(q.id)}
                          onEdit={() => openEdit(q)}
                          onOpen={() => setDetailQuest(q)}
                          onDelete={() => {
                            if (confirm('Remove this quest?')) remove(q.id);
                          }}
                        />
                      </div>
                    ))}
                  </AnimatePresence>
                  {quests.length > TOP_N && (
                    <button
                      type="button"
                      onClick={() => setShowAll((v) => !v)}
                      className="flex w-full items-center justify-center gap-1.5 px-3.5 py-2.5 text-[13px] font-semibold text-(--color-muted) transition-colors hover:bg-white/[0.025] hover:text-(--color-text)"
                    >
                      {showAll ? 'Show fewer' : `Show ${quests.length - TOP_N} more`}
                      <ChevronDown size={14} className={showAll ? 'rotate-180' : ''} aria-hidden />
                    </button>
                  )}
                </div>
              ) : (
                <div className="panel px-5 py-10 text-center">
                  <p className="font-semibold">No active quests</p>
                  <p className="mt-1 text-sm text-(--color-muted)">Type one in the box above, or add one with every detail.</p>
                  <button type="button" onClick={openNew} className="btn-primary mt-4">
                    <Plus size={16} strokeWidth={2.5} aria-hidden /> New quest
                  </button>
                </div>
              )}
            </section>

            <DailySection onEdit={openEdit} />

            <CompletedSection />
          </div>

          <aside className="flex min-w-0 flex-col gap-4">
            <StatsRow />
            <WeekChart />
            <BadgesPanel />
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
          // Scroll the picked quest into view and flash its row. It may sit
          // below the short list, so open the list first.
          setShowAll(true);
          setTimeout(() => {
            const el = document.querySelector(`[data-quest-id="${id}"]`);
            if (!(el instanceof HTMLElement)) return;
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.style.transition = 'background-color 0.4s';
            el.style.backgroundColor = 'color-mix(in srgb, var(--color-primary) 16%, transparent)';
            setTimeout(() => (el.style.backgroundColor = ''), 1600);
          }, 60);
        }}
      />
    </>
  );
}
