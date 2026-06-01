import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useScheduleStore } from '../store/useScheduleStore';
import { useQuestStore } from '../store/useQuestStore';
import { useUserStore } from '../store/useUserStore';
import { useTimerStore } from '../store/useTimerStore';
import { useAchievementsStore } from '../store/useAchievementsStore';
import { useToastStore } from '../components/Toasts';
import { Header } from '../components/Header';
import { FocusTimer } from '../components/FocusTimer';
import { api, type ScheduleBlock, type Quest, type EnergyTracePoint } from '../lib/api';
import { levelFromXP } from '../lib/levels';

// ─── Layout constants ─────────────────────────────────────────────────────────

/** Pixels per minute for FOCUS blocks. */
const PX_PER_MIN = 1.5;
/** Minimum focus-block height so titles + dots always fit. */
const MIN_BLOCK_PX = 64;
/** Number of days in the day-chip strip. */
const DAY_TABS = 5;

const COMPACT_THRESHOLD_PX = 84;

// Bold per-category palette. Returned as start/end gradient stops for vibrancy.
const CATEGORY_GRADIENT: Record<string, [string, string]> = {
  deep_work: ['#a855f7', '#7c3aed'], // purple
  comms:     ['#22d3ee', '#0e7490'], // cyan/teal
  admin:     ['#fbbf24', '#d97706'], // amber/orange
  creative:  ['#f472b6', '#db2777'], // pink/rose
};
const FALLBACK_GRADIENT: [string, string] = ['#8b5cf6', '#6d28d9'];

function blockGradient(b: ScheduleBlock, quest: Quest | null): [string, string] {
  if (b.type !== 'work' && b.type !== 'fixed') return FALLBACK_GRADIENT;
  if (b.type === 'fixed') return ['#fbbf24', '#d97706'];
  const cat = quest?.category ?? 'deep_work';
  return CATEGORY_GRADIENT[cat] ?? FALLBACK_GRADIENT;
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

function loadDots(load: number | undefined): number {
  const l = load ?? 5;
  if (l >= 9) return 5;
  if (l >= 7) return 4;
  if (l >= 5) return 3;
  if (l >= 3) return 2;
  return 1;
}

function blockHeight(b: ScheduleBlock): number {
  if (b.type === 'break' || b.type === 'buffer') {
    // Tiny separator line for short breaks; longer for big ones.
    return Math.max(10, Math.min(26, b.durationMin * 0.9));
  }
  return Math.max(MIN_BLOCK_PX, b.durationMin * PX_PER_MIN);
}

// ─── Break / buffer separator (thin blue line) ────────────────────────────────

function BreakLine({ block }: { block: ScheduleBlock }) {
  const isBuffer = block.type === 'buffer';
  const label = isBuffer ? `${block.durationMin}m free` : `${block.durationMin}m breather`;
  const color = isBuffer ? '#64748b' : '#38bdf8'; // slate or sky-blue

  const height = blockHeight(block);

  return (
    <div
      className="relative w-full flex items-center justify-center"
      style={{ height }}
      title={`${block.durationMin}-minute ${isBuffer ? 'free slot' : 'break'}`}
    >
      {/* Left dashed line */}
      <div className="flex-1 h-px relative">
        <div
          className="absolute inset-0"
          style={{
            background: `repeating-linear-gradient(90deg, ${color}88 0 6px, transparent 6px 10px)`,
          }}
        />
        {!isBuffer && (
          <motion.div
            className="absolute inset-0"
            initial={{ x: '-100%' }}
            animate={{ x: '100%' }}
            transition={{ repeat: Infinity, duration: 2.8, ease: 'linear' }}
            style={{
              background: `linear-gradient(90deg, transparent 0%, ${color} 50%, transparent 100%)`,
              filter: 'blur(2px)',
              opacity: 0.6,
            }}
          />
        )}
      </div>

      {/* Center label */}
      <span
        className="px-2 text-[0.6rem] font-mono uppercase tracking-wide"
        style={{ color }}
      >
        {isBuffer ? '◇' : '☕'} {label}
      </span>

      {/* Right dashed line */}
      <div className="flex-1 h-px relative">
        <div
          className="absolute inset-0"
          style={{
            background: `repeating-linear-gradient(90deg, ${color}88 0 6px, transparent 6px 10px)`,
          }}
        />
      </div>
    </div>
  );
}

// ─── Now marker (glowing red pill inserted at current-time slot) ──────────────

function NowMarker({ time }: { time: number }) {
  return (
    <motion.div
      layout
      className="relative w-full flex items-center justify-center my-1"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      <div className="flex-1 h-[2px] bg-(--color-fire) shadow-[0_0_8px_var(--color-fire)]" />
      <motion.span
        className="mx-2 px-3 py-1 rounded-full text-[0.65rem] font-bold uppercase tracking-wider"
        style={{
          background: 'var(--color-fire)',
          color: '#fff',
          boxShadow: '0 0 14px rgba(239,68,68,0.65)',
        }}
        animate={{ boxShadow: ['0 0 10px rgba(239,68,68,0.55)', '0 0 18px rgba(239,68,68,0.85)', '0 0 10px rgba(239,68,68,0.55)'] }}
        transition={{ repeat: Infinity, duration: 1.6 }}
      >
        🕐 Now · {new Date(time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
      </motion.span>
      <div className="flex-1 h-[2px] bg-(--color-fire) shadow-[0_0_8px_var(--color-fire)]" />
    </motion.div>
  );
}

// ─── Block tile ───────────────────────────────────────────────────────────────

interface BlockTileProps {
  block: ScheduleBlock;
  quest: Quest | null;
  status: 'past' | 'active' | 'upcoming';
  now: number;
  isSelected: boolean;
  onSelect: () => void;
  onQuickDelete: () => void;
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
  now,
  isSelected,
  onSelect,
  onQuickDelete,
  draggable,
  isDragOver,
  isDragging,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: BlockTileProps) {
  const [g1, g2] = blockGradient(block, quest);
  const height = blockHeight(block);
  const isCompact = height < COMPACT_THRESHOLD_PX;
  const isActive = status === 'active' && (block.type === 'work' || block.type === 'fixed');
  const isPast = status === 'past';
  const startD = new Date(block.start);
  const endD = new Date(block.end);
  const msRemaining = endD.getTime() - now;
  const pctDone = isActive
    ? Math.max(0, Math.min(100, ((now - startD.getTime()) / (endD.getTime() - startD.getTime())) * 100))
    : isPast ? 100 : 0;
  const dots = quest ? loadDots(quest.mentalLoad) : 0;
  const title = quest?.title ?? (block.type === 'fixed' ? (block.note ?? 'Fixed') : '—');

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className="relative w-full"
      style={{ height, cursor: draggable ? 'grab' : 'pointer' }}
    >
      <motion.button
        type="button"
        onClick={onSelect}
        layout
        initial={{ opacity: 0, y: 8, scale: 0.96 }}
        animate={{
          opacity: isDragging ? 0.4 : isPast ? 0.5 : 1,
          y: 0,
          scale: 1,
        }}
        whileHover={isPast ? undefined : { y: -2, scale: 1.005 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        className="group relative w-full h-full rounded-2xl overflow-hidden text-left"
        style={{
          background: `linear-gradient(135deg, ${g1} 0%, ${g2} 100%)`,
          border: isDragOver
            ? `2px dashed ${g1}`
            : isActive || isSelected
              ? `2px solid #fff`
              : `1px solid ${g1}55`,
          boxShadow: isActive
            ? `0 0 30px ${g1}88, 0 8px 24px ${g2}55`
            : isSelected
              ? `0 0 18px ${g1}66, 0 6px 18px rgba(0,0,0,0.3)`
              : `0 4px 14px rgba(0,0,0,0.35)`,
        }}
      >
        {/* Sheen overlay for vibrancy */}
        <div
          className="absolute inset-0 pointer-events-none opacity-40"
          style={{
            background: 'linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 40%, rgba(0,0,0,0.18) 100%)',
          }}
        />

        {/* Active-block animated shimmer */}
        {isActive && (
          <motion.div
            className="absolute inset-0 pointer-events-none"
            initial={{ x: '-100%' }}
            animate={{ x: '100%' }}
            transition={{ repeat: Infinity, duration: 3, ease: 'linear' }}
            style={{
              background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.25) 50%, transparent 100%)',
              filter: 'blur(8px)',
            }}
          />
        )}

        {/* Progress bar (active only) */}
        {isActive && (
          <div
            className="absolute bottom-0 left-0 h-1 transition-all duration-1000"
            style={{ width: `${pctDone}%`, background: '#fff', opacity: 0.9, boxShadow: '0 0 10px rgba(255,255,255,0.7)' }}
          />
        )}

        {/* Hover quick-delete (top-right, only on hover for non-active work blocks) */}
        {!isPast && !isActive && draggable && (
          <button
            onClick={(e) => { e.stopPropagation(); onQuickDelete(); }}
            className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 rounded-full flex items-center justify-center text-xs"
            style={{ background: 'rgba(0,0,0,0.4)', color: '#fff', backdropFilter: 'blur(4px)' }}
            title="Remove this block"
          >
            ✕
          </button>
        )}

        {/* Locked badge */}
        {block.locked && (
          <span className="absolute top-2 right-2 text-xs" style={{ color: '#fff' }}>
            📌
          </span>
        )}

        {/* Content */}
        <div className="relative h-full flex items-stretch">
          {/* Start time gutter on the left edge */}
          <div
            className="shrink-0 flex flex-col items-center justify-center px-2"
            style={{ minWidth: 52, borderRight: '1px solid rgba(255,255,255,0.18)' }}
          >
            <span className="text-[0.65rem] font-mono font-bold tracking-tight" style={{ color: '#fff' }}>
              {formatTime(startD)}
            </span>
            {!isCompact && (
              <span className="text-[0.55rem] font-mono opacity-70 mt-0.5" style={{ color: '#fff' }}>
                {block.durationMin}m
              </span>
            )}
          </div>

          {/* Main content */}
          <div className={`flex-1 min-w-0 ${isCompact ? 'flex items-center gap-2 px-3' : 'flex flex-col justify-between p-3'}`}>
            {isCompact ? (
              <>
                <span className="text-[0.62rem] font-bold uppercase tracking-wider opacity-90 shrink-0" style={{ color: '#fff' }}>
                  {typeLabel(block)}
                </span>
                <span className="flex-1 min-w-0 truncate font-semibold text-[0.9rem]" style={{ color: '#fff' }}>
                  {title}
                </span>
                {quest && (
                  <span className="flex gap-[3px] shrink-0">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <span key={i} className="w-1 h-1 rounded-full" style={{ background: i <= dots ? '#fff' : 'rgba(255,255,255,0.25)' }} />
                    ))}
                  </span>
                )}
              </>
            ) : (
              <>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[0.6rem] font-bold uppercase tracking-wider opacity-90" style={{ color: '#fff' }}>
                      {typeLabel(block)}
                    </span>
                    {quest?.category && (
                      <span className="text-[0.55rem] opacity-70 uppercase tracking-wider" style={{ color: '#fff' }}>
                        · {quest.category.replace('_', ' ')}
                      </span>
                    )}
                  </div>
                  <div className="font-bold text-base leading-tight line-clamp-2" style={{ color: '#fff' }}>
                    {title}
                  </div>
                  {isActive && (
                    <div className="font-mono font-bold text-sm mt-1.5 inline-block px-2 py-0.5 rounded" style={{ background: 'rgba(0,0,0,0.25)', color: '#fff' }}>
                      ⏱ {formatCountdown(msRemaining)}
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2">
                  {quest && (
                    <span className="flex gap-[3px]">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <span key={i} className="w-1.5 h-1.5 rounded-full" style={{ background: i <= dots ? '#fff' : 'rgba(255,255,255,0.25)' }} />
                      ))}
                    </span>
                  )}
                  <span className="text-[0.65rem] font-mono opacity-75" style={{ color: '#fff' }}>
                    until {formatTime(endD)}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </motion.button>
    </div>
  );
}

// ─── Energy meter strip ───────────────────────────────────────────────────────

/**
 * Sparkline of the energy meter through today's working hours. Pure visual
 * advisory — the planner doesn't auto-insert breaks based on this, but the
 * user can see where the meter dips and choose to leave gaps.
 */
function EnergyMeterStrip({ trace }: { trace: EnergyTracePoint[] }) {
  if (trace.length < 2) return null;
  const W = 320;
  const H = 36;
  const padY = 4;
  const minM = 0;
  const maxM = 100;
  const xs = trace.map((_, i) => (i / (trace.length - 1)) * W);
  const ys = trace.map((p) => padY + (H - padY * 2) * (1 - (p.meter - minM) / (maxM - minM)));
  const points = xs.map((x, i) => `${x.toFixed(1)},${ys[i]!.toFixed(1)}`).join(' ');
  const areaPoints = `0,${H} ${points} ${W},${H}`;

  // Color the line by current meter health.
  const lastMeter = trace[trace.length - 1]!.meter;
  const tint = lastMeter > 60 ? '#22c55e' : lastMeter > 30 ? '#fbbf24' : '#ef4444';

  return (
    <div
      className="rounded-2xl mb-3 p-2.5"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[0.65rem] font-bold uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>
          ⚡ Energy
        </span>
        <span className="text-xs font-mono font-bold" style={{ color: tint }}>
          {Math.round(lastMeter)}%
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height: H }}>
        <defs>
          <linearGradient id="energy-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={tint} stopOpacity="0.35" />
            <stop offset="100%" stopColor={tint} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polyline points={areaPoints} fill="url(#energy-fill)" stroke="none" />
        <polyline points={points} fill="none" stroke={tint} strokeWidth="1.5" strokeLinejoin="round" />
        {/* 25% threshold line */}
        <line
          x1="0" x2={W}
          y1={padY + (H - padY * 2) * (1 - 25 / maxM)}
          y2={padY + (H - padY * 2) * (1 - 25 / maxM)}
          stroke="rgba(239,68,68,0.4)" strokeWidth="0.5" strokeDasharray="2 3"
        />
      </svg>
    </div>
  );
}

// ─── Feed action menu ─────────────────────────────────────────────────────────

function FeedActionsMenu({
  loading,
  onReflow,
  onReplan,
}: {
  loading: boolean;
  onReflow: () => void;
  onReplan: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={loading}
        className="text-xs px-3 py-1.5 rounded-full font-semibold transition-opacity"
        style={{
          background: 'var(--color-surface2)',
          color: 'var(--color-text)',
          border: '1px solid var(--color-border)',
          opacity: loading ? 0.5 : 1,
        }}
      >
        ⋯ Menu
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-full mt-1 z-20 rounded-xl shadow-xl overflow-hidden min-w-[180px]"
            style={{ background: 'var(--color-surface2)', border: '1px solid var(--color-border)' }}
          >
            <button
              onClick={() => { onReflow(); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-white/5"
              style={{ color: 'var(--color-text)' }}
            >
              ↻ Reflow day
              <div className="text-[0.65rem]" style={{ color: 'var(--color-muted)' }}>
                Rebuild from scratch in priority order
              </div>
            </button>
            <button
              onClick={() => { onReplan(); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-white/5 border-t"
              style={{ color: 'var(--color-text)', borderColor: 'var(--color-border)' }}
            >
              ⟳ Re-fit remaining
              <div className="text-[0.65rem]" style={{ color: 'var(--color-muted)' }}>
                Keep pins + completed; re-flow the rest
              </div>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Day chip ─────────────────────────────────────────────────────────────────

function DayChip({
  date, active, workMin, onClick,
}: { date: Date; active: boolean; workMin: number; onClick: () => void }) {
  const today = new Date();
  const isToday = sameDay(date, today);
  const wkday = date.toLocaleDateString([], { weekday: 'short' });
  const day = date.getDate();
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-all shrink-0"
      style={{
        background: active ? 'linear-gradient(135deg, #a855f7 0%, #6d28d9 100%)' : 'var(--color-surface)',
        border: active ? '1.5px solid #a855f7' : '1px solid var(--color-border)',
        boxShadow: active ? '0 4px 14px rgba(168, 85, 247, 0.4)' : 'none',
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

// ─── Feasibility banner ───────────────────────────────────────────────────────

function FeasibilityBanner({
  issues, questById,
}: {
  issues: Array<{ taskId: string; shortfallMin: number; suggestions: string[] }>;
  questById: Record<string, Quest | undefined>;
}) {
  const [open, setOpen] = useState(false);
  const totalShortfall = issues.reduce((s, i) => s + i.shortfallMin, 0);
  const headline = `⚠️ ${issues.length} quest${issues.length > 1 ? 's' : ''} won't finish before deadline — short ${totalShortfall}m`;
  return (
    <div
      className="rounded-2xl p-3 mb-3"
      style={{
        background: 'rgba(245,158,11,0.10)',
        border: '1px solid rgba(245,158,11,0.35)',
      }}
    >
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 w-full text-left">
        <span className="text-sm font-semibold" style={{ color: '#fbbf24' }}>
          {headline}
        </span>
        <span className="ml-auto text-xs" style={{ color: 'var(--color-muted)' }}>{open ? '▲' : '▼'}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
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

// ─── Selected-block drawer ────────────────────────────────────────────────────

function SelectedDrawer({
  block, quest, status, explanation, loadingExplanation,
  onClose, onStart, onPin, onDelete, onExplain,
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
  const [g1] = blockGradient(block, quest);
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
        border: `1.5px solid ${g1}`,
        boxShadow: `0 0 30px ${g1}33`,
      }}
    >
      <div className="h-1 rounded-t-2xl" style={{ background: g1 }} />

      <div className="p-4">
        <div className="flex items-start gap-2 mb-2">
          <span className="text-[0.62rem] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0" style={{ background: `${g1}22`, color: g1 }}>
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
          <button onClick={onClose} className="text-lg opacity-60 hover:opacity-100" style={{ color: 'var(--color-muted)' }}>✕</button>
        </div>

        {block.note && block.type === 'work' && (
          <p className="text-xs italic mt-2 mb-3" style={{ color: 'var(--color-muted)' }}>{block.note}</p>
        )}

        {explanation && (
          <div className="rounded-lg p-2.5 mb-3 text-xs" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--color-text)' }}>
            💡 {explanation}
          </div>
        )}

        {status !== 'past' && block.type === 'work' && (
          <div className="flex flex-wrap items-center gap-2">
            {status === 'upcoming' && (
              <button
                onClick={onStart}
                className="text-sm px-4 py-1.5 rounded-full font-bold transition-transform hover:scale-105"
                style={{ background: g1, color: '#fff' }}
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
              className="text-xs px-3 py-1.5 rounded-full border disabled:opacity-50"
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
  const { schedule, feasibilityReport, generatedAt, loading, error, generate, replan, applyEdit, setActiveBlock } =
    useScheduleStore();
  const [energyTrace, setEnergyTrace] = useState<EnergyTracePoint[]>([]);
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

  const questById = useMemo(
    () => Object.fromEntries(quests.map((q) => [q.id, q])) as Record<string, Quest | undefined>,
    [quests],
  );

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

  const dayBlocks = useMemo(
    () => schedule
      .filter((b) => sameDay(new Date(b.start), new Date(selectedDay)))
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()),
    [schedule, selectedDay],
  );

  // Index where the "Now" marker should be inserted in the stacked list.
  const nowMarkerIdx = useMemo(() => {
    if (selectedDay !== startOfDay(now)) return -1;
    // Insert before the first block that starts >= now AND after the last that ended <= now.
    for (let i = 0; i < dayBlocks.length; i += 1) {
      const b = dayBlocks[i]!;
      if (new Date(b.start).getTime() >= now) return i;
    }
    return dayBlocks.length; // all blocks are in the past — append at end
  }, [dayBlocks, now, selectedDay]);

  const todayBlocks = schedule.filter((b) => sameDay(new Date(b.start), new Date(now)) && b.type === 'work');
  const totalWorkMin = todayBlocks.reduce((a, b) => a + b.durationMin, 0);
  const doneWorkMin = todayBlocks
    .filter((b) => blockStatus(b, now) === 'past')
    .reduce((a, b) => a + b.durationMin, 0);
  const pctDone = totalWorkMin > 0 ? Math.round((doneWorkMin / totalWorkMin) * 100) : 0;

  const selectedBlock = selectedBlockId ? schedule.find((b) => b.id === selectedBlockId) ?? null : null;
  const selectedQuest = selectedBlock?.taskId ? questById[selectedBlock.taskId] ?? null : null;
  const selectedStatus = selectedBlock ? blockStatus(selectedBlock, now) : 'upcoming';

  const handlePin = useCallback(
    (block: ScheduleBlock) => {
      applyEdit(block.locked ? { kind: 'unpin_block', blockId: block.id } : { kind: 'pin_block', blockId: block.id });
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

  // Refresh the energy trace whenever the schedule changes.
  useEffect(() => {
    if (schedule.length === 0) {
      setEnergyTrace([]);
      return;
    }
    api.schedule.energy().then((r) => setEnergyTrace(r.trace)).catch(() => setEnergyTrace([]));
  }, [schedule.length, generatedAt]);

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
          style={{ background: 'linear-gradient(90deg, #a855f7 0%, #ec4899 100%)' }}
          animate={{ width: `${pctDone}%` }}
          transition={{ duration: 0.6 }}
        />
      </div>

      <div className="mx-auto max-w-2xl px-4 pt-4">
        {/* Header row */}
        <div className="flex items-center gap-3 mb-3">
          <h1 className="flex-1 text-2xl font-extrabold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            Guild Feed
          </h1>
          <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
            {pctDone}% · {Math.round(totalWorkMin / 60 * 10) / 10}h
          </span>
          <FeedActionsMenu
            loading={loading}
            onReflow={() => generate()}
            onReplan={() => replan()}
          />
        </div>

        <EnergyMeterStrip trace={energyTrace} />

        {!feasibilityReport.ok && (
          <FeasibilityBanner issues={feasibilityReport.issues} questById={questById} />
        )}

        {error && (
          <div
            className="rounded-2xl p-4 mb-3 text-sm"
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
              onClick={() => { setSelectedDay(d.ts); setSelectedBlockId(null); }}
            />
          ))}
        </div>

        {/* Drag hint */}
        {dayBlocks.some((b) => b.type === 'work' && !b.locked) && (
          <p className="mb-3 text-[0.7rem] text-center" style={{ color: 'var(--color-muted)' }}>
            ✦ Drag a focus block onto another to swap · Hover for ✕ delete · Tap for actions
          </p>
        )}

        {/* Empty state — no schedule at all */}
        {!loading && schedule.length === 0 && (
          <div className="flex flex-col items-center gap-4 pt-12 text-center">
            <p className="text-5xl">📅</p>
            <p className="font-semibold" style={{ color: 'var(--color-text)' }}>No schedule yet</p>
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
              Hit Regenerate to build today's plan from your quests.
            </p>
            <button
              onClick={() => generate()}
              disabled={loading}
              className="mt-2 px-6 py-2.5 rounded-full font-bold text-sm"
              style={{
                background: 'linear-gradient(135deg, #a855f7 0%, #6d28d9 100%)',
                color: '#fff',
                boxShadow: '0 4px 14px rgba(139, 92, 246, 0.4)',
              }}
            >
              ↻ Build my schedule
            </button>
          </div>
        )}

        {schedule.length > 0 && dayBlocks.length === 0 && (
          <div
            className="rounded-2xl p-8 text-center"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          >
            <p className="text-3xl mb-2">🌤️</p>
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>Nothing scheduled this day.</p>
          </div>
        )}

        {/* Stacked timeline */}
        {dayBlocks.length > 0 && (
          <div
            className="rounded-2xl p-3 flex flex-col"
            style={{
              background: 'linear-gradient(180deg, var(--color-surface) 0%, rgba(22, 22, 42, 0.4) 100%)',
              border: '1px solid var(--color-border)',
              gap: 6,
            }}
          >
            <AnimatePresence initial={false}>
              {dayBlocks.map((block, i) => {
                const status = blockStatus(block, now);
                const quest = block.taskId ? questById[block.taskId] ?? null : null;
                const isBreak = block.type === 'break' || block.type === 'buffer';

                const renderNow = i === nowMarkerIdx;

                return (
                  <div key={block.id}>
                    {renderNow && <NowMarker time={now} />}
                    {isBreak ? (
                      <BreakLine block={block} />
                    ) : (
                      <BlockTile
                        block={block}
                        quest={quest}
                        status={status}
                        now={now}
                        isSelected={selectedBlockId === block.id}
                        onSelect={() => setSelectedBlockId(selectedBlockId === block.id ? null : block.id)}
                        onQuickDelete={() => handleDelete(block.id)}
                        draggable={block.type === 'work' && status !== 'past' && !block.locked}
                        isDragging={draggingId === block.id}
                        isDragOver={dragOverId === block.id && draggingId !== block.id}
                        onDragStart={(e) => {
                          setDraggingId(block.id);
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', block.id);
                        }}
                        onDragEnd={() => { setDraggingId(null); setDragOverId(null); }}
                        onDragOver={(e) => {
                          if (draggingId && block.type === 'work' && status !== 'past' && draggingId !== block.id) {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                            if (dragOverId !== block.id) setDragOverId(block.id);
                          }
                        }}
                        onDragLeave={() => { if (dragOverId === block.id) setDragOverId(null); }}
                        onDrop={(e) => { e.preventDefault(); handleDrop(block.id); }}
                      />
                    )}
                  </div>
                );
              })}
              {nowMarkerIdx === dayBlocks.length && <NowMarker time={now} />}
            </AnimatePresence>
          </div>
        )}

        {generatedAt && (
          <p className="mt-4 text-center text-xs" style={{ color: 'var(--color-muted)' }}>
            Last generated {new Date(generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
