# Focus Guild — Plan

The living roadmap: what's done, what's open, in priority order. Current
state and how to run everything: `FocusGuildInstructions.md` → "Current
Build Phase". History with hours: `WORKLOG.md`.

**Status 2026-09-26:** everything under "Done" is live in production
(`main` @ `5688211`) except the population-lab row, which is committed on
`presets-and-chronicle` and waiting for a deploy.

---

## Done (September 2026)

| Phase | What | Commits |
|---|---|---|
| 0 · Launch | Shipped the scheduler revamp, juice pass and tracker/CAS, which had sat unmerged since June. Fixed tracker codes being reused after deletes. | `32a8e38` |
| 1 · Presets | Tracker preset packs (IB Guild, Bad-week minimal, Projects & work) and new-item templates, plus last-domain memory | `748a591` |
| 2 · Chronicle | Activity log, versioned permafile, AI context bundle. Fixed quests editable/deletable by any signed-in user (IDOR). | `ec5d8b9` |
| 3 · Connections | ICS calendars the planner routes around; `/inbox` capture into the Parking Lot | `37a0987` |
| 4 · Ask the Guild | Claude over permafile + tracker + log, with tap-to-apply suggestions; one personal access token (`fgpat_`) for everything | `6a80606` |
| 5 · MCP | Claude Desktop / Code connector in `mcp/` | `e298035` |
| + PWA | Installable app, offline shell, share target | `870ecb0` |
| + Plan feed | Plan published as a subscribable ICS feed | `a1c00eb` |
| + Import | Bulk quest import from pasted text; client test runner | `084890f`, `95daa53` |
| + Scheduler overhaul | Scenario lab (`npm run lab`). Real sittings, real breaks, deadline preemption, pacing past the horizon, idempotent replan, honest "why now", peak hours for heavy work, starter push, load levelling, time hints for dailies. **Fixed "Not Today" deleting quests.** | `4e7de29`, `d3f3e50` |
| + Insights | Feed notes for overdue quests, routines crowding out quests, undated backlog pace; working-hours suggestion; self-correcting estimates from logged focus time; half-hour working hours | `5688211` |
| + Population lab | `npm run lab:pop`: thousands of simulated people plan and live a week, graded against an optimal oracle. Fixes: triage (keep the most deadlines, LOW before MED before HIGH), reconcile (deadline work gets what really fit), replans can move later work for a deadline, overrunning quests stay in the plan, check-in cap on today only (was landing on tomorrow), long breaks counted, focus window for light days, chronotype setting, routines at their own time and full length, routine top-up on replan, Feed replans on a new day. Deadlines met 43% → 57%; 68% → 89% of the best possible | branch `presets-and-chronicle`, **not deployed yet** |

---

## Still open

### Product, in priority order
1. **Learn the energy curve.** Settings now has a chronotype picker (standard / morning / afternoon / night owl), and light days use their best window. Still open: learn the curve from check-ins and from when focus sessions actually happen and finish, so people who never open Settings get theirs. In the population lab, 37% of night owls who didn't pick "night owl" still get heavy work in their slump.
2. **Estimates for new users.** Calibration needs 5 finished quests; until then the plan uses raw estimates, and overruns are the biggest remaining gap (a perfect follower gets 89% of the best possible with real estimates, 97.5% with exact ones). Try shrinking toward the observed ratio from the first sample, or a mild planning-fallacy prior, and grade it with `npm run lab:pop -- --week`.
3. **Duplicate detection.** The dev account has every recurring quest twice, most likely from a double import. Warn on import or creation when the title matches and the duration is the same, and offer to merge.
4. **Replan on focus overrun** (a Bible promise). When a focus session runs 10+ min over, extend the block and compress or defer the lowest-priority rest of the day.
5. **Overdue quests** now surface via insights and Rescue; consider a one-tap "move all to tomorrow".
6. **Tracker one-line quick-add** (deferred from Phase 1): reuse the markdown line grammar, e.g. `EE intro > write one ugly paragraph @EE due:fri cas:c`.
7. **Calendar write-back via OAuth** (Google / Microsoft) and **Google Classroom** assignments, only if ICS links and the inbox aren't enough.
8. **Overnight working hours** (night shifts, 22:00–06:00). Settings allows a start after the end, and the planner then plans nothing at all; either support windows that cross midnight or refuse them in Settings.
9. **Heavy days for overcommitters** interleave one big quest with lighter ones (the variety rules), up to 10 switches a day. Consider relaxing variety when one quest dominates a crunch day.
10. **Replans and the check-in cap:** mid-day replans cap only the new work, so today can end up over the check-in's minutes when stable blocks already used some.

### Ops, needs the owner
- Set `ANTHROPIC_API_KEY` on Railway (Ask the Guild, Quest Decomposer).
- Rotate the Neon password (exposed in a screenshot in May).
- Create a Neon **dev branch** and point `server/.env.local` at it. Local testing currently writes to the production database, and auto mode blocks schema changes there.
- Switch Clerk to production keys (the sign-in shows "Development mode").
- On a phone: install the PWA, share into it, connect a school calendar, subscribe to the plan feed.

---

## Design decisions worth not re-litigating
- The scheduler's layers have one job each: **the budget decides how much** per day, **the constructor decides the order**, **the break policy decides rest**.
- Suggestions from AI are **tap-to-apply**, never silent writes; the same goes for "Schedule as quest" in the tracker.
- Captured items (inbox, share, MCP) land in the **Parking Lot**, never the active list.
- Markdown import treats a missing field as "not asserted", never "clear it", and never deletes items.
- When deadlines can't all be met, the plan keeps **as many on time as possible**, and gives up LOW before MED before HIGH. Hopeless quests still get leftover time; they don't take a finishable quest's slot.
- **Deadline safety beats stability** on replan, but only for quests that can still make it.
- Routines are personal time: they keep their own hour even outside quest hours.
- Migrations are **idempotent**, because Railway runs `migrate deploy` on boot and a failing migration takes the server down.
