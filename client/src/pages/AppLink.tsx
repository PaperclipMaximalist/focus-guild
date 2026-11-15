/**
 * /app-link — a WEB page, shown in the iPhone app's browser sheet.
 *
 * The app sends the member here with a PKCE challenge and a state. Signed in
 * on the website, they press Connect; the server makes a one-time code for
 * that challenge and the page hands it to the app at focusguild://link.
 *
 * The press is required on purpose: a link someone was tricked into opening
 * must not connect a device by itself. And the only places this page ever
 * sends anyone are the app's own scheme or, when the server says the
 * Universal Link is on (`via: 'universal'`), the app-link return address on
 * the API's host. Both are built here from the code and the state; no
 * redirect target is read from the query string.
 *
 * iOS opens the app for a universal link only when the member taps a real
 * link, not when a script navigates, so in that case the page does not move
 * by itself: it shows the Open Focus Guild link and asks for the press.
 *
 * Rendered outside the normal shell (App.tsx decides by the path); the
 * signing-in around it is App.tsx's too.
 */

import { useEffect, useState } from 'react';
import { ExternalLink, Smartphone } from 'lucide-react';
import { API_URL, ApiRequestError, devicesApi } from '../lib/api';
import { APP_SCHEME } from '../native/platform';
import { appLinkReturnUrl, clearLinkRequest, type LinkRequest } from '../native/linkRequest';

/** `tap`: the hand-off is a universal link, which only a real press opens. */
type Phase = { kind: 'ready' } | { kind: 'connecting' } | { kind: 'opening'; url: string; tap: boolean };

export default function AppLink({ request, who }: { request: LinkRequest | null; who: string | null }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'ready' });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Connect the iPhone app · Focus Guild';
  }, []);

  const connect = async () => {
    if (!request) return;
    setError(null);
    setPhase({ kind: 'connecting' });
    try {
      const { code, via } = await devicesApi.link(request.challenge, 'iPhone');
      // Absent (an older server) means the scheme, as before.
      const tap = via === 'universal';
      const url = tap
        ? appLinkReturnUrl(API_URL, code, request.state)
        : `${APP_SCHEME}://link?${new URLSearchParams({ code, state: request.state })}`;
      clearLinkRequest();
      if (import.meta.env.DEV) console.info(`[app-link] hand-off: ${url}`);
      setPhase({ kind: 'opening', url, tap });
      if (!tap) window.location.href = url;
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.detail : String(err));
      setPhase({ kind: 'ready' });
    }
  };

  const cancel = () => {
    clearLinkRequest();
    window.location.assign('/');
  };

  return (
    <main className="grid min-h-screen place-items-center px-4 py-8">
      <div className="panel w-full max-w-sm p-6">
        <Smartphone size={28} aria-hidden className="text-(--color-primary)" />
        <h1 className="mt-3 text-xl font-bold">Connect the iPhone app</h1>

        {!request ? (
          <>
            <p role="alert" className="mt-2 text-sm text-(--color-muted)">
              This link is incomplete. Go back to the app and press Sign in again.
            </p>
            <button type="button" onClick={cancel} className="btn-quiet mt-5 w-full" aria-label="Go to Focus Guild on the web">
              Go to Focus Guild
            </button>
          </>
        ) : phase.kind === 'opening' ? (
          <>
            <p role="status" className="mt-2 text-sm">
              {phase.tap ? 'Press Open Focus Guild to finish signing in.' : 'Opening Focus Guild…'}
            </p>
            <a href={phase.url} className="btn-primary mt-5 w-full">
              <ExternalLink size={18} aria-hidden />
              Open Focus Guild
            </a>
            <p className="mt-3 text-sm text-(--color-muted)">You can close this page once the app opens.</p>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-(--color-muted)">
              The Focus Guild app on your iPhone is asking to sign in as{' '}
              <span className="font-semibold text-(--color-text)">{who ?? 'you'}</span>. Continue only if you just
              pressed Sign in in the app.
            </p>
            {error && (
              <p role="alert" className="mt-3 text-sm" style={{ color: 'var(--color-fire)' }}>
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={() => void connect()}
              disabled={phase.kind === 'connecting'}
              className="btn-primary mt-5 w-full"
            >
              {phase.kind === 'connecting' ? 'Connecting…' : 'Connect this iPhone'}
            </button>
            <button
              type="button"
              onClick={cancel}
              aria-label="Cancel connecting the iPhone app"
              className="mt-2 min-h-11 w-full text-sm font-semibold text-(--color-muted) hover:text-(--color-text)"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </main>
  );
}
