import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { useQuestStore } from '../store/useQuestStore';
import { type Quest, type PriorityTier } from '../lib/api';
import { MiniCalendar } from './MiniCalendar';
import { InfoTip } from './InfoTip';
import { BookOpen, Brush, ChevronDown, ChevronRight, Dumbbell, Inbox, Phone, CalendarDays, Target, X } from 'lucide-react';

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
/** A mouse or trackpad: safe to focus a field without summoning an on-screen keyboard. */
const FINE_POINTER = typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches;

const CATEGORIES = [
  { value: 'deep_work', label: 'Deep work', desc: 'High focus, code/writing/design' },
  { value: 'comms', label: 'Comms', desc: 'Email, chats, meetings' },
  { value: 'admin', label: 'Admin', desc: 'Forms, errands, planning' },
  { value: 'creative', label: 'Creative', desc: 'Brainstorm, sketch, ideate' },
];

interface Template {
  icon: LucideIcon;
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
    icon: Inbox,
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
    icon: BookOpen,
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
    icon: Dumbbell,
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
    icon: Target,
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
    icon: Phone,
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
    icon: Brush,
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
  const [priorityTier, setPriorityTier] = useState<PriorityTier>('MED');
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
      setPriorityTier(editing.priorityTier ?? 'MED');
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
      setPriorityTier('MED');
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
        priorityTier,
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
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/70 sm:items-center sm:p-5"
        >
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={editing ? 'Edit quest' : 'New quest'}
            className="max-h-[92vh] w-full max-w-[560px] overflow-y-auto overscroll-contain rounded-t-2xl bg-(--color-surface) px-5 pt-4 sm:rounded-2xl sm:px-6 sm:pt-5"
          >
            <div className="mb-4 flex items-center gap-2">
              <h2 className="flex-1 text-lg font-bold">{editing ? 'Edit quest' : 'New quest'}</h2>
              <button type="button" onClick={onClose} className="icon-btn -mr-2" aria-label="Close">
                <X size={18} aria-hidden />
              </button>
            </div>

            <Field label="What needs doing?">
              <input
                className="form-input"
                placeholder="What do you need to do?"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus={FINE_POINTER}
                enterKeyHint="done"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && title.trim() && !saving) void save();
                }}
              />
            </Field>

            {/* Quick-start templates — only on create */}
            {!editing && (
              <div className="mb-4">
                <Label>Or start from a template</Label>
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
                      className="btn-quiet h-8 min-h-0 px-2.5 text-xs"
                    >
                      <t.icon size={13} aria-hidden /> {t.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quick cheat-sheet so the four overlapping fields feel distinct */}
            <details
              className="mb-4 rounded-lg bg-(--color-surface2) p-3 text-xs"
            >
              <summary
                className="cursor-pointer font-semibold"
                style={{ color: 'var(--color-text)' }}
              >
                How are these fields different?
              </summary>
              <ul className="mt-2 space-y-1.5" style={{ color: 'var(--color-muted)' }}>
                <li>
                  <b style={{ color: 'var(--color-text)' }}>Mental load</b> — how hard is it
                  to <i>think through</i>? Drives <b>when</b> in the day this lands (peak energy
                  vs slump).
                </li>
                <li>
                  <b style={{ color: 'var(--color-text)' }}>Impact</b> — how much does the
                  <i> outcome</i> matter? Pushes high-impact quests up the priority list, even
                  when deadlines are far.
                </li>
                <li>
                  <b style={{ color: 'var(--color-text)' }}>Tediousness</b> — how <i>boring
                  / draining</i> is it? Prevents stacking two tedious quests back-to-back.
                </li>
                <li>
                  <b style={{ color: 'var(--color-text)' }}>Urgency multiplier</b> — manual
                  override on deadline pressure. Use only when something is{' '}
                  <i>more urgent than its deadline suggests</i>.
                </li>
              </ul>
            </details>

            {/* Recurring toggle */}
            <div
              className="mb-4 flex items-start gap-3 rounded-lg p-3"
              style={{
                background: 'var(--color-surface2)',
                boxShadow: isRecurring ? 'inset 0 0 0 1.5px var(--color-primary)' : 'none',
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
                  Repeat every day
                </p>
                <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
                  A routine: planned daily as its own block, ticked off fresh each day.
                </p>
              </div>
            </div>

            {/* Priority tier — 3-stop slider/dragger */}
            <div className="mb-4">
              <div className="mb-1.5 flex items-center gap-1.5">
                <Label>Priority</Label>
                <InfoTip>
                  <p className="font-semibold mb-1">Three tiers</p>
                  <p>
                    <b>High</b> = must-do today; boosts importance and urgency.
                  </p>
                  <p>
                    <b>Med</b> = default; algorithm decides based on deadline + impact.
                  </p>
                  <p>
                    <b>Low</b> = nice-to-have; dampened and dropped entirely in Crush mode.
                  </p>
                </InfoTip>
              </div>
              {/* Three choices are three buttons. (This was a drag slider whose labels ran off a phone screen.) */}
              <div className="grid grid-cols-3 gap-1 rounded-lg bg-(--color-surface2) p-1" role="radiogroup" aria-label="Priority">
                {([
                  { id: 'LOW', label: 'Low', sub: 'If there is time' },
                  { id: 'MED', label: 'Normal', sub: 'Planner decides' },
                  { id: 'HIGH', label: 'High', sub: 'Must do' },
                ] as const).map((o) => {
                  const on = priorityTier === o.id;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setPriorityTier(o.id)}
                      className="rounded-md px-2 py-1.5 text-center transition-colors"
                      style={{
                        background: on ? 'var(--color-primary)' : 'transparent',
                        color: on ? 'var(--color-on-primary)' : 'var(--color-text)',
                      }}
                    >
                      <span className="block text-sm font-bold">{o.label}</span>
                      <span className="block text-[11px] opacity-75">{o.sub}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Deadline picker (hidden for recurring) */}
            {!isRecurring && (
              <DeadlineField value={deadline} onChange={setDeadline} />
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Est. hours">
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
                  <label className="text-[13px] font-semibold text-(--color-muted)">
                    Impact (1–10)
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
                <Label>Mental load</Label>
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
                        ? 'border-(--color-gold) bg-(--color-gold)/15 text-(--color-gold)'
                        : 'border-(--color-border) bg-white/4 text-(--color-muted) hover:border-(--color-gold)'
                    }`}
                  >
                    {v}
                    <br />
                    <span className="text-[11px]">{LOAD_LABELS[v]}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Category */}
            <div className="mt-4">
              <div className="mb-1.5 flex items-center gap-1.5">
                <Label>Category</Label>
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
                        ? 'border-(--color-primary) bg-(--color-primary)/15'
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
              <Label>Tags (filter on the Quests page)</Label>
              <div className="flex flex-wrap gap-1.5 items-center rounded-lg border px-2 py-1.5"
                style={{ borderColor: 'var(--color-border)', background: 'rgba(255,255,255,0.04)' }}>
                {tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold"
                    style={{
                      background: 'color-mix(in srgb, var(--color-primary) 18%, transparent)',
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
                      <X size={11} aria-hidden />
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
              <span className="inline-flex items-center gap-1">{showAdvanced ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />} Advanced scheduler hints</span>
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
                          <Label>Preferred hour</Label>
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
                          <Label>Urgency multiplier</Label>
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
                        <Label>{`Tediousness — ${(tediousness * 100).toFixed(0)}%`}</Label>
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
                      <p className="text-[12px] mt-0.5" style={{ color: 'var(--color-muted)' }}>
                        Higher = avoids stacking with other boring tasks.
                      </p>
                    </div>

                    <div className="mb-4">
                      <div className="mb-1.5 flex items-center gap-1.5">
                        <Label>{`Setup cost — ${(setupCost * 100).toFixed(0)}%`}</Label>
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
                      <p className="text-[12px] mt-0.5" style={{ color: 'var(--color-muted)' }}>
                        Higher = task hates being interrupted; prefers long chunks (≥0.7 lifts the 1.5h soft cap).
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Min chunk (min)">
                        <input
                          type="number"
                          min={5}
                          max={240}
                          className="form-input"
                          value={minChunk}
                          onChange={(e) => setMinChunk(e.target.value)}
                        />
                      </Field>
                      <Field label="Max chunk (min)">
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

            {/* Always in reach, however long the form above gets. */}
            <div className="sticky bottom-0 -mx-5 mt-5 flex justify-end gap-2 border-t border-(--color-border) bg-(--color-surface) px-5 py-3 sm:-mx-6 sm:px-6">
              <button type="button" onClick={onClose} className="btn-quiet min-h-10">
                Cancel
              </button>
              <button type="button" onClick={save} disabled={!title.trim() || saving} className="btn-primary">
                {editing ? 'Save changes' : 'Add quest'}
              </button>
            </div>

          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Deadline as a few one-tap choices; the month grid opens only when asked
 * for. (It used to sit open in the middle of the form, a third of a screen
 * for a field most quests leave empty.)
 */
function DeadlineField({ value, onChange }: { value: Date | null; onChange: (d: Date | null) => void }) {
  const [calendar, setCalendar] = useState(false);
  const inDays = (n: number) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + n);
    return d;
  };
  const same = (a: Date | null, b: Date) => !!a && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const choices = [
    { label: 'Tomorrow', date: inDays(1) },
    { label: 'In 3 days', date: inDays(3) },
    { label: 'In a week', date: inDays(7) },
  ];
  const custom = value !== null && !choices.some((c) => same(value, c.date));
  const chip = (active: boolean) => ({
    background: active ? 'var(--color-primary)' : 'var(--color-surface2)',
    color: active ? 'var(--color-on-primary)' : 'var(--color-text)',
  });

  return (
    <div className="mb-4">
      <Label>Deadline</Label>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => { onChange(null); setCalendar(false); }} aria-pressed={value === null} className="btn-quiet h-9 min-h-0 px-3 text-xs" style={chip(value === null)}>
          None
        </button>
        {choices.map((c) => (
          <button key={c.label} type="button" onClick={() => { onChange(c.date); setCalendar(false); }} aria-pressed={same(value, c.date)} className="btn-quiet h-9 min-h-0 px-3 text-xs" style={chip(same(value, c.date))}>
            {c.label}
          </button>
        ))}
        <button type="button" onClick={() => setCalendar((v) => !v)} aria-expanded={calendar} className="btn-quiet h-9 min-h-0 px-3 text-xs" style={chip(custom)}>
          <CalendarDays size={13} aria-hidden />
          {custom ? value!.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : 'Pick a date'}
        </button>
      </div>
      {calendar && (
        <div className="mt-2">
          <MiniCalendar value={value} onChange={onChange} />
        </div>
      )}
    </div>
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
    <label className="mb-1.5 block text-[13px] font-semibold text-(--color-muted)">
      {children}
    </label>
  );
}
