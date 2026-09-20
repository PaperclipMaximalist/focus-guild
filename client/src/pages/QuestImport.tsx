/**
 * Bulk quest import: paste a list, get quests.
 *
 * Each line is parsed with the same grammar as the Today quick-add bar
 * (`lib/quickAdd.ts`), so there is one syntax to learn and the preview here
 * cannot disagree with what the bar would make. Blank lines and common list
 * markers ("- ", "* ", "1. ") are ignored, because most pasted lists have them.
 *
 * The preview is the safety rail: nothing is created until you can see every
 * row, and the server writes them in one transaction so a bad line can't leave
 * half an import behind.
 */

import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { parseQuickAdd, type QuickAddParse } from '../lib/quickAdd';
import { sfxClick } from '../lib/sfx';
import { useQuestStore } from '../store/useQuestStore';
import { useToastStore } from '../components/Toasts';
import { fieldClass, fieldStyle } from '../components/tracker/Sheet';
import { ArrowLeft, ListPlus, TriangleAlert } from 'lucide-react';

const MAX = 100;
const muted = { color: 'var(--color-muted)' };
const card = { borderColor: 'var(--color-border)', background: 'var(--color-surface)' };

const EXAMPLE = `Finish chem IA analysis 2h by fri #chem !high
Read two history sources 45m by mon #history
Email the CAS coordinator 10m #cas
Maths past paper 1.5h by wed !high`;

/** Strip bullets and numbering so a pasted list works as-is. */
function cleanLine(raw: string): string {
  return raw.replace(/^\s*(?:[-*•–]|\d+[.)])\s+/, '').trim();
}

interface Row {
  line: number;
  raw: string;
  parsed: QuickAddParse;
}

export default function QuestImport() {
  const navigate = useNavigate();
  const pushToast = useToastStore((s) => s.push);
  const loadQuests = useQuestStore((s) => s.load);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const rows = useMemo<Row[]>(() => {
    const now = new Date();
    return text
      .split('\n')
      .map((raw, i) => ({ line: i + 1, raw: cleanLine(raw) }))
      .filter((r) => r.raw.length > 0)
      .map((r) => ({ ...r, parsed: parseQuickAdd(r.raw, now) }));
  }, [text]);

  const usable = rows.filter((r) => r.parsed.title.trim().length > 0);
  const skipped = rows.length - usable.length;
  const tooMany = usable.length > MAX;

  const doImport = async () => {
    setBusy(true);
    try {
      const res = await api.quests.import(
        usable.map((r) => ({
          title: r.parsed.title,
          ...(r.parsed.estimatedMinutes ? { estimatedMinutes: r.parsed.estimatedMinutes } : {}),
          ...(r.parsed.deadline ? { deadline: r.parsed.deadline } : {}),
          ...(r.parsed.priorityTier ? { priorityTier: r.parsed.priorityTier } : {}),
          ...(r.parsed.tags.length ? { tags: r.parsed.tags } : {}),
        })),
      );
      await loadQuests();
      sfxClick();
      pushToast({
        title: `${res.created} quest${res.created === 1 ? '' : 's'} added`,
        sub: 'Regenerate the Feed to schedule them',
        icon: ListPlus,
        variant: 'xp',
      });
      navigate('/quests');
    } catch (err) {
      pushToast({
        title: 'Nothing was imported',
        sub: String(err).replace(/^ApiRequestError:\s*/, ''),
        icon: TriangleAlert,
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4 pb-32">
      <header className="flex items-center gap-3">
        <Link
          to="/quests"
          aria-label="Back to quests"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-md border"
          style={{ borderColor: 'var(--color-border)', background: 'rgba(255,255,255,0.04)' }}
        >
          <ArrowLeft size={18} aria-hidden />
        </Link>
        <div>
          <h1 className="text-2xl font-extrabold leading-tight">Import quests</h1>
          <p className="text-xs" style={muted}>
            One quest per line, same shorthand as quick-add
          </p>
        </div>
      </header>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={EXAMPLE}
        aria-label="Quests to import, one per line"
        spellCheck={false}
        className={`${fieldClass} min-h-48 font-mono text-[13px] leading-relaxed`}
        style={fieldStyle}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setText(EXAMPLE)}
          disabled={text.trim().length > 0}
          className="rounded-full border px-3 py-1 text-xs font-semibold disabled:opacity-40"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}
        >
          Paste an example
        </button>
        <span className="text-xs" style={muted}>
          <b>2h</b> or <b>45m</b> duration · <b>by fri</b> deadline · <b>!high</b> priority · <b>#tag</b>
        </span>
      </div>

      {rows.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-bold uppercase tracking-wide" style={muted}>
            Preview — {usable.length} quest{usable.length === 1 ? '' : 's'}
            {skipped > 0 && `, ${skipped} line${skipped === 1 ? '' : 's'} skipped`}
          </h2>

          <ul className="flex flex-col divide-y rounded-(--radius-card) border" style={card}>
            {rows.slice(0, 120).map((r) => {
              const ok = r.parsed.title.trim().length > 0;
              return (
                <li key={r.line} className="flex gap-3 px-3 py-2 text-sm" style={{ borderColor: 'var(--color-border)' }}>
                  <span className="w-6 shrink-0 pt-0.5 text-right font-mono text-[11px] tabular-nums" style={muted}>
                    {r.line}
                  </span>
                  <span className="min-w-0 flex-1">
                    {ok ? (
                      <>
                        <span className="block break-words font-semibold">{r.parsed.title}</span>
                        {r.parsed.chips.length > 0 && (
                          <span className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px]" style={muted}>
                            {r.parsed.chips.map((chip, i) => (
                              <span key={i} className="flex items-center gap-1">
                                <chip.icon size={11} aria-hidden />
                                {chip.label}
                              </span>
                            ))}
                          </span>
                        )}
                      </>
                    ) : (
                      <span style={{ color: 'var(--color-gold)' }}>
                        Skipped — nothing left after the shorthand: “{r.raw}”
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>

          {rows.length > 120 && (
            <p className="text-xs" style={muted}>
              Showing the first 120 lines.
            </p>
          )}

          {tooMany && (
            <p className="rounded-(--radius-card) border p-3 text-sm" style={{ ...card, color: 'var(--color-gold)' }}>
              That's {usable.length} quests. Import at most {MAX} at a time — split the list and run it twice.
            </p>
          )}
        </section>
      )}

      <button
        type="button"
        onClick={doImport}
        disabled={busy || usable.length === 0 || tooMany}
        className="rounded-xl py-3 text-sm font-bold disabled:opacity-40"
        style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}
      >
        {busy ? 'Importing…' : `Import ${usable.length || ''} quest${usable.length === 1 ? '' : 's'}`.trim()}
      </button>

      <p className="text-xs leading-snug" style={muted}>
        Everything lands as an active quest with a 30-minute estimate unless a duration says otherwise. Nothing is
        scheduled until you regenerate the Feed. Either the whole list imports or none of it does.
      </p>
    </div>
  );
}
