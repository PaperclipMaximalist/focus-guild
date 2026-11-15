/**
 * The Universal Link switch: off unless both variables are right, and the
 * association file names exactly one path.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { APP_LINK_RETURN_PATH, associationDocument, returnVia } from './universalLink.js';

const KEYS = ['APPLE_TEAM_ID', 'IOS_BUNDLE_ID', 'APP_LINK_RETURN'] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

function setEnv(env: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const k of KEYS) {
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
}

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const MALFORMED = ['ABCDE1234', 'abcde12345', 'ABCDE123456', 'ABCDE-1234', ' ABCDE1234', 'ABCDE12345 ', ''];

describe('associationDocument', () => {
  it('names the app and the one return path with a valid team ID', () => {
    setEnv({ APPLE_TEAM_ID: 'ABCDE12345' });
    expect(APP_LINK_RETURN_PATH).toBe('/app-link/return');
    expect(associationDocument()).toEqual({
      applinks: {
        details: [
          {
            appIDs: ['ABCDE12345.com.focusguild.app'],
            components: [{ '/': '/app-link/return', comment: 'Sign-in hand-off to the app' }],
          },
        ],
      },
    });
  });

  it('uses IOS_BUNDLE_ID when it is set', () => {
    setEnv({ APPLE_TEAM_ID: 'ABCDE12345', IOS_BUNDLE_ID: 'com.example.other' });
    expect(JSON.stringify(associationDocument())).toContain('"ABCDE12345.com.example.other"');
  });

  it('is null without a team ID, or with one of the wrong shape', () => {
    setEnv({});
    expect(associationDocument()).toBeNull();
    for (const bad of MALFORMED) {
      setEnv({ APPLE_TEAM_ID: bad, APP_LINK_RETURN: 'universal' });
      expect(associationDocument(), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe('returnVia', () => {
  it('is universal only with the switch and a valid team ID', () => {
    const cases: Array<[string | undefined, string | undefined, 'universal' | 'scheme']> = [
      [undefined, undefined, 'scheme'],
      [undefined, 'universal', 'scheme'],
      ['ABCDE12345', undefined, 'scheme'],
      ['ABCDE12345', 'scheme', 'scheme'],
      ['ABCDE12345', 'Universal', 'scheme'],
      ['ABCDE12345', 'universal ', 'scheme'],
      ['ABCDE12345', 'unversal', 'scheme'],
      ['ABCDE12345', '1', 'scheme'],
      ['ABCDE12345', 'universal', 'universal'],
      ...MALFORMED.map((t): [string, string, 'scheme'] => [t, 'universal', 'scheme']),
    ];
    for (const [team, ret, want] of cases) {
      setEnv({ APPLE_TEAM_ID: team, APP_LINK_RETURN: ret });
      expect(returnVia(), `${team} / ${ret}`).toBe(want);
    }
  });
});
