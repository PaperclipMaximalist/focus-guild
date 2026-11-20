# Two steps to the App Store: register, then send

Everything else is done and checked on GitHub's Mac runners on every push:
the app builds for the simulator and as a Release archive for real iPhones,
every screen shows correctly in all seven looks, a real sign-in works end to
end (including after a restart), and Delete account works from inside the
app. This page is what is left, in order, with every answer ready to paste.

The gates behind this: `docs/IOS_APP_STORE.md`. Details of each button:
`docs/IOS_RELEASE.md`. The iPhone changes: `docs/IOS_CHANGELOG.md`.

---

## Step 1: register (once, about 30 minutes plus Apple's wait)

1. **Join the Apple Developer Program** at <https://developer.apple.com/programs/enroll/>
   as an individual (99 USD a year). You need an Apple ID with two-factor
   authentication, your legal name and address. Apple often approves in 1 to
   2 days. Your legal name becomes the seller name on the App Store.
2. When you are in, follow `docs/IOS_RELEASE.md`, steps 2 to 8. In short:
   - accept the agreements in App Store Connect (Business);
   - keep the bundle ID `com.focusguild.app` (or change it first, in the four
     places step 3 lists) and register it under Identifiers;
   - create the app record: **New App**, platform iOS, name **Focus Guild**,
     primary language **English (U.S.)**, the bundle ID, SKU `focus-guild-ios`;
   - note your **Team ID** (Membership details);
   - make an App Store Connect API key with the **Admin** role and download
     the `.p8` file (it can be downloaded once);
   - add four repository secrets on GitHub (Settings, Secrets and variables,
     Actions): `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8` (the whole `.p8`
     text), `APPLE_TEAM_ID`.

That is all of "register". Tell Claude when the secrets are in; the rest of
the uploading can be started from here.

---

## Step 2: send (about an hour, then Apple's review)

1. **Upload a build.** GitHub, Actions, **iOS**, **Run workflow**, choose
   `testflight` (or push a tag `ios-v1.0.0`). It builds, signs with Apple's
   cloud certificate and uploads. The build appears in TestFlight after Apple
   processes it (5 to 30 minutes).
2. **Upload the listing.** Run the same workflow with `store-listing-text`:
   it sends the name, subtitle, description, keywords, URLs, review notes and
   the seven screenshots in `client/ios/App/fastlane/`.
3. **Try it on your iPhone** (recommended, 15 minutes): install TestFlight,
   install the build, sign in, tick a quest, start a timer and lock the phone,
   open Settings, Account. The full list is "Check on a phone" in
   `docs/IOS_APP_STORE.md`.
4. **Make the demo account for App Review.** On the website, sign up with an
   email address you control and a password (not Google or Apple: the
   reviewer needs a password). Sign in once and add two or three quests so
   the reviewer sees a real Today.
5. **Fill in App Store Connect** (the app's page):
   - **App Privacy**: Data collected, all *linked to the user*, *not used for
     tracking*, purpose *App Functionality*: Contact Info, Email Address;
     Identifiers, User ID; User Content, Other User Content. Nothing else.
     Privacy policy URL: `https://focus-guild-ten.vercel.app/privacy.html`.
   - **Age rating**: answer *None* or *No* to every content question; no
     unrestricted web access; no user-generated content shared with others;
     where it asks about AI, the app can send a member's own text to an AI
     assistant when they ask. Read each question; the form is Apple's.
   - **Pricing and availability**: Free, the countries you want.
   - **App Review information**: the demo account's email and password; your
     name, phone and email for Apple's reviewers (not shown publicly); the
     notes are already filled in by the listing upload.
   - **Build**: pick the TestFlight build. Encryption: the app already
     answers "no non-exempt encryption", so there is nothing to fill.
6. **Submit for review.** Apple usually answers in 1 to 3 days. If they ask
   something, paste their message to Claude.

---

## Before step 2 can work, two things need your word (asked in the chat)

- **The deploy.** The app talks to the live server and signs in through the
  live website; the privacy, terms and support pages and the sign-in hand-off
  page (`/app-link`) exist only on `ios-app` until it is deployed. Deploying
  also changes the plan feed links (see `DEPLOY.md`).
- **The three details for the public pages**: the name to show as the
  operator, a public contact email, and your province (for the terms'
  governing law). They go on public web pages, so only you can choose them.

## Good to know, not required

- **Clerk runs as a development instance.** Sign-in works (email and
  password, Sign in with Apple, Google, GitHub), but its page shows a small
  "Development mode" label. Moving to a production instance needs a domain
  you own; worth doing before many people use it, not needed to submit.
- **Universal Link sign-in** (safer against copycat apps) is built and off;
  after launch, `docs/UNIVERSAL_LINKS.md` switches it on with your Team ID.
