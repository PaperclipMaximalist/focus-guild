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

**Where it stands (2026-11-13):** the loop ended with nothing left that can be done without the owner. The app compiles and launches on a Mac runner; sign-in, account deletion, the AI prompt and the safe areas are checked in a browser against the real server; nothing has been tried on a real iPhone, the TestFlight job has never run, and the three public pages still hold placeholders. The owner's steps are at the end of this page.

| # | Gate | Status | Verified by |
| --- | --- | --- | --- |
| A1 | Capacitor project in `client/ios`; `npm run build:ios` produces and copies the bundle | verified | The Mac runner ran `npm run build:ios`, resolved the Swift packages and compiled the app with Xcode 26.6 (run 43555052690, commit `a5f8c19`). |
| A2 | App icon (1024 px, no transparency) and launch screen in the app's own look | verified | `npm run icons`; PNG headers read back (1024 and 2732 px, 8-bit RGB, no alpha), both images looked at, web icons unchanged. Not yet seen on a device. |
| A3 | `Info.plist`: URL scheme, export-compliance answer, upright only, no unused permission strings | verified (builds and launches) | The app built with this `Info.plist` and launched in the simulator. The `focusguild://` scheme itself is only exercised by a real sign-in on a phone. |
| A4 | Privacy manifest (`PrivacyInfo.xcprivacy`) for the app target | built | In the app target's Resources; declares email, user ID and the member's own content, linked, not tracking. The TestFlight job fails if it is missing from the archive. Never built. |
| B1 | Server: device link + token exchange (PKCE, one use, two minutes), device tokens accepted by `requireUser`, list and revoke | verified | 607 server tests; the whole story by curl on a throwaway database (good and wrong verifier, reuse, expiry, revoke, a device token refused for adding devices). Not run: against Neon, or with Clerk configured. |
| B2 | Client: the app's sign-in screen, the website's `/app-link` confirm page, token in the Keychain, sign out | verified in a browser | Dev client in app mode (`?native=1`) against the real server code: sign in, reload stays signed in, a device revoked elsewhere returns to the sign-in screen with a line saying so, a link with the wrong state is refused, the same link twice changes nothing, Sign out removes the device. **Not checked: a phone** (the browser sheet, the `focusguild://` hand-off, the Keychain), **and `/app-link` with Clerk on** (coming back to the page after signing in or up). |
| B3 | The API answers the app's origin (`capacitor://localhost`) | verified | Preflight from that origin for a `DELETE` with `Authorization` is allowed; another origin is not. Live only after the server is deployed. |
| C1 | Safe areas: nothing under the notch, the status bar or the home indicator, in every look | verified in a browser | App mode with a Dynamic Island phone's insets (`?native=1&inset=59,34`): the top bar's row starts at 59 px with its ground running under the status bar, the tabs end 34 px above the bottom edge, Fuel check's back link and the timer's controls sit below the inset, no sideways scroll on Today, Quests, Route, Fuel check, Advanced. Every fixed, sticky and full-screen surface was gone through one by one. **Not checked: a phone, and the six looks other than Night.** |
| C2 | Status bar, launch screen hand-off, keyboard, links that leave the app open in the in-app browser | partly verified | `client/src/native/shell.ts` and the plugin settings in `capacitor.config.ts`. The simulator screenshot 20 s after launch shows the sign-in screen with light status bar text and no launch image left over. The keyboard, the browser sheet and scrolling only exist on a phone: see "Check on a phone". |
| C3 | No web leftovers in the app: service worker, Clerk, keyboard-shortcut hints, share target | verified in a browser | In app mode: no service worker is registered, Clerk is never mounted, the shortcut help and the share target are gone, file downloads are replaced by Copy, and no text names another platform. The website keeps all of them. |
| C4 | Fonts ship inside the bundle (first paint does not wait on Google Fonts) | verified | The build has no reference to Google's font hosts; in the browser the five families load from the bundle, including Cinzel on Spire Guild and Oxanium on Star Guild. Adds about 416 KB. |
| D1 | Focus timer: a local notification when the time is up, even with the app in the background; haptics on a completed quest | built | `client/src/native/notify.ts`, wired into the timer store with tests (start, pause, resume, stop, a restored session). In the browser the timer runs with no stray errors and says so when notifications are refused. A bug that would have stopped every notification on a phone was found there and fixed (see the commit). **The notification itself can only be seen on a phone.** |
| E1 | Delete my account, inside the app (guideline 5.1.1(v)): server deletes every row and the Clerk user | verified in a browser | Settings, Account, Delete account, on the website and in the app. In app mode against the real server code: the button works only once DELETE is typed, and afterwards the member, their quest and their signed-in device are gone from the server and the app is on its sign-in screen saying so. A member seeded in all 20 tables has no rows left (server test). **Not checked: the real Clerk deletion, and Clerk's sign-out after deleting on the website.** |
| E2 | Privacy policy, terms and support pages, public on the website and linked from the app | built (draft) | `client/public/privacy.html`, `terms.html`, `support.html`; every data statement traced to code in `docs/PRIVACY_DATA_MAP.md`. **Not publishable until the owner fills in the operator's name, a contact address and the province, and has read them.** Links from the app: with E1. |
| E3 | AI features ask before a quest's text is sent to an AI provider (guideline 5.1.2(i)) | verified in a browser | One gate in front of Break down, Ask the Guild and the quest-list writer: it names the company that would receive the text, says what this button sends, and asks once per button and provider. Seen in the browser with the Guild's own key standing in: the prompt appears, and Not now sends nothing and remembers nothing. A test calls every exported API function and fails if one reaches those routes without the gate. Send was not pressed (it would have sent text to a real provider). |
| F1 | CI: every push builds the app for the simulator on a Mac runner | verified | First run, first try: `macos-26`, Xcode 26.6, compiled unsigned, launched in an iPhone simulator, still running after 20 s, two screenshots published to the branch `ci-shots`. Step results are readable without signing in: `GET /repos/PaperclipMaximalist/focus-guild/actions/runs/<id>/jobs`. |
| F2 | CI: one manual run archives, signs and uploads to TestFlight once the owner's secrets exist | built | Job `testflight`, started by the Run button or a tag `ios-v1.0.0`. Four secrets, Apple's cloud signing, no certificate to manage. Steps for the owner in `docs/IOS_RELEASE.md`. **Never run: needs the Apple account.** |
| G1 | Store listing text (name, subtitle, description, keywords, review notes, privacy answers) | verified | `client/ios/App/fastlane/metadata`: lengths counted (name 11/30, subtitle 26/30, keywords 97/100); every sentence of the description and the review notes rechecked against the code after E1, E3 and D1 landed, and two wrong claims corrected. The privacy, age and export answers are in "Answers for App Store Connect" below. True only once Clerk is set as the owner's step 4 says. |
| G2 | Screenshots at the size App Store Connect requires (6.9-inch iPhone) | verified | `npm run store:shots` writes seven pictures at 1290 x 2796 into `client/ios/App/fastlane/screenshots/en-US`; sizes read from the files, each one looked at. They are the real client in a desktop browser dressed as the app, so the status bar is an empty band. Better ones come from the simulator once CI runs. |
| H1 | Tests, typecheck, lint and a production build pass on the branch | verified, with one exception | 612 server tests, 219 client tests, both typechecks and the production build pass. Lint: the client's forty problems are the same forty `improve-loop` already had; none is in a file this work added or changed. |

## How to build

```bash
cd client
npm run build:ios     # tsc, vite build --mode ios (reads .env.ios), cap sync ios
```

The result is the Xcode project in `client/ios/App`. Opening and running it
needs a Mac with Xcode 26 or later; CI does that part (gate F1), and
`docs/IOS_RELEASE.md` is the step-by-step for running it from Windows.

To see the app's screens in a desktop browser during development, open the
dev server with `?native=1&inset=59,34` (`client/src/native/platform.ts`,
`insets.ts`): the app's version of the UI with a notch's safe areas. Sign-in
there: press Sign in, open the logged `/app-link` address in a second tab,
press Connect, and paste the `focusguild://` address it logs into
`window.__fgOpenUrl(...)` in the first tab's console.

## Check on a phone

Nothing below can be seen from Windows. In the order most likely to be wrong:

1. **Sign-in.** Sign in opens the browser sheet; after Connect the sheet closes and the app is signed in (the `focusguild://` hand-off). Close the app and reopen it: still signed in (the Keychain). With Clerk on, signing up as a new member in the sheet lands back on the Connect page.
2. **The keyboard.** In the quest editor and the jot box the field stays visible, the Add/Cancel bar sits on the keyboard, and the tab bar leaves and comes back without a jump.
3. **Launch.** No flash between the launch image and the first screen; status bar text is light throughout.
4. **Safe areas** on a phone with a Dynamic Island, in each of the seven looks: the top bar's row below the island, the tab labels above the home indicator, bottom sheets' last buttons reachable.
5. **The timer.** The permission question appears at the first Start and never again after a refusal; the notification arrives with sound when the phone is locked; tapping it opens the timer; Pause and Stop remove it.
6. **Scrolling.** The page does not rubber-band as a whole; sheets and lists still scroll.
7. **Links** to other sites (the Google Calendar steps, an AI provider's key page, the privacy policy) open in the in-app sheet and Done returns to the same screen.
8. **Touch.** Long-pressing a tab or a button does nothing; long-pressing a quest's title or a journal entry selects text; no zoom on focusing a field.
9. **Coming back** after a few minutes away: Today and the Route update without a reload.
10. **Reinstall.** Delete the app while signed in, install it again: it opens on the sign-in screen.
11. **Haptics** on ticking a quest and on a level-up.

## Answers for App Store Connect

**App Privacy ("nutrition label").** Data collected, all three *linked to the user*, *not used for tracking*, purpose *App Functionality* only:

| Apple's category | Type | What it is here |
| --- | --- | --- |
| Contact Info | Email Address | The sign-in email, held by Clerk |
| Identifiers | User ID | The account ID |
| User Content | Other User Content | Quests, journal, check-ins, expeditions |

Nothing else: no location, contacts, photos, health data, purchases, browsing or search history, usage analytics, diagnostics or advertising data. The app's privacy manifest says the same. (A journal entry can say anything, including how someone feels; Apple's "Health" category is for health and medical data an app asks for or reads, which this app does not.)

**Age rating.** No violence, sexual content, profanity, gambling, alcohol or drugs, horror, medical or treatment information, contests, or unrestricted web access. No user-to-user messaging and no public content. Where the form asks about AI: the app can send a member's own text to an AI assistant when they ask, with their own key or the app's. The form is Apple's and changes; read each question rather than trusting this list.

**Export compliance.** `ITSAppUsesNonExemptEncryption` is `NO` in `Info.plist` (only HTTPS and the system's own cryptography), so no questions at upload.

**Content rights.** The app shows only the member's own content. The art and icon are the project's own; the fonts are under the SIL Open Font License.

**Sign-in for review.** A demo account with a password, entered in App Store Connect only (the repository is public). The review notes explain the browser sheet.

## Only the owner can do these

In order. Steps 1 to 4 can start today; nothing in the app works until 5.

1. **Say yes or no to pushing `ios-app`** so the Mac build can run. Until it does, nobody knows whether the app compiles.
2. **Join the Apple Developer Program** (99 USD a year), then follow `docs/IOS_RELEASE.md`: agreements, bundle ID (`com.focusguild.app` unless changed first, in the four places that page lists), app record, an API key with the **Admin** role, four repository secrets.
3. **Fill in the three public pages.** Replace `{{OPERATOR_NAME}}`, `{{CONTACT_EMAIL}}` and `{{PROVINCE}}` in `client/public/privacy.html`, `terms.html` and `support.html`, read them (a draft, not legal advice: they commit to answering data requests within 30 days, a CA$100 liability cap, and 30 days' notice before a shutdown), and answer the questions marked `OWNER` inside the privacy page and in section 10 of `docs/PRIVACY_DATA_MAP.md`.
4. **Clerk.** Find out which sign-in methods are on. A reviewer needs one that works with a password. If Google or any other social sign-in is on, either turn it off or turn on Sign in with Apple (guideline 4.8). Add the website's address to the allowed redirect URLs if Clerk asks. Check whether the live site still runs on a development instance (`pk_test`): a public launch needs a production one, which needs a domain.
5. **Deploy this branch** (server and website; one migration, `20261113000000_device_sessions`). The app talks to the live API and opens the live website to sign in, so until this is deployed a build can only show its sign-in screen. Check `/health`, then `/privacy.html` and `/app-link` on the website.
6. **Is `ANTHROPIC_API_KEY` set on Railway?** If so, members who connect no key have their AI requests answered with it. The app asks first either way; the privacy policy has a simpler sentence ready if it is not.
7. **Run the TestFlight job**, install the build through the TestFlight app, and go through "Check on a phone" above.
8. **App Store Connect:** upload the listing text (the `store-listing-text` job or by hand), the screenshots, the answers above, the demo account, then submit.

## Known limits

- **A copycat app could capture a sign-in.** The one-time code returns through the `focusguild://` scheme, which another app on the phone could also claim. PKCE stops an app that merely sees the code, but not one that starts the sign-in itself and gets the member to press Connect for it. The cure is a Universal Link, which needs a domain the owner controls and the Apple team ID in a file on it. Worth doing after launch.
- **The calendar feed link is a full key to the account.** It carries the personal access token, which also opens the whole API, and the server's request log prints it each time a calendar app fetches the feed. Older than this branch and not changed by it; it deserves its own token that can only read the plan.
- **Installed on a home screen, the website has the same notch problem the app had.** The fix made for the app is behind the app's own switch so that the website did not change.
