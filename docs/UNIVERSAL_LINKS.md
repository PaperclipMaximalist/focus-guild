# Signing in to the iPhone app through a Universal Link

This page explains the safer way for the website to hand a sign-in back to the
iPhone app, and how the owner switches it on. It is built and tested as far as
a Windows machine allows, and it is off until you switch it on.

## The problem it solves

After the member presses **Connect this iPhone**, the website sends a one-time
sign-in code back to the app through the address `focusguild://link`. Any app
on the phone can claim the `focusguild://` scheme, and a copycat app that
starts the sign-in itself, with its own PKCE challenge, would receive the code
and could spend it if it got the member to press Connect for it. A Universal
Link is an ordinary `https://` address that iOS hands only to the app whose
Apple team ID and bundle ID are named in a file on that address's host.

## How it works

- **The return address** is `https://<api host>/app-link/return?code=...&state=...`,
  on the API's host (today `focus-guild-production.up.railway.app`), not the
  website's. iOS does not open an app for a universal link tapped on a page of
  the same host, and the website and the API are already different hosts. The
  API can also serve the association file itself, so no custom domain is
  needed.
- **The association file** is served by the API at
  `/.well-known/apple-app-site-association` once `APPLE_TEAM_ID` is set. It
  names one app (`<team ID>.com.focusguild.app`) and one path,
  `/app-link/return`. Nothing else on the API can open the app. Without a valid
  team ID the file answers 404.
- **The website** asks the server for a code as before (`POST /devices/link`).
  The answer now says `via: "scheme"` or `via: "universal"`. With `scheme`, or
  from an older server that says nothing, the page behaves exactly as it always
  has. With `universal`, the page shows the **Open Focus Guild** button pointing
  at the return address and asks the member to press it. It does not move by
  itself: iOS opens the app for a universal link only when a person taps a real
  link.
- **The app** accepts both forms: `focusguild://link?...` and the return
  address, checked to be exactly the API's host and that one path. The code and
  state are then handled the same way, so PKCE and the state check still apply.
- **The return page.** If iOS does not hand the link to the app (the app is not
  installed, or the link was opened somewhere else), the browser shows a short
  page on the API saying the app did not open and to press Sign in again. It
  never reads, shows or passes on the code, it is not cached, and the request
  log prints `[redacted]` for every value in its address.

## Switching it on

Do this only after the app version in the next section is in members' hands.

1. Find your team ID: <https://developer.apple.com/account>, **Membership
   details**, **Team ID**. It is 10 characters, capital letters and digits.
2. In Railway, open the API service, **Variables**, and add
   `APPLE_TEAM_ID` = your team ID. Leave `APP_LINK_RETURN` unset for now.
   Railway redeploys.
3. Check the file the API now serves:
   `curl https://focus-guild-production.up.railway.app/.well-known/apple-app-site-association`.
   It should print the JSON with your team ID followed by `.com.focusguild.app`.
4. Check that Apple's cache has it (iOS asks Apple's cache, not your server;
   this can take a while after the first deploy):
   `curl https://app-site-association.cdn-apple.com/a/v1/focus-guild-production.up.railway.app`.
   It should print the same JSON.
5. Build the app with the entitlement. The file
   `client/ios/App/App/App.entitlements` names the API host as an associated
   domain; the TestFlight job uses it only when the repository variable
   `IOS_UNIVERSAL_LINKS` is `on` (GitHub, Settings, Secrets and variables,
   Actions, Variables), which makes it pass
   `CODE_SIGN_ENTITLEMENTS=App/App.entitlements`. The App ID also needs the
   **Associated Domains** capability: tick it under
   <https://developer.apple.com/account/resources/identifiers/list>, or let the
   signing step add it. This switch has never been tried: the TestFlight job
   builds the archive unsigned and signs at export, and it is not known
   whether the entitlement survives that. Get one ordinary upload working
   first, then turn the variable on and read the signed app's entitlements
   before relying on it.
6. Install that build on a real iPhone (TestFlight) and check that sign-in
   still works through the scheme while `APP_LINK_RETURN` is unset.
7. In Railway, add `APP_LINK_RETURN` = `universal`. Railway redeploys.
8. On the phone, sign out, press **Sign in**, press **Connect this iPhone**,
   then **Open Focus Guild**. The app should open and be signed in. Opening
   `https://focus-guild-production.up.railway.app/app-link/return` in a
   desktop browser should show the API's "the app did not open" page.

A typo in either variable leaves the scheme in use. Both must be right for the
website to switch.

## The order that keeps a shipped app working

1. Ship an app that understands both forms and carries the entitlement (steps 5
   and 6 above). Every build from this branch on understands both forms.
2. Wait until members are on that version.
3. Only then set `APP_LINK_RETURN=universal` on the server.

The other way round, an older app on a phone would be sent a universal link it
has no entitlement for. iOS would open the return page in the browser instead
of the app, and that member could not sign in until they update.

## What has been tested, and what has not

Tested here, on Windows, with the automated tests:

- the association file's exact contents, and the 404 without a team ID or with
  a malformed one;
- that both variables must be right before the website is told `universal`;
- that the file and the return page need no sign-in while the paths beside
  them still do, and that the return page holds none of the values from its
  address and sends `Cache-Control: no-store` and `Referrer-Policy: no-referrer`;
- that the request log hides the code and state;
- that the website builds the return address from the API address it was built
  with, and that the app accepts exactly that address and refuses other hosts,
  lookalike hosts, other paths and user-info tricks.

Not tested, because it needs an Apple team ID and a real iPhone:

- that Apple's cache fetches and accepts the file from the Railway host;
- that a build signed with the entitlement passes signing, and that iOS then
  opens the app (not the browser) when **Open Focus Guild** is pressed in the
  sign-in sheet;
- that Capacitor delivers the universal link to the app as it does the scheme
  (`SceneDelegate.swift` already forwards it; nothing has run it).

## Switching it off

In Railway, delete `APP_LINK_RETURN` (or set it to anything but `universal`).
The website goes back to `focusguild://` at once, and every app version
understands that. Removing `APPLE_TEAM_ID` too makes the association file
answer 404 again; leaving it does no harm. Apps built with the entitlement keep
working through the scheme.
