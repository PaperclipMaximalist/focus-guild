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
    <div className="panel p-4">
      <h2 className="section-label">This week</h2>
      <div className="mt-2.5 flex h-[60px] items-end gap-1">
        {days.map((day, i) => {
          const isToday = day === todayStr;
          const h = Math.round((counts[i]! / max) * 48) + 4;
          return (
            <div key={day} className="flex flex-1 flex-col items-center gap-0.5">
              <div
                className="w-full rounded-[3px] transition-[height] duration-500"
                style={{
                  height: `${h}px`,
                  background: isToday ? 'var(--color-primary)' : counts[i] ? 'color-mix(in srgb, var(--color-primary) 40%, transparent)' : 'var(--color-surface2)',
                  minHeight: 4,
                }}
                title={`${counts[i]} quests`}
              />
              <div className="text-[11px] text-(--color-muted)">{DAY_LABELS[i]}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
