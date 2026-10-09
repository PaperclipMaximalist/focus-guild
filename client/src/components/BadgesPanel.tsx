import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAchievementsStore } from '../store/useAchievementsStore';
import { ACHIEVEMENT_CATALOG, TOTAL_ACHIEVEMENTS } from '../lib/achievementCatalog';
import { Trophy } from 'lucide-react';

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
    <div className="panel p-4">
      <div className="flex items-center justify-between gap-1.5">
        <h2 className="section-label">Trophies</h2>
        <span className="tnum text-xs text-(--color-muted)">
          {unlockedSlugs.size} of {TOTAL_ACHIEVEMENTS}
        </span>
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-2">
        {preview.map((b) => {
          const isUnlocked = unlockedSlugs.has(b.slug);
          return (
            <div
              key={b.slug}
              title={b.desc}
              className={`flex flex-col items-center gap-1.5 rounded-lg px-1 py-2.5 text-center ${
                isUnlocked ? 'bg-(--color-primary)/10 text-(--color-primary)' : 'bg-(--color-surface2) opacity-40'
              }`}
            >
              <b.icon size={20} strokeWidth={1.75} aria-hidden />
              <span
                className={`text-[11px] font-semibold leading-tight ${
                  isUnlocked ? 'text-(--color-text)' : 'text-(--color-muted)'
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
        className="btn-quiet mt-3 w-full text-xs"
      >
        <span className="inline-flex items-center gap-1.5"><Trophy size={14} strokeWidth={2} aria-hidden /> Trophy Room</span>
      </Link>
    </div>
  );
}
