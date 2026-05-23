import { useEffect } from 'react';
import { useAchievementsStore } from '../store/useAchievementsStore';

const BADGES = [
  { slug: 'early-bird',        icon: '🌅', name: 'Early Bird',    desc: 'Top quest before 10am, 3 days running' },
  { slug: 'brain-drain',       icon: '🧠', name: 'Brain Drain',   desc: 'Mental-load 9+ quest in one sitting' },
  { slug: 'zero-overdue-week', icon: '✨', name: 'Zero Overdue',  desc: 'A full week with no overdue quests' },
  { slug: 'time-whisperer',    icon: '⏱️', name: 'Time Whisperer',desc: '5 quests in a row estimated within 15%' },
  { slug: 'chaos-agent',       icon: '🎲', name: 'Chaos Agent',   desc: 'Used Spin the Wheel 10 times' },
  { slug: 'rescue-ranger',     icon: '🚑', name: 'Rescue Ranger', desc: 'Cleared all Rescue quests in one session' },
];

export function BadgesPanel() {
  const { unlocked, loaded, load } = useAchievementsStore();

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  const unlockedSlugs = new Set(unlocked.map((a) => a.slug));

  return (
    <div className="rounded-(--radius-card) border border-(--color-border) bg-(--color-surface) p-4">
      <div className="flex items-center justify-between gap-1.5 text-base font-bold">
        <span>🏅 Achievements</span>
        <span className="text-xs font-normal text-(--color-muted)">
          {unlockedSlugs.size}/{BADGES.length}
        </span>
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-2">
        {BADGES.map((b) => {
          const isUnlocked = unlockedSlugs.has(b.slug);
          return (
            <div
              key={b.slug}
              title={b.desc}
              className={`flex flex-col items-center gap-1 rounded-[10px] border p-2.5 text-center transition ${
                isUnlocked
                  ? 'border-(--color-gold) bg-amber-500/6 hover:scale-105'
                  : 'border-(--color-border) opacity-30 grayscale'
              }`}
            >
              <span className="text-2xl leading-none">{b.icon}</span>
              <span
                className={`text-[0.6rem] font-semibold leading-tight ${
                  isUnlocked ? 'text-(--color-gold)' : 'text-(--color-muted)'
                }`}
              >
                {b.name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
