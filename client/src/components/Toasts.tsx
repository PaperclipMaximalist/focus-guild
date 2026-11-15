import { AnimatePresence, motion } from 'framer-motion';
import { useToastStore, type ToastVariant } from './toastStore';

/** The icon carries the kind of news; the toast itself stays neutral. */
const TINT: Record<ToastVariant, string> = {
  xp:      'var(--color-primary)',
  streak:  'var(--color-gold)',
  badge:   'var(--color-primary)',
  levelup: 'var(--color-primary)',
  error:   'var(--color-fire)',
};

const BG: Record<ToastVariant, string> = {
  xp:      'var(--color-surface2)',
  streak:  'var(--color-surface2)',
  badge:   'var(--color-surface2)',
  levelup: 'var(--color-surface2)',
  error:   'var(--color-surface2)',
};

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-20 right-4 z-[500] flex flex-col items-end gap-2 lg:bottom-6 lg:right-6 edge:max-lg:bottom-[calc(5rem+var(--safe-bottom))]">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ y: 12, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            role={t.variant === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex min-w-[220px] max-w-[320px] items-center gap-3 rounded-xl border border-(--color-border-strong) py-2.5 pl-3.5 pr-2.5 text-sm font-medium shadow-lg shadow-black/40"
            style={{ background: BG[t.variant] }}
          >
            <t.icon className="shrink-0" size={18} strokeWidth={2} aria-hidden style={{ color: TINT[t.variant] }} />
            <div className="min-w-0 flex-1 leading-tight">
              <strong className="block">{t.title}</strong>
              <span className="text-xs text-(--color-muted)">{t.sub}</span>
            </div>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action!.run();
                  dismiss(t.id);
                }}
                className="btn-quiet shrink-0 px-3 text-xs font-bold"
              >
                {t.action.label}
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
