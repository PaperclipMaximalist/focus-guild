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
   | `ANTHROPIC_API_KEY`  | *(optional)* from console.anthropic.com. Leave empty to disable the AI Decomposer.             |

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

## 5. (Optional) AI Quest Decomposer

1. Get an API key at [console.anthropic.com](https://console.anthropic.com) → API Keys.
2. Paste it into Railway as `ANTHROPIC_API_KEY`.
3. Railway redeploys. The 🪄 "Break down" button on any Quest Detail modal will now work.

Without the key, the button shows a friendly "AI features are off" message instead of crashing.

---

## 6. Updating

Each push to `main` triggers both Railway and Vercel to redeploy. If you change the Prisma schema:

```bash
cd server && npx prisma migrate dev --name describe_the_change
# commit + push the new migration folder under server/prisma/migrations/
```

Railway runs `prisma migrate deploy` on every start, so the schema stays in sync.

---

## Troubleshooting

| Symptom                                                          | Cause / fix                                                                 |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Client loads but every request errors with CORS                  | Check `CLIENT_URL` in Railway matches your Vercel URL **exactly** (https + no trailing slash). |
| Railway build fails with "Prisma client not generated"           | Confirm `package.json` has `"postinstall": "prisma generate"` (it does).    |
| `prisma migrate deploy` fails on first deploy                    | Verify `DATABASE_URL` in Railway matches your Neon connection string.       |
| Schedule endpoints all 401 in prod                               | You set `CLERK_SECRET_KEY` but no Clerk Bearer token is being sent. Either set up the client SDK (step 4) or clear `CLERK_SECRET_KEY` to fall back to dev mode. |
| Neon DB sleeps and first request after idle takes ~5 seconds      | Normal — Neon serverless cold-start. Hit `/health` from a cron to keep warm. |
