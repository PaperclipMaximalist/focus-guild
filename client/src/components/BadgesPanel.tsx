import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAchievementsStore } from '../store/useAchievementsStore';
import { ACHIEVEMENT_CATALOG, TOTAL_ACHIEVEMENTS } from '../lib/achievementCatalog';

export function BadgesPanel() {
  const { unlocked, loaded, load } = useAchievementsStore();

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  const unlockedSlugs = new Set(unlocked.map((a) => a.slug));

  // Show unlocked first, then locked — capped to a tidy preview grid.
  const ordered = [...ACHIEVEMENT_CATALOG].sort((a, b) => {
    const au = unlockedSlugs.has(a.slug) ? 0 : 1;
    const bu = unlockedSlugs.has(b.slug) ? 0 : 1;
    return au - bu;
  });
  const preview = ordered.slice(0, 9);

  return (
    <div className="rounded-(--radius-card) border border-(--color-border) bg-(--color-surface) p-4">
      <div className="flex items-center justify-between gap-1.5 text-base font-bold">
        <span>🏅 Achievements</span>
        <span className="text-xs font-normal text-(--color-muted)">
          {unlockedSlugs.size}/{TOTAL_ACHIEVEMENTS}
        </span>
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-2">
        {preview.map((b) => {
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
      <Link
        to="/trophies"
        className="mt-3 block rounded-lg border py-2 text-center text-xs font-semibold transition hover:bg-white/5"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-primary)' }}
      >
        🏆 Open Trophy Room →
      </Link>
    </div>
  );
}
