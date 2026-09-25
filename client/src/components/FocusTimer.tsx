/**
 * FocusTimer — full-bleed modal showing a live countdown for a focus block.
 *
 * Buttons:
 *   - Pause / Resume — toggles the paused state in useTimerStore
 *   - ✓ Done — calls completeQuest (passed by parent) and closes
 *   - ✕ Close — leaves the timer running in the background
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api';
import { useTimerStore } from '../store/useTimerStore';
import { Check, Pause, Play } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  onComplete: (questId: string) => Promise<void> | void;
}

function fmt(ms: number): string {
  if (ms <= 0) return '00:00';
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function FocusTimer({ open, onClose, onComplete }: Props) {
  const { active, pause, resume, stop, remainingMs } = useTimerStore();
  const [, force] = useState(0);
  const [completing, setCompleting] = useState(false);

  // 1s tick to drive the countdown.
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [open]);

  if (!open || !active) return null;
  const ms = remainingMs();
  const overrun = ms < 0;
  const totalMs = active.durationMin * 60_000;
  const pctDone = Math.min(100, Math.max(0, ((totalMs - ms) / totalMs) * 100));
  const paused = active.pausedAt !== null;

  /** Minutes actually focused: wall time minus pauses (including a live one). */
  const focusedMin = () => {
    const pausedNow = active.pausedAt !== null ? Date.now() - active.pausedAt : 0;
    return Math.round((Date.now() - active.startedAt - active.pausedTotalMs - pausedNow) / 60_000);
  };

  /**
   * Real time is what teaches the planner: it subtracts progress on
   * multi-session quests and calibrates future estimates. Never blocks the
   * session ending if the request fails.
   */
  const logFocus = async () => {
    const minutes = Math.min(600, focusedMin());
    if (minutes >= 1) await api.quests.focus(active.questId, minutes).catch(() => {});
  };

  const handleKeepProgress = async () => {
    if (completing) return;
    setCompleting(true);
    try {
      await logFocus();
      stop();
      onClose();
    } finally {
      setCompleting(false);
    }
  };

  const handleDone = async () => {
    if (completing) return;
    setCompleting(true);
    try {
      await logFocus();
      await onComplete(active.questId);
      stop();
      onClose();
    } finally {
      setCompleting(false);
    }
  };

  const handleDiscard = () => {
    if (confirm('Drop this focus session without completing the quest?')) {
      stop();
      onClose();
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex flex-col items-center justify-center"
        style={{
          background: 'var(--color-bg)',
          // Overrun is signalled by a border and the red clock, not a glow.
          boxShadow: overrun ? 'inset 0 0 0 3px var(--color-fire)' : 'none',
        }}
      >
        {/* Minimal close (keeps session alive in background) */}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 text-base opacity-60 hover:opacity-100"
          style={{ color: 'var(--color-muted)' }}
          title="Minimize"
        >
          —
        </button>

        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center"
        >
          <p className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--color-muted)' }}>
            {paused ? 'Paused' : overrun ? 'Overtime' : 'Focusing'}
          </p>
          <p
            className="text-sm font-semibold mb-6 max-w-md mx-auto px-4"
            style={{ color: 'var(--color-text)' }}
          >
            {active.questTitle}
          </p>

          {/* Big countdown */}
          <motion.div
            animate={{
              color: overrun
                ? 'var(--color-fire)'
                : paused
                ? 'var(--color-muted)'
                : 'var(--color-text)',
            }}
            className="font-mono font-bold tracking-tight"
            style={{
              fontSize: 'clamp(72px, 18vw, 144px)',
              lineHeight: 1,
            }}
          >
            {overrun ? `+${fmt(-ms)}` : fmt(ms)}
          </motion.div>

          {/* Progress ring (rendered as a bar for simplicity) */}
          <div
            className="mt-6 mx-auto h-1 rounded-full overflow-hidden"
            style={{ width: 'clamp(220px, 60vw, 480px)', background: 'rgba(255,255,255,0.08)' }}
          >
            <div
              className="h-full transition-all duration-1000"
              style={{
                width: `${pctDone}%`,
                background: overrun ? 'var(--color-fire)' : 'var(--color-primary)',
              }}
            />
          </div>
        </motion.div>

        <div className="mt-10 flex items-center gap-3">
          {paused ? (
            <button
              onClick={resume}
              className="rounded-md px-6 py-2.5 text-sm font-semibold text-(--color-on-primary)"
              style={{ background: 'var(--color-primary)' }}
            >
              <span className="inline-flex items-center gap-2"><Play size={16} aria-hidden /> Resume</span>
            </button>
          ) : (
            <button
              onClick={pause}
              className="rounded-md border px-6 py-2.5 text-sm font-semibold"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            >
              <span className="inline-flex items-center gap-2"><Pause size={16} aria-hidden /> Pause</span>
            </button>
          )}
          <button
            onClick={handleDone}
            disabled={completing}
            className="rounded-md px-6 py-2.5 text-sm font-semibold text-(--color-on-primary) disabled:opacity-50"
            style={{ background: 'var(--color-green)' }}
          >
            {completing ? '…' : <span className="inline-flex items-center gap-2"><Check size={16} strokeWidth={2.5} aria-hidden /> Done</span>}
          </button>
          <button
            onClick={handleDiscard}
            className="rounded-md border px-6 py-2.5 text-sm font-semibold"
            style={{
              borderColor: 'color-mix(in srgb, var(--color-fire) 40%, transparent)',
              color: 'var(--color-fire)',
            }}
          >
            Drop
          </button>
        </div>
        <button
          onClick={handleKeepProgress}
          disabled={completing}
          className="mt-3 text-xs font-semibold underline-offset-2 hover:underline disabled:opacity-50"
          style={{ color: 'var(--color-muted)' }}
        >
          Stop for now, keep progress
        </button>
      </motion.div>
    </AnimatePresence>
  );
}
