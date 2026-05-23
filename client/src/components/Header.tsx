import { useUserStore } from '../store/useUserStore';
import { useQuestStore } from '../store/useQuestStore';
import { levelFromXP, nextLevel, progressToNextLevel } from '../lib/levels';

export function Header() {
  const user = useUserStore((s) => s.user);
  const completedCount = useQuestStore((s) => s.completed.length);
  if (!user) return null;

  const level = levelFromXP(user.totalXP);
  const next = nextLevel(user.totalXP);
  const progress = progressToNextLevel(user.totalXP);

  const sub =
    user.currentStreak >= 3
      ? `🔥 ${user.currentStreak}-day streak — you're on fire!`
      : next
      ? `Next rank at ${next.xpRequired.toLocaleString()} XP. You've got this.`
      : `Highest rank reached. Keep questing.`;

  return (
    <header
      className="sticky top-0 z-50 border-b border-(--color-border) backdrop-blur-md px-4 py-4 sm:px-6"
      style={{ background: 'linear-gradient(135deg, #1a0a3e 0%, #0d0d1a 60%, #0a1a2e 100%)' }}
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4">
        {/* Avatar */}
        <div className="relative shrink-0">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-full text-2xl shadow-[0_0_0_3px_rgba(139,92,246,0.35),0_0_20px_rgba(139,92,246,0.25)]"
            style={{ background: `linear-gradient(135deg, ${level.accent}, #c084fc)` }}
          >
            {level.emoji}
          </div>
          <div
            className="absolute -bottom-1 -right-1 flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 text-[0.65rem] font-extrabold text-black"
            style={{ background: 'var(--color-gold)', borderColor: 'var(--color-bg)' }}
          >
            {level.level}
          </div>
        </div>

        {/* Hero info */}
        <div className="min-w-[200px] flex-1">
          <div className="text-[1.05rem] font-bold leading-tight">
            Level {level.level} {level.title}
          </div>
          <div className="mb-1.5 text-xs text-(--color-muted)">{sub}</div>
          <div className="flex items-center gap-2">
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/8">
              <div
                className="h-full rounded-full shadow-[0_0_8px_rgba(139,92,246,0.6)] transition-all duration-700"
                style={{
                  width: `${progress.pct}%`,
                  background: `linear-gradient(90deg, ${level.accent}, #c084fc)`,
                }}
              />
            </div>
            <span className="whitespace-nowrap text-[0.7rem] font-bold text-(--color-gold)">
              {next ? `${progress.earned} / ${progress.needed} XP` : 'MAX'}
            </span>
          </div>
        </div>

        {/* Header stats */}
        <div className="flex flex-wrap items-center gap-2.5">
          <HeaderStat icon="🔥" value={user.currentStreak} label="streak" />
          <HeaderStat icon="⭐" value={user.totalXP.toLocaleString()} label="total XP" />
          <HeaderStat icon="✅" value={completedCount} label="done" />
        </div>
      </div>
    </header>
  );
}

function HeaderStat({ icon, value, label }: { icon: string; value: number | string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-(--color-border) bg-white/5 px-3 py-1 text-sm">
      <span>{icon}</span>
      <span className="font-bold">{value}</span>
      <span className="text-(--color-muted) max-sm:hidden">{label}</span>
    </div>
  );
}
