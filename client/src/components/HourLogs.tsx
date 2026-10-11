/**
 * Hour logs: things you put time into that have no finish line.
 *
 * Practising, reading, a long project: there is no honest estimate for these,
 * so they are not planned, never late and never "behind". You write down what
 * you did and the log adds it up. That is the whole feature.
 *
 * The section sits on the Quests page. Each log is one row: its name, what has
 * gone into it (all time, this week), and a Log button. The button opens a
 * sheet that asks the two things a person actually knows — how long, and
 * (if they care to say) what they did — and shows the entries underneath like
 * the lines of a notebook.
 *
 * Kept deliberately small:
 *   - One field for the time, which reads "1.5", "1:30", "90m" or "45" and
 *     shows what it understood before anything is saved (lib/hours.ts).
 *   - Today unless you say otherwise; yesterday is one tap, any earlier day
 *     is a date field.
 *   - An entry can be taken back, and that is all the editing there is.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { api, type HourLog, type Quest, type TimeEntry } from '../lib/api';
import { useUserStore } from '../store/useUserStore';
import { useToastStore } from './Toasts';
import { useArmed } from '../lib/useArmed';
import { formatMinutes } from '../lib/formatters';
import { dayLabel, localDayKey, parseDuration } from '../lib/hours';
import { duckReact } from '../store/useMascotStore';
import { NotebookPen, Pencil, Plus, Star, Trash2, TriangleAlert, X } from 'lucide-react';

/** A mouse or trackpad: safe to focus a field without summoning an on-screen keyboard. */
const FINE_POINTER = typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches;

/** Lengths people log most; one tap instead of typing. */
const QUICK = [15, 30, 45, 60, 90, 120];

export function HourLogs({ onEdit }: { onEdit: (quest: Quest) => void }) {
  const pushToast = useToastStore((s) => s.push);
  const [logs, setLogs] = useState<HourLog[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setLogs(await api.quests.hourLogs());
    } catch {
      // Leave what is showing; the next change or visit reads it again.
      setLogs((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => {
    void load();
    // The quest editor can make or rename a log too.
    window.addEventListener('fg:hour-logs-changed', load);
    return () => window.removeEventListener('fg:hour-logs-changed', load);
  }, [load]);

  const create = async () => {
    const title = name.trim();
    if (!title || busy) return;
    setBusy(true);
    try {
      const made = await api.quests.create({ title, openEnded: true });
      setName('');
      setNaming(false);
      await load();
      // Straight to the entry sheet: the reason to start a log is to write in it.
      setOpenId(made.id);
    } catch {
      pushToast({ icon: TriangleAlert, title: "Couldn't start the log", sub: 'Nothing was added. Try again.', variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const active = logs?.find((l) => l.id === openId) ?? null;

  return (
    <section aria-label="Hour logs">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="section-label flex-1">Hour logs</h2>
        {!naming && (
          <button type="button" onClick={() => setNaming(true)} className="btn-quiet h-8 min-h-0 px-2.5 text-xs">
            <Plus size={14} aria-hidden /> New log
          </button>
        )}
      </div>

      <div className="panel rows overflow-hidden">
        {naming && (
          <form
            className="flex items-center gap-2 px-3.5 py-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && (setNaming(false), setName(''))}
              autoFocus
              maxLength={280}
              placeholder="What are you putting time into?"
              aria-label="Name of the new hour log"
              className="form-input min-w-0 flex-1"
            />
            <button type="submit" disabled={!name.trim() || busy} className="btn-strong shrink-0 disabled:opacity-40">
              Start
            </button>
            <button type="button" onClick={() => (setNaming(false), setName(''))} className="icon-btn shrink-0" aria-label="Cancel">
              <X size={16} aria-hidden />
            </button>
          </form>
        )}

        {!logs && <div className="skeleton m-3.5 h-10" aria-busy="true" />}

        {logs?.map((log) => (
          <div key={log.id} className="flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-white/[0.025]">
            <button type="button" onClick={() => setOpenId(log.id)} className="min-w-0 flex-1 text-left">
              <div className="text-[15px] font-semibold leading-snug [overflow-wrap:anywhere]">{log.title}</div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[13px] text-(--color-muted)">
                {log.loggedMinutes > 0 ? (
                  <>
                    <span>
                      <span className="tnum font-medium text-(--color-text)">{formatMinutes(log.loggedMinutes)}</span> in all
                    </span>
                    <span>
                      <span className="tnum">{log.weekMinutes > 0 ? formatMinutes(log.weekMinutes) : 'none'}</span> this week
                    </span>
                    {log.lastLoggedAt && <span>last {dayLabel(localDayKey(new Date(log.lastLoggedAt))).toLowerCase()}</span>}
                  </>
                ) : (
                  <span>Nothing written yet</span>
                )}
              </div>
            </button>
            <button type="button" onClick={() => setOpenId(log.id)} className="btn-quiet shrink-0" aria-label={`Log time on ${log.title}`}>
              <NotebookPen size={15} aria-hidden /> Log
            </button>
          </div>
        ))}

        {logs && logs.length === 0 && !naming && (
          <p className="px-3.5 py-3 text-[13px] leading-snug text-(--color-muted)">
            For things with no finish line, like practice or reading. No estimate and nothing to fall behind on: write
            down the time you put in and it adds up.
          </p>
        )}
      </div>

      <HourLogSheet
        log={active}
        onClose={() => setOpenId(null)}
        onChanged={load}
        onEdit={(q) => {
          setOpenId(null);
          onEdit(q);
        }}
      />
    </section>
  );
}

type When = 'today' | 'yesterday' | 'earlier';

function HourLogSheet({
  log,
  onClose,
  onChanged,
  onEdit,
}: {
  log: HourLog | null;
  onClose: () => void;
  onChanged: () => Promise<void>;
  onEdit: (quest: Quest) => void;
}) {
  const applyXPGain = useUserStore((s) => s.applyXPGain);
  const pushToast = useToastStore((s) => s.push);
  const { armed, fire } = useArmed();

  const [length, setLength] = useState('');
  const [note, setNote] = useState('');
  const [when, setWhen] = useState<When>('today');
  const [earlier, setEarlier] = useState('');
  const [saving, setSaving] = useState(false);
  const [entries, setEntries] = useState<TimeEntry[] | null>(null);

  const id = log?.id ?? null;

  useEffect(() => {
    if (!id) return;
    setLength('');
    setNote('');
    setWhen('today');
    setEarlier('');
    setEntries(null);
    api.quests
      .hours(id)
      .then((d) => setEntries(d.entries))
      .catch(() => setEntries([]));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id, onClose]);

  const minutes = parseDuration(length);
  const today = localDayKey(new Date());
  const date = useMemo(() => {
    if (when === 'today') return undefined;
    if (when === 'yesterday') {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      return localDayKey(y);
    }
    return earlier || null;
  }, [when, earlier]);
  const ready = minutes !== null && date !== null && !saving;

  const save = async () => {
    if (!log || minutes === null || date === null || saving) return;
    setSaving(true);
    try {
      const result = await api.quests.logHours(log.id, { minutes, note: note.trim() || undefined, date });
      setEntries((prev) => [result.entry, ...(prev ?? [])].sort((a, b) => b.at.localeCompare(a.at)));
      setLength('');
      setNote('');
      applyXPGain(result.totalXP, result.newStreak, result.newMultiplier);
      duckReact('questDone');
      pushToast({
        icon: Star,
        title: result.xpAwarded > 0 ? `+${result.xpAwarded} XP` : 'Written down',
        sub: `${formatMinutes(minutes)} on ${log.title}`,
        variant: 'xp',
      });
      await onChanged();
    } catch {
      pushToast({ icon: TriangleAlert, title: "Couldn't save it", sub: 'Nothing was written. Try again.', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const removeEntry = async (entry: TimeEntry) => {
    if (!log) return;
    const was = entries;
    setEntries((prev) => (prev ?? []).filter((e) => e.id !== entry.id));
    try {
      await api.quests.removeHours(log.id, entry.id);
      await onChanged();
    } catch {
      setEntries(was);
      pushToast({ icon: TriangleAlert, title: "Couldn't remove it", sub: 'The entry is still there.', variant: 'error' });
    }
  };

  const removeLog = async () => {
    if (!log) return;
    try {
      await api.quests.delete(log.id);
      onClose();
      await onChanged();
    } catch {
      pushToast({ icon: TriangleAlert, title: "Couldn't delete the log", sub: 'Nothing was removed.', variant: 'error' });
    }
  };

  // Entries under the day they belong to, like a page per day.
  const byDay = useMemo(() => {
    const days = new Map<string, TimeEntry[]>();
    for (const e of entries ?? []) {
      const key = localDayKey(new Date(e.at));
      days.set(key, [...(days.get(key) ?? []), e]);
    }
    return [...days.entries()];
  }, [entries]);

  return (
    <AnimatePresence>
      {log && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onClose}
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/70 sm:items-center sm:p-5"
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={`Log time on ${log.title}`}
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-(--color-surface2) p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:rounded-2xl"
          >
            <div className="mb-4 flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="section-label">Hour log</p>
                {/* Not an <h2>: headings are set as signage in capitals, and a title you wrote never is. */}
                <p role="heading" aria-level={2} className="mt-1 text-[17px] font-bold leading-snug [overflow-wrap:anywhere]">
                  {log.title}
                </p>
                <p className="mt-1 text-[13px] text-(--color-muted)">
                  {log.loggedMinutes > 0 ? (
                    <>
                      <span className="tnum font-medium text-(--color-text)">{formatMinutes(log.loggedMinutes)}</span> in all
                      {log.weekMinutes > 0 && (
                        <>
                          {' · '}
                          <span className="tnum">{formatMinutes(log.weekMinutes)}</span> this week
                        </>
                      )}
                    </>
                  ) : (
                    'Nothing written yet'
                  )}
                </p>
              </div>
              <button type="button" onClick={onClose} className="icon-btn -mr-2 -mt-1" aria-label="Close">
                <X size={18} aria-hidden />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
              className="flex flex-col gap-3"
            >
              <div>
                <label htmlFor="hours-length" className="mb-1.5 block text-[13px] font-semibold text-(--color-muted)">
                  How long?
                </label>
                <div className="flex items-center gap-3">
                  <input
                    id="hours-length"
                    value={length}
                    onChange={(e) => setLength(e.target.value)}
                    autoFocus={FINE_POINTER}
                    inputMode="text"
                    autoComplete="off"
                    placeholder="1.5 or 1:30 or 45m"
                    className="form-input min-w-0 flex-1"
                  />
                  {/* What the field was understood to say, before it is saved. */}
                  <span className="tnum w-20 shrink-0 text-[15px] font-semibold" aria-live="polite">
                    {minutes !== null ? formatMinutes(minutes) : length.trim() ? <span className="text-[13px] font-normal text-(--color-muted)">?</span> : ''}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {QUICK.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setLength(formatMinutes(m))}
                      aria-pressed={minutes === m}
                      className="tnum rounded-md px-2.5 py-1.5 text-[13px] font-semibold transition-colors"
                      style={{
                        background: minutes === m ? 'var(--color-text)' : 'var(--color-surface)',
                        color: minutes === m ? 'var(--color-bg)' : 'var(--color-muted)',
                      }}
                    >
                      {formatMinutes(m)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="mb-1.5 block text-[13px] font-semibold text-(--color-muted)">When?</span>
                <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="When">
                  {(['today', 'yesterday', 'earlier'] as const).map((w) => (
                    <button
                      key={w}
                      type="button"
                      role="radio"
                      aria-checked={when === w}
                      onClick={() => setWhen(w)}
                      className="rounded-md px-2.5 py-1.5 text-[13px] font-semibold capitalize transition-colors"
                      style={{
                        background: when === w ? 'var(--color-text)' : 'var(--color-surface)',
                        color: when === w ? 'var(--color-bg)' : 'var(--color-muted)',
                      }}
                    >
                      {w}
                    </button>
                  ))}
                  {when === 'earlier' && (
                    <input
                      type="date"
                      value={earlier}
                      max={today}
                      onChange={(e) => setEarlier(e.target.value)}
                      aria-label="Which day"
                      className="form-input w-auto min-w-0 flex-1 [color-scheme:dark]"
                    />
                  )}
                </div>
              </div>

              <div>
                <label htmlFor="hours-note" className="mb-1.5 block text-[13px] font-semibold text-(--color-muted)">
                  What did you do? <span className="font-normal">Optional</span>
                </label>
                <input
                  id="hours-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={500}
                  autoComplete="off"
                  placeholder="Scales, then the hard page"
                  className="form-input"
                />
              </div>

              <button type="submit" disabled={!ready} className="btn-primary mt-1 w-full">
                {minutes !== null ? `Log ${formatMinutes(minutes)}` : 'Log time'}
              </button>
            </form>

            <div className="mt-6">
              <h3 className="section-label mb-2">Entries</h3>
              {!entries && <div className="skeleton h-9" aria-busy="true" />}
              {entries && entries.length === 0 && (
                <p className="text-[13px] text-(--color-muted)">The first entry will show here.</p>
              )}
              {byDay.map(([key, list]) => (
                <div key={key} className="mb-3">
                  <p className="mb-1 flex items-baseline gap-2 text-[13px] font-semibold">
                    {dayLabel(key)}
                    <span className="tnum font-normal text-(--color-muted)">
                      {formatMinutes(list.reduce((sum, e) => sum + e.minutes, 0))}
                    </span>
                  </p>
                  <ul className="flex flex-col">
                    {list.map((e) => (
                      <li key={e.id} className="group/entry flex min-h-9 items-center gap-2.5 border-t border-(--color-border) py-1">
                        <span className="tnum w-16 shrink-0 text-[14px] font-medium">{formatMinutes(e.minutes)}</span>
                        <span className="min-w-0 flex-1 text-[14px] leading-snug text-(--color-muted) [overflow-wrap:anywhere]">
                          {e.note || (e.source === 'timer' ? 'Focus timer' : '')}
                        </span>
                        <button
                          type="button"
                          onClick={() => fire(`entry:${e.id}`, () => void removeEntry(e))}
                          className={
                            armed === `entry:${e.id}`
                              ? 'shrink-0 rounded-md px-2 py-1 text-[12px] font-semibold'
                              : 'icon-btn h-7 w-7 opacity-0 transition-opacity group-hover/entry:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-70'
                          }
                          style={armed === `entry:${e.id}` ? { color: 'var(--color-fire)' } : undefined}
                          aria-label={armed === `entry:${e.id}` ? 'Tap again to remove this entry' : 'Remove this entry'}
                        >
                          {armed === `entry:${e.id}` ? 'Remove?' : <X size={14} aria-hidden />}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between gap-2 border-t border-(--color-border) pt-3">
              <button
                type="button"
                onClick={() => fire('delete-log', () => void removeLog())}
                className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] font-semibold"
                style={{ color: armed === 'delete-log' ? 'var(--color-fire)' : 'var(--color-muted)' }}
              >
                <Trash2 size={13} aria-hidden /> {armed === 'delete-log' ? 'Tap again to delete the log' : 'Delete log'}
              </button>
              <button type="button" onClick={() => onEdit(log)} className="btn-quiet h-8 min-h-0 px-2.5 text-xs">
                <Pencil size={13} aria-hidden /> Rename
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
