/**
 * Journal: a notebook, and nothing else.
 *
 * You open it, the page for today is there, you write, and it is kept. Below
 * are the earlier days, newest first, in your own words. The only other thing
 * that appears is time you wrote down on an hour log, because that is also
 * something you recorded by hand.
 *
 * What is deliberately not here: the app's own activity log (every quest
 * completed, every plan rebuilt), the permafile, Ask the Guild and the AI
 * bundle. Those were the four tabs of the "Logbook" this page replaced; they
 * are records and tooling, and they now live under Advanced at
 * /advanced/records (pages/Records.tsx). A quiet link at the foot goes there.
 *
 * (The route is still /chronicle and the file still Chronicle.tsx: labels
 * change, URLs and code names don't. See "The route vocabulary" in the Bible.)
 *
 * Small things that make it behave like paper:
 *   - What you are writing is kept on the device as you type, so leaving the
 *     page mid-sentence loses nothing.
 *   - An entry can be reworded or removed; removing offers Undo instead of
 *     asking whether you are sure.
 *   - The box grows with what you write. There are no fields to fill in.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { api, type JournalItem } from '../lib/api';
import { useToastStore } from '../components/Toasts';
import { formatMinutes } from '../lib/formatters';
import { dayLabel, localDayKey } from '../lib/hours';
import { sfxClick } from '../lib/sfx';
import { ChevronRight, Clock, Pencil, Trash2, TriangleAlert, X } from 'lucide-react';

const DRAFT_KEY = 'fg:journal-draft';
const MAX = 5000;
/** How long a removed entry can be brought back; just under the toast's own lifetime. */
const UNDO_MS = 5500;
/** The tabs that used to live here, so old links and bookmarks still land somewhere. */
const MOVED_TABS = new Set(['log', 'permafile', 'ask', 'bundle']);
/** A mouse or trackpad: a keyboard shortcut is worth mentioning. */
const FINE_POINTER = typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches;

function readDraft(): string {
  try {
    return localStorage.getItem(DRAFT_KEY) ?? '';
  } catch {
    return '';
  }
}

function keepDraft(text: string) {
  try {
    if (text) localStorage.setItem(DRAFT_KEY, text);
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Private mode or a full disk: the entry still saves when it is written down.
  }
}

/** Make a textarea as tall as what is in it. */
function fit(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

export default function Journal() {
  const [params] = useSearchParams();
  const pushToast = useToastStore((s) => s.push);

  const [entries, setEntries] = useState<JournalItem[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [draft, setDraft] = useState(readDraft);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const box = useRef<HTMLTextAreaElement | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const page = await api.chronicle.journalPage();
      setEntries(page.entries);
      setHasMore(page.hasMore);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => fit(box.current), [draft]);

  const byDay = useMemo(() => {
    const days = new Map<string, JournalItem[]>();
    for (const e of entries ?? []) {
      const key = localDayKey(new Date(e.at));
      days.set(key, [...(days.get(key) ?? []), e]);
    }
    return [...days.entries()];
  }, [entries]);

  const movedTab = params.get('tab');
  if (movedTab && MOVED_TABS.has(movedTab)) {
    return <Navigate to={`/advanced/records?tab=${movedTab}`} replace />;
  }

  const write = async () => {
    const text = draft.trim();
    if (!text || saving) return;
    setSaving(true);
    try {
      const made = await api.chronicle.journal(text);
      const item: JournalItem = {
        id: made.id,
        at: made.at,
        kind: 'note',
        text,
        rating: null,
        minutes: null,
        questId: null,
        questTitle: null,
      };
      setEntries((prev) => [item, ...(prev ?? [])]);
      setDraft('');
      keepDraft('');
      sfxClick();
    } catch {
      pushToast({ icon: TriangleAlert, title: "Couldn't save it", sub: 'Your words are still in the box. Try again.', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    const text = editing.text.trim();
    if (!text) return;
    const was = entries;
    setEntries((prev) => (prev ?? []).map((e) => (e.id === editing.id ? { ...e, text } : e)));
    setEditing(null);
    try {
      await api.chronicle.editJournal(editing.id, text);
    } catch {
      setEntries(was);
      pushToast({ icon: TriangleAlert, title: "Couldn't save the change", sub: 'The entry is as it was.', variant: 'error' });
    }
  };

  /** Off the page now, deleted a few seconds later, Undo in between. */
  const remove = (item: JournalItem) => {
    const was = entries;
    setEntries((prev) => (prev ?? []).filter((e) => e.id !== item.id));
    let undone = false;
    const timer = setTimeout(() => {
      if (undone) return;
      api.chronicle.deleteJournal(item.id).catch(() => {
        setEntries(was);
        pushToast({ icon: TriangleAlert, title: "Couldn't remove it", sub: 'The entry is back on the page.', variant: 'error' });
      });
    }, UNDO_MS);
    pushToast({
      icon: Trash2,
      title: 'Entry removed',
      sub: item.text.slice(0, 60),
      variant: 'xp',
      action: {
        label: 'Undo',
        run: () => {
          undone = true;
          clearTimeout(timer);
          setEntries((prev) => {
            if (!prev || prev.some((e) => e.id === item.id)) return prev;
            return [...prev, item].sort((a, b) => b.at.localeCompare(a.at));
          });
        },
      },
    });
  };

  const earlier = async () => {
    const oldest = entries?.[entries.length - 1];
    if (!oldest || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await api.chronicle.journalPage(oldest.at);
      setEntries((prev) => [...(prev ?? []), ...page.entries]);
      setHasMore(page.hasMore);
    } catch {
      pushToast({ icon: TriangleAlert, title: "Couldn't load earlier entries", sub: 'Try again.', variant: 'error' });
    } finally {
      setLoadingMore(false);
    }
  };

  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="page flex flex-col gap-6">
      <header>
        <h1 className="page-title">Journal</h1>
        <p className="mt-1 text-[13px] text-(--color-muted)">{today}</p>
      </header>

      {/* Today's page. */}
      <section className="panel px-4 pb-3 pt-3.5">
        <textarea
          ref={box}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            keepDraft(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void write();
            }
          }}
          rows={4}
          maxLength={MAX}
          spellCheck
          placeholder="How did today go?"
          aria-label="Write in the journal"
          className="block w-full resize-none bg-transparent text-[16px] leading-relaxed outline-none placeholder:text-(--color-muted)"
        />
        <div className="mt-2 flex items-center gap-3">
          <span className="min-w-0 flex-1 text-[12px] text-(--color-muted)">
            {draft.length > MAX - 500
              ? `${(MAX - draft.length).toLocaleString()} characters left`
              : draft.trim() && FINE_POINTER
                ? 'Ctrl + Enter to keep it'
                : ''}
          </span>
          <button type="button" onClick={() => void write()} disabled={!draft.trim() || saving} className="btn-primary">
            Write it down
          </button>
        </div>
      </section>

      {failed && (
        <p className="text-[14px] text-(--color-muted)">
          The journal didn't load.{' '}
          <button type="button" onClick={() => void load()} className="font-semibold text-(--color-text) underline underline-offset-2">
            Try again
          </button>
        </p>
      )}

      {!entries && !failed && (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading the journal">
          <div className="skeleton h-4 w-24" />
          <div className="skeleton h-5 w-11/12" />
          <div className="skeleton h-5 w-3/5" />
        </div>
      )}

      {entries && entries.length === 0 && (
        <p className="text-[14px] leading-relaxed text-(--color-muted)">
          Nothing written yet. Whatever you put in the box above becomes the first page.
        </p>
      )}

      {byDay.map(([key, list]) => (
        <section key={key} aria-label={dayLabel(key)}>
          <h2 className="section-label mb-2 border-b border-(--color-border) pb-1.5">{dayLabel(key)}</h2>
          <ul className="flex flex-col gap-3.5">
            {list.map((item) =>
              item.kind === 'hours' ? (
                <li key={item.id} className="flex items-baseline gap-3 text-[14px] text-(--color-muted)">
                  <span className="flex w-16 shrink-0 justify-end self-center" aria-hidden>
                    <Clock size={13} />
                  </span>
                  <Link to="/quests" className="min-w-0 leading-snug hover:text-(--color-text)">
                    <span className="tnum font-medium text-(--color-text)">{formatMinutes(item.minutes ?? 0)}</span>
                    {item.questTitle && <> on {item.questTitle}</>}
                    {item.text && <>: {item.text}</>}
                  </Link>
                </li>
              ) : (
                <li key={item.id} className="group/entry flex items-baseline gap-3">
                  <time className="tnum w-16 shrink-0 whitespace-nowrap text-right text-[12px] text-(--color-muted)" dateTime={item.at}>
                    {new Date(item.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                  </time>
                  {editing?.id === item.id ? (
                    <div className="min-w-0 flex-1">
                      <textarea
                        ref={fit}
                        value={editing.text}
                        onChange={(e) => {
                          setEditing({ id: item.id, text: e.target.value });
                          fit(e.target);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') setEditing(null);
                          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void saveEdit();
                        }}
                        autoFocus
                        maxLength={MAX}
                        aria-label="Reword this entry"
                        className="form-input block resize-none text-[15px] leading-relaxed"
                      />
                      <div className="mt-2 flex justify-end gap-2">
                        <button type="button" onClick={() => setEditing(null)} className="btn-quiet h-8 min-h-0 px-2.5 text-xs">
                          Cancel
                        </button>
                        <button type="button" onClick={() => void saveEdit()} disabled={!editing.text.trim()} className="btn-strong h-8 min-h-0 px-3 text-xs disabled:opacity-40">
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="min-w-0 flex-1 whitespace-pre-wrap text-[15px] leading-relaxed [overflow-wrap:anywhere]">
                        {item.rating && <span className="mr-2 text-[12px] font-semibold text-(--color-muted)">Mood {item.rating}/5</span>}
                        {item.text}
                      </p>
                      <span className="flex shrink-0 self-start opacity-0 transition-opacity group-hover/entry:opacity-100 group-focus-within/entry:opacity-100 [@media(hover:none)]:opacity-60">
                        <button type="button" onClick={() => setEditing({ id: item.id, text: item.text })} className="icon-btn h-7 w-7" title="Reword" aria-label="Reword this entry">
                          <Pencil size={13} aria-hidden />
                        </button>
                        <button type="button" onClick={() => remove(item)} className="icon-btn h-7 w-7" title="Remove" aria-label="Remove this entry">
                          <X size={14} aria-hidden />
                        </button>
                      </span>
                    </>
                  )}
                </li>
              ),
            )}
          </ul>
        </section>
      ))}

      {hasMore && (
        <button type="button" onClick={() => void earlier()} disabled={loadingMore} className="btn-quiet self-center disabled:opacity-50">
          {loadingMore ? 'Loading' : 'Earlier entries'}
        </button>
      )}

      {/* The Logbook's old tabs. Out of the way on purpose. */}
      <Link
        to="/advanced/records"
        className="mt-4 flex items-center gap-2 self-start text-[12px] text-(--color-muted) transition-colors hover:text-(--color-text)"
      >
        Records and AI tools
        <ChevronRight size={13} aria-hidden />
      </Link>
    </div>
  );
}
