/**
 * Opening the quest editor for a new quest, from anywhere: the sidebar button,
 * the N key, the command palette.
 *
 * A page that has the editor (Today, Quests) listens for `quest-modal:open`
 * and calls preventDefault() to say it opened it. When no page on screen does,
 * go to Today, which opens it as it arrives (takePendingNewQuest).
 */

export const QUEST_MODAL_OPEN = 'quest-modal:open';

let pending = false;

export function openNewQuest(navigate: (to: string) => void) {
  const opened = !window.dispatchEvent(new CustomEvent(QUEST_MODAL_OPEN, { cancelable: true }));
  if (opened) return;
  pending = true;
  navigate('/');
}

/** True once if a new quest was asked for on the way to Today. */
export function takePendingNewQuest(): boolean {
  const was = pending;
  pending = false;
  return was;
}
