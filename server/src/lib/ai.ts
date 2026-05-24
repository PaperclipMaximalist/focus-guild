/**
 * Anthropic SDK wrapper. Centralizes "is AI configured?" so routes can
 * cleanly 503 when ANTHROPIC_API_KEY is missing.
 *
 * Add the key to server `.env` (or Railway Variables) to enable the
 * /quests/:id/decompose endpoint and any other AI features.
 */

import Anthropic from '@anthropic-ai/sdk';

const KEY = process.env['ANTHROPIC_API_KEY'];
export const AI_ENABLED = !!KEY && KEY.length > 10;

let client: Anthropic | null = null;

export function getClient(): Anthropic {
  if (!AI_ENABLED) {
    throw new Error('AI_NOT_CONFIGURED');
  }
  if (!client) client = new Anthropic({ apiKey: KEY });
  return client;
}

if (!AI_ENABLED) {
  // eslint-disable-next-line no-console
  console.warn(
    '[ai] ANTHROPIC_API_KEY not set — AI features (Quest Decomposer) will return 503.',
  );
}
