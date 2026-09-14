/**
 * Chronicle: what happened, who I am, and one bundle for an AI.
 *
 *   Log        the activity log, newest day first, with a journal box
 *   Permafile  the slow-changing truth, versioned so every edit is reversible
 *   AI bundle  permafile + tracker + log as one paste-able document
 *
 * The log is written by the server as a side effect of real actions, so this
 * page only reads it (plus journal entries typed here).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, type ActivityEntry, type PermafileState } from '../lib/api';
import { sfxClick } from '../lib/sfx';
import { useToastStore } from '../components/Toasts';
import { fieldClass, fieldStyle } from '../components/tracker/Sheet';
import { Clipboard, Download, History, PenLine, RotateCcw, Save, ScrollText, Sparkles, TriangleAlert } from 'lucide-react';

type Tab = 'log' | 'permafile' | 'bundle';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'log', label: 'Log' },
  { id: 'permafile', label: 'Permafile' },
  { id: 'bundle', label: 'AI bundle' },
];

const RANGES = [7, 30, 90] as const;

const muted = { color: 'var(--color-muted)' };
const card = { borderColor: 'var(--color-border)', background: 'var(--color-surface)' };

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayHeading(key: string): string {
  const today = dayKey(new Date().toISOString());
  const yesterday = dayKey(new Date(Date.now() - 86_400_000).toISOString());
  if (key === today) return 'Today';
  if (key === yesterday) return 'Yesterday';
  return new Date(`${key}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function downloadText(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Chronicle() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'log') as Tab;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 p-4 pb-32">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold leading-tight">
          <ScrollText size={22} aria-hidden /> Chronicle
        </h1>
        <p className="text-xs" style={muted}>
          What happened, who you are, and one bundle to hand an AI
        </p>
      </header>

      <div role="tablist" className="grid grid-cols-3 gap-1 rounded-xl border p-1" style={card}>
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setParams(t.id === 'log' ? {} : { tab: t.id }, { replace: true })}
            className="rounded-lg py-2 text-sm font-bold transition-colors"
            style={
              tab === t.id
                ? { background: 'var(--color-primary)', color: 'var(--color-on-primary)' }
                : { color: 'var(--color-muted)' }
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'log' && <LogTab />}
      {tab === 'permafile' && <PermafileTab />}
      {tab === 'bundle' && <BundleTab />}
    </div>
  );
}

// ─── Log ──────────────────────────────────────────────────────────────────────

function LogTab() {
  const pushToast = useToastStore((s) => s.push);
  const [days, setDays] = useState<number>(7);
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setEntries(await api.chronicle.log(days));
    } catch (err) {
      setError(String(err));
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = useMemo(() => {
    const m = new Map<string, ActivityEntry[]>();
    for (const e of entries ?? []) {
      const k = dayKey(e.at);
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    return [...m.entries()];
  }, [entries]);

  const addJournal = async () => {
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    try {
      const entry = await api.chronicle.journal(t);
      setEntries((prev) => [entry, ...(prev ?? [])]);
      setText('');
      sfxClick();
    } catch (err) {
      pushToast({ title: 'Could not save', sub: String(err), icon: TriangleAlert, variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addJournal()}
          placeholder="Write a line in the journal…"
          maxLength={2000}
          className={fieldClass}
          style={fieldStyle}
        />
        <button
          type="button"
          onClick={addJournal}
          disabled={busy || !text.trim()}
          aria-label="Add journal entry"
          className="grid w-12 shrink-0 place-items-center rounded-lg disabled:opacity-40"
          style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}
        >
          <PenLine size={18} aria-hidden />
        </button>
      </div>

      <RangePicker value={days} onChange={setDays} />

      {error && (
        <p className="rounded-(--radius-card) border p-3 text-sm" style={card}>
          Couldn't load the log. {error}
        </p>
      )}

      {!entries && !error && (
        <div className="flex flex-col gap-2" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-(--radius-card)" style={{ background: 'var(--color-surface)' }} />
          ))}
        </div>
      )}

      {entries && entries.length === 0 && (
        <p className="rounded-(--radius-card) border p-4 text-center text-sm" style={{ ...card, ...muted }}>
          Nothing logged in the last {days} days yet. Completing quests, moving tracker items, checking in and
          journaling all land here.
        </p>
      )}

      {grouped.map(([key, list]) => (
        <div key={key} className="flex flex-col gap-1.5">
          <h2 className="text-xs font-bold uppercase tracking-wide" style={muted}>
            {dayHeading(key)}
          </h2>
          <ul className="flex flex-col divide-y rounded-(--radius-card) border" style={{ ...card, borderColor: 'var(--color-border)' }}>
            {list.map((e) => (
              <li key={e.id} className="flex gap-3 px-3 py-2.5 text-sm" style={{ borderColor: 'var(--color-border)' }}>
                <time className="shrink-0 pt-px font-mono text-xs tabular-nums" style={muted} dateTime={e.at}>
                  {new Date(e.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                </time>
                <span className="min-w-0 break-words leading-snug">{e.line}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

// ─── Permafile ────────────────────────────────────────────────────────────────

function PermafileTab() {
  const pushToast = useToastStore((s) => s.push);
  const [state, setState] = useState<PermafileState | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [showVersions, setShowVersions] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.chronicle.permafile();
      setState(data);
      setDraft(data.body);
    } catch (err) {
      pushToast({ title: 'Could not load the permafile', sub: String(err), icon: TriangleAlert, variant: 'error' });
    }
  }, [pushToast]);

  useEffect(() => {
    load();
  }, [load]);

  if (!state) {
    return <div className="h-72 animate-pulse rounded-(--radius-card)" style={{ background: 'var(--color-surface)' }} />;
  }

  // A never-saved template is "dirty" so the first Save is always possible.
  const dirty = state.isTemplate || draft !== state.body;

  const save = async () => {
    setBusy(true);
    try {
      await api.chronicle.savePermafile(draft);
      await load();
      sfxClick();
      pushToast({ title: 'Permafile saved', sub: 'Earlier versions are kept', icon: Save, variant: 'xp' });
    } catch (err) {
      pushToast({ title: 'Could not save', sub: String(err), icon: TriangleAlert, variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const restore = async (id: string) => {
    setBusy(true);
    try {
      await api.chronicle.restorePermafile(id);
      await load();
      pushToast({ title: 'Version restored', sub: 'Saved as the newest version', icon: RotateCcw, variant: 'xp' });
    } catch (err) {
      pushToast({ title: 'Could not restore', sub: String(err), icon: TriangleAlert, variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <p className="text-xs leading-snug" style={muted}>
        The slow-changing truth about you: who you are, what this season is about, your rules, and how an AI should
        talk to you. It goes first in every AI bundle.
        {state.isTemplate && ' This is a starter template. Fill it in and save.'}
      </p>

      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        spellCheck
        maxLength={20_000}
        aria-label="Permafile"
        className={`${fieldClass} min-h-[55vh] font-mono text-[13px] leading-relaxed`}
        style={fieldStyle}
      />

      <div className="flex items-center gap-2">
        <span className="font-mono text-xs tabular-nums" style={muted}>
          {draft.length.toLocaleString()} / 20,000
        </span>
        <span className="flex-1" />
        {!state.isTemplate && draft !== state.body && (
          <button type="button" onClick={() => setDraft(state.body)} className="rounded-lg px-3 py-2 text-sm font-semibold" style={muted}>
            Discard
          </button>
        )}
        <button
          type="button"
          onClick={save}
          disabled={busy || !dirty}
          className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-40"
          style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}
        >
          <Save size={16} aria-hidden /> {busy ? 'Saving…' : 'Save'}
        </button>
      </div>

      {state.versions.length > 0 && (
        <div className="rounded-(--radius-card) border" style={card}>
          <button
            type="button"
            onClick={() => setShowVersions((v) => !v)}
            aria-expanded={showVersions}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-sm font-semibold"
          >
            <History size={16} aria-hidden /> Versions ({state.versions.length})
          </button>
          {showVersions && (
            <ul className="flex flex-col border-t" style={{ borderColor: 'var(--color-border)' }}>
              {state.versions.map((v, i) => (
                <li key={v.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    {new Date(v.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    <span className="ml-2 text-xs" style={muted}>
                      {v.chars.toLocaleString()} chars{v.source === 'restore' ? ' · restored' : ''}
                    </span>
                  </span>
                  {i === 0 ? (
                    <span className="text-xs font-semibold" style={{ color: 'var(--color-primary)' }}>
                      Current
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => restore(v.id)}
                      disabled={busy}
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold disabled:opacity-40"
                      style={{ background: 'rgba(255,255,255,0.06)' }}
                    >
                      <RotateCcw size={12} aria-hidden /> Restore
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

// ─── AI bundle ────────────────────────────────────────────────────────────────

function BundleTab() {
  const pushToast = useToastStore((s) => s.push);
  const [days, setDays] = useState<number>(7);
  const [bundle, setBundle] = useState<{ markdown: string; chars: number; entries: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setBundle(null);
    setError(null);
    api.chronicle
      .bundle(days)
      .then((b) => live && setBundle(b))
      .catch((err) => live && setError(String(err)));
    return () => {
      live = false;
    };
  }, [days]);

  const copy = async () => {
    if (!bundle) return;
    try {
      await navigator.clipboard.writeText(bundle.markdown);
      sfxClick();
      pushToast({ title: 'Bundle copied', sub: 'Paste it into Claude and ask away', icon: Sparkles, variant: 'xp' });
    } catch {
      pushToast({ title: 'Clipboard blocked', sub: 'Select the text below and copy it manually', icon: TriangleAlert, variant: 'error' });
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <p className="text-xs leading-snug" style={muted}>
        Your permafile, your tracker, and the log for the chosen range, in one document. Copy it into Claude and ask
        things like "why did I fall behind this week?" or "draft my weekly review".
      </p>

      <RangePicker value={days} onChange={setDays} />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={copy}
          disabled={!bundle}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold disabled:opacity-40"
          style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}
        >
          <Clipboard size={16} aria-hidden /> Copy bundle
        </button>
        <button
          type="button"
          onClick={() => bundle && downloadText(bundle.markdown, `focus-guild-bundle-${dayKey(new Date().toISOString())}.md`)}
          disabled={!bundle}
          aria-label="Download bundle"
          className="grid w-12 place-items-center rounded-xl border disabled:opacity-40"
          style={card}
        >
          <Download size={18} aria-hidden />
        </button>
      </div>

      {bundle && (
        <p className="font-mono text-xs tabular-nums" style={muted}>
          {bundle.chars.toLocaleString()} chars · ~{Math.ceil(bundle.chars / 4).toLocaleString()} tokens · {bundle.entries} log entries
        </p>
      )}
      {error && (
        <p className="rounded-(--radius-card) border p-3 text-sm" style={card}>
          Couldn't build the bundle. {error}
        </p>
      )}
      {!bundle && !error && <div className="h-72 animate-pulse rounded-(--radius-card)" style={{ background: 'var(--color-surface)' }} />}
      {bundle && (
        <pre
          className="max-h-[55vh] overflow-auto whitespace-pre-wrap break-words rounded-(--radius-card) border p-3 font-mono text-[12px] leading-relaxed"
          style={card}
        >
          {bundle.markdown}
        </pre>
      )}
    </section>
  );
}

function RangePicker({ value, onChange }: { value: number; onChange: (d: number) => void }) {
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="Range">
      {RANGES.map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => onChange(d)}
          aria-pressed={value === d}
          className="rounded-full border px-3 py-1 text-xs font-semibold"
          style={{
            borderColor: value === d ? 'var(--color-primary)' : 'var(--color-border)',
            color: value === d ? 'var(--color-text)' : 'var(--color-muted)',
            background: value === d ? 'color-mix(in srgb, var(--color-primary) 16%, transparent)' : 'transparent',
          }}
        >
          {d} days
        </button>
      ))}
    </div>
  );
}
