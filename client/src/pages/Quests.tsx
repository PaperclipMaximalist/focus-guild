import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useQuestStore } from '../store/useQuestStore';
import { useUserStore } from '../store/useUserStore';
import { useToastStore } from '../components/Toasts';
import { QuestCard } from '../components/QuestCard';
import { QuestModal } from '../components/QuestModal';
import { QuestDetail } from '../components/QuestDetail';
import { api, type Quest } from '../lib/api';
import { Link } from 'react-router-dom';
import { Check, Hourglass, ListPlus, MapIcon, Search, SquareCheck, Star, Trash2, X } from 'lucide-react';

type Sort = 'priority' | 'deadline' | 'created' | 'title';

export default function Quests() {
  const { quests, load, complete, removeWithUndo } = useQuestStore();
  const { applyXPGain } = useUserStore();
  const pushToast = useToastStore((s) => s.push);

  const [editing, setEditing] = useState<Quest | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [detail, setDetail] = useState<Quest | null>(null);

  // Filtering / sorting / selection state
  const [search, setSearch] = useState('');
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<Sort>('priority');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  // Picking rows for a bulk action is a mode you enter, not a checkbox on every row.
  const [selecting, setSelecting] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    load();
  }, [load]);

  // Listen for global `/` shortcut to focus search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Distinct tags across all quests, sorted by frequency desc.
  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    quests.forEach((q) => (q.tags ?? []).forEach((t) => m.set(t, (m.get(t) ?? 0) + 1)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [quests]);

  // Filtered + sorted list
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const list = quests.filter((q) => {
      if (needle && !q.title.toLowerCase().includes(needle)) return false;
      if (activeTags.size > 0) {
        const qTags = q.tags ?? [];
        for (const t of activeTags) if (!qTags.includes(t)) return false;
      }
      return true;
    });
    return list.sort((a, b) => {
      switch (sort) {
        case 'deadline': {
          const ad = a.deadline ? new Date(a.deadline).getTime() : Infinity;
          const bd = b.deadline ? new Date(b.deadline).getTime() : Infinity;
          return ad - bd;
        }
        case 'created':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'title':
          return a.title.localeCompare(b.title);
        case 'priority':
        default:
          return (b.priorityScore ?? 0) - (a.priorityScore ?? 0);
      }
    });
  }, [quests, search, activeTags, sort]);

  // Keep `selected` pruned to currently-visible ids
  useEffect(() => {
    const visibleIds = new Set(visible.map((q) => q.id));
    setSelected((prev) => {
      const next = new Set<string>();
      prev.forEach((id) => visibleIds.has(id) && next.add(id));
      return next.size === prev.size ? prev : next;
    });
  }, [visible]);

  const toggleTag = (t: string) => {
    setActiveTags((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(visible.map((q) => q.id)));
  };

  const clearSelection = () => setSelected(new Set());

  const handleComplete = async (id: string) => {
    const result = await complete(id);
    applyXPGain(result.totalXP, result.newStreak, result.newMultiplier);
    pushToast({ icon: Star, title: `+${result.xpAwarded} XP`, sub: 'Quest complete', variant: 'xp' });
  };

  const bulkComplete = async () => {
    if (selected.size === 0) return;
    setBulkBusy(true);
    try {
      for (const id of selected) {
        try {
          await handleComplete(id);
        } catch {
          /* swallow per-item */
        }
      }
      clearSelection();
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkDelete = async () => {
    if (selected.size === 0) return;
    removeWithUndo([...selected]);
    clearSelection();
  };

  const bulkExtend = async (days: number) => {
    if (selected.size === 0) return;
    setBulkBusy(true);
    try {
      await Promise.all([...selected].map((id) => api.quests.extendDeadline(id, days)));
      await load();
      pushToast({ icon: Hourglass, title: `Extended ${selected.size}`, sub: `+${days}d`, variant: 'xp' });
      clearSelection();
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="page flex flex-col gap-4">
      <header className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="page-title">Quests</h1>
          <p className="tnum mt-1 text-[13px] text-(--color-muted)">
            {visible.length === quests.length
              ? `${quests.length} active`
              : `${visible.length} of ${quests.length} shown`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => { if (selecting) clearSelection(); setSelecting((v) => !v); }}
          className="btn-quiet"
          aria-pressed={selecting}
          style={selecting ? { background: 'var(--color-primary)', color: 'var(--color-on-primary)' } : undefined}
        >
          <SquareCheck size={15} aria-hidden /> {selecting ? 'Done' : 'Select'}
        </button>
        <Link to="/quests/import" className="btn-quiet">
          <ListPlus size={15} aria-hidden /> Import
        </Link>
      </header>

      {/* Search + sort */}
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-(--color-muted)" aria-hidden />
          <input
            ref={searchRef}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search quests"
            aria-label="Search quests"
            className="form-input pl-9"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          aria-label="Sort by"
          className="form-input w-auto shrink-0"
        >
          <option value="priority">By priority</option>
          <option value="deadline">By deadline</option>
          <option value="created">Newest first</option>
          <option value="title">By title</option>
        </select>
      </div>

      {/* Tags: one row you can swipe, so eight tags don't push the list off the screen */}
      {tagCounts.length > 0 && (
        <div className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:px-0">
          {tagCounts.map(([t, count]) => {
            const active = activeTags.has(t);
            return (
              <button
                key={t}
                onClick={() => toggleTag(t)}
                aria-pressed={active}
                className="shrink-0 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors"
                style={{
                  background: active ? 'var(--color-primary)' : 'var(--color-surface)',
                  color: active ? 'var(--color-on-primary)' : 'var(--color-muted)',
                }}
              >
                #{t} <span className="tnum opacity-70">{count}</span>
              </button>
            );
          })}
          {activeTags.size > 0 && (
            <button onClick={() => setActiveTags(new Set())} className="icon-btn h-8 w-8 shrink-0" aria-label="Clear tag filters" title="Clear tag filters">
              <X size={14} aria-hidden />
            </button>
          )}
        </div>
      )}

      {selecting && visible.length > 0 && (
        <p className="text-[13px] text-(--color-muted)">
          Tap quests to pick them.{' '}
          <button onClick={selectAll} className="font-semibold text-(--color-text) underline underline-offset-2">
            Select all {visible.length}
          </button>
        </p>
      )}

      <section>
        {visible.length > 0 && (
          <div className="panel rows overflow-hidden">
            <AnimatePresence initial={false}>
              {visible.map((quest) => (
                <div key={quest.id} data-quest-id={quest.id}>
                  <QuestCard
                    quest={quest}
                    selecting={selecting}
                    selected={selected.has(quest.id)}
                    onToggleSelect={() => toggleSelect(quest.id)}
                    onComplete={() => handleComplete(quest.id)}
                    onEdit={() => {
                      setEditing(quest);
                      setModalOpen(true);
                    }}
                    onOpen={() => setDetail(quest)}
                    onDelete={() => removeWithUndo(quest.id)}
                  />
                </div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {visible.length === 0 && (
          <div className="panel px-6 py-12 text-center">
            {quests.length === 0
              ? <MapIcon size={40} strokeWidth={1.5} className="mx-auto mb-3 opacity-60" aria-hidden />
              : <Search size={40} strokeWidth={1.5} className="mx-auto mb-3 opacity-60" aria-hidden />}
            <p className="font-semibold" style={{ color: 'var(--color-text)' }}>
              {quests.length === 0 ? 'No active quests yet' : 'Nothing matches'}
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--color-muted)' }}>
              {quests.length === 0
                ? 'Add one from Today or use a template in the modal.'
                : 'Try clearing filters or the search box.'}
            </p>
          </div>
        )}
      </section>

      {/* Bulk action bar — floats above bottom nav */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
            className="fixed bottom-20 left-1/2 z-40 flex -translate-x-1/2 flex-wrap items-center gap-2 rounded-xl border px-3 py-2 shadow-xl shadow-black/50 lg:bottom-6 lg:left-[calc(50%+7.5rem)]"
            style={{
              background: 'var(--color-surface2)',
              borderColor: 'var(--color-border-strong)',
              maxWidth: 'calc(100vw - 2rem)',
            }}
          >
            <span className="text-xs font-semibold pl-1" style={{ color: 'var(--color-text)' }}>
              {selected.size} selected
            </span>
            <button
              onClick={bulkComplete}
              disabled={bulkBusy}
              className="text-xs rounded-md px-3 py-1.5 font-semibold text-(--color-on-primary) disabled:opacity-40"
              style={{ background: 'var(--color-green)' }}
            >
              <span className="inline-flex items-center gap-1.5"><Check size={12} aria-hidden /> Complete</span>
            </button>
            <button
              onClick={() => bulkExtend(7)}
              disabled={bulkBusy}
              className="text-xs rounded-md px-3 py-1.5 font-semibold disabled:opacity-40"
              style={{ background: 'var(--color-gold)', color: 'var(--color-on-primary)' }}
            >
              +7d
            </button>
            <button
              onClick={bulkDelete}
              disabled={bulkBusy}
              className="text-xs rounded-md border px-3 py-1.5 font-semibold disabled:opacity-40"
              style={{ borderColor: 'color-mix(in srgb, var(--color-fire) 50%, transparent)', color: 'var(--color-fire)' }}
            >
              <span className="inline-flex items-center gap-1.5"><Trash2 size={12} aria-hidden /> Delete</span>
            </button>
            <button
              onClick={clearSelection}
              className="text-xs px-2 opacity-60 hover:opacity-100"
              style={{ color: 'var(--color-muted)' }}
            >
              clear
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <QuestModal open={modalOpen} onClose={() => setModalOpen(false)} editing={editing} />
      <QuestDetail
        open={!!detail}
        quest={detail}
        onClose={() => setDetail(null)}
        onEdit={() => {
          if (detail) {
            setEditing(detail);
            setModalOpen(true);
          }
          setDetail(null);
        }}
      />
    </div>
  );
}
