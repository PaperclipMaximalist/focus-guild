import { useQuestStore } from '../store/useQuestStore';
import { useUserStore } from '../store/useUserStore';

export function DeepStatsPanel() {
  const quests = useQuestStore((s) => s.quests);
  const completed = useQuestStore((s) => s.completed);
  const user = useUserStore((s) => s.user);

  const hoursInPipeline = (
    quests.reduce((sum, q) => sum + q.estimatedMinutes, 0) / 60
  ).toFixed(1);

  return (
    <div className="rounded-(--radius-card) border border-(--color-border) bg-(--color-surface) p-4">
      <div className="flex items-center gap-1.5 text-base font-bold">🧬 Stats</div>
      <div className="mt-3 flex flex-col gap-2.5">
        <Row icon="🗓"  label="Active quests"       value={quests.length} />
        <Row icon="⏳" label="Hours in pipeline"    value={`${hoursInPipeline}h`} />
        <Row icon="🎮" label="Total XP earned"      value={(user?.totalXP ?? 0).toLocaleString()} />
        <Row icon="🔥" label="Current streak"       value={`${user?.currentStreak ?? 0} days`} />
        <Row icon="⚡" label="Streak multiplier"   value={`${(user?.multiplier ?? 1).toFixed(2)}×`} />
        <Row icon="💥" label="All-time completed"   value={completed.length} />
      </div>
    </div>
  );
}

function Row({ icon, label, value }: { icon: string; label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-(--color-muted)">{icon} {label}</span>
      <span className="font-bold">{value}</span>
    </div>
  );
}
