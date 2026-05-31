import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUserStore } from '../store/useUserStore';
import { useQuestStore } from '../store/useQuestStore';
import { useAchievementsStore } from '../store/useAchievementsStore';
import { LevelBadge } from '../components/LevelBadge';
import { LEVELS } from '../lib/levels';
import { api, type XPEventDTO } from '../lib/api';

const XP_WINDOW_DAYS = 14;

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
  const [xpEvents, setXpEvents] = useState<XPEventDTO[] | null>(null);

  useEffect(() => {
    refresh();
    loadCompleted();
    loadAchievements();
    api.users.xpEvents().then(setXpEvents).catch(() => setXpEvents([]));
  }, [refresh, loadCompleted, loadAchievements]);

  // ── XP over time (last 14 days: daily bars + cumulative line) ────────────
  const xpTrend = useMemo(() => {
    const days: Array<{ date: Date; key: string; gained: number }> = [];
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (XP_WINDOW_DAYS - 1));
    for (let i = 0; i < XP_WINDOW_DAYS; i += 1) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push({ date: d, key: dayKey(d), gained: 0 });
    }
    const idx = new Map(days.map((d, i) => [d.key, i]));
    const startMs = start.getTime();
    let cumBefore = 0;
    (xpEvents ?? []).forEach((e) => {
      const t = new Date(e.createdAt);
      if (t.getTime() < startMs) {
        cumBefore += e.amount;
        return;
      }
      const i = idx.get(dayKey(t));
      if (i !== undefined) days[i]!.gained += e.amount;
    });
    let running = cumBefore;
    const points = days.map((d) => {
      running += d.gained;
      return { ...d, cumulative: running };
    });
    const maxGained = Math.max(1, ...points.map((p) => p.gained));
    const periodTotal = points.reduce((s, p) => s + p.gained, 0);
    return { points, maxGained, cumBefore, cumNow: running, periodTotal };
  }, [xpEvents]);

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

      {/* XP over time */}
      <section
        className="rounded-(--radius-card) border p-4"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
      >
        <h2 className="text-base font-semibold mb-3" style={{ color: 'var(--color-text)' }}>
          ⚡ XP over time
          <span className="ml-2 text-xs font-normal" style={{ color: 'var(--color-muted)' }}>
            (last {XP_WINDOW_DAYS} days)
          </span>
        </h2>
        {xpEvents === null ? (
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            Loading XP history…
          </p>
        ) : xpTrend.periodTotal === 0 ? (
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            No XP earned in this window — complete a quest to start the climb.
          </p>
        ) : (
          <XPTrendChart trend={xpTrend} />
        )}
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

interface XPTrend {
  points: Array<{ date: Date; key: string; gained: number; cumulative: number }>;
  maxGained: number;
  cumBefore: number;
  cumNow: number;
  periodTotal: number;
}

function XPTrendChart({ trend }: { trend: XPTrend }) {
  const { points, maxGained, cumBefore, cumNow, periodTotal } = trend;
  const W = 320;
  const H = 150;
  const PAD_L = 6;
  const PAD_R = 6;
  const PAD_T = 10;
  const PAD_B = 18;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const n = points.length;
  const slot = plotW / n;

  const lo = cumBefore;
  const hi = Math.max(cumNow, lo + 1);
  const lineY = (v: number) => PAD_T + plotH - ((v - lo) / (hi - lo)) * plotH;
  const slotCenter = (i: number) => PAD_L + i * slot + slot / 2;

  const linePts = points.map((p, i) => `${slotCenter(i).toFixed(1)},${lineY(p.cumulative).toFixed(1)}`).join(' ');

  return (
    <div>
      <div className="flex items-baseline gap-3 mb-2 text-xs" style={{ color: 'var(--color-muted)' }}>
        <span>
          <span className="font-bold" style={{ color: 'var(--color-gold)' }}>+{periodTotal.toLocaleString()}</span> XP this period
        </span>
        <span>
          {cumBefore.toLocaleString()} → <span className="font-bold" style={{ color: 'var(--color-teal)' }}>{cumNow.toLocaleString()}</span> total
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="XP earned per day with cumulative total">
        {/* daily XP bars */}
        {points.map((p, i) => {
          const isToday = i === n - 1;
          const bh = (p.gained / maxGained) * plotH;
          const bw = slot * 0.55;
          const x = PAD_L + i * slot + (slot - bw) / 2;
          const y = PAD_T + plotH - bh;
          return (
            <rect
              key={p.key}
              x={x}
              y={p.gained > 0 ? y : PAD_T + plotH - 1.5}
              width={bw}
              height={p.gained > 0 ? Math.max(1.5, bh) : 1.5}
              rx={1.5}
              fill={p.gained === 0 ? 'rgba(255,255,255,0.06)' : isToday ? 'var(--color-gold)' : 'var(--color-primary)'}
            >
              <title>{`${dayKey(p.date)}: +${p.gained} XP (total ${p.cumulative.toLocaleString()})`}</title>
            </rect>
          );
        })}
        {/* cumulative line */}
        <polyline
          points={linePts}
          fill="none"
          stroke="var(--color-teal)"
          strokeWidth={1.75}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points.map((p, i) => (
          <circle
            key={`d-${p.key}`}
            cx={slotCenter(i)}
            cy={lineY(p.cumulative)}
            r={i === n - 1 ? 3 : 1.6}
            fill={i === n - 1 ? 'var(--color-teal)' : 'var(--color-surface)'}
            stroke="var(--color-teal)"
            strokeWidth={1}
          />
        ))}
        {/* x-axis day labels (every other day + last) */}
        {points.map((p, i) =>
          i % 2 === 0 || i === n - 1 ? (
            <text
              key={`t-${p.key}`}
              x={slotCenter(i)}
              y={H - 6}
              textAnchor="middle"
              fontSize={8}
              fill={i === n - 1 ? 'var(--color-gold)' : 'var(--color-muted)'}
            >
              {p.date.getDate()}
            </text>
          ) : null,
        )}
      </svg>
      <div className="flex items-center gap-4 mt-1 text-[10px]" style={{ color: 'var(--color-muted)' }}>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: 'var(--color-primary)' }} /> daily XP
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-3 rounded" style={{ background: 'var(--color-teal)' }} /> cumulative total
        </span>
      </div>
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
