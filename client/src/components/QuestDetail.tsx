/**
 * QuestDetail — tap a quest card → opens this overlay.
 *
 * Shows: full metadata, sub-quest checklist (with inline add), XP history,
 * and shortcut buttons (Edit → QuestModal, Complete, Delete, Start timer).
 *
 * Sub-quests are fully editable here:
 *   - Add: type a title, Enter to create with sane defaults.
 *   - Complete: checkbox → fires standard complete pipeline.
 *   - Delete: ✕ on each row.
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api, type Quest, type XPEventDTO } from '../lib/api';
import { useQuestStore } from '../store/useQuestStore';
import { useUserStore } from '../store/useUserStore';
import { useToastStore } from './Toasts';
import { formatDeadline, formatMinutes } from '../lib/formatters';

interface Props {
  open: boolean;
  quest: Quest | null;
  onClose: () => void;
  onEdit: () => void;
}

const CATEGORY_LABEL: Record<string, string> = {
  deep_work: '🧠 Deep work',
  comms: '💬 Comms',
  admin: '📋 Admin',
  creative: '🎨 Creative',
};

export function QuestDetail({ open, quest, onClose, onEdit }: Props) {
  const { complete, remove, load: loadQuests } = useQuestStore();
  const { applyXPGain } = useUserStore();
  const pushToast = useToastStore((s) => s.push);

  const [subs, setSubs] = useState<Quest[]>([]);
  const [xpEvents, setXpEvents] = useState<XPEventDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [newSubTitle, setNewSubTitle] = useState('');
  const [savingSub, setSavingSub] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<
    Array<{ title: string; estimatedMinutes: number; rationale: string; keep: boolean }>
  >([]);

  // Load sub-quests + xp history on open.
  useEffect(() => {
    if (!open || !quest) return;
    setLoading(true);
    Promise.all([api.quests.subquests(quest.id), api.quests.xpEvents(quest.id)])
      .then(([s, x]) => {
        setSubs(s);
        setXpEvents(x);
      })
      .finally(() => setLoading(false));
  }, [open, quest?.id]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!quest) return null;

  const addSubQuest = async () => {
    const title = newSubTitle.trim();
    if (!title || savingSub) return;
    setSavingSub(true);
    try {
      // Inherit category + tags from parent for context-continuity.
      const created = await api.quests.create({
        title,
        estimatedMinutes: 30,
        mentalLoad: quest.mentalLoad,
        impact: quest.impact,
        parentQuestId: quest.id,
        category: quest.category ?? undefined,
        tags: quest.tags ?? [],
      });
      setSubs((prev) => [...prev, created]);
      setNewSubTitle('');
      // Parent counts on the main quest list need to refresh.
      loadQuests();
    } catch (e) {
      pushToast({ icon: '⚠️', title: 'Could not add', sub: String(e), variant: 'xp' });
    } finally {
      setSavingSub(false);
    }
  };

  const completeSub = async (id: string) => {
    try {
      const result = await complete(id);
      applyXPGain(result.totalXP, result.newStreak, result.newMultiplier);
      pushToast({ icon: '⭐', title: `+${result.xpAwarded} XP`, sub: 'Sub-quest done', variant: 'xp' });
      setSubs((prev) =>
        prev.map((s) =>
          s.id === id ? { ...s, status: 'COMPLETE', completedAt: new Date().toISOString() } : s,
        ),
      );
      // Refresh history.
      api.quests.xpEvents(quest.id).then(setXpEvents).catch(() => {});
      loadQuests();
    } catch (e) {
      pushToast({ icon: '⚠️', title: 'Could not complete', sub: String(e), variant: 'xp' });
    }
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
        setAiError('AI features are off — set ANTHROPIC_API_KEY on the server to enable.');
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
      setSubs((prev) => [...prev, ...created]);
      setAiSuggestions([]);
      loadQuests();
      pushToast({
        icon: '🪄',
        title: `+${created.length} sub-quests`,
        sub: 'AI-decomposed',
        variant: 'xp',
      });
    } finally {
      setSavingSub(false);
    }
  };

  const deleteSub = async (id: string) => {
    if (!confirm('Delete this sub-quest?')) return;
    await remove(id);
    setSubs((prev) => prev.filter((s) => s.id !== id));
    loadQuests();
  };

  const handleDeleteParent = () => {
    if (!confirm('Delete this quest (and all sub-quests)?')) return;
    remove(quest.id);
    onClose();
  };

  const totalXP = xpEvents.reduce((s, e) => s + e.amount, 0);
  const activeSubs = subs.filter((s) => s.status !== 'COMPLETE');
  const doneSubs = subs.filter((s) => s.status === 'COMPLETE');

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
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-t-2xl sm:rounded-2xl border p-5 max-h-[90vh] overflow-y-auto"
            style={{
              background: 'var(--color-surface2)',
              borderColor: 'var(--color-border)',
            }}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex-1 min-w-0">
                <h2
                  className="text-base font-bold leading-snug"
                  style={{ color: 'var(--color-text)' }}
                >
                  {quest.title}
                </h2>
                <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>
                  {formatMinutes(quest.estimatedMinutes)}
                  {quest.deadline && ` · ${formatDeadline(quest.deadline)}`}
                  {quest.category && ` · ${CATEGORY_LABEL[quest.category] ?? quest.category}`}
                </p>
              </div>
              <button
                onClick={onClose}
                className="text-lg opacity-60 hover:opacity-100"
                style={{ color: 'var(--color-muted)' }}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Top-line stats */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <Pill label="Impact" value={`${quest.impact}/10`} />
              <Pill label="Mental load" value={`${quest.mentalLoad}/10`} />
              <Pill label="XP earned" value={totalXP.toString()} />
            </div>

            {/* Tags */}
            {quest.tags && quest.tags.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-1.5">
                {quest.tags.map((t) => (
                  <span
                    key={t}
                    className="text-xs rounded-full px-2 py-0.5 font-semibold"
                    style={{ background: 'rgba(139,92,246,0.15)', color: 'var(--color-primary)' }}
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
                  Sub-quests {subs.length > 0 && `(${doneSubs.length}/${subs.length})`}
                </h3>
                <button
                  onClick={askAi}
                  disabled={aiBusy}
                  title="Break down with AI"
                  className="text-xs rounded-full px-2.5 py-1 font-semibold transition-opacity disabled:opacity-40"
                  style={{
                    background: 'rgba(245,158,11,0.15)',
                    color: 'var(--color-gold)',
                    border: '1px solid rgba(245,158,11,0.4)',
                  }}
                >
                  {aiBusy ? '…' : '🪄 Break down'}
                </button>
              </div>

              {/* AI suggestions preview */}
              {aiSuggestions.length > 0 && (
                <div
                  className="mb-3 rounded-lg p-3"
                  style={{
                    background: 'rgba(245,158,11,0.06)',
                    border: '1px solid rgba(245,158,11,0.35)',
                  }}
                >
                  <p
                    className="text-xs font-semibold mb-2"
                    style={{ color: 'var(--color-gold)' }}
                  >
                    🪄 AI suggestions — uncheck any you don't want, then accept:
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
                      className="text-xs px-3 py-1 rounded-full"
                      style={{ color: 'var(--color-muted)' }}
                    >
                      Discard
                    </button>
                    <button
                      onClick={acceptAiSuggestions}
                      disabled={savingSub || aiSuggestions.every((s) => !s.keep)}
                      className="text-xs rounded-full px-3 py-1 font-semibold text-white disabled:opacity-40"
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
                    background: 'rgba(239,68,68,0.08)',
                    border: '1px solid rgba(239,68,68,0.35)',
                    color: 'var(--color-fire)',
                  }}
                >
                  {aiError}
                </div>
              )}

              {/* Progress bar */}
              {subs.length > 0 && (
                <div
                  className="h-1 mb-3 rounded-full overflow-hidden"
                  style={{ background: 'rgba(255,255,255,0.08)' }}
                >
                  <div
                    className="h-full transition-all duration-500"
                    style={{
                      width: `${(doneSubs.length / subs.length) * 100}%`,
                      background: 'var(--color-green)',
                    }}
                  />
                </div>
              )}

              <div className="space-y-1.5">
                {activeSubs.map((s) => (
                  <SubRow
                    key={s.id}
                    quest={s}
                    onComplete={() => completeSub(s.id)}
                    onDelete={() => deleteSub(s.id)}
                  />
                ))}
                {doneSubs.length > 0 && (
                  <>
                    <p
                      className="text-[0.65rem] uppercase tracking-wide pt-2"
                      style={{ color: 'var(--color-muted)' }}
                    >
                      Done
                    </p>
                    {doneSubs.map((s) => (
                      <SubRow
                        key={s.id}
                        quest={s}
                        onComplete={() => {}}
                        onDelete={() => deleteSub(s.id)}
                      />
                    ))}
                  </>
                )}
              </div>

              {/* Add inline */}
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="text"
                  value={newSubTitle}
                  onChange={(e) => setNewSubTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addSubQuest();
                    }
                  }}
                  placeholder="+ break this into a smaller step…"
                  className="flex-1 rounded-lg border bg-white/4 px-3 py-1.5 text-sm outline-none"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                />
                <button
                  onClick={addSubQuest}
                  disabled={!newSubTitle.trim() || savingSub}
                  className="text-xs rounded-full px-3 py-1.5 font-semibold text-white disabled:opacity-40"
                  style={{ background: 'var(--color-primary)' }}
                >
                  Add
                </button>
              </div>
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
                    <p className="text-[0.7rem] pt-1" style={{ color: 'var(--color-muted)' }}>
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

            {/* Footer actions */}
            <div className="flex justify-between gap-2 pt-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
              <button
                onClick={handleDeleteParent}
                className="text-xs px-3 py-1.5 rounded-full"
                style={{ color: 'var(--color-fire)' }}
              >
                🗑 Delete
              </button>
              <div className="flex gap-2">
                <button
                  onClick={onEdit}
                  className="text-xs rounded-full border px-3 py-1.5 font-semibold"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                >
                  ✏️ Edit
                </button>
                <button
                  onClick={async () => {
                    try {
                      const result = await complete(quest.id);
                      applyXPGain(result.totalXP, result.newStreak, result.newMultiplier);
                      pushToast({
                        icon: '⭐',
                        title: `+${result.xpAwarded} XP`,
                        sub: 'Quest complete',
                        variant: 'xp',
                      });
                      onClose();
                    } catch (e) {
                      pushToast({ icon: '⚠️', title: 'Could not complete', sub: String(e), variant: 'xp' });
                    }
                  }}
                  className="text-xs rounded-full px-3 py-1.5 font-semibold text-white"
                  style={{ background: 'var(--color-green)' }}
                >
                  ✓ Complete
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SubRow({
  quest,
  onComplete,
  onDelete,
}: {
  quest: Quest;
  onComplete: () => void;
  onDelete: () => void;
}) {
  const done = quest.status === 'COMPLETE';
  return (
    <div
      className="flex items-center gap-2 rounded-lg border px-3 py-1.5"
      style={{
        borderColor: done ? 'rgba(34,197,94,0.3)' : 'var(--color-border)',
        background: done ? 'rgba(34,197,94,0.05)' : 'var(--color-surface)',
      }}
    >
      <button
        onClick={() => !done && onComplete()}
        disabled={done}
        className="h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center"
        style={{
          borderColor: done ? 'var(--color-green)' : 'var(--color-primary)',
          background: done ? 'var(--color-green)' : 'transparent',
        }}
      >
        {done && <span className="text-[10px] text-white font-bold">✓</span>}
      </button>
      <span
        className="text-sm flex-1 truncate"
        style={{
          color: 'var(--color-text)',
          textDecoration: done ? 'line-through' : 'none',
          opacity: done ? 0.5 : 1,
        }}
      >
        {quest.title}
      </span>
      <button
        onClick={onDelete}
        className="text-xs opacity-30 hover:opacity-100"
        title="Delete"
      >
        ✕
      </button>
    </div>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-lg border px-2 py-1.5 text-center"
      style={{ borderColor: 'var(--color-border)', background: 'rgba(255,255,255,0.04)' }}
    >
      <p className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>{value}</p>
      <p className="text-[0.65rem] uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>
        {label}
      </p>
    </div>
  );
}
