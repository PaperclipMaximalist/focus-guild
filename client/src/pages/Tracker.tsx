/**
 * Tracker — the long-horizon view.
 *
 * Active items are pinned above everything else regardless of domain, because
 * "what am I actually carrying right now" is the question the page exists to
 * answer; the per-domain sections below are the reference shelf and collapse
 * out of the way.
 *
 * CAS mode is a lens over the same items, switched at the top of the page and
 * remembered across reloads. It changes three things and nothing else: the
 * item set narrows to CAS-tagged items, grouping switches from domain to
 * strand, and the cap indicator disappears (CAS items were never counted by
 * it). No write behaves differently with the lens on — cap exemption is a
 * property of an item having strands, not of the view being active.
 */

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  CAS_STRANDS,
  type CasStrand,
  type TrackerItem,
} from '../lib/api';
import { cappedActive, hasCourseworkConflict, useTrackerStore } from '../store/useTrackerStore';
import { TrackerItemCard } from '../components/tracker/TrackerItemCard';
import { TrackerItemSheet } from '../components/tracker/TrackerItemSheet';
import { ReflectionSheet } from '../components/tracker/ReflectionSheet';
import { ParkingLot } from '../components/tracker/ParkingLot';
import { DecisionLog } from '../components/tracker/DecisionLog';
import { ReviewBanner } from '../components/tracker/ReviewBanner';
import { CasMatrix } from '../components/tracker/CasMatrix';
import { CasBalance } from '../components/tracker/CasBalance';
import { CasInterviews } from '../components/tracker/CasInterviews';

type Tab = 'items' | 'lot' | 'log' | 'coverage' | 'balance' | 'interviews';

const STRAND_LABEL: Record<CasStrand, string> = {
  creativity: 'Creativity',
  activity: 'Activity',
  service: 'Service',
};

const STRAND_COLOR: Record<CasStrand, string> = {
  creativity: '#a855f7',
  activity: '#22c55e',
  service: '#3b82f6',
};

export default function Tracker() {
  const {
    config,
    domains,
    items,
    interviews,
    cas,
    casMode,
    loading,
    loaded,
    error,
    load,
    loadCas,
    setCasMode,
  } = useTrackerStore();

  const [tab, setTab] = useState<Tab>('items');
  const [editing, setEditing] = useState<TrackerItem | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [reflecting, setReflecting] = useState<TrackerItem | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [showTerminal, setShowTerminal] = useState(false);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (casMode) loadCas();
  }, [casMode, loadCas]);

  // Tabs differ per lens; snap back to items when the current one disappears.
  const tabs: Array<{ id: Tab; label: string }> = casMode
    ? [
        { id: 'items', label: 'Items' },
        { id: 'coverage', label: 'Coverage' },
        { id: 'balance', label: 'Balance' },
        { id: 'interviews', label: 'Interviews' },
      ]
    : [
        { id: 'items', label: 'Items' },
        { id: 'lot', label: 'Parking lot' },
        { id: 'log', label: 'Decisions' },
      ];

  useEffect(() => {
    if (!tabs.some((t) => t.id === tab)) setTab('items');
  }, [casMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const lensItems = useMemo(
    () => (casMode ? items.filter((i) => i.casStrands.length > 0) : items),
    [items, casMode],
  );

  const visible = useMemo(
    () =>
      showTerminal
        ? lensItems
        : lensItems.filter((i) => i.status !== 'DONE' && i.status !== 'DROPPED'),
    [lensItems, showTerminal],
  );

  const active = visible.filter((i) => i.status === 'ACTIVE');
  const rest = visible.filter((i) => i.status !== 'ACTIVE');

  /** Per-domain groups, in the user's configured order, Unsorted last. */
  const domainGroups = useMemo(() => {
    const groups = domains.map((d) => ({
      key: d.id,
      name: d.name,
      color: d.color,
      items: rest.filter((i) => i.domainId === d.id),
    }));
    const unsorted = rest.filter((i) => i.domainId === null);
    if (unsorted.length > 0) {
      groups.push({ key: 'unsorted', name: 'Unsorted', color: '#64748b', items: unsorted });
    }
    return groups.filter((g) => g.items.length > 0);
  }, [domains, rest]);

  /** Strand groups for the CAS lens. A two-strand item shows under both. */
  const strandGroups = useMemo(
    () =>
      CAS_STRANDS.map((s) => ({
        key: s,
        name: STRAND_LABEL[s],
        color: STRAND_COLOR[s],
        items: rest.filter((i) => i.casStrands.includes(s)),
      })).filter((g) => g.items.length > 0),
    [rest],
  );

  const groups = casMode ? strandGroups : domainGroups;
  const conflicts = useMemo(() => items.filter(hasCourseworkConflict), [items]);
  const used = cappedActive(items);

  const toggleGroup = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const openNew = () => {
    setEditing(null);
    setSheetOpen(true);
  };

  const openEdit = (item: TrackerItem) => {
    setEditing(item);
    setSheetOpen(true);
  };

  if (error) {
    return (
      <div className="mx-auto max-w-2xl p-5">
        <div className="rounded-(--radius-card) border p-5" style={{ borderColor: 'rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.08)' }}>
          <h2 className="font-bold text-red-200">Could not load the tracker</h2>
          <p className="mt-1 text-sm text-red-300/80">{error}</p>
          <button
            type="button"
            onClick={() => load()}
            className="mt-3 rounded-lg px-4 py-2 text-sm font-bold"
            style={{ background: 'var(--color-primary)', color: '#fff' }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!config || (loading && !loaded)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center" style={{ color: 'var(--color-muted)' }}>
        Loading the tracker…
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4 pb-28">
      {/* Page chrome: lens toggle and the two sibling screens. */}
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-extrabold">{casMode ? 'CAS' : 'Tracker'}</h1>
          <div className="flex items-center gap-2">
            <Link
              to="/tracker/markdown"
              aria-label="Export and import markdown"
              className="grid h-10 w-10 place-items-center rounded-full border text-base"
              style={{ borderColor: 'var(--color-border)', background: 'rgba(255,255,255,0.04)' }}
            >
              ⇅
            </Link>
            <Link
              to="/tracker/presets"
              aria-label="Presets"
              className="grid h-10 w-10 place-items-center rounded-full border text-base"
              style={{ borderColor: 'var(--color-border)', background: 'rgba(255,255,255,0.04)' }}
            >
              ⚙
            </Link>
          </div>
        </div>

        {/* CAS lens. Never changes what a write is allowed to do. */}
        <button
          type="button"
          role="switch"
          aria-checked={casMode}
          onClick={() => setCasMode(!casMode)}
          className="flex items-center justify-between gap-3 rounded-(--radius-card) border px-3.5 py-2.5"
          style={{
            borderColor: casMode ? 'rgba(34,197,94,0.45)' : 'var(--color-border)',
            background: casMode ? 'rgba(34,197,94,0.08)' : 'var(--color-surface)',
          }}
        >
          <span className="text-left">
            <span className="block text-sm font-bold">CAS mode</span>
            <span className="block text-xs" style={{ color: 'var(--color-muted)' }}>
              {casMode ? 'Showing CAS items by strand' : 'A lens — it never changes your data'}
            </span>
          </span>
          <span
            className="relative h-7 w-12 shrink-0 rounded-full transition-colors"
            style={{ background: casMode ? 'var(--color-green)' : 'rgba(255,255,255,0.14)' }}
          >
            <motion.span
              layout
              transition={{ type: 'spring', stiffness: 500, damping: 34 }}
              className="absolute top-1 h-5 w-5 rounded-full bg-white"
              style={{ left: casMode ? 26 : 4 }}
            />
          </span>
        </button>

        {/* Cap usage — hidden under the CAS lens, which is cap-exempt anyway. */}
        {!casMode && (
          <div
            className="rounded-(--radius-card) border px-3.5 py-2.5"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>
                Active
              </span>
              <span className="text-sm font-bold" style={{ color: used >= config.activeCap ? 'var(--color-fire)' : 'var(--color-primary)' }}>
                {used} / {config.activeCap}
              </span>
            </div>
            <div className="mt-2 flex gap-1">
              {Array.from({ length: config.activeCap }, (_, i) => (
                <span
                  key={i}
                  className="h-1.5 flex-1 rounded-full"
                  style={{
                    background: i < used ? 'var(--color-primary)' : 'rgba(255,255,255,0.08)',
                  }}
                />
              ))}
            </div>
            {used >= config.activeCap && (
              <p className="mt-1.5 text-xs" style={{ color: 'var(--color-fire)' }}>
                Cap reached — complete, drop or block something to start anything new.
              </p>
            )}
          </div>
        )}
      </header>

      <ReviewBanner config={config} />

      {/* Coursework conflicts: persistent while unresolved, but never blocking. */}
      {conflicts.length > 0 && (
        <div
          className="rounded-(--radius-card) border p-3.5"
          style={{ borderColor: 'rgba(239,68,68,0.45)', background: 'rgba(239,68,68,0.08)' }}
        >
          <p className="text-sm font-bold" style={{ color: '#fca5a5' }}>
            {conflicts.length} item{conflicts.length > 1 ? 's' : ''} double-counted with coursework
          </p>
          <p className="mt-1 text-xs leading-snug" style={{ color: 'var(--color-muted)' }}>
            CAS may not double-count with DP coursework. Each flagged card below offers the two
            ways out: {conflicts.map((c) => c.code).join(', ')}
          </p>
        </div>
      )}

      {/* Tabs */}
      <nav className="flex gap-1.5 overflow-x-auto pb-0.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className="shrink-0 rounded-full px-3.5 py-2 text-sm font-semibold transition-colors"
            style={{
              background: tab === t.id ? 'var(--color-primary)' : 'rgba(255,255,255,0.05)',
              color: tab === t.id ? '#fff' : 'var(--color-muted)',
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'items' && (
        <div className="flex flex-col gap-5">
          {lensItems.length === 0 ? (
            <p className="py-10 text-center text-sm" style={{ color: 'var(--color-muted)' }}>
              {casMode
                ? 'No CAS-tagged items yet. Tag an item with a strand to see it here.'
                : 'Nothing tracked yet. Add your first item below.'}
            </p>
          ) : (
            <>
              {/* Active, pinned above everything regardless of grouping. */}
              {active.length > 0 && (
                <section className="flex flex-col gap-2.5">
                  <h2 className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--color-primary)' }}>
                    Active now · {active.length}
                  </h2>
                  <AnimatePresence initial={false}>
                    {active.map((item) => (
                      <TrackerItemCard
                        key={item.id}
                        item={item}
                        config={config}
                        casMode={casMode}
                        onEdit={openEdit}
                        onReflect={setReflecting}
                      />
                    ))}
                  </AnimatePresence>
                </section>
              )}

              {groups.map((group) => {
                const isCollapsed = collapsed.has(group.key);
                return (
                  <section key={group.key} className="flex flex-col gap-2.5">
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.key)}
                      aria-expanded={!isCollapsed}
                      className="flex items-center justify-between gap-3 rounded-lg py-1.5 text-left"
                    >
                      <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: group.color }} />
                        <span style={{ color: group.color }}>{group.name}</span>
                        <span style={{ color: 'var(--color-muted)' }}>{group.items.length}</span>
                      </span>
                      <span style={{ color: 'var(--color-muted)' }}>{isCollapsed ? '▸' : '▾'}</span>
                    </button>

                    {!isCollapsed && (
                      <AnimatePresence initial={false}>
                        {group.items.map((item) => (
                          <TrackerItemCard
                            key={item.id}
                            item={item}
                            config={config}
                            casMode={casMode}
                            onEdit={openEdit}
                            onReflect={setReflecting}
                          />
                        ))}
                      </AnimatePresence>
                    )}
                  </section>
                );
              })}
            </>
          )}

          <button
            type="button"
            onClick={() => setShowTerminal((v) => !v)}
            className="self-center rounded-full px-4 py-2 text-xs font-semibold"
            style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--color-muted)' }}
          >
            {showTerminal ? 'Hide done & dropped' : 'Show done & dropped'}
          </button>
        </div>
      )}

      {tab === 'lot' && <ParkingLot domains={domains} />}
      {tab === 'log' && <DecisionLog />}

      {tab === 'coverage' &&
        (cas ? (
          <CasMatrix matrix={cas.matrix} />
        ) : (
          <p className="py-10 text-center text-sm" style={{ color: 'var(--color-muted)' }}>
            Loading coverage…
          </p>
        ))}

      {tab === 'balance' &&
        (cas ? (
          <CasBalance balance={cas.balance} showHours={config.showHours} />
        ) : (
          <p className="py-10 text-center text-sm" style={{ color: 'var(--color-muted)' }}>
            Loading balance…
          </p>
        ))}

      {tab === 'interviews' && <CasInterviews interviews={interviews} />}

      {/* New item — bottom-right, clear of the nav bar and under the thumb. */}
      {tab === 'items' && (
        <button
          type="button"
          onClick={openNew}
          aria-label="New item"
          className="fixed bottom-20 right-4 z-30 grid h-14 w-14 place-items-center rounded-full text-2xl font-bold shadow-[0_6px_24px_rgba(139,92,246,0.45)]"
          style={{ background: 'var(--color-primary)', color: '#fff' }}
        >
          +
        </button>
      )}

      <TrackerItemSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        editing={editing}
        config={config}
        domains={domains}
        defaultCas={casMode}
      />

      <ReflectionSheet
        open={reflecting !== null}
        onClose={() => setReflecting(null)}
        item={reflecting ? (items.find((i) => i.id === reflecting.id) ?? reflecting) : null}
      />
    </div>
  );
}
