# Releasing the iPhone app from Windows

This is the owner's guide to building and shipping the iPhone app without a Mac.
Everything that needs a Mac runs on GitHub's Mac machines, in the workflow
`.github/workflows/ios.yml`. You start it, read its result, and fix secrets in
your browser.

## What has and has not been tested

None of this has run yet. The workflow, the scripts in `client/ios/ci/`, the
export settings and the steps below were written from Apple's and GitHub's
documentation and from other projects' reports, on a Windows machine that
cannot run Xcode. Expect the first run of each job to need a fix. The order in
which things are most likely to fail is at the end of this page.

## What the workflow does

The workflow is called **iOS** in the repository's **Actions** tab. It has four jobs.

| Job | When it runs | What it does | Needs secrets |
| --- | --- | --- | --- |
| Simulator build and launch | Every push to `ios-app`, pull requests that change `client/`, and every manual run | Builds the web app, builds the iPhone app for the simulator, starts it, checks it is still running after 20 seconds, takes two screenshots | No |
| Publish screenshots to the ci-shots branch | Pushes to `ios-app` only | Copies the two screenshots to the branch `ci-shots` | No |
| Archive, sign and upload to TestFlight | Only when you start it by hand with **run = testflight** | Builds the release version, signs it, sends it to App Store Connect | Yes, four |
| Upload the store listing text | Only when you start it by hand with **run = store-listing-text** | Sends the name, subtitle, description, keywords, URLs and review notes from `client/ios/App/fastlane/metadata/` to App Store Connect | Yes, three |

The upload jobs never submit the app for review. You do that yourself in App Store Connect.

## How signing works here

Apple requires every app to be signed with a certificate. Normally that
certificate lives in a Mac's keychain. Here it does not: the app is built
unsigned, and at the last step Xcode asks Apple to sign it with a
*cloud-managed* distribution certificate, using your App Store Connect API key.
Xcode also creates the provisioning profile for you. So you never create,
download or store a certificate. The only things you keep are the API key and
your team ID.

## One-time setup

Do these in order. All of it works in a browser on Windows.

### 1. Join the Apple Developer Program

1. Go to <https://developer.apple.com/programs/enroll/> and enroll (99 USD a year).
2. Wait for the confirmation email. This can take a day or two.

### 2. Accept the agreements

1. Sign in at <https://appstoreconnect.apple.com>.
2. Open **Business** (in older layouts: **Agreements, Tax, and Banking**).
3. Accept the **Free Apps** agreement if it is waiting. Uploads fail while an agreement is pending.
4. Also check <https://developer.apple.com/account> for a banner asking you to accept an updated Program License Agreement. Accept it if it is there.

### 3. Decide the bundle ID (it can never change after the first upload)

The bundle ID is the app's permanent name inside Apple's systems. It is now
`com.focusguild.app`. If you want another one, change it **before** step 4 in
all of these places, then push:

1. `client/capacitor.config.ts`: `appId`.
2. `client/ios/App/App.xcodeproj/project.pbxproj`: both lines `PRODUCT_BUNDLE_IDENTIFIER = com.focusguild.app;` (Debug and Release).
3. `client/ios/App/App/Info.plist`: the `CFBundleURLName` string (it names the URL scheme; keep it equal to the bundle ID).
4. `.github/workflows/ios.yml`: `BUNDLE_ID` near the top.

The `focusguild://` URL scheme is separate and does not need to change.

### 4. Register the bundle ID

1. Go to <https://developer.apple.com/account/resources/identifiers/list>.
2. Click **+**, choose **App IDs**, then **App**, then **Continue**.
3. Description: `Focus Guild`. Bundle ID: **Explicit**, `com.focusguild.app` (or yours from step 3).
4. Leave every capability unticked. Click **Continue**, then **Register**.

### 5. Create the app record

1. In App Store Connect, open **Apps**, click **+**, then **New App**.
2. Platform: **iOS**. Name: `Focus Guild`. Primary language: **English (U.S.)**.
3. Bundle ID: pick the one from step 4. SKU: any text you like, for example `focusguild-ios`.
4. User access: **Full Access**. Click **Create**.

### 6. Find your team ID

1. Go to <https://developer.apple.com/account> and open **Membership details**.
2. Copy the **Team ID**: 10 characters, letters and digits, like `A1B2C3D4E5`.

### 7. Create the App Store Connect API key

1. In App Store Connect, open **Users and Access**, then the **Integrations** tab, then **App Store Connect API** (under Keys, **Team Keys**).
2. If asked, click **Request Access** and accept. Only the Account Holder can do this.
3. Click **Generate API Key** (or **+**).
4. Name: `GitHub Actions`. Access: **Admin**.
   Admin is needed because only Admin keys may use Apple's cloud-managed
   distribution certificate; with App Manager or Developer the signing step
   fails with "Cloud signing permission error".
5. Click **Generate**.
6. Copy the **Issuer ID** shown above the list (a long ID with dashes).
7. Copy the **Key ID** of the new key (10 characters).
8. Click **Download** next to the key. You get `AuthKey_<KeyID>.p8`.
   **Apple lets you download it only once.** Keep it somewhere safe (a password manager).
   If you lose it, revoke the key and make a new one.

An Admin key can do anything in App Store Connect. Treat the `.p8` file like a password.

### 8. Add the secrets to GitHub

1. Open the repository on GitHub, then **Settings**, then **Secrets and variables**, then **Actions**.
2. Click **New repository secret** for each of these. The names must match exactly.

| Name | Value |
| --- | --- |
| `ASC_KEY_ID` | The Key ID from step 7 |
| `ASC_ISSUER_ID` | The Issuer ID from step 7 |
| `ASC_KEY_P8` | The whole text of the `.p8` file (see below) |
| `APPLE_TEAM_ID` | The Team ID from step 6 |

To copy the `.p8` text on Windows: right-click the file, **Open with**, **Notepad**.
Press Ctrl+A, then Ctrl+C, and paste it into the secret's value box. It must
include the lines `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`.
(The workflow also accepts the same text base64-encoded, but plain text is simpler.)

Secrets are never shown in the logs. GitHub hides them, and the workflow deletes
the key file at the end of every run.

## Sending a build to TestFlight

There are two ways to start it. GitHub only shows the **Run workflow** button
for a workflow file that is on the default branch (`main`), so until
`.github/workflows/ios.yml` has been merged there, use the tag.

**With a tag (works from any branch):**

```bash
git tag ios-v1.0.0
```

```bash
git push origin ios-v1.0.0
```

The part after `ios-v` is the version people will see. The commit the tag
points at is what gets built. A tag can be pushed once; for another test build
of the same version, use the button below, or re-run the job from the run's page.

**With the button (once the workflow is on `main`):**

1. Push your changes to the branch you want to build.
2. On GitHub, open **Actions**, then **iOS** in the left column.
3. Click **Run workflow** (top right of the list).
4. **Use workflow from**: the branch, usually `ios-app`.
5. **What to run**: `testflight`.
6. **Version**: the version people will see, like `1.0.0`. Keep it the same for every test build of one release; raise it when you start the next release.
7. **What to Test**: optional. A short note shown to testers.
8. Click **Run workflow**.

The build number is set for you: it is the run number and the attempt, like
`57.1`. You never edit a file to raise it.

After a green run:

1. The build appears in App Store Connect under **TestFlight** after Apple processes it, usually 5 to 30 minutes. Apple emails the account holder when it is done, or if it was rejected.
2. Add yourself under **Internal Testing** (create a group, add your Apple ID), then install the **TestFlight** app on your iPhone and accept the invitation.
3. The export-compliance question is already answered in the app (`ITSAppUsesNonExemptEncryption = NO`), so the build should not wait on it.

## Uploading the store listing text

1. Start the workflow as above with **What to run**: `store-listing-text` and the same **Version** as your build.
2. It sends the text files in `client/ios/App/fastlane/metadata/` to that version's page in App Store Connect. It creates the version page if it does not exist.
3. It does not upload screenshots unless a folder `client/ios/App/fastlane/screenshots/` exists, never uploads a build, and never submits for review.
4. Check the result on the version's page in App Store Connect before you submit.

## Reading a run

1. Open **Actions**, then the run. Each job is a box; click one.
2. Every step has a plain name. The first red cross is where it broke.
3. Open that step. Lines marked **Error** are the reason. For xcodebuild steps the
   step prints every line containing `error:` and the last 150 lines of the raw log.
4. The full logs and the screenshots are under **Artifacts** at the bottom of the
   run's summary page (`ios-build-logs`, `ios-screenshots`, `ios-testflight-logs`).
   You must be signed in to GitHub to download them.

Common messages and what to do:

| Message | Meaning | Fix |
| --- | --- | --- |
| `Missing secrets: ...` | A secret is not set or is misspelled | Step 8 |
| `ASC_KEY_P8 is not a key` | The `.p8` text was not pasted whole | Paste it again, with the BEGIN and END lines |
| `No Xcode 26 or later` | GitHub changed its Mac images | Change `runs-on: macos-26` to the newest `macos-…` label |
| `Cloud signing permission error` | The API key is not Admin | Make a new key with Admin access (step 7) and replace the three key secrets |
| `No profiles for 'com.focusguild.app' were found` or `bundle identifier ... not available` | Bundle ID not registered, or registered in another team | Step 4, and check `APPLE_TEAM_ID` |
| `... has already been used` (build number) | Apple already has this build number for this version | Start a new run or re-run the job; both raise the number |
| An agreement or "contract" message | An agreement is waiting | Step 2 |
| `App did not stay running` (simulator job) | The app crashed within 20 seconds of start | Read `simulator-app.log` and any `App*.ips` crash report in `ios-build-logs` |

## The `ci-shots` branch

People who review the runs cannot download artifacts without a GitHub login.
So after each push to `ios-app`, the workflow puts the two simulator
screenshots (`after-10s.png`, `after-20s.png`) and a `README.md` (the commit
they came from, the Xcode version, the build job's result) on a branch called
`ci-shots`. It replaces the branch each time, with one commit and no history.
Nothing else uses it. You can delete it whenever you like; the next push makes
it again. It is never written by pull requests.

## What is most likely to fail the first time

1. **The signing and upload step** (TestFlight job). Signing an unsigned archive in the cloud with only an API key is what several projects do in 2026, but this repository has never done it. Look for a permission error (key role), a missing profile (bundle ID), or an upload error (agreement, app record).
2. **The "What to Test" step**. It talks to the App Store Connect API directly and waits for processing. If it fails, the build is still uploaded; the step is allowed to fail and you can type the note in App Store Connect.
3. **The store listing job**. fastlane `deliver` may reject a field (for example the review notes needing a contact name and phone, which are not in the files yet).
4. **The simulator launch check**. If the unsigned simulator build will not start, the step "Launch the app in the simulator…" fails right after "Installing".
5. **Picking Xcode or a simulator**, if GitHub renames its images.
