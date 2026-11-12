import { create } from 'zustand';

/** The level-up splash is mounted once in the app shell; anything that
 * completes a quest asks for it here. */
interface LevelUpState {
  level: number | null;
  show: (level: number) => void;
  dismiss: () => void;
}

export const useLevelUpStore = create<LevelUpState>((set) => ({
  level: null,
  show: (level) => set({ level }),
  dismiss: () => set({ level: null }),
}));
