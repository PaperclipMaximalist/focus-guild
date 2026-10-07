import type { LucideIcon } from 'lucide-react';
import { useQuestStore } from '../store/useQuestStore';
import { useUserStore } from '../store/useUserStore';
import { CircleCheck, Flame, Hourglass, ListChecks, Star, Zap } from 'lucide-react';

export function DeepStatsPanel() {
  const quests = useQuestStore((s) => s.quests);
  const completed = useQuestStore((s) => s.completed);
  const user = useUserStore((s) => s.user);

  const hoursInPipeline = (
    quests.reduce((sum, q) => sum + q.estimatedMinutes, 0) / 60
  ).toFixed(1);

  return (
    <div className="panel p-4">
      <h2 className="section-label">All time</h2>
      <div className="mt-3 flex flex-col gap-2.5">
        <Row icon={ListChecks} label="Active quests"       value={quests.length} />
        <Row icon={Hourglass} label="Hours in pipeline"    value={`${hoursInPipeline}h`} />
        <Row icon={Star} label="Total XP earned"      value={(user?.totalXP ?? 0).toLocaleString()} />
        <Row icon={Flame} label="Current streak"       value={`${user?.currentStreak ?? 0} ${user?.currentStreak === 1 ? "day" : "days"}`} />
        <Row icon={Zap} label="Streak multiplier"   value={`${(user?.multiplier ?? 1).toFixed(2)}×`} />
        <Row icon={CircleCheck} label="All-time completed"   value={completed.length} />
      </div>
    </div>
  );
}

function Row({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="flex items-center gap-2 text-(--color-muted)"><Icon size={15} aria-hidden /> {label}</span>
      <span className="font-bold">{value}</span>
    </div>
  );
}
