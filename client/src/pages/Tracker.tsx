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
import { CAS_STRANDS, type TrackerItem } from '../lib/api';
import { STRAND_COLOR, STRAND_LABEL } from '../lib/tracker';
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
import { ArrowDownUp, ChevronDown, ChevronRight, Drama, MapIcon, SlidersHorizontal, TriangleAlert } from 'lucide-react';

type Tab = 'items' | 'lot' | 'log' | 'coverage' | 'balance' | 'interviews';

const COLLAPSED_KEY = 'fg.tracker.collapsed';

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
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]') as string[]);
    } catch {
      return new Set();
    }
  });
  const [showTerminal, setShowTerminal] = useState(false);
  const [jumpTarget, setJumpTarget] = useState<string | null>(null);

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

  const terminalCount = lensItems.length - lensItems.filter((i) => i.status !== 'DONE' && i.status !== 'DROPPED').length;
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
      groups.push({ key: 'unsorted', name: 'Unsorted', color: '#8A8478', items: unsorted });
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

  // Persist from one place, so every path that changes it (toggle or jump) sticks.
  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed]));
    } catch {
      // Non-fatal — collapse state just won't survive a reload.
    }
  }, [collapsed]);

  /** Open whatever hides a card (collapsed group, done filter), then land on it. */
  const jumpTo = (item: TrackerItem) => {
    setTab('items');
    if (item.status === 'DONE' || item.status === 'DROPPED') setShowTerminal(true);
    const keys = [item.domainId ?? 'unsorted', ...item.casStrands];
    setCollapsed((prev) => new Set([...prev].filter((k) => !keys.includes(k))));
    setJumpTarget(item.code);
  };

  // Scroll only after React has committed the reopened group — a timer
  // guessing at render timing finds no card and silently does nothing.
  useEffect(() => {
    if (!jumpTarget) return;
    const el = document.getElementById(`item-${jumpTarget}`);
    setJumpTarget(null);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.animate(
      [{ outline: '2px solid color-mix(in srgb, var(--color-fire) 90%, transparent)' }, { outline: '2px solid color-mix(in srgb, var(--color-fire) 0%, transparent)' }],
      { duration: 1400, easing: 'ease-out' },
    );
  }, [jumpTarget, collapsed, showTerminal, tab]);

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
        <div className="rounded-(--radius-card) border p-5" style={{ borderColor: 'color-mix(in srgb, var(--color-fire) 40%, transparent)', background: 'color-mix(in srgb, var(--color-fire) 8%, transparent)' }}>
          <h2 className="font-bold text-(--color-fire)">Could not load the tracker</h2>
          <p className="mt-1 text-sm text-(--color-muted)">{error}</p>
          <button
            type="button"
            onClick={() => load()}
            className="mt-3 rounded-lg px-4 py-2 text-sm font-bold"
            style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!config || (loading && !loaded)) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-3 p-4" aria-busy="true" aria-label="Loading the tracker">
        <div className="h-8 w-32 animate-pulse rounded-lg" style={{ background: 'var(--color-surface)' }} />
        <div className="h-14 animate-pulse rounded-(--radius-card)" style={{ background: 'var(--color-surface)' }} />
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-32 animate-pulse rounded-(--radius-card)"
            style={{ background: 'var(--color-surface)', animationDelay: `${i * 120}ms` }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4 pb-28">
      {/* Page chrome, kept to two short rows so the first item is on screen
          without scrolling: title + cap, then the lens switch and the two
          sibling screens. */}
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-extrabold leading-tight">{casMode ? 'CAS' : 'Tracker'}</h1>
            {casMode ? (
              <p className="truncate text-xs" style={{ color: 'var(--color-muted)' }}>
                Grouped by strand
              </p>
            ) : (
              // Cap usage — hidden under the CAS lens, which is cap-exempt anyway.
              <p
                className="text-xs font-semibold"
                style={{ color: used >= config.activeCap ? 'var(--color-fire)' : 'var(--color-muted)' }}
              >
                {used >= config.activeCap ? 'Cap reached · ' : ''}
                {used} of {config.activeCap} active
              </p>
            )}
          </div>

          {/* CAS lens. Never changes what a write is allowed to do. */}
          <button
            type="button"
            role="switch"
            aria-checked={casMode}
            aria-label="CAS mode"
            onClick={() => setCasMode(!casMode)}
            className="flex h-10 shrink-0 items-center gap-2 rounded-md border pl-3 pr-1.5 text-xs font-bold"
            style={{
              borderColor: casMode ? 'color-mix(in srgb, var(--color-green) 50%, transparent)' : 'var(--color-border)',
              background: casMode ? 'color-mix(in srgb, var(--color-green) 12%, transparent)' : 'rgba(255,255,255,0.04)',
              color: casMode ? 'var(--color-green)' : 'var(--color-muted)',
            }}
          >
            CAS
            <span
              className="relative h-6 w-10 rounded-full transition-colors"
              style={{ background: casMode ? 'var(--color-green)' : 'rgba(255,255,255,0.14)' }}
            >
              <motion.span
                layout
                transition={{ type: 'spring', stiffness: 500, damping: 34 }}
                className="absolute top-1 h-4 w-4 rounded-full bg-white"
                style={{ left: casMode ? 20 : 4 }}
              />
            </span>
          </button>
          <Link
            to="/tracker/markdown"
            aria-label="Export and import markdown"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-md border text-base"
            style={{ borderColor: 'var(--color-border)', background: 'rgba(255,255,255,0.04)' }}
          >
            <ArrowDownUp size={18} aria-hidden />
          </Link>
          <Link
            to="/tracker/presets"
            aria-label="Presets"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-md border text-base"
            style={{ borderColor: 'var(--color-border)', background: 'rgba(255,255,255,0.04)' }}
          >
            <SlidersHorizontal size={18} aria-hidden />
          </Link>
        </div>

        {!casMode && (
          <div className="flex gap-1" aria-hidden>
            {Array.from({ length: config.activeCap }, (_, i) => (
              <span
                key={i}
                className="h-1 flex-1 rounded-full transition-colors"
                style={{
                  background:
                    i < used
                      ? used >= config.activeCap
                        ? 'var(--color-fire)'
                        : 'var(--color-primary)'
                      : 'rgba(255,255,255,0.08)',
                }}
              />
            ))}
          </div>
        )}
      </header>

      {items.length > 0 && <ReviewBanner config={config} />}

      {/* Coursework conflicts: persistent while unresolved, but never blocking.
          Each code jumps to its card, where the two-button fix lives. */}
      {conflicts.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-(--radius-card) border px-3.5 py-2.5"
          style={{ borderColor: 'color-mix(in srgb, var(--color-fire) 45%, transparent)', background: 'color-mix(in srgb, var(--color-fire) 10%, transparent)' }}
        >
          <span className="text-xs font-bold" style={{ color: 'var(--color-fire)' }}>
            <span className="inline-flex items-center gap-1.5"><TriangleAlert size={13} aria-hidden /> Counted as CAS and coursework</span>
          </span>
          {conflicts.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => jumpTo(c)}
              className="rounded-md px-2.5 py-1 font-mono text-xs font-bold"
              style={{ background: 'color-mix(in srgb, var(--color-fire) 20%, transparent)', color: 'var(--color-fire)' }}
            >
              {c.code} →
            </button>
          ))}
        </div>
      )}

      {/* Tabs — equal-width segments, so four CAS tabs fit a phone without
          spilling into a scroll strip. */}
      <nav className="flex gap-1 rounded-lg p-1" style={{ background: 'rgba(255,255,255,0.04)' }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-pressed={tab === t.id}
            className="min-w-0 flex-1 truncate rounded-md px-2 py-2 text-[13px] font-semibold transition-colors"
            style={{
              background: tab === t.id ? 'var(--color-primary)' : 'transparent',
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
            <div
              className="flex flex-col items-center gap-3 rounded-(--radius-card) border border-dashed px-6 py-10 text-center"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <span className="text-4xl" aria-hidden>
                {casMode ? <Drama size={40} strokeWidth={1.5} aria-hidden /> : <MapIcon size={40} strokeWidth={1.5} aria-hidden />}
              </span>
              <div>
                <p className="font-bold">{casMode ? 'No CAS experiences yet' : 'Chart your long quests'}</p>
                <p className="mt-1 text-sm leading-snug" style={{ color: 'var(--color-muted)' }}>
                  {casMode
                    ? 'Tag any item with a strand and it appears here, grouped by strand.'
                    : 'Projects and commitments that outlive a single day. Each one gets a code and a physical next step.'}
                </p>
              </div>
              <button
                type="button"
                onClick={openNew}
                className="mt-1 rounded-md px-5 py-2.5 text-sm font-bold"
                style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}
              >
                + {casMode ? 'Add a CAS item' : 'Add your first item'}
              </button>
              {!casMode && (
                <button
                  type="button"
                  onClick={() => setTab('lot')}
                  className="text-xs underline"
                  style={{ color: 'var(--color-muted)' }}
                >
                  Not sure yet? Park a thought instead
                </button>
              )}
            </div>
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
                      <span style={{ color: 'var(--color-muted)' }}>{isCollapsed ? <ChevronRight size={18} aria-hidden /> : <ChevronDown size={18} aria-hidden />}</span>
                    </button>

                    {!isCollapsed && (
                      <AnimatePresence initial={false}>
                        {group.items.map((item) => (
                          <TrackerItemCard
                            key={item.id}
                            item={item}
                            config={config}
                            casMode={casMode}
                            showDomain={false}
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

          {terminalCount > 0 && (
            <button
              type="button"
              onClick={() => setShowTerminal((v) => !v)}
              className="self-center rounded-md px-4 py-2 text-xs font-semibold"
              style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--color-muted)' }}
            >
              {showTerminal ? 'Hide' : 'Show'} {terminalCount} done & dropped
            </button>
          )}
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
      {tab === 'items' && lensItems.length > 0 && (
        <button
          type="button"
          onClick={openNew}
          aria-label="New item"
          className="fixed bottom-20 right-4 z-30 grid h-14 w-14 place-items-center rounded-lg text-2xl font-bold transition-transform active:scale-95"
          style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}
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
