/**
 * Bottom sheet — the tracker's modal shell.
 *
 * Slides up from the bottom rather than centring, so its controls land under
 * the thumb on a phone instead of at the top of the screen. The header is
 * sticky and the body scrolls, which keeps Save/Close reachable however long
 * the form gets.
 */

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Rendered in the sticky footer — the primary action lives here. */
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export function Sheet({ open, onClose, title, footer, children }: Props) {
  // Escape closes, and the page behind must not scroll while the sheet is up.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="sheet-backdrop"
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/70"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border sm:mb-6 sm:rounded-2xl"
            style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 340, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
          >
            <header
              className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <h2 className="truncate text-base font-bold">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-lg"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--color-muted)' }}
              >
                ✕
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>

            {footer && (
              <footer
                // Clear the home indicator on notched phones.
                className="shrink-0 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
                style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
              >
                {footer}
              </footer>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Shared input styling — dark field, border from the theme token. */
export const fieldStyle: React.CSSProperties = {
  borderColor: 'var(--color-border)',
  background: 'rgba(255,255,255,0.04)',
  color: 'var(--color-text)',
};

export const fieldClass =
  'w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors';

export function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>
        {children}
      </span>
      {hint && (
        <p className="mt-0.5 text-xs" style={{ color: 'var(--color-muted)', opacity: 0.75 }}>
          {hint}
        </p>
      )}
    </div>
  );
}
