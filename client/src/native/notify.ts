/**
 * "Time's up" for the focus timer, as a local notification (app only).
 *
 * The timer calls three things: scheduleTimerEnd, cancelTimerEnd and (from the
 * host component) onTimerNotificationTap. All of them do nothing on the
 * website, and none of them can throw or reject: the plugins are missing or
 * web implementations in a desktop browser (`?native=1`), and the timer must
 * work exactly the same there.
 *
 * Plugins are imported on first use, so the website's bundle never loads them.
 *
 * iOS facts this relies on (read from the plugin's Swift source):
 *   - schedule() asks for permission by itself when it was never asked, so we
 *     check and ask explicitly first, and only then schedule.
 *   - with no `sound`, a local notification is SILENT on iOS; a name that is
 *     not a file in the bundle plays the system default.
 *   - the banner and sound also come while the app is open (the plugin's
 *     willPresent shows them by default). That is wanted: nothing else in the
 *     app makes a sound at zero, and the member may be on another page with
 *     the timer down in its chip. (`foreground: false` would hide it.)
 *   - one id, scheduled again, replaces the pending request.
 */

import { useSyncExternalStore } from 'react';
import { isNativeApp } from './platform';

/** The one pending notification: the end of the running focus session. */
export const TIMER_NOTIFICATION_ID = 7001;

export interface TimerEnd {
  questTitle: string;
  durationMin: number;
  endsAt: Date;
  /** False to only check permission, never show the system prompt (a session restored at launch). Default true. */
  askPermission?: boolean;
}

type Permission = 'unknown' | 'granted' | 'denied' | 'prompt';

// ─── permission state, for the one quiet line on the timer screen ───────────────

let permission: Permission = 'unknown';
const listeners = new Set<() => void>();

function setPermission(raw: string): void {
  const next: Permission = raw === 'granted' ? 'granted' : raw === 'denied' ? 'denied' : 'prompt';
  if (next === permission) return;
  permission = next;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** True only in the app, once the member has refused notifications (or switched them off in Settings). */
export function notificationsAreOff(): boolean {
  return isNativeApp && permission === 'denied';
}

/** For the timer screen: show "Notifications are off…" when true. */
export function useNotificationsOff(): boolean {
  return useSyncExternalStore(subscribe, notificationsAreOff, () => false);
}

/**
 * The plugin, loaded on first use. Handed back inside an object on purpose: a
 * Capacitor plugin is a Proxy that answers every property, `then` included,
 * so a promise resolving to the bare plugin is taken for a thenable and never
 * settles. (Unit tests with a plain-object stand-in cannot see that; the test
 * with a Proxy in notify.test.ts can.)
 */
async function plugin() {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  return { ln: LocalNotifications };
}

/** Re-reads the permission (no prompt). Cheap; call on launch and when the app returns to the front. */
export async function refreshNotifyPermission(): Promise<void> {
  if (!isNativeApp) return;
  try {
    const { ln } = await plugin();
    setPermission((await ln.checkPermissions()).display);
  } catch { /* no plugin here */ }
}

// ─── schedule / cancel ──────────────────────────────────────────────────────────

// Every call bumps this; an older call that wakes up from an await (the system
// prompt can stay open for a long time) sees it changed and gives up, so a
// pause or stop is never overtaken by a schedule that was still waiting.
let seq = 0;

export async function scheduleTimerEnd(end: TimerEnd): Promise<void> {
  if (!isNativeApp) return;
  const mine = ++seq;
  try {
    const { ln } = await plugin();
    let state: string = (await ln.checkPermissions()).display;
    if (mine !== seq) return;
    // Asked once, at the moment the member starts a timer. Never again after a refusal.
    if (state !== 'granted' && state !== 'denied' && end.askPermission !== false) {
      state = (await ln.requestPermissions()).display;
      if (mine !== seq) return;
    }
    setPermission(state);
    if (state !== 'granted') return;
    if (end.endsAt.getTime() <= Date.now() + 1000) return;
    const minutes = Math.max(1, Math.round(end.durationMin));
    await ln.schedule({
      notifications: [
        {
          id: TIMER_NOTIFICATION_ID,
          title: "Time's up",
          body: `${end.questTitle}: your ${minutes} minutes are done.`,
          schedule: { at: end.endsAt, allowWhileIdle: true },
          sound: 'default',
        },
      ],
    });
  } catch { /* never breaks the timer */ }
}

export async function cancelTimerEnd(): Promise<void> {
  if (!isNativeApp) return;
  seq++;
  try {
    const { ln } = await plugin();
    await ln.cancel({ notifications: [{ id: TIMER_NOTIFICATION_ID }] }).catch(() => {});
    // One that already fired while the app was away should not sit in the list after the session is over.
    await ln.removeDeliveredNotificationsById({ ids: [TIMER_NOTIFICATION_ID] }).catch(() => {});
  } catch { /* no plugin here */ }
}

// ─── tapping it ─────────────────────────────────────────────────────────────────

/**
 * Calls `onTap` when the member taps the "time's up" notification (also when
 * that tap is what launched the app). Returns the cleanup. Call from an effect.
 */
export function onTimerNotificationTap(onTap: () => void): () => void {
  if (!isNativeApp) return () => {};
  let removed = false;
  let remove: (() => void) | null = null;
  void (async () => {
    try {
      const { ln } = await plugin();
      const handle = await ln.addListener('localNotificationActionPerformed', (e) => {
        if (e.notification.id === TIMER_NOTIFICATION_ID && e.actionId === 'tap') onTap();
      });
      const off = () => void Promise.resolve(handle.remove()).catch(() => {});
      if (removed) off();
      else remove = off;
    } catch { /* no plugin here */ }
  })();
  return () => {
    removed = true;
    remove?.();
  };
}
