import { levelFromXP, progressToNextLevel, nextLevel } from '../lib/levels';

interface Props {
  totalXP: number;
  currentStreak: number;
  multiplier: number;
}

export function LevelBadge({ totalXP, currentStreak, multiplier }: Props) {
  const level = levelFromXP(totalXP);
  const next = nextLevel(totalXP);
  const progress = progressToNextLevel(totalXP);

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-400">Level {level.level}</div>
          <div className="text-xl font-semibold" style={{ color: level.accent }}>
            {level.title}
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-slate-100">{totalXP.toLocaleString()} XP</div>
          <div className="text-xs text-slate-400">
            🔥 {currentStreak}-day streak · {multiplier.toFixed(2)}×
          </div>
        </div>
      </div>

      {next && (
        <div className="mt-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${progress.pct}%`,
                background: `linear-gradient(90deg, ${level.accent}, ${next.accent})`,
              }}
            />
          </div>
          <div className="mt-1 flex justify-between text-xs text-slate-500">
            <span>{progress.earned} / {progress.needed} to {next.title}</span>
            <span>{Math.round(progress.pct)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
