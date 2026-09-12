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
 * at them. Deleting one therefore does not delete its items; they lose the
 * link and land in Unsorted.
 *
 * Reordering uses buttons rather than drag-and-drop. Dragging a list on a
 * phone fights the page scroll, and the whole tracker is built to be usable
 * one-handed.
 */

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  TRACKER_STATUSES,
  type TrackerConfigShape,
  type TrackerOverrides,
  type TrackerStatus,
} from '../lib/api';
import { useTrackerStore } from '../store/useTrackerStore';
import { useToastStore } from '../components/Toasts';
import { fieldClass, fieldStyle, Label } from '../components/tracker/Sheet';

const SWATCHES = ['#8b5cf6', '#22c55e', '#f59e0b', '#3b82f6', '#ef4444', '#14b8a6', '#ec4899', '#64748b'];

export default function TrackerPresets() {
  const {
    config,
    domains,
    loaded,
    load,
    saveConfig,
    resetConfig,
    createDomain,
    updateDomain,
    deleteDomain,
    reorderDomains,
  } = useTrackerStore();
  const pushToast = useToastStore((s) => s.push);
  const fileRef = useRef<HTMLInputElement>(null);

  const [draft, setDraft] = useState<TrackerConfigShape | null>(null);
  const [newDomain, setNewDomain] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  // Seed the draft once config arrives; edits stay local until Save.
  useEffect(() => {
    if (config && !draft) setDraft(structuredClone(config));
  }, [config, draft]);

  if (!draft) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center" style={{ color: 'var(--color-muted)' }}>
        Loading presets…
      </div>
    );
  }

  const patch = (fields: Partial<TrackerConfigShape>) =>
    setDraft((prev) => (prev ? { ...prev, ...fields } : prev));

  const save = async () => {
    setBusy(true);
    try {
      // The server takes a whole preset set, which is also what import posts.
      await saveConfig(draft as TrackerOverrides);
      pushToast({ title: 'Presets saved', sub: 'Applied everywhere', icon: '⚙️', variant: 'xp' });
    } catch (err) {
      pushToast({ title: 'Could not save', sub: String(err), icon: '⚠️', variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    try {
      await resetConfig();
      setDraft(null);
      pushToast({ title: 'Back to defaults', sub: 'Your overrides were cleared', icon: '↩️', variant: 'xp' });
    } catch (err) {
      pushToast({ title: 'Could not reset', sub: String(err), icon: '⚠️', variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  /** Presets travel as their own JSON file, separate from the item markdown. */
  const exportPresets = () => {
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' });
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
      setDraft((prev) => (prev ? { ...prev, ...parsed } : prev));
      pushToast({
        title: 'Presets loaded',
        sub: 'Review them, then Save to apply',
        icon: '📥',
        variant: 'xp',
      });
    } catch (err) {
      pushToast({ title: 'Could not read that file', sub: String(err), icon: '⚠️', variant: 'error' });
    }
  };

  const move = (index: number, delta: number) => {
    const next = [...domains];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    reorderDomains(next.map((d) => d.id));
  };

  const addDomain = async () => {
    const name = newDomain.trim();
    if (!name) return;
    try {
      await createDomain({ name, color: SWATCHES[domains.length % SWATCHES.length] });
      setNewDomain('');
    } catch (err) {
      pushToast({ title: 'Could not add', sub: String(err), icon: '⚠️', variant: 'error' });
    }
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4 pb-28">
      <header className="flex items-center gap-3">
        <Link
          to="/tracker"
          aria-label="Back to tracker"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border text-base"
          style={{ borderColor: 'var(--color-border)', background: 'rgba(255,255,255,0.04)' }}
        >
          ←
        </Link>
        <h1 className="text-2xl font-extrabold">Presets</h1>
      </header>

      {/* ── Domains ─────────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>
            Domains
          </h2>
          <p className="mt-1 text-xs" style={{ color: 'var(--color-muted)' }}>
            Saved immediately — these are records, not settings. Deleting one keeps its items and
            moves them to Unsorted.
          </p>
        </div>

        <ul className="flex flex-col gap-2">
          {domains.map((d, i) => (
            <li
              key={d.id}
              className="rounded-(--radius-card) border p-3"
              style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
            >
              <div className="flex items-center gap-2">
                <input
                  value={d.name}
                  onChange={(e) =>
                    useTrackerStore.setState({
                      domains: domains.map((x) => (x.id === d.id ? { ...x, name: e.target.value } : x)),
                    })
                  }
                  onBlur={(e) => {
                    const name = e.target.value.trim();
                    if (name && name !== d.name) updateDomain(d.id, { name });
                  }}
                  aria-label={`Name of ${d.name}`}
                  className={fieldClass}
                  style={fieldStyle}
                />
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label={`Move ${d.name} up`}
                  className="grid h-10 w-9 shrink-0 place-items-center rounded-lg disabled:opacity-25"
                  style={{ background: 'rgba(255,255,255,0.06)' }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === domains.length - 1}
                  aria-label={`Move ${d.name} down`}
                  className="grid h-10 w-9 shrink-0 place-items-center rounded-lg disabled:opacity-25"
                  style={{ background: 'rgba(255,255,255,0.06)' }}
                >
                  ↓
                </button>
              </div>

              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                {SWATCHES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => updateDomain(d.id, { color: c })}
                    aria-label={`Colour ${d.name} ${c}`}
                    className="h-7 w-7 rounded-full"
                    style={{
                      background: c,
                      outline: d.color.toLowerCase() === c ? '2px solid var(--color-text)' : 'none',
                      outlineOffset: 2,
                    }}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => deleteDomain(d.id)}
                  className="ml-auto rounded-full px-3 py-1.5 text-xs font-semibold"
                  style={{ background: 'rgba(239,68,68,0.12)', color: '#fca5a5' }}
                >
                  Delete
                </button>
              </div>
            </li>
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

      {/* ── Active cap ──────────────────────────────────────────────────── */}
      <section>
        <Label hint="CAS-tagged items are exempt and never count toward this.">
          Active cap — {draft.activeCap}
        </Label>
        <input
          type="range"
          min={1}
          max={20}
          value={draft.activeCap}
          onChange={(e) => patch({ activeCap: Number(e.target.value) })}
          className="w-full"
        />
      </section>

      {/* ── Status labels ───────────────────────────────────────────────── */}
      <section>
        <Label hint="The five states themselves are fixed — only what you call them changes.">
          Status labels
        </Label>
        <div className="flex flex-col gap-2">
          {TRACKER_STATUSES.map((s: TrackerStatus) => (
            <div key={s} className="flex items-center gap-2">
              <span
                className="w-20 shrink-0 text-xs font-bold uppercase"
                style={{ color: 'var(--color-muted)' }}
              >
                {s.toLowerCase()}
              </span>
              <input
                value={draft.statusLabels[s]}
                onChange={(e) =>
                  patch({ statusLabels: { ...draft.statusLabels, [s]: e.target.value } })
                }
                aria-label={`Label for ${s}`}
                className={fieldClass}
                style={fieldStyle}
              />
            </div>
          ))}
        </div>
      </section>

      {/* ── Code prefixes ───────────────────────────────────────────────── */}
      <section>
        <Label hint="Comma-separated. The first is used by default; numbers are assigned for you and never reused.">
          Code prefixes
        </Label>
        <input
          value={draft.codePrefixes.join(', ')}
          onChange={(e) =>
            patch({
              codePrefixes: e.target.value
                .split(',')
                .map((p) => p.trim())
                .filter(Boolean),
            })
          }
          className={fieldClass}
          style={fieldStyle}
        />
      </section>

      {/* ── Required fields ─────────────────────────────────────────────── */}
      <section>
        <Label>Required fields</Label>
        <div className="flex flex-col gap-2.5">
          {(
            [
              ['nextActionForActive', 'A next action before an item can go Active'],
              ['domain', 'A domain on every item'],
              ['dueDate', 'A due date on every item'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={draft.requiredFields[key]}
                onChange={(e) =>
                  patch({ requiredFields: { ...draft.requiredFields, [key]: e.target.checked } })
                }
                className="h-5 w-5 shrink-0"
              />
              {label}
            </label>
          ))}
        </div>
      </section>

      {/* ── Review cadence ──────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <div>
          <Label hint="Produces a banner on the tracker listing these prompts. No notifications.">
            Review every {draft.reviewCadenceDays} day{draft.reviewCadenceDays === 1 ? '' : 's'}
          </Label>
          <input
            type="range"
            min={1}
            max={60}
            value={draft.reviewCadenceDays}
            onChange={(e) => patch({ reviewCadenceDays: Number(e.target.value) })}
            className="w-full"
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
                    patch({
                      reviewPrompts: draft.reviewPrompts.map((p, j) => (j === i ? e.target.value : p)),
                    })
                  }
                  aria-label={`Review prompt ${i + 1}`}
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
            className="mt-0.5 h-5 w-5 shrink-0"
          />
          <span>
            Track hours on CAS items
            <span className="mt-0.5 block text-xs" style={{ color: 'var(--color-muted)' }}>
              Off by default — IB requires no hour counting. Switch it on only if your school
              imposes its own quota.
            </span>
          </span>
        </label>
      </section>

      {/* ── Preset set as a file ────────────────────────────────────────── */}
      <section className="flex flex-col gap-2">
        <Label hint="Separate from the item markdown — this is just the settings.">
          Preset set
        </Label>
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

      {/* Sticky actions — reachable without scrolling back up. */}
      <div
        className="sticky bottom-20 flex gap-2 rounded-xl border p-2"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface2)' }}
      >
        <button
          type="button"
          onClick={reset}
          disabled={busy}
          className="rounded-lg px-4 py-3 text-sm font-semibold"
          style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--color-muted)' }}
        >
          Defaults
        </button>
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="flex-1 rounded-lg py-3 text-sm font-bold disabled:opacity-40"
          style={{ background: 'var(--color-primary)', color: '#fff' }}
        >
          {busy ? 'Saving…' : 'Save presets'}
        </button>
      </div>
    </div>
  );
}
