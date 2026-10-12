/**
 * Which AI answers for a given person, and the one call every AI feature makes.
 *
 * In order:
 *   1. The AI the person connected with their own key (Settings → Advanced →
 *      Your AI; rows in `ai_connections`, the one marked default).
 *   2. The server's own Claude key, `ANTHROPIC_API_KEY`, if the server has one.
 *   3. Neither: the feature answers 503 `AI_NOT_CONFIGURED` and says where to
 *      connect one.
 *
 * Steps ("Break down"), Ask the Guild and the list writer all go through
 * `completeFor`, so connecting an AI turns all three on at once and none of
 * them knows which provider it is talking to.
 */

import { db } from '../db/client.js';
import { AiError, complete, describeConnection, pickActive, unseal, type CompletionRequest, type Connection } from './aiProviders.js';

export { aiFailure, describeConnection, pickActive, unseal } from './aiProviders.js';

const KEY = process.env['ANTHROPIC_API_KEY'];
/** The model used with the server's own key. A connected AI uses the model chosen for it. */
export const AI_MODEL = 'claude-opus-5';

/** True when the server has a Claude key of its own. Not the whole story: see `completeFor`. */
export const AI_ENABLED = !!KEY && KEY.length > 10;

export const NOT_CONFIGURED_MESSAGE = 'No AI is connected. Connect one in Settings → Advanced → Your AI.';

/** Remember how the last call on a connection went. Never worth failing a request over. */
function record(id: string, error: string | null): void {
  void db.aiConnection
    .update({ where: { id }, data: error === null ? { lastUsedAt: new Date(), lastError: null } : { lastError: error.slice(0, 300) } })
    .catch(() => undefined);
}

/**
 * Ask whichever AI this person has. Returns the text and who gave it.
 * Throws `AiError`; `aiFailure` turns one into the route's answer.
 */
export async function completeFor(userId: string, req: CompletionRequest): Promise<{ text: string; via: string }> {
  const rows = await db.aiConnection.findMany({ where: { userId } });
  const row = pickActive(rows);
  if (row) {
    const conn = unseal(row);
    try {
      const text = await complete(conn, req);
      record(row.id, null);
      return { text, via: describeConnection(conn) };
    } catch (e) {
      record(row.id, e instanceof Error ? e.message : String(e));
      throw e;
    }
  }
  if (!AI_ENABLED) throw new AiError('AI_NOT_CONFIGURED', NOT_CONFIGURED_MESSAGE, 503);
  const conn: Connection = { provider: 'anthropic', apiKey: KEY!, model: AI_MODEL };
  return { text: await complete(conn, req), via: `${describeConnection(conn)} (the server's own key)` };
}

if (!AI_ENABLED) {
  // eslint-disable-next-line no-console
  console.warn('[ai] ANTHROPIC_API_KEY not set: AI features run only for people who connect their own AI.');
}
