# Throwaway database

An in-memory Postgres (PGlite) with every migration in `server/prisma/migrations`
applied, and a preload that points the server at it. Use it whenever the server
has to run outside production: a server started from a checkout normally talks
to the real database. Stopping the database throws everything away; the next
start is an empty database with a brand-new member.

Used by the iOS sign-in check (`client/ios/ci/signin/run.sh`); works the same on
Windows, macOS and Linux with Node 22 or later.

## Use

```sh
cd ci/throwaway && npm ci                                   # once
node db.mjs ../../server/prisma/migrations 54329            # leave running; prints "pglite ready on 127.0.0.1:54329"
```

In a second terminal, from `server/`, with **no `server/.env` or
`server/.env.local`** (the server reads them at start, and they hold the live
Clerk key and other real settings) and no `CLERK_SECRET_KEY` in the shell, which makes the server run in dev auth: every request is the
dev member `dev-member-001`, or whoever an `X-Dev-Clerk-Id` header names.

```sh
cd server
LOCAL_PG_URL=postgresql://postgres@127.0.0.1:54329/postgres PORT=3091 CLIENT_URL=http://127.0.0.1:5191 \
  npx tsx --import "$(node -p 'require("url").pathToFileURL("../ci/throwaway/preload.mjs").href')" src/index.ts
```

(`--import` wants a file URL; the `node -p` part makes one on any system.)
The server needs `npm ci` in `server/` first, which also generates the Prisma
client the preload loads from `server/generated/prisma`.

A client against it: `cd client && VITE_API_URL=http://127.0.0.1:3091 npx vite --port 5191 --strictPort --host 127.0.0.1`.

## Things to know

- PGlite serves one connection at a time, so the preload opens a pool of one.
  Do not point a second client (psql, a script) at it while the server runs.
- The preload refuses to start unless `LOCAL_PG_URL` points at 127.0.0.1 or
  localhost, so a missing variable can never fall through to a real database.
- Stop the database and the server by the PID listening on their ports, not by
  process name (other Node processes may be yours).
