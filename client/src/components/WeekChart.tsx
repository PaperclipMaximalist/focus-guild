import { useQuestStore } from '../store/useQuestStore';

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function weekDays(): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  for (let i = 0; i < 7; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export function WeekChart() {
  const completed = useQuestStore((s) => s.completed);

  const days = weekDays();
  const counts = days.map(
    (day) => completed.filter((q) => q.completedAt && q.completedAt.slice(0, 10) === day).length,
  );
  const max = Math.max(1, ...counts);
  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="rounded-(--radius-card) border border-(--color-border) bg-(--color-surface) p-4">
      <div className="flex items-center gap-1.5 text-base font-bold">📊 Weekly Activity</div>
      <div className="mt-2.5 flex h-[60px] items-end gap-1">
        {days.map((day, i) => {
          const isToday = day === todayStr;
          const h = Math.round((counts[i]! / max) * 48) + 4;
          return (
            <div key={day} className="flex flex-1 flex-col items-center gap-0.5">
              <div
                className="w-full rounded-t transition-all duration-500"
                style={{
                  height: `${h}px`,
                  background: isToday ? 'var(--color-primary)' : 'rgba(139,92,246,0.3)',
                  boxShadow: isToday ? '0 0 8px rgba(139,92,246,0.5)' : 'none',
                  minHeight: 4,
                }}
                title={`${counts[i]} quests`}
              />
              <div className="text-[0.6rem] text-(--color-muted)">{DAY_LABELS[i]}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
