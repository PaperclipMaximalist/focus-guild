/**
 * Share target: where Android's share sheet lands when Focus Guild is
 * installed (`share_target` in the manifest).
 *
 * Shared text goes to the Parking Lot, never the active list — capture should
 * never commit you to anything. It posts once automatically, because the whole
 * point is that sharing is one gesture, and then offers the two things you
 * might actually want next: edit it, or open the tracker.
 */

import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { sfxClick } from '../lib/sfx';
import { fieldClass, fieldStyle } from '../components/tracker/Sheet';
import { Check, Inbox, TriangleAlert } from 'lucide-react';

const muted = { color: 'var(--color-muted)' };
const card = { borderColor: 'var(--color-border)', background: 'var(--color-surface)' };

export default function Share() {
  const [params] = useSearchParams();
  const shared = [params.get('title'), params.get('text'), params.get('url')]
    .filter((v): v is string => Boolean(v?.trim()))
    // A shared link often arrives as both text and url; don't say it twice.
    .filter((v, i, all) => all.indexOf(v) === i)
    .join(' — ')
    .slice(0, 2000);

  const [text, setText] = useState(shared);
  const [state, setState] = useState<'saving' | 'saved' | 'editing' | 'error'>(shared ? 'saving' : 'editing');
  const [error, setError] = useState<string | null>(null);
  const sent = useRef(false);

  const save = async (value: string) => {
    const t = value.trim();
    if (!t) return;
    setState('saving');
    setError(null);
    try {
      await api.tracker.addParkingLot(t);
      setState('saved');
      sfxClick();
    } catch (err) {
      setState('error');
      setError(String(err).replace(/^ApiRequestError:\s*/, ''));
    }
  };

  // Fire once on arrival; StrictMode double-invokes effects in dev.
  useEffect(() => {
    if (sent.current || !shared) return;
    sent.current = true;
    save(shared);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shared]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4 pb-32">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold leading-tight">
          <Inbox size={20} aria-hidden /> Parked
        </h1>
        <p className="text-xs" style={muted}>
          Shared things wait in the parking lot until you decide
        </p>
      </header>

      {state === 'saved' && (
        <p className="flex items-center gap-2 rounded-(--radius-card) border p-3 text-sm" style={card}>
          <Check size={16} aria-hidden style={{ color: 'var(--color-green)' }} /> Saved to your parking lot.
        </p>
      )}

      {state === 'error' && (
        <p className="rounded-(--radius-card) border p-3 text-sm" style={card}>
          <TriangleAlert size={16} aria-hidden className="mr-1 inline" /> Couldn't save it. {error}
        </p>
      )}

      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setState('editing');
        }}
        aria-label="Shared text"
        maxLength={2000}
        className={`${fieldClass} min-h-32`}
        style={fieldStyle}
      />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => save(text)}
          disabled={state === 'saving' || !text.trim() || (state === 'saved' && text === shared)}
          className="flex-1 rounded-xl py-3 text-sm font-bold disabled:opacity-40"
          style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}
        >
          {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : 'Save to parking lot'}
        </button>
        <Link
          to="/tracker"
          className="grid place-items-center rounded-xl border px-4 text-sm font-semibold"
          style={card}
        >
          Open tracker
        </Link>
      </div>
    </div>
  );
}
