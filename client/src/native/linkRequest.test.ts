/**
 * The Universal Link hand-off address the website builds after Connect.
 */

import { describe, expect, it } from 'vitest';
import { APP_LINK_RETURN_PATH, appLinkReturnUrl } from './linkRequest';

describe('appLinkReturnUrl', () => {
  it('puts the code and state on the API host’s return path', () => {
    expect(APP_LINK_RETURN_PATH).toBe('/app-link/return');
    expect(appLinkReturnUrl('https://api.example.com', 'CODE', 'STATE')).toBe(
      'https://api.example.com/app-link/return?code=CODE&state=STATE',
    );
    expect(appLinkReturnUrl('http://127.0.0.1:3161', 'c', 's')).toBe('http://127.0.0.1:3161/app-link/return?code=c&state=s');
  });

  it('ignores a trailing slash on the API address', () => {
    expect(appLinkReturnUrl('https://api.example.com/', 'c', 's')).toBe('https://api.example.com/app-link/return?code=c&state=s');
  });

  it('encodes the values, so neither can add a parameter or change the path', () => {
    const url = new URL(appLinkReturnUrl('https://api.example.com', 'a&state=evil#x', 'b/../../y?z'));
    expect(url.origin).toBe('https://api.example.com');
    expect(url.pathname).toBe('/app-link/return');
    expect(url.hash).toBe('');
    expect([...url.searchParams.keys()]).toEqual(['code', 'state']);
    expect(url.searchParams.get('code')).toBe('a&state=evil#x');
    expect(url.searchParams.get('state')).toBe('b/../../y?z');
  });
});
