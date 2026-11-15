import { create } from 'zustand';
import type { LucideIcon } from 'lucide-react';

export type ToastVariant = 'xp' | 'streak' | 'badge' | 'levelup' | 'error';

interface Toast {
  id: number;
  title: string;
  sub: string;
  icon: LucideIcon;
  variant: ToastVariant;
  /** A single inline action, e.g. Undo. Tapping it also dismisses the toast. */
  action?: { label: string; run: () => void };
}

interface ToastStore {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id'>) => number;
  dismiss: (id: number) => void;
}

let nextId = 1;

/** How long a toast with an action (Undo) stays up; the undo window outlasts it. */
export const TOAST_ACTION_MS = 8000;

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (t) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, ...t }] }));
    // Actionable toasts linger longer: three seconds is too short to reach an
    // Undo with a thumb, or by tabbing to it. Errors stay long enough to read.
    setTimeout(
      () => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
      t.action ? TOAST_ACTION_MS : t.variant === 'error' ? 6000 : 3500,
    );
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));
