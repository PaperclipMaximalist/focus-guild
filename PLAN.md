# Focus Guild — Plan

The living roadmap: what's done, what's open, in priority order. Current
state and how to run everything: `FocusGuildInstructions.md` → "Current
Build Phase". History with hours: `WORKLOG.md`.

**Status 2026-10-06:** everything under "Done" is live in production (`main`,
merged from `presets-and-chronicle` on 2026-10-06). Work in progress that is
NOT merged is listed under "Parked branches" below.

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
| + Population lab | `npm run lab:pop`: thousands of simulated people plan and live a week, graded against an optimal oracle. Fixes: triage (keep the most deadlines, LOW before MED before HIGH), reconcile (deadline work gets what really fit), replans can move later work for a deadline, overrunning quests stay in the plan, check-in cap on today only (was landing on tomorrow), long breaks counted, focus window for light days, chronotype setting, routines at their own time and full length, routine top-up on replan, Feed replans on a new day. Deadlines met 43% → 57%; 68% → 89% of the best possible | `8e501f7` |
| + Agent team round | A director plus coder and tester agents, each coder in its own worktree, merged one at a time behind the labs. Hours past midnight (22–06). Estimates learned from the first finished quest. Quest sessions (a quest's sittings stay together; quests up to 90 min in one sitting; due-today work first). Replans that survive a day (no growth after the last block, check-in cap all day, nothing left behind `now`). Reasons written from the finished plan and shown on normal tiles; a "won't finish" banner with tap-to-apply choices. Fuzz lab (`npm run lab:fuzz`) and its fixes (unique block ids, late and orphan pins, NaN moves). A planner crash fixed. Deadlines met 59% → 64%; 90% → 94% of the best possible; same-quest-picked-up-3-times 33% → 6% | `6618096` … `e8809fd` |

---

## Still open

### Scheduler, in priority order (measured by the labs)
1. **A replan with nothing changed still adds work** (fuzz: 12% of cases; population lab: `replan twice differs` 44% of people, `no-change replan changed the plan` 30%, `no-break after a replan` 55%). Cause confirmed: generate reserves a rest after each block, a replan sees kept blocks as walls with no rest after them and fills the rests. An earlier attempt (padding kept blocks with their rest) fixed the breaks but cost 1.2 points of deadlines met, so it needs the budget to count those rests too.
2. **A quest's max session is ignored** (`chunk:new-block-longer-than-maxChunkMin+20`, 7% of fuzz cases; the last `it.fails` in `fuzz-repros.test.ts`). A fix exists, unmerged and unverified: see Parked branches.
3. **Untimed routines** are placed from "now" and can sit in front of a short deadline (`routine-blocks-deadline` 22% of people, `routine-drifts-today` 22%). Give them a stable time of day and let them yield to a short deadline. Lab checks exist on a parked branch.
4. **No meals:** a third of people have no free half hour 11:30–14:00 on a day they work through. Try a lunch gap counted in capacity; ship only if it costs ≤ 0.3 points of deadlines met.
5. **Learn the energy curve** from behaviour and offer it as a one-tap suggestion (33% of night owls who never open Settings still get heavy work in their slump). Started, parked.
6. **Fragments that remain:** `fragment-dose` 21% of people, `week: snowball` 11%, `stale morning` 5.6% (up from 4.2% over this round), `fewer-on-time` 13%.
7. **Estimates in the first week:** new users reach 87% of the best possible against 94% for returning ones; knowing each person's factor would give ~94.5%, so the rest is first-week learning speed.
8. **After hours:** opened after quest hours with something small due tonight, the Feed is empty plus a banner. Add an insight with a "Start now" action. Working hours stay a hard wall for planning.
9. **Banner:** "move the deadline" is +1 day and may need a second tap; compute the first date it fits (additive field on the issue).
10. Smaller: night-shift users — the Feed groups by calendar date, `planner.meterAt` resets at midnight, the check-in lookup uses the UTC date; daylight-saving changes shift blocks an hour (single `tzOffsetMin`); generate at 200 quests × 30 days takes ~240 ms and grows faster than linearly; on compact Feed tiles the delete button overlaps the load dots; no minimal unit test yet for the reconcile crash fixed in `e8809fd` (repro: `npm run lab:pop -- --n 600 --seed 41 --week --no-night-shift`, people 127 and 555, before that commit).

### UI, after the 2026-10-06 refresh (rules are in the Bible → "UI rules" and "Craft checklist")
- **Departures is built** (2026-10-08, branch `ui-refresh`, not merged or deployed until the owner has seen it): theme, board rows with a status column on Route and the quest lists, the yellow sign with a flip clock, the night platform scene, and the route vocabulary. Not yet in board style: Stragglers, Expeditions, Mileage, Logbook, Settings, the block drawer and the quest editor wear the colours and type but keep their earlier layouts.
- Ideas the owner may want next: a second theme (Guildhall) behind a picker; a sound for the departing train; the scene on the sign-in screen.
- Still to do from the craft audit: filters, sort and the Feed's selected day in the URL; focus trapped inside sheets and returned on close; arrow-key movement through lists.
- Bring the remaining screens to the list style: Chronicle, Connections, Tracker presets / markdown, the quest detail sheet, focus timer, spin wheel, plan insights and the "won't finish" banner.
- The quest editor is still one long form: put title, priority, deadline and estimate first and fold the rest under "More".
- Client lint has ~30 `react-hooks` errors that predate the refresh (set-state-in-effect, purity); none block the build.
- The dev account's duplicated quests make every screenshot look broken; see Duplicate detection below.

### Product
- **Duplicate detection.** The dev account has every recurring quest twice, most likely from a double import. Warn on import or creation when the title matches and the duration is the same, and offer to merge.
- **Overdue quests** surface via insights and Rescue; consider a one-tap "move all to tomorrow".
- **Tracker one-line quick-add** (deferred from Phase 1): reuse the markdown line grammar, e.g. `EE intro > write one ugly paragraph @EE due:fri cas:c`.
- **Calendar write-back via OAuth** (Google / Microsoft) and **Google Classroom** assignments, only if ICS links and the inbox aren't enough.
- **Gemini Spark / other agents:** the MCP connector in `mcp/` is local (stdio). A hosted (HTTP) version would let cloud agents read the plan and add to the Parking Lot.

### Parked branches (local worktrees under `.claude/worktrees/`, not pushed)
| Branch | What is there | State |
|---|---|---|
| `worktree-agent-abaaa678aca7b13f9` @ `8a66471` | Max-session cap honoured (7.3% → 1.0% of fuzz cases), whole-minute block times; touches `reconcile.ts`, `constructor.ts` | Tests pass (334) but the population lab and `npm run lab` were not run. Verify before merging. |
| `worktree-agent-aed603473ed3e0ccd` @ `1d4405a` | Lab checks only: `routine-blocks-deadline`, `routine-drifts-today` | Ready to build on (item 3). |
| `worktree-agent-aaaf4994560cafbaa` (uncommitted) | Start of `suggestChronotype` in `insights.ts` plus lab changes | Early; based on `8e501f7`, so it needs a merge of the current branch first. |
All other agent worktrees are merged and can be removed (`git worktree remove <path>`).

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
- **Finishing today's plan means done for today.** A replan after a session never adds non-urgent work to today; deadline work that became necessary is the exception.
- A quest's sittings stay together (a session), and a quest of up to 90 minutes is done in one sitting on one day.
- Reasons are written once, from the finished plan (`explainPlan`), and every clause must be checkable against it. Say less rather than something that might be false.
- Working hours that end before they start run past midnight; a person's day ends when their session does.
- How to run a team of agents on this repo: one job per agent, each coder in its own worktree, at most two or three at once, each told to commit after every step; the director merges one branch at a time and reruns `npm test`, `npm run lab`, `npm run lab:pop` and `npm run lab:fuzz` after each merge. The grader is a judge: checks may be added, never weakened.
- Migrations are **idempotent**, because Railway runs `migrate deploy` on boot and a failing migration takes the server down.
