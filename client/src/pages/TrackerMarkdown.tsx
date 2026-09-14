/**
 * Markdown export / import.
 *
 * Exports are always current — there is no generate step to run first, so the
 * four tier buttons can show real character counts up front and the user picks
 * a size rather than discovering it afterwards. Compact copies straight to the
 * clipboard because that tier exists to be pasted somewhere immediately.
 *
 * Import never applies anything until it has been previewed and confirmed, and
 * the preview spells out the one rule that makes round-tripping safe: a field
 * absent from a document means "not asserted", not "clear it", and an item
 * absent from the document is left alone rather than deleted.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ExportTier, ImportDiff } from '../lib/api';
import { api } from '../lib/api';
import { useTrackerStore } from '../store/useTrackerStore';
import { useToastStore } from '../components/Toasts';
import { fieldClass, fieldStyle, Label } from '../components/tracker/Sheet';
import { sfxClick, sfxComplete } from '../lib/sfx';
import { ArrowLeft, Clipboard, Download, Inbox, TriangleAlert, Upload } from 'lucide-react';

const TIERS: Array<{ id: ExportTier; label: string; blurb: string }> = [
  { id: 'compact', label: 'Compact', blurb: 'Open items, one line each' },
  { id: 'working', label: 'Working', blurb: 'Adds notes and next actions' },
  { id: 'full', label: 'Full', blurb: 'Everything currently live' },
  { id: 'archive', label: 'Archive', blurb: 'Including done and dropped' },
];

function approxChars(n: number): string {
  if (n < 1000) return `${n} chars`;
  return `~${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k chars`;
}

export default function TrackerMarkdown() {
  const load = useTrackerStore((s) => s.load);
  const pushToast = useToastStore((s) => s.push);
  const fileRef = useRef<HTMLInputElement>(null);

  const [sizes, setSizes] = useState<Record<ExportTier, number> | null>(null);
  const [result, setResult] = useState<{ label: string; markdown: string } | null>(null);
  const [since, setSince] = useState('');
  const [deltaTier, setDeltaTier] = useState<ExportTier>('working');
  const [busy, setBusy] = useState(false);

  const [paste, setPaste] = useState('');
  const [diff, setDiff] = useState<ImportDiff | null>(null);
  const [applying, setApplying] = useState(false);

  const refreshSizes = useCallback(() => {
    api.tracker
      .exportSizes()
      .then((d) => setSizes(d.sizes))
      .catch((err) => pushToast({ title: 'Could not size exports', sub: String(err), icon: TriangleAlert, variant: 'error' }));
  }, [pushToast]);

  useEffect(() => {
    refreshSizes();
  }, [refreshSizes]);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      sfxClick();
      pushToast({ title: 'Copied', sub: `${text.length} characters`, icon: Clipboard, variant: 'xp' });
    } catch {
      // Clipboard permission can be refused; the text is on screen regardless.
      pushToast({
        title: 'Clipboard blocked',
        sub: 'Select the text below and copy it manually',
        icon: TriangleAlert,
        variant: 'error',
      });
    }
  };

  const download = (markdown: string, name: string) => {
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const doExport = async (tier: ExportTier, sinceIso?: string | null) => {
    setBusy(true);
    try {
      const data = await api.tracker.export(tier, sinceIso ?? null);
      const label = sinceIso ? `${tier} since ${sinceIso.slice(0, 10)}` : tier;
      setResult({ label, markdown: data.markdown });
      // Compact exists to be pasted straight into something else.
      if (tier === 'compact' && !sinceIso) await copy(data.markdown);
    } catch (err) {
      pushToast({ title: 'Export failed', sub: String(err), icon: TriangleAlert, variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const preview = async (markdown: string) => {
    setBusy(true);
    try {
      const data = await api.tracker.importPreview(markdown);
      setDiff(data.diff);
    } catch (err) {
      pushToast({ title: 'Could not read that', sub: String(err), icon: TriangleAlert, variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    setApplying(true);
    try {
      const res = await api.tracker.importApply(paste);
      await load();
      refreshSizes();
      setDiff(null);
      setPaste('');
      sfxComplete();
      pushToast({
        title: 'Import applied',
        sub: `${res.created} created · ${res.updated} updated`,
        icon: Inbox,
        variant: 'xp',
      });
    } catch (err) {
      pushToast({ title: 'Import failed', sub: String(err), icon: TriangleAlert, variant: 'error' });
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4 pb-28">
      <header className="flex items-center gap-3">
        <Link
          to="/tracker"
          aria-label="Back to tracker"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-md border text-base"
          style={{ borderColor: 'var(--color-border)', background: 'rgba(255,255,255,0.04)' }}
        >
          <ArrowLeft size={18} aria-hidden />
        </Link>
        <h1 className="text-2xl font-extrabold">Markdown</h1>
      </header>

      {/* ── Export ──────────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>
            Export
          </h2>
          <p className="mt-1 text-xs" style={{ color: 'var(--color-muted)' }}>
            Always current — nothing to generate first. Compact copies itself to the clipboard.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {TIERS.map((t) => (
            <button
              key={t.id}
              type="button"
              disabled={busy}
              onClick={() => doExport(t.id)}
              className="rounded-(--radius-card) border p-3 text-left disabled:opacity-50"
              style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
            >
              <span className="block text-sm font-bold">{t.label}</span>
              <span className="mt-0.5 block text-xs" style={{ color: 'var(--color-muted)' }}>
                {t.blurb}
              </span>
              <span className="mt-1.5 block text-xs font-semibold" style={{ color: 'var(--color-primary)' }}>
                {sizes ? approxChars(sizes[t.id]) : '…'}
              </span>
            </button>
          ))}
        </div>

        {/* Delta export — everything that changed since a date. */}
        <div
          className="rounded-(--radius-card) border p-3"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
        >
          <Label hint="Only items touched on or after this date.">Changes since</Label>
          <div className="flex flex-wrap gap-2">
            <input
              type="date"
              value={since}
              onChange={(e) => setSince(e.target.value)}
              className={`${fieldClass} flex-1`}
              style={fieldStyle}
              aria-label="Changed since date"
            />
            <select
              value={deltaTier}
              onChange={(e) => setDeltaTier(e.target.value as ExportTier)}
              className={`${fieldClass} w-32`}
              style={fieldStyle}
              aria-label="Delta export tier"
            >
              {TIERS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy || !since}
              onClick={() => doExport(deltaTier, new Date(`${since}T00:00:00`).toISOString())}
              className="rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-40"
              style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}
            >
              Export delta
            </button>
          </div>
        </div>

        {result && (
          <div
            className="rounded-(--radius-card) border p-3"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
          >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-bold capitalize">{result.label}</span>
              <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                {result.markdown.length.toLocaleString()} chars
              </span>
            </div>
            <textarea
              readOnly
              value={result.markdown}
              rows={10}
              className={`${fieldClass} font-mono text-xs`}
              style={fieldStyle}
              aria-label="Exported markdown"
            />
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => copy(result.markdown)}
                className="flex-1 rounded-lg py-2.5 text-sm font-semibold"
                style={{ background: 'color-mix(in srgb, var(--color-primary) 15%, transparent)', color: 'var(--color-primary)' }}
              >
                <span className="inline-flex items-center gap-1.5"><Clipboard size={14} aria-hidden /> Copy</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  download(result.markdown, `focus-guild-${result.label.replace(/\s+/g, '-')}.md`)
                }
                className="flex-1 rounded-lg py-2.5 text-sm font-semibold"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--color-text)' }}
              >
                <span className="inline-flex items-center gap-1.5"><Download size={14} aria-hidden /> Download</span>
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ── Import ──────────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>
            Import
          </h2>
          <p className="mt-1 text-xs leading-snug" style={{ color: 'var(--color-muted)' }}>
            Matched on item code. A field the document doesn't mention is left as it is — it is not
            treated as "clear this" — and items missing from the document are never deleted.
          </p>
        </div>

        <textarea
          value={paste}
          onChange={(e) => {
            setPaste(e.target.value);
            setDiff(null);
          }}
          rows={8}
          placeholder="Paste a tracker markdown document…"
          className={`${fieldClass} font-mono text-xs`}
          style={fieldStyle}
          aria-label="Markdown to import"
        />

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex-1 rounded-lg py-2.5 text-sm font-semibold"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--color-text)' }}
          >
            <span className="inline-flex items-center gap-1.5"><Upload size={14} aria-hidden /> Upload .md</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".md,text/markdown,text/plain"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              const text = await file.text();
              setPaste(text);
              setDiff(null);
              await preview(text);
            }}
          />
          <button
            type="button"
            disabled={busy || !paste.trim()}
            onClick={() => preview(paste)}
            className="flex-1 rounded-lg py-2.5 text-sm font-bold disabled:opacity-40"
            style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}
          >
            Preview changes
          </button>
        </div>

        {diff && <DiffPreview diff={diff} applying={applying} onApply={apply} onCancel={() => setDiff(null)} />}
      </section>
    </div>
  );
}

function DiffPreview({
  diff,
  applying,
  onApply,
  onCancel,
}: {
  diff: ImportDiff;
  applying: boolean;
  onApply: () => void;
  onCancel: () => void;
}) {
  const nothingToDo = diff.creates.length === 0 && diff.updates.length === 0;

  return (
    <div
      className="flex flex-col gap-3 rounded-(--radius-card) border p-3"
      style={{ borderColor: 'var(--color-primary)', background: 'var(--color-surface)' }}
    >
      <div className="grid grid-cols-4 gap-2 text-center">
        <Stat label="create" value={diff.creates.length} color="var(--color-green)" />
        <Stat label="update" value={diff.updates.length} color="var(--color-gold)" />
        <Stat label="same" value={diff.unchanged.length} color="var(--color-muted)" />
        <Stat label="untouched" value={diff.untouched.length} color="var(--color-muted)" />
      </div>

      {diff.warnings.length > 0 && (
        <div
          className="rounded-lg border p-2.5"
          style={{ borderColor: 'color-mix(in srgb, var(--color-gold) 40%, transparent)', background: 'color-mix(in srgb, var(--color-gold) 8%, transparent)' }}
        >
          <p className="text-xs font-bold" style={{ color: 'var(--color-gold)' }}>
            {diff.warnings.length} line{diff.warnings.length > 1 ? 's' : ''} could not be read
          </p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {diff.warnings.slice(0, 5).map((w, i) => (
              <li key={i} className="font-mono text-[11px]" style={{ color: 'var(--color-muted)' }}>
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {diff.creates.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-xs font-bold uppercase" style={{ color: 'var(--color-green)' }}>
            New items
          </h3>
          <ul className="flex flex-col gap-1">
            {diff.creates.map((c) => (
              <li key={c.code} className="text-xs">
                <span className="font-mono font-bold" style={{ color: 'var(--color-primary)' }}>
                  {c.code}
                </span>{' '}
                {c.title}
              </li>
            ))}
          </ul>
        </div>
      )}

      {diff.updates.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-xs font-bold uppercase" style={{ color: 'var(--color-gold)' }}>
            Changed fields
          </h3>
          <ul className="flex flex-col gap-2">
            {diff.updates.map((u) => (
              <li key={u.code}>
                <span className="font-mono text-xs font-bold" style={{ color: 'var(--color-primary)' }}>
                  {u.code}
                </span>
                <ul className="mt-0.5 flex flex-col gap-0.5 pl-3">
                  {u.changes.map((ch) => (
                    <li key={ch.field} className="text-xs" style={{ color: 'var(--color-muted)' }}>
                      <span style={{ color: 'var(--color-text)' }}>{ch.field}</span>{' '}
                      <span className="line-through opacity-60">{fmt(ch.from)}</span> →{' '}
                      <span style={{ color: 'var(--color-gold)' }}>{fmt(ch.to)}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}

      {diff.untouched.length > 0 && (
        <p className="text-xs leading-snug" style={{ color: 'var(--color-muted)' }}>
          {diff.untouched.length} item{diff.untouched.length > 1 ? 's are' : ' is'} in the tracker but
          not in this document. They will be left exactly as they are.
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-4 py-3 text-sm font-semibold"
          style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--color-muted)' }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onApply}
          disabled={applying || nothingToDo}
          className="flex-1 rounded-lg py-3 text-sm font-bold disabled:opacity-40"
          style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}
        >
          {applying
            ? 'Applying…'
            : nothingToDo
              ? 'Nothing to apply'
              : `Apply ${diff.creates.length + diff.updates.length} change${
                  diff.creates.length + diff.updates.length > 1 ? 's' : ''
                }`}
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg py-2" style={{ background: 'rgba(255,255,255,0.04)' }}>
      <div className="text-lg font-extrabold" style={{ color }}>
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>
        {label}
      </div>
    </div>
  );
}

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return v.slice(0, 10);
  return String(v);
}
