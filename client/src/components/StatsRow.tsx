/**
 * Four numbers about how it's going, in one quiet panel beside the list.
 *
 * This used to be five bordered tiles across the top of Today, so the first
 * thing the app showed you was a dashboard of zeros and the first quest sat
 * below the fold. The numbers are still here; they just don't go first.
 */

import { useQuestStore } from '../store/useQuestStore';
import { useUserStore } from '../store/useUserStore';

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
  const totalSeen = completed.length + quests.length;
  const rate = totalSeen ? `${Math.round((completed.length / totalSeen) * 100)}%` : '–';

  return (
    <div className="panel grid grid-cols-4 px-1 py-3.5 lg:grid-cols-2 lg:gap-y-4 lg:px-2 lg:py-4">
      <Stat value={todayDone} label="Done today" />
      <Stat value={weekDone} label="This week" />
      <Stat value={user?.currentStreak ?? 0} label="Day streak" />
      <Stat value={rate} label="Completed" />
    </div>
  );
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="px-2 text-center lg:text-left">
      <div className="tnum text-xl font-bold leading-none">{value}</div>
      <div className="mt-1.5 text-[12px] leading-tight text-(--color-muted)">{label}</div>
    </div>
  );
}
