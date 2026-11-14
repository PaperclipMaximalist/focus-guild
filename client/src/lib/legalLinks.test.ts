import { describe, expect, it, vi } from 'vitest';

vi.mock('../native/platform', () => ({ isNativeApp: false, WEB_URL: 'https://web.example' }));

const { LEGAL_PAGES, legalHref } = await import('./legalLinks');

describe('legalHref', () => {
  it('is the site’s own page on the website', () => {
    expect(legalHref('privacy', false)).toBe('/privacy.html');
    expect(legalHref('terms', false)).toBe('/terms.html');
  });

  it('is the website’s copy, absolute, in the app (so the browser sheet opens it)', () => {
    expect(legalHref('support', true, 'https://web.example')).toBe('https://web.example/support.html');
    expect(legalHref('privacy', true, 'https://web.example/')).toBe('https://web.example/privacy.html');
  });

  it('lists the three pages in order', () => {
    expect(LEGAL_PAGES.map((p) => p.page)).toEqual(['privacy', 'terms', 'support']);
  });
});
