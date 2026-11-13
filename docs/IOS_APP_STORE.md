# Focus Guild for iPhone: the road to the App Store

Branch `ios-app` (from `improve-loop`). This page is the checklist the
conversion is run against: each gate is something that can be checked, with
how it was checked. The loop ends when every gate is **verified**, or when
what is left can only be done by the owner (the last section).

## What was decided, and why

| Decision | Why |
| --- | --- |
| **Capacitor 8**, the built client bundled inside the app (`client/ios`, Swift Package Manager, iOS 15+) | The app is 19 pages of React with seven hand-built looks. A rewrite in Swift or React Native would be a second product. A bundle that ships inside the app (not a window onto the website) is what Apple's guideline 4.2 asks for, and it opens offline. |
| **Sign-in in a browser sheet, then the app's own device token** | Clerk does not support running inside a WebView, cross-site cookies are blocked there, and Google refuses sign-in in embedded web views. So the app opens `<website>/app-link` in the system's in-app browser, the member signs in there as on the web, confirms, and the app is handed a one-time code that it trades for a revocable token (PKCE, the same shape as OAuth for native apps). The token lives in the Keychain. The app never loads Clerk. |
| **iPhone only, upright** for 1.0 | No iPad layout to test and no iPad screenshots to produce. It still runs on an iPad in the phone-sized window. |
| **Bundle ID `com.focusguild.app`**, scheme `focusguild://` | A placeholder the owner can change **before the first upload** (it is fixed for good after that): `client/capacitor.config.ts`, `Info.plist`, `project.pbxproj`. |
| **Builds happen on GitHub's macOS runners** | This machine is Windows; Xcode exists only on a Mac. The repository is public, so the runners cost nothing. |

## Gates

Status: `open`, `built` (written, not yet proven), `verified` (how is in the last column).

| # | Gate | Status | Verified by |
| --- | --- | --- | --- |
| A1 | Capacitor project in `client/ios`; `npm run build:ios` produces and copies the bundle | built | |
| A2 | App icon (1024 px, no transparency) and launch screen in the app's own look | open | |
| A3 | `Info.plist`: URL scheme, export-compliance answer, upright only, no unused permission strings | built | |
| A4 | Privacy manifest (`PrivacyInfo.xcprivacy`) for the app target | open | |
| B1 | Server: device link + token exchange (PKCE, one use, two minutes), device tokens accepted by `requireUser`, list and revoke | open | |
| B2 | Client: the app's sign-in screen, the website's `/app-link` confirm page, token in the Keychain, sign out | open | |
| B3 | The API answers the app's origin (`capacitor://localhost`) | open | |
| C1 | Safe areas: nothing under the notch, the status bar or the home indicator, in every look | open | |
| C2 | Status bar, launch screen hand-off, keyboard, links that leave the app open in the in-app browser | open | |
| C3 | No web leftovers in the app: service worker, Clerk, keyboard-shortcut hints, share target | open | |
| C4 | Fonts ship inside the bundle (first paint does not wait on Google Fonts) | open | |
| D1 | Focus timer: a local notification when the time is up, even with the app in the background; haptics on a completed quest | open | |
| E1 | Delete my account, inside the app (guideline 5.1.1(v)): server deletes every row and the Clerk user | open | |
| E2 | Privacy policy, terms and support pages, public on the website and linked from the app | open | |
| E3 | AI features ask before a quest's text is sent to an AI provider (guideline 5.1.2(i)) | open | |
| F1 | CI: every push builds the app for the simulator on a Mac runner | open | |
| F2 | CI: one manual run archives, signs and uploads to TestFlight once the owner's secrets exist | open | |
| G1 | Store listing text (name, subtitle, description, keywords, review notes, privacy answers) | open | |
| G2 | Screenshots at the size App Store Connect requires (6.9-inch iPhone) | open | |
| H1 | Tests, typecheck, lint and a production build pass on the branch | open | |

## How to build

```bash
cd client
npm run build:ios     # tsc, vite build --mode ios (reads .env.ios), cap sync ios
```

The result is the Xcode project in `client/ios/App`. Opening and running it
needs a Mac with Xcode 26 or later; CI does that part (gate F1).

To see the app's screens in a desktop browser during development, open the
dev server with `?native=1` (`client/src/native/platform.ts`).

## Only the owner can do these

Filled in as the gates close; the short version:

1. Join the Apple Developer Program (99 USD a year) and create the app record in App Store Connect with the bundle ID above.
2. Create an App Store Connect API key and add it to the repository's secrets (names in gate F2's notes).
3. Deploy the server and website from this branch (one migration), so the app has `/devices/*`, `/app-link` and the legal pages to talk to.
4. Clerk: a sign-in method a reviewer can use with a password, a demo account for App Review, and Sign in with Apple if any other social sign-in stays on (guideline 4.8).
5. Answer App Store Connect's questionnaires from the prepared text (gate G1), upload the screenshots, submit.
