import { create } from 'zustand';
import { api, type CheckIn } from '../lib/api';

interface CheckInState {
  today: CheckIn | null;
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  submit: (input: { energyLevel: number; availableMinutes: number }) => Promise<void>;
}

export const useCheckInStore = create<CheckInState>((set) => ({
  today: null,
  loading: false,
  error: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const today = await api.checkin.today();
      set({ today, loading: false });
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },

  submit: async (input) => {
    const today = await api.checkin.submit(input);
    set({ today });
  },
}));
