/**
 * Presets editor.
 *
 * Everything here is a preference, not a schema change. The five statuses in
 * particular are fixed in the database because behaviour depends on them — the
 * active cap and export filtering both branch on the status — so what this
 * page edits is their *labels*. Renaming "Blocked" to "Waiting" changes what
 * you read and nothing about what happens.
 *
 * Domains are the exception: they are rows, not settings, because items point
 * at them. They save immediately, and deleting one does not delete its items;
 * they lose the link and land in Unsorted.
 *
 * Reordering uses buttons rather than drag-and-drop. Dragging a list on a
 * phone fights the page scroll, and the whole tracker is built to be usable
 * one-handed.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  TRACKER_STATUSES,
  type TrackerConfigShape,
  type TrackerDomain,
  type TrackerOverrides,
} from '../lib/api';
import { trackerErrorToast } from '../lib/tracker';
import { sfxClick } from '../lib/sfx';
import { useTrackerStore } from '../store/useTrackerStore';
import { useToastStore } from '../components/Toasts';
import { fieldClass, fieldStyle, Label } from '../components/tracker/Sheet';

const SWATCHES = ['#8b5cf6', '#22c55e', '#f59e0b', '#3b82f6', '#ef4444', '#14b8a6', '#ec4899', '#64748b'];

/** Codes are matched by `<letters><digits>`, so a prefix must be letters only. */
const PREFIX_RE = /^[A-Za-z]{1,6}$/;

function parsePrefixes(raw: string): string[] {
  return [...new Set(raw.split(',').map((p) => p.trim()).filter(Boolean))];
}

const defaultLabel = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

export default function TrackerPresets() {
  const { config, domains, items, loaded, load, saveConfig, resetConfig, createDomain } = useTrackerStore();
  const pushToast = useToastStore((s) => s.push);
  const fileRef = useRef<HTMLInputElement>(null);

  const [draft, setDraft] = useState<TrackerConfigShape | null>(null);
  // Kept as raw text so a half-typed "A, " isn't normalised away mid-keystroke.
  const [prefixText, setPrefixText] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  // Seed the draft once config arrives; edits stay local until Save.
  useEffect(() => {
    if (config && !draft) {
      setDraft(structuredClone(config));
      setPrefixText(config.codePrefixes.join(', '));
    }
  }, [config, draft]);

  const itemCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) if (i.domainId) m.set(i.domainId, (m.get(i.domainId) ?? 0) + 1);
    return m;
  }, [items]);

  // The exact set that Save would send — also what dirty-checking compares.
  const cleaned = useMemo((): TrackerConfigShape | null => {
    if (!draft) return null;
    return {
      ...draft,
      codePrefixes: parsePrefixes(prefixText),
      statusLabels: Object.fromEntries(
        TRACKER_STATUSES.map((s) => [s, draft.statusLabels[s]?.trim() || defaultLabel(s)]),
      ) as TrackerConfigShape['statusLabels'],
      reviewPrompts: draft.reviewPrompts.map((p) => p.trim()).filter(Boolean),
    };
  }, [draft, prefixText]);

  if (!draft || !cleaned || !config) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-3 p-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-(--radius-card)" style={{ background: 'var(--color-surface)' }} />
        ))}
      </div>
    );
  }

  const badPrefixes = cleaned.codePrefixes.filter((p) => !PREFIX_RE.test(p));
  const prefixError =
    cleaned.codePrefixes.length === 0
      ? 'You need at least one prefix.'
      : badPrefixes.length > 0
        ? `Letters only (1–6): ${badPrefixes.join(', ')}`
        : null;
  const dirty = JSON.stringify(cleaned) !== JSON.stringify(config);

  const patch = (fields: Partial<TrackerConfigShape>) =>
    setDraft((prev) => (prev ? { ...prev, ...fields } : prev));

  const fail = (err: unknown) => pushToast({ ...trackerErrorToast(err), variant: 'error' });

  const save = async () => {
    if (prefixError) return;
    setBusy(true);
    try {
      // The server takes a whole preset set, which is also what import posts.
      await saveConfig(cleaned as TrackerOverrides);
      setDraft(structuredClone(cleaned));
      setPrefixText(cleaned.codePrefixes.join(', '));
      sfxClick();
      pushToast({ title: 'Presets saved', sub: 'Applied everywhere', icon: '⚙️', variant: 'xp' });
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    try {
      await resetConfig();
      setDraft(null); // re-seeds from the fresh defaults
      pushToast({ title: 'Back to defaults', sub: 'Your overrides were cleared', icon: '↩️', variant: 'xp' });
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  /** Presets travel as their own JSON file, separate from the item markdown. */
  const exportPresets = () => {
    const blob = new Blob([JSON.stringify(cleaned, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `focus-guild-presets-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importPresets = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as Partial<TrackerConfigShape>;
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('That file is not a preset set.');
      }
      // Merge over the current draft so an older file missing a newer field
      // doesn't silently blank it.
      const merged = {
        ...draft,
        ...parsed,
        statusLabels: { ...draft.statusLabels, ...(parsed.statusLabels ?? {}) },
        requiredFields: { ...draft.requiredFields, ...(parsed.requiredFields ?? {}) },
      };
      setDraft(merged);
      if (Array.isArray(parsed.codePrefixes)) setPrefixText(parsed.codePrefixes.join(', '));
      pushToast({ title: 'Presets loaded', sub: 'Review them, then Save to apply', icon: '📥', variant: 'xp' });
    } catch (err) {
      pushToast({ title: 'Could not read that file', sub: String(err), icon: '⚠️', variant: 'error' });
    }
  };

  const addDomain = async () => {
    const name = newDomain.trim();
    if (!name) return;
    try {
      await createDomain({ name, color: SWATCHES[domains.length % SWATCHES.length] });
      setNewDomain('');
      sfxClick();
    } catch (err) {
      fail(err);
    }
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-7 p-4 pb-32">
      <header className="flex items-center gap-3">
        <Link
          to="/tracker"
          aria-label="Back to tracker"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border text-base"
          style={{ borderColor: 'var(--color-border)', background: 'rgba(255,255,255,0.04)' }}
        >
          ←
        </Link>
        <div>
          <h1 className="text-2xl font-extrabold leading-tight">Presets</h1>
          <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
            How the tracker behaves for you
          </p>
        </div>
      </header>

      {/* ── Domains ─────────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <SectionHead
          title="Domains"
          hint="Saved as you go. Deleting one keeps its items and moves them to Unsorted."
        />

        <ul className="flex flex-col gap-2">
          {domains.map((d, i) => (
            <DomainRow
              key={d.id}
              domain={d}
              index={i}
              total={domains.length}
              itemCount={itemCounts.get(d.id) ?? 0}
              onError={fail}
            />
          ))}
        </ul>

        <div className="flex gap-2">
          <input
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addDomain()}
            placeholder="New domain…"
            className={fieldClass}
            style={fieldStyle}
          />
          <button
            type="button"
            onClick={addDomain}
            disabled={!newDomain.trim()}
            className="shrink-0 rounded-lg px-4 text-sm font-bold disabled:opacity-40"
            style={{ background: 'var(--color-primary)', color: '#fff' }}
          >
            Add
          </button>
        </div>
      </section>

      <Divider />

      {/* ── Active cap ──────────────────────────────────────────────────── */}
      <section>
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          <Label hint="CAS-tagged items are exempt and never count toward this.">Active cap</Label>
          <span className="text-2xl font-extrabold" style={{ color: 'var(--color-primary)' }}>
            {draft.activeCap}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Stepper label="Lower the cap" onClick={() => patch({ activeCap: Math.max(1, draft.activeCap - 1) })} disabled={draft.activeCap <= 1}>
            −
          </Stepper>
          <input
            type="range"
            min={1}
            max={20}
            value={draft.activeCap}
            onChange={(e) => patch({ activeCap: Number(e.target.value) })}
            aria-label="Active cap"
            className="flex-1 accent-(--color-primary)"
          />
          <Stepper label="Raise the cap" onClick={() => patch({ activeCap: Math.min(20, draft.activeCap + 1) })} disabled={draft.activeCap >= 20}>
            +
          </Stepper>
        </div>
      </section>

      {/* ── Status labels ───────────────────────────────────────────────── */}
      <section>
        <Label hint="The five states themselves are fixed — only what you call them changes.">
          Status labels
        </Label>
        <div className="flex flex-col gap-2">
          {TRACKER_STATUSES.map((s) => (
            <div key={s} className="flex items-center gap-2">
              <span className="w-20 shrink-0 font-mono text-[11px] font-bold uppercase" style={{ color: 'var(--color-muted)' }}>
                {s}
              </span>
              <input
                value={draft.statusLabels[s]}
                onChange={(e) => patch({ statusLabels: { ...draft.statusLabels, [s]: e.target.value } })}
                placeholder={defaultLabel(s)}
                aria-label={`Label for ${s}`}
                maxLength={40}
                className={fieldClass}
                style={fieldStyle}
              />
            </div>
          ))}
        </div>
      </section>

      {/* ── Code prefixes ───────────────────────────────────────────────── */}
      <section>
        <Label hint="Comma-separated letters. The first is the default; numbers are assigned for you and never reused.">
          Code prefixes
        </Label>
        <input
          value={prefixText}
          onChange={(e) => setPrefixText(e.target.value)}
          aria-label="Code prefixes"
          className={fieldClass}
          style={{ ...fieldStyle, borderColor: prefixError ? 'rgba(239,68,68,0.6)' : fieldStyle.borderColor }}
        />
        {prefixError ? (
          <p className="mt-1 text-xs" style={{ color: '#fca5a5' }}>
            {prefixError}
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {cleaned.codePrefixes.map((p, i) => (
              <span
                key={p}
                className="rounded px-2 py-1 font-mono text-xs font-bold"
                style={{
                  background: i === 0 ? 'rgba(139,92,246,0.22)' : 'rgba(255,255,255,0.06)',
                  color: i === 0 ? 'var(--color-primary)' : 'var(--color-muted)',
                }}
              >
                {p}1{i === 0 && <span className="ml-1 font-sans font-normal opacity-70">default</span>}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* ── Required fields ─────────────────────────────────────────────── */}
      <section>
        <Label>Required fields</Label>
        <div className="flex flex-col gap-1">
          {(
            [
              ['nextActionForActive', 'A next action before an item can go Active'],
              ['domain', 'A domain on every item'],
              ['dueDate', 'A due date on every item'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={draft.requiredFields[key]}
                onChange={(e) => patch({ requiredFields: { ...draft.requiredFields, [key]: e.target.checked } })}
                className="h-5 w-5 shrink-0 accent-(--color-primary)"
              />
              {label}
            </label>
          ))}
        </div>
      </section>

      <Divider />

      {/* ── Review cadence ──────────────────────────────────────────────── */}
      <section className="flex flex-col gap-4">
        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <Label hint="Shows a banner on the tracker listing these prompts. No notifications.">
              Review cadence
            </Label>
            <span className="shrink-0 text-sm font-bold" style={{ color: 'var(--color-gold)' }}>
              every {draft.reviewCadenceDays} day{draft.reviewCadenceDays === 1 ? '' : 's'}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {[1, 7, 14, 30].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => patch({ reviewCadenceDays: n })}
                className="rounded-full px-3.5 py-2 text-xs font-semibold"
                style={{
                  background: draft.reviewCadenceDays === n ? 'var(--color-gold)' : 'rgba(255,255,255,0.06)',
                  color: draft.reviewCadenceDays === n ? '#1a1205' : 'var(--color-muted)',
                }}
              >
                {n === 1 ? 'Daily' : n === 7 ? 'Weekly' : n === 14 ? 'Fortnightly' : 'Monthly'}
              </button>
            ))}
          </div>
          <input
            type="range"
            min={1}
            max={60}
            value={draft.reviewCadenceDays}
            onChange={(e) => patch({ reviewCadenceDays: Number(e.target.value) })}
            aria-label="Review cadence in days"
            className="mt-3 w-full accent-(--color-gold)"
          />
        </div>

        <div>
          <Label>Review prompts</Label>
          <div className="flex flex-col gap-2">
            {draft.reviewPrompts.map((prompt, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={prompt}
                  onChange={(e) =>
                    patch({ reviewPrompts: draft.reviewPrompts.map((p, j) => (j === i ? e.target.value : p)) })
                  }
                  placeholder="A question to ask yourself…"
                  aria-label={`Review prompt ${i + 1}`}
                  maxLength={280}
                  className={fieldClass}
                  style={fieldStyle}
                />
                <button
                  type="button"
                  onClick={() => patch({ reviewPrompts: draft.reviewPrompts.filter((_, j) => j !== i) })}
                  aria-label={`Remove prompt ${i + 1}`}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-lg"
                  style={{ background: 'rgba(239,68,68,0.12)', color: '#fca5a5' }}
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => patch({ reviewPrompts: [...draft.reviewPrompts, ''] })}
              className="self-start rounded-full px-3.5 py-2 text-xs font-semibold"
              style={{ background: 'rgba(139,92,246,0.15)', color: 'var(--color-primary)' }}
            >
              + Add prompt
            </button>
          </div>
        </div>
      </section>

      {/* ── Hours ───────────────────────────────────────────────────────── */}
      <section>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={draft.showHours}
            onChange={(e) => patch({ showHours: e.target.checked })}
            className="mt-0.5 h-5 w-5 shrink-0 accent-(--color-primary)"
          />
          <span>
            Track hours on CAS items
            <span className="mt-0.5 block text-xs" style={{ color: 'var(--color-muted)' }}>
              Off by default — IB requires no hour counting. Switch it on only if your school imposes
              its own quota.
            </span>
          </span>
        </label>
      </section>

      <Divider />

      {/* ── Preset set as a file ────────────────────────────────────────── */}
      <section className="flex flex-col gap-2">
        <SectionHead title="Preset file" hint="Just the settings above — item data lives in Markdown export." />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={exportPresets}
            className="flex-1 rounded-lg py-2.5 text-sm font-semibold"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--color-text)' }}
          >
            ⬇ Export JSON
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex-1 rounded-lg py-2.5 text-sm font-semibold"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--color-text)' }}
          >
            ⬆ Import JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) importPresets(file);
              e.target.value = '';
            }}
          />
        </div>
      </section>

      {/* Sticky actions — reachable without scrolling back up, and honest
          about whether there is anything to save. */}
      <div
        className={`flex items-center gap-2 rounded-xl border p-2 ${
          // Only float over the content when there's something to save; a
          // sticky "All saved" bar just covers the fields beneath it.
          dirty ? 'sticky bottom-20 shadow-[0_8px_30px_rgba(0,0,0,0.45)]' : ''
        }`}
        style={{
          borderColor: dirty ? 'rgba(139,92,246,0.55)' : 'var(--color-border)',
          background: 'var(--color-surface2)',
        }}
      >
        <button
          type="button"
          onClick={reset}
          disabled={busy}
          className="rounded-lg px-3.5 py-3 text-sm font-semibold"
          style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--color-muted)' }}
        >
          Defaults
        </button>
        <span className="flex-1 px-1 text-xs" style={{ color: dirty ? 'var(--color-gold)' : 'var(--color-muted)' }}>
          {prefixError ? 'Fix the prefixes first' : dirty ? '● Unsaved changes' : '✓ All saved'}
        </span>
        <button
          type="button"
          onClick={save}
          disabled={busy || !dirty || Boolean(prefixError)}
          className="rounded-lg px-5 py-3 text-sm font-bold transition-opacity active:opacity-70 disabled:opacity-40"
          style={{ background: 'var(--color-primary)', color: '#fff' }}
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

/** One domain: inline rename, reorder, recolour, and a two-tap delete. */
function DomainRow({
  domain,
  index,
  total,
  itemCount,
  onError,
}: {
  domain: TrackerDomain;
  index: number;
  total: number;
  itemCount: number;
  onError: (err: unknown) => void;
}) {
  const { domains, updateDomain, deleteDomain, reorderDomains } = useTrackerStore();
  const [name, setName] = useState(domain.name);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => setName(domain.name), [domain.name]);

  // Arm-then-fire rather than a dialog; disarm on its own if left alone.
  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(t);
  }, [confirming]);

  const rename = async () => {
    const next = name.trim();
    if (!next || next === domain.name) {
      setName(domain.name);
      return;
    }
    try {
      await updateDomain(domain.id, { name: next });
    } catch (err) {
      setName(domain.name); // a duplicate name 409s — put the real one back
      onError(err);
    }
  };

  const move = (delta: number) => {
    const next = [...domains];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    reorderDomains(next.map((d) => d.id)).catch(onError);
  };

  return (
    <li
      className="rounded-(--radius-card) border p-3"
      style={{
        borderColor: 'var(--color-border)',
        background: 'var(--color-surface)',
        boxShadow: `inset 3px 0 0 ${domain.color}`,
      }}
    >
      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={rename}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          aria-label={`Name of ${domain.name}`}
          maxLength={60}
          className={fieldClass}
          style={fieldStyle}
        />
        <button
          type="button"
          onClick={() => move(-1)}
          disabled={index === 0}
          aria-label={`Move ${domain.name} up`}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-lg disabled:opacity-25"
          style={{ background: 'rgba(255,255,255,0.06)' }}
        >
          ↑
        </button>
        <button
          type="button"
          onClick={() => move(1)}
          disabled={index === total - 1}
          aria-label={`Move ${domain.name} down`}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-lg disabled:opacity-25"
          style={{ background: 'rgba(255,255,255,0.06)' }}
        >
          ↓
        </button>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {SWATCHES.map((c) => {
          const selected = domain.color.toLowerCase() === c;
          return (
            <button
              key={c}
              type="button"
              onClick={() => !selected && updateDomain(domain.id, { color: c }).catch(onError)}
              aria-label={`Colour ${domain.name} ${c}`}
              aria-pressed={selected}
              className="grid h-8 w-8 place-items-center rounded-full text-xs font-bold text-white"
              style={{
                background: c,
                outline: selected ? '2px solid var(--color-text)' : 'none',
                outlineOffset: 2,
              }}
            >
              {selected ? '✓' : ''}
            </button>
          );
        })}
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
          {itemCount === 0 ? 'No items' : `${itemCount} item${itemCount === 1 ? '' : 's'}`}
        </span>
        <button
          type="button"
          onClick={() => {
            if (!confirming) return setConfirming(true);
            deleteDomain(domain.id).catch(onError);
          }}
          className="rounded-full px-3 py-2 text-xs font-semibold"
          style={{
            background: confirming ? 'var(--color-fire)' : 'rgba(239,68,68,0.12)',
            color: confirming ? '#fff' : '#fca5a5',
          }}
        >
          {confirming
            ? itemCount > 0
              ? `Delete · ${itemCount} to Unsorted`
              : 'Tap again to delete'
            : 'Delete'}
        </button>
      </div>
    </li>
  );
}

function SectionHead({ title, hint }: { title: string; hint: string }) {
  return (
    <div>
      <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>
        {title}
      </h2>
      <p className="mt-1 text-xs" style={{ color: 'var(--color-muted)', opacity: 0.8 }}>
        {hint}
      </p>
    </div>
  );
}

function Divider() {
  return <hr className="border-0 border-t" style={{ borderColor: 'var(--color-border)' }} />;
}

function Stepper({
  children,
  onClick,
  disabled,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-lg font-bold disabled:opacity-25"
      style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--color-text)' }}
    >
      {children}
    </button>
  );
}
