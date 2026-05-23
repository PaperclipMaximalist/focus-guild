import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useScheduleStore } from '../store/useScheduleStore';
import { useQuestStore } from '../store/useQuestStore';
import { useUserStore } from '../store/useUserStore';
import { useTimerStore } from '../store/useTimerStore';
import { useAchievementsStore } from '../store/useAchievementsStore';
import { useToastStore } from '../components/Toasts';
import { Header } from '../components/Header';
import { FocusTimer } from '../components/FocusTimer';
import { api, type ScheduleBlock } from '../lib/api';
import { levelFromXP } from '../lib/levels';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '0:00';
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function blockStatus(b: ScheduleBlock, now: number): 'past' | 'active' | 'upcoming' {
  const start = new Date(b.start).getTime();
  const end = new Date(b.end).getTime();
  if (end <= now) return 'past';
  if (start <= now) return 'active';
  return 'upcoming';
}

function typeLabel(b: ScheduleBlock): string {
  if (b.type === 'break') return 'Break';
  if (b.type === 'buffer') return 'Free slot';
  if (b.type === 'fixed') return 'Fixed';
  return 'Focus';
}

// Color by type + status
const TYPE_BG: Record<string, string> = {
  work:   'var(--color-primary)',
  break:  'var(--color-teal)',
  fixed:  'var(--color-gold)',
  buffer: 'var(--color-surface2)',
};

// ─── Block component ──────────────────────────────────────────────────────────

interface BlockCardProps {
  block: ScheduleBlock;
  questTitle: string | null;
  status: 'past' | 'active' | 'upcoming';
  isActive: boolean;
  now: number;
  onStart: () => void;
  onPin: () => void;
  onDelete: () => void;
  onExplain: () => void;
  // Drag-and-drop
  draggable: boolean;
  isDragOver: boolean;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}

function BlockCard({
  block,
  questTitle,
  status,
  isActive,
  now,
  onStart,
  onPin,
  onDelete,
  onExplain,
  draggable,
  isDragOver,
  isDragging,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: BlockCardProps) {
  const start = new Date(block.start).getTime();
  const end = new Date(block.end).getTime();
  const msRemaining = end - now;
  const pctDone = isActive
    ? Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100))
    : status === 'past' ? 100 : 0;

  const color = TYPE_BG[block.type] ?? 'var(--color-surface2)';
  const dim = status === 'past';

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{ cursor: draggable ? 'grab' : 'default' }}
    >
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: isDragging ? 0.4 : dim ? 0.45 : 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="relative rounded-[14px] overflow-hidden"
      style={{
        background: 'var(--color-surface)',
        border: isDragOver
          ? `2px dashed ${color}`
          : isActive
          ? `1.5px solid ${color}`
          : '1.5px solid var(--color-border)',
        boxShadow: isActive ? `0 0 18px ${color}30` : isDragOver ? `0 0 12px ${color}50` : 'none',
        transform: isDragOver ? 'scale(1.01)' : 'scale(1)',
        transition: 'transform 0.15s, box-shadow 0.15s',
      }}
    >
      {/* Left accent bar */}
      <div
        className="absolute top-0 left-0 bottom-0 w-1 rounded-l-[14px]"
        style={{ background: color }}
      />

      {/* Progress bar (active only) */}
      {isActive && (
        <div
          className="absolute bottom-0 left-0 h-0.5 transition-all duration-1000"
          style={{ width: `${pctDone}%`, background: color }}
        />
      )}

      <div className="pl-5 pr-4 py-3 flex gap-3 items-start">
        {/* Time column */}
        <div className="shrink-0 w-16 text-right">
          <p className="text-xs font-mono" style={{ color: 'var(--color-muted)' }}>
            {formatTime(block.start)}
          </p>
          <p className="text-xs font-mono" style={{ color: 'var(--color-muted)' }}>
            {formatTime(block.end)}
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full"
              style={{
                background: `${color}22`,
                color,
              }}
            >
              {typeLabel(block)}
            </span>
            {block.locked && (
              <span className="text-xs" style={{ color: 'var(--color-gold)' }}>
                pinned
              </span>
            )}
            {isActive && (
              <span
                className="text-xs font-mono font-bold"
                style={{ color }}
              >
                {formatCountdown(msRemaining)}
              </span>
            )}
          </div>

          <p
            className="mt-1 font-semibold truncate"
            style={{ color: 'var(--color-text)' }}
          >
            {questTitle ?? (block.type === 'break' ? 'Rest' : block.type === 'fixed' ? (block.note ?? 'Fixed') : '—')}
          </p>

          <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
            {block.durationMin}m
            {block.note && block.type === 'work' ? ` · ${block.note}` : ''}
          </p>
        </div>

        {/* Actions (upcoming work blocks only) */}
        {status !== 'past' && block.type === 'work' && (
          <div className="flex items-center gap-2 shrink-0">
            {!isActive && (
              <button
                onClick={onStart}
                className="text-xs px-2.5 py-1 rounded-full font-semibold transition-colors"
                style={{
                  background: `${color}22`,
                  color,
                  border: `1px solid ${color}55`,
                }}
              >
                Start
              </button>
            )}
            <button
              onClick={onPin}
              title={block.locked ? 'Unpin' : 'Pin'}
              className="text-base opacity-60 hover:opacity-100 transition-opacity"
            >
              {block.locked ? '📌' : '📍'}
            </button>
            <button
              onClick={onExplain}
              title="Why this?"
              className="text-base opacity-60 hover:opacity-100 transition-opacity"
            >
              💡
            </button>
            <button
              onClick={onDelete}
              title="Remove"
              className="text-base opacity-60 hover:opacity-100 transition-opacity"
            >
              ✕
            </button>
          </div>
        )}
      </div>
    </motion.div>
    </div>
  );
}

// ─── Explain tooltip ──────────────────────────────────────────────────────────

function ExplainTooltip({ blockId, onClose }: { blockId: string; onClose: () => void }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    api.schedule.explain(blockId).then((r) => setText(r.explanation)).catch(() => setText('Could not load explanation.'));
  }, [blockId]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="fixed inset-x-4 bottom-20 z-50 rounded-[14px] p-4 shadow-xl"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
    >
      <p className="text-sm" style={{ color: 'var(--color-text)' }}>
        {text ?? 'Loading…'}
      </p>
      <button
        onClick={onClose}
        className="mt-3 text-xs"
        style={{ color: 'var(--color-muted)' }}
      >
        Dismiss
      </button>
    </motion.div>
  );
}

// ─── Feasibility banner ───────────────────────────────────────────────────────

function FeasibilityBanner({
  issues,
}: {
  issues: Array<{ taskId: string; shortfallMin: number; suggestions: string[] }>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="rounded-[14px] p-3 mb-4"
      style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.35)' }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full text-left"
      >
        <span className="text-lg">⚠️</span>
        <span className="text-sm font-semibold" style={{ color: '#f87171' }}>
          {issues.length} quest{issues.length > 1 ? 's' : ''} won't finish before deadline
        </span>
        <span className="ml-auto text-xs" style={{ color: 'var(--color-muted)' }}>
          {open ? '▲' : '▼'}
        </span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 space-y-1.5">
              {issues.map((issue) => (
                <div key={issue.taskId} className="text-xs" style={{ color: 'var(--color-muted)' }}>
                  <span className="font-mono text-red-300">{issue.taskId.slice(0, 8)}…</span>
                  {' '}shortfall {issue.shortfallMin}m — {issue.suggestions[0]}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function GuildFeed() {
  const { schedule, feasibilityReport, generatedAt, loading, error, generate, replan, applyEdit, setActiveBlock } =
    useScheduleStore();
  const { quests, load: loadQuests, complete: completeQuest, completeDaily } = useQuestStore();
  const user = useUserStore((s) => s.user);
  const applyXPGain = useUserStore((s) => s.applyXPGain);
  const startTimer = useTimerStore((s) => s.start);
  const timerActive = useTimerStore((s) => s.active);
  const pushToast = useToastStore((s) => s.push);
  const addUnlocked = useAchievementsStore((s) => s.addUnlocked);
  const [timerOpen, setTimerOpen] = useState(false);

  const [now, setNow] = useState(Date.now());
  const [explainBlockId, setExplainBlockId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const activeRef = useRef<HTMLDivElement | null>(null);

  // Tick clock every second for live countdown.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Load quests + fetch or generate schedule on mount.
  useEffect(() => {
    loadQuests();
    // Try to fetch an existing schedule; if empty, generate one.
    useScheduleStore.getState().fetch().then(() => {
      if (useScheduleStore.getState().schedule.length === 0) {
        useScheduleStore.getState().generate();
      }
    });
  }, [loadQuests]);

  // Scroll active block into view.
  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [schedule.length]);

  const questById = Object.fromEntries(quests.map((q) => [q.id, q]));

  // Only show today + near-future blocks (skip past unless they were active).
  const visibleBlocks = schedule.filter((b) => {
    const end = new Date(b.end).getTime();
    const status = blockStatus(b, now);
    if (status === 'past') return end > now - 30 * 60_000; // show last 30m of past
    return true;
  });

  // Find current active block.
  const currentActive = schedule.find((b) => blockStatus(b, now) === 'active' && b.type === 'work');

  // Day progress.
  const todayBlocks = schedule.filter((b) => {
    const d = new Date(b.start);
    const t = new Date(now);
    return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && b.type === 'work';
  });
  const totalWorkMin = todayBlocks.reduce((a, b) => a + b.durationMin, 0);
  const doneWorkMin = todayBlocks
    .filter((b) => blockStatus(b, now) === 'past')
    .reduce((a, b) => a + b.durationMin, 0);
  const pctDone = totalWorkMin > 0 ? Math.round((doneWorkMin / totalWorkMin) * 100) : 0;

  const handlePin = useCallback(
    (block: ScheduleBlock) => {
      applyEdit(
        block.locked
          ? { kind: 'unpin_block', blockId: block.id }
          : { kind: 'pin_block', blockId: block.id },
      );
    },
    [applyEdit],
  );

  const handleDelete = useCallback(
    (blockId: string) => applyEdit({ kind: 'delete_block', blockId }),
    [applyEdit],
  );

  // Drag-and-drop: dragging a work block onto another work block swaps them.
  // The server-side edit reflows the schedule.
  const handleDrop = useCallback(
    (targetId: string) => {
      if (!draggingId || draggingId === targetId) return;
      const a = schedule.find((b) => b.id === draggingId);
      const b = schedule.find((bb) => bb.id === targetId);
      if (!a || !b) return;
      if (a.type !== 'work' || b.type !== 'work') return;
      applyEdit({ kind: 'swap_blocks', aId: a.id, bId: b.id });
      setDraggingId(null);
      setDragOverId(null);
    },
    [draggingId, schedule, applyEdit],
  );

  return (
    <div className="min-h-screen pb-24" style={{ background: 'var(--color-bg)' }}>
      <Header />

      {/* Progress bar */}
      <div
        className="sticky top-[56px] z-30 h-1 w-full"
        style={{ background: 'var(--color-surface)' }}
      >
        <motion.div
          className="h-full"
          style={{ background: 'var(--color-primary)' }}
          animate={{ width: `${pctDone}%` }}
          transition={{ duration: 0.6 }}
        />
      </div>

      <div className="mx-auto max-w-2xl px-4 pt-4">
        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-4">
          <h1 className="flex-1 text-xl font-bold" style={{ color: 'var(--color-text)' }}>
            Guild Feed
          </h1>
          <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
            {pctDone}% done
          </span>
          <button
            onClick={() => generate()}
            disabled={loading}
            className="text-sm px-3 py-1.5 rounded-full font-semibold transition-opacity"
            style={{
              background: 'var(--color-primary)',
              color: '#fff',
              opacity: loading ? 0.5 : 1,
            }}
          >
            {loading ? '…' : 'Regenerate'}
          </button>
          <button
            onClick={() => replan()}
            disabled={loading}
            className="text-sm px-3 py-1.5 rounded-full font-semibold transition-opacity"
            style={{
              background: 'var(--color-surface2)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-border)',
              opacity: loading ? 0.5 : 1,
            }}
          >
            Replan
          </button>
        </div>

        {/* Feasibility warning */}
        {!feasibilityReport.ok && (
          <FeasibilityBanner issues={feasibilityReport.issues} />
        )}

        {/* Drag hint */}
        {schedule.some((b) => b.type === 'work' && !b.locked) && (
          <p className="mb-3 text-xs" style={{ color: 'var(--color-muted)' }}>
            💡 Drag a focus block onto another to swap them. Pin (📌) to lock in place.
          </p>
        )}

        {/* Error state */}
        {error && (
          <div
            className="rounded-[14px] p-4 mb-4 text-sm"
            style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}
          >
            {error}
          </div>
        )}

        {/* Empty state */}
        {!loading && schedule.length === 0 && (
          <div className="flex flex-col items-center gap-4 pt-16 text-center">
            <p className="text-4xl">📅</p>
            <p className="font-semibold" style={{ color: 'var(--color-text)' }}>
              No schedule yet
            </p>
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
              Hit Regenerate to build today's plan from your quests.
            </p>
            <button
              onClick={() => generate()}
              disabled={loading}
              className="mt-2 px-5 py-2 rounded-full font-semibold text-sm"
              style={{ background: 'var(--color-primary)', color: '#fff' }}
            >
              Build my schedule
            </button>
          </div>
        )}

        {/* Timeline */}
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {visibleBlocks.map((block) => {
              const status = blockStatus(block, now);
              const isActive = block.id === currentActive?.id;
              const quest = block.taskId ? questById[block.taskId] : null;

              return (
                <div
                  key={block.id}
                  ref={isActive ? (el) => { activeRef.current = el; } : undefined}
                >
                  <BlockCard
                    block={block}
                    questTitle={quest?.title ?? null}
                    status={status}
                    isActive={isActive}
                    now={now}
                    onStart={() => {
                      setActiveBlock(block.id);
                      const q = block.taskId ? questById[block.taskId] : null;
                      if (q) {
                        startTimer({
                          questId: q.id,
                          questTitle: q.title,
                          durationMin: block.durationMin,
                        });
                        setTimerOpen(true);
                      }
                    }}
                    onPin={() => handlePin(block)}
                    onDelete={() => handleDelete(block.id)}
                    onExplain={() => setExplainBlockId(block.id)}
                    draggable={block.type === 'work' && status !== 'past'}
                    isDragging={draggingId === block.id}
                    isDragOver={dragOverId === block.id && draggingId !== block.id}
                    onDragStart={(e) => {
                      setDraggingId(block.id);
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', block.id);
                    }}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setDragOverId(null);
                    }}
                    onDragOver={(e) => {
                      if (
                        draggingId &&
                        block.type === 'work' &&
                        status !== 'past' &&
                        draggingId !== block.id
                      ) {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        if (dragOverId !== block.id) setDragOverId(block.id);
                      }
                    }}
                    onDragLeave={() => {
                      if (dragOverId === block.id) setDragOverId(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleDrop(block.id);
                    }}
                  />
                </div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Generated-at footer */}
        {generatedAt && (
          <p className="mt-6 text-center text-xs" style={{ color: 'var(--color-muted)' }}>
            Last generated {new Date(generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>

      {/* Explain tooltip overlay */}
      <AnimatePresence>
        {explainBlockId && (
          <ExplainTooltip
            blockId={explainBlockId}
            onClose={() => setExplainBlockId(null)}
          />
        )}
      </AnimatePresence>

      {/* Focus timer overlay */}
      <FocusTimer
        open={timerOpen && !!timerActive}
        onClose={() => setTimerOpen(false)}
        onComplete={async (questId) => {
          if (!user) return;
          const prevLevel = levelFromXP(user.totalXP).level;
          const q = quests.find((x) => x.id === questId);
          const result = q?.isRecurring
            ? await completeDaily(questId)
            : await completeQuest(questId);
          applyXPGain(result.totalXP, result.newStreak, result.newMultiplier);
          pushToast({
            icon: '⭐',
            title: `+${result.xpAwarded} XP`,
            sub: 'Focus block complete',
            variant: 'xp',
          });
          if (result.newlyUnlocked && result.newlyUnlocked.length > 0) {
            addUnlocked(
              result.newlyUnlocked.map((a) => ({ ...a, unlockedAt: new Date().toISOString() })),
            );
            result.newlyUnlocked.forEach((a, idx) => {
              setTimeout(() => {
                pushToast({
                  icon: a.icon,
                  title: `Achievement: ${a.title}`,
                  sub: `+${a.xpReward} XP`,
                  variant: 'badge',
                });
              }, 400 + idx * 350);
            });
          }
          const newLevel = levelFromXP(result.totalXP).level;
          if (newLevel > prevLevel) {
            pushToast({ icon: '🆙', title: `Level ${newLevel}!`, sub: 'New rank unlocked', variant: 'levelup' });
          }
          // Reflow the schedule so the completed block drops out cleanly.
          replan();
        }}
      />

      {/* Floating "resume timer" badge when minimized */}
      {timerActive && !timerOpen && (
        <button
          onClick={() => setTimerOpen(true)}
          className="fixed bottom-20 right-4 z-50 rounded-full px-4 py-2 text-sm font-semibold shadow-lg"
          style={{
            background: 'var(--color-primary)',
            color: '#fff',
          }}
        >
          ⏱ Resume timer
        </button>
      )}

    </div>
  );
}
