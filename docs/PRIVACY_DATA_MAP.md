# Privacy data map

The evidence behind `client/public/privacy.html`, `terms.html` and `support.html`.
Every row was read from the code on branch `ios-app` (13 November 2026, at
`02a880d` plus the uncommitted work in the tree). Paths are from the repository
root. **UNKNOWN** means the code does not settle it and the owner must answer
before the policy is published.

A member is a person with a Focus Guild account.

## 1. How a member is identified

| What | Why | Where it lives | Who else touches it | How long | How it is deleted | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Email address, password (or other sign-in method), Clerk's session records | Sign-in on the website | **Clerk**, not our database. The server never stores the email; it only receives Clerk's user id (`sub`) from a verified token. The website shows the email on the Connect page, read from Clerk in the browser. | Clerk | Until the account is deleted; Clerk's own retention after that is UNKNOWN | Delete account calls `clerk.users.deleteUser(clerkId)` after the data is gone | `server/src/lib/auth.ts:73-93`, `server/src/lib/deleteAccount.ts:28-58`, `client/src/App.tsx:152-155`, `client/src/main.tsx:20-36` |
| Clerk user id (`users.clerkId`) and our own user id (`users.id`) | Ties every row to its owner | Postgres (Neon), `users` | Neon, Railway (the server) | Until account deletion | Row deleted; every other table cascades | `server/prisma/schema.prisma:10-58`, `server/src/lib/auth.ts:166-171` |
| Which sign-in methods Clerk offers (email + password, email code, Google, Apple...) | | Clerk dashboard | | | | **UNKNOWN**: set in Clerk's dashboard, not in code. The review notes say email only, no social sign-in. |
| Clerk cookies on the website | Keep the website session | Browser, set by Clerk's script (website only; the iPhone app never loads Clerk) | Clerk | Clerk's cookie lifetimes | Signing out; clearing site data | `client/src/main.tsx:18-20` |

## 2. Content the member creates (all in Postgres on Neon, all `ON DELETE CASCADE` from `users`)

| Table | What it can hold | Why | Evidence |
| --- | --- | --- | --- |
| `quests` | Title, estimate, mental load, impact, deadline, status, tags, category, scheduling hints, priority, repeat pattern, minutes worked, completion time. Steps are quests with a parent. **There is no notes field on a quest.** | The core list | `schema.prisma:60-111` |
| `recurring_completions` | Which round was done on which day, XP | Rounds | `schema.prisma:113-128` |
| `daily_check_ins` | Energy level (1-5) and available minutes (0-1440), per day | Planning the day | `schema.prisma:143-156`, `server/src/routes/checkin.ts:13-14,40` |
| `xp_events`, `user_achievements`, `users.level/totalXP/currentStreak/multiplier/spinCount` | Game state | XP, streaks, trophies | `schema.prisma:158-197` |
| `schedule_blocks` | The planned day: start, end, type, reason, a note (fixed blocks carry "Calendar: <event title>" or "Daily: ...") | The Route | `schema.prisma:199-223`, `server/src/routes/calendarFeed.ts:47-48` |
| `users.schedulerSettings`, `users.trackerSettings`, `users.trackerCodeHighWater` | Working hours, break policy, planner weights; tracker presets | Settings | `schema.prisma:20-30`, `server/src/routes/settings.ts` |
| `tracker_domains`, `tracker_items` (Expeditions) | Domain names and colours; item code, title, status, next action, notes, due date, IB CAS fields (strands, learning outcomes, dates, project/coursework flags, hours) | Long projects | `schema.prisma:240-304` |
| `reflections` | Free text per tracker item, date, learning-outcome tags, an optional media **URL** (no upload pipeline: no files or photos are stored) | CAS reflections | `schema.prisma:314-330` |
| `parking_lot_entries` | Free text ideas, including anything sent to the inbox | Capture | `schema.prisma:332-346`, `server/src/routes/inbox.ts:72` |
| `decision_log_entries` | Free text decisions | Decision log | `schema.prisma:348-361` |
| `cas_interviews` | Date and notes of three IB CAS interviews | CAS | `schema.prisma:363-378` |
| `activity_log` (the Chronicle) | One sentence per event: quest done/deferred/imported (with titles), check-ins (energy), tracker changes (with titles), parked ideas and decisions (full text), inbox items (full text), calendars connected (name), AI connected/removed (provider, model), **the full text of every Ask the Guild question**, and **journal entries** (`kind = journal`, full text and the 1-5 mood rating). End-of-day reflections are posted here as journal entries. | History, Journal, AI context | `schema.prisma:380-396`; writers listed by `grep logActivity server/src`; `server/src/routes/chronicle.ts:111-127,267`; `client/src/components/EndOfDayReflection.tsx:88-91` |
| `permafile_versions` | Free text "who I am and the rules" document, **every saved version kept** | Context for the AI and for the member | `schema.prisma:400-412`, `server/src/routes/chronicle.ts:179-203` |

Retention for all of section 2: kept until the member deletes the item (where a delete exists) or the account. The activity log has no automatic pruning; decision log entries have no delete route; permafile versions are never pruned (only the newest 30 are listed). Evidence: no scheduled cleanup anywhere in `server/src` except device links and calendar events (below).

Health-adjacent data: energy levels, mood ratings and free-text journals can reveal health information if the member writes it. The app does not ask for health data. The App Store description says the app makes no health claims.

## 3. Connections the member adds

| What | Stored as | Fetched / sent where, how often | Retention, deletion | Evidence |
| --- | --- | --- | --- | --- |
| **Calendar link** (a secret ICS address from Google, Outlook, iCloud...) and its name | `calendar_sources.url` in **plain text** (not sealed like AI keys); only `host/…last 6 chars` is shown back to the client | The server fetches the URL itself (no member IP involved), at add time, on "sync now", before planning if older than 15 minutes, and in a background loop every 15 minutes. HTTPS only; private addresses refused; redirects checked; 5 MB cap. User-Agent `FocusGuild/1.0 (calendar sync)`. | Until removed or account deleted (row delete cascades to events) | `schema.prisma:414-432`, `server/src/routes/integrations.ts:27-88`, `server/src/lib/calendar/sync.ts`, `server/src/lib/calendar/ics.ts:90-109` |
| Imported calendar events | `external_events`: uid, **title**, start, end. Only timed, busy events, from yesterday to 35 days ahead. No location, attendees or description. | Used by the planner | **Replaced wholesale on every sync**; deleted with the calendar | `schema.prisma:434-451`, `sync.ts:13-14,53-69`, `client/src/pages/Connections.tsx:171-172` |
| **Personal access token** (`fgpat_…`) | SHA-256 hash only (`users.personalTokenHash`); the token is shown once | Authenticates `POST /inbox`, the published calendar feed, **and the whole REST API** (everything except Delete account and adding a device) and the MCP connector | Until revoked/rotated in Connections, or account deleted | `server/src/lib/tokens.ts`, `server/src/lib/auth.ts:141-156`, `server/src/routes/integrations.ts:95-106`, `server/src/routes/users.ts:49-57` |
| Inbox items | Parking lot text (max 2000 chars) + an activity-log line with an optional `source` label | Sent by whatever automation the member points at `/inbox` | As parking lot | `server/src/routes/inbox.ts` |
| **Published calendar feed** `/calendar/<personal token>.ics` | Not stored; built on request | Whoever holds the URL (the member's calendar app; Google Calendar if added there via Quickstart) can read the plan from 7 days back to 60 days ahead: quest titles, block reasons, and the titles of imported calendar events (as fixed blocks). The URL **is** the personal access token. | Stops working when the token is revoked or rotated | `server/src/routes/calendarFeed.ts`, `client/src/lib/googleCalendar.ts:68-72` |
| **AI connection**: provider, model, the member's API key, last 4 chars, custom base URL, last error, last used | `ai_connections`; the key is **sealed** with AES-256-GCM under a key derived (HKDF) from `AI_KEYS_SECRET`, else `CLERK_SECRET_KEY`, else `DATABASE_URL`; never returned to a client | The key is checked by listing the provider's models when connected, and opened in memory only for a request | Until removed under Your AI, or account deleted | `schema.prisma:453-479`, `server/src/lib/secretBox.ts`, `server/src/routes/ai.ts:66-152` |
| Device sessions (iPhone app) | `device_sessions`: SHA-256 of the device token, name ("iPhone"), created, last used (written at most hourly) | | **No expiry.** Until the app signs out (`DELETE /devices/current`), a `DELETE /devices/:id`, or account deletion | `schema.prisma:481-498`, `server/src/lib/deviceSessions.ts`, `server/src/routes/devices.ts` |
| Device link codes | `device_links`: code hash, PKCE challenge, name, expiry (2 min), used-at | Sign-in hand-off | Spent or expired rows are deleted the next time anyone creates a link | `schema.prisma:500-517`, `deviceSessions.ts:76-89` |
| `users.googleCalendarToken` | Column exists; **nothing in `server/src` or `client/src` writes or reads it** (only stripped from responses) | | | `schema.prisma:17`, `server/src/routes/users.ts:13` |

## 4. AI features: exactly what is sent, to whom, when

Who answers (`server/src/lib/ai.ts:41-58`, function `completeFor`):

1. If the member has connected one or more AI keys, the one marked default (else the newest) is used: `pickActive`, `server/src/lib/aiProviders.ts:271-274`. The request goes from our server to that provider's API with the member's key: Anthropic via its SDK, or OpenAI, Google (Gemini), xAI, Mistral, DeepSeek, OpenRouter, or any HTTPS address the member typed for "Another provider" (`aiProviders.ts:51-138`).
2. **Otherwise, if the server has `ANTHROPIC_API_KEY` set (longer than 10 chars), the request goes to Anthropic with the server's key, model `claude-opus-5`** (`ai.ts:21-26,55-57`). The member is not asked; the Your AI page shows "In use: Claude · claude-opus-5 (the server's own key)" (`server/src/routes/ai.ts:54`, `client/src/pages/AiConnections.tsx:89-92`).
3. Otherwise the feature answers 503 `AI_NOT_CONFIGURED` and nothing is sent (`ai.ts:55`).

**Whether production has `ANTHROPIC_API_KEY` set: UNKNOWN.** `PLAN.md:103` lists setting it as an open task, which suggests not.

What each feature sends (all only when the member presses the button; there is no background AI call):

| Feature | Route | Sent to the provider | Evidence |
| --- | --- | --- | --- |
| Break down (quest detail) | `POST /quests/:id/decompose` | One prompt: fixed coaching instructions + the quest's **title, estimated minutes, mental load, impact, deadline (as a local date) and category**. Not the steps, tags, or anything else. | `server/src/routes/quests.ts:540-559`; client `client/src/components/QuestDetail.tsx:85-103` |
| Ask the Guild (Records, Ask tab) | `POST /chronicle/ask` | System prompt `GUILD_SYSTEM_PROMPT` (which describes the user as "one person with ADHD") + a markdown bundle: the **whole current permafile**; every **unfinished tracker item** (code, title, next action, domain, due date, CAS strands, learning outcomes, CAS dates, project/coursework flags, hours if shown; **not** notes, reflections, the decision list or parking lot as lists); the **activity log for the last 14 days** (client default; server allows 1-90), which includes **journal entries with mood ratings, check-in energy levels, quest titles, parked ideas, decisions, inbox items and earlier Ask questions** as they appear in the log; then the question. | `server/src/routes/chronicle.ts:207-261`, `server/src/lib/chronicle.ts:162-185,213-225`, `server/src/lib/tracker/markdown.ts:151-188,213-307`, `server/src/routes/tracker.ts:809-823`, `client/src/lib/api.ts:677-680` |
| Write a quest list from notes (Import quests) | `POST /ai/manifest` | Whatever the member typed or pasted (3-20,000 chars) + the format guide, which contains today's date | `server/src/routes/ai.ts:171-190`, `client/src/lib/manifest.ts:407-432`, `client/src/pages/QuestImport.tsx:88` |
| Test (Your AI) | `POST /ai/connections/:p/test` | "Reply with the single word: ready". No member data. | `server/src/routes/ai.ts:154-169` |
| Connect a key | `POST /ai/connections` | The key itself, to list the provider's models. No member data. | `server/src/routes/ai.ts:83-90` |

Logged afterwards: Ask stores the question text in the activity log (`chronicle.ts:267`); the manifest writer logs only the character count (`ai.ts:184`); the decomposer logs nothing. The provider's reply is returned to the client, not stored, except what the member chooses to save.

Not built yet: a prompt that asks before the first send and names the provider (gate E3 in `docs/IOS_APP_STORE.md:38`). The review notes say it exists.

## 5. Stored only on the device

| What | Where | Evidence |
| --- | --- | --- |
| Device token and Clerk user id (iPhone app) | iOS Keychain via `capacitor-secure-storage-plugin`. Cleared on sign-out, on a 401, and on first launch after a reinstall. | `client/src/native/auth.ts:55-57,129-179` |
| "Installed" marker | localStorage (`focusGuild.installed`) | `auth.ts:157-179` |
| Pending sign-in (PKCE verifier, state) | sessionStorage, minutes only | `auth.ts:59,84-120` |
| Active focus timer session (quest id, **quest title**, duration, start/pause times) | localStorage `focusGuild.activeSession` | `client/src/store/useTimerStore.ts:47-62` |
| End-of-day reflections (text, rating) by date | localStorage `focusGuild.reflections` (also posted to the server's journal) | `client/src/components/EndOfDayReflection.tsx:13-40,88-91` |
| Unsent journal draft | localStorage `fg:journal-draft` | `client/src/pages/Chronicle.tsx:35-56` |
| Look ("line"), sound, haptics, rank theme, scene, mascot, welcome hidden, tracker CAS mode / last review / collapsed domains / last domain, a dismissed suggestion | localStorage `fg:*`, `fg.*` | `client/src/lines/current.ts:18`, `client/src/lib/sfx.ts:16-17`, `client/src/lib/theme.ts:13`, `client/src/lib/scene.ts:7`, `client/src/store/useMascotStore.ts:17`, `client/src/lib/welcome.ts:2`, `client/src/store/useTrackerStore.ts:33-34`, `client/src/pages/Tracker.tsx:36`, `client/src/components/tracker/TrackerItemSheet.tsx:43`, `client/src/components/PlanInsights.tsx:16` |
| Greeted-this-session flags, app-link request, dev flags | sessionStorage | `client/src/lines/SceneWindow.tsx:22`, `client/src/components/mascot/MascotDock.tsx:26`, `client/src/native/linkRequest.ts:18`, `client/src/native/platform.ts:13`, `client/src/native/insets.ts:12` |
| "Time's up" notification (quest title, minutes) | Scheduled locally with `@capacitor/local-notifications`; never sent to a server. No push notifications exist (no push plugin in `client/package.json`). | `client/src/native/notify.ts:86-114` |
| Website offline shell | Service worker cache (website only, not the app) | `client/public/sw.js`, `client/src/main.tsx:62-68` |
| Fonts | Bundled from `@fontsource*` packages; no request to Google Fonts | `client/package.json`, `docs/IOS_APP_STORE.md:34` (gate C4) |

## 6. Technical data

| What | Where | Retention | Evidence |
| --- | --- | --- | --- |
| Request log: one line in and one out per request, `METHOD /path?query STATUS time`. **No IP, headers, or bodies.** But paths include the published-feed URL `/calendar/fgpat_….ics`, so **the personal access token is printed in plain text** on every calendar-app poll, as is `?token=` on `/inbox` when a tool uses it. | Railway's log stream (stdout) | **UNKNOWN** (Railway's log retention for the plan) | `server/src/index.ts:24`; `server/node_modules/hono/dist/middleware/logger/index.js` (prints `url.slice(url.indexOf("/", 8))`) |
| Unhandled errors (`console.error(err)`), the failed-Clerk-delete line (user id and Clerk id), calendar loop warnings | Railway logs | UNKNOWN | `server/src/index.ts:93-98`, `server/src/lib/deleteAccount.ts:55`, `sync.ts:124` |
| Time-zone offset on every request (`tz` query value added by the client's `request()`; `X-Tz-Offset` header is also allowed) | Used to compute "today"; not stored in the database (it does appear in the request log, as part of the query string) | Not stored | `client/src/lib/api.ts:50-57,100-107`, `server/src/index.ts:50-52`, `server/src/lib/memberDay.ts` |
| Clerk user id in a query string: `GET /quests?clerkId=…` | Leftover from dev auth; ignored for auth when Clerk is on, but **printed in the request log** | Railway logs | `client/src/lib/api.ts:372` |
| IP addresses and user agents | Not read or stored by our code. Seen by Railway, Vercel and Clerk as hosts. | UNKNOWN (each host's own logs) | absence in `server/src` |
| CORS | Only the website origins in `CLIENT_URL` and `capacitor://localhost` | | `server/src/index.ts:26-56` |

## 7. Third parties

| Company | Role | Data | Evidence |
| --- | --- | --- | --- |
| Clerk | Accounts and sign-in (website; the app signs in through the website) | Email, sign-in credentials, session data, IP/user agent at sign-in | `client/src/main.tsx`, `server/src/lib/auth.ts`, `DEPLOY.md:86-107` |
| Neon | Postgres database | Everything in sections 1-3 | `server/package.json` (`@neondatabase/serverless`, `@prisma/adapter-neon`), `DEPLOY.md:6`. Region: the database host is in **AWS us-east-1** (read from the host name in the local `server/.env`, which `DEPLOY.md:129` says is the production database). Owner to confirm. |
| Railway | Runs the API server | Everything passes through it; request logs | `DEPLOY.md:4,26-48`. Region **UNKNOWN**. |
| Vercel | Hosts the website (static files) and these three pages | Request metadata (IP, user agent) in Vercel's logs; no app data | `DEPLOY.md:5,52-69`, `client/vercel.json`. No Vercel Analytics package. |
| Apple | Distributes the app; Keychain and local notifications are on-device | App Store's own data; not ours | |
| AI providers (Anthropic, OpenAI, Google, xAI, Mistral AI, DeepSeek, OpenRouter, or a member-chosen address) | Only when the member uses an AI feature | Section 4 | `server/src/lib/aiProviders.ts` |
| The member's calendar host (Google, Microsoft, Apple...) | We fetch the link the member gave | We send only an HTTPS GET with our User-Agent | `sync.ts:19-44` |

No analytics, advertising, crash-reporting or tracking SDK: none in `client/package.json`, `server/package.json`, `mcp/package.json`; no such host or package name in `client/src` (searched for analytics, sentry, posthog, gtag, mixpanel, segment, amplitude, plausible, firebase, crashlytics, bugsnag, datadog, hotjar, fonts.googleapis, @vercel; the only hits are unrelated words in game code). The only third-party host the client calls is Clerk (website only); every other request goes to our API (`client/src/lib/api.ts:48`). `client/ios/App/App/PrivacyInfo.xcprivacy` declares no tracking.

## 8. Deletion and export, as built today

**Delete account (server):** `DELETE /users/me` with `{ "confirm": "DELETE" }`, allowed from the website session or a device token, refused for a personal access token. Deletes the `users` row; every table cascades (Reflection via TrackerItem; ExternalEvent via CalendarSource and User), inside one database statement; then deletes the Clerk user. Immediate. If the Clerk call fails, the data is still gone and `identityRemoved: false` is returned. `server/src/routes/users.ts:44-67`, `server/src/lib/deleteAccount.ts`.

**Delete account (client): NOT BUILT.** `client/src/pages/Settings.tsx:476-511` has an Account section (iPhone app only) with Sign out; the comment says Delete account will join it. Nothing in `client/src` calls `DELETE /users/me`. The website has no delete button either. `docs/IOS_APP_STORE.md:36` (gate E1: "The screen in Settings is not built yet").

**Sign a device out:** the app's Sign out revokes its own token (`auth.ts:311-327`). The server has `GET /devices` and `DELETE /devices/:id`, but **no screen lists devices** on the website or in the app (`devicesApi.list` is only called in tests). Deleting the account removes all device sessions.

**Backups:** Neon keeps a point-in-time restore history; its length for this project is **UNKNOWN**. Deleted rows remain in that history until it ages out. The review notes offer to "restore" the demo account if deleted, which implies a restore path (reseeding, or Neon history).

**Export (what exists):**
- Records, Log tab: shows the activity log for 7, 30 or 90 days on screen; no copy or download of its own (`client/src/pages/Records.tsx:44,118-146`). `GET /chronicle/log/markdown` exists on the server but no screen calls it.
- Records, Bundle tab: permafile + unfinished tracker items + log (7/30/90 days), copy or download `.md` (`Records.tsx:507-586`).
- Expeditions, Markdown export: tiers compact/working/full/archive; archive includes done and dropped items, notes, reflections, decisions and parking lot; copy or download (`client/src/pages/TrackerMarkdown.tsx`, `server/src/routes/tracker.ts:826+`).
- Quickstart, export quests: every **unfinished** quest with its steps, as a manifest, copy or save (`client/src/pages/Quickstart.tsx:382-463`, `server/src/routes/manifest.ts:54-62`).
- Tracker presets as JSON (`client/src/pages/TrackerPresets.tsx:145`).
- Not covered by any export: completed quests, check-ins, XP and trophies, journal older than 90 days, permafile history, CAS interviews, calendar connections. A member with a personal access token can read all of it through the REST API.
- In the iPhone app only Copy is offered: uncommitted work in the tree (13 Nov) hides the Download / Save buttons when `isNativeApp` ("The app's WebView cannot save a file"), in Records, TrackerMarkdown and Quickstart. The website offers both.

## 9. Out of scope for the policy (deliberately)

- The MCP connector (`mcp/`): runs on the member's own computer with their personal access token; it talks only to our API. Covered by "personal access token".
- Local development mode (`X-Dev-Clerk-Id`): refused whenever `CLERK_SECRET_KEY` is set (`auth.ts:67-93`).
- `client/public/manifest.webmanifest` share target: website (installed web app) only.

## 10. Owner must answer before publishing

1. Is `ANTHROPIC_API_KEY` set on Railway in production? (Decides whether members without a key send text to Anthropic under our account.)
2. Clerk: which sign-in methods are on; is it a production instance; Clerk's data region.
3. Railway region; Neon region (host says AWS us-east-1); Neon history/backup window.
4. Railway and Vercel log retention.
5. Operator name, contact email, province.
6. Build Delete account in Settings → Account (app) before submission; decide what the website offers.
7. Build the AI consent prompt (gate E3) or change the review notes.
