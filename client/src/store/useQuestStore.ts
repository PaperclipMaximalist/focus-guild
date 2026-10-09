import { create } from 'zustand';
import { Trash2, TriangleAlert } from 'lucide-react';
import { useToastStore } from '../components/Toasts';

/** How long a deleted quest can still be brought back. Just under the toast's own lifetime. */
const UNDO_WINDOW_MS = 5500;
import { api, type Quest, type CompleteQuestResult, type QuestSchedulerHints } from '../lib/api';
import { useScheduleStore } from './useScheduleStore';
import { duckReact } from './useMascotStore';

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
    input: {
      title: string;
      estimatedMinutes?: number;
      mentalLoad?: number;
      impact?: number;
      deadline?: string | null;
      tags?: string[];
    } & QuestSchedulerHints,
  ) => Promise<Quest>;
  update: (
    id: string,
    fields: Partial<Pick<Quest, 'title' | 'estimatedMinutes' | 'mentalLoad' | 'impact' | 'deadline' | 'tags'>> &
      QuestSchedulerHints,
  ) => Promise<Quest>;
  complete: (id: string) => Promise<CompleteQuestResult>;
  completeDaily: (id: string) => Promise<CompleteQuestResult>;
  notToday: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /**
   * Take quests off the screen now, delete them a few seconds later, and offer
   * Undo in between. Replaces "Are you sure?" boxes: nothing is lost by a
   * slip, and nothing asks a question on the way to a deliberate delete.
   */
  removeWithUndo: (ids: string | string[], opts?: { onUndo?: () => void }) => void;
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
      // Live-slot the new quest into the feed if a schedule already exists.
      try {
        if (useScheduleStore.getState().schedule.length > 0) {
          await useScheduleStore.getState().insertQuest(quest.id);
        }
      } catch {
        // Non-fatal — user can hit Reflow manually.
      }
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
    duckReact('questDone');
    // A finished quest is a departure: the platform scene lets its train go.
    window.dispatchEvent(new CustomEvent('fg:departed'));
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
    duckReact('questDone');
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

  removeWithUndo: (ids, opts) => {
    const gone = new Set(Array.isArray(ids) ? ids : [ids]);
    if (gone.size === 0) return;
    const before = { quests: get().quests, recurring: get().recurring, completed: get().completed };
    const keep = <T extends { id: string }>(list: T[]) => list.filter((q) => !gone.has(q.id));
    set({ quests: keep(before.quests), recurring: keep(before.recurring), completed: keep(before.completed) });

    let undone = false;
    const timer = setTimeout(() => {
      if (undone) return;
      void Promise.all([...gone].map((id) => api.quests.delete(id))).catch(() => {
        // The server said no: put them back rather than pretend.
        set(before);
        opts?.onUndo?.();
        useToastStore.getState().push({ icon: TriangleAlert, title: "Couldn't delete", sub: 'Nothing was removed. Try again.', variant: 'error' });
      });
    }, UNDO_WINDOW_MS);

    const title = [...before.quests, ...before.recurring, ...before.completed].find((q) => gone.has(q.id))?.title;
    useToastStore.getState().push({
      icon: Trash2,
      title: gone.size === 1 ? 'Quest deleted' : `${gone.size} quests deleted`,
      sub: gone.size === 1 && title ? title : 'Undo to bring them back',
      variant: 'xp',
      action: {
        label: 'Undo',
        run: () => {
          undone = true;
          clearTimeout(timer);
          // Restore only what this delete took; leave later changes alone.
          const back = <T extends { id: string }>(now: T[], was: T[]) => {
            const have = new Set(now.map((q) => q.id));
            return was.filter((q) => have.has(q.id) || gone.has(q.id)).map((q) => now.find((x) => x.id === q.id) ?? q);
          };
          set({
            quests: back(get().quests, before.quests),
            recurring: back(get().recurring, before.recurring),
            completed: back(get().completed, before.completed),
          });
          opts?.onUndo?.();
        },
      },
    });
  },
}));
