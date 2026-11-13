/**
 * The parts of the app's shell that are decisions, not device calls: where a
 * link goes, the dev inset seam, and the first launch after an install
 * forgetting the Keychain.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { routeLink } from './links';
import { parseInsetParam } from './insets';

const h = vi.hoisted(() => ({ keychain: new Map<string, string>(), local: new Map<string, string>() }));

vi.mock('./platform', () => ({ isNativeApp: true, WEB_URL: 'https://web.example', APP_SCHEME: 'focusguild' }));
vi.mock('@capacitor/app', () => ({ App: { addListener: async () => ({ remove: async () => undefined }) } }));
vi.mock('@capacitor/browser', () => ({ Browser: { open: async () => undefined, close: async () => undefined } }));
vi.mock('capacitor-secure-storage-plugin', () => ({
  SecureStoragePlugin: {
    get: async ({ key }: { key: string }) => {
      if (!h.keychain.has(key)) throw new Error('Item with given key does not exist');
      return { value: h.keychain.get(key)! };
    },
    set: async ({ key, value }: { key: string; value: string }) => {
      h.keychain.set(key, value);
      return { value: true };
    },
    remove: async ({ key }: { key: string }) => {
      if (!h.keychain.delete(key)) throw new Error('Item with given key does not exist');
      return { value: true };
    },
  },
}));

const APP = 'capacitor://localhost/quests';
const DEV = 'http://127.0.0.1:5173/quests?native=1';

describe('routeLink', () => {
  it('sends another site to the in-app browser', () => {
    expect(routeLink('https://calendar.google.com/calendar/r?cid=x', APP)).toEqual({
      kind: 'browser',
      url: 'https://calendar.google.com/calendar/r?cid=x',
    });
    expect(routeLink('http://example.com', APP)).toEqual({ kind: 'browser', url: 'http://example.com/' });
    // The website is another site to the app too (privacy, terms, support).
    expect(routeLink('https://focusguild.app/privacy', APP)?.kind).toBe('browser');
  });

  it('leaves the app’s own pages alone', () => {
    expect(routeLink('/settings', APP)).toBeNull();
    expect(routeLink('#main', APP)).toBeNull();
    expect(routeLink('capacitor://localhost/feed', APP)).toBeNull();
    // The dev server is the app's own origin in the desktop preview.
    expect(routeLink('/settings', DEV)).toBeNull();
    expect(routeLink('http://127.0.0.1:5173/stats', DEV)).toBeNull();
    expect(routeLink('https://example.com/', DEV)?.kind).toBe('browser');
  });

  it('hands mail, phone and messages to the system', () => {
    expect(routeLink('mailto:help@example.com', APP)).toEqual({ kind: 'system', url: 'mailto:help@example.com' });
    expect(routeLink('tel:+15550100', APP)?.kind).toBe('system');
    expect(routeLink('sms:+15550100', APP)?.kind).toBe('system');
  });

  it('ignores what is not a link to follow', () => {
    expect(routeLink(null, APP)).toBeNull();
    expect(routeLink('', APP)).toBeNull();
    expect(routeLink('javascript:void(0)', APP)).toBeNull();
    expect(routeLink('blob:capacitor://localhost/1234', APP)).toBeNull();
    expect(routeLink('data:text/plain,hi', APP)).toBeNull();
    expect(routeLink('https://example.com', 'not a url')).toBeNull();
  });
});

describe('parseInsetParam', () => {
  it('reads top,bottom in px', () => {
    expect(parseInsetParam('47,34')).toEqual({ top: 47, bottom: 34 });
    expect(parseInsetParam(' 59 , 34 ')).toEqual({ top: 59, bottom: 34 });
    expect(parseInsetParam('20,0')).toEqual({ top: 20, bottom: 0 });
    expect(parseInsetParam('47.5,34')).toEqual({ top: 47.5, bottom: 34 });
  });

  it('clears on 0, off or none', () => {
    expect(parseInsetParam('0')).toBe('clear');
    expect(parseInsetParam('off')).toBe('clear');
    expect(parseInsetParam('NONE')).toBe('clear');
  });

  it('ignores anything else', () => {
    expect(parseInsetParam(null)).toBeNull();
    expect(parseInsetParam('')).toBeNull();
    expect(parseInsetParam('47')).toBeNull();
    expect(parseInsetParam('47,34,0')).toBeNull();
    expect(parseInsetParam('-1,34')).toBeNull();
    expect(parseInsetParam('47px,34px')).toBeNull();
    expect(parseInsetParam('900,34')).toBeNull();
  });
});

describe('forgetSessionOnFirstLaunch', () => {
  beforeEach(() => {
    h.keychain.clear();
    h.local.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => h.local.get(k) ?? null,
      setItem: (k: string, v: string) => void h.local.set(k, String(v)),
      removeItem: (k: string) => void h.local.delete(k),
    });
  });

  const signedIn = () => {
    h.keychain.set('focusGuild.deviceToken', 'fgd_old');
    h.keychain.set('focusGuild.deviceClerkId', 'user_old');
  };

  it('clears a session left in the Keychain by a deleted install, once', async () => {
    const { forgetSessionOnFirstLaunch } = await import('./auth');
    signedIn();
    await forgetSessionOnFirstLaunch();
    expect(h.keychain.size).toBe(0);
    expect(h.local.get('focusGuild.installed')).toBe('1');

    // Signed in again afterwards: the next launch keeps it.
    signedIn();
    await forgetSessionOnFirstLaunch();
    expect(h.keychain.size).toBe(2);
  });

  it('never clears when localStorage cannot be read', async () => {
    const { forgetSessionOnFirstLaunch } = await import('./auth');
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => undefined,
    });
    signedIn();
    await forgetSessionOnFirstLaunch();
    expect(h.keychain.size).toBe(2);
  });
});
