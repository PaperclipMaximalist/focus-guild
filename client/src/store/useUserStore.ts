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
    // Already signed in: nothing to load, and no reason to keep showing an error.
    if (get().user) {
      if (get().error) set({ error: null });
      return;
    }
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
    } catch {
      // A background re-sync. Keep what is on screen: `error` is the
      // app-wide "Can't reach the Guild" page, and a dropped refresh must not
      // throw away a page the member is using. (Saves report their own failures.)
    }
  },

  applyXPGain: (totalXP, currentStreak, multiplier) => {
    const u = get().user;
    if (!u) return;
    set({ user: { ...u, totalXP, currentStreak, multiplier } });
  },
}));
