# Focus Guild — Project Bible

## What This App Is
Focus Guild is a gamified ADHD task manager. Tasks are auto-sorted by a
priority score calculated from deadline proximity, estimated time, mental
load, and personal impact. Completing tasks earns XP, builds streaks, and
unlocks achievements. The entire UX is designed around the ADHD brain:
fast capture, minimal visible lists, and immediate dopamine feedback on
every action.

The "Guild" framing means the user is a member leveling up — not a
patient managing symptoms. Language throughout the app should reflect
that: quests, not tasks. Completing, not curing.

## Priority Score Formula
score = (urgency × 0.40) + (mental_load × 0.25) + (time_pressure × 0.25) + (impact × 0.10)

- urgency       = clamp(10 / days_until_due, 0, 10)
- time_pressure = estimated_hours / available_hours_today × 10
- mental_load   = user-rated 1–10
- impact        = user-rated 1–10

Weights live in server/src/lib/priority.ts. Never change them without
updating this file. The score is recalculated on every session load and
any time a task field is edited.

## Mood Modifier
Daily check-in captures energy (1–5) and available hours. On energy ≤ 2,
the mental_load coefficient increases to 0.40 and urgency drops to 0.30,
surfacing easier wins first. Logic lives in server/src/lib/priority.ts
alongside the base formula.

## Tech Stack
- Frontend:  React 19 + TypeScript + Vite + Tailwind v4 + Framer Motion + Zustand + Lucide icons
- Backend:   Node 22 + Hono + Prisma 7 (Neon adapter) + PostgreSQL (Neon serverless)
- Auth:      Clerk
- AI:        Anthropic Claude API (Quest Decomposer, Ask the Guild) + an MCP connector in mcp/
- Deploy:    Vercel (client) + Railway (server)
- Mobile:    installable PWA (manifest + service worker + share target)

## File Structure
focus-guild/
├── client/
│   └── src/
│       ├── components/     ← reusable UI (TaskCard, Timer, XPToast, etc.)
│       ├── pages/          ← route-level views (Today, Quests, Guild, Stats)
│       ├── store/          ← Zustand stores (tasks, user, session)
│       ├── hooks/          ← custom React hooks
│       └── lib/            ← pure utils, no React (formatters, constants)
├── server/
│   └── src/
│       ├── routes/         ← Hono route handlers
│       ├── lib/            ← business logic (priority.ts, xp.ts, streak.ts)
│       └── db/             ← Prisma client + seed script
│       lib/scheduler/      ← the planner (see its README + SCHEDULER_PSEUDOCODE.md)
│       lib/tracker/, lib/calendar/ ← tracker + CAS, ICS in/out
├── server/scripts/         ← scenario-lab.ts (npm run lab), migration helpers
├── mcp/                    ← Claude Desktop / Code connector
├── FocusGuildInstructions.md ← this file (the Project Bible)
├── PLAN.md                 ← roadmap: what's done, what's open
├── WORKLOG.md              ← day-by-day history with hours
├── DEPLOY.md               ← Railway + Vercel setup and gotchas
└── .env files              ← never committed

## Database Models (Prisma)
- User              — Clerk ID, level, totalXP, currentStreak, multiplier
- Quest             — title, estimatedMinutes, mentalLoad (1–10), impact (1–10),
                      deadline, status, parentQuestId (for sub-quests), tags
- DailyCheckIn      — userId, date, energyLevel (1–5), availableMinutes
- XPEvent           — userId, questId, amount, reason, createdAt
- Achievement       — slug, title, description, icon, xpReward
- UserAchievement   — userId, achievementId, unlockedAt
- ScheduleBlock, RecurringCompletion — persisted plan + daily completions
- TrackerDomain, TrackerItem, Reflection, ParkingLotEntry, DecisionLogEntry,
  CasInterview      — the tracker + CAS lens
- ActivityEntry (activity_log), PermafileVersion — Chronicle + permafile
- CalendarSource, ExternalEvent — ICS feeds and their busy events
- User also carries schedulerSettings / trackerSettings (JSON overrides),
  trackerCodeHighWater and personalTokenHash (SHA-256 of the fgpat_ token)

## XP Rules
- Base XP per quest = estimatedMinutes / 5 (rounded)
- Multiplied by: mentalLoad / 5 (so load-10 task = 2× base)
- Multiplied by: time_pressure bonus (capped at 1.5×)
- Multiplied by: current streak multiplier (1.0× → 2.5× over 7 days)
- XP logic lives in server/src/lib/xp.ts

## Streak Rules
- Completing ≥ 1 quest per day increments streak
- Missing a day sets multiplier to 0.75× (not zero — no shame spirals)
- Streak and multiplier recalculate at midnight UTC via a scheduled job
- Logic lives in server/src/lib/streak.ts

## Guild Levels & Titles
1   Foggy Brain         (0 XP)
2   Task Apprentice     (500 XP)
3   Focus Wielder       (1500 XP)
4   Deadline Slayer     (3500 XP)
5   Flow Master         (7000 XP)
6   Guild Champion      (13000 XP)
7   Legendary Quester   (25000 XP)
Each level unlocks a visual theme. Defined in client/src/lib/levels.ts.

## Achievements (initial set)
- early-bird          Complete your top quest before 10am, 3 days running
- brain-drain         Finish a mental-load 9+ quest in one session
- zero-overdue-week   End a week with no overdue quests
- time-whisperer      Estimated time within 15% of actual on 5 quests in a row
- chaos-agent         Use Spin the Wheel 10 times
- rescue-ranger       Clear all Rescue Mode quests in a single session
Defined in server/src/db/seed.ts and seeded on first run. The live catalog is
14 achievements (server/src/lib/achievements.ts adds first-blood, dedicated,
centurion, week-warrior, unbreakable, night-owl, marathon, flow-state).

## AI Integration (Anthropic API)
Two features powered by Claude:
1. Quest Decomposer — user pastes a vague goal, Claude returns JSON array
   of subtasks with suggestedMinutes and suggestedMentalLoad for each.
2. What Next Advisor — given current energy, available time, and top quests,
   Claude returns a single recommended quest slug + one-sentence reason.

As built: the Quest Decomposer is POST /quests/:id/decompose; the "what
next" role became **Ask the Guild** (POST /chronicle/ask), which answers from
the user's permafile + tracker + activity log and returns at most three
tap-to-apply suggestions. The client lib is server/src/lib/ai.ts, model in
`AI_MODEL` (claude-opus-5). Both 503 cleanly without ANTHROPIC_API_KEY.
Never hardcode API keys.

## Terminology (use consistently everywhere — UI, code, comments)
- Quest      not Task
- Guild      not App
- Rescue     not Overdue
- Streak Paused  not Failed Streak
- Member     not User (in UI copy only; variable names use `user`)
- Complete   not Done / Finish / Mark as done

## Hard UX Rules (never break)
- Default view shows MAX 5 quests. Full list is one tap away but hidden.
- Quick-add requires only a title. All other fields optional, filled later.
- XP toast appears within 200ms of quest completion. Never delayed.
- Mental load input is an emoji slider (😴→🤯), never a raw number field.
- No punishment language anywhere in the UI — see terminology above.
- Completion animation plays every single time. Never skip it.
- "Not Today" is a first-class button on every quest card, not buried in a menu.

## Code Style
- 2-space indentation, no tabs
- Named exports only (no default exports except page-level components)
- Zod schemas for all API request/response validation
- All DB access through Prisma — no raw SQL
- API success: { success: true, data: {...} }
- API error:   { success: false, error: { code: string, message: string } }
- Component files: PascalCase (QuestCard.tsx)
- Utility files:   kebab-case (priority-engine.ts)
- Zustand stores:  camelCase with `use` prefix (useQuestStore.ts)

## Environment Variables
server/.env  →  DATABASE_URL, CLERK_SECRET_KEY, CLIENT_URL (CORS, comma-separated), ANTHROPIC_API_KEY (optional), PORT
client/.env  →  VITE_API_URL, VITE_CLERK_PUBLISHABLE_KEY
*.env.local  →  gitignored overrides for account-free local runs (blank Clerk keys, local API URL)
Never commit .env files. Never log API keys.

## Current Build Phase
[Update this at the end of every session. History lives in WORKLOG.md and git; this section is the current state only.]

**As of 2026-09-26: everything below is built, deployed and live.** Production is `main` @ `5688211`, auto-deployed from `main` (Railway server + Vercel client). The open work is in `PLAN.md`.

### Live
- Client: https://focus-guild-ten.vercel.app · Server: https://focus-guild-production.up.railway.app (`/health`)
- GitHub: PaperclipMaximalist/focus-guild (private). Working branch `presets-and-chronicle` is level with `main`, apart from this docs update.
- Real Clerk auth in production (still on Clerk's *development* keys: the sign-in shows "Development mode").
- DB: Neon Postgres. **Local dev uses the same database as production** (no dev branch yet), so local testing writes real rows.

### What exists (feature map → where it lives)
| Area | What | Where |
|---|---|---|
| Quests | CRUD, quick-add grammar (`2h by fri #tag !high`), sub-quests, Not Today (held to tomorrow, revived at the user's midnight), Rescue for overdue, bulk text import (`/quests/import`) | `routes/quests.ts`, `lib/deferral.ts`, `client/src/lib/quickAdd.ts`, `pages/{Today,Quests,QuestImport,Rescue}.tsx` |
| XP & ranks | XP, streaks, 7 ranks, 14 achievements, Trophy Room, rank theming, SFX/haptics, duck mascot, Lucide icons, "devcave" theme | `lib/{xp,streak,achievements,evalAndUnlock}.ts`, `pages/Trophies.tsx`, `components/mascot` |
| Guild Feed | Timeline with live countdown, drag/pin/delete, "why now" reason per block, plan insights (overdue, routines crowding, backlog pace, working-hours suggestion, estimate calibration), energy sparkline | `pages/GuildFeed.tsx`, `components/PlanInsights.tsx`, `routes/schedule.ts` |
| Scheduler | budget → construct → reflow; real sittings, breaks, peak hours for heavy work, pacing, deadline preemption, calendar + routine fixed blocks, self-correcting estimates | `server/src/lib/scheduler/` (see its README + SCHEDULER_PSEUDOCODE.md), `scripts/scenario-lab.ts` |
| Focus timer | Persists across refresh; logs focused minutes (pauses excluded) on Done / "Stop for now, keep progress" → `actualMinutes` | `components/FocusTimer.tsx`, `POST /quests/:id/focus` |
| Tracker + CAS | Long-horizon items with codes, 5 statuses (editable labels), active cap, domains, parking lot, decision log, CAS lens (7×3 matrix, strands, interviews), presets + preset packs (IB Guild / Bad-week minimal / Projects & work), add templates, markdown export/import, "Schedule as quest" | `routes/tracker.ts`, `lib/tracker/*`, `pages/Tracker*.tsx`, `client/src/lib/trackerPacks.ts` |
| Chronicle | Activity log (written as a side effect of real actions), journal, versioned permafile, AI context bundle, Ask the Guild (Claude, tap-to-apply suggestions) | `routes/chronicle.ts`, `lib/{activity,chronicle}.ts`, `pages/Chronicle.tsx` |
| Connections | ICS calendar import (Google / Outlook-Teams / iCloud) the planner routes around; personal access token (`fgpat_…`) for the inbox, REST API and MCP; `POST /inbox` → Parking Lot; plan published as `/calendar/<token>.ics` | `routes/{integrations,inbox,calendarFeed}.ts`, `lib/calendar/*`, `lib/tokens.ts`, `pages/Connections.tsx` |
| PWA | Installable, offline shell, shortcuts, Android share target → Parking Lot (`/share`) | `client/public/{manifest.webmanifest,sw.js}`, `client/scripts/generate-icons.mjs` |
| MCP | Claude Desktop / Code connector: 6 reads + additive writes | `mcp/` (see its README) |
| Settings | Scheduler weights, working hours (half hours allowed), experience toggles, Connections link | `pages/Settings.tsx`, `routes/settings.ts` |

Client routes: `/ /feed /rescue /checkin /quests /quests/import /stats /settings /trophies /tracker /tracker/presets /tracker/markdown /chronicle /connections /share`.
Server routes: `/users /quests /checkin /schedule /settings /tracker /chronicle /integrations` (Clerk or `fgpat_` token), plus token-in-URL `/inbox` and `/calendar/<token>.ics`.

### How to run, test, ship
- Local: two terminals. `cd server && npm run dev` (port 3000), `cd client && npm run dev` (open **http://127.0.0.1:5173**, not localhost). No Clerk needed: `server/.env.local` and `client/.env.local` switch to dev auth (`dev-member-001`).
- Tests: `cd server && npm test` (242) · `cd client && npm test` (10) · **`cd server && npm run lab`** for the scheduler (grade whole plans; run before and after any scheduler change).
- Ship: merge to `main` and push; Railway runs `prisma migrate deploy` on boot. Migrations must be **idempotent** (a failing one takes the server down). The Prisma schema engine can't reach Neon from this Windows machine; the Neon HTTP driver works for reads.
- AI features (Quest Decomposer, Ask the Guild) need `ANTHROPIC_API_KEY` on the server; without it they return 503 with a clear message. Model: `AI_MODEL` in `server/src/lib/ai.ts` (`claude-opus-5`).

### Gotchas worth knowing
- `PUT /settings` **replaces** the whole override set: merge before saving (PlanInsights does).
- `GET /quests` lists ACTIVE only; RESCUE quests (overdue) show on Rescue.
- The in-app browser can't register service workers; test the PWA on a real phone.
- The dev account has every recurring quest duplicated (test data), which is why its routines take ~7 h/day.
- Python heredocs turn `\b` into a backspace in regexes; use the Edit tool or `chr(92)` for regex edits.
- More in the Claude Code memory file for this project and in `DEPLOY.md`.

### Open work
See `PLAN.md` → "Still open": personal energy curve, dailies clipped to 60 min, duplicate detection, replan on focus overrun, plus ops (Neon password rotation, Neon dev branch, Clerk production keys, `ANTHROPIC_API_KEY`).

## Live Daily Schedule Engine ("The Guild Feed")

The crown feature of Focus Guild. A real-time, auto-updating feed that
tells the member exactly what to work on right now and for how long —
like a smart coach planning their day minute by minute. Not a static
schedule; it rebuilds itself dynamically as tasks are completed, skipped,
or time shifts.

### What It Is
A vertical timeline view that shows the optimized work order for today,
broken into blocks. Each block shows: quest name, recommended duration,
a short reason why now ("deadline in 2 days + your energy is high"),
and a start/end time. The feed updates live — complete a block early
and the rest of the day reshuffles instantly.

### The Scheduling Algorithm
> **Original vision, kept for intent.** The implementation has moved on: the
> single-pass scorer below became budget → construct → reflow, calendars come
> in as ICS links rather than OAuth, and there is no WebSocket (the client
> refetches). The source of truth is `server/src/lib/scheduler/README.md` and
> `SCHEDULER_PSEUDOCODE.md`; `npm run lab` checks plans against the promises in
> "What Makes It Novel" below.

Lives in server/src/lib/scheduler/ — pure, deterministic module (no DB,
no I/O). See server/src/lib/scheduler/README.md for the full formula
reference and weight-tuning guide.

Public API (server/src/lib/scheduler/index.ts):
- generateSchedule(tasks, fixedBlocks, config, now) → { schedule, feasibilityReport }
- replan(currentSchedule, tasks, config, now, options?) → { schedule, feasibilityReport }
- applyEdit(schedule, edit) → schedule  (pure)
- scoreTask(task, context, config, now) → { total, breakdown }  (pure)
- explainBlock(blockId, schedule) → string
- suggestPreferredHour(history) → soft-learning suggestions (off by default)

Task model (decoupled from Prisma — Quest→Task adapter is built separately):
  remainingMin, totalMin, deadline, tediousness (0..1), cognitiveLoad (0..1),
  importance (0..1), setupCost (0..1), minChunkMin, maxChunkMin, category,
  preferredHour, dependencies, createdAt, lastWorkedAt, status.

Block model: { id, start, end, type: "work"|"break"|"fixed"|"buffer",
taskId, locked, note }. `locked=true` blocks are never moved by the planner.

Scoring (each sub-score normalized 0..1 before weighting):
  Score = w_urgency·U_eff + w_staleness·S + w_time_fit·T + w_energy_fit·E
        + w_chunk_fit·C − w_adjacency·A − w_switch·X − w_fragmentation·F
  U_eff = importance-modulated quadratic urgency
  S     = log-scaled staleness saturating at ~30d
  T     = gaussian time-of-day fit around preferredHour
  E     = energy-curve fit vs cognitiveLoad
  C     = chunk fit with setupCost bonus (hard exclude if block < minChunk)
  A     = windowed tediousness adjacency penalty (last 3 work blocks)
  X     = category switch penalty
  F     = fragmentation penalty (targets 2 chunks/day)
Default weights: urgency=3.0, staleness=0.4, timeFit=0.8, energyFit=1.0,
chunkFit=1.0, adjacency=1.5, switch=0.5, fragmentation=0.4.

Algorithm phases:
1. Skeleton — working-hour slots, insert fixed + locked blocks, insert
   breaks per breakPolicy.
2. Fill — chronologically pick argmax(Score) for each empty work slot,
   placing chunk = min(maxChunk, remaining, blockDuration). Deterministic
   tie-break: earliest deadline → highest importance → lex taskId.
3. Local swap — up to 10 passes of adjacent non-locked work-block swaps
   if total adjacency+switch penalty drops and constraints hold.
4. Feasibility report — any task whose scheduled minutes < remaining
   before its deadline is surfaced with a shortfall and suggestions.

Replan guarantees:
- Past blocks (end ≤ now) are never altered.
- Locked blocks stay at their exact start/end.
- Idempotent — replanning unchanged input yields the same schedule.

How Quests become Tasks (adapter, separate layer):
- The scheduler module knows nothing about Prisma. A thin adapter maps
  Quest → Task using estimatedMinutes → remainingMin (with mentalLoad/10
  → cognitiveLoad, impact/10 → importance, etc.). User-tunable Task fields
  not present on Quest get defaults.
- Daily recurring "filler" quests are pre-placed as fixed blocks by a
  separate (not-yet-built) recurring module before the scheduler runs.

Prisma ScheduleBlock persistence shape (unchanged from current schema):
{
  questId, startTime, endTime, durationMins, reason,
  blockType: "focus" | "buffer" | "deadline-anchor" | "calendar",
  isFlexible
}
This is the on-disk shape; the in-memory algorithm uses the richer
Block type above. Mapping happens at the route layer.

### Live Rescheduling Triggers
The feed rebuilds automatically when:
- A quest is marked complete (remove it, collapse the gap, pull next up)
- Member hits "Not Today" on a block (drop it, reschedule tomorrow)
- A new quest is added mid-day with a same-day deadline
- Current block runs 10+ min over its estimated time (extend it,
  compress or defer the lowest-priority remaining block)
- A new calendar event is added that overlaps a scheduled block

Rebuilds are fast (in-memory, no DB call) and emit via WebSocket so
the feed updates in real time on the client without a page refresh.

### Calendar Integration
- Google Calendar: OAuth2 via @googleapis/calendar — read events for
  today to block out unavailable time
- Apple Calendar: CalDAV connection (optional, user-configured)
- Events are treated as immovable blocks — scheduler routes around them
- Deadline events on the calendar are detected by keywords ("due",
  "deadline", "submit") and automatically linked to matching quests
- Calendar sync happens at schedule generation time and on any
  calendar webhook event received

Calendar routes live in server/src/routes/calendar.ts
OAuth tokens stored encrypted in the User model (googleCalendarToken field)

### The Feed UI (client/src/pages/GuildFeed.tsx)
- Vertical scrollable timeline for today only — no week view
- Current active block is highlighted and has a live countdown timer
- Completed blocks collapse with a satisfying animation + XP toast
- Upcoming blocks are slightly dimmed
- "Why this?" tooltip on each block shows the scheduling reason
- A slim progress bar at the top shows % of today's planned quests done
- One-tap "Start this now" button jumps to Body Double mode for that quest
- Drag to manually reorder flexible blocks — algorithm respects the
  override for the rest of the day

### What Makes It Novel
Most todo apps give you a list. Focus Guild gives you a director.
The combination of:
  - Real calendar awareness (routes around your actual day)
  - Mental load sequencing (no back-to-back brain-killers)
  - Live rescheduling (not a static plan that breaks by 10am)
  - Deadline anchoring (important things can't silently slip)
  - Energy-aware peak hour matching
  - Self-correcting duration estimates over time

...makes this meaningfully different from any existing ADHD tool.
No other consumer task app does live, energy-aware, calendar-connected
dynamic rescheduling. This is the feature that makes Focus Guild a guild,
not just a list.

### Build Order for This Feature
1. scheduler.ts — pure algorithm, no DB, fully unit testable
2. Calendar OAuth + event fetching (Google first, Apple later)
3. WebSocket setup for live feed updates
4. ScheduleBlock DB model + daily schedule persistence
5. GuildFeed.tsx — timeline UI with live countdown
6. Manual override drag-to-reorder
7. Self-correcting duration estimates (needs 2+ weeks of user data)