/**
 * Coming back to the app after a while: what is on screen may be hours old
 * (a new day, quests finished on the website). native/shell.ts calls
 * refreshAfterResume() when the app returns from the background after
 * RESUME_STALE_MS or more.
 *
 * It re-fetches only what has already been loaded, through the stores' own
 * loaders, so the page re-renders in place: no reload, no skeleton, nothing
 * the member typed is lost. Pages or stores with anything else to refresh can
 * listen for RESUME_EVENT on window.
 */

import { useUserStore } from '../store/useUserStore';
import { useQuestStore } from '../store/useQuestStore';
import { useCheckInStore } from '../store/useCheckInStore';
import { useScheduleStore } from '../store/useScheduleStore';
import { useTrackerStore } from '../store/useTrackerStore';

/** Away for less than this, and nothing is refetched. */
export const RESUME_STALE_MS = 3 * 60 * 1000;

/** Fired on window after the stores below have been asked to refresh. `detail.awayMs` says for how long. */
export const RESUME_EVENT = 'fg:resume';

/** True when the app was in the background long enough for the screen to be stale. */
export function isStale(pausedAt: number | null, now: number): boolean {
  return pausedAt != null && now - pausedAt >= RESUME_STALE_MS;
}

export function refreshAfterResume(awayMs: number): void {
  // Signed out, or still loading the first time: nothing on screen to refresh.
  if (!useUserStore.getState().user) return;

  void useUserStore.getState().refresh();

  const quests = useQuestStore.getState();
  if (quests.quests.length || quests.recurring.length || quests.completed.length) {
    void quests.load();
    void quests.loadRecurring();
    void quests.loadCompleted();
  }

  // Cheap, and Today's "checked in" state turns over with the day.
  void useCheckInStore.getState().load();

  if (useScheduleStore.getState().generatedAt) void useScheduleStore.getState().fetch();

  if (useTrackerStore.getState().loaded) void useTrackerStore.getState().load();

  window.dispatchEvent(new CustomEvent(RESUME_EVENT, { detail: { awayMs } }));
}
