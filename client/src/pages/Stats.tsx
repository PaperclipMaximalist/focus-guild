import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useUserStore } from '../store/useUserStore';
import { useQuestStore } from '../store/useQuestStore';
import { useAchievementsStore } from '../store/useAchievementsStore';
import { LevelBadge } from '../components/LevelBadge';
import { LEVELS } from '../lib/levels';

const CATEGORY_COLORS: Record<string, string> = {
  deep_work: 'var(--color-primary)',
  comms: 'var(--color-teal)',
  admin: 'var(--color-gold)',
  creative: 'var(--color-fire)',
  other: 'var(--color-muted)',
};

const CATEGORY_LABELS: Record<string, string> = {
  deep_work: '🧠 Deep work',
  comms: '💬 Comms',
  admin: '📋 Admin',
  creative: '🎨 Creative',
  other: '🗂️ Other',
};

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function weekdayLabel(d: Date): string {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]!;
}

export default function Stats() {
  const { user, refresh } = useUserStore();
  const { completed, loadCompleted } = useQuestStore();
  const { unlocked, load: loadAchievements } = useAchievementsStore();

  useEffect(() => {
    refresh();
    loadCompleted();
    loadAchievements();
  }, [refresh, loadCompleted, loadAchievements]);

  // ── Category breakdown (last 30 days of completions) ────────────────────
  const categoryBreakdown = useMemo(() => {
    const cutoff = Date.now() - 30 * 86_400_000;
    const m = new Map<string, number>();
    completed.forEach((q) => {
      if (!q.completedAt) return;
      if (new Date(q.completedAt).getTime() < cutoff) return;
      const c = q.category ?? 'other';
      m.set(c, (m.get(c) ?? 0) + 1);
    });
    const total = [...m.values()].reduce((s, n) => s + n, 0);
    const rows = [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([cat, count]) => ({
        cat,
        count,
        pct: total > 0 ? (count / total) * 100 : 0,
      }));
    return { rows, total };
  }, [completed]);

  // ── Last 7 days completion bar ───────────────────────────────────────────
  const last7Days = useMemo(() => {
    const days: Array<{ date: Date; key: string; count: number }> = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      days.push({ date: d, key: dayKey(d), count: 0 });
    }
    const idx = new Map(days.map((d, i) => [d.key, i]));
    completed.forEach((q) => {
      if (!q.completedAt) return;
      const k = dayKey(new Date(q.completedAt));
      const i = idx.get(k);
      if (i !== undefined) days[i]!.count += 1;
    });
    const max = Math.max(1, ...days.map((d) => d.count));
    return { days, max };
  }, [completed]);

  // ── Headline stats ──────────────────────────────────────────────────────
  const last7DaysTotal = last7Days.days.reduce((s, d) => s + d.count, 0);
  const last7DaysAvg = (last7DaysTotal / 7).toFixed(1);

  if (!user) {
    return <div className="p-8 text-slate-400">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 flex flex-col gap-5">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-100">Your Guild Stats</h1>
        <Link to="/" className="text-sm text-violet-400 hover:text-violet-300">
          ← Today
        </Link>
      </header>

      <LevelBadge
        totalXP={user.totalXP}
        currentStreak={user.currentStreak}
        multiplier={user.multiplier}
      />

      {/* Headline stat row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatCard label="Done this week" value={last7DaysTotal} />
        <StatCard label="Daily avg (7d)" value={last7DaysAvg} />
        <StatCard label="Total done" value={completed.length} />
        <StatCard label="Achievements" value={unlocked.length} />
      </div>

      {/* Last 7 days bar chart */}
      <section
        className="rounded-(--radius-card) border p-4"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
      >
        <h2 className="text-base font-semibold mb-3" style={{ color: 'var(--color-text)' }}>
          📈 Last 7 days
        </h2>
        <div className="flex items-end justify-between gap-1.5 h-32">
          {last7Days.days.map(({ date, count }, i) => {
            const isToday = i === last7Days.days.length - 1;
            const h = (count / last7Days.max) * 100;
            return (
              <div key={i} className="flex flex-col items-center justify-end gap-1 flex-1">
                <span className="text-[10px] font-bold" style={{ color: 'var(--color-text)' }}>
                  {count > 0 ? count : ''}
                </span>
                <div
                  className="w-full rounded-t-md transition-all"
                  style={{
                    height: `${Math.max(4, h)}%`,
                    background: count === 0
                      ? 'rgba(255,255,255,0.06)'
                      : isToday
                      ? 'var(--color-gold)'
                      : 'var(--color-primary)',
                    minHeight: 4,
                  }}
                />
                <span
                  className="text-[10px]"
                  style={{ color: isToday ? 'var(--color-gold)' : 'var(--color-muted)' }}
                >
                  {weekdayLabel(date)}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Category breakdown */}
      <section
        className="rounded-(--radius-card) border p-4"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
      >
        <h2 className="text-base font-semibold mb-3" style={{ color: 'var(--color-text)' }}>
          🏷️ Category mix
          <span className="ml-2 text-xs font-normal" style={{ color: 'var(--color-muted)' }}>
            ({categoryBreakdown.total} quests, last 30 days)
          </span>
        </h2>

        {categoryBreakdown.total === 0 ? (
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            No completed quests yet — finish a few to see your mix.
          </p>
        ) : (
          <>
            {/* Stacked horizontal bar */}
            <div
              className="flex h-3 rounded-full overflow-hidden mb-3"
              style={{ background: 'rgba(255,255,255,0.06)' }}
            >
              {categoryBreakdown.rows.map((r) => (
                <div
                  key={r.cat}
                  style={{
                    width: `${r.pct}%`,
                    background: CATEGORY_COLORS[r.cat] ?? CATEGORY_COLORS.other,
                  }}
                  title={`${CATEGORY_LABELS[r.cat] ?? r.cat}: ${r.count}`}
                />
              ))}
            </div>
            {/* Legend */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {categoryBreakdown.rows.map((r) => (
                <div
                  key={r.cat}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: CATEGORY_COLORS[r.cat] ?? CATEGORY_COLORS.other }}
                    />
                    <span style={{ color: 'var(--color-text)' }}>
                      {CATEGORY_LABELS[r.cat] ?? r.cat}
                    </span>
                  </span>
                  <span style={{ color: 'var(--color-muted)' }}>
                    {r.count} <span className="opacity-60">· {r.pct.toFixed(0)}%</span>
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Achievements recap (clickable) */}
      <section
        className="rounded-(--radius-card) border p-4"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
      >
        <h2 className="text-base font-semibold mb-3" style={{ color: 'var(--color-text)' }}>
          🏆 Achievements
        </h2>
        {unlocked.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            None yet. Complete quests, build streaks, and try the Wheel.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {unlocked.map((a) => (
              <span
                key={a.slug}
                title={`${a.title} — ${a.description}`}
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
                style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--color-gold)' }}
              >
                {a.icon} {a.title}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Guild ranks */}
      <section
        className="rounded-(--radius-card) border p-4"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
      >
        <h2 className="text-base font-semibold mb-3" style={{ color: 'var(--color-text)' }}>
          🎖 Guild Ranks
        </h2>
        <div className="flex flex-col gap-2">
          {LEVELS.map((l) => {
            const reached = user.totalXP >= l.xpRequired;
            return (
              <div
                key={l.level}
                className={`flex items-center justify-between rounded-lg px-3 py-2 transition-opacity ${
                  reached ? '' : 'opacity-40'
                }`}
                style={{ background: reached ? 'rgba(255,255,255,0.04)' : 'transparent' }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ background: l.accent }}
                  />
                  <div>
                    <div
                      className="text-sm font-medium"
                      style={{ color: reached ? l.accent : 'var(--color-muted)' }}
                    >
                      {l.title}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--color-muted)' }}>
                      Level {l.level}
                    </div>
                  </div>
                </div>
                <div className="text-sm" style={{ color: 'var(--color-muted)' }}>
                  {l.xpRequired.toLocaleString()} XP
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      className="rounded-(--radius-card) border px-3 py-3 text-center"
      style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
    >
      <p className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>
        {value}
      </p>
      <p className="text-[0.7rem] uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>
        {label}
      </p>
    </div>
  );
}
