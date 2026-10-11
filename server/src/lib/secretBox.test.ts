import { describe, expect, it } from 'vitest';
import { hintOf, open, seal, sealingSecret } from './secretBox.js';

const SECRET = 'a-secret-of-reasonable-length';
const KEY = 'sk-test-0123456789abcdefWXYZ';

describe('sealing a key', () => {
  it('opens what it sealed', () => {
    expect(open(seal(KEY, SECRET), SECRET)).toBe(KEY);
  });

  it('never stores the key in the clear, and seals the same key differently each time', () => {
    const a = seal(KEY, SECRET);
    const b = seal(KEY, SECRET);
    expect(a).not.toContain(KEY);
    expect(a).not.toContain(Buffer.from(KEY).toString('base64url'));
    expect(a).not.toBe(b);
    expect(a.startsWith('v1.')).toBe(true);
  });

  it('gives nothing back under another secret', () => {
    expect(open(seal(KEY, SECRET), 'another-secret-entirely!')).toBeNull();
  });

  it('gives nothing back when what was stored has been altered', () => {
    const sealed = seal(KEY, SECRET);
    const parts = sealed.split('.');
    const body = Buffer.from(parts[3]!, 'base64url');
    body[0] = body[0]! ^ 1;
    expect(open([parts[0], parts[1], parts[2], body.toString('base64url')].join('.'), SECRET)).toBeNull();
    expect(open('v2.' + sealed.slice(3), SECRET)).toBeNull();
    expect(open('', SECRET)).toBeNull();
    expect(open('not sealed at all', SECRET)).toBeNull();
  });

  it('keeps unicode and long keys whole', () => {
    const long = 'k'.repeat(400) + 'é';
    expect(open(seal(long, SECRET), SECRET)).toBe(long);
  });
});

describe('where the secret comes from', () => {
  it('prefers the one set for the purpose, then sign-in, then the database', () => {
    const all = { AI_KEYS_SECRET: 'pinned-secret-0123456789', CLERK_SECRET_KEY: 'sk_test_0123456789abcdef', DATABASE_URL: 'postgres://user:pass@host/db' };
    expect(sealingSecret(all)).toBe(all.AI_KEYS_SECRET);
    expect(sealingSecret({ ...all, AI_KEYS_SECRET: '' })).toBe(all.CLERK_SECRET_KEY);
    expect(sealingSecret({ DATABASE_URL: all.DATABASE_URL })).toBe(all.DATABASE_URL);
  });

  it('has none to offer rather than a weak one', () => {
    expect(sealingSecret({})).toBeNull();
    expect(sealingSecret({ AI_KEYS_SECRET: 'short' })).toBeNull();
  });
});

describe('the hint', () => {
  it('is the last four characters, and nothing for a key too short to hide behind them', () => {
    expect(hintOf(KEY)).toBe('WXYZ');
    expect(hintOf('tiny')).toBe('');
  });
});
