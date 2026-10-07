/**
 * Where the duck lives: in the left slot of the phone's top bar, and at the
 * foot of the sidebar on a wide screen. Either way it sits on the app's
 * chrome, never on top of the page. (It used to float bottom-left over
 * whatever you were reading.)
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
    <div className="pointer-events-none fixed left-2 top-0.5 z-50 flex items-start gap-1 lg:bottom-3 lg:left-3 lg:top-auto lg:items-end">
      <button
        type="button"
        onClick={() => {
          sfxSqueak();
          react('poke');
        }}
        aria-label="Rubber duck. Tap for a pep talk."
        className="pointer-events-auto grid h-12 w-12 place-items-center rounded-full lg:h-14 lg:w-14"
      >
        <span className="block origin-center scale-[0.78] lg:scale-100">
          <Duck mood={mood} beat={beat} size={52} />
        </span>
      </button>

      {/* Polite live region: screen readers hear the line without losing focus. */}
      <div role="status" aria-live="polite" className="pointer-events-none mt-1.5 lg:mb-3 lg:mt-0">
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
              className="mascot-bubble pointer-events-auto relative max-w-[min(300px,calc(100vw-72px))] rounded-lg border px-3 py-1.5 text-left text-[13px] leading-tight shadow-lg shadow-black/40 max-lg:line-clamp-2"
              style={{
                background: 'var(--color-surface2)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text)',
              }}
              title="Dismiss"
            >
              {message}
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
