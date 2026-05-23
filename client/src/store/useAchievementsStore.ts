import { create } from 'zustand';
import { api, type AchievementSummary } from '../lib/api';

interface AchievementsState {
  unlocked: AchievementSummary[];
  loaded: boolean;
  load: () => Promise<void>;
  /** Optimistically merge newly-unlocked items so the UI flips instantly. */
  addUnlocked: (items: AchievementSummary[]) => void;
}

export const useAchievementsStore = create<AchievementsState>((set, get) => ({
  unlocked: [],
  loaded: false,
  load: async () => {
    try {
      const unlocked = await api.users.achievements();
      set({ unlocked, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
  addUnlocked: (items) => {
    const existing = new Set(get().unlocked.map((a) => a.slug));
    const fresh = items.filter((a) => !existing.has(a.slug));
    if (fresh.length === 0) return;
    set({ unlocked: [...fresh.map((a) => ({ ...a, unlockedAt: new Date().toISOString() })), ...get().unlocked] });
  },
}));
