/**
 * Delete with Undo replaced the browser's "Are you sure?" boxes. Two promises
 * have to hold: Undo within the window means the server is never asked to
 * delete, and letting the window pass deletes exactly what was taken away.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/api', () => ({
  api: {
    quests: {
      delete: vi.fn(() => Promise.resolve(null)),
      uncomplete: vi.fn(),
      uncompleteDaily: vi.fn(),
      list: vi.fn(),
      completed: vi.fn(),
      recurring: vi.fn(),
    },
  },
}));

import { api, type Quest } from '../lib/api';
import { useToastStore } from '../components/Toasts';
import { useQuestStore } from './useQuestStore';

const quest = (id: string) => ({ id, title: `Quest ${id}` }) as Quest;
const ids = () => useQuestStore.getState().quests.map((q) => q.id);
const del = vi.mocked(api.quests.delete);

beforeEach(() => {
  vi.useFakeTimers();
  del.mockClear();
  del.mockImplementation(() => Promise.resolve(null));
  useToastStore.setState({ toasts: [] });
  useQuestStore.setState({ quests: [quest('a'), quest('b'), quest('c')], recurring: [], completed: [] });
});

describe('removeWithUndo', () => {
  it('takes the quest off the list at once and deletes it after the window', async () => {
    useQuestStore.getState().removeWithUndo('b');
    expect(ids()).toEqual(['a', 'c']);
    expect(del).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(9000);
    expect(del).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith('b');
  });

  it('Undo puts it back where it was and never calls the server', async () => {
    useQuestStore.getState().removeWithUndo('b');
    const toast = useToastStore.getState().toasts.at(-1)!;
    expect(toast.action?.label).toBe('Undo');

    toast.action!.run();
    expect(ids()).toEqual(['a', 'b', 'c']);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(del).not.toHaveBeenCalled();
  });

  it('removes several at once under one toast', async () => {
    useQuestStore.getState().removeWithUndo(['a', 'c']);
    expect(ids()).toEqual(['b']);
    expect(useToastStore.getState().toasts).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(9000);
    expect(del).toHaveBeenCalledTimes(2);
  });

  it('puts the quest back when the server refuses', async () => {
    del.mockImplementation(() => Promise.reject(new Error('nope')));
    const onUndo = vi.fn();
    useQuestStore.getState().removeWithUndo('a', { onUndo });

    await vi.advanceTimersByTimeAsync(9000);
    expect(ids()).toEqual(['a', 'b', 'c']);
    expect(onUndo).toHaveBeenCalled();
    expect(useToastStore.getState().toasts.at(-1)?.variant).toBe('error');
  });
});

/**
 * Undo for a mistaken tick: the server reopens the quest (and any steps the
 * completion closed), so the store reloads its lists from the server rather
 * than guessing what came back.
 */
describe('uncomplete', () => {
  const back = { quest: quest('d'), totalXP: 40, currentStreak: 2, multiplier: 1.43, relockedAchievements: [] };

  it('takes a quest off the completed list and reloads the active one', async () => {
    vi.mocked(api.quests.uncomplete).mockResolvedValue(back);
    vi.mocked(api.quests.list).mockResolvedValue([quest('a'), quest('d')]);
    vi.mocked(api.quests.completed).mockResolvedValue([]);
    useQuestStore.setState({ quests: [quest('a')], completed: [quest('d')] });

    const result = await useQuestStore.getState().uncomplete('d');
    expect(result.totalXP).toBe(40);
    expect(api.quests.uncomplete).toHaveBeenCalledWith('d');
    expect(ids()).toEqual(['a', 'd']);
    expect(useQuestStore.getState().completed).toEqual([]);
  });

  it('a round reads as not done today again', async () => {
    vi.mocked(api.quests.uncompleteDaily).mockResolvedValue({ ...back, quest: quest('r') });
    vi.mocked(api.quests.recurring).mockResolvedValue([{ ...quest('r'), doneToday: false }]);
    useQuestStore.setState({ recurring: [{ ...quest('r'), doneToday: true }] });

    await useQuestStore.getState().uncompleteDaily('r');
    expect(useQuestStore.getState().recurring[0]?.doneToday).toBe(false);
  });

  it('leaves the lists alone when the server refuses', async () => {
    vi.mocked(api.quests.uncomplete).mockRejectedValue(new Error('TOO_LATE'));
    useQuestStore.setState({ quests: [quest('a')], completed: [quest('d')] });

    await expect(useQuestStore.getState().uncomplete('d')).rejects.toThrow('TOO_LATE');
    expect(useQuestStore.getState().completed.map((q) => q.id)).toEqual(['d']);
  });
});
