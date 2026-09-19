/**
 * Connections: calendars the planner works around, and the inbox.
 *
 * Calendars are ICS subscriptions, no Google or Microsoft sign-in needed. Busy
 * events become fixed blocks on the Guild Feed, so nothing is planned over a
 * lesson or a Teams meeting.
 *
 * The inbox is one URL plus a personal token. Anything that can make a web
 * request (Power Automate on a Teams mention, a phone shortcut, Zapier) can
 * drop a line into the Parking Lot. The token is shown once; the server keeps
 * only its hash.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { API_URL, api, type CalendarSourceInfo, type IntegrationsState } from '../lib/api';
import { sfxClick } from '../lib/sfx';
import { useToastStore } from '../components/Toasts';
import { fieldClass, fieldStyle, Label } from '../components/tracker/Sheet';
import { ArrowLeft, CalendarDays, ChevronDown, ChevronRight, Clipboard, Inbox, Plug, RefreshCw, Trash2, TriangleAlert } from 'lucide-react';

const muted = { color: 'var(--color-muted)' };
const card = { borderColor: 'var(--color-border)', background: 'var(--color-surface)' };
const primaryBtn = { background: 'var(--color-primary)', color: 'var(--color-on-primary)' };

function ago(iso: string | null): string {
  if (!iso) return 'never synced';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return 'synced just now';
  if (min < 60) return `synced ${min} min ago`;
  const h = Math.round(min / 60);
  return h < 24 ? `synced ${h} h ago` : `synced ${Math.round(h / 24)} d ago`;
}

export default function Connections() {
  const pushToast = useToastStore((s) => s.push);
  const [state, setState] = useState<IntegrationsState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setState(await api.integrations.get());
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const fail = (title: string) => (err: unknown) =>
    pushToast({ title, sub: String(err).replace(/^Error:\s*/, ''), icon: TriangleAlert, variant: 'error' });

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-7 p-4 pb-32">
      <header className="flex items-center gap-3">
        <Link
          to="/settings"
          aria-label="Back to settings"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-md border"
          style={{ borderColor: 'var(--color-border)', background: 'rgba(255,255,255,0.04)' }}
        >
          <ArrowLeft size={18} aria-hidden />
        </Link>
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold leading-tight">
            <Plug size={20} aria-hidden /> Connections
          </h1>
          <p className="text-xs" style={muted}>
            Bring your calendars and other apps into the Guild
          </p>
        </div>
      </header>

      {error && (
        <p className="rounded-(--radius-card) border p-3 text-sm" style={card}>
          Couldn't load connections. {error}
        </p>
      )}

      {!state && !error && (
        <div className="flex flex-col gap-3" aria-busy="true">
          {[0, 1].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-(--radius-card)" style={{ background: 'var(--color-surface)' }} />
          ))}
        </div>
      )}

      {state && (
        <>
          <CalendarsSection calendars={state.calendars} onChange={load} fail={fail} />
          <InboxSection enabled={state.tokenEnabled} onChange={load} fail={fail} />
        </>
      )}
    </div>
  );
}

type Fail = (title: string) => (err: unknown) => void;

// ─── Calendars ────────────────────────────────────────────────────────────────

function CalendarsSection({ calendars, onChange, fail }: { calendars: CalendarSourceInfo[]; onChange: () => void; fail: Fail }) {
  const pushToast = useToastStore((s) => s.push);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(calendars.length === 0);

  const add = async () => {
    setBusy('add');
    try {
      const res = await api.integrations.addCalendar(name.trim(), url.trim());
      setName('');
      setUrl('');
      sfxClick();
      if (res.error) {
        pushToast({ title: 'Connected, but the first sync failed', sub: res.error, icon: TriangleAlert, variant: 'error' });
      } else {
        pushToast({ title: `${res.calendar.name} connected`, sub: `${res.count ?? 0} busy events found. Reflow the Feed to plan around them`, icon: CalendarDays, variant: 'xp' });
      }
      onChange();
    } catch (err) {
      fail('Could not connect that calendar')(err);
    } finally {
      setBusy(null);
    }
  };

  const sync = async (id: string) => {
    setBusy(id);
    try {
      const res = await api.integrations.syncCalendar(id);
      if (res.error) pushToast({ title: 'Sync failed', sub: res.error, icon: TriangleAlert, variant: 'error' });
      else pushToast({ title: 'Synced', sub: `${res.count ?? 0} busy events`, icon: RefreshCw, variant: 'xp' });
      onChange();
    } catch (err) {
      fail('Sync failed')(err);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string) => {
    if (confirmId !== id) {
      setConfirmId(id);
      return;
    }
    setBusy(id);
    try {
      await api.integrations.removeCalendar(id);
      setConfirmId(null);
      onChange();
    } catch (err) {
      fail('Could not remove it')(err);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide" style={muted}>
          <CalendarDays size={15} aria-hidden /> Calendars
        </h2>
        <p className="mt-1 text-xs leading-snug" style={muted}>
          Timed events become fixed blocks on the Feed, and the planner works around them. All-day and "show as free"
          events are ignored. Feeds refresh every 15 minutes.
        </p>
      </div>

      {calendars.length > 0 && (
        <ul className="flex flex-col gap-2">
          {calendars.map((cal) => (
            <li key={cal.id} className="flex flex-col gap-2 rounded-(--radius-card) border p-3" style={card}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{cal.name}</p>
                  <p className="truncate font-mono text-[11px]" style={muted}>
                    {cal.host}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => sync(cal.id)}
                  disabled={busy !== null}
                  aria-label={`Sync ${cal.name} now`}
                  className="grid h-9 w-9 place-items-center rounded-md disabled:opacity-40"
                  style={{ background: 'rgba(255,255,255,0.06)' }}
                >
                  <RefreshCw size={15} aria-hidden className={busy === cal.id ? 'animate-spin' : ''} />
                </button>
                <button
                  type="button"
                  onClick={() => remove(cal.id)}
                  onBlur={() => setConfirmId(null)}
                  disabled={busy !== null}
                  aria-label={confirmId === cal.id ? `Confirm removing ${cal.name}` : `Remove ${cal.name}`}
                  className="flex h-9 items-center gap-1 rounded-md px-2.5 text-xs font-semibold disabled:opacity-40"
                  style={confirmId === cal.id ? { background: 'var(--color-red, #E66767)', color: '#fff' } : { background: 'rgba(255,255,255,0.06)' }}
                >
                  <Trash2 size={14} aria-hidden />
                  {confirmId === cal.id && 'Remove?'}
                </button>
              </div>
              <p className="text-xs" style={cal.lastError ? { color: 'var(--color-gold)' } : muted}>
                {cal.lastError ? `Last sync failed: ${cal.lastError}` : `${cal.eventCount} busy events · ${ago(cal.lastSyncAt)}`}
              </p>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2 rounded-(--radius-card) border p-3" style={card}>
        <div>
          <Label>Name</Label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="School timetable" maxLength={60} className={fieldClass} style={fieldStyle} />
        </div>
        <div>
          <Label hint="The secret iCal / ICS link. It starts with https:// or webcal://.">Calendar link</Label>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            className={`${fieldClass} font-mono text-xs`}
            style={fieldStyle}
          />
        </div>
        <button
          type="button"
          onClick={add}
          disabled={busy !== null || !name.trim() || url.trim().length < 8}
          className="mt-1 rounded-lg py-2.5 text-sm font-bold disabled:opacity-40"
          style={primaryBtn}
        >
          {busy === 'add' ? 'Connecting…' : 'Connect calendar'}
        </button>
      </div>

      <div className="rounded-(--radius-card) border" style={card}>
        <button
          type="button"
          onClick={() => setHelpOpen((v) => !v)}
          aria-expanded={helpOpen}
          className="flex w-full items-center gap-2 px-3 py-2.5 text-sm font-semibold"
        >
          {helpOpen ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
          Where do I find the link?
        </button>
        {helpOpen && (
          <div className="flex flex-col gap-3 border-t px-3 py-3 text-xs leading-relaxed" style={{ borderColor: 'var(--color-border)' }}>
            <HelpItem title="Google Calendar">
              On a computer: Settings → pick the calendar under "Settings for my calendars" → Integrate calendar →
              copy <b>Secret address in iCal format</b>.
            </HelpItem>
            <HelpItem title="Outlook and Teams meetings">
              Teams meetings live in your Outlook calendar. Outlook on the web: Settings → Calendar → Shared calendars →
              Publish a calendar → choose the calendar and "Can view all details" → Publish → copy the <b>ICS</b> link.
            </HelpItem>
            <HelpItem title="Apple iCloud">
              Calendar app → right-click the calendar → Share Calendar → Public Calendar → copy the webcal:// link.
            </HelpItem>
            <p style={muted}>
              School or work accounts sometimes switch these links off. If the option is missing, ask whether publishing
              is allowed, or use the inbox below for individual items instead. Treat the link like a password: anyone
              with it can read that calendar.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function HelpItem({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-bold">{title}</p>
      <p style={muted}>{children}</p>
    </div>
  );
}

// ─── Inbox ────────────────────────────────────────────────────────────────────

function InboxSection({ enabled, onChange, fail }: { enabled: boolean; onChange: () => void; fail: Fail }) {
  const pushToast = useToastStore((s) => s.push);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const endpoint = `${API_URL}/inbox`;

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      sfxClick();
      pushToast({ title: `${what} copied`, sub: 'Paste it into the other app', icon: Clipboard, variant: 'xp' });
    } catch {
      pushToast({ title: 'Clipboard blocked', sub: 'Select the text and copy it manually', icon: TriangleAlert, variant: 'error' });
    }
  };

  const create = async () => {
    setBusy(true);
    try {
      const res = await api.integrations.createToken();
      setToken(res.token);
      onChange();
    } catch (err) {
      fail('Could not create a token')(err);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    setBusy(true);
    try {
      await api.integrations.revokeToken();
      setToken(null);
      onChange();
      pushToast({ title: 'Token revoked', sub: 'The inbox and the connector stop working', icon: Inbox, variant: 'xp' });
    } catch (err) {
      fail('Could not turn it off')(err);
    } finally {
      setBusy(false);
    }
  };

  const curl = token
    ? `curl -X POST "${endpoint}" \\\n  -H "Authorization: Bearer ${token}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"text":"Reply to Ms. Chen about the IA draft"}'`
    : '';

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide" style={muted}>
          <Inbox size={15} aria-hidden /> Inbox
        </h2>
        <p className="mt-1 text-xs leading-snug" style={muted}>
          A private address other apps can send items to. They land in your Parking Lot, not your active list, so
          capturing something never commits you to it. The same token also lets the Claude Desktop connector read
          your Guild.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-(--radius-card) border p-3" style={card}>
        <p className="text-sm">
          Status:{' '}
          <b style={{ color: enabled ? 'var(--color-green)' : 'var(--color-muted)' }}>{enabled ? 'On' : 'Off'}</b>
        </p>

        {token && (
          <div className="flex flex-col gap-2 rounded-lg border p-2.5" style={{ borderColor: 'var(--color-gold)' }}>
            <p className="text-xs font-semibold" style={{ color: 'var(--color-gold)' }}>
              Copy your token now. It won't be shown again.
            </p>
            <CopyRow label="Address" value={endpoint} onCopy={() => copy(endpoint, 'Address')} />
            <CopyRow label="Token" value={token} onCopy={() => copy(token, 'Token')} />
            <details className="text-xs">
              <summary className="cursor-pointer font-semibold">Test it from a terminal</summary>
              <pre className="mt-2 overflow-x-auto whitespace-pre rounded-md p-2 font-mono text-[11px]" style={{ background: 'rgba(0,0,0,0.3)' }}>
                {curl}
              </pre>
            </details>
          </div>
        )}

        <div className="flex gap-2">
          <button type="button" onClick={create} disabled={busy} className="flex-1 rounded-lg py-2.5 text-sm font-bold disabled:opacity-40" style={primaryBtn}>
            {enabled ? 'Make a new token' : 'Turn on inbox'}
          </button>
          {enabled && (
            <button type="button" onClick={revoke} disabled={busy} className="rounded-lg px-4 text-sm font-semibold disabled:opacity-40" style={{ background: 'rgba(255,255,255,0.06)' }}>
              Turn off
            </button>
          )}
        </div>
        {enabled && !token && (
          <p className="text-xs" style={muted}>
            Lost the token? Make a new one. The old one stops working immediately.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-(--radius-card) border p-3 text-xs leading-relaxed" style={card}>
        <HelpItem title="Teams mentions (Power Automate)">
          New flow → trigger "When I am mentioned in a channel message" (or "When a new chat message is added") → add
          action <b>HTTP</b>: method POST, URI = the address, header <code>Authorization</code> = <code>Bearer</code> +
          your token, body <code>{'{"title": "Teams", "body": <message preview>}'}</code>. Add <code>?source=teams</code>{' '}
          to the address to label it in the Chronicle. The HTTP action may need a premium licence; a school licence often
          includes it.
        </HelpItem>
        <HelpItem title="iPhone Shortcuts / Android">
          Shortcut: Ask for Input → Get Contents of URL (POST, JSON body <code>text</code> = the input, header
          Authorization = Bearer + token). Add it to your home screen or share sheet.
        </HelpItem>
        <HelpItem title="Anything else">
          Zapier, Make, IFTTT or a script: POST <code>{'{"text": "…"}'}</code> or plain text to the address with the token.
        </HelpItem>
      </div>
    </section>
  );
}

function CopyRow({ label, value, onCopy }: { label: string; value: string; onCopy: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-xs" style={muted}>
        {label}
      </span>
      <code className="min-w-0 flex-1 truncate rounded-md px-2 py-1.5 font-mono text-[11px]" style={{ background: 'rgba(0,0,0,0.3)' }}>
        {value}
      </code>
      <button type="button" onClick={onCopy} aria-label={`Copy ${label.toLowerCase()}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-md" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <Clipboard size={14} aria-hidden />
      </button>
    </div>
  );
}
