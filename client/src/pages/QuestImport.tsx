/**
 * Bulk quest import: paste a manifest, get quests.
 *
 * Each line is parsed with the same grammar as the Jot bar on Today
 * (`lib/quickAdd.ts`), so there is one syntax to learn and the preview here
 * cannot disagree with what the bar would make. The page around the lines
 * (steps by indent, hour logs, quoted titles, comments) is `lib/manifest.ts`.
 * A line can set everything the quest editor can; only the title is required.
 *
 * The preview is the safety rail: nothing is created until you can see every
 * row, and the server writes them in one transaction so a bad line can't leave
 * half an import behind.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { aiApi, manifestApi } from '../lib/api';
import { MANIFEST_EXAMPLE, MANIFEST_FONT, MANIFEST_PARAMETERS, MAX_IMPORT, manifestBody, manifestGuide, parseManifest, type ManifestQuest } from '../lib/manifest';
import { findDuplicate, titleKey } from '../lib/duplicates';
import { sfxClick } from '../lib/sfx';
import { useQuestStore } from '../store/useQuestStore';
import { useToastStore } from '../components/Toasts';
import { ArrowLeft, Bot, Check, ChevronDown, Copy, CornerDownRight, ListPlus, TriangleAlert } from 'lucide-react';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What a tree of quests will create, counted the way `parseManifest` counts its own. */
function countTree(quests: ManifestQuest[]) {
  const c = { quests: 0, steps: 0, hourLogs: 0, routines: 0, total: 0 };
  const steps = (list: ManifestQuest[] | undefined) => {
    for (const q of list ?? []) {
      c.steps += 1;
      c.total += 1;
      steps(q.steps);
    }
  };
  for (const q of quests) {
    c.total += 1;
    if (q.trackHours) c.hourLogs += 1;
    else if (q.isRecurring) c.routines += 1;
    else c.quests += 1;
    steps(q.steps);
  }
  return c;
}

export default function QuestImport() {
  const navigate = useNavigate();
  const pushToast = useToastStore((s) => s.push);
  const loadQuests = useQuestStore((s) => s.load);
  const loadRecurring = useQuestStore((s) => s.loadRecurring);
  const activeQuests = useQuestStore((s) => s.quests);
  const rounds = useQuestStore((s) => s.recurring);
  const [leaveOut, setLeaveOut] = useState(true);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [copied, setCopied] = useState(false);
  // The AI the person connected, if any: it can write the list from their notes.
  const [ai, setAi] = useState<string | null | undefined>(undefined);
  const [showAi, setShowAi] = useState(false);
  const [notes, setNotes] = useState('');
  const [writing, setWriting] = useState(false);
  const [wrote, setWrote] = useState<string | null>(null);

  // The lists to compare against: make sure they are there.
  useEffect(() => {
    void loadQuests();
    void loadRecurring();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  }, []);

  useEffect(() => {
    let live = true;
    aiApi
      .get()
      .then((s) => live && setAi(s.inUse))
      .catch(() => live && setAi(null));
    return () => {
      live = false;
    };
  }, []);

  const writeWithAi = async () => {
    setWriting(true);
    setWrote(null);
    try {
      const res = await aiApi.writeManifest(notes.trim(), manifestGuide());
      const body = manifestBody(res.text);
      // Added under whatever is already in the box, never over it.
      setText((t) => (t.trim() ? `${t.replace(/\s+$/, '')}\n\n${body}` : body));
      setWrote(res.via);
      setShowAi(false);
      sfxClick();
    } catch (err) {
      pushToast({
        title: 'The AI did not write a list',
        sub: String(err).replace(/^\w*Error:\s*/, '').replace(/^[A-Z_]+:\s*/, ''),
        icon: TriangleAlert,
        variant: 'error',
      });
    } finally {
      setWriting(false);
    }
  };

  const copyGuide = async () => {
    try {
      await navigator.clipboard.writeText(manifestGuide());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      pushToast({ title: 'Could not copy', sub: 'The browser blocked the clipboard', icon: TriangleAlert, variant: 'error' });
    }
  };

  const parsed = useMemo(() => parseManifest(text), [text]);
  const { rows } = parsed;

  // Top-level quests already on the list, or repeated earlier in this paste. Rows share their
  // quest object with the tree, so a row is tied to its node by identity; steps go with their parent.
  // `repeatTops` are the ones that only repeat a line of this paste: they are told apart in the
  // preview, because "already on your list" would not be true of them.
  const { dupTops, repeatTops } = useMemo(() => {
    const known = [...activeQuests, ...rounds];
    const seen = new Set<string>();
    const dups = new Set<ManifestQuest>();
    const repeats = new Set<ManifestQuest>();
    for (const q of parsed.quests) {
      const key = titleKey(q.title);
      if (!key) continue;
      if (findDuplicate(q.title, known)) dups.add(q);
      else if (seen.has(key)) {
        dups.add(q);
        repeats.add(q);
      } else seen.add(key);
    }
    return { dupTops: dups, repeatTops: repeats };
  }, [parsed.quests, activeQuests, rounds]);
  const dupLines = useMemo(() => {
    const lines = new Set<number>();
    let inDup = false;
    for (const r of rows) {
      if (r.tier === 1) inDup = r.quest !== null && dupTops.has(r.quest);
      if (r.quest && inDup) lines.add(r.line);
    }
    return lines;
  }, [rows, dupTops]);
  const leaving = leaveOut && dupTops.size > 0;
  const toImport = useMemo(
    () => (leaving ? parsed.quests.filter((q) => !dupTops.has(q)) : parsed.quests),
    [leaving, parsed.quests, dupTops],
  );
  const counts = useMemo(() => (leaving ? countTree(toImport) : parsed.counts), [leaving, toImport, parsed.counts]);
  const allThere = leaving && toImport.length === 0;
  // Each title once, however many times it was written.
  const leftOutTitles = [
    ...new Map(parsed.quests.filter((q) => dupTops.has(q)).map((q) => [titleKey(q.title), q.title])).values(),
  ];

  const skipped = rows.filter((r) => r.skipped).length;
  const warned = rows.filter((r) => r.warnings.length > 0 && !(leaving && dupLines.has(r.line))).length;
  const tooMany = counts.total > MAX_IMPORT;
  // The parser's "too many" note counts the whole paste; once duplicates are out it may no longer hold.
  const pageNotes = tooMany ? parsed.notes : parsed.notes.filter((n) => !n.startsWith('That is '));

  // "12 quests, 5 steps, 1 hour log and 2 rounds", with only the parts there are.
  const summary = [
    counts.quests > 0 && plural(counts.quests, 'quest'),
    counts.steps > 0 && plural(counts.steps, 'step'),
    counts.hourLogs > 0 && plural(counts.hourLogs, 'hour log'),
    counts.routines > 0 && plural(counts.routines, 'round'),
  ].filter((s): s is string => typeof s === 'string');

  const doImport = async () => {
    setBusy(true);
    try {
      const res = await manifestApi.import(toImport);
      await Promise.all([loadQuests(), counts.routines > 0 ? loadRecurring() : null]);
      sfxClick();
      pushToast({
        title: `${plural(res.created, 'quest')} added`,
        sub: res.steps > 0 ? `${plural(res.steps, 'step')} among them. Reroute to give them a time` : 'Reroute to give them a time',
        icon: ListPlus,
        variant: 'xp',
      });
      navigate('/quests');
    } catch (err) {
      pushToast({
        title: 'Nothing was imported',
        sub: String(err).replace(/^\w*Error:\s*/, ''),
        icon: TriangleAlert,
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page flex flex-col gap-4">
      <header>
        <Link to="/quests" className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-(--color-muted) hover:text-(--color-text)">
          <ArrowLeft size={14} aria-hidden /> Quests
        </Link>
        <h1 className="page-title">Import quests</h1>
        <p className="mt-1.5 text-sm text-(--color-muted)">
          One quest per line. Indent a line to make it a step of the quest above. Only the title is required.
        </p>
      </header>

      {ai && (
        <section className="panel">
          <button
            type="button"
            onClick={() => setShowAi((v) => !v)}
            aria-expanded={showAi}
            className="flex w-full items-center gap-3 px-4 py-3 text-left"
          >
            <Bot size={18} aria-hidden className="shrink-0 text-(--color-muted)" />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold">Have your AI write the list</span>
              <span className="block truncate text-[13px] text-(--color-muted)">From your notes, by {ai}</span>
            </span>
            <ChevronDown size={16} aria-hidden className="shrink-0 text-(--color-muted)" style={{ transform: showAi ? 'rotate(180deg)' : undefined }} />
          </button>
          {showAi && (
            <div className="flex flex-col gap-3 border-t border-(--color-border) px-4 py-4">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Say what is on your plate, or paste a syllabus, an email or a to-do list as it is. Mention deadlines if you know them."
                aria-label="Notes for your AI to turn into quests"
                maxLength={20000}
                className="form-input min-h-36 text-[15px] leading-relaxed"
              />
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <button type="button" onClick={writeWithAi} disabled={writing || notes.trim().length < 3} className="btn-strong disabled:opacity-40">
                  {writing ? 'Writing…' : 'Write the list'}
                </button>
                <p className="min-w-0 flex-1 basis-56 text-[13px] leading-snug text-(--color-muted)">
                  Your notes go to that AI and nowhere else. What comes back lands in the box below for you to check;
                  nothing is created yet.
                </p>
              </div>
            </div>
          )}
        </section>
      )}
      {ai === null && (
        <p className="text-[13px] text-(--color-muted)">
          <Link to="/advanced/ai" className="underline underline-offset-2">Connect an AI</Link> and it can write this
          list from your notes.
        </p>
      )}
      {wrote && (
        <p className="flex items-start gap-2 text-[13px] text-(--color-muted)" aria-live="polite">
          <Bot size={14} aria-hidden className="mt-0.5 shrink-0" />
          Written by {wrote}. Read the preview before importing: an AI can misjudge a duration or invent a deadline.
        </p>
      )}

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // Tab indents here: it is how a step is written.
          if (e.key !== 'Tab' || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
          e.preventDefault();
          const el = e.currentTarget;
          const { selectionStart: a, selectionEnd: b } = el;
          setText(`${text.slice(0, a)}  ${text.slice(b)}`);
          requestAnimationFrame(() => el.setSelectionRange(a + 2, a + 2));
        }}
        placeholder={MANIFEST_EXAMPLE}
        aria-label="Quests to import, one per line"
        spellCheck={false}
        // A wrapped line would look like a new one with no indent, and indent is what makes a step.
        wrap="off"
        className="form-input min-h-56 text-[13px] leading-relaxed"
        style={{ fontFamily: MANIFEST_FONT }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setText(MANIFEST_EXAMPLE)} disabled={text.trim().length > 0} className="btn-quiet disabled:opacity-40">
          Paste an example
        </button>
        <button type="button" onClick={() => setShowGuide((v) => !v)} aria-expanded={showGuide} className="btn-quiet">
          Everything a line can set
          <ChevronDown size={14} aria-hidden style={{ transform: showGuide ? 'rotate(180deg)' : undefined }} />
        </button>
        <button type="button" onClick={copyGuide} className="btn-quiet">
          {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
          {copied ? 'Copied' : 'Copy the guide for an AI'}
        </button>
      </div>

      {showGuide && (
        <section className="panel px-4 py-3">
          <p className="text-[13px] leading-snug text-(--color-muted)">
            Put any of these after the title, in any order. Anything you leave out keeps its default. If a title
            itself contains one of them, put the title in "double quotes". A line that starts with // is a comment.
          </p>
          <dl className="rows mt-2 text-[13px]">
            {MANIFEST_PARAMETERS.map((p) => (
              <div key={p.token} className="flex gap-3 py-2">
                <dt className="w-28 shrink-0 text-[12.5px] font-bold" style={{ fontFamily: MANIFEST_FONT }}>{p.token}</dt>
                <dd className="min-w-0 flex-1">
                  <span className="font-semibold">{p.means}</span>
                  <span className="text-(--color-muted)"> · {p.values}</span>
                  <span className="block text-(--color-muted)">Left out: {p.fallback}</span>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {rows.length > 0 && (
        <section className="flex flex-col gap-2" aria-live="polite">
          <h2 className="section-label">
            Preview: {allThere ? 'Everything here is already on your list' : summary.length > 0 ? summary.join(', ') : 'nothing to import'}
            {skipped > 0 && `, ${plural(skipped, 'line')} left out`}
          </h2>

          {pageNotes.map((note) => (
            <p key={note} className="panel flex items-start gap-2 px-4 py-3 text-sm" style={{ color: 'var(--color-gold)' }}>
              <TriangleAlert size={15} aria-hidden className="mt-0.5 shrink-0" />
              {note}
            </p>
          ))}

          {dupTops.size > 0 && (
            <div className="panel px-4 py-3 text-sm">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={leaveOut}
                  onChange={(e) => setLeaveOut(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-(--color-primary)"
                />
                <span>
                  Leave out the {dupTops.size} {repeatTops.size > 0 ? 'already on your list or written twice here' : 'already on your list'}
                </span>
              </label>
              <p className="mt-1.5 pl-7 text-[13px] leading-snug text-(--color-muted)">
                {leftOutTitles.slice(0, 5).join(', ')}
                {leftOutTitles.length > 5 && ` and ${leftOutTitles.length - 5} more`}
              </p>
            </div>
          )}

          <ul className="panel rows overflow-hidden">
            {rows.slice(0, 250).map((r) => (
              <li key={r.line} className="flex gap-3 px-4 py-2.5 text-sm">
                <span className="tnum w-6 shrink-0 pt-0.5 text-right text-[12px] text-(--color-muted)" title={`Line ${r.line}`}>
                  {r.line}
                </span>
                <span className="flex min-w-0 flex-1 gap-1.5" style={{ paddingLeft: (r.tier - 1) * 18 }}>
                  {r.tier > 1 && <CornerDownRight size={14} aria-label="Step of the quest above" className="mt-0.5 shrink-0 text-(--color-muted)" />}
                  <span className="min-w-0 flex-1">
                    {r.quest && leaving && dupLines.has(r.line) ? (
                      <>
                        <span className="block break-words text-(--color-muted) line-through">{r.quest.title}</span>
                        <span className="mt-0.5 flex items-start gap-1 text-[12px] text-(--color-muted)">
                          <TriangleAlert size={11} aria-hidden className="mt-0.5 shrink-0" />
                          {r.tier > 1
                            ? 'left out with the quest above'
                            : repeatTops.has(r.quest)
                              ? 'written twice in this list'
                              : 'already on your list'}
                        </span>
                      </>
                    ) : r.quest ? (
                      <>
                        <span className={`block break-words ${r.tier === 1 ? 'font-semibold' : ''}`}>{r.quest.title}</span>
                        {r.chips.length > 0 && (
                          <span className="mt-0.5 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[12px] text-(--color-muted)">
                            {r.chips.map((chip, i) => (
                              <span key={i} className="flex items-center gap-1">
                                <chip.icon size={11} aria-hidden />
                                {chip.label}
                              </span>
                            ))}
                          </span>
                        )}
                        {r.warnings.map((w) => (
                          <span key={w} className="mt-0.5 flex items-start gap-1 text-[12px]" style={{ color: 'var(--color-gold)' }}>
                            <TriangleAlert size={11} aria-hidden className="mt-0.5 shrink-0" />
                            {w}
                          </span>
                        ))}
                      </>
                    ) : (
                      <>
                        <span className="block break-words text-(--color-muted) line-through">{r.raw}</span>
                        <span className="mt-0.5 flex items-start gap-1 text-[12px]" style={{ color: 'var(--color-gold)' }}>
                          <TriangleAlert size={11} aria-hidden className="mt-0.5 shrink-0" />
                          {r.skipped}
                        </span>
                      </>
                    )}
                  </span>
                </span>
              </li>
            ))}
          </ul>

          {rows.length > 250 && <p className="text-[13px] text-(--color-muted)">Showing the first 250 lines.</p>}
        </section>
      )}

      <button type="button" onClick={doImport} disabled={busy || counts.total === 0 || tooMany || allThere} className="btn-primary min-h-11">
        {busy ? 'Importing…' : counts.total === 0 ? 'Import' : `Import ${plural(counts.total, 'quest')}`}
      </button>

      <p className="text-[13px] leading-snug text-(--color-muted)">
        Nothing is given a time until you reroute. Either the whole list imports or none of it does.
        {warned > 0 && ` ${warned === 1 ? '1 line has' : `${warned} lines have`} a note above: those parts were left at their default.`}
      </p>
    </div>
  );
}
