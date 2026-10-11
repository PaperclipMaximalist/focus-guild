/**
 * Sealing a secret before it is stored.
 *
 * People hand the Guild API keys for their own AI accounts. Those are money:
 * whoever holds one can spend on that account. So a key is never stored as
 * typed. It is sealed with AES-256-GCM under a key the database does not
 * hold, and opened only in memory at the moment a request to the provider is
 * made. A copy of the database alone gives up nothing.
 *
 * The sealing secret comes from the environment, first match wins:
 *
 *   AI_KEYS_SECRET     set this on the server to pin it (recommended)
 *   CLERK_SECRET_KEY   already there wherever sign-in is on
 *   DATABASE_URL       the local, account-free setup
 *
 * If the secret changes (a rotated Clerk key, say), what was sealed under the
 * old one cannot be opened: `open` returns null and the person pastes the key
 * again. Nothing breaks and nothing leaks; that is the failure to prefer.
 *
 * Pure apart from reading the environment once; `seal`/`open` take the secret
 * as an argument so they can be tested without one.
 */

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

const VERSION = 'v1';
const INFO = 'focus-guild ai connection keys';

/** The secret everything is sealed under, or null when the server has none to offer. */
export function sealingSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  for (const name of ['AI_KEYS_SECRET', 'CLERK_SECRET_KEY', 'DATABASE_URL']) {
    const value = env[name]?.trim();
    if (value && value.length >= 16) return value;
  }
  return null;
}

const keyFrom = (secret: string) => Buffer.from(hkdfSync('sha256', secret, 'focus-guild', INFO, 32));

/** `v1.<iv>.<tag>.<ciphertext>`, each part base64url. A fresh iv every time. */
export function seal(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(secret), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), body.toString('base64url')].join('.');
}

/** What was sealed, or null if this secret did not seal it or it has been altered. */
export function open(sealed: string, secret: string): string | null {
  const [version, iv, tag, body] = sealed.split('.');
  if (version !== VERSION || !iv || !tag || body === undefined) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', keyFrom(secret), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** The end of a key, to recognise it by. Short keys give nothing away. */
export function hintOf(key: string): string {
  return key.length >= 12 ? key.slice(-4) : '';
}
