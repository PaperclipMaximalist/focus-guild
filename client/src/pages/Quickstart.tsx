/**
 * Quickstart: the two things that make the Guild useful on the first day.
 *
 *   1. Google Calendar. The planner has to know when you are already busy, or
 *      it plans over a lesson. Connecting is copying one link out of Google's
 *      settings; the steps are spelled out here and the link is checked the
 *      moment it is pasted (`lib/googleCalendar.ts`), because that settings
 *      page shows several addresses that look alike. The other direction, the
 *      plan shown inside Google Calendar, is one more link.
 *   2. Quests in bulk. Nobody wants to type forty quests one at a time. A
 *      manifest (`lib/manifest.ts`) is a plain list a person or an AI can
 *      write; this page hands out the guide to give the AI, links to the
 *      importer, and writes your quests back out in the same format.
 *
 * Outlook, iCloud and the inbox for other apps stay on Connections.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { API_URL, api, manifestApi, type CalendarSourceInfo, type IntegrationsState } from '../lib/api';
import { GOOGLE_SETTINGS_URL, addToGoogleUrl, checkFeedLink, isGoogleSource } from '../lib/googleCalendar';
import { MANIFEST_EXAMPLE, MANIFEST_FONT, manifestGuide, toManifest } from '../lib/manifest';
import { sfxClick } from '../lib/sfx';
import { useArmed } from '../lib/useArmed';
import { useToastStore } from '../components/Toasts';
import {
  ArrowLeft, ArrowRight, CalendarDays, Check, Copy, Download, ExternalLink, ListPlus, RefreshCw, Trash2, TriangleAlert,
} from 'lucide-react';

function ago(iso: string | null): string {
  if (!iso) return 'not synced yet';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return 'synced just now';
  if (min < 60) return `synced ${min} min ago`;
  const h = Math.round(min / 60);
  return h < 24 ? `synced ${h} h ago` : `synced ${Math.round(h / 24)} d ago`;
}

/** A name for a Google calendar from its link: the address it belongs to, when the link shows one. */
function nameFromLink(url: string, taken: string[]): string {
  let name = 'Google Calendar';
  const id = /\/calendar\/ical\/([^/]+)\//.exec(url)?.[1];
  if (id) {
    try {
      const decoded = decodeURIComponent(id);
      if (/^[^@\s]+@[^@\s]+$/.test(decoded) && !decoded.endsWith('calendar.google.com')) name = decoded;
    } catch {
      // Not valid percent-encoding: the plain name will do.
    }
  }
  if (!taken.includes(name)) return name.slice(0, 60);
  for (let n = 2; ; n += 1) {
    const next = `${name.slice(0, 56)} ${n}`;
    if (!taken.includes(next)) return next;
  }
}

/** Copy, and say so on the button itself for a moment. */
function useCopied() {
  const pushToast = useToastStore((s) => s.push);
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      sfxClick();
      setCopied(key);
      window.setTimeout(() => setCopied((k) => (k === key ? null : k)), 2000);
    } catch {
      pushToast({ title: 'Could not copy', sub: 'The browser blocked the clipboard. Select the text and copy it by hand', icon: TriangleAlert, variant: 'error' });
    }
  };
  return { copied, copy };
}

export default function Quickstart() {
  const [state, setState] = useState<IntegrationsState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setState(await api.integrations.get());
      setError(null);
    } catch (err) {
      setError(String(err).replace(/^\w*Error:\s*/, ''));
    }
  }, []);

  useEffect(() => {
    let live = true;
    api.integrations
      .get()
      .then((s) => live && setState(s))
      .catch((err) => live && setError(String(err).replace(/^\w*Error:\s*/, '')));
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="page flex flex-col gap-8">
      <header>
        <Link to="/advanced" className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-(--color-muted) hover:text-(--color-text)">
          <ArrowLeft size={14} aria-hidden /> Advanced
        </Link>
        <h1 className="page-title">Quickstart</h1>
        <p className="mt-1.5 text-sm text-(--color-muted)">
          Two things to do once: tell the planner when you are busy, and bring your quests in as a list.
        </p>
      </header>

      <section className="flex flex-col gap-3" aria-labelledby="qs-calendar">
        <SectionHead id="qs-calendar" n={1} title="Google Calendar" />
        {error && (
          <div className="panel flex items-center gap-3 px-4 py-3 text-sm">
            <span className="min-w-0 flex-1">Couldn’t load your calendars. {error}</span>
            <button type="button" onClick={load} className="btn-quiet">Try again</button>
          </div>
        )}
        {!state && !error && <div className="skeleton h-56" aria-busy="true" aria-label="Loading calendars" />}
        {state && <GoogleCalendar state={state} onChange={load} />}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="qs-quests">
        <SectionHead id="qs-quests" n={2} title="Quests in bulk" />
        <QuestsInBulk />
      </section>
    </div>
  );
}

function SectionHead({ id, n, title }: { id: string; n: number; title: string }) {
  return (
    <h2 id={id} className="section-label flex items-center gap-2.5">
      <span className="tnum grid h-6 w-6 place-items-center rounded-(--radius-md) bg-(--color-surface2) text-(--color-text)">{n}</span>
      {title}
    </h2>
  );
}

/** One numbered instruction. The number is the only decoration. */
function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 px-4 py-3.5">
      <span className="tnum w-4 shrink-0 pt-px text-(--color-muted)" aria-hidden>{n}</span>
      <div className="min-w-0 flex-1 text-sm leading-relaxed">{children}</div>
    </li>
  );
}

// ─── 1. Google Calendar ───────────────────────────────────────────────────────

function GoogleCalendar({ state, onChange }: { state: IntegrationsState; onChange: () => Promise<void> | void }) {
  const pushToast = useToastStore((s) => s.push);
  const { armed, fire } = useArmed();
  const google = state.calendars.filter((c) => isGoogleSource(c.host));
  const others = state.calendars.length - google.length;
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const check = checkFeedLink(url);
  const showSteps = google.length === 0 || adding;

  const connect = async () => {
    if (!check.ok) return;
    setBusy('add');
    try {
      const res = await api.integrations.addCalendar(nameFromLink(url, state.calendars.map((c) => c.name)), url.trim());
      setUrl('');
      setAdding(false);
      sfxClick();
      if (res.error) {
        pushToast({ title: 'Saved, but the first read failed', sub: res.error, icon: TriangleAlert, variant: 'error' });
      } else {
        pushToast({ title: 'Google Calendar connected', sub: `${res.count ?? 0} busy times found. Reroute to plan around them`, icon: CalendarDays, variant: 'xp' });
      }
      await onChange();
    } catch (err) {
      pushToast({ title: 'Could not connect', sub: String(err).replace(/^\w*Error:\s*/, ''), icon: TriangleAlert, variant: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const sync = async (cal: CalendarSourceInfo) => {
    setBusy(cal.id);
    try {
      const res = await api.integrations.syncCalendar(cal.id);
      if (res.error) pushToast({ title: 'Could not read the calendar', sub: res.error, icon: TriangleAlert, variant: 'error' });
      await onChange();
    } catch (err) {
      pushToast({ title: 'Could not read the calendar', sub: String(err).replace(/^\w*Error:\s*/, ''), icon: TriangleAlert, variant: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const remove = async (cal: CalendarSourceInfo) => {
    setBusy(cal.id);
    try {
      await api.integrations.removeCalendar(cal.id);
      await onChange();
    } catch (err) {
      pushToast({ title: 'Could not remove it', sub: String(err).replace(/^\w*Error:\s*/, ''), icon: TriangleAlert, variant: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <p className="text-sm leading-relaxed text-(--color-muted)">
        Events with a time become fixed stops on your Route, and the planner works around them. All-day events and
        ones marked free are left out. Nothing is written to your calendar.
      </p>

      {google.length > 0 && (
        <ul className="panel rows overflow-hidden">
          {google.map((cal) => (
            <li key={cal.id} className="flex items-center gap-2 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold">{cal.name}</p>
                <p className="text-[13px]" style={{ color: cal.lastError ? 'var(--color-gold)' : 'var(--color-muted)' }}>
                  {cal.lastError
                    ? `Could not be read: ${cal.lastError}`
                    : <><span className="tnum">{cal.eventCount}</span> busy {cal.eventCount === 1 ? 'time' : 'times'} · {ago(cal.lastSyncAt)}</>}
                </p>
              </div>
              <span className="status hidden sm:block" style={{ color: cal.lastError ? 'var(--color-gold)' : 'var(--color-green)' }}>
                {cal.lastError ? 'Check' : 'Connected'}
              </span>
              <button type="button" onClick={() => sync(cal)} disabled={busy !== null} className="icon-btn disabled:opacity-40" aria-label={`Read ${cal.name} again now`} title="Read again now">
                <RefreshCw size={15} aria-hidden className={busy === cal.id ? 'animate-spin' : ''} />
              </button>
              {armed === cal.id ? (
                <button type="button" onClick={() => fire(cal.id, () => remove(cal))} disabled={busy !== null} className="btn-quiet disabled:opacity-40" style={{ color: 'var(--color-fire)' }}>
                  Tap again to remove
                </button>
              ) : (
                <button type="button" onClick={() => fire(cal.id, () => remove(cal))} disabled={busy !== null} className="icon-btn disabled:opacity-40" aria-label={`Remove ${cal.name}`} title="Remove">
                  <Trash2 size={15} aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {showSteps ? (
        <ol className="panel rows overflow-hidden">
          <Step n={1}>
            <p>Open your Google Calendar settings on a computer. The phone app does not show the link.</p>
            <a href={GOOGLE_SETTINGS_URL} target="_blank" rel="noopener noreferrer" className="btn-quiet mt-2.5">
              Open Google Calendar settings <ExternalLink size={14} aria-hidden />
            </a>
          </Step>
          <Step n={2}>
            <p>
              On the left, under <b>Settings for my calendars</b>, choose the calendar. Scroll to{' '}
              <b>Integrate calendar</b> and copy <b>Secret address in iCal format</b>.
            </p>
          </Step>
          <Step n={3}>
            <label htmlFor="qs-google-link">Paste it here.</label>
            <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
              <input
                id="qs-google-link"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') connect(); }}
                placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
                inputMode="url"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                aria-describedby="qs-google-link-says"
                className="form-input min-w-0 flex-1 text-[13px]"
                style={{ fontFamily: MANIFEST_FONT }}
              />
              <button type="button" onClick={connect} disabled={!check.ok || busy !== null} className="btn-primary shrink-0">
                {busy === 'add' ? 'Connecting…' : 'Connect'}
              </button>
            </div>
            <p id="qs-google-link-says" className="mt-2 text-[13px] leading-snug" aria-live="polite" style={{ color: check.ok ? 'var(--color-muted)' : 'var(--color-gold)' }}>
              {check.ok
                ? (check.note ?? (check.google ? 'That is the right link.' : 'That is not a Google link, but any iCal link works the same way.'))
                : check.problem}
            </p>
          </Step>
        </ol>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="btn-quiet self-start">
          Connect another Google calendar
        </button>
      )}

      <p className="text-[13px] leading-snug text-(--color-muted)">
        The Guild reads the calendar again every 15 minutes. Treat the secret address like a password: anyone who has
        it can read that calendar, and Google can reset it from the same settings page.
        {others > 0 && <> You also have {others} other {others === 1 ? 'calendar' : 'calendars'} on <Link to="/connections" className="underline underline-offset-2">Connections</Link>.</>}
        {others === 0 && <> Outlook and iCloud calendars connect on <Link to="/connections" className="underline underline-offset-2">Connections</Link>.</>}
      </p>

      <PlanInGoogle enabled={state.tokenEnabled} onChange={onChange} />
    </>
  );
}

/** The other direction: the Guild's plan, shown as a calendar inside Google Calendar. */
function PlanInGoogle({ enabled, onChange }: { enabled: boolean; onChange: () => Promise<void> | void }) {
  const pushToast = useToastStore((s) => s.push);
  const { armed, fire } = useArmed();
  const { copied, copy } = useCopied();
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const feed = token ? `${API_URL}/calendar/${token}.ics` : null;

  const make = async () => {
    setBusy(true);
    try {
      const res = await api.integrations.createToken();
      setToken(res.token);
      await onChange();
    } catch (err) {
      pushToast({ title: 'Could not make the link', sub: String(err).replace(/^\w*Error:\s*/, ''), icon: TriangleAlert, variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel flex flex-col gap-3 px-4 py-3.5">
      <div>
        <h3 className="text-[15px] font-semibold">Your plan in Google Calendar</h3>
        <p className="mt-0.5 text-[13px] leading-snug text-(--color-muted)">
          The other direction: your planned blocks appear in Google Calendar beside everything else, with its
          reminders. It is one-way, so moving a block there changes nothing here, and Google looks for changes only
          every few hours.
        </p>
      </div>

      {feed ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <a href={addToGoogleUrl(feed)} target="_blank" rel="noopener noreferrer" className="btn-strong">
              Add to Google Calendar <ExternalLink size={14} aria-hidden />
            </a>
            <button type="button" onClick={() => copy('feed', feed)} className="btn-quiet">
              {copied === 'feed' ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
              {copied === 'feed' ? 'Copied' : 'Copy the link'}
            </button>
          </div>
          <p className="text-[13px] leading-snug" style={{ color: 'var(--color-gold)' }}>
            The link is shown this once. If Google does not offer to add it, copy the link and use Other calendars,
            then From URL.
          </p>
        </>
      ) : enabled ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="min-w-0 flex-1 basis-60 text-[13px] leading-snug text-(--color-muted)">
            A link to your plan already exists, and it was shown only when it was made. A new one replaces it:
            anything using the old one (a calendar, the inbox, the Claude connector) stops until it is given the new one.
          </p>
          <button type="button" onClick={() => fire('new-link', make)} disabled={busy} className="btn-quiet disabled:opacity-40">
            {armed === 'new-link' ? 'Tap again to replace it' : 'Make a new link'}
          </button>
        </div>
      ) : (
        <button type="button" onClick={make} disabled={busy} className="btn-quiet self-start disabled:opacity-40">
          {busy ? 'Making the link…' : 'Make the link'}
        </button>
      )}
    </div>
  );
}

// ─── 2. Quests in bulk ────────────────────────────────────────────────────────

function QuestsInBulk() {
  const pushToast = useToastStore((s) => s.push);
  const { copied, copy } = useCopied();
  const [exporting, setExporting] = useState<'copy' | 'download' | null>(null);

  const exportQuests = async (how: 'copy' | 'download') => {
    setExporting(how);
    try {
      const { quests, count } = await manifestApi.export();
      if (count === 0) {
        pushToast({ title: 'Nothing to export yet', sub: 'There are no unfinished quests', icon: ListPlus, variant: 'xp' });
        return;
      }
      const text = toManifest(quests);
      if (how === 'copy') {
        await copy('export', text);
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
        a.download = `focus-guild-quests-${new Date().toISOString().slice(0, 10)}.txt`;
        a.click();
        URL.revokeObjectURL(a.href);
      }
      pushToast({ title: `${count} ${count === 1 ? 'quest' : 'quests'} ${how === 'copy' ? 'copied' : 'saved'}`, sub: 'As a manifest, steps included', icon: how === 'copy' ? Copy : Download, variant: 'xp' });
    } catch (err) {
      pushToast({ title: 'Could not export', sub: String(err).replace(/^\w*Error:\s*/, ''), icon: TriangleAlert, variant: 'error' });
    } finally {
      setExporting(null);
    }
  };

  return (
    <>
      <p className="text-sm leading-relaxed text-(--color-muted)">
        A manifest is a plain list: one quest per line, its steps indented under it, and settings such as a duration
        or a deadline written after the title. You can type one, or have an AI write it from whatever is in your head.
      </p>

      <ol className="panel rows overflow-hidden">
        <Step n={1}>
          <p>
            <b>Copy the guide</b> and paste it into a chat with an AI, followed by your list, your syllabus or a
            brain-dump. The guide is the whole format on one page, dated today so that deadlines come out as real dates.
          </p>
          <button type="button" onClick={() => copy('guide', manifestGuide())} className="btn-quiet mt-2.5">
            {copied === 'guide' ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
            {copied === 'guide' ? 'Copied' : 'Copy the guide'}
          </button>
        </Step>
        <Step n={2}>
          <p>
            <b>Paste what comes back into the importer.</b> It shows every line as the quest it would become, and
            flags anything it could not read, before a single quest is made.
          </p>
          <Link to="/quests/import" className="btn-strong mt-2.5">
            Open the importer <ArrowRight size={14} aria-hidden />
          </Link>
        </Step>
      </ol>

      <figure className="panel overflow-hidden">
        <figcaption className="section-label border-b border-(--color-border) px-4 py-2.5 text-[12px]">What a manifest looks like</figcaption>
        <pre className="overflow-x-auto px-4 py-3 text-[12.5px] leading-relaxed" style={{ fontFamily: MANIFEST_FONT }}>
          {MANIFEST_EXAMPLE.split('\n').map((line, i) => (
            // Comments and the header are scaffolding; the quests are what to look at.
            <span key={i} className={i === 0 || line.startsWith('//') ? 'block text-(--color-muted)' : 'block'}>{line}</span>
          ))}
        </pre>
      </figure>

      <div className="panel flex flex-wrap items-center gap-x-3 gap-y-2.5 px-4 py-3.5">
        <div className="min-w-0 flex-1 basis-60">
          <h3 className="text-[15px] font-semibold">Take your quests out</h3>
          <p className="mt-0.5 text-[13px] leading-snug text-(--color-muted)">
            Every unfinished quest with its steps, as a manifest: a backup, a way to move to another account, or
            something to hand an AI as it stands. Importing it again makes new quests; it does not update these.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => exportQuests('copy')} disabled={exporting !== null} className="btn-quiet disabled:opacity-40">
            {copied === 'export' ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
            {copied === 'export' ? 'Copied' : 'Copy'}
          </button>
          <button type="button" onClick={() => exportQuests('download')} disabled={exporting !== null} className="btn-quiet disabled:opacity-40">
            <Download size={14} aria-hidden /> Save as file
          </button>
        </div>
      </div>
    </>
  );
}
