/**
 * The sign-in hand-off to the iOS app as a Universal Link.
 *
 * Today the website returns the one-time code through `focusguild://link`, a
 * custom scheme any app on the phone can also claim. A copycat app that starts
 * the sign-in itself (with its own PKCE challenge) and gets the member to
 * press Connect would receive the code and could spend it. A Universal Link
 * fixes that: iOS hands an https address only to the app whose team ID and
 * bundle ID are named in the host's apple-app-site-association file.
 *
 * The return address lives on this API's host (APP_LINK_RETURN_PATH), not the
 * website's: iOS ignores a universal link tapped on a page of the same host,
 * and serving the association file here needs no custom domain.
 *
 * Off until switched on, and switched on only by both of:
 *   APPLE_TEAM_ID=<10 characters, A-Z and 0-9>
 *   APP_LINK_RETURN=universal
 * IOS_BUNDLE_ID defaults to com.focusguild.app. The environment is read on
 * every call, so a test can set and unset it.
 */

/** The one path on the API that may open the app. */
export const APP_LINK_RETURN_PATH = '/app-link/return';

/** Where iOS and Apple's CDN look for the association file. */
export const AASA_PATH = '/.well-known/apple-app-site-association';

const DEFAULT_BUNDLE_ID = 'com.focusguild.app';

/** Apple team IDs are ten upper-case letters and digits. */
const TEAM_ID_RE = /^[A-Z0-9]{10}$/;

/** The team ID, or null when it is missing or not shaped like one. */
function teamId(): string | null {
  const v = process.env['APPLE_TEAM_ID'];
  return v !== undefined && TEAM_ID_RE.test(v) ? v : null;
}

function bundleId(): string {
  return process.env['IOS_BUNDLE_ID'] || DEFAULT_BUNDLE_ID;
}

/**
 * How the website should hand the code back to the app. "universal" only when
 * both switches are right: a typo in either leaves the scheme in use, never a
 * half-switched state where the website sends members to a link no app claims.
 */
export function returnVia(): 'universal' | 'scheme' {
  return process.env['APP_LINK_RETURN'] === 'universal' && teamId() !== null ? 'universal' : 'scheme';
}

/**
 * The apple-app-site-association document, or null without a valid team ID.
 * It names exactly one path, so nothing else on the API can open the app.
 */
export function associationDocument(): object | null {
  const team = teamId();
  if (!team) return null;
  return {
    applinks: {
      details: [
        {
          appIDs: [`${team}.${bundleId()}`],
          components: [{ '/': APP_LINK_RETURN_PATH, comment: 'Sign-in hand-off to the app' }],
        },
      ],
    },
  };
}
