/**
 * Personal access tokens.
 *
 * One per user, shown once at creation and stored only as a hash. It
 * authenticates the inbox endpoint, the REST API (Authorization: Bearer) and
 * the MCP connector. Lives in lib/ so auth middleware and routes can share it
 * without importing each other.
 */

import { createHash, randomBytes } from 'node:crypto';

export const PAT_PREFIX = 'fgpat_';

export const hashPersonalToken = (token: string) => createHash('sha256').update(token).digest('hex');

export const newPersonalToken = () => `${PAT_PREFIX}${randomBytes(24).toString('base64url')}`;
