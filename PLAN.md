# Focus Guild — Plan

The living roadmap: what's done, what's open, in priority order. Current
state and how to run everything: `FocusGuildInstructions.md` → "Current
Build Phase". History with hours: `WORKLOG.md`.

**Status 2026-10-08:** production is `main` @ `29783f0` (deployed 2026-10-06).
The working branch `presets-and-chronicle` is ahead of it and **not deployed**:
the "Follow-up round" row below. One piece of work is finished but waits on a
decision (see "Parked branches").

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
| + Follow-up round | A quest's max session is honoured (a "max 15" quest got one 45-minute block); plans are made in whole minutes. Routines with no hour keep one time of day and step aside for a deadline the plan is short on. Half an hour is kept free for a meal on a day worked through midday. `GET /health` reports the commit that is running. A unit test for the planner crash of `e8809fd`. Deadlines met 64.2% → 65.0%; 94.4% → 95.0% of the best possible; routine in front of a short deadline 18% → 7% of people; no pause at midday 17% → 0.2% | `6aa20b3` … `b2e43c5`, **not deployed** |

---

## Still open

### Scheduler, in priority order (measured by the labs)
1. **A replan with nothing changed still adds work: fixed on a branch, waiting on a decision.** Two causes were found. (a) Generate reserves a rest after a block; a replan sees kept blocks as walls with no rest and fills the rests. (b) The budget gives a long-term quest one sitting per day per pass, so every pass finds another light day. Branch `replan-keeps-breaks` fixes both: kept blocks carry their rests, breaks give way only to a deadline that can still be met, and generate and replan repeat until a pass changes nothing. On seed 7 (1 000 people): `replan twice differs` 43.8% → 0, `no-change replan changed the plan` 30.5% → 0, `no-break after a replan` 54.8% → 15.9%; **deadlines met 64.2% → 63.7%**, over the 0.3-point limit, so it is not merged. The loss is the breaks themselves: the lab's people don't tire, so work planned into a break counts as work done (see Design decisions). Open on that branch before any merge: `reason-false` 0 → 15.1% (reasons written before the last pass), `tiny-block` 4.0% → 8.0%. What does not work, measured: making the budget count kept work per day (−2.0 points), repeating passes without the rests (first plans lose their breaks: `no-break` 0.7% → 20%), letting breaks give way to quests that can't make it anyway (−1.0).
2. **Routines, what is left.** A routine missing from a day with room rose 0.9% → 2.6% of people (an untimed routine is now skipped today once its time is two hours gone, and the time it is judged by can differ from where a crowded day put it). Today's routine off its usual time: 12.9% (most are routines that stepped aside on purpose; the check doesn't tell them apart yet). Routines only step aside on generate and on the plain replan, not after an edit or an insert. Still in front of a short deadline: 6.9%, mostly where moving it frees less than a sitting.
3. **Meal gap, what is left.** On by default (`config.mealGap`, 30 min between 11:30 and 14:00) with no switch in Settings and no way to say "I eat at 1". Nothing for hours that run past midnight. Add both to Settings.
4. **Learn the energy curve** from behaviour and offer it as a one-tap suggestion (33% of night owls who never open Settings still get heavy work in their slump). Started, parked.
5. **Fragments that remain:** `fragment-dose` 20% of people, `week: snowball` 12%, `interleaved` 7%, `fewer-on-time` 12%.
6. **Estimates in the first week:** new users reach 87% of the best possible against 94% for returning ones; knowing each person's factor would give ~94.5%, so the rest is first-week learning speed.
7. **After hours:** opened after quest hours with something small due tonight, the Feed is empty plus a banner. Add an insight with a "Start now" action. Working hours stay a hard wall for planning.
8. **Banner:** "move the deadline" is +1 day and may need a second tap; compute the first date it fits (additive field on the issue).
9. Smaller: night-shift users — the Feed groups by calendar date, `planner.meterAt` resets at midnight, the check-in lookup uses the UTC date; daylight-saving changes shift blocks an hour (single `tzOffsetMin`); generate at 200 quests × 30 days takes ~240 ms and grows faster than linearly; on compact Feed tiles the delete button overlaps the load dots; fuzz: `minutes:over-planned, kept blocks not trimmed` 3% of cases, one ui-tier case of a block longer than its quest's max session (`npm run lab:fuzz -- --show 1431`).

### UI, after the 2026-10-06 refresh (rules are in the Bible → "UI rules" and "Craft checklist")
- **Departures is built** (2026-10-08; deployed 2026-10-10 with the lines): theme, board rows with a status column on Route and the quest lists, the yellow sign with a flip clock, the night platform scene, and the route vocabulary. Not yet in board style: Stragglers, Expeditions, Mileage, Logbook, Settings, the block drawer and the quest editor wear the colours and type but keep their earlier layouts.
- **Lines are built** (2026-10-09; deployed 2026-10-10 at the owner's word, with the Night Line as the default): the theme engine, a picker in Settings, and five lines (Night, Ring, Abyssal, Timber, Salvage) made from the owner's 25 reference stills by the director-and-coders pipeline in `design/lines/PIPELINE.md`. **Waiting on the owner:** which line is the default, which to keep or cut, and anything in a window that looks wrong. Gallery of real screenshots: https://claude.ai/artifact/KWThCeaU1vBQwErydtjx9f
- Open on lines: the Night Line has no companion yet (the others do); the passing visitor on the Abyssal Line is small; nothing has been checked on a real phone, only at phone width in a headless browser; the scenes have been reviewed as posed stills and not watched in motion for long.
- Ideas the owner may want next: a sound for the departing visitor; the window on the sign-in screen; a line per season.
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
| `replan-keeps-breaks` @ `b14e997` (worktree `agent-abaaa678aca7b13f9`) | Scheduler item 1: rests after kept blocks, breaks give way to a meetable deadline, passes repeat until stable. Branched from `9f8087a`. | Works and is measured (numbers in its commit message). **Needs the owner's call**: keep breaks in replans at about half a point of simulated deadlines, or leave replans as they are. Then fix `reason-false` and `tiny-block`, and merge the current branch into it. |
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
- **The population lab's people don't tire.** Each planned block is done with a fixed probability, whatever came before it, so minutes planned into break time count as minutes worked and "deadlines met" goes up when a plan has no breaks. Read a small loss there next to `no-break` before calling a change worse; the 0.3-point merge limit assumes the loss is real.
- A routine with no hour of its own has one time of day, the same every day, and is treated like a routine with a time: skipped today once it is two hours gone, never dropped on "now". It may step aside for a deadline the plan is short on (later the same day); a routine with an hour never moves.
- A meal is free time, not a block: nothing shows in the Feed, the half hour is simply never planned. Nothing is taken when a class, a lunch date or a routine already breaks the span.
- A quest due later this very minute is still reported short: plans are made in whole minutes, but which quests are due is read from the real clock.
- How to run a team of agents on this repo: one job per agent, each coder in its own worktree, at most two or three at once, each told to commit after every step; the director merges one branch at a time and reruns `npm test`, `npm run lab`, `npm run lab:pop` and `npm run lab:fuzz` after each merge. The grader is a judge: checks may be added, never weakened.
- Migrations are **idempotent**, because Railway runs `migrate deploy` on boot and a failing migration takes the server down.
