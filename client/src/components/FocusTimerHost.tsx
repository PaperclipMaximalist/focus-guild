/**
 * The one focus timer screen for the whole app, mounted once in Shell.
 *
 * The session lives in useTimerStore; this only shows it. Completing from the
 * screen runs the shared completion (XP, sounds, toasts) and then tells the
 * page, so the Route can re-plan around the finished quest.
 */

import { useEffect, useRef } from 'react';
import { FocusTimer } from './FocusTimer';
import { useTimerStore } from '../store/useTimerStore';
import { useQuestStore } from '../store/useQuestStore';
import { useCompleteQuest } from '../lib/useCompleteQuest';
import { onTimerNotificationTap, refreshNotifyPermission } from '../native/notify';
import { isNativeApp } from '../native/platform';

export function FocusTimerHost() {
  const open = useTimerStore((s) => s.open);
  const active = useTimerStore((s) => s.active);
  const hide = useTimerStore((s) => s.hide);
  const recurring = useQuestStore((s) => s.recurring);
  const complete = useCompleteQuest();
  const screenOpen = open && !!active;

  // App only: tapping the "time's up" notification opens the timer, and the notification permission is
  // re-read at launch and whenever the app comes back to the front (it can be changed in Settings).
  useEffect(() => {
    if (!isNativeApp) return;
    const offTap = onTimerNotificationTap(() => useTimerStore.getState().show());
    void refreshNotifyPermission();
    let offState: (() => void) | null = null;
    let gone = false;
    void import('@capacitor/app')
      .then(({ App }) =>
        App.addListener('appStateChange', (s) => {
          if (s.isActive) void refreshNotifyPermission();
        }),
      )
      .then((h) => {
        const off = () => void Promise.resolve(h.remove()).catch(() => {});
        if (gone) off();
        else offState = off;
      })
      .catch(() => { /* no app plugin here */ });
    return () => {
      gone = true;
      offTap();
      offState?.();
    };
  }, []);

  // When the screen closes and the thing that opened it is gone (the quest
  // sheet), focus would fall to nothing: put it on the chip, or the page.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !screenOpen) {
      const now = document.activeElement;
      if (!now || now === document.body) {
        const chip = [...document.querySelectorAll<HTMLElement>('[data-timer-chip]')].find((el) => el.offsetParent !== null);
        (chip ?? document.getElementById('main'))?.focus({ preventScroll: true });
      }
    }
    wasOpen.current = screenOpen;
  }, [screenOpen]);

  return (
    <FocusTimer
      open={screenOpen}
      onClose={hide}
      onComplete={async (questId) => {
        // The session says whether it is a round; the loaded list is the fallback for a session started before it did.
        const daily = useTimerStore.getState().active?.daily ?? recurring.some((q) => q.id === questId);
        await complete(questId, { daily, sub: 'Focus block complete' });
        // Pages that count finished quests (Mileage) read the list, which may never have been loaded here.
        void useQuestStore.getState().loadCompleted();
        window.dispatchEvent(new CustomEvent('fg:timer-completed', { detail: { questId } }));
      }}
    />
  );
}
