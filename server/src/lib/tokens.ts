/**
 * The two tokens a member can make for themselves. Each is shown once, when it
 * is made, and stored only as a hash.
 *
 *   fgpat_…  the personal access token. It authenticates the inbox endpoint,
 *            the REST API (Authorization: Bearer) and the MCP connector, so it
 *            can read and change the whole account.
 *   fgcal_…  the calendar feed token: the secret part of the published plan
 *            link, /calendar/<token>.ics. It opens that feed and nothing else.
 *            A feed link gets pasted into other companies' calendar apps, so
 *            it must not be worth more than the plan it shows.
 *
 * The prefixes are how the server tells them apart (and from a device token,
 * fgd_…, in deviceSessions.ts). Lives in lib/ so auth middleware and routes
 * can share it without importing each other.
 */

import { createHash, randomBytes } from 'node:crypto';

const sha256 = (token: string) => createHash('sha256').update(token).digest('hex');

export const PAT_PREFIX = 'fgpat_';

export const hashPersonalToken = sha256;

export const newPersonalToken = () => `${PAT_PREFIX}${randomBytes(24).toString('base64url')}`;

export const FEED_PREFIX = 'fgcal_';

export const hashFeedToken = sha256;

export const newFeedToken = () => `${FEED_PREFIX}${randomBytes(24).toString('base64url')}`;
