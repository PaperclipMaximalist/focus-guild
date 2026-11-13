/**
 * PKCE (RFC 7636) and the `state` value for the app's sign-in hand-off.
 *
 * The app keeps a random verifier to itself and sends only its S256
 * challenge out through the browser. The one-time code that comes back is
 * worth nothing without the verifier, so a code caught on the way (another
 * app claiming the focusguild:// scheme) cannot be traded for a token.
 *
 * Pure: no imports from the app, so it is unit-tested as is and the website's
 * /app-link page can use the validators without pulling in Capacitor.
 */

/** base64url without padding (RFC 4648 §5), as PKCE and the server expect. */
export function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** `n` random bytes, base64url. 32 bytes make a 43-character verifier; 16 a 22-character state. */
export function randomToken(n: number): string {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

// ─── SHA-256, for when crypto.subtle is missing ──────────────────────────────
// WKWebView may not count capacitor:// as a secure context, and then
// crypto.subtle is undefined. getRandomValues does not need one, so only the
// hash needs a fallback. FIPS 180-4, written for clarity over speed: it hashes
// one 43-byte string per sign-in.

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

/** SHA-256 of `data`, in plain JavaScript. */
export function sha256Pure(data: Uint8Array): Uint8Array {
  const bitLen = data.length * 8;
  // Message + 0x80 + zero padding + 64-bit length, to a multiple of 64 bytes.
  const padded = new Uint8Array(Math.ceil((data.length + 9) / 64) * 64);
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000));
  view.setUint32(padded.length - 4, bitLen >>> 0);

  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d;
    h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
  }
  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) outView.setUint32(i * 4, h[i]);
  return out;
}

/**
 * The S256 challenge for a verifier: base64url(SHA-256(ASCII(verifier))).
 * Uses Web Crypto when it is there, the pure hash when it is not. `subtle`
 * is a parameter so the tests can run both paths.
 */
export async function s256Challenge(
  verifier: string,
  subtle: SubtleCrypto | undefined = globalThis.crypto?.subtle,
): Promise<string> {
  const bytes = new TextEncoder().encode(verifier);
  if (subtle) {
    try {
      return base64url(new Uint8Array(await subtle.digest('SHA-256', bytes)));
    } catch {
      // Present but refusing (an insecure context can throw here): fall through.
    }
  }
  return base64url(sha256Pure(bytes));
}

/** A fresh verifier (32 random bytes) and state (16), and the verifier's challenge. */
export async function newPkce(): Promise<{ verifier: string; state: string; challenge: string }> {
  const verifier = randomToken(32);
  const state = randomToken(16);
  return { verifier, state, challenge: await s256Challenge(verifier) };
}

/** An S256 challenge: exactly 43 base64url characters. */
export const isValidChallenge = (s: string | null | undefined): s is string =>
  typeof s === 'string' && /^[A-Za-z0-9_-]{43}$/.test(s);

/** A state as the app makes it (22 characters), with room to grow, never anything that is not base64url. */
export const isValidState = (s: string | null | undefined): s is string =>
  typeof s === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(s);
