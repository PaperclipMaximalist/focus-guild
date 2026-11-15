/**
 * The Universal Link return for the iOS app's sign-in (lib/universalLink.ts).
 *
 *   GET /.well-known/apple-app-site-association  the file iOS reads to trust the app; 404 until APPLE_TEAM_ID is set
 *   GET /app-link/return                          the page shown only when iOS did NOT open the app
 *
 * Both are public: iOS and Apple's CDN fetch the file with no credentials, and
 * the return page is reached from a link in the member's browser. requireUser
 * skips exactly these two paths for GET.
 *
 * The return address carries the one-time sign-in code in its query. When
 * iOS hands the link to the app, this server never sees it. When it does not
 * (app not installed, the link opened elsewhere), this page must do nothing
 * with the code: it never reads the query, echoes it, or links anywhere with
 * it attached, and the request log hides the values (lib/requestLog.ts).
 */

import { Hono } from 'hono';
import { AASA_PATH, APP_LINK_RETURN_PATH, associationDocument } from '../lib/universalLink.js';

export const appLinkReturn = new Hono();

appLinkReturn.get(AASA_PATH, (c) => {
  const doc = associationDocument();
  // The same answer as any unknown route (app.ts), so an unconfigured server
  // says nothing more than that the file is not there. Never a redirect:
  // Apple does not follow one for this file.
  if (!doc) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } }, 404);
  return c.json(doc, 200);
});

// Fixed text, no scripts and no external requests: nothing on it can read the
// address the code arrived in, and nothing leaves the page.
const RETURN_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Finish signing in · Focus Guild</title>
</head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;padding:32px 16px;box-sizing:border-box;background:#06081A;color:#E8EEFF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<main style="width:100%;max-width:24rem;box-sizing:border-box;padding:24px;border-radius:16px;background:#131A3D;border:1px solid #27316A;">
<h1 style="margin:0;font-size:1.25rem;font-weight:700;">Finish signing in to the app</h1>
<p style="margin:8px 0 0;font-size:0.875rem;line-height:1.5;color:#9AA4D2;">This link finishes signing in to the Focus Guild app on your iPhone.</p>
<p style="margin:12px 0 0;font-size:0.875rem;line-height:1.5;">If you are seeing this page, the app did not open. Go back to the Focus Guild app and press Sign in again.</p>
</main>
</body>
</html>
`;

appLinkReturn.get(APP_LINK_RETURN_PATH, (c) => {
  c.header('Cache-Control', 'no-store');
  // The address holds the code; no page this one leads to may be told it.
  c.header('Referrer-Policy', 'no-referrer');
  return c.html(RETURN_PAGE, 200);
});
