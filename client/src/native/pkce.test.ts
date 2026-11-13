import { describe, expect, it } from 'vitest';
import { base64url, isValidChallenge, isValidState, newPkce, randomToken, s256Challenge, sha256Pure } from './pkce';

// RFC 7636, Appendix B: the 32 octets, the verifier they make, and its S256 challenge.
const RFC_OCTETS = [
  116, 24, 223, 180, 151, 153, 224, 37, 79, 250, 96, 125, 216, 173, 187, 186, 22, 212, 37, 77, 105, 214, 191, 240,
  91, 88, 5, 88, 83, 132, 141, 121,
];
const RFC_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const RFC_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const ascii = (s: string) => new TextEncoder().encode(s);

describe('base64url', () => {
  it('turns the RFC 7636 octets into its verifier', () => {
    expect(base64url(new Uint8Array(RFC_OCTETS))).toBe(RFC_VERIFIER);
  });
  it('has no padding and no + or /', () => {
    expect(base64url(new Uint8Array([0xfb, 0xff]))).toBe('-_8');
  });
});

describe('sha256Pure', () => {
  it('matches the FIPS 180-2 examples', () => {
    expect(hex(sha256Pure(ascii('')))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(hex(sha256Pure(ascii('abc')))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(hex(sha256Pure(ascii('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')))).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });
  it('agrees with Web Crypto across block boundaries', async () => {
    for (const n of [0, 1, 43, 55, 56, 63, 64, 65, 128, 200]) {
      const data = new Uint8Array(n).map((_, i) => (i * 31 + 7) & 0xff);
      const expected = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
      expect(hex(sha256Pure(data))).toBe(hex(expected));
    }
  });
});

describe('s256Challenge', () => {
  it('gives the RFC 7636 challenge with Web Crypto', async () => {
    expect(crypto.subtle).toBeDefined();
    expect(await s256Challenge(RFC_VERIFIER, crypto.subtle)).toBe(RFC_CHALLENGE);
  });
  it('gives the RFC 7636 challenge without it (an insecure context)', async () => {
    expect(await s256Challenge(RFC_VERIFIER, undefined)).toBe(RFC_CHALLENGE);
  });
  it('falls back when Web Crypto is there but refuses', async () => {
    const refusing = { digest: () => Promise.reject(new Error('not allowed')) } as unknown as SubtleCrypto;
    expect(await s256Challenge(RFC_VERIFIER, refusing)).toBe(RFC_CHALLENGE);
  });
});

describe('newPkce', () => {
  it('makes a 43-character verifier the server accepts, a 22-character state and a valid challenge', async () => {
    const { verifier, state, challenge } = await newPkce();
    expect(verifier).toMatch(/^[A-Za-z0-9._~-]{43,128}$/);
    expect(verifier).toHaveLength(43);
    expect(state).toHaveLength(22);
    expect(isValidState(state)).toBe(true);
    expect(isValidChallenge(challenge)).toBe(true);
    expect(challenge).toBe(await s256Challenge(verifier, undefined));
  });
  it('never repeats', () => {
    expect(randomToken(32)).not.toBe(randomToken(32));
  });
});

describe('validators', () => {
  it('accept only well-formed values', () => {
    expect(isValidChallenge(RFC_CHALLENGE)).toBe(true);
    expect(isValidChallenge(RFC_CHALLENGE + 'A')).toBe(false);
    expect(isValidChallenge(RFC_CHALLENGE.slice(1) + '=')).toBe(false);
    expect(isValidChallenge(null)).toBe(false);
    expect(isValidState('short')).toBe(false);
    expect(isValidState('abcdefghijklmnopqrstuv')).toBe(true);
    expect(isValidState('abcdefghijklmnop<script>')).toBe(false);
  });
});
