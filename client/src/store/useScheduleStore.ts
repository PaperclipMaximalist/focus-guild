import { create } from 'zustand';
import {
  api,
  type ScheduleBlock,
  type ScheduleResponse,
  type ScheduleEdit,
  type FeasibilityIssue,
} from '../lib/api';

interface ScheduleState {
  schedule: ScheduleBlock[];
  feasibilityReport: { ok: boolean; issues: FeasibilityIssue[] };
  generatedAt: string | null;
  loading: boolean;
  error: string | null;

  generate: () => Promise<void>;
  fetch: () => Promise<void>;
  replan: () => Promise<void>;
  applyEdit: (edit: ScheduleEdit) => Promise<void>;
  /** Active block id — user has started a focus session on it. */
  activeBlockId: string | null;
  setActiveBlock: (id: string | null) => void;
}

function applyResponse(state: Partial<ScheduleState>, r: ScheduleResponse): Partial<ScheduleState> {
  return {
    ...state,
    schedule: r.schedule,
    feasibilityReport: r.feasibilityReport,
    generatedAt: r.generatedAt,
    loading: false,
    error: null,
  };
}

export const useScheduleStore = create<ScheduleState>((set) => ({
  schedule: [],
  feasibilityReport: { ok: true, issues: [] },
  generatedAt: null,
  loading: false,
  error: null,
  activeBlockId: null,

  generate: async () => {
    set({ loading: true, error: null });
    try {
      const r = await api.schedule.generate();
      set((s) => applyResponse(s, r));
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },

  fetch: async () => {
    set({ loading: true, error: null });
    try {
      const r = await api.schedule.get();
      set((s) => applyResponse(s, r));
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },

  replan: async () => {
    set({ loading: true, error: null });
    try {
      const r = await api.schedule.replan();
      set((s) => applyResponse(s, r));
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },

  applyEdit: async (edit) => {
    set({ loading: true, error: null });
    try {
      const r = await api.schedule.edit(edit);
      set((s) => applyResponse(s, r));
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },

  setActiveBlock: (id) => set({ activeBlockId: id }),
}));
