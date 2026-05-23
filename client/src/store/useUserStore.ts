import { create } from 'zustand';
import { api, type User } from '../lib/api';

interface UserState {
  user: User | null;
  loading: boolean;
  error: string | null;
  /** Idempotent: upserts the dev user if not yet loaded. */
  init: () => Promise<void>;
  /** Refresh from server (after a quest completion changes XP/streak). */
  refresh: () => Promise<void>;
  /** Optimistic update from a CompleteQuest result. */
  applyXPGain: (newXP: number, newStreak: number, newMultiplier: number) => void;
}

export const useUserStore = create<UserState>((set, get) => ({
  user: null,
  loading: false,
  error: null,

  init: async () => {
    if (get().user) return;
    set({ loading: true, error: null });
    try {
      const user = await api.users.upsert();
      set({ user, loading: false });
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },

  refresh: async () => {
    try {
      const user = await api.users.get();
      set({ user });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  applyXPGain: (totalXP, currentStreak, multiplier) => {
    const u = get().user;
    if (!u) return;
    set({ user: { ...u, totalXP, currentStreak, multiplier } });
  },
}));
