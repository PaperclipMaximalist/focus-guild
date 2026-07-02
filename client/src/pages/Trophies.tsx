/**
 * Trophy Room — a full-page gallery of every achievement, grouped, with
 * locked/unlocked state, XP rewards, unlock dates, and hints for what's
 * still out there to earn.
 */

import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAchievementsStore } from '../store/useAchievementsStore';
import {
  ACHIEVEMENT_CATALOG,
  ACHIEVEMENT_GROUPS,
  TOTAL_ACHIEVEMENTS,
  type AchievementMeta,
} from '../lib/achievementCatalog';

export default function Trophies() {
  const { unlocked, loaded, load } = useAchievementsStore();

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  const unlockedMap = useMemo(
    () => new Map(unlocked.map((a) => [a.slug, a.unlockedAt])),
    [unlocked],
  );

  const unlockedCount = ACHIEVEMENT_CATALOG.filter((a) => unlockedMap.has(a.slug)).length;
  const earnedXp = ACHIEVEMENT_CATALOG
    .filter((a) => unlockedMap.has(a.slug))
    .reduce((s, a) => s + a.xp, 0);
  const pct = Math.round((unlockedCount / TOTAL_ACHIEVEMENTS) * 100);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 flex flex-col gap-5 pb-24">
      <header className="flex items-baseline justify-between gap-3">
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
          🏆 Trophy Room
        </h1>
        <Link to="/" className="text-sm" style={{ color: 'var(--color-primary)' }}>
          ← Today
        </Link>
      </header>

      {/* Progress hero */}
      <div
        className="rounded-(--radius-card) border p-5"
        style={{
          borderColor: 'var(--color-border)',
          background: 'linear-gradient(135deg, rgba(139,92,246,0.12), rgba(236,72,153,0.06))',
        }}
      >
        <div className="flex items-end justify-between gap-3 mb-2">
          <div>
            <div className="text-3xl font-extrabold" style={{ color: 'var(--color-text)' }}>
              {unlockedCount}<span className="text-lg font-bold" style={{ color: 'var(--color-muted)' }}> / {TOTAL_ACHIEVEMENTS}</span>
            </div>
            <div className="text-xs" style={{ color: 'var(--color-muted)' }}>trophies earned</div>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold" style={{ color: 'var(--color-gold)' }}>
              ⭐ {earnedXp.toLocaleString()}
            </div>
            <div className="text-xs" style={{ color: 'var(--color-muted)' }}>bonus XP from trophies</div>
          </div>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-white/8">
          <motion.div
            className="h-full rounded-full"
            style={{ background: 'linear-gradient(90deg, var(--color-primary), #ec4899)' }}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        </div>
        <p className="mt-2 text-xs text-center" style={{ color: 'var(--color-muted)' }}>
          {pct === 100 ? '🎉 Every trophy claimed. Legendary.' : `${pct}% of the guild's honors unlocked`}
        </p>
      </div>

      {/* Groups */}
      {ACHIEVEMENT_GROUPS.map((group) => {
        const items = ACHIEVEMENT_CATALOG.filter((a) => a.group === group);
        const groupUnlocked = items.filter((a) => unlockedMap.has(a.slug)).length;
        return (
          <section key={group}>
            <div className="flex items-baseline justify-between mb-2 px-1">
              <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>
                {group}
              </h2>
              <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                {groupUnlocked}/{items.length}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {items.map((a) => (
                <TrophyCard key={a.slug} meta={a} unlockedAt={unlockedMap.get(a.slug)} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function TrophyCard({ meta, unlockedAt }: { meta: AchievementMeta; unlockedAt?: string }) {
  const isUnlocked = unlockedAt !== undefined;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="relative flex flex-col gap-1.5 rounded-[12px] border p-3.5 overflow-hidden"
      style={{
        borderColor: isUnlocked ? 'var(--color-gold)' : 'var(--color-border)',
        background: isUnlocked ? 'rgba(245,158,11,0.07)' : 'var(--color-surface)',
        opacity: isUnlocked ? 1 : 0.55,
      }}
    >
      {isUnlocked && (
        <div
          className="absolute -right-6 -top-6 h-16 w-16 rounded-full blur-xl"
          style={{ background: 'rgba(245,158,11,0.25)' }}
        />
      )}
      <div className="flex items-center justify-between">
        <span className={`text-3xl leading-none ${isUnlocked ? '' : 'grayscale'}`}>{meta.icon}</span>
        {meta.xp > 0 && (
          <span
            className="text-[0.62rem] font-bold rounded-full px-1.5 py-0.5"
            style={{
              background: isUnlocked ? 'rgba(245,158,11,0.18)' : 'rgba(255,255,255,0.05)',
              color: isUnlocked ? 'var(--color-gold)' : 'var(--color-muted)',
            }}
          >
            +{meta.xp} XP
          </span>
        )}
      </div>
      <div
        className="text-sm font-bold leading-tight"
        style={{ color: isUnlocked ? 'var(--color-gold)' : 'var(--color-text)' }}
      >
        {isUnlocked ? meta.name : meta.name}
      </div>
      <div className="text-[0.7rem] leading-snug" style={{ color: 'var(--color-muted)' }}>
        {meta.desc}
      </div>
      <div className="mt-0.5 text-[0.62rem] font-semibold" style={{ color: isUnlocked ? 'var(--color-green)' : 'var(--color-muted)' }}>
        {isUnlocked
          ? `✓ Unlocked${unlockedAt ? ` · ${new Date(unlockedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}`
          : '🔒 Locked'}
      </div>
    </motion.div>
  );
}
