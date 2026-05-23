import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useQuestStore } from '../store/useQuestStore';
import { type Quest } from '../lib/api';
import { MiniCalendar } from './MiniCalendar';
import { InfoTip } from './InfoTip';

interface Props {
  open: boolean;
  onClose: () => void;
  /** If provided, modal opens in edit mode. */
  editing?: Quest | null;
}

// Maps a 1–5 picker into our DB's 1–10 scale.
const LOAD_5_TO_10 = [0, 2, 4, 6, 8, 10];
function loadToFive(load: number): number {
  if (load <= 2) return 1;
  if (load <= 4) return 2;
  if (load <= 6) return 3;
  if (load <= 8) return 4;
  return 5;
}

const LOAD_LABELS = ['', 'Easy', 'Mild', 'Medium', 'Hard', 'Brutal'];
const CATEGORIES = [
  { value: 'deep_work', label: '🧠 Deep work', desc: 'High focus, code/writing/design' },
  { value: 'comms', label: '💬 Comms', desc: 'Email, chats, meetings' },
  { value: 'admin', label: '📋 Admin', desc: 'Forms, errands, planning' },
  { value: 'creative', label: '🎨 Creative', desc: 'Brainstorm, sketch, ideate' },
];

interface Template {
  emoji: string;
  label: string;
  apply: () => Partial<{
    title: string;
    hours: string;
    load5: number;
    impact: number;
    category: string;
    tediousness: number;
    setupCost: number;
    isRecurring: boolean;
    tags: string[];
    preferredHour: string;
  }>;
}

const TEMPLATES: Template[] = [
  {
    emoji: '📥',
    label: 'Inbox zero',
    apply: () => ({
      title: 'Inbox zero',
      hours: '0.5',
      load5: 2,
      impact: 4,
      category: 'comms',
      tediousness: 0.7,
      setupCost: 0.1,
      tags: ['inbox'],
    }),
  },
  {
    emoji: '📖',
    label: 'Read 30 min',
    apply: () => ({
      title: 'Read for 30 minutes',
      hours: '0.5',
      load5: 2,
      impact: 5,
      category: 'creative',
      tediousness: 0.1,
      setupCost: 0.2,
      isRecurring: true,
      tags: ['reading'],
    }),
  },
  {
    emoji: '💪',
    label: 'Workout',
    apply: () => ({
      title: 'Workout',
      hours: '0.75',
      load5: 3,
      impact: 7,
      category: 'admin',
      tediousness: 0.4,
      setupCost: 0.3,
      isRecurring: true,
      tags: ['health'],
      preferredHour: '7',
    }),
  },
  {
    emoji: '🎯',
    label: 'Deep focus block',
    apply: () => ({
      title: 'Deep focus session',
      hours: '2',
      load5: 5,
      impact: 8,
      category: 'deep_work',
      tediousness: 0.2,
      setupCost: 0.8,
      preferredHour: '10',
    }),
  },
  {
    emoji: '☎️',
    label: 'Phone call',
    apply: () => ({
      title: '',
      hours: '0.25',
      load5: 3,
      impact: 6,
      category: 'comms',
      tediousness: 0.3,
      setupCost: 0.0,
    }),
  },
  {
    emoji: '🧹',
    label: 'Tidy / chores',
    apply: () => ({
      title: 'Tidy up',
      hours: '0.5',
      load5: 1,
      impact: 3,
      category: 'admin',
      tediousness: 0.8,
      setupCost: 0.1,
      tags: ['home'],
    }),
  },
];

export function QuestModal({ open, onClose, editing }: Props) {
  const add = useQuestStore((s) => s.add);
  const update = useQuestStore((s) => s.update);

  // Basic fields
  const [title, setTitle] = useState('');
  const [deadline, setDeadline] = useState<Date | null>(null);
  const [hours, setHours] = useState<string>('');
  const [load5, setLoad5] = useState(3);
  const [impact, setImpact] = useState(5);

  // Scheduler hints
  const [isRecurring, setIsRecurring] = useState(false);
  const [category, setCategory] = useState('deep_work');
  const [preferredHour, setPreferredHour] = useState<string>(''); // '' = no preference
  const [tediousness, setTediousness] = useState(0.4);
  const [minChunk, setMinChunk] = useState<string>('15');
  const [maxChunk, setMaxChunk] = useState<string>('50');
  const [setupCost, setSetupCost] = useState(0.3);
  const [urgencyMult, setUrgencyMult] = useState(1.0);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState('');

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title);
      setDeadline(editing.deadline ? new Date(editing.deadline) : null);
      setHours((editing.estimatedMinutes / 60).toString());
      setLoad5(loadToFive(editing.mentalLoad));
      setImpact(editing.impact);
      setIsRecurring(editing.isRecurring ?? false);
      setCategory(editing.category ?? 'deep_work');
      setPreferredHour(editing.preferredHour != null ? String(editing.preferredHour) : '');
      setTediousness(editing.tediousness ?? 0.4);
      setMinChunk(String(editing.minChunkMin ?? 15));
      setMaxChunk(String(editing.maxChunkMin ?? 50));
      setSetupCost(editing.setupCost ?? 0.3);
      setUrgencyMult(editing.urgencyMult ?? 1.0);
      setTags(editing.tags ?? []);
      setTagDraft('');
      setShowAdvanced(
        editing.preferredHour != null ||
          editing.urgencyMult !== 1 ||
          editing.tediousness != null,
      );
    } else {
      setTitle('');
      setDeadline(null);
      setHours('');
      setLoad5(3);
      setImpact(5);
      setIsRecurring(false);
      setCategory('deep_work');
      setPreferredHour('');
      setTediousness(0.4);
      setMinChunk('15');
      setMaxChunk('50');
      setSetupCost(0.3);
      setUrgencyMult(1.0);
      setTags([]);
      setTagDraft('');
      setShowAdvanced(false);
    }
  }, [open, editing]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const save = async () => {
    const trimmed = title.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      const hoursNum = parseFloat(hours);
      const estimatedMinutes =
        Number.isFinite(hoursNum) && hoursNum > 0 ? Math.round(hoursNum * 60) : 30;

      // If the user has typed a tag but not pressed Enter, commit it on save.
      const trailing = tagDraft.trim();
      const allTags = trailing && !tags.includes(trailing) ? [...tags, trailing] : tags;

      const fields = {
        title: trimmed,
        estimatedMinutes,
        mentalLoad: LOAD_5_TO_10[load5]!,
        impact,
        deadline: deadline ? deadline.toISOString() : null,
        isRecurring,
        category,
        preferredHour: preferredHour === '' ? null : Number(preferredHour),
        tediousness,
        minChunkMin: Number(minChunk) || 15,
        maxChunkMin: Number(maxChunk) || 50,
        setupCost,
        urgencyMult,
        tags: allTags,
      };

      if (editing) {
        await update(editing.id, fields);
      } else {
        await add(fields);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-5"
        >
          <motion.div
            initial={{ scale: 0.95, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 10 }}
            transition={{ duration: 0.22 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[560px] rounded-2xl border border-(--color-border) bg-(--color-surface2) p-6 shadow-[0_4px_32px_rgba(0,0,0,0.45)] max-h-[90vh] overflow-y-auto"
          >
            <div className="mb-4 flex items-center gap-2 text-lg font-bold">
              ⚔️ <span>{editing ? 'Edit Quest' : 'New Quest'}</span>
            </div>

            <Field label="Quest title *">
              <input
                className="form-input"
                placeholder="What do you need to do?"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
              />
            </Field>

            {/* Quick-start templates — only on create */}
            {!editing && (
              <div className="mb-4">
                <Label>⚡ Quick start (optional)</Label>
                <div className="flex flex-wrap gap-1.5">
                  {TEMPLATES.map((t) => (
                    <button
                      key={t.label}
                      type="button"
                      onClick={() => {
                        const r = t.apply();
                        if (r.title !== undefined) setTitle(r.title);
                        if (r.hours !== undefined) setHours(r.hours);
                        if (r.load5 !== undefined) setLoad5(r.load5);
                        if (r.impact !== undefined) setImpact(r.impact);
                        if (r.category !== undefined) setCategory(r.category);
                        if (r.tediousness !== undefined) setTediousness(r.tediousness);
                        if (r.setupCost !== undefined) setSetupCost(r.setupCost);
                        if (r.isRecurring !== undefined) setIsRecurring(r.isRecurring);
                        if (r.tags !== undefined) setTags(r.tags);
                        if (r.preferredHour !== undefined) setPreferredHour(r.preferredHour);
                      }}
                      className="text-xs rounded-full border px-2.5 py-1 transition-colors hover:bg-white/5"
                      style={{
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text)',
                      }}
                    >
                      {t.emoji} {t.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quick cheat-sheet so the four overlapping fields feel distinct */}
            <details
              className="mb-4 rounded-lg p-3 text-xs"
              style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid var(--color-border)' }}
            >
              <summary
                className="cursor-pointer font-semibold"
                style={{ color: 'var(--color-text)' }}
              >
                ❓ How are these fields different?
              </summary>
              <ul className="mt-2 space-y-1.5" style={{ color: 'var(--color-muted)' }}>
                <li>
                  <b style={{ color: 'var(--color-text)' }}>🧠 Mental load</b> — how hard is it
                  to <i>think through</i>? Drives <b>when</b> in the day this lands (peak energy
                  vs slump).
                </li>
                <li>
                  <b style={{ color: 'var(--color-text)' }}>🎯 Impact</b> — how much does the
                  <i> outcome</i> matter? Pushes high-impact quests up the priority list, even
                  when deadlines are far.
                </li>
                <li>
                  <b style={{ color: 'var(--color-text)' }}>😩 Tediousness</b> — how <i>boring
                  / draining</i> is it? Prevents stacking two tedious quests back-to-back.
                </li>
                <li>
                  <b style={{ color: 'var(--color-text)' }}>🚀 Urgency multiplier</b> — manual
                  override on deadline pressure. Use only when something is{' '}
                  <i>more urgent than its deadline suggests</i>.
                </li>
              </ul>
            </details>

            {/* Recurring toggle */}
            <div
              className="mb-4 flex items-start gap-3 rounded-lg p-3"
              style={{
                background: isRecurring ? 'rgba(245,158,11,0.10)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${isRecurring ? 'rgba(245,158,11,0.4)' : 'var(--color-border)'}`,
              }}
            >
              <input
                type="checkbox"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
                className="mt-1 h-4 w-4 cursor-pointer"
              />
              <div className="flex-1">
                <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                  🔁 Daily recurring quest
                </p>
                <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
                  Scheduled every day as a short fixed block. Resets at midnight.
                </p>
              </div>
            </div>

            {/* Deadline picker (hidden for recurring) */}
            {!isRecurring && (
              <Field label="📅 Deadline">
                <MiniCalendar value={deadline} onChange={setDeadline} />
              </Field>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="🕐 Est. hours">
                <input
                  type="number"
                  min={0.1}
                  max={40}
                  step={0.5}
                  className="form-input"
                  placeholder="e.g. 2"
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                />
              </Field>
              <div className="mb-4">
                <div className="mb-1.5 flex items-center gap-1.5">
                  <label className="text-[0.78rem] font-semibold text-(--color-muted)">
                    🎯 Impact (1–10)
                  </label>
                  <InfoTip>
                    <p className="font-semibold mb-1">Outcome importance</p>
                    <p>
                      How much does <i>finishing this</i> matter? 10 = high-stakes (project
                      deliverable, exam). 1 = nice-to-have.
                    </p>
                    <p className="mt-1.5 opacity-70">
                      Scheduler use: amplifies urgency contribution so important quests beat
                      similar-deadline trivial ones.
                    </p>
                  </InfoTip>
                </div>
                <input
                  type="number"
                  min={1}
                  max={10}
                  className="form-input"
                  value={impact}
                  onChange={(e) => setImpact(Math.max(1, Math.min(10, Number(e.target.value) || 5)))}
                />
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-1.5 flex items-center gap-1.5">
                <Label>🧠 Mental load</Label>
                <InfoTip>
                  <p className="font-semibold mb-1">Cognitive demand</p>
                  <p>
                    How hard is it to <i>think through</i>? Hard math / writing = 5 (Brutal),
                    mindless filing = 1 (Easy).
                  </p>
                  <p className="mt-1.5 opacity-70">
                    Scheduler use: high-load quests get slotted into your peak-energy hours
                    (default 9–11am, 16–17), low-load to the post-lunch slump.
                  </p>
                </InfoTip>
              </div>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((v) => (
                  <button
                    key={v}
                    onClick={() => setLoad5(v)}
                    className={`flex-1 rounded-lg border px-1 py-2 text-center text-xs font-semibold transition ${
                      load5 === v
                        ? 'border-(--color-gold) bg-amber-500/15 text-(--color-gold)'
                        : 'border-(--color-border) bg-white/4 text-(--color-muted) hover:border-(--color-gold)'
                    }`}
                  >
                    {v}
                    <br />
                    <span className="text-[0.6rem]">{LOAD_LABELS[v]}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Category */}
            <div className="mt-4">
              <div className="mb-1.5 flex items-center gap-1.5">
                <Label>🏷️ Category</Label>
                <InfoTip>
                  <p className="font-semibold mb-1">Context-switch grouping</p>
                  <p>
                    The scheduler avoids jumping between categories
                    back-to-back (deep_work → comms → admin = penalty).
                  </p>
                  <p className="mt-1.5 opacity-70">
                    Tagging quests honestly here = fewer mental context switches.
                  </p>
                </InfoTip>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setCategory(c.value)}
                    className={`rounded-lg border px-3 py-2 text-left text-xs transition ${
                      category === c.value
                        ? 'border-(--color-primary) bg-violet-500/15'
                        : 'border-(--color-border) bg-white/4 hover:border-(--color-primary)'
                    }`}
                  >
                    <p className="font-semibold" style={{ color: 'var(--color-text)' }}>
                      {c.label}
                    </p>
                    <p style={{ color: 'var(--color-muted)' }}>{c.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Tags */}
            <div className="mt-4">
              <Label>🏷️ Tags (filter on the Quests page)</Label>
              <div className="flex flex-wrap gap-1.5 items-center rounded-lg border px-2 py-1.5"
                style={{ borderColor: 'var(--color-border)', background: 'rgba(255,255,255,0.04)' }}>
                {tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
                    style={{
                      background: 'rgba(139,92,246,0.18)',
                      color: 'var(--color-primary)',
                    }}
                  >
                    {t}
                    <button
                      type="button"
                      onClick={() => setTags(tags.filter((x) => x !== t))}
                      className="opacity-60 hover:opacity-100"
                      aria-label={`Remove ${t}`}
                    >
                      ✕
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ',') && tagDraft.trim()) {
                      e.preventDefault();
                      const v = tagDraft.trim();
                      if (!tags.includes(v)) setTags([...tags, v]);
                      setTagDraft('');
                    } else if (e.key === 'Backspace' && !tagDraft && tags.length > 0) {
                      setTags(tags.slice(0, -1));
                    }
                  }}
                  placeholder={tags.length === 0 ? 'add tag — enter or comma' : '+'}
                  className="flex-1 min-w-[80px] bg-transparent text-xs outline-none"
                  style={{ color: 'var(--color-text)' }}
                />
              </div>
            </div>

            {/* Advanced section */}
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="mt-4 text-xs font-semibold transition-colors"
              style={{ color: 'var(--color-muted)' }}
            >
              {showAdvanced ? '▾' : '▸'} Advanced scheduler hints
            </button>

            <AnimatePresence>
              {showAdvanced && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 space-y-3 rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="mb-4">
                        <div className="mb-1.5 flex items-center gap-1.5">
                          <Label>⏰ Preferred hour</Label>
                          <InfoTip>
                            <p className="font-semibold mb-1">Time-of-day fit</p>
                            <p>
                              Scheduler softly pulls this quest toward this hour
                              (gaussian, σ=2h). Use for "I do my best writing at 10am."
                            </p>
                          </InfoTip>
                        </div>
                        <select
                          className="form-input"
                          value={preferredHour}
                          onChange={(e) => setPreferredHour(e.target.value)}
                        >
                          <option value="">No preference</option>
                          {Array.from({ length: 24 }, (_, i) => (
                            <option key={i} value={i}>
                              {String(i).padStart(2, '0')}:00
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="mb-4">
                        <div className="mb-1.5 flex items-center gap-1.5">
                          <Label>🚀 Urgency multiplier</Label>
                          <InfoTip>
                            <p className="font-semibold mb-1">Manual urgency override</p>
                            <p>
                              Multiplies the deadline-driven urgency score. <b>1.0×</b> = let the
                              algorithm decide based on deadline + work remaining.
                            </p>
                            <p className="mt-1.5">
                              <b>≥1.5×</b> = also lifts the 1.5h block-size cap (allows marathon
                              focus). <b>&lt;1×</b> = "deadline says urgent but really it can wait."
                            </p>
                          </InfoTip>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min={0.5}
                            max={3}
                            step={0.1}
                            value={urgencyMult}
                            onChange={(e) => setUrgencyMult(Number(e.target.value))}
                            className="flex-1"
                          />
                          <span
                            className="text-xs font-mono font-bold w-10 text-right"
                            style={{ color: urgencyMult > 1 ? 'var(--color-fire)' : 'var(--color-text)' }}
                          >
                            {urgencyMult.toFixed(1)}×
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mb-4">
                      <div className="mb-1.5 flex items-center gap-1.5">
                        <Label>{`😩 Tediousness — ${(tediousness * 100).toFixed(0)}%`}</Label>
                        <InfoTip>
                          <p className="font-semibold mb-1">Boringness, not difficulty</p>
                          <p>
                            <i>Different from mental load.</i> A tax form can be 0% mental load
                            but 90% tedious. Hard creative work can be 90% mental load but 10%
                            tedious.
                          </p>
                          <p className="mt-1.5 opacity-70">
                            Scheduler use: penalizes back-to-back tedious quests (adjacency
                            penalty, 3-block memory) so you don't burn out.
                          </p>
                        </InfoTip>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={tediousness}
                        onChange={(e) => setTediousness(Number(e.target.value))}
                        className="w-full"
                      />
                      <p className="text-[0.7rem] mt-0.5" style={{ color: 'var(--color-muted)' }}>
                        Higher = avoids stacking with other boring tasks.
                      </p>
                    </div>

                    <div className="mb-4">
                      <div className="mb-1.5 flex items-center gap-1.5">
                        <Label>{`🔥 Setup cost — ${(setupCost * 100).toFixed(0)}%`}</Label>
                        <InfoTip>
                          <p className="font-semibold mb-1">Warmup cost / hates interruption</p>
                          <p>
                            Coding a complex feature has high setup cost — losing context
                            hurts. Answering quick emails has near-zero setup cost.
                          </p>
                          <p className="mt-1.5 opacity-70">
                            <b>≥0.7</b> lifts the 1.5h block-size cap so the scheduler will
                            give this a long, uninterrupted run.
                          </p>
                        </InfoTip>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={setupCost}
                        onChange={(e) => setSetupCost(Number(e.target.value))}
                        className="w-full"
                      />
                      <p className="text-[0.7rem] mt-0.5" style={{ color: 'var(--color-muted)' }}>
                        Higher = task hates being interrupted; prefers long chunks (≥0.7 lifts the 1.5h soft cap).
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Field label="🧱 Min chunk (min)">
                        <input
                          type="number"
                          min={5}
                          max={240}
                          className="form-input"
                          value={minChunk}
                          onChange={(e) => setMinChunk(e.target.value)}
                        />
                      </Field>
                      <Field label="🏛️ Max chunk (min)">
                        <input
                          type="number"
                          min={5}
                          max={240}
                          className="form-input"
                          value={maxChunk}
                          onChange={(e) => setMaxChunk(e.target.value)}
                        />
                      </Field>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="mt-5 flex justify-end gap-2.5">
              <button
                onClick={onClose}
                className="rounded-full border border-(--color-border) bg-white/5 px-4 py-2 text-sm font-semibold transition hover:bg-white/15"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={!title.trim() || saving}
                className="flex items-center gap-1 rounded-full bg-(--color-primary) px-4 py-2 text-sm font-semibold text-white shadow-[0_4px_16px_rgba(139,92,246,0.4)] transition hover:bg-(--color-primary-d) disabled:cursor-not-allowed disabled:opacity-40"
              >
                ⚡ {editing ? 'Save Changes' : 'Save Quest'}
              </button>
            </div>

            <style>{`
              .form-input {
                width: 100%;
                background: rgba(255,255,255,.05);
                border: 1px solid var(--color-border);
                border-radius: 10px;
                padding: 9px 13px;
                color: var(--color-text);
                font-family: inherit;
                font-size: .85rem;
                outline: none;
                transition: border-color .2s;
              }
              .form-input:focus {
                border-color: var(--color-primary);
                box-shadow: 0 0 0 3px rgba(139,92,246,.15);
              }
              input[type="range"] {
                accent-color: var(--color-primary);
              }
            `}</style>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1.5 block text-[0.78rem] font-semibold text-(--color-muted)">
      {children}
    </label>
  );
}
