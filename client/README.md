# Focus Guild — client

React 19 + TypeScript + Vite + Tailwind v4 + Zustand + Framer Motion. Deployed on Vercel from `main`.

The project-wide picture (what exists, how to run it, what's open) is in
`../FocusGuildInstructions.md` → "Current Build Phase" and `../PLAN.md`.

## Run

```bash
npm install
npm run dev
```

Open **http://127.0.0.1:5173** (not `localhost`). With `client/.env.local`
blanking `VITE_CLERK_PUBLISHABLE_KEY` and `VITE_API_URL=http://127.0.0.1:3000`,
no Clerk account is needed; the server must be running too.

| Script | Does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck (`tsc -b`) + production build |
| `npm test` | Vitest (pure libs, e.g. the quick-add grammar) |
| `npm run icons` | Regenerate the PWA icons in `public/` (`scripts/generate-icons.mjs`) |

## Layout

- `src/pages/` — one file per route (`App.tsx` has the router; heavier pages are lazy-loaded)
- `src/components/` — shared UI; `tracker/` for the tracker, `mascot/` for the duck
- `src/store/` — Zustand stores (quests, schedule, tracker, timer, …)
- `src/lib/api.ts` — every server call and its types; `request()` throws `ApiRequestError` carrying the server's error code
- `src/lib/quickAdd.ts` — the quick-add grammar, shared by the Today bar and bulk import
- `public/` — PWA manifest, service worker (`sw.js`, production only), icons

Conventions: Lucide icons (no emoji), theme tokens in `src/index.css` (`var(--color-…)`), modals as bottom sheets, Guild/quest wording in all copy.
