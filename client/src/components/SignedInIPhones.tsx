/**
 * Signed-in iPhones, in Settings, Account, on the website and in the app.
 *
 * One row per device session (GET /devices): its name, when it was connected
 * and when it was last used (the server writes that at most hourly, so days,
 * not minutes). Each row signs its iPhone out with two taps (useArmed; there
 * is no Undo for a sign-out). In the app, the row for this iPhone has no
 * button of its own: the Sign out row right under the list is the one that
 * also forgets the Keychain, and two identical buttons would be one too many.
 */

import { useCallback, useEffect, useState } from 'react';
import { LogOut, Smartphone, TriangleAlert } from 'lucide-react';
import { ApiRequestError, devicesApi, type Device } from '../lib/api';
import { connectedLabel, lastUsedLabel } from '../lib/deviceTimes';
import { useArmed } from '../lib/useArmed';
import { useToastStore } from './Toasts';
import { isNativeApp } from '../native/platform';

const said = (err: unknown) => String(err).replace(/^\w*Error:\s*/, '').replace(/^[A-Z_]+:\s*/, '');

export function SignedInIPhones() {
  const pushToast = useToastStore((s) => s.push);
  const { armed, fire } = useArmed();
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // State is only set once the request settles, so the first run can live in an effect.
  const load = useCallback(() => {
    devicesApi
      .list()
      .then((list) => {
        setDevices(list);
        setError(null);
      })
      .catch((err: unknown) => setError(said(err)));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const signOut = async (d: Device) => {
    setBusy(d.id);
    try {
      await devicesApi.revoke(d.id);
      setDevices((list) => (list ?? []).filter((x) => x.id !== d.id));
      pushToast({ icon: LogOut, title: `${d.name} signed out`, sub: 'It needs to sign in again to see your quests', variant: 'xp' });
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'NOT_FOUND') {
        // Already signed out (elsewhere, or after 180 days unused): the list was out of date.
        setDevices((list) => (list ?? []).filter((x) => x.id !== d.id));
      } else {
        pushToast({ icon: TriangleAlert, title: `${d.name} is still signed in`, sub: said(err), variant: 'error' });
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
        Signed-in iPhones
      </h3>

      {error && !devices && (
        <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          <span className="flex min-w-0 flex-1 items-start gap-1.5" style={{ color: 'var(--color-muted)' }}>
            <TriangleAlert size={14} aria-hidden className="mt-0.5 shrink-0" />
            The list of signed-in iPhones didn’t load. {error}
          </span>
          <button
            type="button"
            onClick={() => {
              setError(null);
              load();
            }}
            className="btn-quiet min-h-11"
          >
            Try again
          </button>
        </div>
      )}

      {!devices && !error && <div className="skeleton h-14" aria-busy="true" aria-label="Loading signed-in iPhones" />}

      {devices && devices.length === 0 && (
        <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
          {isNativeApp
            ? 'No iPhone is signed in.'
            : 'No iPhone is signed in. Open the app and press Sign in to connect one.'}
        </p>
      )}

      {devices && devices.length > 0 && (
        <ul className="rows">
          {devices.map((d) => {
            const here = isNativeApp && d.current;
            const key = `device-${d.id}`;
            return (
              <li key={d.id} className="flex items-center gap-3 py-2.5">
                <Smartphone size={18} aria-hidden className="shrink-0" style={{ color: 'var(--color-muted)' }} />
                <div className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2 text-sm" style={{ color: 'var(--color-text)' }}>
                    {d.name}
                    {here && <span className="status" style={{ color: 'var(--color-green)' }}>This iPhone</span>}
                  </span>
                  <span className="block text-xs" style={{ color: 'var(--color-muted)' }}>
                    {connectedLabel(d.createdAt)} · {lastUsedLabel(d.lastUsedAt)}
                  </span>
                </div>
                {!here && (
                <button
                  type="button"
                  onClick={() => fire(key, () => void signOut(d))}
                  disabled={busy !== null}
                  aria-label={armed === key ? `Tap again to sign out ${d.name}` : `Sign out ${d.name}`}
                  className="btn-quiet min-h-11 shrink-0 disabled:opacity-40"
                  style={armed === key ? { color: 'var(--color-fire)' } : undefined}
                >
                  <LogOut size={16} aria-hidden />
                  {busy === d.id ? 'Signing out…' : armed === key ? 'Tap again' : 'Sign out'}
                </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
