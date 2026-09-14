/**
 * Where the duck lives: bottom-left, just above the nav, out of the way of
 * the add buttons on the right.
 *
 * Tap the duck for a pep talk (and a squeak). Tap its speech line to dismiss
 * it early. Lines also clear themselves after a few seconds.
 *
 * Level-ups, achievements and streak milestones already announce themselves
 * as toasts from several pages, so rather than threading a duck call through
 * each of those handlers, the dock listens to the toast stream for those
 * three variants. Everything else calls the duck directly where it happens.
 */

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { Duck } from './Duck';
import { useMascotStore } from '../../store/useMascotStore';
import { useToastStore } from '../Toasts';
import { useUserStore } from '../../store/useUserStore';
import { greetingFor } from '../../lib/mascotLines';
import { sfxSqueak } from '../../lib/sfx';

const GREETED_KEY = 'fg:duck-greeted';
// Focused, full-screen flows the duck shouldn't sit on top of.
const HIDDEN_ROUTES = new Set(['/checkin']);

export function MascotDock() {
  const { enabled, mood, message, beat, react, dismiss } = useMascotStore();
  const { pathname } = useLocation();

  // One hello per browser session, not per page change.
  useEffect(() => {
    if (!enabled) return;
    try {
      if (sessionStorage.getItem(GREETED_KEY)) return;
      sessionStorage.setItem(GREETED_KEY, '1');
    } catch {
      // Storage blocked: greet anyway, it's only once per mount.
    }
    const t = setTimeout(() => react(greetingFor(new Date().getHours())), 1400);
    return () => clearTimeout(t);
  }, [enabled, react]);

  // Celebrate what the app already celebrates.
  useEffect(
    () =>
      useToastStore.subscribe((state, prev) => {
        const fresh = state.toasts.filter((t) => !prev.toasts.some((p) => p.id === t.id));
        for (const t of fresh) {
          if (t.variant === 'levelup') react('levelUp');
          else if (t.variant === 'badge') react('achievement');
          else if (t.variant === 'streak') {
            const n = useUserStore.getState().user?.currentStreak ?? 0;
            if (n >= 2) react('streak', n);
          }
        }
      }),
    [react],
  );

  if (!enabled || HIDDEN_ROUTES.has(pathname)) return null;

  return (
    <div className="pointer-events-none fixed bottom-[76px] left-2 z-40 flex items-end gap-1">
      <button
        type="button"
        onClick={() => {
          sfxSqueak();
          react('poke');
        }}
        aria-label="Rubber duck. Tap for a pep talk."
        className="pointer-events-auto grid h-14 w-14 place-items-center rounded-full"
      >
        <Duck mood={mood} beat={beat} size={52} />
      </button>

      {/* Polite live region: screen readers hear the line without losing focus. */}
      <div role="status" aria-live="polite" className="pointer-events-none mb-3">
        <AnimatePresence>
          {message && (
            <motion.button
              key={message}
              type="button"
              onClick={dismiss}
              initial={{ opacity: 0, x: -6, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -6 }}
              transition={{ duration: 0.16 }}
              className="mascot-bubble pointer-events-auto relative max-w-[min(260px,calc(100vw-90px))] rounded-md border px-3 py-2 text-left text-[13px] leading-snug"
              style={{
                background: 'var(--color-surface2)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)',
              }}
              title="Dismiss"
            >
              <span className="font-mono text-[12px] font-bold" style={{ color: 'var(--color-gold)' }}>
                duck&gt;{' '}
              </span>
              {message}
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
