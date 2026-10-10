# Focus Guild — Work Log

Rebuilt on 2026-09-13 from three sources, because the repo has no changelog:

1. **Git history.** 33 commits, 2026-05-23 → 2026-09-13.
2. **Claude Code session transcripts** (`~/.claude/projects/...focus-guild/*.jsonl`). These have real timestamps for every prompt, tool call and reply. They only survive from **2026-05-31 14:58** onward. Claude Code deletes transcripts after ~30 days of inactivity, so the May 17–23 sessions are gone.
3. **File modification times** plus the phase log in `FocusGuildInstructions.md`. These are used to rebuild the days before git and before the surviving transcripts.

All times are Pacific (Vancouver).

---

## Totals at a glance

| | |
|---|---|
| Calendar span | 2026-05-17 → 2026-09-13 (**119 days**, ~17 weeks) |
| Working days / sittings | **16** (plus 2 tiny blips: a 1am approval click on Jun 7 and an interrupted prompt on Jun 13) |
| Commits | **52** by 2026-09-25, all on `main` and live (33 when this log was first written on Sep 13) |
| Lines added / removed | **+29,400 / −3,780** (lockfiles excluded; +36,185 / −3,793 including them) |
| Codebase now | ~21,700 lines of TS/TSX across 123 files, 16 test files (192 tests), 7 DB migrations, 11 pages, 38 components |
| Prompts sent (surviving transcripts) | **~57** (plus an unknown number in the deleted May sessions) |
| **Hours, measured in-session** (May 31 pm → Sep 13) | **8.8 h** (7.3–11.0 h depending on idle threshold, see method) |
| **Hours, reconstructed** (May 17 → May 31 am) | **~15–16 h** |
| **Total hours in sessions** | **≈ 24–25 h** |
| **Human time directing + designing** | **≈ 37 h** (range ~25–55 h), see "The human side" at the bottom |
| **Whole project, wall clock** | **≈ 47 h** (24 h in sessions + ~23 h of human work outside them) |

### Hours by day

| Date | Day | Time window(s) | Hours | Source | Headline |
|---|---|---|---|---|---|
| 2026-05-17 | Sat | ~13:00 – 19:00 | ~6.0 | file times | Prototype → full-stack foundation, Phases 2–6 |
| 2026-05-18 | Sun | ~12:30 – 15:30 | ~3.0 | file times | Phases 7–9: persistence, achievements, auth, timer, Rescue |
| 2026-05-23 | Sat | ~12:00 – 18:05 (gappy) | ~3.5 | file times + git | First commits, sub-quests, Settings, AI scaffold |
| 2026-05-31 | Sun | ~11:30 – 14:58 | ~3.0 | file times + git | Railway deploy fight, real Clerk auth |
| 2026-05-31 | Sun | 14:58–15:33, 18:47–20:25, 21:41 | 2.2 | transcript | Feed redesigns, broken prod, scheduler rewrites #1 + #2 |
| 2026-06-03 | Wed | 21:10 – 21:31 | 0.35 | transcript | "What next" → cleanup refactor |
| 2026-06-04 | Thu | 15:59–16:15, 22:35–23:20 | 1.0 | transcript | Real-world testing → timezone fix; safety checkpoint |
| 2026-06-06 | Sat | 13:51 – 14:08 | 0.3 | transcript | Scheduler rewrite Phase A |
| 2026-06-08 | Mon | 09:31 – 09:38 | 0.1 | transcript | Phase B |
| 2026-06-12 | Fri | 06:57 – 07:35 | 0.65 | transcript | Phase C |
| 2026-06-16 | Tue | 13:09 – 13:24 | 0.25 | transcript | "Use all your brainpower" → juice/theming/palette/trophies |
| 2026-07-01 | Wed | 17:16 – 17:36 | 0.3 | transcript | Audit + scheduler fixes, commits of Jun 16 work |
| 2026-07-12 | Sun | 00:31 – 02:15 | 0.3 | transcript | Algorithm math deep-dive, Up Next, quick-add NL |
| 2026-07-14 | Tue | 12:08 – 12:42 | 0.55 | transcript | Handoff doc, visual QA session |
| 2026-08-16/17 | Sun→Mon | 23:26 – 00:46 | 0.7 | transcript | Local no-account version; discovered server was down |
| 2026-09-12 | Sat | 03:37 – 05:26 (+06:31) | 1.8 | transcript | Railway billing restore, Tracker + CAS, server and client |
| 2026-09-13 | Sun | 04:08 – 04:21 | 0.2 | transcript | Migration applied, docs; vision write-up + this log |
| | | | **≈ 24.3** | | *(totals above stop here; the rows below are an addendum)* |
| 2026-09-13 | Sun | ~17:30 – 19:50 | ~2.3 | commit times | Plan written; launch (scheduler revamp live); presets, Chronicle, calendars + inbox |
| 2026-09-18/19 | Thu→Fri | ~23:30 – 01:10, ~19:30 – 19:50 | ~2.0 | commit times | Ask the Guild, MCP, PWA, plan feed; second deploy; quest import |
| 2026-09-24 | Thu | ~20:30 – 22:45 | ~2.3 | commit times | Scenario lab; scheduler overhaul; Not Today fix |
| 2026-09-25 | Fri | ~12:00 – 13:35 | ~1.5 | commit times | Plan insights, self-correcting estimates; third deploy |
| 2026-09-26 | Sat | short | ~0.3 | — | Docs brought up to date for a new chat |
| 2026-09-26 | Sat | ~12:15 – 14:30 | ~2.2 | tool timestamps | Population lab; scheduler deadline-safety fixes |

**By month (in-session):** May ≈ 17.7 h · June ≈ 2.7 h · July ≈ 1.2 h · August ≈ 0.7 h · September ≈ 2.0 h.
Most of the hours went into May, the "build it" month. After that the pattern changes to short, high-leverage sessions: a big spec gets pasted, Claude builds, you review and test.

---

## Day-by-day log

### Sat 2026-05-17 — Day 1: from prototype to full stack (~6 h)
Rebuilt from file timestamps; the phase log lists Phases 2–6 as done this day.
- **13:18** `FocusQuest.html` saved into the project: the hand-built "FocusQuest — ADHD Productivity RPG" prototype, 60 KB, with the dark purple/gold look. (It may have been made earlier and copied in at this point.)
- **14:15** Vite + React client scaffolded. **14:27** Prisma server set up.
- **15:29** First version of the spec, `FocusGuildInstructions.md` (12 KB, "Project Bible"), written in the parent folder.
- **15:05 – 16:06** Phase 2 core logic, each with tests: `priority.ts` (priority score + mood modifier), `xp.ts`, `streak.ts`.
- **16:47** First DB migration (`init`) against Neon. **16:53** achievements seed.
- **17:00 – 17:27** Phases 3–4, client plus the UI port from the prototype: user/check-in stores, CheckIn page, LevelBadge, `levels.ts` (Foggy Brain → Legendary Quester), StatsRow, FAB, WeekChart, DeepStatsPanel, CompletedSection, confetti, LevelUpSplash.
- **18:22 – 18:54** Phases 5–6, the first auto-scheduler: pure module (edits, preferences, planner), Quest→Task adapter, daily filler, tests. Schedule REST API, first Guild Feed timeline.
- End of day: ~97 server tests passing.

### Sun 2026-05-18 — Phases 7–9 (~3 h)
- **~13:39** Migration: scheduler fields on Quest (tediousness, category, preferredHour, chunk sizes, setupCost, urgency multiplier) plus recurring quests. MiniCalendar, QuestModal rewrite with an "Advanced" section, drag-and-drop in the feed.
- **14:58** Migration: schedule block persistence, so restarts stop wiping the schedule. **15:07** `persistence.ts` + tests.
- **15:11 – 15:18** Achievement unlock pipeline (`evalAndUnlock`), achievements store, badge toasts, DailySection for recurring quests.
- **15:21** Migration: `spinCount` → Spin the Wheel + Chaos Agent.
- **15:23 – 15:24** Focus Timer (persists across refresh, pause/resume, overrun mode) and Rescue Mode page.
- Auth middleware (Clerk token or dev fallback).
- End of day: 112 server tests.

### Sat 2026-05-23 — Into git (~3.5 h, gappy)
- **12:09** InfoTip component. **15:38** End-of-day reflection banner.
- **16:41** `1f51d58` **Initial commit: Focus Guild — gamified ADHD task manager** (110 files, ~20k lines incl. lockfiles).
- **17:06** Migration: per-user scheduler settings.
- **17:10 – 17:48** QuestCard/QuestDetail updates, AI decomposer (`ai.ts`), `vercel.json`.
- **18:02** `c8b053f` Sub-quests, Settings page, AI Decomposer scaffold, deploy config (+1,823 lines).

### Sun 2026-05-31 — Deploy day, broken prod, and two scheduler rewrites (~5.2 h, biggest single day)
**Morning (rebuilt from git and files, ~3 h)**
- **11:49** `DEPLOY.md` written.
- **12:18 → 12:51** Four commits in 33 minutes fighting Railway's builder over Node 22 / Prisma 7: `engines` field ignored → `nixpacks.toml` ignored → `.nvmrc` ignored → gave up and **switched to a Dockerfile**, which worked.
- **14:31** `e0a54a8` **Real Clerk sign-in/sign-up** + XP-over-time chart on Stats. **14:33** script to move the dev account's data to your real Clerk user.

**Afternoon/evening (transcript, 2.2 h)**
- **14:58** Asked for a cleaner, shorter Guild Feed UI with a dropdown. Asked how to log back into the dev account, then asked for a set of test tasks.
- **15:18** Asked for a paste-in bulk import of formatted test quests. **15:27** Redeploy.
- **18:47 – 19:30 🔥 Production broke** after the bulk-import feature: active quests disappeared, and new accounts couldn't add a single quest. Hard refreshes and redeploys didn't help, and there was confusion between two Railway services ("gregarious creativity" was the working one, "lucky motivation" kept crashing). Import removed, working again by 19:38.
- **19:11** `cf60fcc` compact card UI, planning modes, priority tiers. **19:19** `dbf3b2b` null-deadline fix.
- **19:38 – 19:53** Feed UI redesigned twice. "That version looks horrendous to me," so you asked for something attention-catching, colourful, with blocks proportional to their length → `51eef24` time-grid timeline, then `1aaa588` stacked vibrant timeline with break dividers + now pill.
- **19:56** "Look into the math and generate a true feed creation algorithm" → **20:03** `628981e` scheduler rewrite #1, task-first greedy allocator.
- **20:09** "Don't even have any hard coded breaks": empty feed, generated live. **20:16** Min/max sitting time (no session under 20 min or over 3 h).
- **21:41** `6c401b7` scheduler rewrite #2: insertion-based planner, energy meter, drop "crush mode".
- 12 commits this day.

### Wed 2026-06-03 (0.35 h)
- **21:10** "What next to improve" → **21:31** `c7a7ab3` refactor: consolidated calendar components, deduped date helpers, removed dead scoring code (−573 lines).

### Thu 2026-06-04 — Dogfooding (1.0 h)
- **15:59** *"I tried the app myself and 2 glaring issues came up"*: there was nowhere to set working hours, and it couldn't generate a schedule for the same day.
- **16:07** `2486ca5` timezone-aware day boundaries (day math was running in server time, not yours) + round-robin variety.
- **16:13** Asked for a write-up of what the scheduler should achieve, to plan big revisions.
- **22:35 – 23:20** **Safety checkpoint** before the rewrite: tag `pre-revamp` at `2486ca5`, branch `scheduler-revamp`.

### Sat 2026-06-06 — Scheduler revamp Phase A (0.3 h)
- **13:51** Pasted a long spec, "rewrite the Focus Guild scheduler for variety + energy-aware pacing" (drafted outside Claude Code). **13:55** "try to make the perfect scheduler system."
- **14:01** `455acba` Phase A: rebuilt `placementScore` with proper normalization.
- (Jun 7, 01:11: a one-minute approval click.)

### Mon 2026-06-08 — Phase B (0.1 h)
- **09:30** `030c5c8` budget → construct pipeline; round-robin replaced with **beam search**.

### Fri 2026-06-12 — Phase C (0.65 h)
- **06:58** "Hello Fable 5, I want you to design, think and revamp the new, stronger, perfect autoscheduler."
- **07:30** `817669e` Phase C: minimal-perturbation reflow, explain wiring, config cleanup (+920 / −826).

### Sat 2026-06-13 (blip)
- **15:56** Sent "Use all your brainpower… fix the website UI and add anything awesome", then interrupted it.

### Tue 2026-06-16 — The juice pass (0.25 h)
- **13:09** Re-sent the "use all your brainpower" prompt. 14 files written in this window: synthesized SFX + haptics, rank-driven theming, Ctrl+K command palette, Trophy Room, streak heatmap. (Committed on Jul 1.)

### Wed 2026-07-01 (0.3 h)
- **17:16** "Look into all of these aforementioned problems… and the imperfect algorithm."
- **17:19** `87df514` juice engine, rank theming, command palette, trophy room, heatmap (+1,069).
- **17:35** `be67ea7` gap-aware adjacency, urgency bounds, explain variety, live check-in.

### Sun 2026-07-12 — Late-night math pass (0.3 h in session, 00:31 → 02:15 wall clock)
- **00:31** "Look into all the details from the mathematical algorithms base…"
- **01:20** `f5ab149` budget capacity math (kills phantom shortfalls), `preferredHour` restored as a real term, **Up Next card**, **natural-language quick-add**.
- **02:08** "Make the UI perfect."

### Tue 2026-07-14 — Handoff + QA (0.55 h)
- **12:09** Updated the markdown so a new chat could pick up; generated the opening prompt for it.
- **12:15** New session: visual QA + planned deploy of `scheduler-revamp`.

### Sun 2026-08-16 → Mon 08-17 — Local mode + outage discovered (0.7 h)
- **23:26** Asked for a local version "with everything I have but without accounts and website hosting."
- **00:09** Discovered the hosted server was down because a free trial had expired.

### Sat 2026-09-12 — Service restore + Tracker/CAS (1.8 h in session, 03:37 → 06:31)
- **03:37** Worked out what had expired (Railway free trial). **03:48 – 04:03** Upgraded to Railway Hobby and fought the numeric-only postal-code field (Canadian code). A placeholder got past it, and the real address went on the next page. Server back up.
- **04:09** `eef511a` nested-button fix + quest tags typing. `e26a3a3` `.env.local` override for account-free local runs.
- **04:15** Pasted the four-part build spec: Tracker page, editable presets, CAS mode, markdown download.
- **04:27** `ad17644` tracker data model, presets, markdown interchange (+1,465).
- **04:32** `c7a9f46` CAS projections + tracker API (+1,164).
- **04:46** `50e1533` docs.
- **04:54** Asked for an improved handoff prompt. **04:59** New parallel session for the client build.
- **05:02** `48aa112` tracker next action → scheduled Quest.
- **05:25 – 05:26** `83cffb4`, `16a9cad`, `95723b0`, `8e2a26c`: the whole tracker/CAS client (API layer, page, parking lot, decision log, coverage matrix, balance, reflections, interviews, presets editor, markdown export/import). About +3,800 lines.
- 11 commits, the most productive hour-for-hour day of the project.

### Sun 2026-09-13 (0.2 h)
- **04:09** "continue" → migration applied to live Neon via the HTTP driver. **04:10** `22342fd` docs.
- **04:17** Vision write-up, then this work log.

---

### Sun 2026-09-13 (evening) — Plan, launch, Phases 1–3 (~2.3 h)
- Asked for a plan: strong tracker presets, what hadn't launched, bringing in Google Calendar / Teams, an AI-readable log and a "permafile". → `PLAN.md`.
- **Launch.** 22 commits had sat unmerged since June (16 never pushed). Fixed tracker codes being reused after deletes, moved AI to `claude-opus-5`, merged, deployed (`32a8e38`).
- Phase 1 `748a591`: preset packs and add templates. Phase 2 `ec5d8b9`: Chronicle, permafile and AI bundle, plus a real security fix (any user could edit or delete anyone's quest by id). Phase 3 `37a0987`: ICS calendars and the `/inbox`, with a reflow bug found by its test (meetings synced after planning sat under work).
- A parallel session did Lucide icons, the duck mascot and the "devcave" theme.

### Thu–Fri 2026-09-18/19 — Phases 4–5, PWA, second deploy, import (~2 h)
- `6a80606` Ask the Guild; the inbox token became one personal access token. `e298035` MCP connector. `870ecb0` PWA (icons drawn by a script). `a1c00eb` plan published as an ICS feed.
- Deploy #2: all seven commits live, migrations applied cleanly on Railway.
- `084890f` quest import from pasted text (verified live, test data cleaned up). `95daa53` first client tests; inbox limiter leak fixed.

### Thu 2026-09-24 — "Does it feel like the vision?" (~2.3 h)
- Built `server/scripts/scenario-lab.ts` (`npm run lab`): realistic IB-student weeks through the real pipeline, graded against the Bible. **16 findings.**
- The big ones: work shredded into 3–17 min slivers; the beam preferred empty evenings to chores (14 chores → 53 of 205 min placed, falsely infeasible); `breakPolicy` never used (4 h straight was normal); an email due tomorrow lost its slot to an essay due in 12 days; false shortfalls for anything due past the 7-day window; reasons unrelated to the facts, and raw JSON in the Feed; heavy work pushed to 20:00; **"Not Today" permanently hid quests.**
- Fixed in `4e7de29` + `d3f3e50`. Lab: 16 → 4 defensible findings; 233 tests.

### Fri 2026-09-25 — Insights and real estimates, third deploy (~1.5 h)
- `5688211`: the Feed now says what the plan couldn't (overdue quests, routines crowding out quests, undated backlog pace, a working-hours suggestion from the calendar). The focus timer finally records real time, and finished quests calibrate future estimates.
- Deploy #3: everything live. 242 server + 10 client tests.

### Sat 2026-09-26 — Handover
- Bible "Current Build Phase" rewritten as a current-state page; PLAN.md rewritten as the living roadmap; scheduler README and design doc updated to the overhaul; DEPLOY.md and memory refreshed.

### Sat 2026-09-26 (afternoon) — Population lab (~2.2 h)
- "Stress test the algorithm with many simulated people and their lives." Built `server/scripts/population-lab.ts`: seeded people across 11 archetypes and 15 timezones, each plan graded against an EDF / Moore–Hodgson oracle, then each person lives a week with skips, overruns and surprise quests; a perfect-follower run separates planner misses from human ones.
- Found (old code, 2 000 people): free time left idle while a deadline was short for 35% of people; a hopeless quest taking a finishable one's slot; replans unable to move later work after a skip; quests that overran their estimate vanishing from the plan; the check-in cap landing on tomorrow when opened after hours; routines clipped to 60 min, forced into quest hours ("morning meds" at 15:20) and lost when their slot was taken; HIGH quests lending their time and never getting it back; light days always starting at the first free minute (night owls working at 13:30); the Feed never replanning on a new day.
- Fixed: triage, reconcile (swap / fill / payback), replan deadline release, overrun floor, today-only check-in cap, long breaks in capacity, sliver folding, EDF guard for intra-day deadlines, focus window, chronotype setting (Settings), routines at their own hour and full length with nearest-slot placement, routine top-up on replan, Feed replans on the first open of a day.
- Result: deadlines met 43.0% → 57.4%; a perfect follower gets 89.3% of the best possible (was 68.4%; 97.5% with exact estimates). 256 server + 10 client tests (11 new, 5 of which fail on the old code). Not deployed yet.

### Sat–Tue 2026-10-03 → 10-06 — The agent team (hours not measured; most of it was agents running in the background)
- "Make a director agent, multiple coder agents and multiple tester agents, and test until the scheduler is really improved." The main session directed; each coder worked in its own git worktree; every branch was merged one at a time and re-measured before the next.
- The first launch (seven agents at once) hit the usage limit within the hour; so did the second batch of three. What worked: two at a time, a tight brief, commit after every step, resume from the saved worktree. One network drop and one stalled agent were recovered the same way.
- Tester 2 (the user's advocate) read ~20 people's weeks in full and found what the metrics missed: days made of 25-minute fragments, a "first push" label on every replanned block, reasons that were false in a quarter to a half of plans, the reason line invisible on tiles (it needed a 70-minute block), and no way to act on the "won't finish" banner. Tester 1 built a fuzz lab: 31 000 planning calls, no crash, ten real bugs with minimal repros.
- Merged: hours past midnight; estimates learned from the first finished quest; quest sessions and whole sittings; replans that survive a day; reasons written from the finished plan; the banner with tap-to-apply choices; fuzz fixes (unique ids, late and orphan pins, NaN moves). The director fixed the tile, a pace measure for work not due this week (to check that a 14% drop in hours worked was only the "never done for today" extra), a planner crash found by the final check on a fresh seed, and the fuzz judge.
- Result on seed 7 (1 000 people, returning users): deadlines met 59.0% → 64.2%; a perfect follower at 94.4% of the best possible (was 90.1%); same quest picked up 3+ times a day 33% → 6%; 8+ switches a day 19% → 5%; finishing the last block adds more work 45% → 1.5%; false reasons ~50% → 0. Night-shift workers: an empty plan → 70% of deadlines met. Tests: 332 server (+1 expected fail) and 16 client. Checked in a browser at phone width (Settings picker, Feed tiles with reasons), then deployed.
- Not finished, parked on branches: max-session cap, untimed routines and meals, learning the energy curve, and the no-change replan (cause known). See PLAN.md.

### Tue 2026-10-06 (evening) — UI refresh (≈2 h, one session, branch `ui-refresh`)
- "This website UI still sucks and screams vibe coded." Screenshotted every page at phone width and Today at desktop width, critiqued them against Things, Todoist, Linear and Structured, then rebuilt the parts every screen shares.
- What was wrong: every item its own bordered box; Today opened with five stat tiles of zeros; six colours and five controls on each quest card; monospace page titles; six bottom tabs stretched across a 1280 px monitor; a header on three pages and none on the rest; the duck and the add button floating over content.
- What changed: sidebar on wide screens and five tabs on phones; one slim top bar with the duck in it; Today leads with the next action and a short list; quests, routines, completed and overdue as rows in one surface; the Feed as a time rail with capped heights and outlined routines; the quest editor as a bottom sheet with one-tap deadlines and a three-button priority; softer borders, larger radii, headings in the reading face; arrow and tick glyphs replaced with icons. Rules written into the Bible.
- Done in a separate worktree because a second session was committing scheduler work in the main checkout at the same time.

### Thu 2026-10-08 — Design research, then the craft pass (≈2 h, branch `ui-refresh`)
- The owner rejected the refresh too ("looks horrible and vibe coded") and asked for research on what good app design is before any new look. Read Vercel's and Rauno Freiberg's interface guidelines, "Family Values", Refactoring UI, Emil Kowalski on motion, and write-ups of the tells of generated interfaces. The finding that mattered: the tells are not a colour, they are undecided defaults and missing behaviour.
- Audited the client against that list: 19 font sizes with 31 uses under 11 px; 11 browser `confirm()` boxes; "Loading…" as plain text on six screens; several accent-filled buttons per view; hover styles and 22–32 px targets on touch; `transition: all` in eight places; a pop-in that grew from a dot; a can't-connect screen that told the user to run `npm run dev`.
- Fixed all of it: one type scale; delete with Undo and arm-then-fire instead of confirm boxes (unit-tested); skeletons; a plain-language error screen with Try again; one accent per view; the tick answers instantly; touch targets, tap and hover behaviour; one easing curve; page titles per route. The rules are in the Bible → "Craft checklist".
- Four candidate looks were mocked up first (Daybook, Departures, Guildhall, Margins); the owner liked the last three. They come next, built on this pass.
- Later the same day the owner chose: dark only, Departures, "some train in the rainy night animations", and yes to the new words. Built: the Departures theme (navy, board white, signal yellow; Barlow Condensed, B612 Mono, Atkinson); Route and quest lists as board rows with a true status word (On time, Boarding, 3d late), unit-tested; a yellow sign with a clock that flips on the minute; the night platform on Today, where a train waits while a block is boarding and leaves when a quest is completed, with an off switch; and the route vocabulary across every label (Feed → Route, Replan → Reroute, Rescue → Stragglers, Tracker → Expeditions, Check-in → Fuel check, Stats → Mileage, Chronicle → Logbook…), labels only.

### Fri 2026-10-09 — Lines: five journeys from the owner's reference stills (≈4 h, branch `ui-refresh`)

- The owner brought 25 stills from the "Infinite Journeys" montage, each described by Gemini (palette, borders, mascot, what to drop), and asked for "one smarter executive officer agent" directing several Sonnet coders in batches.
- What the stills share became the rule: a seat by a window, a table in front, somewhere else going by outside. Grouped by the world outside the window into five lines rather than 25 near-identical palettes.
- Built first, by the director: the engine (`client/src/lines/`: the scene's canvas, pausing, reduced motion and the visitor's comings and goings are shared; a line only draws), a picker in Settings, the contract, a checker (`npm run line:check`), and a screenshot harness (`npm run line:shoot`) that drives headless Chrome over its debugging port, answers the API from fixed sample data and pins the clock, so coders can see their own work and nothing touches the database. The Night Line is the old look moved into that shape.
- Then four Sonnet coders, two at a time, one line each, four files each, in their own folders. Each got a written brief with the decisions made; each was sent back once with numbered corrections from the pictures (the first whale read as an eel, the first shuttle as a railway carriage, a "quests done" row as carousel dots, a 5 px mark before section labels as a stray character in thirty places).
- All five pass the checker; typecheck, lint on the new code, the 26 client tests and a production build are clean. Reviewed as posed stills and a short live run each; not watched in motion for long, and not on a real phone. Gallery for the owner to choose from: https://claude.ai/artifact/KWThCeaU1vBQwErydtjx9f
- Found on the way: the local API server had lost its database connection after a day of running, which is what made the harness answer from sample data instead.

| Phase | What | When |
|---|---|---|
| 1–2 | Schema, priority/XP/streak logic, routes, 48 tests | May 17 |
| 3 | Client API layer, stores, pages | May 17 |
| 4 | UI port from FocusQuest.html | May 17 |
| 5 | Pure auto-scheduler module | May 17 |
| 6 | Scheduler MVP wired to API + Guild Feed | May 17 |
| 7 | Scheduler fields, recurring quests, drag-drop | May 18 |
| 8 | Schedule persistence + achievements pipeline | May 18 |
| 9 | Auth, Focus Timer, Spin the Wheel, Rescue Mode | May 18 (+ May 31 XP chart) |
| — | Deploy (Railway + Vercel) + real Clerk | May 23 – May 31 |
| — | Feed redesigns + scheduler rewrites #1/#2 | May 31 |
| Revamp A/B/C | Normalized scoring → budget/beam search → reflow | Jun 6 – Jun 12 |
| — | Juice engine, theming, palette, trophies | Jun 16 – Jul 1 |
| — | Core math fixes, Up Next, quick-add | Jul 12 |
| — | Local mode, outage, Railway Hobby | Aug 16 – Sep 12 |
| 11 | Long-horizon Tracker + CAS lens | Sep 12 – Sep 13 |
| 12 | Launch + presets, Chronicle, calendars/inbox, Ask the Guild, MCP, PWA | Sep 13 – Sep 19 |
| 13 | Scenario lab, scheduler overhaul, insights, self-correcting estimates | Sep 24 – Sep 25 |
| 14 | Population lab; triage, reconcile, focus window, chronotypes | Sep 26 |
| 15 | Agent team: night hours, estimates, quest sessions, replans, honest reasons, fuzz lab | Oct 3 – Oct 6 |
| 16 | UI refresh: app shell, list rows, calmer theme | Oct 6 |
| 17 | Design research and craft pass; Departures theme, night platform, route vocabulary | Oct 8 |
| 18 | Lines: theme engine, checker, screenshot harness, four new lines by a director-and-coders pipeline | Oct 9 |

---

## How the hours were counted (read before quoting the numbers)

- **Measured hours (8.8 h).** Every transcript event from every session was merged onto one timeline and deduplicated. Two transcript files are forks of other sessions, and on Sep 12 two sessions ran in parallel, so naive summing would double-count. Events are grouped into sittings, and a gap of more than **30 min** starts a new sitting. Each sitting counts from its first event to its last. Changing that threshold gives: 10 min → 7.3 h, 15 min → 7.7 h, 30 min → 8.8 h, 45 min → 10.2 h, 60 min → 11.0 h. The answer is stable either way.
- **Gaps really were idle.** Most long gaps are Claude sitting on a pending tool call waiting for your approval. One gap runs 11 hours overnight, from Jun 6 14:08 to Jun 7 01:11. Those count as waiting, not working.
- **Reconstructed hours (~15–16 h).** For May 17, 18, 23 and the morning of May 31 there are no transcripts, only the last-modified time of each file plus commit times. A file's time only shows its *last* edit, so these windows are lower bounds on activity, rounded to sensible sitting lengths.
- **What no source captures.** Testing the live site yourself, the hosting dashboards, drafting specs in other chats, and thinking between sessions. These are estimated separately in the next section. (An earlier draft of this log used a flat +25–40% for them and got ≈ 30–35 h. That undercounted, because it left out the concept/prototype work and the two big specs.)

---

## The human side: directing the build and creating the ideas

Session hours measure how long a session was open. They don't separate time you spent on the project from time Claude spent working while you were elsewhere, and they miss everything you did outside Claude Code. This section estimates **your** time only.

### Evidence from the transcripts (May 31 → Sep 13)

| Measure | Value |
|---|---|
| Prompts you sent | 60 |
| Words **typed conversationally** (short directing prompts) | **~1,750** |
| Words of **design specs pasted in** (drafted elsewhere) | **~2,840**: scheduler spec (2,224, Jun 6) + Tracker/CAS spec (614, Sep 12) |
| Words that weren't really yours | ~1,450: two handoff prompts Claude wrote for you to paste back (240 + 796), a `/simplify` skill expansion (414), auto "continue" messages |
| Words of Claude replies you had to read | ~33,000 (≈ 2.2 h at full reading speed; realistically skimmed) |
| Screenshots you sent | 1 (plus described ones: "before it looked like this") |
| Claude tool calls those prompts triggered | ~1,240 |
| **Leverage** | roughly **6–7 lines of shipped code per word of direction** (~29,400 lines ÷ ~4,600 words) |

The gaps between Claude's reply and your next prompt show a lot of off-session work:
- **May 31, 15:33 → 18:47 (3 h 14 m).** You said "I will make the test cases elsewhere", went off, tested, and came back with "the entire system is bugged".
- **Jun 4, 16:13 → 22:35 (6 h 20 m) and on to Jun 6.** You asked for the scheduler context "so I can figure some big changes… in some other chat", and came back two days later with a 2,224-word rewrite spec.
- **Jun 4, 15:59.** "I tried the app myself and 2 glaring issues came up" (then listed 3). That's real use and QA.
- **Sep 12, 04:15.** The four-part Tracker/CAS spec arrived fully formed, only 5 minutes after the Railway billing was fixed, so it was written beforehand.

### Estimate by activity

| Activity | Low | **Likely** | High | Basis |
|---|---|---|---|---|
| **1. Original concept, prototype, Project Bible.** The idea itself, `FocusQuest.html` (60 KB), the first spec: priority formula, XP/streak rules, 7 ranks, achievements, terminology, 7 hard UX rules, the Guild Feed "director" concept | 4 | **6** | 12 | Prototype saved 13:18 May 17; spec v1 written 15:29. How much design came before May 17 is unknown. |
| **2. Directing inside sessions.** Writing prompts, reading replies, approving commands, reacting, judging UI | 12 | **15** | 18 | ~60–80% of the 17.7 h May sittings (very interactive, many approvals), ~40–60% of the 6.6 h June–Sep sittings (mostly "full freedom, don't consult me" delegation). Includes ~1 h typing and ~1.5–2 h reading. |
| **3. Specs written outside Claude Code.** Scheduler rewrite spec, Tracker/CAS spec, checkpoint and handoff prompts | 4 | **6** | 9 | The scheduler spec took shape over ~2 days in another chat (diagnosis, invariants, architecture, acceptance tests). The tracker spec packs about 40 product decisions plus IB CAS domain knowledge into 614 words. |
| **4. Testing and dogfooding off-session.** Making test data, trying the live app, checking deploys, screenshots, local-mode runs | 2 | **4** | 6 | May 31 3 h gap; Jun 4 real-use report; Sep 12–13 checks. |
| **5. Ops and accounts not already counted.** Railway/Vercel/Clerk/Neon setup, env vars, domain/port, auto-deploy toggles, service mix-ups, billing | 1.5 | **3** | 5 | `DEPLOY.md` + 4 build-fix commits; the "gregarious creativity" vs "lucky motivation" confusion; Hobby upgrade. |
| **6. Unlogged thinking.** Deciding what's next between sessions, noticing what's broken in daily use | 1 | **3** | 6 | Pure guess. The later prompts are short and delegating, so less of this was needed after June. |
| **Total human time** | **~25** | **~37** | **~56** | |

**How that splits:** about **15 h of steering inside sessions**, about **16 h of designing ideas** (items 1, 3, 6), and about **7 h of testing and ops** (items 4, 5).

### Whose ideas were whose

There's a pattern in the prompts. **The product thinking is yours: what the app should do, why, and what's wrong with it.** Claude mostly supplied implementation, plus a round of "add anything awesome" features where you handed over the creative freedom on purpose.

**Clearly yours (in your own words in the prompts, or in your specs):**
- The whole premise: gamified ADHD quest manager, the Guild framing, no-shame language, streaks that pause instead of breaking, XP, ranks, themes per level, the hard UX rules (Project Bible, May 17).
- **May 31:** feed coloured by type/difficulty and collapsible. A "plan at a tiredness rate vs get everything done" mode. A notice when the day is impossible (became the feasibility banner). A 3-tier priority dragger. Colourful blocks sized to their duration, draggable.
- **May 31, the algorithm critique:** assign tasks one by one instead of spreading a hard-coded amount; *estimated time must decide whether a task can make its deadline*; no hard-coded breaks, generate the feed live; simpler weighted stats instead of confusing sub-weights; min/max sitting time (20 min – 3 h); *"brainstorm me some ideas before ever even touching the code."*
- **Jun 4:** a working-hours setting; same-day scheduling; the key diagnosis that the scheduler "will have the exact same block be put for many hours in a row" (the variety problem the whole revamp was built to fix); making a safety checkpoint before a big change.
- **Jun 6 spec:** budget → construct → reflow, variety measured by *mode* rather than by task, capacity vs drain as separate concepts, the hard invariants, "generation beats repair", explainability to build trust, momentum-first days, building for any user. *(The wording and algorithmic detail suggest it was polished with another AI chat, but it grew out of your own May 31 and Jun 4 critiques, and you drove it.)*
- **Aug 16:** an account-free local version for easy testing.
- **Sep 12 spec, the Tracker + CAS design:** active cap with no override, next action as a *physical first step*, parking lot, append-only decision log, everything editable, CAS as a lens not a list, the 7×3 matrix, coursework double-count warning, recency-based balance with no hour counter, three interviews, four markdown depths with character budgets, delta export, import that never deletes, mobile-first and one-handed, no priority field (the scheduler owns that), one-tap drop.

**Mostly Claude's, under your "full freedom" prompts (Jun 16, Jul 1, Jul 12):**
- Synthesized sound effects and haptics, Ctrl+K command palette, Trophy Room + 8 extra achievements, streak heatmap, Up Next card, natural-language parsing in quick-add, and the scheduler maths fixes (capacity-aware budgets, gap-aware adjacency, reviving `preferredHour`). Rank theming was *your* idea from the Bible; Claude built it.
- Implementation-level design calls inside your specs: status labels editable while the statuses stay fixed in the DB, "a field missing from an import means not asserted", ↑/↓ reordering instead of drag, the tracker → quest scheduling hand-off being an explicit button.

### Bottom line

About **37 hours of your own time** (realistically 25–55) produced a ~21,700-line full-stack app with an energy-aware beam-search scheduler, a gamification layer, and a long-horizon tracker. **Less than half of that was steering Claude live.** The bigger share went into ideas, specs and testing: working out what the app should be and noticing what was wrong with it. Those are the parts that don't show up in git.
