import type { LucideIcon } from 'lucide-react';
import { useQuestStore } from '../store/useQuestStore';
import { useUserStore } from '../store/useUserStore';
import { Brain, CalendarDays, ChartLine, Flame, Target } from 'lucide-react';

function toLocalDateStr(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toISOString().slice(0, 10);
}

function startOfWeekStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().slice(0, 10);
}

export function StatsRow() {
  const completed = useQuestStore((s) => s.completed);
  const quests = useQuestStore((s) => s.quests);
  const user = useUserStore((s) => s.user);

  const today = toLocalDateStr(new Date());
  const weekStart = startOfWeekStr();

  const todayDone = completed.filter((q) => q.completedAt && toLocalDateStr(q.completedAt) === today).length;
  const weekDone = completed.filter((q) => q.completedAt && toLocalDateStr(q.completedAt) >= weekStart).length;
  const avgLoad = quests.length
    ? (quests.reduce((s, q) => s + q.mentalLoad, 0) / quests.length).toFixed(1)
    : '–';
  const totalSeen = completed.length + quests.length;
  const rate = totalSeen ? `${Math.round((completed.length / totalSeen) * 100)}%` : '–';

  return (
    <div className="grid grid-cols-2 gap-3 pt-5 sm:grid-cols-3 lg:grid-cols-5">
      <StatCard icon={Target} value={todayDone}                  label="Today's Quests" />
      <StatCard icon={CalendarDays} value={weekDone}                   label="This Week" />
      <StatCard icon={Brain} value={avgLoad}                    label="Avg Mental Load" />
      <StatCard icon={ChartLine} value={rate}                       label="Completion Rate" />
      <StatCard icon={Flame} value={user?.currentStreak ?? 0}   label="Current Streak" />
    </div>
  );
}

function StatCard({ icon: Icon, value, label }: { icon: LucideIcon; value: number | string; label: string }) {
  return (
    <div className="rounded-(--radius-card) border border-(--color-border) bg-(--color-surface) p-4 transition hover:-translate-y-0.5 hover:border-(--color-primary)">
      <Icon size={20} className="mb-2 opacity-70" aria-hidden />
      <div className="text-2xl font-extrabold leading-none">{value}</div>
      <div className="mt-1 text-[0.72rem] text-(--color-muted)">{label}</div>
    </div>
  );
}
