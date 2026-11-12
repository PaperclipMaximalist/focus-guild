/**
 * QuestDetail — tap a quest card → opens this overlay.
 *
 * Shows: full metadata, the quest's steps, XP history, and shortcut buttons
 * (Edit → QuestModal, Complete, Delete).
 *
 * The steps are the same dropdown list a quest's row opens (SubQuestList):
 * three tiers, ticked and added in place. What this sheet adds is "Break
 * down", which asks the AI for steps and files the ones you keep.
 */

import { useEffect, useId, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api, type Quest, type XPEventDTO } from '../lib/api';
import { useQuestStore } from '../store/useQuestStore';
import { useUserStore } from '../store/useUserStore';
import { useToastStore } from './Toasts';
import { formatDeadline, formatDeadlineExact, formatMinutes } from '../lib/formatters';
import { SubQuestList } from './SubQuestList';
import { useDialog } from '../lib/useDialog';
import { CalendarClock, Check, Pencil, Star, Trash2, TriangleAlert, WandSparkles, X } from 'lucide-react';

interface Props {
  open: boolean;
  quest: Quest | null;
  onClose: () => void;
  onEdit: () => void;
  /**
   * The page's own completion, so the sound, streak, trophies and level-up
   * play exactly as they do from the row. Without it the sheet completes
   * quietly with an XP toast.
   */
  onComplete?: (id: string) => Promise<unknown> | void;
}

const CATEGORY_LABEL: Record<string, string> = {
  deep_work: 'Deep work',
  comms: 'Comms',
  admin: 'Admin',
  creative: 'Creative',
};

export function QuestDetail({ open, quest, onClose, onEdit, onComplete }: Props) {
  const { complete, removeWithUndo, notToday, load: loadQuests } = useQuestStore();
  const titleId = useId();
  const boxRef = useDialog(open && !!quest, onClose);
  const { applyXPGain } = useUserStore();
  const pushToast = useToastStore((s) => s.push);

  const [xpEvents, setXpEvents] = useState<XPEventDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingSub, setSavingSub] = useState(false);
  /** Bumped when steps are added from here, so the list reads them. */
  const [stepsKey, setStepsKey] = useState(0);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<
    Array<{ title: string; estimatedMinutes: number; rationale: string; keep: boolean }>
  >([]);

  // Load the XP history on open; the steps load themselves.
  useEffect(() => {
    if (!open || !quest) return;
    setLoading(true);
    api.quests
      .xpEvents(quest.id)
      .then(setXpEvents)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, quest?.id]);

  if (!quest) return null;

  const stepsChanged = () => {
    // Counts on the quest lists, and what the steps have earned.
    loadQuests();
    api.quests.xpEvents(quest.id).then(setXpEvents).catch(() => {});
  };

  const askAi = async () => {
    if (!quest || aiBusy) return;
    setAiBusy(true);
    setAiError(null);
    setAiSuggestions([]);
    try {
      const { suggestions } = await api.quests.decompose(quest.id);
      setAiSuggestions(suggestions.map((s) => ({ ...s, keep: true })));
    } catch (e) {
      const msg = String(e);
      if (msg.includes('AI_NOT_CONFIGURED')) {
        setAiError('No AI is connected. Connect one in Settings, under Advanced, then Your AI.');
      } else {
        setAiError(msg);
      }
    } finally {
      setAiBusy(false);
    }
  };

  const acceptAiSuggestions = async () => {
    if (!quest) return;
    const accepted = aiSuggestions.filter((s) => s.keep);
    if (accepted.length === 0) {
      setAiSuggestions([]);
      return;
    }
    setSavingSub(true);
    try {
      const created = await Promise.all(
        accepted.map((s) =>
          api.quests.create({
            title: s.title,
            estimatedMinutes: s.estimatedMinutes,
            mentalLoad: quest.mentalLoad,
            impact: quest.impact,
            parentQuestId: quest.id,
            category: quest.category ?? undefined,
            tags: quest.tags ?? [],
          }),
        ),
      );
      setAiSuggestions([]);
      setStepsKey((k) => k + 1);
      loadQuests();
      pushToast({
        icon: WandSparkles,
        title: `+${created.length} sub-quests`,
        sub: 'AI-decomposed',
        variant: 'xp',
      });
    } finally {
      setSavingSub(false);
    }
  };

  const handleDeleteParent = () => {
    removeWithUndo(quest.id);
    onClose();
  };

  // Held until the member's tomorrow; the planner leaves it alone until then.
  const handleNotToday = async () => {
    try {
      await notToday(quest.id);
      pushToast({ icon: CalendarClock, title: 'Not today', sub: `${quest.title} is back tomorrow`, variant: 'xp' });
      onClose();
    } catch (e) {
      pushToast({ icon: TriangleAlert, title: 'Could not move it to tomorrow', sub: String(e), variant: 'error' });
    }
  };

  const handleComplete = async () => {
    try {
      if (onComplete) {
        onClose();
        await onComplete(quest.id);
        return;
      }
      const result = await complete(quest.id);
      applyXPGain(result.totalXP, result.newStreak, result.newMultiplier);
      pushToast({
        icon: Star,
        title: `+${result.xpAwarded} XP`,
        sub: 'Quest complete',
        variant: 'xp',
      });
      onClose();
    } catch (e) {
      pushToast({ icon: TriangleAlert, title: 'Could not complete', sub: String(e), variant: 'error' });
    }
  };

  const totalXP = xpEvents.reduce((s, e) => s + e.amount, 0);

  const now = new Date();
  const deadlineLine = !quest.deadline
    ? 'No deadline'
    : new Date(quest.deadline) < now
      ? `Was due ${formatDeadlineExact(quest.deadline, now)} (${formatDeadline(quest.deadline, now)})`
      : `Due ${formatDeadlineExact(quest.deadline, now)}`;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-5"
        >
          <motion.div
            ref={boxRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-t-2xl sm:rounded-2xl border p-5 max-h-[90vh] overflow-y-auto outline-none"
            style={{
              background: 'var(--color-surface2)',
              borderColor: 'var(--color-border)',
            }}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex-1 min-w-0">
                <h2
                  id={titleId}
                  className="text-lg leading-snug"
                  // A quest's title is the member's own words, never signage. The
                  // heading rule in index.css is unlayered, so utilities cannot
                  // undo its capitals and display face; inline styles can.
                  style={{
                    color: 'var(--color-text)',
                    fontFamily: 'var(--font-sans)',
                    fontWeight: 600,
                    textTransform: 'none',
                    letterSpacing: 'normal',
                    lineHeight: 1.3,
                  }}
                >
                  {quest.title}
                </h2>
                <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>
                  {formatMinutes(quest.rolledUpMinutes ?? quest.estimatedMinutes)}
                  {` · ${deadlineLine}`}
                  {quest.category && ` · ${CATEGORY_LABEL[quest.category] ?? quest.category}`}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="icon-btn -mr-2 -mt-1"
                aria-label="Close"
              >
                <X size={18} aria-hidden />
              </button>
            </div>

            {/* Top-line stats */}
            <div className={`grid grid-cols-2 gap-2 mb-4 ${totalXP > 0 ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
              <Pill label="Impact" value={`${quest.impact}/10`} />
              <Pill label="Mental load" value={`${quest.mentalLoad}/10`} />
              {/* How the planner ranks it: deadline, impact and load together, out of 10. */}
              <Pill label="Priority" value={(quest.priorityScore ?? 0).toFixed(1)} />
              {totalXP > 0 && <Pill label="XP earned" value={totalXP.toString()} />}
            </div>

            {/* Tags */}
            {quest.tags && quest.tags.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-1.5">
                {quest.tags.map((t) => (
                  <span
                    key={t}
                    className="text-xs rounded-md px-2 py-0.5 font-semibold"
                    style={{ background: 'color-mix(in srgb, var(--color-primary) 15%, transparent)', color: 'var(--color-primary)' }}
                  >
                    #{t}
                  </span>
                ))}
              </div>
            )}

            {/* Sub-quests */}
            <section className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <h3
                  className="text-xs uppercase font-bold tracking-wide"
                  style={{ color: 'var(--color-muted)' }}
                >
                  Steps
                </h3>
                <button
                  onClick={askAi}
                  disabled={aiBusy}
                  title="Break down with AI"
                  className="min-h-9 text-xs rounded-md px-2.5 py-1 font-semibold transition-opacity disabled:opacity-40"
                  style={{
                    background: 'color-mix(in srgb, var(--color-gold) 15%, transparent)',
                    color: 'var(--color-gold)',
                    border: '1px solid color-mix(in srgb, var(--color-gold) 40%, transparent)',
                  }}
                >
                  {aiBusy ? '…' : <span className="inline-flex items-center gap-1.5"><WandSparkles size={12} aria-hidden /> Break down</span>}
                </button>
              </div>

              {/* AI suggestions preview */}
              {aiSuggestions.length > 0 && (
                <div
                  className="mb-3 rounded-lg p-3"
                  style={{
                    background: 'color-mix(in srgb, var(--color-gold) 6%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--color-gold) 35%, transparent)',
                  }}
                >
                  <p
                    className="text-xs font-semibold mb-2"
                    style={{ color: 'var(--color-gold)' }}
                  >
                    <span className="inline-flex items-center gap-1.5"><WandSparkles size={12} aria-hidden /> AI suggestions — uncheck any you don't want, then accept:</span>
                  </p>
                  <div className="space-y-1.5">
                    {aiSuggestions.map((s, i) => (
                      <label
                        key={i}
                        className="flex items-start gap-2 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={s.keep}
                          onChange={(e) =>
                            setAiSuggestions((prev) =>
                              prev.map((p, j) =>
                                j === i ? { ...p, keep: e.target.checked } : p,
                              ),
                            )
                          }
                          className="mt-1 h-3.5 w-3.5"
                        />
                        <div className="flex-1 min-w-0">
                          <p
                            className="text-sm font-medium"
                            style={{
                              color: 'var(--color-text)',
                              opacity: s.keep ? 1 : 0.4,
                            }}
                          >
                            {s.title}{' '}
                            <span className="text-xs font-normal" style={{ color: 'var(--color-muted)' }}>
                              · {s.estimatedMinutes}m
                            </span>
                          </p>
                          {s.rationale && (
                            <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
                              {s.rationale}
                            </p>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      onClick={() => setAiSuggestions([])}
                      className="text-xs px-3 py-1 rounded-md"
                      style={{ color: 'var(--color-muted)' }}
                    >
                      Discard
                    </button>
                    <button
                      onClick={acceptAiSuggestions}
                      disabled={savingSub || aiSuggestions.every((s) => !s.keep)}
                      className="text-xs rounded-md px-3 py-1 font-semibold text-(--color-on-primary) disabled:opacity-40"
                      style={{ background: 'var(--color-primary)' }}
                    >
                      Accept ({aiSuggestions.filter((s) => s.keep).length})
                    </button>
                  </div>
                </div>
              )}

              {aiError && (
                <div
                  className="mb-3 rounded-lg p-2 text-xs"
                  style={{
                    background: 'color-mix(in srgb, var(--color-fire) 8%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--color-fire) 35%, transparent)',
                    color: 'var(--color-fire)',
                  }}
                >
                  {aiError}
                </div>
              )}

              <SubQuestList quest={quest} reloadKey={stepsKey} onChanged={stepsChanged} />
            </section>

            {/* XP history */}
            {xpEvents.length > 0 && (
              <section className="mb-5">
                <h3
                  className="text-xs uppercase font-bold tracking-wide mb-2"
                  style={{ color: 'var(--color-muted)' }}
                >
                  XP history
                </h3>
                <div className="space-y-1">
                  {xpEvents.slice(0, 5).map((e) => (
                    <div key={e.id} className="flex items-center justify-between text-xs">
                      <span style={{ color: 'var(--color-muted)' }}>
                        {new Date(e.createdAt).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        · {e.reason.replace('_', ' ')}
                      </span>
                      <span style={{ color: 'var(--color-gold)', fontWeight: 600 }}>
                        +{e.amount}
                      </span>
                    </div>
                  ))}
                  {xpEvents.length > 5 && (
                    <p className="text-[12px] pt-1" style={{ color: 'var(--color-muted)' }}>
                      …and {xpEvents.length - 5} more
                    </p>
                  )}
                </div>
              </section>
            )}

            {loading && (
              <p className="text-xs text-center mb-2" style={{ color: 'var(--color-muted)' }}>
                Loading…
              </p>
            )}

            {/* Footer actions. Complete is first in the code as well as first on a phone, so Tab meets it first. */}
            <div className="flex flex-wrap items-center gap-2 pt-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
              <button
                type="button"
                onClick={handleComplete}
                className="btn-quiet w-full sm:order-last sm:w-auto"
                style={{ background: 'var(--color-green)', color: 'var(--color-on-primary)' }}
              >
                <Check size={15} strokeWidth={2.5} aria-hidden /> Complete
              </button>
              <button
                type="button"
                onClick={handleDeleteParent}
                className="btn-quiet mr-auto bg-transparent px-2"
                style={{ color: 'var(--color-fire)' }}
              >
                <Trash2 size={15} aria-hidden /> Delete
              </button>
              {!quest.isRecurring && (
                <button type="button" onClick={handleNotToday} className="btn-quiet">
                  <CalendarClock size={15} aria-hidden /> Not today
                </button>
              )}
              <button type="button" onClick={onEdit} className="btn-quiet">
                <Pencil size={15} aria-hidden /> Edit
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-lg border px-2 py-1.5 text-center"
      style={{ borderColor: 'var(--color-border)', background: 'rgba(255,255,255,0.04)' }}
    >
      <p className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>{value}</p>
      <p className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>
        {label}
      </p>
    </div>
  );
}
