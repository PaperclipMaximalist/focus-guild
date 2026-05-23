import { create } from 'zustand';
import { api, type Quest, type CompleteQuestResult, type QuestSchedulerHints } from '../lib/api';

interface QuestState {
  quests: Quest[];           // active non-recurring quests
  recurring: Quest[];        // active recurring quests (with doneToday flag)
  completed: Quest[];        // completed quests (for weekly chart + history)
  loading: boolean;
  error: string | null;

  load: () => Promise<void>;
  loadRecurring: () => Promise<void>;
  loadCompleted: () => Promise<void>;
  add: (
    input: { title: string; estimatedMinutes?: number; mentalLoad?: number; impact?: number; deadline?: string | null } & QuestSchedulerHints,
  ) => Promise<Quest>;
  update: (
    id: string,
    fields: Partial<Pick<Quest, 'title' | 'estimatedMinutes' | 'mentalLoad' | 'impact' | 'deadline'>> & QuestSchedulerHints,
  ) => Promise<Quest>;
  complete: (id: string) => Promise<CompleteQuestResult>;
  completeDaily: (id: string) => Promise<CompleteQuestResult>;
  notToday: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useQuestStore = create<QuestState>((set, get) => ({
  quests: [],
  recurring: [],
  completed: [],
  loading: false,
  error: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const quests = await api.quests.list();
      set({ quests, loading: false });
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },

  loadRecurring: async () => {
    try {
      const recurring = await api.quests.recurring();
      set({ recurring });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  loadCompleted: async () => {
    try {
      const completed = await api.quests.completed();
      set({ completed });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  add: async (input) => {
    const quest = await api.quests.create(input);
    if (input.isRecurring) {
      await get().loadRecurring();
    } else {
      await get().load();
    }
    return quest;
  },

  update: async (id, fields) => {
    const quest = await api.quests.update(id, fields);
    await Promise.all([get().load(), get().loadRecurring()]);
    return quest;
  },

  complete: async (id) => {
    const result = await api.quests.complete(id);
    const movedQuest = get().quests.find((q) => q.id === id);
    set({
      quests: get().quests.filter((q) => q.id !== id),
      completed: movedQuest
        ? [{ ...movedQuest, status: 'COMPLETE', completedAt: new Date().toISOString() }, ...get().completed]
        : get().completed,
    });
    return result;
  },

  completeDaily: async (id) => {
    const result = await api.quests.completeDaily(id);
    // Flip doneToday locally so the row dims instantly.
    set({
      recurring: get().recurring.map((q) =>
        q.id === id ? { ...q, doneToday: true } : q,
      ),
    });
    return result;
  },

  notToday: async (id) => {
    await api.quests.notToday(id);
    set({ quests: get().quests.filter((q) => q.id !== id) });
  },

  remove: async (id) => {
    await api.quests.delete(id);
    set({
      quests: get().quests.filter((q) => q.id !== id),
      recurring: get().recurring.filter((q) => q.id !== id),
      completed: get().completed.filter((q) => q.id !== id),
    });
  },
}));
