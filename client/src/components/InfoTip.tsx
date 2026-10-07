/**
 * InfoTip — small ⓘ button with a click-to-toggle popover.
 *
 * Used to disambiguate the scoring fields (mental load vs impact vs
 * tediousness vs urgency multiplier) which sound similar but drive
 * very different parts of the scheduler.
 */

import { useState, useRef, useEffect } from 'react';
import { Info } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  /** Label shown on the trigger; defaults to ⓘ. */
  trigger?: React.ReactNode;
}

export function InfoTip({ children, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="inline-grid h-5 w-5 place-items-center rounded-full align-middle transition-colors hover:text-(--color-text)"
        style={{ color: open ? 'var(--color-text)' : 'var(--color-muted)' }}
        title="What does this do?"
        aria-label="What does this do?"
      >
        {trigger ?? <Info size={14} aria-hidden />}
      </button>
      {open && (
        <div
          className="absolute z-50 top-full left-0 mt-1.5 w-64 rounded-lg p-3 text-xs leading-relaxed shadow-xl"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text)',
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
