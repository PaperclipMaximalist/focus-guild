/**
 * The notification module: a no-op on the website, and in the app it checks
 * permission, asks once, schedules one fixed-id notification, and never throws.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const plugin = {
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  schedule: vi.fn(),
  cancel: vi.fn(),
  removeDeliveredNotificationsById: vi.fn(),
  addListener: vi.fn(),
};
// Like the real thing: a Capacitor plugin is a Proxy that answers EVERY
// property with a method, `then` included. A promise that resolves to the bare
// plugin is taken for a thenable and never settles (on a phone that meant no
// notification was ever scheduled), so with this stand-in such code times out.
const proxied = new Proxy(plugin, {
  get: (target, prop) =>
    prop in target
      ? target[prop as keyof typeof plugin]
      : () => Promise.reject(new Error(`"LocalNotifications.${String(prop)}()" is not implemented`)),
});
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: proxied }));

async function load(native: boolean) {
  vi.resetModules();
  vi.doMock('./platform', () => ({ isNativeApp: native }));
  return import('./notify');
}

const endsAt = () => new Date(Date.now() + 25 * 60_000);

beforeEach(() => {
  for (const f of Object.values(plugin)) f.mockReset();
  plugin.checkPermissions.mockResolvedValue({ display: 'granted' });
  plugin.requestPermissions.mockResolvedValue({ display: 'granted' });
  plugin.schedule.mockResolvedValue({ notifications: [] });
  plugin.cancel.mockResolvedValue(undefined);
  plugin.removeDeliveredNotificationsById.mockResolvedValue(undefined);
});

describe('on the website', () => {
  it('does nothing', async () => {
    const n = await load(false);
    await n.scheduleTimerEnd({ questTitle: 'Q', durationMin: 25, endsAt: endsAt() });
    await n.cancelTimerEnd();
    n.onTimerNotificationTap(() => {})();
    await n.refreshNotifyPermission();
    expect(plugin.checkPermissions).not.toHaveBeenCalled();
    expect(plugin.schedule).not.toHaveBeenCalled();
    expect(plugin.cancel).not.toHaveBeenCalled();
    expect(plugin.addListener).not.toHaveBeenCalled();
    expect(n.notificationsAreOff()).toBe(false);
  });
});

describe('in the app', () => {
  it('schedules one notification with the fixed id, title, body and a sound', async () => {
    const n = await load(true);
    const at = endsAt();
    await n.scheduleTimerEnd({ questTitle: 'Write essay', durationMin: 25, endsAt: at });
    expect(plugin.schedule).toHaveBeenCalledTimes(1);
    const [{ notifications }] = plugin.schedule.mock.calls[0];
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      id: n.TIMER_NOTIFICATION_ID,
      title: "Time's up",
      body: 'Write essay: your 25 minutes are done.',
      schedule: { at },
    });
    // Heard and seen with the app open too: nothing else makes a sound at zero.
    expect(notifications[0].foreground).not.toBe(false);
    expect(notifications[0].sound).toBeTruthy();
    expect(plugin.requestPermissions).not.toHaveBeenCalled();
  });

  it('asks once when permission was never asked, then schedules', async () => {
    plugin.checkPermissions.mockResolvedValue({ display: 'prompt' });
    const n = await load(true);
    await n.scheduleTimerEnd({ questTitle: 'Q', durationMin: 5, endsAt: endsAt() });
    expect(plugin.requestPermissions).toHaveBeenCalledTimes(1);
    expect(plugin.schedule).toHaveBeenCalledTimes(1);
  });

  it('does not ask when told not to (a restored session)', async () => {
    plugin.checkPermissions.mockResolvedValue({ display: 'prompt' });
    const n = await load(true);
    await n.scheduleTimerEnd({ questTitle: 'Q', durationMin: 5, endsAt: endsAt(), askPermission: false });
    expect(plugin.requestPermissions).not.toHaveBeenCalled();
    expect(plugin.schedule).not.toHaveBeenCalled();
  });

  it('never asks again after a refusal and reports notifications off', async () => {
    plugin.checkPermissions.mockResolvedValue({ display: 'denied' });
    const n = await load(true);
    await n.scheduleTimerEnd({ questTitle: 'Q', durationMin: 5, endsAt: endsAt() });
    expect(plugin.requestPermissions).not.toHaveBeenCalled();
    expect(plugin.schedule).not.toHaveBeenCalled();
    expect(n.notificationsAreOff()).toBe(true);
  });

  it('a refusal at the prompt turns the line on', async () => {
    plugin.checkPermissions.mockResolvedValue({ display: 'prompt' });
    plugin.requestPermissions.mockResolvedValue({ display: 'denied' });
    const n = await load(true);
    await n.scheduleTimerEnd({ questTitle: 'Q', durationMin: 5, endsAt: endsAt() });
    expect(plugin.schedule).not.toHaveBeenCalled();
    expect(n.notificationsAreOff()).toBe(true);
  });

  it('schedules nothing in the past', async () => {
    const n = await load(true);
    await n.scheduleTimerEnd({ questTitle: 'Q', durationMin: 5, endsAt: new Date(Date.now() - 1000) });
    expect(plugin.schedule).not.toHaveBeenCalled();
  });

  it('cancel cancels the fixed id', async () => {
    const n = await load(true);
    await n.cancelTimerEnd();
    expect(plugin.cancel).toHaveBeenCalledWith({ notifications: [{ id: n.TIMER_NOTIFICATION_ID }] });
  });

  it('a cancel that lands while the prompt is open wins over the schedule', async () => {
    let answer: (v: { display: string }) => void = () => {};
    plugin.checkPermissions.mockResolvedValue({ display: 'prompt' });
    plugin.requestPermissions.mockReturnValue(new Promise((r) => (answer = r)));
    const n = await load(true);
    const pending = n.scheduleTimerEnd({ questTitle: 'Q', durationMin: 5, endsAt: endsAt() });
    await vi.waitFor(() => expect(plugin.requestPermissions).toHaveBeenCalled());
    await n.cancelTimerEnd();
    answer({ display: 'granted' });
    await pending;
    expect(plugin.schedule).not.toHaveBeenCalled();
  });

  it('never throws or rejects when the plugin fails', async () => {
    plugin.checkPermissions.mockRejectedValue(new Error('not implemented'));
    plugin.cancel.mockRejectedValue(new Error('not implemented'));
    plugin.addListener.mockRejectedValue(new Error('not implemented'));
    const n = await load(true);
    await expect(n.scheduleTimerEnd({ questTitle: 'Q', durationMin: 5, endsAt: endsAt() })).resolves.toBeUndefined();
    await expect(n.cancelTimerEnd()).resolves.toBeUndefined();
    await expect(n.refreshNotifyPermission()).resolves.toBeUndefined();
    n.onTimerNotificationTap(() => {})();
    // Let that listener attempt finish, so it cannot leak into the next test.
    await vi.waitFor(() => expect(plugin.addListener).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
  });

  it('tapping the notification calls back; other notifications and actions do not', async () => {
    let handler: (e: unknown) => void = () => {};
    plugin.addListener.mockImplementation(async (_n: string, h: (e: unknown) => void) => {
      handler = h;
      return { remove: vi.fn() };
    });
    const n = await load(true);
    const onTap = vi.fn();
    n.onTimerNotificationTap(onTap);
    await vi.waitFor(() => expect(plugin.addListener).toHaveBeenCalled());
    handler({ actionId: 'tap', notification: { id: 1 } });
    handler({ actionId: 'dismiss', notification: { id: n.TIMER_NOTIFICATION_ID } });
    expect(onTap).not.toHaveBeenCalled();
    handler({ actionId: 'tap', notification: { id: n.TIMER_NOTIFICATION_ID } });
    expect(onTap).toHaveBeenCalledTimes(1);
  });
});
