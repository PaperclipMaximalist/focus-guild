import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useQuestStore } from '../store/useQuestStore';
import { useUserStore } from '../store/useUserStore';
import { useToastStore } from '../components/Toasts';
import { QuestCard } from '../components/QuestCard';
import { QuestModal } from '../components/QuestModal';
import { QuestDetail } from '../components/QuestDetail';
import { api, type Quest } from '../lib/api';

type Sort = 'priority' | 'deadline' | 'created' | 'title';

export default function Quests() {
  const { quests, load, complete, remove } = useQuestStore();
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
    pushToast({ icon: '⭐', title: `+${result.xpAwarded} XP`, sub: 'Quest complete', variant: 'xp' });
  };

  const bulkComplete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Complete ${selected.size} quests?`)) return;
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
    if (!confirm(`Delete ${selected.size} quests permanently?`)) return;
    setBulkBusy(true);
    try {
      await Promise.all([...selected].map((id) => remove(id)));
      clearSelection();
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkExtend = async (days: number) => {
    if (selected.size === 0) return;
    setBulkBusy(true);
    try {
      await Promise.all([...selected].map((id) => api.quests.extendDeadline(id, days)));
      await load();
      pushToast({ icon: '⏳', title: `Extended ${selected.size}`, sub: `+${days}d`, variant: 'xp' });
      clearSelection();
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6">
      <header className="flex items-baseline justify-between gap-3">
        <h1 className="text-2xl sm:text-3xl font-bold">All Quests</h1>
        <Link to="/" className="text-sm text-(--color-primary) hover:opacity-80">
          ← Today
        </Link>
      </header>

      {/* Search + sort */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <input
            ref={searchRef}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search quests…  (press / to focus)"
            className="w-full rounded-full border px-4 py-2 text-sm outline-none transition-colors"
            style={{
              borderColor: 'var(--color-border)',
              background: 'rgba(255,255,255,0.04)',
              color: 'var(--color-text)',
            }}
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className="rounded-full border px-3 py-2 text-sm outline-none"
          style={{
            borderColor: 'var(--color-border)',
            background: 'rgba(255,255,255,0.04)',
            color: 'var(--color-text)',
          }}
        >
          <option value="priority">Priority ↓</option>
          <option value="deadline">Deadline ↑</option>
          <option value="created">Newest first</option>
          <option value="title">A → Z</option>
        </select>
      </div>

      {/* Tag chips */}
      {tagCounts.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {activeTags.size > 0 && (
            <button
              onClick={() => setActiveTags(new Set())}
              className="text-xs underline opacity-70"
              style={{ color: 'var(--color-muted)' }}
            >
              clear
            </button>
          )}
          {tagCounts.map(([t, count]) => {
            const active = activeTags.has(t);
            return (
              <button
                key={t}
                onClick={() => toggleTag(t)}
                className="text-xs rounded-full px-2.5 py-1 font-semibold transition-colors"
                style={{
                  background: active ? 'var(--color-primary)' : 'rgba(139,92,246,0.10)',
                  color: active ? '#fff' : 'var(--color-primary)',
                  border: '1px solid rgba(139,92,246,0.4)',
                }}
              >
                #{t} <span className="opacity-60">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
        {visible.length === quests.length
          ? `Showing all ${quests.length} active quests`
          : `Showing ${visible.length} of ${quests.length} quests`}
        {' · '}
        <button onClick={selectAll} className="underline opacity-70 hover:opacity-100">
          Select all
        </button>
      </p>

      <section className="flex flex-col gap-3">
        <AnimatePresence>
          {visible.map((quest) => (
            <motion.div
              key={quest.id}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97 }}
              className="flex items-start gap-2"
            >
              <label
                className="mt-3 cursor-pointer"
                title="Select for bulk action"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={selected.has(quest.id)}
                  onChange={() => toggleSelect(quest.id)}
                  className="h-4 w-4 cursor-pointer"
                />
              </label>
              <div className="flex-1 min-w-0" data-quest-id={quest.id}>
                <QuestCard
                  quest={quest}
                  onComplete={() => handleComplete(quest.id)}
                  onEdit={() => {
                    setEditing(quest);
                    setModalOpen(true);
                  }}
                  onOpen={() => setDetail(quest)}
                  onDelete={() => {
                    if (confirm('Remove this quest?')) remove(quest.id);
                  }}
                />
                {/* Tag chips on each card */}
                {quest.tags && quest.tags.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1 pl-2">
                    {quest.tags.map((t) => (
                      <span
                        key={t}
                        className="text-[0.65rem] rounded-full px-1.5 py-0.5"
                        style={{
                          background: 'rgba(139,92,246,0.10)',
                          color: 'var(--color-primary)',
                        }}
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {visible.length === 0 && (
          <div
            className="rounded-(--radius-card) border px-6 py-12 text-center"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
          >
            <p className="text-4xl mb-3">{quests.length === 0 ? '🗺️' : '🔍'}</p>
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
            className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 flex flex-wrap items-center gap-2 rounded-full border px-3 py-2 shadow-xl"
            style={{
              background: 'var(--color-surface)',
              borderColor: 'var(--color-border)',
              maxWidth: 'calc(100vw - 2rem)',
            }}
          >
            <span className="text-xs font-semibold pl-1" style={{ color: 'var(--color-text)' }}>
              {selected.size} selected
            </span>
            <button
              onClick={bulkComplete}
              disabled={bulkBusy}
              className="text-xs rounded-full px-3 py-1.5 font-semibold text-white disabled:opacity-40"
              style={{ background: 'var(--color-green)' }}
            >
              ✓ Complete
            </button>
            <button
              onClick={() => bulkExtend(7)}
              disabled={bulkBusy}
              className="text-xs rounded-full px-3 py-1.5 font-semibold disabled:opacity-40"
              style={{ background: 'var(--color-gold)', color: '#0d0d1a' }}
            >
              +7d
            </button>
            <button
              onClick={bulkDelete}
              disabled={bulkBusy}
              className="text-xs rounded-full border px-3 py-1.5 font-semibold disabled:opacity-40"
              style={{ borderColor: 'rgba(239,68,68,0.5)', color: 'var(--color-fire)' }}
            >
              🗑 Delete
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
