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
- Frontend:  React 18 + TypeScript + Tailwind CSS + Framer Motion + Zustand
- Backend:   Node.js + Hono + Prisma ORM + PostgreSQL (Neon serverless)
- Auth:      Clerk
- AI:        Anthropic Claude API (task decomposer + "what next" advisor)
- Deploy:    Vercel (client) + Railway (server)
- Mobile:    PWA wrapper of the React app

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
├── CLAUDE.md               ← this file
└── .env files              ← never committed

## Database Models (Prisma)
- User              — Clerk ID, level, totalXP, currentStreak, multiplier
- Quest             — title, estimatedMinutes, mentalLoad (1–10), impact (1–10),
                      deadline, status, parentQuestId (for sub-quests), tags
- DailyCheckIn      — userId, date, energyLevel (1–5), availableMinutes
- XPEvent           — userId, questId, amount, reason, createdAt
- Achievement       — slug, title, description, icon, xpReward
- UserAchievement   — userId, achievementId, unlockedAt

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
Defined in server/src/db/seed.ts and seeded on first run.

## AI Integration (Anthropic API)
Two features powered by Claude:
1. Quest Decomposer — user pastes a vague goal, Claude returns JSON array
   of subtasks with suggestedMinutes and suggestedMentalLoad for each.
2. What Next Advisor — given current energy, available time, and top quests,
   Claude returns a single recommended quest slug + one-sentence reason.

Both are thin POST endpoints in server/src/routes/ai.ts using structured
JSON output. System prompts live in server/src/lib/prompts.ts.
Model: claude-sonnet-4-20250514. Never hardcode API keys.

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
server/.env  →  DATABASE_URL, ANTHROPIC_API_KEY, CLERK_SECRET_KEY, PORT
client/.env  →  VITE_API_URL, VITE_CLERK_PUBLISHABLE_KEY
Never commit .env files. Never log API keys.

## Current Build Phase
[Update this at the end of every session]
Phase: 9 — Auth backend + Focus Timer + Spin the Wheel + Rescue Mode

Phase 9 done (2026-05-18 — auth + new features):
  - AUTH:
    - server/src/lib/auth.ts — middleware that verifies Clerk Bearer
      tokens via @clerk/backend if CLERK_SECRET_KEY is set; falls back
      to X-Dev-Clerk-Id header / ?clerkId= / DEV_FALLBACK_CLERK_ID.
    - Mounted as `app.use('*', requireUser)` after CORS in index.ts.
    - All routes now read user from `c.get('user')` — clerkId stripped
      from request bodies/queries (kept as optional for back-compat).
    - Client api.ts sends `X-Dev-Clerk-Id: dev-member-001` header on every
      request; flip to real Clerk by adding @clerk/clerk-react, wrapping
      ClerkProvider, and swapping the header for `Authorization: Bearer
      <session token>` from `useAuth().getToken()`.
  - SPIN THE WHEEL:
    - User.spinCount column + migration.
    - POST /quests/spin-wheel picks a random ACTIVE quest weighted by
      priority^1.5; increments spinCount; runs evalAndUnlock so Chaos
      Agent fires at 10 spins.
    - client/src/components/SpinWheel.tsx — animated wheel modal,
      "Do it" (scrolls to quest + flashes gold border) / Re-spin / Close.
    - Surfaced from Today.tsx in the action-card row.
  - FOCUS TIMER:
    - client/src/store/useTimerStore.ts — single active session, persists
      to localStorage (survives refresh), pause/resume with accumulated
      pausedTotalMs offset.
    - client/src/components/FocusTimer.tsx — full-bleed countdown overlay,
      pause/resume/done/drop buttons, overrun mode (turns red when ms<0).
    - GuildFeed "Start" button now launches the timer for that block's
      quest. "Done" fires the standard complete/completeDaily pipeline
      → XP toast, achievement toast, level-up. Timer minimizes to a
      floating "Resume timer" pill.
  - RESCUE MODE:
    - GET /quests/rescue returns overdue quests, auto-flips them to
      RESCUE status as a side-effect.
    - POST /quests/:id/extend-deadline { days } bumps deadline forward.
    - client/src/pages/Rescue.tsx — per-quest +1d / +3d / +7d / complete /
      delete; bulk "Rescue all (+7d)" action.
    - Reachable at /rescue; surfaced as an action-card on Today.tsx with
      a red overdue counter badge.
  - 112 server tests passing; client builds in ~430ms (431 kB).

Phase 8 done (2026-05-18 — persistence + achievements):
  - SCHEMA: ScheduleBlock gained `locked Boolean` and `note String?`; BlockType
    enum extended with WORK / BREAK / FIXED (legacy values kept for back-compat).
    Migration applied to Neon.
  - server/src/lib/scheduler/persistence.ts: blockToRow / rowToBlock mapping
    layer + Prisma enum mapping with legacy fallthroughs (FOCUS→work,
    DEADLINE_ANCHOR→work, CALENDAR→fixed). 9 unit tests.
  - server/src/routes/schedule.ts:
    - POST /generate, POST /:clerkId/replan, POST /:clerkId/edit all persist
      the resulting schedule (deletes future blocks for that user, inserts
      new ones in a transaction).
    - GET /:clerkId now hydrates from DB on cold-cache. Restarts no longer
      drop the schedule.
    - Synthetic taskIds (recurring:cuid…, filler-…) are stripped to
      questId=null so the FK doesn't fail.
  - server/src/lib/evalAndUnlock.ts: new glue between achievements.ts and
    Prisma — gathers recent-completion context, evaluates all 6 checkers,
    inserts UserAchievement rows + bonus XPEvents in one transaction.
    Called from POST /quests/:id/complete AND /complete-daily.
  - server/src/routes/users.ts: new GET /users/:clerkId/achievements
    returning unlocked Achievement details for the BadgesPanel.
  - client/src/store/useAchievementsStore.ts: Zustand store with `load`
    and optimistic `addUnlocked`.
  - client/src/components/BadgesPanel.tsx: now loads real unlocks; shows
    "N/6" counter; updates instantly via addUnlocked optimistic merge.
  - client/src/pages/Today.tsx + components/DailySection.tsx: surface
    `newlyUnlocked` as cascading 'badge'-variant toasts with the icon,
    title, XP reward, and description.
  - client/src/lib/api.ts: CompleteQuestResult gained optional
    newlyUnlocked field; AchievementSummary type + /users/.../achievements
    endpoint.
  - BUG FIXES from audit:
    1. MiniCalendar didn't sync its `anchor` when `value` prop jumped to a
       different month (e.g. editing two quests in succession with different
       deadlines). Added useEffect.
    2. Recurring quest filler ids collided with state.fillers ids; now
       prefixed with "recurring:".
  - TESTS: 112 server tests passing (9 new persistence helpers). Client
    builds in ~700ms (416 kB).

Phase 7 done (2026-05-18 — full integration):
  - SCHEMA: Quest gained tediousness, category, preferredHour, minChunkMin,
    maxChunkMin, setupCost, urgencyMult, isRecurring; new RecurringCompletion
    table tracks daily check-offs. Migration applied to Neon.
  - SCORING:
    - New `urgencyMultiplier` (per quest) amplifies the urgency sub-score.
    - New `softMaxBlockMin` config knob (default 90 = 1.5h) + `oversize`
      sub-score penalizing blocks above the cap. Mitigated by high
      `setupCost` (≥ 0.7) or high `urgencyMultiplier` (≥ 1.5).
    - Planner-side clamp on chunk size respects `softMaxBlockMin` unless
      those same special circumstances apply.
    - `fragmentationPenalty` now uses a **dynamic per-day chunk target**:
      target = clamp(round(needPerDay / 60min), 2, 6). Steady cadence
      by default; ramps up when many hours remain and deadline is close.
  - ROUTES: Quest CRUD accepts all new scheduler hints. New
    GET /quests/recurring + POST /quests/:id/complete-daily (logs
    RecurringCompletion + fires XP via standard pipeline). Schedule
    generation auto-injects active recurring quests as fixed filler blocks.
  - CLIENT:
    - api.ts + useQuestStore.ts: Quest type extended, completeDaily +
      recurring list added.
    - MiniCalendar.tsx: month-grid date picker with markers for
      other deadlines.
    - QuestModal.tsx: full rewrite — basic fields + category picker +
      mental load + impact + recurring toggle, with an "Advanced" section
      for preferredHour, urgencyMultiplier slider, tediousness slider,
      setupCost slider, min/max chunk.
    - DailySection.tsx: shows recurring quests on Today.tsx with
      one-click check-off; fires XP toast + streak update.
    - GuildFeed.tsx: drag-and-drop reordering on work blocks (native
      HTML5; swap_blocks edit dispatched to server which reflows the
      schedule). Drag hint banner; drag-over visual feedback.
  - DOCS: SCHEDULER_PSEUDOCODE.md updated with §3.1 urgency multiplier,
    §3.8 dynamic fragmentation, §3.9 oversize penalty, new tuning recipes.
  - TESTS: 103 server tests passing (urgency multiplier, dynamic frag,
    oversize all covered). Client builds in ~600ms.

Phase 6 done (2026-05-17 — scheduler MVP):
  - SCHEDULER_PSEUDOCODE.md — full pseudocode, every weight/threshold,
    anti-burnout design notes, tuning recipes; lives alongside the module
  - server/src/lib/scheduler/adapter.ts — Quest→Task mapping
    (mentalLoad/10→cognitiveLoad, impact/10→importance, actualMinutes subtracted,
     fallback 14-day deadline, QuestSchedulerOverrides for per-quest tuning)
  - server/src/lib/scheduler/dailyFiller.ts — recurring short tasks pre-placed
    as `fixed` blocks before the main scheduler runs; routes around existing blocks
  - server/src/routes/schedule.ts — REST API with in-memory store (per-clerkId):
      POST /schedule/generate  — build from DB quests
      GET  /schedule/:clerkId  — current schedule
      POST /schedule/:clerkId/replan  — re-flow around locked blocks
      POST /schedule/:clerkId/edit    — applyEdit + replan
      POST /schedule/:clerkId/fillers — configure daily fillers
      GET  /schedule/:clerkId/explain?blockId=...
  - client/src/lib/api.ts — schedule.* API methods + ScheduleBlock/ScheduleEdit/
    DailyFiller types
  - client/src/store/useScheduleStore.ts — Zustand store (generate/fetch/replan/edit)
  - client/src/pages/GuildFeed.tsx — live timeline: per-second countdown on
    active block, progress bar, pin/unpin/delete per block, 💡 explain overlay,
    feasibility warning banner, regenerate + replan buttons
  - App.tsx: /feed route added; Today.tsx: Feed card link added
  - 97 server tests passing; client builds in ~580ms
  - Schedule stored in-memory (not yet Prisma-persisted — restarts reset it)
  - NOT YET: DB persistence for schedule, daily-filler UI config, calendar
    integration, WebSocket live push, Quest→Task override UI

Phase 5 done (2026-05-17 — auto-scheduler module):
  - server/src/lib/scheduler/ — pure, deterministic, self-contained
    - types.ts (Task, Block, Schedule, UserConfig, Edit, FeasibilityReport)
    - config.ts (default weights, two-peak energy curve, break policy)
    - scoring.ts (all 8 sub-scores + scoreTask composite)
    - planner.ts (4-phase: skeleton, fill, swap, feasibility)
    - edits.ts (move/swap/delete/pin/unpin → pure applyEdit)
    - replan.ts (preserves locked, never touches past, idempotent)
    - explain.ts, preferences.ts (soft-learning stub, K=3)
    - README.md (formula reference + weight tuning guide)
    - 37 new unit tests; all 85 server tests passing; build clean
  - Replaces the older greedy-priority sketch in the schedule-engine
    section of this doc with the new spec (Task/Block model, 8-factor
    scoring, locked-block discipline). Old shape kept as the on-disk
    Prisma ScheduleBlock mapping target.
  - NOT YET WIRED: Quest→Task adapter, route/REST exposure, Prisma
    persistence, GuildFeed UI, calendar integration, daily-recurring
    pre-placement module.

Phase 4 done (UI port from FocusQuest.html):

Phase 4 done (UI port from FocusQuest.html):
  - Theme tokens defined in @theme block matching prototype palette
  - Header (avatar w/ level emoji, XP bar, streak/XP/done pills) — sticky w/ gradient bg
  - StatsRow (5 quick-stat cards)
  - QuestCard rewritten: priority-colored left border, priority badge (0–10),
    deadline/time/load tag pills, hover-revealed edit/delete icons
  - QuestModal (replaces inline QuickAdd, opened by FAB; Esc to close)
  - FAB floating + button bottom-right
  - Sidebar: BadgesPanel (3-col grid of 6 achievements, locked state),
    WeekChart (7-day completed bars), DeepStatsPanel (6 stat rows)
  - CompletedSection (collapsible)
  - LevelUpSplash + confetti utility (fires on level transition)
  - Multi-variant Toasts (xp/streak/badge/levelup) with Zustand-backed queue
  - New GET /quests/completed endpoint on server
  - useQuestStore now tracks completed[] alongside active quests[]
  - Removed orphaned components (old QuickAdd, MentalLoadSlider, XPToast)
  - vitest config added to scope tests to src/ (was double-counting from dist/)
  - Server build output is now dist/src/index.js (tsconfig include changed)

DEV NOTES (important for the next session):
- Prisma 7 changes: DATABASE_URL is in prisma.config.ts (not schema), and PrismaClient
  needs `{ adapter: new PrismaNeon({ connectionString }) }` (NOT a Pool instance).
  Generated client is at `generated/prisma/client.ts` (no index.js).
- Model "XPEvent" becomes `db.xPEvent` (Prisma camelCase quirk for adjacent caps).
- tsconfig: `exactOptionalPropertyTypes` removed because Prisma input types use null,
  not `| undefined` — re-enabling will break every `parentQuestId?: string` field.
- Until Clerk is wired, the client uses a hardcoded clerkId `dev-member-001` (see
  client/src/lib/api.ts → DEV_CLERK_ID). Replace with `useAuth()` from Clerk.

Phase 2 done (server):
  - Prisma schema (User, Quest, DailyCheckIn, XPEvent, Achievement, UserAchievement, ScheduleBlock)
  - server/src/lib/priority.ts — priority score + mood modifier (18 tests)
  - server/src/lib/xp.ts — XP formula (15 tests)
  - server/src/lib/streak.ts — streak + multiplier + midnight rollover (15 tests)
  - server/src/lib/achievements.ts — 6 achievements with check fns
  - server/src/db/client.ts — Prisma + Neon adapter
  - server/src/db/seed.ts — seeds 6 achievements (already run against Neon)
  - server/src/index.ts — Hono app, CORS, logger, /health
  - server/src/routes/{users,quests,checkin}.ts — full CRUD + completion flow
  - 48 unit tests passing; server builds and boots cleanly

Phase 3 done (client):
  - client/src/lib/api.ts — typed fetch wrapper with DEV_CLERK_ID fallback
  - client/src/lib/levels.ts — 7 guild levels with accent colors
  - client/src/lib/formatters.ts — time/deadline/emoji helpers
  - client/src/store/{useUserStore,useQuestStore,useCheckInStore}.ts — Zustand stores
  - client/src/components/{QuestCard,XPToast,QuickAdd,MentalLoadSlider,LevelBadge}.tsx
  - client/src/pages/{Today,CheckIn,Quests,Stats}.tsx
  - client/src/App.tsx — BrowserRouter with all 4 routes
  - Tailwind v4 wired, dark theme, client builds in 392ms (118 kB gzipped)

Next phase candidates (pick based on user priority):
  1. Manual end-to-end test: dev both servers, complete a quest, watch XP toast fire
  2. Clerk integration (need user to provide CLERK_SECRET_KEY + VITE_CLERK_PUBLISHABLE_KEY)
  3. Schedule engine (server/src/lib/scheduler.ts) + Guild Feed UI
  4. AI features (Quest Decomposer, What Next Advisor — needs ANTHROPIC_API_KEY)
  5. Achievement unlock evaluator wired into quest-complete flow + notification UI
Done:
  - Prisma schema (User, Quest, DailyCheckIn, XPEvent, Achievement, UserAchievement, ScheduleBlock)
  - server/src/lib/priority.ts — priority score formula + mood modifier (48 unit tests passing)
  - server/src/lib/xp.ts — XP formula (base × mentalBonus × timePressureBonus × streakMultiplier)
  - server/src/lib/streak.ts — streak counter + 0.75× pause multiplier + midnight rollover
  - server/src/db/client.ts — Prisma singleton with dev hot-reload safety
  - server/src/index.ts — Hono app with CORS, logger, health check, error handlers
  - server/src/routes/users.ts — GET /users/:clerkId, POST /users, GET /users/:clerkId/stats
  - server/src/routes/quests.ts — GET, POST, PATCH, DELETE, POST .../complete, POST .../not-today
  - server/src/routes/checkin.ts — POST /checkin, GET /checkin/today/:clerkId
Next:  Migrate DB (need DATABASE_URL) → seed achievements → client API layer → UI pages

markdown## Live Daily Schedule Engine ("The Guild Feed")

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