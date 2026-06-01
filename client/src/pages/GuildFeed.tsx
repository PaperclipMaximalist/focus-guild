import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useScheduleStore } from '../store/useScheduleStore';
import { useQuestStore } from '../store/useQuestStore';
import { useUserStore } from '../store/useUserStore';
import { useTimerStore } from '../store/useTimerStore';
import { useAchievementsStore } from '../store/useAchievementsStore';
import { useToastStore } from '../components/Toasts';
import { Header } from '../components/Header';
import { FocusTimer } from '../components/FocusTimer';
import { api, type ScheduleBlock, type Quest, type PlanMode } from '../lib/api';
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
  if (b.type === 'buffer') return 'Free';
  if (b.type === 'fixed') return 'Fixed';
  return 'Focus';
}

// Bold palette keyed to quest category. Picked for contrast on dark bg.
const CATEGORY_COLOR: Record<string, string> = {
  deep_work: '#8b5cf6', // violet
  comms:     '#14b8a6', // teal
  admin:     '#f59e0b', // amber
  creative:  '#ec4899', // pink
};

// Non-work block colors.
const TYPE_COLOR: Record<string, string> = {
  break:  '#64748b', // slate
  fixed:  '#f59e0b', // amber
  buffer: '#374151', // dim
};

/**
 * Pick a vivid color for a block. Work blocks → category; intensity bumped
 * by mentalLoad. Non-work → muted palette so focus stands out.
 */
function blockColor(b: ScheduleBlock, quest: Quest | null): string {
  if (b.type !== 'work') return TYPE_COLOR[b.type] ?? '#475569';
  const cat = quest?.category ?? 'deep_work';
  return CATEGORY_COLOR[cat] ?? CATEGORY_COLOR.deep_work!;
}

/** A 1–10 mental-load label for the difficulty dot. */
function loadLabel(load: number | undefined): { dots: number; label: string } {
  const l = load ?? 5;
  if (l >= 9) return { dots: 5, label: 'Brutal' };
  if (l >= 7) return { dots: 4, label: 'Hard' };
  if (l >= 5) return { dots: 3, label: 'Medium' };
  if (l >= 3) return { dots: 2, label: 'Mild' };
  return { dots: 1, label: 'Easy' };
}

// ─── Compact block row ────────────────────────────────────────────────────────

interface BlockRowProps {
  block: ScheduleBlock;
  quest: Quest | null;
  status: 'past' | 'active' | 'upcoming';
  isActive: boolean;
  now: number;
  expanded: boolean;
  onToggle: () => void;
  onStart: () => void;
  onPin: () => void;
  onDelete: () => void;
  onExplain: () => void;
  draggable: boolean;
  isDragOver: boolean;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}

function BlockRow({
  block,
  quest,
  status,
  isActive,
  now,
  expanded,
  onToggle,
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
}: BlockRowProps) {
  const start = new Date(block.start).getTime();
  const end = new Date(block.end).getTime();
  const msRemaining = end - now;
  const pctDone = isActive
    ? Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100))
    : status === 'past' ? 100 : 0;

  const color = blockColor(block, quest);
  const dim = status === 'past';
  const title = quest?.title ?? (block.type === 'break' ? 'Rest' : block.type === 'fixed' ? (block.note ?? 'Fixed') : block.type === 'buffer' ? 'Free slot' : '—');
  const ml = loadLabel(quest?.mentalLoad);

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
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: isDragging ? 0.4 : dim ? 0.5 : 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="relative rounded-[12px] overflow-hidden"
        style={{
          background: 'var(--color-surface)',
          border: isDragOver
            ? `2px dashed ${color}`
            : isActive
            ? `1.5px solid ${color}`
            : '1px solid var(--color-border)',
          boxShadow: isActive ? `0 0 14px ${color}40` : isDragOver ? `0 0 10px ${color}50` : 'none',
        }}
      >
        {/* Left accent bar */}
        <div
          className="absolute top-0 left-0 bottom-0 w-1"
          style={{ background: color }}
        />

        {/* Progress bar (active only) */}
        {isActive && (
          <div
            className="absolute bottom-0 left-0 h-0.5 transition-all duration-1000"
            style={{ width: `${pctDone}%`, background: color }}
          />
        )}

        {/* COMPACT ROW — always visible */}
        <button
          type="button"
          onClick={onToggle}
          className="w-full text-left flex items-center gap-3 pl-4 pr-3 py-2.5"
        >
          {/* Time */}
          <div className="shrink-0 w-12 font-mono text-xs leading-tight" style={{ color: 'var(--color-muted)' }}>
            {formatTime(block.start)}
          </div>

          {/* Title + chip + load dots */}
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <span
              className="text-[0.65rem] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
              style={{ background: `${color}22`, color }}
            >
              {typeLabel(block)}
            </span>
            <span
              className="truncate font-semibold text-[0.92rem]"
              style={{ color: 'var(--color-text)' }}
            >
              {title}
            </span>
          </div>

          {/* Right side: live countdown OR duration + difficulty dots + chevron */}
          <div className="flex items-center gap-2 shrink-0">
            {isActive ? (
              <span className="font-mono text-xs font-bold" style={{ color }}>
                {formatCountdown(msRemaining)}
              </span>
            ) : (
              <span className="text-xs font-mono" style={{ color: 'var(--color-muted)' }}>
                {block.durationMin}m
              </span>
            )}
            {block.type === 'work' && (
              <span title={`Mental load: ${ml.label}`} className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <span
                    key={i}
                    className="w-1 h-1 rounded-full"
                    style={{
                      background: i <= ml.dots ? color : 'rgba(255,255,255,0.12)',
                    }}
                  />
                ))}
              </span>
            )}
            {block.locked && (
              <span className="text-xs" style={{ color: 'var(--color-gold)' }}>
                📌
              </span>
            )}
            <span
              className="text-xs transition-transform"
              style={{
                color: 'var(--color-muted)',
                transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
              }}
            >
              ▾
            </span>
          </div>
        </button>

        {/* EXPANDED — details + actions */}
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden"
            >
              <div
                className="pl-4 pr-3 pb-3 pt-1 border-t flex flex-col gap-2"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: 'var(--color-muted)' }}>
                  <span>
                    {formatTime(block.start)} – {formatTime(block.end)} · {block.durationMin}m
                  </span>
                  {quest?.category && (
                    <span className="capitalize">· {quest.category.replace('_', ' ')}</span>
                  )}
                  {block.type === 'work' && quest && (
                    <span>· Load {ml.label}</span>
                  )}
                </div>
                {block.note && block.type === 'work' && (
                  <p className="text-xs italic" style={{ color: 'var(--color-muted)' }}>
                    {block.note}
                  </p>
                )}
                {status !== 'past' && block.type === 'work' && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {!isActive && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onStart(); }}
                        className="text-xs px-3 py-1 rounded-full font-bold transition-transform hover:scale-105"
                        style={{ background: color, color: '#fff' }}
                      >
                        ▶ Start
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); onPin(); }}
                      className="text-xs px-2.5 py-1 rounded-full border transition-colors"
                      style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                    >
                      {block.locked ? 'Unpin' : '📌 Pin'}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onExplain(); }}
                      className="text-xs px-2.5 py-1 rounded-full border transition-colors"
                      style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                    >
                      💡 Why?
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(); }}
                      className="text-xs px-2.5 py-1 rounded-full border transition-colors ml-auto"
                      style={{ borderColor: 'rgba(239,68,68,0.4)', color: '#f87171' }}
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
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

// ─── Plan controls panel ──────────────────────────────────────────────────────

function PlanControls({
  mode,
  loading,
  onChangeMode,
  onRegenerate,
  onReplan,
}: {
  mode: PlanMode;
  loading: boolean;
  onChangeMode: (m: PlanMode) => void;
  onRegenerate: () => void;
  onReplan: () => void;
}) {
  return (
    <div
      className="rounded-[14px] p-3 mb-4"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>
          Planning mode
        </span>
      </div>
      <div className="flex gap-1.5 mb-3">
        <ModeButton
          active={mode === 'balanced'}
          onClick={() => onChangeMode('balanced')}
          color="var(--color-teal)"
          label="🌙 Balanced"
          sub="Respects energy dips"
        />
        <ModeButton
          active={mode === 'crush'}
          onClick={() => onChangeMode('crush')}
          color="var(--color-fire)"
          label="🔥 Crush"
          sub="Pack the day, drop low-priority"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={onRegenerate}
          disabled={loading}
          className="flex-1 text-sm px-3 py-1.5 rounded-full font-semibold transition-opacity"
          style={{
            background: 'var(--color-primary)',
            color: '#fff',
            opacity: loading ? 0.5 : 1,
          }}
        >
          {loading ? '…' : 'Regenerate'}
        </button>
        <button
          onClick={onReplan}
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
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  color,
  label,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  color: string;
  label: string;
  sub: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex-1 rounded-lg px-3 py-2 text-left transition-all"
      style={{
        background: active ? `${color}1f` : 'rgba(255,255,255,0.02)',
        border: `1.5px solid ${active ? color : 'var(--color-border)'}`,
      }}
    >
      <div className="text-sm font-bold" style={{ color: active ? color : 'var(--color-text)' }}>
        {label}
      </div>
      <div className="text-[0.65rem] mt-0.5" style={{ color: 'var(--color-muted)' }}>
        {sub}
      </div>
    </button>
  );
}

// ─── Feasibility banner ───────────────────────────────────────────────────────

function FeasibilityBanner({
  mode,
  issues,
  questById,
}: {
  mode: PlanMode;
  issues: Array<{ taskId: string; shortfallMin: number; suggestions: string[] }>;
  questById: Record<string, Quest | undefined>;
}) {
  const [open, setOpen] = useState(false);
  const totalShortfall = issues.reduce((s, i) => s + i.shortfallMin, 0);
  const headline = mode === 'crush'
    ? `🛑 Won't fit in working hours — short by ${totalShortfall}m (${issues.length} quest${issues.length > 1 ? 's' : ''})`
    : `⚠️ ${issues.length} quest${issues.length > 1 ? 's' : ''} won't finish before deadline`;

  return (
    <div
      className="rounded-[14px] p-3 mb-4"
      style={{
        background: mode === 'crush' ? 'rgba(239,68,68,0.14)' : 'rgba(245,158,11,0.10)',
        border: mode === 'crush' ? '1px solid rgba(239,68,68,0.45)' : '1px solid rgba(245,158,11,0.35)',
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full text-left"
      >
        <span
          className="text-sm font-semibold"
          style={{ color: mode === 'crush' ? '#fca5a5' : '#fbbf24' }}
        >
          {headline}
        </span>
        <span className="ml-auto text-xs" style={{ color: 'var(--color-muted)' }}>
          {open ? '▲' : '▼'}
        </span>
      </button>
      {mode === 'crush' && (
        <p className="text-[0.7rem] mt-1.5" style={{ color: 'var(--color-muted)' }}>
          Crush mode dropped LOW priority and removed energy dips. Even so, your working hours can't fit
          everything. Tag more quests as LOW, extend a deadline, or widen working hours in Settings.
        </p>
      )}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 space-y-1.5">
              {issues.map((issue) => {
                const q = questById[issue.taskId];
                return (
                  <div key={issue.taskId} className="text-xs" style={{ color: 'var(--color-muted)' }}>
                    <span style={{ color: 'var(--color-text)' }}>{q?.title ?? issue.taskId.slice(0, 8)}</span>
                    {' '}— short {issue.shortfallMin}m
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function GuildFeed() {
  const { schedule, feasibilityReport, generatedAt, loading, error, mode, generate, replan, applyEdit, setActiveBlock, setMode } =
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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const activeRef = useRef<HTMLDivElement | null>(null);

  // Tick clock every second for live countdown.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Load quests + fetch or generate schedule on mount.
  useEffect(() => {
    loadQuests();
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

  const questById = useMemo(
    () => Object.fromEntries(quests.map((q) => [q.id, q])) as Record<string, Quest | undefined>,
    [quests],
  );

  // Only show today + near-future blocks (skip past unless they were active).
  const visibleBlocks = schedule.filter((b) => {
    const end = new Date(b.end).getTime();
    const status = blockStatus(b, now);
    if (status === 'past') return end > now - 30 * 60_000;
    return true;
  });

  const currentActive = schedule.find((b) => blockStatus(b, now) === 'active' && b.type === 'work');

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

  const handleChangeMode = useCallback(
    (m: PlanMode) => {
      setMode(m);
      // Regenerate immediately so the user sees the effect of switching mode.
      generate({ mode: m });
    },
    [setMode, generate],
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
        {/* Header row */}
        <div className="flex items-baseline gap-3 mb-3">
          <h1 className="flex-1 text-xl font-bold" style={{ color: 'var(--color-text)' }}>
            Guild Feed
          </h1>
          <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
            {pctDone}% done · {Math.round(totalWorkMin / 60 * 10) / 10}h focus
          </span>
        </div>

        {/* Plan controls (mode toggle + regen / replan) */}
        <PlanControls
          mode={mode}
          loading={loading}
          onChangeMode={handleChangeMode}
          onRegenerate={() => generate()}
          onReplan={() => replan()}
        />

        {/* Feasibility warning — color escalates in Crush mode */}
        {!feasibilityReport.ok && (
          <FeasibilityBanner mode={mode} issues={feasibilityReport.issues} questById={questById} />
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

        {/* Timeline — compact rows, expand on tap */}
        <div className="space-y-1.5">
          <AnimatePresence initial={false}>
            {visibleBlocks.map((block) => {
              const status = blockStatus(block, now);
              const isActive = block.id === currentActive?.id;
              const quest = block.taskId ? questById[block.taskId] ?? null : null;
              const expanded = expandedId === block.id || isActive;

              return (
                <div
                  key={block.id}
                  ref={isActive ? (el) => { activeRef.current = el; } : undefined}
                >
                  <BlockRow
                    block={block}
                    quest={quest}
                    status={status}
                    isActive={isActive}
                    now={now}
                    expanded={expanded}
                    onToggle={() => setExpandedId(expanded ? null : block.id)}
                    onStart={() => {
                      setActiveBlock(block.id);
                      if (quest) {
                        startTimer({
                          questId: quest.id,
                          questTitle: quest.title,
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
            {' '}· {mode === 'crush' ? '🔥 Crush' : '🌙 Balanced'} mode
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
