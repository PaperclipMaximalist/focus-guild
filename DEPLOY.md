# Deploying Focus Guild

End-to-end guide for getting Focus Guild on the internet using:
- **Server** → Railway (free tier)
- **Client** → Vercel (free tier)
- **Database** → Neon (already set up)
- **Auth** → Clerk (optional; app works in dev-mode without it)
- **AI** → Anthropic (optional; the 🪄 Quest Decomposer button 503s without it)

Total time: ~20 minutes if all accounts are created.

---

## 0. Prerequisites

- A GitHub repo containing this code (push the `main` branch).
- Accounts (all free):
  - [Railway](https://railway.app) — connect with GitHub.
  - [Vercel](https://vercel.com) — connect with GitHub.
  - [Clerk](https://clerk.com) — only if you want real sign-in (skip for now to ship faster).
  - [Anthropic](https://console.anthropic.com) — only if you want the AI Decomposer.
- Your existing Neon `DATABASE_URL` (already in `server/.env`).

---

## 1. Server → Railway

1. Railway dashboard → **New Project** → **Deploy from GitHub repo** → pick this repo.
2. After the initial import, click **Settings** → **Root Directory** → set to `server`.
3. Click **Variables** and add:

   | Variable             | Value                                                                                          |
   | -------------------- | ---------------------------------------------------------------------------------------------- |
   | `DATABASE_URL`       | (copy from your local `server/.env`)                                                           |
   | `CLIENT_URL`         | Leave empty for now — you'll fill it in after the Vercel deploy in step 2.                     |
   | `CLERK_SECRET_KEY`   | *(optional)* from Clerk dashboard → API Keys → "Secret keys". Leave empty to use dev-mode auth. |
   | `ANTHROPIC_API_KEY`  | *(optional)* from console.anthropic.com. The AI features run on whatever each person connects under Advanced → Your AI; this is the fallback for people who connect nothing. |
   | `AI_KEYS_SECRET`     | *(optional, recommended)* any long random string. Seals the API keys people save under Your AI. Without it `CLERK_SECRET_KEY` is used, and saved keys must be pasted again if that ever changes. |
   | `APPLE_TEAM_ID`, `APP_LINK_RETURN` | *(optional, later)* switch the iPhone app's sign-in hand-off to a Universal Link. Leave both unset until the steps in `docs/UNIVERSAL_LINKS.md` say otherwise; unset, nothing changes. |

   `PORT` is set by Railway automatically — do **not** set it yourself.

4. Railway auto-deploys. Wait for the build to finish (~2 minutes).
5. **Settings → Networking → Generate Domain**. You'll get something like `focus-guild-api-production.up.railway.app`.
6. Hit `https://YOUR-RAILWAY-URL/health` in your browser — should return `{ "status": "ok" }`. ✅

The build command is `npm ci && npm run build` (runs `prisma generate && tsc`).
The start command is `npm run start` (runs `prisma migrate deploy && node dist/src/index.js`),
so the Neon schema is brought to head every deploy.

---

## 2. Client → Vercel

1. Vercel dashboard → **Add New** → **Project** → import the same GitHub repo.
2. **Configure Project**:
   - **Root Directory**: `client`
   - **Framework Preset**: should auto-detect as Vite — leave it.
   - **Build Command**: `npm run build` (default)
   - **Output Directory**: `dist` (default)
3. **Environment Variables** — add:

   | Variable                      | Value                                                                           |
   | ----------------------------- | ------------------------------------------------------------------------------- |
   | `VITE_API_URL`                | `https://YOUR-RAILWAY-URL` (no trailing slash)                                  |
   | `VITE_CLERK_PUBLISHABLE_KEY`  | *(optional)* from Clerk → API Keys → "Publishable keys". Leave empty for now.   |

4. Click **Deploy**. Wait ~1 minute.
5. You'll get a URL like `focus-guild.vercel.app`. **Copy this URL.**

---

## 3. Wire the two together

Back in **Railway → Variables**:

- Set `CLIENT_URL` = `https://focus-guild.vercel.app` (your Vercel URL — no trailing slash).
- If you have a custom domain on Vercel too, comma-separate:
  `CLIENT_URL=https://focus-guild.vercel.app,https://focusguild.app`

Save → Railway redeploys (~30s).

Open your Vercel URL. The app should load, fetch your existing dev data, and Just Work. 🎉

---

## 4. (Optional) Real Clerk auth

The server middleware already verifies Clerk Bearer tokens when `CLERK_SECRET_KEY` is set. The client just needs the React SDK.

1. **Clerk dashboard** → create an Application.
2. Copy the **Publishable key** (`pk_test_…` or `pk_live_…`) into Vercel as `VITE_CLERK_PUBLISHABLE_KEY`.
3. Copy the **Secret key** (`sk_test_…`) into Railway as `CLERK_SECRET_KEY`.
4. On the client:

   ```bash
   cd client && npm install @clerk/clerk-react
   ```

   Then wrap `App` in `<ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}>` and replace the `X-Dev-Clerk-Id` header in `client/src/lib/api.ts` with:

   ```ts
   const { getToken } = useAuth();
   const token = await getToken();
   headers: { Authorization: `Bearer ${token}` }
   ```

   (This step is intentionally left for when you're ready — the server side is already production-ready.)

---

## 5. (Optional) AI features: Quest Decomposer + Ask the Guild

1. Get an API key at [console.anthropic.com](https://console.anthropic.com) → API Keys.
2. Paste it into Railway as `ANTHROPIC_API_KEY`.
3. Railway redeploys. "Break down" on a quest and Chronicle → **Ask** now work.

Without the key both return 503 with a clear message (Ask points at the Bundle tab instead). The model is `AI_MODEL` in `server/src/lib/ai.ts`.

---

## 6. Updating

Each push to `main` triggers both Railway and Vercel to redeploy. Railway's `/health` healthcheck keeps the old deployment serving until the new one is healthy.

**Schema changes.** Railway runs `prisma migrate deploy` before the server starts, so a failing migration takes the server down. Rules that have held so far:

- Write migrations **idempotently** (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `DO $$ … EXCEPTION WHEN duplicate_object …`), additive only.
- `prisma migrate dev` can't reach Neon from the Windows dev machine. Write the SQL by hand under `server/prisma/migrations/<timestamp>_<name>/`, run `npx prisma generate` locally, and let the deploy apply it.
- Local dev shares the production database, so **the local server errors after a schema change until the deploy applies the migration** (Prisma selects every column). Deploy promptly, or give local its own Neon branch.

**Checking a deploy landed:**
- Client: fetch the Vercel page, find the `assets/index-*.js` name, and grep that bundle for a string new in the release.
- Server: `GET /health` answers `{ "status": "ok", "commit": "<7 chars>" }`, the commit Railway built (`RAILWAY_GIT_COMMIT_SHA`; `null` when run locally). Compare it with `git rev-parse --short main`. With a migration, the new rows in `_prisma_migrations` (via the Neon HTTP driver) confirm it too.

**What's live and needs no setup:** the PWA (`client/public/manifest.webmanifest`, `sw.js`), token-authed `/inbox` (personal token) and `/calendar/<token>.ics` (the feed's own token), both skipped by `requireUser`, and the 15-minute calendar sync loop in the server process.

**The calendar feed token** (built 2026-11-14, merged into `ios-app` the same day, so it ships when `ios-app` is deployed; delete this note once done). Until this ships, a plan feed link carries the member's personal access token, which opens the whole API. What changes on deploy, and what to do:

- Migration `20261113120000_calendar_feed_token` adds two nullable columns to `users` (`calendarFeedTokenHash`, unique; `oldFeedLinkSeenAt`). Additive and idempotent. As with any schema change, a local server on this branch errors against the shared database until the deploy has applied it.
- **Every existing plan feed link stops working the moment the server restarts** (404, no grace period: each fetch of an old link sends a full key to the account through a calendar company and the host). Calendars that subscribed to one go quiet. A member whose calendar still asks sees a notice in Connections and Quickstart saying what to do.
- Deploy server and client together. A new client on an old server cannot make the link (404 on `/integrations/feed-token`); an old client on the new server makes links that no longer work.
- Afterwards, for your own account: make a new plan link (Connections → Plan feed, or Quickstart) and add it to your calendar; remove the old Focus Guild calendar there, so it stops sending the old link; then make a new personal token (Connections → Inbox) and give it to the inbox automations and the Claude connector. The old token has been printed in Railway's logs on every calendar fetch, so it should not stay valid.
- Railway keeps its own HTTP log of every request's path, apart from the server's (masked) log. Check how long it is kept, and whether it shows the query string (the inbox's `?token=`). The feed token in it can only read the plan.
- Check: `GET /calendar/<your old link's token>.ics` answers 404; the new link answers a calendar; `curl -H "Authorization: Bearer <feed token>" <api>/quests` answers 401; the Railway log shows `/calendar/[redacted].ics`.

### What else ships with ios-app (not about the iPhone)

Deploying `ios-app` (a fast-forward of `main`) puts these live too. They are
website and server changes that share the branch; the iPhone changes, and
the iPhone-driven changes that also show on the website (Delete account,
signed-in iPhones, the question before an AI request, the public legal
pages, bundled fonts, the `/app-link` page), are in `docs/IOS_CHANGELOG.md`.

| Commit | What | Watch on deploy |
| --- | --- | --- |
| `d37d69e`, `a821191`, `47fe6b1` (merged as `ff3926a`) | The plan feed gets its own read-only token; Connections and Quickstart make it apart from the personal token; the request log hides both tokens; privacy, terms and support say so | **Old plan feed links stop at once**: the steps above. One migration, `20261113120000_calendar_feed_token`. |
| `2538766` | The Guild Master's AI instructions no longer tell the AI provider the member has ADHD | Nothing |
| `48bea1a` | The website opened from a phone's home screen keeps clear of the notch (shared with the app as the `edge:` variant) | Nothing in a browser tab |
| `8769de7` | Lint clean (40 problems to none, no behaviour change meant); Mileage's "Last 7 days" bars have real heights | Quest editor, quest sheet, Stragglers, Expeditions were driven by hand after it |
| `1b7d9fc` | Sliders drawn in each look's colours | Looks different from before, on purpose |
| `921a7fa` | Sample data only (the sample member's level) | Nothing |
| `7729d97` (server half) | `GET /.well-known/apple-app-site-association` and `GET /app-link/return` exist; 404 and a fixed page until `APPLE_TEAM_ID` is set | Nothing while the two variables are unset |
| `eecd9d0` | `client/vercel.json` turns off automatic Vercel deployments for `ios-app`, `ci-shots`, `ci-signin` | Production still deploys from `main` |

Two migrations in total run on that deploy: `20261113000000_device_sessions`
(the iPhone sign-in) and `20261113120000_calendar_feed_token`. Both are
additive and safe to run twice.

---

## Troubleshooting

| Symptom                                                          | Cause / fix                                                                 |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Client loads but every request errors with CORS                  | Check `CLIENT_URL` in Railway matches your Vercel URL **exactly** (https + no trailing slash). |
| Railway build fails with "Prisma client not generated"           | Confirm `package.json` has `"postinstall": "prisma generate"` (it does).    |
| `prisma migrate deploy` fails on first deploy                    | Verify `DATABASE_URL` in Railway matches your Neon connection string.       |
| Schedule endpoints all 401 in prod                               | You set `CLERK_SECRET_KEY` but no Clerk Bearer token is being sent. Either set up the client SDK (step 4) or clear `CLERK_SECRET_KEY` to fall back to dev mode. |
| Neon DB sleeps and first request after idle takes ~5 seconds      | Normal — Neon serverless cold-start. Hit `/health` from a cron to keep warm. |
