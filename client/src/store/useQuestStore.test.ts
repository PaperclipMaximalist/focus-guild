/**
 * Delete with Undo replaced the browser's "Are you sure?" boxes. Two promises
 * have to hold: Undo within the window means the server is never asked to
 * delete, and letting the window pass deletes exactly what was taken away.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/api', () => ({
  api: { quests: { delete: vi.fn(() => Promise.resolve()) } },
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
  del.mockImplementation(() => Promise.resolve());
  useToastStore.setState({ toasts: [] });
  useQuestStore.setState({ quests: [quest('a'), quest('b'), quest('c')], recurring: [], completed: [] });
});

describe('removeWithUndo', () => {
  it('takes the quest off the list at once and deletes it after the window', async () => {
    useQuestStore.getState().removeWithUndo('b');
    expect(ids()).toEqual(['a', 'c']);
    expect(del).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(6000);
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

    await vi.advanceTimersByTimeAsync(6000);
    expect(del).toHaveBeenCalledTimes(2);
  });

  it('puts the quest back when the server refuses', async () => {
    del.mockImplementation(() => Promise.reject(new Error('nope')));
    const onUndo = vi.fn();
    useQuestStore.getState().removeWithUndo('a', { onUndo });

    await vi.advanceTimersByTimeAsync(6000);
    expect(ids()).toEqual(['a', 'b', 'c']);
    expect(onUndo).toHaveBeenCalled();
    expect(useToastStore.getState().toasts.at(-1)?.variant).toBe('error');
  });
});
