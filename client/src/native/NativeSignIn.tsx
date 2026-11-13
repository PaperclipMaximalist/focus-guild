/**
 * The iOS app's sign-in screen. One button: it opens the website in the
 * browser sheet, where signing in and signing up are the same few steps.
 * The pitch comes from App.tsx so the website's landing page and this
 * screen say the same thing.
 */

import { useEffect } from 'react';
import { LogIn } from 'lucide-react';
import { useNativeAuth } from './auth';

export function NativeSignIn({ pitch }: { pitch: React.ReactNode }) {
  const status = useNativeAuth((s) => s.status);
  const exchanging = useNativeAuth((s) => s.exchanging);
  const error = useNativeAuth((s) => s.error);
  const startSignIn = useNativeAuth((s) => s.startSignIn);
  const cancelSignIn = useNativeAuth((s) => s.cancelSignIn);

  useEffect(() => {
    document.title = 'Sign in · Focus Guild';
  }, []);

  const waiting = status === 'linking';

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-8 px-4 pt-[calc(env(safe-area-inset-top)+2rem)] pb-[calc(env(safe-area-inset-bottom)+2rem)]">
      {pitch}
      <div className="flex flex-col gap-3">
        {waiting ? (
          <>
            <p role="status" className="text-sm text-(--color-muted)">
              {exchanging ? 'Signing you in…' : 'Waiting for you to finish in the browser…'}
            </p>
            {!exchanging && (
              <button
                type="button"
                onClick={cancelSignIn}
                aria-label="Cancel sign-in"
                className="-ml-3 min-h-11 self-start px-3 text-sm font-semibold text-(--color-muted) hover:text-(--color-text)"
              >
                Cancel
              </button>
            )}
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => void startSignIn()}
              aria-label="Sign in to Focus Guild"
              className="btn-primary min-h-11 w-full"
            >
              <LogIn size={18} aria-hidden />
              Sign in
            </button>
            <p className="text-center text-sm text-(--color-muted)">New here? The same button creates your account.</p>
          </>
        )}
        {error && (
          <p role="alert" className="text-sm" style={{ color: 'var(--color-fire)' }}>
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
