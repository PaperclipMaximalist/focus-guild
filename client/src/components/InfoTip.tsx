/**
 * InfoTip — small ⓘ button with a click-to-toggle popover.
 *
 * Used to disambiguate the scoring fields (mental load vs impact vs
 * tediousness vs urgency multiplier) which sound similar but drive
 * very different parts of the scheduler.
 */

import { useState, useRef, useEffect } from 'react';

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
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold transition-opacity"
        style={{
          background: 'rgba(139,92,246,0.18)',
          color: 'var(--color-primary)',
          opacity: open ? 1 : 0.7,
        }}
        title="What does this do?"
      >
        {trigger ?? 'ⓘ'}
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
