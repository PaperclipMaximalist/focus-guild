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

// ─── Layout constants ─────────────────────────────────────────────────────────

/** Pixels per minute — drives the proportional block heights. */
const PX_PER_MIN = 1.6;
/** Earliest hour rendered (e.g. 7 = 7am) */
const VIEW_START_HOUR = 7;
/** Latest hour rendered (e.g. 23 = 11pm) */
const VIEW_END_HOUR = 23;
const VIEW_MINUTES = (VIEW_END_HOUR - VIEW_START_HOUR) * 60;
const TIMELINE_HEIGHT = VIEW_MINUTES * PX_PER_MIN;
/** Below this height, the block uses the compact single-line layout. */
const COMPACT_THRESHOLD_PX = 48;
/** Number of days shown in the day-tab strip. */
const DAY_TABS = 5;

// Bold category palette.
const CATEGORY_COLOR: Record<string, string> = {
  deep_work: '#a78bfa', // violet-400
  comms:     '#2dd4bf', // teal-400
  admin:     '#fbbf24', // amber-400
  creative:  '#f472b6', // pink-400
};

const TYPE_COLOR: Record<string, string> = {
  break:  '#64748b', // slate
  fixed:  '#fbbf24', // amber
  buffer: '#1f2937', // very muted
};

function blockColor(b: ScheduleBlock, quest: Quest | null): string {
  if (b.type !== 'work') return TYPE_COLOR[b.type] ?? '#475569';
  const cat = quest?.category ?? 'deep_work';
  return CATEGORY_COLOR[cat] ?? CATEGORY_COLOR.deep_work!;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
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

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

/** Minutes from VIEW_START_HOUR on this day's calendar (clamped to view). */
function minutesFromViewStart(ms: number, dayStart: number): number {
  const offset = ms - dayStart - VIEW_START_HOUR * 60 * 60_000;
  return Math.max(0, Math.min(VIEW_MINUTES, offset / 60_000));
}

function loadDots(load: number | undefined): number {
  const l = load ?? 5;
  if (l >= 9) return 5;
  if (l >= 7) return 4;
  if (l >= 5) return 3;
  if (l >= 3) return 2;
  return 1;
}

// ─── Block tile ───────────────────────────────────────────────────────────────

interface BlockTileProps {
  block: ScheduleBlock;
  quest: Quest | null;
  status: 'past' | 'active' | 'upcoming';
  top: number;
  height: number;
  now: number;
  isSelected: boolean;
  onSelect: () => void;
  draggable: boolean;
  isDragOver: boolean;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}

function BlockTile({
  block,
  quest,
  status,
  top,
  height,
  now,
  isSelected,
  onSelect,
  draggable,
  isDragOver,
  isDragging,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: BlockTileProps) {
  const color = blockColor(block, quest);
  const isCompact = height < COMPACT_THRESHOLD_PX;
  const title = quest?.title
    ?? (block.type === 'break' ? 'Break' : block.type === 'fixed' ? (block.note ?? 'Fixed') : block.type === 'buffer' ? 'Free slot' : '—');
  const startD = new Date(block.start);
  const endD = new Date(block.end);
  const dots = quest ? loadDots(quest.mentalLoad) : 0;
  const pastDim = status === 'past' ? 0.4 : 1;
  const isActive = status === 'active' && block.type === 'work';
  const isWork = block.type === 'work';
  const msRemaining = endD.getTime() - now;
  const pctDone = isActive
    ? Math.max(0, Math.min(100, ((now - startD.getTime()) / (endD.getTime() - startD.getTime())) * 100))
    : status === 'past' ? 100 : 0;

  // Solid color for work + fixed, dashed pattern for break, neutral fill for buffer.
  const bg = block.type === 'buffer'
    ? 'rgba(31, 41, 55, 0.5)'
    : block.type === 'break'
      ? 'rgba(100, 116, 139, 0.25)'
      : `linear-gradient(135deg, ${color}f0 0%, ${color}b8 100%)`;

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className="absolute left-0 right-0 px-1"
      style={{ top, height, cursor: draggable ? 'grab' : 'pointer' }}
    >
      <motion.button
        type="button"
        onClick={onSelect}
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: isDragging ? 0.4 : pastDim, scale: 1 }}
        whileHover={{ scale: status === 'past' ? 1 : 1.005 }}
        transition={{ duration: 0.18 }}
        className="relative w-full h-full rounded-[10px] overflow-hidden text-left"
        style={{
          background: bg,
          border: isDragOver
            ? `2px dashed ${color}`
            : isActive || isSelected
              ? `2px solid ${color}`
              : block.type === 'work'
                ? `1px solid ${color}66`
                : '1px solid rgba(255,255,255,0.08)',
          boxShadow: isActive
            ? `0 0 20px ${color}66, inset 0 0 12px ${color}33`
            : isSelected
              ? `0 0 14px ${color}44`
              : 'none',
        }}
      >
        {/* Active progress bar overlay */}
        {isActive && (
          <div
            className="absolute bottom-0 left-0 h-1 transition-all duration-1000"
            style={{ width: `${pctDone}%`, background: '#fff', opacity: 0.85 }}
          />
        )}

        {/* Locked badge */}
        {block.locked && (
          <span className="absolute top-1.5 right-1.5 text-xs" style={{ color: '#fff' }}>
            📌
          </span>
        )}

        {/* Mental-load dots (top-right) */}
        {isWork && quest && !block.locked && !isCompact && (
          <div className="absolute top-2 right-2 flex gap-[3px]">
            {[1, 2, 3, 4, 5].map((i) => (
              <span
                key={i}
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  background: i <= dots ? '#fff' : 'rgba(255,255,255,0.25)',
                }}
              />
            ))}
          </div>
        )}

        {/* Content */}
        <div className={`h-full flex ${isCompact ? 'flex-row items-center' : 'flex-col justify-between'} gap-1 p-2 ${isCompact ? 'px-3' : ''}`}>
          {isCompact ? (
            <>
              <span className="text-[0.7rem] font-bold uppercase tracking-wider opacity-90" style={{ color: '#fff' }}>
                {typeLabel(block)}
              </span>
              <span className="flex-1 min-w-0 truncate text-[0.85rem] font-semibold" style={{ color: '#fff' }}>
                {title}
              </span>
              <span className="text-[0.7rem] font-mono opacity-80" style={{ color: '#fff' }}>
                {block.durationMin}m
              </span>
            </>
          ) : (
            <>
              <div>
                <div className="text-[0.65rem] font-bold uppercase tracking-wider opacity-90 mb-0.5" style={{ color: '#fff' }}>
                  {typeLabel(block)}
                </div>
                <div className="font-bold text-[0.95rem] leading-tight line-clamp-2" style={{ color: '#fff' }}>
                  {title}
                </div>
                {isActive && (
                  <div className="font-mono font-bold text-sm mt-1" style={{ color: '#fff' }}>
                    {formatCountdown(msRemaining)} left
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between text-[0.7rem] opacity-90" style={{ color: '#fff' }}>
                <span className="font-mono">
                  {formatTime(startD)} – {formatTime(endD)}
                </span>
                <span className="font-mono">{block.durationMin}m</span>
              </div>
            </>
          )}
        </div>
      </motion.button>
    </div>
  );
}

// ─── Now-line ─────────────────────────────────────────────────────────────────

function NowLine({ top }: { top: number }) {
  return (
    <div
      className="absolute left-0 right-0 z-20 pointer-events-none"
      style={{ top }}
    >
      <div className="relative flex items-center">
        <div className="absolute -left-1 w-3 h-3 rounded-full bg-(--color-fire) shadow-[0_0_8px_var(--color-fire)]" />
        <div className="w-full h-[2px] bg-(--color-fire) shadow-[0_0_6px_var(--color-fire)]" />
      </div>
    </div>
  );
}

// ─── Hour gridlines ───────────────────────────────────────────────────────────

function HourGrid() {
  const hours: number[] = [];
  for (let h = VIEW_START_HOUR; h <= VIEW_END_HOUR; h += 1) hours.push(h);
  return (
    <>
      {hours.map((h) => {
        const top = (h - VIEW_START_HOUR) * 60 * PX_PER_MIN;
        const label = h === 0 ? '12am' : h === 12 ? '12pm' : h < 12 ? `${h}am` : `${h - 12}pm`;
        return (
          <div
            key={h}
            className="absolute left-0 right-0 pointer-events-none"
            style={{ top }}
          >
            <div className="border-t border-white/[0.06]" />
            <span
              className="absolute left-2 -translate-y-1/2 text-[0.62rem] font-mono uppercase tracking-wide"
              style={{ color: 'var(--color-muted)', top: 0 }}
            >
              {label}
            </span>
          </div>
        );
      })}
    </>
  );
}

// ─── Day chip ─────────────────────────────────────────────────────────────────

function DayChip({
  date,
  active,
  workMin,
  onClick,
}: {
  date: Date;
  active: boolean;
  workMin: number;
  onClick: () => void;
}) {
  const today = new Date();
  const isToday = sameDay(date, today);
  const wkday = date.toLocaleDateString([], { weekday: 'short' });
  const day = date.getDate();
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-all shrink-0"
      style={{
        background: active ? 'var(--color-primary)' : 'var(--color-surface)',
        border: active ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
        minWidth: 56,
      }}
    >
      <span className="text-[0.65rem] font-bold uppercase tracking-wide" style={{ color: active ? '#fff' : 'var(--color-muted)' }}>
        {isToday ? 'Today' : wkday}
      </span>
      <span className="text-lg font-bold leading-none" style={{ color: active ? '#fff' : 'var(--color-text)' }}>
        {day}
      </span>
      {workMin > 0 && (
        <span className="text-[0.55rem] font-mono" style={{ color: active ? 'rgba(255,255,255,0.85)' : 'var(--color-muted)' }}>
          {Math.round(workMin / 60 * 10) / 10}h
        </span>
      )}
    </button>
  );
}

// ─── Plan controls ────────────────────────────────────────────────────────────

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
      className="rounded-[14px] p-3 mb-3"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
    >
      <div className="flex gap-1.5 mb-2.5">
        <ModeButton
          active={mode === 'balanced'}
          onClick={() => onChangeMode('balanced')}
          color="#2dd4bf"
          label="🌙 Balanced"
          sub="Respects energy dips"
        />
        <ModeButton
          active={mode === 'crush'}
          onClick={() => onChangeMode('crush')}
          color="#f87171"
          label="🔥 Crush"
          sub="Pack the day, drop low-pri"
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
  active, onClick, color, label, sub,
}: { active: boolean; onClick: () => void; color: string; label: string; sub: string }) {
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
      className="rounded-[14px] p-3 mb-3"
      style={{
        background: mode === 'crush' ? 'rgba(239,68,68,0.14)' : 'rgba(245,158,11,0.10)',
        border: mode === 'crush' ? '1px solid rgba(239,68,68,0.45)' : '1px solid rgba(245,158,11,0.35)',
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full text-left"
      >
        <span className="text-sm font-semibold" style={{ color: mode === 'crush' ? '#fca5a5' : '#fbbf24' }}>
          {headline}
        </span>
        <span className="ml-auto text-xs" style={{ color: 'var(--color-muted)' }}>{open ? '▲' : '▼'}</span>
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

// ─── Selected-block drawer (bottom sheet) ─────────────────────────────────────

function SelectedDrawer({
  block,
  quest,
  status,
  explanation,
  loadingExplanation,
  onClose,
  onStart,
  onPin,
  onDelete,
  onExplain,
}: {
  block: ScheduleBlock;
  quest: Quest | null;
  status: 'past' | 'active' | 'upcoming';
  explanation: string | null;
  loadingExplanation: boolean;
  onClose: () => void;
  onStart: () => void;
  onPin: () => void;
  onDelete: () => void;
  onExplain: () => void;
}) {
  const color = blockColor(block, quest);
  const startD = new Date(block.start);
  const endD = new Date(block.end);
  return (
    <motion.div
      initial={{ y: 320, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 320, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 36 }}
      className="fixed inset-x-3 bottom-20 z-40 rounded-2xl shadow-2xl"
      style={{
        background: 'var(--color-surface2)',
        border: `1.5px solid ${color}`,
        boxShadow: `0 0 30px ${color}33`,
      }}
    >
      {/* Accent strip */}
      <div className="h-1 rounded-t-2xl" style={{ background: color }} />

      <div className="p-4">
        <div className="flex items-start gap-2 mb-2">
          <span
            className="text-[0.62rem] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
            style={{ background: `${color}22`, color }}
          >
            {typeLabel(block)}
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-base leading-tight" style={{ color: 'var(--color-text)' }}>
              {quest?.title ?? (block.type === 'break' ? 'Break' : block.type === 'fixed' ? (block.note ?? 'Fixed') : 'Free slot')}
            </h3>
            <p className="text-xs mt-0.5 font-mono" style={{ color: 'var(--color-muted)' }}>
              {formatTime(startD)} – {formatTime(endD)} · {block.durationMin}m
              {quest?.category && ` · ${quest.category.replace('_', ' ')}`}
            </p>
          </div>
          <button onClick={onClose} className="text-lg opacity-60 hover:opacity-100" style={{ color: 'var(--color-muted)' }}>
            ✕
          </button>
        </div>

        {block.note && block.type === 'work' && (
          <p className="text-xs italic mt-2 mb-3" style={{ color: 'var(--color-muted)' }}>
            {block.note}
          </p>
        )}

        {explanation && (
          <div
            className="rounded-lg p-2.5 mb-3 text-xs"
            style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--color-text)' }}
          >
            💡 {explanation}
          </div>
        )}

        {status !== 'past' && block.type === 'work' && (
          <div className="flex flex-wrap items-center gap-2">
            {status === 'upcoming' && (
              <button
                onClick={onStart}
                className="text-sm px-4 py-1.5 rounded-full font-bold transition-transform hover:scale-105"
                style={{ background: color, color: '#fff' }}
              >
                ▶ Start
              </button>
            )}
            <button
              onClick={onPin}
              className="text-xs px-3 py-1.5 rounded-full border transition-colors"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            >
              {block.locked ? 'Unpin' : '📌 Pin'}
            </button>
            <button
              onClick={onExplain}
              disabled={loadingExplanation || !!explanation}
              className="text-xs px-3 py-1.5 rounded-full border transition-colors disabled:opacity-50"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            >
              {loadingExplanation ? '…' : '💡 Why this?'}
            </button>
            <button
              onClick={onDelete}
              className="text-xs px-3 py-1.5 rounded-full border ml-auto"
              style={{ borderColor: 'rgba(239,68,68,0.4)', color: '#f87171' }}
            >
              Remove
            </button>
          </div>
        )}
      </div>
    </motion.div>
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
  const [selectedDay, setSelectedDay] = useState<number>(startOfDay(Date.now()));
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [loadingExplanation, setLoadingExplanation] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    loadQuests();
    useScheduleStore.getState().fetch().then(() => {
      if (useScheduleStore.getState().schedule.length === 0) {
        useScheduleStore.getState().generate();
      }
    });
  }, [loadQuests]);

  // When timeline renders, scroll the now-line into view if today.
  useEffect(() => {
    if (!timelineRef.current) return;
    const isToday = selectedDay === startOfDay(now);
    if (!isToday) return;
    const top = minutesFromViewStart(now, selectedDay) * PX_PER_MIN;
    timelineRef.current.scrollTo({ top: Math.max(0, top - 200), behavior: 'smooth' });
  }, [selectedDay, schedule.length]); // re-run on day change + schedule refresh

  const questById = useMemo(
    () => Object.fromEntries(quests.map((q) => [q.id, q])) as Record<string, Quest | undefined>,
    [quests],
  );

  // ─ Day tabs: today + next DAY_TABS-1 days ─
  const dayList = useMemo(() => {
    const out: Array<{ ts: number; date: Date; workMin: number }> = [];
    const t0 = startOfDay(now);
    for (let i = 0; i < DAY_TABS; i += 1) {
      const ts = t0 + i * 24 * 60 * 60_000;
      const date = new Date(ts);
      const workMin = schedule
        .filter((b) => b.type === 'work' && sameDay(new Date(b.start), date))
        .reduce((s, b) => s + b.durationMin, 0);
      out.push({ ts, date, workMin });
    }
    return out;
  }, [schedule, now]);

  // Blocks for selected day
  const dayBlocks = useMemo(
    () => schedule
      .filter((b) => sameDay(new Date(b.start), new Date(selectedDay)))
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()),
    [schedule, selectedDay],
  );

  // Today progress (for headline % done)
  const todayBlocks = schedule.filter((b) =>
    sameDay(new Date(b.start), new Date(now)) && b.type === 'work',
  );
  const totalWorkMin = todayBlocks.reduce((a, b) => a + b.durationMin, 0);
  const doneWorkMin = todayBlocks
    .filter((b) => blockStatus(b, now) === 'past')
    .reduce((a, b) => a + b.durationMin, 0);
  const pctDone = totalWorkMin > 0 ? Math.round((doneWorkMin / totalWorkMin) * 100) : 0;

  const selectedBlock = selectedBlockId
    ? schedule.find((b) => b.id === selectedBlockId) ?? null
    : null;
  const selectedQuest = selectedBlock?.taskId ? questById[selectedBlock.taskId] ?? null : null;
  const selectedStatus = selectedBlock ? blockStatus(selectedBlock, now) : 'upcoming';

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
    (blockId: string) => {
      applyEdit({ kind: 'delete_block', blockId });
      setSelectedBlockId(null);
    },
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
      generate({ mode: m });
    },
    [setMode, generate],
  );

  const handleExplain = useCallback(async () => {
    if (!selectedBlock) return;
    setLoadingExplanation(true);
    try {
      const r = await api.schedule.explain(selectedBlock.id);
      setExplanation(r.explanation);
    } catch {
      setExplanation('Could not load explanation.');
    } finally {
      setLoadingExplanation(false);
    }
  }, [selectedBlock]);

  // Clear explanation when selection changes
  useEffect(() => {
    setExplanation(null);
  }, [selectedBlockId]);

  return (
    <div className="min-h-screen pb-24" style={{ background: 'var(--color-bg)' }}>
      <Header />

      {/* Progress bar */}
      <div className="sticky top-[56px] z-30 h-1 w-full" style={{ background: 'var(--color-surface)' }}>
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

        <PlanControls
          mode={mode}
          loading={loading}
          onChangeMode={handleChangeMode}
          onRegenerate={() => generate()}
          onReplan={() => replan()}
        />

        {!feasibilityReport.ok && (
          <FeasibilityBanner mode={mode} issues={feasibilityReport.issues} questById={questById} />
        )}

        {error && (
          <div
            className="rounded-[14px] p-4 mb-3 text-sm"
            style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}
          >
            {error}
          </div>
        )}

        {/* Day tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-3 scrollbar-hide">
          {dayList.map((d) => (
            <DayChip
              key={d.ts}
              date={d.date}
              active={d.ts === selectedDay}
              workMin={d.workMin}
              onClick={() => setSelectedDay(d.ts)}
            />
          ))}
        </div>

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

        {/* Empty state for day with no blocks */}
        {schedule.length > 0 && dayBlocks.length === 0 && (
          <div
            className="rounded-[14px] p-6 text-center mb-3"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          >
            <p className="text-2xl mb-1">🌤️</p>
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
              Nothing scheduled this day.
            </p>
          </div>
        )}

        {/* Timeline */}
        {dayBlocks.length > 0 && (
          <div
            ref={timelineRef}
            className="rounded-[14px] overflow-y-auto"
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              maxHeight: '70vh',
            }}
          >
            <div
              className="relative pl-12 pr-2 py-3"
              style={{ height: TIMELINE_HEIGHT + 24 }}
            >
              <HourGrid />

              {selectedDay === startOfDay(now) && (
                <NowLine top={minutesFromViewStart(now, selectedDay) * PX_PER_MIN} />
              )}

              {dayBlocks.map((block) => {
                const start = new Date(block.start).getTime();
                const top = minutesFromViewStart(start, selectedDay) * PX_PER_MIN;
                const height = Math.max(28, block.durationMin * PX_PER_MIN - 2);
                const status = blockStatus(block, now);
                const quest = block.taskId ? questById[block.taskId] ?? null : null;

                return (
                  <BlockTile
                    key={block.id}
                    block={block}
                    quest={quest}
                    status={status}
                    top={top}
                    height={height}
                    now={now}
                    isSelected={selectedBlockId === block.id}
                    onSelect={() => setSelectedBlockId(selectedBlockId === block.id ? null : block.id)}
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
                      if (draggingId && block.type === 'work' && status !== 'past' && draggingId !== block.id) {
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
                );
              })}
            </div>
          </div>
        )}

        {generatedAt && (
          <p className="mt-4 text-center text-xs" style={{ color: 'var(--color-muted)' }}>
            Last generated {new Date(generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            {' · '}
            {mode === 'crush' ? '🔥 Crush' : '🌙 Balanced'} mode
          </p>
        )}
      </div>

      {/* Selected-block drawer */}
      <AnimatePresence>
        {selectedBlock && (
          <SelectedDrawer
            block={selectedBlock}
            quest={selectedQuest}
            status={selectedStatus}
            explanation={explanation}
            loadingExplanation={loadingExplanation}
            onClose={() => setSelectedBlockId(null)}
            onStart={() => {
              setActiveBlock(selectedBlock.id);
              if (selectedQuest) {
                startTimer({
                  questId: selectedQuest.id,
                  questTitle: selectedQuest.title,
                  durationMin: selectedBlock.durationMin,
                });
                setTimerOpen(true);
                setSelectedBlockId(null);
              }
            }}
            onPin={() => handlePin(selectedBlock)}
            onDelete={() => handleDelete(selectedBlock.id)}
            onExplain={handleExplain}
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
          style={{ background: 'var(--color-primary)', color: '#fff' }}
        >
          ⏱ Resume timer
        </button>
      )}

      <style>{`.scrollbar-hide::-webkit-scrollbar { display: none; } .scrollbar-hide { scrollbar-width: none; }`}</style>
    </div>
  );
}
