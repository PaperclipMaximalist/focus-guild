# The iPhone app: every change, in one place

Everything done on branch `ios-app` **for the iPhone app**, and nothing
else. The website and server changes that happen to share the branch are
listed apart in `DEPLOY.md`, "What else ships with ios-app". Where an
iPhone change also changes the website, the last column says so, because a
deploy of `ios-app` puts it live there too.

Where each piece stands against the App Store: `docs/IOS_APP_STORE.md` (the
gates). How to ship it from Windows: `docs/IOS_RELEASE.md`. How the loops
that built it run: `docs/LOOP_GRAPH.md`.

## Where it stands (2026-11-19)

Built and proven as far as a Mac in the cloud allows. In the iPhone
simulator: every screen in all seven looks (154 of 154 confirmed), and a
real sign-in end to end, including still being signed in after a restart.
Not done, and only the owner can start it: the Apple Developer account, the
deploy, the three public pages' details, Clerk's sign-in methods, a real
iPhone, the submission (`docs/IOS_APP_STORE.md`, "Only the owner can do
these").

## The app itself

| Commit | What | Website too? |
| --- | --- | --- |
| `26b8818` | Capacitor 8 shell: the Xcode project in `client/ios`, Swift Package Manager, iPhone only, upright; the gates page | no |
| `2fbacf0` | App icon (1024 px, no transparency) and launch image, from the icon script | no |
| `bc484e9` | The five fonts ship inside the bundle instead of loading from Google Fonts (first paint does not wait on the network) | yes: the website serves its own fonts too |
| `5c914ce` | Behaves like an app: safe areas on every fixed and full-screen surface, light status bar, launch-screen hand-off, keyboard resizing, outside links in the in-app browser, no service worker, Clerk or keyboard hints in the app | no (behind the app's own switch) |
| `27bd4fb` | A local notification when the focus timer ends; haptics on a tick and a level-up | no |
| `48bea1a` | The safe-area utilities became the `edge:` variant, shared with the website on a home screen | yes: the home-screen website now keeps clear of the notch |
| `1b7d9fc` | Sliders drawn by the app in each look's colours (WebKit showed a white pill) | yes: sliders look the same on the website |
| `eecd9d0` | Today's panels keep their drawn frames in WebKit (`contain: paint` on the scene window) | yes, no visible change in other browsers |

## Signing in, and the account

| Commit | What | Website too? |
| --- | --- | --- |
| `3ee9321` | Server: device sign-in for the app (one-time code with PKCE, a revocable device token, list and sign out devices), `DELETE /users/me`, CORS for `capacitor://localhost`; migration `20261113000000_device_sessions` | server |
| `41616f2` | The app's sign-in screen, the website's `/app-link` Connect page, the token in the Keychain, Sign out | yes: adds the `/app-link` page |
| `23c9df6` | Settings, Account: signed-in iPhones, Delete account (Apple guideline 5.1.1(v)), the legal links; a question before any text goes to an AI provider (guideline 5.1.2(i)); device sign-ins end after 180 days unused | yes: all of it is on the website too |
| `7729d97` | The sign-in can return by Universal Link instead of `focusguild://` (built, off until the Apple team ID is set: `docs/UNIVERSAL_LINKS.md`); a stray `focusguild://` link no longer ends a sign-in in progress | server routes added, inert while off |

## For the App Store

| Commit | What | Website too? |
| --- | --- | --- |
| `9780205` | Store listing text: name, subtitle, description, keywords, review notes (`client/ios/App/fastlane/metadata`) | no |
| `531e950` | Privacy policy, terms, support page, written from a map of what the code stores and sends (`docs/PRIVACY_DATA_MAP.md`); placeholders for the owner's name, email and province | yes: public pages on the website |
| `ef92033` | Seven store screenshots from a script, in a desktop browser (`npm run store:shots`) | no |
| this loop | Seven store screenshots from the iPhone simulator, 1320 x 2868 with a real status bar, copied into `client/ios/App/fastlane/screenshots/en-US` (they replace the desktop ones) | no |
| `02a880d` | The privacy manifest (`PrivacyInfo.xcprivacy`) | no |

## Building and checking it without a Mac

| Commit | What |
| --- | --- |
| `02a880d` | `.github/workflows/ios.yml`: every push to `ios-app` touching `client/` builds and launches the app in a simulator; a TestFlight job (Apple's cloud signing, four secrets) and a listing-text job, both manual; `docs/IOS_RELEASE.md` |
| `60e1e37` | The demo build (`npm run build:demo`: sample data, signed in, no network; absent from the real builds) and a walk of every screen in every look in the simulator (`client/ios/ci/walk-screens.sh`), pictures on branch `ci-shots` |
| `0e2d656` | `.github/workflows/ios-signin.yml`: one real sign-in in the simulator with Maestro, against a throwaway server and website on the same Mac (`ci/throwaway`); evidence on branch `ci-signin` |
| `eb38659`, `b768bc5` | Fixes to that workflow; the simulator build for it is signed to run locally, so the Keychain keeps the session; `ci/workflow-check` checks workflow files before a push |
| this loop | The sign-in check in two flows (`flow.yaml`, `flow-signed-in.yaml`), so a stop of Maestro's own driver during the hand-off does not hide a sign-in that worked; the summary says when that happened |
| `13e2319`, `b768bc5`, `eecd9d0` | A two-round probe that found why WebKit dropped Today's frames; removed once fixed |
| `eecd9d0` | Vercel no longer builds `ios-app` or the two evidence branches |

## Docs

`docs/IOS_APP_STORE.md` (gates, phone checklist, answers for App Store
Connect, the owner's steps), `docs/IOS_RELEASE.md`, `docs/PRIVACY_DATA_MAP.md`,
`docs/UNIVERSAL_LINKS.md`, `docs/LOOP_HANDOFF.md`, `docs/LOOP_GRAPH.md`, and
this page.
