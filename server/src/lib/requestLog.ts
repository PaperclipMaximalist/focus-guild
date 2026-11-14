/**
 * The request log: one line when a request arrives and one when it is
 * answered.
 *
 *   <-- GET /quests?tz=480
 *   --> GET /quests?tz=480 200 12ms
 *
 * It goes to stdout, which the host keeps, so a line must never hold a
 * credential. Two addresses carry one, because the tools that call them cannot
 * send headers: the plan feed (/calendar/<token>.ics) and the inbox when a
 * tool uses ?token=. Hono's own logger prints the address as it came, token
 * and all, which is why this replaces it.
 *
 * What is hidden:
 *   - everything after /calendar/, whatever it is;
 *   - the value of any `token` query parameter, on any path;
 *   - anything shaped like one of our tokens (fgpat_, fgcal_, fgd_) wherever
 *     else it turns up, for the caller who pastes one into the wrong place.
 * Headers and bodies were never printed and still are not.
 */

import type { MiddlewareHandler } from 'hono';

const REDACTED = '[redacted]';

/** One of our own tokens: keep the prefix, which says what kind it was, and drop the secret. */
const OWN_TOKEN = /fg(pat|cal|d)_[A-Za-z0-9_-]+/g;

const FEED_PATH = '/calendar/';

function decoded(part: string): string {
  try {
    return decodeURIComponent(part.replace(/\+/g, ' '));
  } catch {
    return part;
  }
}

/**
 * The address to print for a request.
 *
 * `target` is the path and query as they arrived, percent-encoding intact: it
 * is what gets printed, so a caller cannot forge a log line with an encoded
 * line break. `routedPath` is the path the router matched on (Hono decodes
 * it); the feed is recognised from that, so /%63alendar/… is hidden too.
 */
export function maskTarget(target: string, routedPath?: string): string {
  const q = target.indexOf('?');
  const rawPath = q === -1 ? target : target.slice(0, q);
  const rawQuery = q === -1 ? null : target.slice(q + 1);

  const path = (routedPath ?? decoded(rawPath)).toLowerCase();
  const shownPath = path.startsWith(FEED_PATH) ? `${FEED_PATH}${REDACTED}${path.endsWith('.ics') ? '.ics' : ''}` : rawPath;

  const shownQuery =
    rawQuery === null
      ? ''
      : `?${rawQuery
          .split('&')
          .map((pair) => {
            const eq = pair.indexOf('=');
            if (eq === -1) return pair;
            const key = pair.slice(0, eq);
            // The key is compared decoded: Hono reads ?%74oken= as `token` too.
            return decoded(key).toLowerCase() === 'token' ? `${key}=${REDACTED}` : pair;
          })
          .join('&')}`;

  return `${shownPath}${shownQuery}`.replace(OWN_TOKEN, (_whole, kind: string) => `fg${kind}_${REDACTED}`);
}

const took = (ms: number) => (ms < 1000 ? `${ms}ms` : `${Math.round(ms / 1000)}s`);

/**
 * Logs method, masked address, status and time for every request. `print` is
 * replaceable for tests; the default looks console.log up on each line, so a
 * test that spies on the console sees what production would print.
 */
export function requestLog(print: (line: string) => void = (line) => console.log(line)): MiddlewareHandler {
  return async (c, next) => {
    const url = c.req.url;
    // Past the scheme's "//" and the host: the first "/" after position 8, as Hono's logger finds it.
    const at = url.indexOf('/', 8);
    const target = maskTarget(at === -1 ? '/' : url.slice(at), c.req.path);
    const { method } = c.req;
    print(`<-- ${method} ${target}`);
    const start = Date.now();
    await next();
    print(`--> ${method} ${target} ${c.res.status} ${took(Date.now() - start)}`);
  };
}
