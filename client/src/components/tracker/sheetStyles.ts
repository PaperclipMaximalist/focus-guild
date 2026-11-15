import type { CSSProperties } from 'react';

/** Shared input styling — dark field, border from the theme token. */
export const fieldStyle: CSSProperties = {
  borderColor: 'var(--color-border)',
  background: 'rgba(255,255,255,0.04)',
  color: 'var(--color-text)',
};

export const fieldClass =
  'w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors';
