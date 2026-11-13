import { cloneElement, isValidElement, useEffect, useId, useRef, useState } from 'react';
import { useDialog } from '../lib/useDialog';
import { AnimatePresence, motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { useQuestStore } from '../store/useQuestStore';
import { api, isHourLog, type ParentChoice, type Quest, type PriorityTier } from '../lib/api';
import { MiniCalendar } from './MiniCalendar';
import { formatHour } from '../lib/formatters';
import { InfoTip } from './InfoTip';
import { WEEK, todayKey, type RepeatRule } from '../lib/repeat';
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
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
type RepeatKind = 'daily' | 'weekly' | 'interval';

/** A one-tap choice, lit when it is the one in force. */
const chip = (active: boolean) => ({
  background: active ? 'var(--color-primary)' : 'var(--color-surface2)',
  color: active ? 'var(--color-on-primary)' : 'var(--color-text)',
});
/** A mouse or trackpad: safe to focus a field without summoning an on-screen keyboard. */
const FINE_POINTER = typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches;

/** Quick lengths for "How long", in hours. */
const HOUR_CHIPS = [
  { label: '15m', value: 0.25 },
  { label: '30m', value: 0.5 },
  { label: '1h', value: 1 },
  { label: '2h', value: 2 },
];

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
  /** How often a routine comes round (lib/repeat.ts). */
  const [repeatKind, setRepeatKind] = useState<RepeatKind>('daily');
  const [repeatDays, setRepeatDays] = useState<number[]>([]);
  const [repeatWeeks, setRepeatWeeks] = useState(1);
  const [repeatEvery, setRepeatEvery] = useState('2');
  /** Done in one sitting, never split into pieces. */
  const [oneSitting, setOneSitting] = useState(false);
  /** An hour log: no estimate, time is written down as it is spent. */
  const [openEnded, setOpenEnded] = useState(false);
  /** The quest this one is a step of; '' for a main quest. */
  const [parentId, setParentId] = useState('');
  const [parents, setParents] = useState<ParentChoice[]>([]);
  const [priorityTier, setPriorityTier] = useState<PriorityTier>('MED');
  const [category, setCategory] = useState('deep_work');
  const [preferredHour, setPreferredHour] = useState<string>(''); // '' = no preference
  const [tediousness, setTediousness] = useState(0.4);
  const [minChunk, setMinChunk] = useState<string>('15');
  const [maxChunk, setMaxChunk] = useState<string>('50');
  const [setupCost, setSetupCost] = useState(0.3);
  const [urgencyMult, setUrgencyMult] = useState(1.0);
  const [showAdvanced, setShowAdvanced] = useState(false);
  /** The "More options" section; its fields are drawn only while it is open. */
  const [showMore, setShowMore] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState('');

  const [saving, setSaving] = useState(false);
  /** Shown after a save with no title, next to the field, until one is typed. */
  const [titleMissing, setTitleMissing] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const boxRef = useDialog(open, onClose);
  const repeatWeeksId = useId();
  const repeatEveryId = useId();
  const hoursId = useId();
  const moreId = useId();

  /** What is set inside "More options" and not default, shown beside it while it is closed. */
  const moreSummary = [
    isRecurring ? 'Round' : null,
    openEnded ? 'Hour log' : null,
    oneSitting && !isRecurring && !openEnded ? 'In one go' : null,
    parentId && !isRecurring && !openEnded ? 'Part of a quest' : null,
    load5 !== 3 ? `Load ${LOAD_LABELS[load5]!.toLowerCase()}` : null,
    impact !== 5 ? `Impact ${impact}` : null,
    category !== 'deep_work' ? (CATEGORIES.find((c) => c.value === category)?.label ?? null) : null,
    tags.length ? `${tags.length} ${tags.length === 1 ? 'tag' : 'tags'}` : null,
    preferredHour !== '' || urgencyMult !== 1 || tediousness !== 0.4 || setupCost !== 0.3 || minChunk !== '15' || maxChunk !== '50'
      ? 'Scheduler hints'
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  useEffect(() => {
    if (!open) return;
    setTitleMissing(false);
    if (editing) {
      setTitle(editing.title);
      setDeadline(editing.deadline ? new Date(editing.deadline) : null);
      setHours(isHourLog(editing) ? '' : (editing.estimatedMinutes / 60).toString());
      setLoad5(loadToFive(editing.mentalLoad));
      setImpact(editing.impact);
      setIsRecurring(editing.isRecurring ?? false);
      const rule = editing.repeat ?? null;
      setRepeatKind(rule ? rule.kind : 'daily');
      setRepeatDays(rule?.kind === 'weekly' ? rule.days : [new Date().getDay()]);
      setRepeatWeeks(rule?.kind === 'weekly' ? rule.every ?? 1 : 1);
      setRepeatEvery(rule?.kind === 'interval' ? String(rule.every) : '2');
      setOneSitting(editing.oneSitting ?? false);
      setOpenEnded(isHourLog(editing));
      setParentId(editing.parentQuestId ?? '');
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
      // Open when the quest uses anything in there that is not the default.
      setShowMore(
        !!editing.isRecurring ||
          isHourLog(editing) ||
          !!editing.oneSitting ||
          !!editing.parentQuestId ||
          (editing.tags?.length ?? 0) > 0,
      );
    } else {
      setTitle('');
      setDeadline(null);
      setHours('');
      setLoad5(3);
      setImpact(5);
      setIsRecurring(false);
      setRepeatKind('daily');
      setRepeatDays([new Date().getDay()]);
      setRepeatWeeks(1);
      setRepeatEvery('2');
      setOneSitting(false);
      setOpenEnded(false);
      setParentId('');
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
      setShowMore(false);
    }
  }, [open, editing]);

  // What the "Part of" menu offers. For a quest being edited, the server
  // leaves out the quest itself and anywhere its own steps would not fit.
  useEffect(() => {
    if (!open) return;
    let live = true;
    api.quests
      .parents(editing?.id)
      .then((list) => live && setParents(list))
      .catch(() => live && setParents([]));
    return () => {
      live = false;
    };
  }, [open, editing?.id]);

  /** The routine's rule as stored; null = every day. Keeps its start date while its rhythm is unchanged. */
  const repeatRule = (): RepeatRule | null => {
    const prev = editing?.repeat ?? null;
    if (repeatKind === 'weekly' && repeatDays.length) {
      const days = [...repeatDays].sort((a, b) => a - b);
      if (repeatWeeks <= 1) return days.length === 7 ? null : { kind: 'weekly', days };
      const from = prev?.kind === 'weekly' && prev.every === repeatWeeks && prev.from ? prev.from : todayKey();
      return { kind: 'weekly', days, every: repeatWeeks, from };
    }
    if (repeatKind === 'interval') {
      const every = Math.min(90, Math.round(Number(repeatEvery)));
      if (!Number.isFinite(every) || every < 2) return null;
      const from = prev?.kind === 'interval' && prev.every === every ? prev.from : todayKey();
      return { kind: 'interval', every, from };
    }
    return null;
  };

  const save = async () => {
    const trimmed = title.trim();
    if (saving) return;
    if (!trimmed) {
      setTitleMissing(true);
      titleRef.current?.focus();
      return;
    }
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
        deadline: deadline && !openEnded ? deadline.toISOString() : null,
        isRecurring: isRecurring && !openEnded,
        repeat: isRecurring && !openEnded ? repeatRule() : null,
        oneSitting: oneSitting && !isRecurring && !openEnded,
        openEnded,
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

      // A routine or an hour log is never a step of something.
      const under = isRecurring || openEnded ? '' : parentId;
      if (editing) {
        const moved = under !== (editing.parentQuestId ?? '');
        await update(editing.id, { ...fields, ...(moved ? { parentQuestId: under || null } : {}) });
      } else {
        await add({ ...fields, parentQuestId: under || undefined });
      }
      // The hour-log list is not part of the quest store; tell it to read again.
      if (openEnded || (editing && isHourLog(editing))) window.dispatchEvent(new CustomEvent('fg:hour-logs-changed'));
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
            ref={boxRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={editing ? 'Edit quest' : 'New quest'}
            // In the app the WebView shrinks above the keyboard; the cap keeps the sheet's top under the status bar.
            className="outline-none max-h-[92vh] native:max-h-[min(92vh,calc(100dvh-var(--safe-top)-0.75rem))] w-full max-w-[560px] overflow-y-auto overscroll-contain scroll-pb-20 rounded-t-2xl bg-(--color-surface) px-5 pt-4 sm:rounded-2xl sm:px-6 sm:pt-5"
          >
            <div className="mb-4 flex items-center gap-2">
              <h2 className="flex-1 text-lg font-bold">{editing ? 'Edit quest' : 'New quest'}</h2>
              <button type="button" onClick={onClose} className="icon-btn -mr-2" aria-label="Close">
                <X size={18} aria-hidden />
              </button>
            </div>

            <Field label="What needs doing?">
              <input
                ref={titleRef}
                className="form-input"
                placeholder="What do you need to do?"
                value={title}
                aria-invalid={titleMissing || undefined}
                aria-describedby={titleMissing ? 'quest-title-missing' : undefined}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (e.target.value.trim()) setTitleMissing(false);
                }}
                autoFocus={FINE_POINTER}
                enterKeyHint="done"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && title.trim() && !saving) void save();
                }}
              />
              {titleMissing && (
                <p id="quest-title-missing" role="alert" className="mt-1.5 text-[13px] font-semibold" style={{ color: 'var(--color-fire)' }}>
                  Give the quest a name first.
                </p>
              )}
            </Field>

            {/* Deadline picker (hidden for recurring and for hour logs) */}
            {!isRecurring && !openEnded && (
              <DeadlineField value={deadline} onChange={setDeadline} />
            )}

            {/* How long: quick chips, then the exact number of hours (hidden for hour logs) */}
            {!openEnded && (
              <div className="mb-4">
                <Label htmlFor={hoursId}>How long (hours)</Label>
                <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="Quick lengths">
                  {HOUR_CHIPS.map((c) => {
                    const on = hours.trim() !== '' && Number(hours) === c.value;
                    return (
                      <button
                        key={c.label}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setHours(String(c.value))}
                        className="btn-quiet h-9 min-h-0 px-3 text-xs"
                        style={chip(on)}
                      >
                        {c.label}
                      </button>
                    );
                  })}
                </div>
                <input
                  id={hoursId}
                  type="number"
                  min={0.1}
                  max={40}
                  step={0.5}
                  className="form-input"
                  placeholder="e.g. 2"
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                />
              </div>
            )}

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

            {/* More options: everything most quests never touch. Closed, its fields are not rendered (their state is kept). */}
            <div className="mb-4 flex flex-wrap items-center gap-x-3">
              <button
                type="button"
                onClick={() => setShowMore((v) => !v)}
                aria-expanded={showMore}
                aria-controls={moreId}
                className="min-h-9 text-xs font-semibold transition-colors"
                style={{ color: 'var(--color-muted)' }}
              >
                <span className="inline-flex items-center gap-1">{showMore ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />} More options</span>
              </button>
              {!showMore && moreSummary && (
                <span className="text-xs" style={{ color: 'var(--color-muted)' }}>{moreSummary}</span>
              )}
            </div>
            {showMore && (
              <div id={moreId}>

            {/* Quick-start templates — only on create */}
            {!editing && (
              <div className="mb-4">
                <Label>Or start from a template</Label>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Templates">
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

            {/* Repeat: a routine, and how often it comes round */}
            {!openEnded && (
            <div
              className="mb-4 rounded-lg p-3"
              style={{
                background: 'var(--color-surface2)',
                boxShadow: isRecurring ? 'inset 0 0 0 1.5px var(--color-primary)' : 'none',
              }}
            >
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={isRecurring}
                  onChange={(e) => setIsRecurring(e.target.checked)}
                  className="mt-1 h-4 w-4 cursor-pointer"
                />
                <span className="flex-1">
                  <span className="block text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                    Repeat
                  </span>
                  <span className="block text-xs" style={{ color: 'var(--color-muted)' }}>
                    A routine: planned as its own block on the days it comes round, ticked off fresh each time.
                  </span>
                </span>
              </label>
              {isRecurring && (
                <div className="mt-3 sm:pl-7">
                  <div className="grid grid-cols-3 gap-1 rounded-lg bg-(--color-surface) p-1" role="group" aria-label="How often">
                    {([
                      { id: 'daily', label: 'Every day' },
                      { id: 'weekly', label: 'Weekly' },
                      { id: 'interval', label: 'Every few days' },
                    ] as const).map((o) => {
                      const on = repeatKind === o.id;
                      return (
                        <button
                          key={o.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => setRepeatKind(o.id)}
                          className="rounded-md px-1.5 py-1.5 text-center text-[13px] font-bold transition-colors"
                          style={{
                            background: on ? 'var(--color-primary)' : 'transparent',
                            color: on ? 'var(--color-on-primary)' : 'var(--color-text)',
                          }}
                        >
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                  {repeatKind === 'weekly' && (
                    <>
                      <div className="mt-2 grid grid-cols-7 gap-1" role="group" aria-label="On these days">
                        {WEEK.map((d) => {
                          const on = repeatDays.includes(d);
                          return (
                            <button
                              key={d}
                              type="button"
                              aria-pressed={on}
                              // At least one day stays picked: a weekly routine on no day is no routine.
                              onClick={() => setRepeatDays(on ? (repeatDays.length > 1 ? repeatDays.filter((x) => x !== d) : repeatDays) : [...repeatDays, d])}
                              className="btn-quiet h-9 min-h-0 px-0 text-xs"
                              style={chip(on)}
                            >
                              {DAY_LABELS[d]}
                            </button>
                          );
                        })}
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-sm" style={{ color: 'var(--color-muted)' }}>
                        <label htmlFor={repeatWeeksId}>
                          Every<span className="sr-only"> how many weeks</span>
                        </label>
                        <select
                          id={repeatWeeksId}
                          className="form-input h-9 w-auto min-w-0 py-0"
                          value={repeatWeeks}
                          onChange={(e) => setRepeatWeeks(Number(e.target.value))}
                        >
                          {[1, 2, 3, 4].map((n) => (
                            <option key={n} value={n}>
                              {n === 1 ? 'week' : `${n} weeks`}
                            </option>
                          ))}
                        </select>
                        {repeatWeeks > 1 && <span>counting this week</span>}
                      </div>
                    </>
                  )}
                  {repeatKind === 'interval' && (
                    <div className="mt-2 flex items-center gap-2 text-sm" style={{ color: 'var(--color-muted)' }}>
                      <label htmlFor={repeatEveryId}>
                        Every<span className="sr-only"> how many days</span>
                      </label>
                      <input
                        id={repeatEveryId}
                        type="number"
                        min={2}
                        max={90}
                        className="form-input h-9 w-20 py-0"
                        value={repeatEvery}
                        onChange={(e) => setRepeatEvery(e.target.value)}
                      />
                      <span>days, starting today</span>
                    </div>
                  )}
                </div>
              )}
            </div>
            )}

            {/* Hour log toggle */}
            {!isRecurring && (
              <label
                className="mb-4 flex cursor-pointer items-start gap-3 rounded-lg p-3"
                style={{
                  background: 'var(--color-surface2)',
                  boxShadow: openEnded ? 'inset 0 0 0 1.5px var(--color-primary)' : 'none',
                }}
              >
                <input
                  type="checkbox"
                  checked={openEnded}
                  onChange={(e) => setOpenEnded(e.target.checked)}
                  className="mt-1 h-4 w-4 cursor-pointer"
                />
                <span className="flex-1">
                  <span className="block text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                    No estimate, just log hours
                  </span>
                  <span className="block text-xs" style={{ color: 'var(--color-muted)' }}>
                    For practice, reading, anything with no finish line. It is never planned or late; you write
                    down the time you put in.
                  </span>
                </span>
              </label>
            )}

            {/* In one go: never split into pieces */}
            {!isRecurring && !openEnded && (
              <label
                className="mb-4 flex cursor-pointer items-start gap-3 rounded-lg p-3"
                style={{
                  background: 'var(--color-surface2)',
                  boxShadow: oneSitting ? 'inset 0 0 0 1.5px var(--color-primary)' : 'none',
                }}
              >
                <input
                  type="checkbox"
                  checked={oneSitting}
                  onChange={(e) => setOneSitting(e.target.checked)}
                  className="mt-1 h-4 w-4 cursor-pointer"
                />
                <span className="flex-1">
                  <span className="block text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                    Do it in one go
                  </span>
                  <span className="block text-xs" style={{ color: 'var(--color-muted)' }}>
                    Never split into pieces: planned as one block of the whole estimate, on a day with room for all of it.
                  </span>
                </span>
              </label>
            )}

            {/* Part of: file this quest under another, as one of its steps. */}
            {!isRecurring && !openEnded && (parents.length > 0 || parentId) && (
              <Field label="Part of">
                <select
                  className="form-input"
                  value={parentId}
                  onChange={(e) => setParentId(e.target.value)}
                  aria-label="Part of"
                >
                  <option value="">Nothing: a quest of its own</option>
                  {parents.map((p) => (
                    <option key={p.id} value={p.id}>
                      {/* A step is set in under its main quest. */}
                      {p.depth > 1 ? '\u00A0\u00A0\u00A0\u00A0' : ''}
                      {p.title}
                    </option>
                  ))}
                </select>
                {parentId && (
                  <p className="mt-1.5 text-xs" style={{ color: 'var(--color-muted)' }}>
                    It becomes a step of that quest and counts towards its total.
                  </p>
                )}
              </Field>
            )}

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
              <div className="flex gap-1.5" role="group" aria-label="Mental load">
                {[1, 2, 3, 4, 5].map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={load5 === v}
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

              <div className="mb-4">
                <div className="mb-1.5 flex items-center gap-1.5">
                  <label htmlFor="quest-impact" className="text-[13px] font-semibold text-(--color-muted)">
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
                  id="quest-impact"
                  type="number"
                  min={1}
                  max={10}
                  className="form-input"
                  value={impact}
                  onChange={(e) => setImpact(Math.max(1, Math.min(10, Number(e.target.value) || 5)))}
                />
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
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="Category">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    aria-pressed={category === c.value}
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
                  aria-label="Add a tag"
                  placeholder={tags.length === 0 ? 'add tag — enter or comma' : '+'}
                  className="flex-1 min-w-[80px] bg-transparent text-xs outline-none"
                  style={{ color: 'var(--color-text)' }}
                />
              </div>
            </div>

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

            {/* Advanced section */}
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              aria-expanded={showAdvanced}
              className="mt-4 min-h-9 text-xs font-semibold transition-colors"
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
                          aria-label="Preferred hour"
                          className="form-input"
                          value={preferredHour}
                          onChange={(e) => setPreferredHour(e.target.value)}
                        >
                          <option value="">No preference</option>
                          {Array.from({ length: 24 }, (_, i) => (
                            <option key={i} value={i}>
                              {formatHour(i)}
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
                            aria-label="Urgency multiplier"
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
                        aria-label="Tediousness"
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
                        aria-label="Setup cost"
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
              </div>
            )}

            {/* Always in reach, however long the form above gets. */}
            {/* Sticky, so Add is always in reach; the box's scroll-pb-20 keeps a field Tab lands on above it. */}
            <div className="sticky bottom-0 -mx-5 mt-5 flex justify-end gap-2 border-t border-(--color-border) bg-(--color-surface) px-5 py-3 sm:-mx-6 sm:px-6 native:pb-[calc(0.75rem+var(--safe-bottom))]">
              <button type="button" onClick={onClose} className="btn-quiet min-h-10">
                Cancel
              </button>
              <button type="button" onClick={save} disabled={saving} className="btn-primary">
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Add quest'}
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
  // A day with no time means "by the end of that day". (These sat at 00:00, the
  // START of the day: a quest "due tomorrow" was planned to finish today, and
  // read as late from the first minute of tomorrow.)
  const endOfDay = (day: Date) => {
    const d = new Date(day);
    d.setHours(23, 59, 0, 0);
    return d;
  };
  const inDays = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return endOfDay(d);
  };
  const same = (a: Date | null, b: Date) => !!a && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const choices = [
    { label: 'Today', date: inDays(0) },
    { label: 'Tomorrow', date: inDays(1) },
    { label: 'In 3 days', date: inDays(3) },
    { label: 'In a week', date: inDays(7) },
  ];
  const custom = value !== null && !choices.some((c) => same(value, c.date));

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
          <MiniCalendar value={value} onChange={(d) => onChange(d ? endOfDay(d) : null)} />
        </div>
      )}
    </div>
  );
}

/** A label and its control, tied together so a screen reader names the control and a tap on the label focuses it. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const autoId = useId();
  // The first element child is the control; anything after it (an error line) rides along.
  const kids = Array.isArray(children) ? children : [children];
  const control = kids.find((k) => isValidElement(k)) as React.ReactElement<{ id?: string }> | undefined;
  const id = control ? (control.props.id ?? autoId) : undefined;
  return (
    <div className="mb-4">
      <Label htmlFor={id}>{label}</Label>
      {kids.map((k, i) => (k === control && control ? cloneElement(control, { id, key: 'control' }) : <span key={i} className="contents">{k}</span>))}
    </div>
  );
}

function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-semibold text-(--color-muted)">
      {children}
    </label>
  );
}
