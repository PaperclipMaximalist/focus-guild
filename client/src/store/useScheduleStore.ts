import { create } from 'zustand';
import {
  api,
  type ScheduleBlock,
  type ScheduleResponse,
  type ScheduleEdit,
  type FeasibilityIssue,
  type PlanMode,
} from '../lib/api';

interface ScheduleState {
  schedule: ScheduleBlock[];
  feasibilityReport: { ok: boolean; issues: FeasibilityIssue[] };
  generatedAt: string | null;
  loading: boolean;
  error: string | null;
  /** Last-generated mode, mirrored from the server so the UI stays in sync. */
  mode: PlanMode;

  generate: (opts?: { mode?: PlanMode }) => Promise<void>;
  fetch: () => Promise<void>;
  replan: () => Promise<void>;
  applyEdit: (edit: ScheduleEdit) => Promise<void>;
  setMode: (mode: PlanMode) => void;
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
    ...(r.mode ? { mode: r.mode } : {}),
  };
}

export const useScheduleStore = create<ScheduleState>((set, get) => ({
  schedule: [],
  feasibilityReport: { ok: true, issues: [] },
  generatedAt: null,
  loading: false,
  error: null,
  mode: 'balanced',
  activeBlockId: null,

  setMode: (mode) => set({ mode }),

  generate: async (opts) => {
    set({ loading: true, error: null });
    const mode = opts?.mode ?? get().mode;
    try {
      const r = await api.schedule.generate({ mode });
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
