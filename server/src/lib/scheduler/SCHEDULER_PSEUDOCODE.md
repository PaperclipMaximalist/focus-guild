# Focus Guild scheduler — design + pseudocode

The Focus Guild scheduler turns a pool of `Task`s into a `Schedule` (a
time-ordered list of `Block`s) that fills the user's working hours
across a configurable horizon. It runs purely; no DB, no network, no
global state. All knobs live on `UserConfig`.

If a value disagrees with the code, **the code is the source of truth** —
update this doc. Last rewritten 2026-09-26 after the scenario-lab overhaul
(commits `4e7de29`, `d3f3e50`, `5688211`), then extended the same day after
the population lab (triage, reconcile, focus window, chronotypes).

**Before and after any change here, run `npm run lab` and `npm run lab:pop`**
(see the end of this doc). The first plans hand-written weeks; the second
plans and lives weeks for thousands of generated people and compares against
the best any plan could do. Both found far more than the unit tests did.

## Pipeline (high level)

```
 quests ─▶ adapter.ts ─▶ tasks          (calibrated estimates, Not Today → notBefore)
 recurring ─▶ dailyFiller.ts ─▶ fixed   (routines, placed first)
 calendar  ─▶ calendar/ics.ts ─▶ fixed  (busy events, "Calendar: <title>")

                  ┌─────────────────┐
   tasks ────────▶│   eligibility   │  not done, time left, deadline > now, deps met
                  └────────┬────────┘
                  ┌────────▼────────┐
                  │  budget.ts      │  Phase 0 — how much of each task per day
                  │  buildDayInfo   │  free time per day (minus fixed, + transitions)
                  │  triage         │  which deadlines to give up on if not all fit
                  │  allocateBudgets│  whole sittings, pacing, levelling, repair
                  └────────┬────────┘
                           │ DayBudget[]
                  ┌────────▼────────┐
                  │ constructor.ts  │  Phase 1 — in what ORDER within the day
                  │  buildDay       │  focus window on light future days, then
                  │  constructDay   │  beam search, breaks, variety, peak/EDF guards
                  └────────┬────────┘
                  ┌────────▼────────┐
                  │ reconcile.ts    │  Phase 1b — deadline work gets what really
                  │                 │  fit: swap from later work, fill gaps, pay back
                  └────────┬────────┘
                  ┌────────▼────────┐
                  │ planner.ts plan │  Phase 2 — collect + feasibility report
                  └────────┬────────┘
                  ┌────────▼────────┐
                  │ insights.ts     │  what the plan can't say by itself
                  └─────────────────┘
```

One job per layer: **the budget decides how much** work each day holds, **the
constructor decides the order**, **the break policy decides rest**, and
**reconcile settles the difference** between what the budget promised and
what the constructor could really fit. Most of the bugs the labs found came
from those jobs leaking into each other, or from nobody owning the gap
between them.

For edits/inserts, the route layer calls `replan()` (= `reflow()`) which
preserves every still-valid existing block and only fills gaps. This is
the "minimal perturbation" path — see `reflow.ts`.

## File map

| File              | Purpose |
|-------------------|---------|
| `types.ts`        | `Task`, `Block`, `Mode`, `ScoreWeights`, `UserConfig`, etc. |
| `config.ts`       | Defaults: working hours, energy curve, `CHRONOTYPE_CURVES`, break policy, score weights, horizon |
| `tz.ts`           | User-local day boundaries (`userMidnightUtc`, `userHourUtc`, …) |
| `adapter.ts`      | Prisma `Quest` → `Task`; applies estimate calibration; NOT_TODAY → `notBefore` |
| `budget.ts`       | `buildDayInfo`, `triage`, `allocateBudgets`, `canDonate`, `todayCap`, `minSitting`, `dueWithinPlan` — Phase 0 |
| `constructor.ts`  | `buildDay` / `focusWindow`, `constructDay` — beam search, breaks, peak and EDF guards — Phase 1 |
| `reconcile.ts`    | Swap + fill + payback after construction — Phase 1b |
| `planner.ts`      | `plan` entry point + all per-decision scoring primitives |
| `reflow.ts`       | Minimal-perturbation reflow for edits — drives `replan()` |
| `replan.ts`       | Public entrypoints: `generateSchedule()`, `replan()` |
| `edits.ts`        | Pure `applyEdit(schedule, edit)` — block-level operations |
| `explain.ts`      | `composeWhy` (fact-based "why now") + `explainBlock` fallbacks |
| `insights.ts`     | `computeInsights`, `calibrateEstimates`, `suggestWorkingHours` |
| `dailyFiller.ts`  | Pre-place recurring quests as `fixed` blocks; `inferPreferredHour` |
| `preferences.ts`  | (unused) historical-pattern learning stub |
| `../calendar/ics.ts` | ICS → busy events → fixed blocks (`isCalendarBlock`) |
| `../deferral.ts`  | `reviveDeferred` — Not Today ends at the user's midnight |

## The per-decision scoring (placementScore)

Each candidate placement gets one composite score. Every term is
normalized to roughly `[0, 1]` (or `[-1, 0]` for penalties) BEFORE
multiplication by its config weight, so no single term can dominate.

```
blockScore =
    + w_energy   · energyFit          ∈ [0, 1]
    + w_urgency  · urgencyFit         ∈ [0, 1]
    + w_batch    · batchBonus         ∈ [0, 1]
    + w_prefHour · prefHourFit        ∈ [0, 1]
    − w_monotony · monotonyPenalty    ∈ [0, 1]
    − w_tedium   · tediumClash        ∈ {0, 1}
    − w_cooldown · cooldownClash      ∈ {0, 1}
    − w_session  · sessionSizePenalty ∈ [0, 1]
  (+ peakGuard, added by the constructor — see Phase 1)
```

| Term                | Idea                                                       | Default weight |
|---------------------|------------------------------------------------------------|----------------|
| `energyFit`         | `1 − |task.cognitiveLoad − energyCurve(hour)|`             | 1.5            |
| `urgencyFit`        | `exp(−slack / max(remainingMin, 60))` × tier-mult          | 2.0            |
| `batchBonus`        | +0.5 if short admin/comms chained with same category       | 0.5            |
| `prefHourFit`       | pull toward `task.preferredHour`                           | 0.6            |
| `monotonyPenalty`   | `min(1, (runLen − 1)² / 4)` on same-mode run length        | 1.5            |
| `tediumClash`       | 1 iff both this and prev are high-tedium                   | 0.8            |
| `cooldownClash`     | 1 iff both this and prev are high-cognitive-load           | 0.8            |
| `sessionSizePenalty`| distance from `idealSessionRange(task)`                    | 0.5            |

`Mode = (category, loadTier, tediumTier)`. Adjacency (monotony, clashes)
resets across a real gap of more than `ADJACENT_GAP_MAX_MIN` (45) and overnight.

`idealSessionRange(task)`: ≥180 min → 30..90 · ≥60 → 20..60 · <60 → 10..remaining.

## Phase 0 — daily budgeting (`budget.ts`)

```
buildDayInfo:
  for each day in horizon:
    working window = [max(now, startHour), endHour] in user-local time
      endHour < startHour (22–06, 14–02) = until that hour TOMORROW; the day
      keeps the date its window starts on, and the first day is the working
      day `now` is in (at 01:00 mid-session: the night that began yesterday).
      The person's day then turns over at endHour, not midnight (tz.ts
      workDay*): check-in cap, "today starts now", Not Today and routines all
      follow that. start == end is refused by Settings (workingHoursProblem).
    free intervals = window minus immovable (fixed + locked) blocks
    after a fixed block ≥ 90 min, the next free time starts 20 min later
      (TRANSITION — nobody walks out of school straight into an essay)

capacity per interval = workableMin(length, breakPolicy)
  work  = length − floor(length / (on + off)) × off  # per interval, not a flat %
  work −= floor(work / (longAfter + extra)) × extra  # extra = long − short break
  (a lone 30-min gap needs no break and keeps all 30; a 510-min Sunday holds
   390 with its long breaks, which is what the constructor really fits)

todayCap = the check-in's minutes, only if the plan's first day IS today
  (opened after hours, the first day is tomorrow and stays uncapped; the
   cap used to land on it and leave Tuesday idle)

triage (Moore–Hodgson over tasks dueWithinPlan):
  walk deadlines in order, summing remainingMin
  while the sum > capacity before this deadline, drop one kept task:
    lowest tier first (LOW < MED < HIGH; tier from urgencyMultiplier),
    then the most remainingMin / (0.5 + importance)
  → `dropped`: quests that can't all make it. They still get leftover time;
    they just stop outranking quests that can finish.

paceLeft (tasks due AFTER the horizon only):
  share = ceil((remaining + committedMin) × daysInPlan / (daysInPlan + daysBeyond))
  paceLeft = share − committedMin
  # committedMin = minutes already in stable blocks (set by reflow), which
  # keeps a no-change replan from granting a fresh share each time

levelTarget = max(120, ceil(total owed this plan / days))

PASS 1 — fair spread, day by day, tasks in priorityScore order:
  skip if deadline passed, or task.notBefore ≥ day end (Not Today)
  daysAvailable = plan days before deadline + daysBeyondHorizon
  sitting = minSitting(task, left)       # small (≤45) whole; else ≥ max(25, idealHi/2)
  want    = max(ceil(left / daysAvailable), sitting)
  cap     = min(softMaxPerDay, day residual, usable before deadline, left, pace + sitting)
  grant   = min(want, cap); absorb a remainder smaller than a sitting
  skip if grant < sitting and grant < left          # never a crumb
  skip if small task, > 2 days to spare, and today is over levelTarget
                                                     # small tasks wait for a lighter day

PASS 2 — deadline-safety repair (only tasks dueWithinPlan), non-dropped first:
  fill from residual: whole sittings first, then any size ≥ 10 min
  still short → PREEMPT from donors where canDonate(donor, task):
      dropped donor → non-dropped task: always, whatever the dates
      non-dropped donor due in plan → dropped task: never
      otherwise: the donor must be due LATER
    dropped donors first, then loosest; never leave the donor a crumb
  donors are paid back from what's left: due in plan → all they need;
    due after the plan → up to what they gave (it used to be nothing, so a
    HIGH quest due in two weeks lent Monday and then sat out a week of
    empty days)

SLIVERS — a grant under 15 min for a quest that isn't small folds into a day
  that already has a sitting of it, if that day has room; if not and the
  quest is due after the plan, it's left for a later week
```

`dueWithinPlan(task, days)` = no working day after the horizon before its
deadline. **Budget, repair and the feasibility report all use this one
definition** (they used to disagree by hours at the end of the week).

`priorityScore = 4·urgency² + 2·impact + 1·staleness + 3·tierBoost`
(`planner.ts::priorityScore`), used here and as a tie-break.

## Phase 1 — within-day construction (`constructor.ts`)

```
buildDay(budget):
  window = focusWindow(budget)
  if window: build inside it, and keep that if every quota fit
  otherwise build across the whole day

focusWindow — only on a future day (today starts now, for momentum), with
some heavy work (load ≥ 0.6), no preferred-hour quest, and work plus rests
under 80% of the free time:
  span = need × 1.3 + 20 min
  slide a span-long window in 15-min steps; it must hold ≥ need × 1.15 free
  take the best average energyCurve, only if it beats the earliest window by
    ≥ 0.05; free time becomes window start .. window end + 60 min
  (without it, two hours of work always sat at the start of the day: 13:30
   for a night owl whose hours run to midnight)
```

Bounded beam search (width 3) over the day's free intervals. **There is no
"skip the rest of this interval" branch**: it used to score 0 while a tedious
chore scored below 0, so the beam preferred an empty evening to doing the
chores. Time is only left empty for rest.

```
loop:
  for each state in beam:
    candidates = enumerate(state, variety floor ON)
    if none:
      candidates = enumerate(state, floor OFF)
      if some and day slack ≥ 46 min:       # everything left extends a same-mode run
        rest 46 min (ends the run), continue # a walk between two essays
    if none: drop this interval (nothing fits it at all)
    else: fork on every candidate
  keep top 3 by total score

enumerate(candidate task at cursor):
  chunk = clamp(left, idealLo, idealHi), ≤ interval, ≤ cap, ≤ left
  tail rule: never leave a tail < sitting (finish it, ≤ cap + 20, or leave a full sitting)
  starter push: first work block of the day on a heavy task (load ≥ 0.7) → 25 min
  skip if chunk < sitting and chunk < left       # no sliver at an interval end
  skip if chunk < 15 on a quest of ≥ 30 min with more left than this chunk
  score = placementScore + peakGuard
  EDF guard: drop candidates that would leave a quest due earlier INSIDE the
    working day (deadline < workEnd) without enough free time before it;
    use all candidates if that empties the list

peakGuard:
  light task (≤ 0.5) in a slot with energy ≥ 0.65 while ≥ 25 min of heavy work
    is still owed today   → −1.2 × (energy − 0.5) × 2
  heavy task (≥ 0.7) in a slot with energy < 0.55 while light work could take it
                          → −1.2 × (0.55 − energy) × 2

after placing a block, rest before the next (restAfter):
  worked ≥ longBreakAfterMin (180) since the last long rest → longBreakDurationMin (30)
  unbroken run ≥ shortBreakAfterMin (50)                  → shortBreakDurationMin (10)
  a heavy sitting ≥ 25 min                                  → short break anyway
  next start snaps up to a 5-minute mark ("14:05", not "14:01")
```

`breakPolicy` used to be dead config ("gaps are the breaks", but intervals
were packed edge to edge, so four straight hours was normal). Breaks are now
real, and Phase 0 reserves their time.

## Phase 1b — reconcile (`reconcile.ts`)

The constructor is the truth about what fits. Only quests dueWithinPlan that
came up short, non-dropped first, then by deadline:

```
SWAP (up to 4 rounds):
  for each short task T, on days before its deadline (and after notBefore):
    donors = tasks with blocks here that end before T.deadline and
             canDonate(donor, T); dropped first, then loosest
    skip a day if T needs < 15 min and has no sitting there to grow
    first touch of a day: settle every quota at what was really placed
    move donor minutes to T (no crumbs left to donors)
  rebuild the touched days (buildDay); roll a day back if T gained nothing
  remember what each donor lost ("lent")

FILL, in gaps between placed blocks (10-min break margin beside work),
within today's check-in cap:
  candidates: still-short tasks, then donors for what they lent
  a quest that can FINISH in the gap goes first (not a < 15-min shard of a
  big one); otherwise a real sitting (≥ 25 min) on one that can't
```

## Reflow (`reflow.ts`) — the edit path

A block is "stable" (kept exactly in place) if it is future + unlocked, its
task still exists and isn't done, it ends before the deadline, dependencies
are met, **and it doesn't overlap a fixed block** (a meeting synced after the
plan was made invalidates the work under it). Stable blocks go to `plan()` as
extra locked blocks; consumed minutes are subtracted from `remainingMin` and
recorded as `committedMin`. Replanning with nothing changed moves 0 blocks.

**Deadline safety outranks stability.** If the result still has short
quests that triage keeps, stable blocks of work due later that sit before
their deadline are released (latest-due first, then earliest) and the plan
reruns, up to 3 times, kept only if the shortfall drops. After a skipped
block, the work due tonight used to get only the gaps.

Calendar blocks are swapped for fresh ones on every replan (the route filters
`isCalendarBlock` out of the old schedule and adds the current events). The
replan route also tops up routines on days that don't have them yet
(`topUpRoutines`); only generate used to place them.

## Around the planner

- **Daily routines** (`dailyFiller.ts`): recurring quests become `fixed`
  blocks noted `Daily: <title>`, placed before quest work, at their real
  length (up to 240 min; they used to be clipped to 60). With no
  `preferredHour`, time words in the title set one (`inferPreferredHour`):
  morning/breakfast → min(start, 8), lunch → 12, afternoon → 14,
  evening/tonight → max(end − 1, 19), night/bedtime/before bed →
  max(end − 1, 21), end of day → end − 1. Routines are personal time, so one
  with an hour outside quest hours keeps that hour. Placement takes the
  **nearest** free slot, earlier or later. A routine whose hour passed more
  than 2 h ago is skipped for today rather than run late. When routines take
  at most half the day, each gets 10 min of space around it.
- **Chronotype** (`config.CHRONOTYPE_CURVES`, Settings → "Sharpest time of
  day"): standard (the office curve), lark (peak 7–11), afternoon (13–17),
  owl (19–24). `userConfig.ts` picks it from `schedulerSettings.chronotype`.
- **Overrun** (`adapter.remainingFor`): a quest still open after its logged
  time used up the estimate keeps 25% of the estimate (15–120 min) in the
  plan until it's marked done. It used to drop to 0 and vanish. The same
  floor holds once the user's own estimate is used up, even if the
  calibrated one has a few minutes left (a sliver the budget won't place).
- **Calendar** (`../calendar`): busy, timed, non-cancelled ICS events become
  `fixed` blocks noted `Calendar: <title>`; synced every 15 min and before
  generate/replan when stale (4 s cap).
- **Not Today**: the adapter gives NOT_TODAY quests `notBefore` = the user's
  next midnight; the budget skips days before it. `reviveDeferred` flips them
  back to ACTIVE after that midnight. (It used to delete quests from the plan
  for good.)
- **Calibration** (`insights.calibrateEstimates`): the focus timer logs
  focused minutes to `actualMinutes`. From the first finished quest with
  logged time: the upper quartile of actual/estimate (plan for the slower
  quests; finishing early is free, a missed deadline isn't), clamped 0.6–2.5,
  shrunk toward 1 by n / (n + 1), ±15% deadband; per category with ≥ 3
  samples (shrunk toward the overall rate). The adapter plans
  `estimate × multiplier`. (Until Oct 2026: the
  median, clamped at 2.0, and nothing before five finished quests.)

## Explain (`explain.ts`)

After beam selection the constructor replays the winning sequence and stores
a note per work block:

```json
{ "term": "energy", "sign": "+", "total": 2.84, "why": "Due in 2 days · heavy work in your sharpest hours." }
```

`why` comes from `composeWhy`, built from **facts**, at most two clauses:
a deadline clause (due today / tomorrow / in N ≤ 3 days) plus one situation
(short first push, easy start, lighter change of pace after X, batched admin,
sharpest hours, heavy at a low hour, light work for a low stretch, the time
you asked for, change of subject), with an honest fallback. The API serves it
as `reason` on each work block; the Feed shows it on tiles and in the block
sheet. `term`/`sign` remain as the fallback for old notes.

(The old reasons named whichever scoring term won, so an energy win at 19:43
said "your capacity is high right now", and the Feed printed the raw JSON.)

## Insights (`insights.ts`)

Computed with every plan and served as `insights`; the Feed shows the notes
above the timeline (`PlanInsights.tsx`):

- **Overdue** quests (they can't be planned past their deadline) → link to Rescue.
- **Routines** taking ≥ 50% of the working day.
- **Undated backlog** ≥ 10 h as weeks-to-clear at this plan's pace (≥ 3 weeks).
- **Working-hours suggestion** when calendar events cover ≥ 60% of the window
  on 3+ days: start 20–40 min after the latest regular finish, on a half hour.
- **Calibration** note when estimates run off.

## Hard invariants (test assertions)

1. Account for every active in-deadline quest.
2. Placed minutes == `remainingMin` for work due within the plan, OR the
   difference is in the feasibility report. Work due after the plan gets its
   paced share and is never reported short.
3. Never schedule past a deadline, or before `notBefore`. Today's check-in
   cap applies to today only.
4. Past + fixed + locked blocks preserved across `replan()`.
5. Work in the user's timezone (`tzOffsetMin`).
6. Feasibility output shape: `{ taskId, shortfallMin, suggestions[] }`.
7. Public HTTP contract preserved (new fields only added: `reason`, `insights`).

## Acceptance properties

- **Variety** — no same-mode run > `varietyFloorN` within a continuous
  stretch (a gap > 45 min ends a run).
- **Energy fit** — high-load work lands in higher-energy hours than low-load
  work on days that have both.
- **No front-loading** — loose-deadline work spreads; small tasks level out.
- **Real sittings** — no block under 20 min on a task that isn't tiny.
- **Rest** — no more than ~100 min of work without a break; no heavy quest
  straight into another.
- **Minimal-perturbation reflow** — a no-change replan moves 0 blocks.
- **Determinism** — same inputs → identical schedule.
- **Performance** — 7-day horizon, dozens of tasks, < 50 ms typical.

## Scenario lab (`server/scripts/scenario-lab.ts`, `npm run lab`)

Runs the real pipeline (adapter → dailies → calendar → generate/replan) on
realistic weeks for an IB student with ADHD and grades each plan: invariants,
silent slips (and pace for work due after the plan), slivers, blocks over 3 h,
same-quest runs, brain-killers back to back, work without breaks, energy fit
per day, late heavy work, momentum openers, reason variety. Plus live checks:
determinism, finishing early pulls the day forward, no-change replan moves
nothing, Not Today holds the quest to tomorrow but still before its test.

Scenarios: `week` (school on the calendar, student hours), `default-hours`,
`crunch` (16 h in 48 h), `one-giant`, `deadline-morning`, `routine`
(dailies), `many-small`, `live`. `npm run lab -- <id>` runs one and prints
its first day. As of 2026-09-26: 4 findings, all defensible (a 15-min email
at 15:55 tipping one day's energy average; crunch weeks with more heavy work
than peak hours).

## Population lab (`server/scripts/population-lab.ts`, `npm run lab:pop`)

Generates people from a seed: IB and uni students, office workers,
freelancers, parents, night owls, shift workers, overcommitters, minimalists,
procrastinators, newbies, in 15 timezones (half and quarter hours included),
with a calendar, routines, check-ins, Not Today, overdue and partly done
quests, and a true energy curve that may not match the configured one.

- **Static grading** of each first plan: invariants; an EDF oracle for how
  much deadline work could fit (`deadline-loss`); Moore–Hodgson for how many
  quests could be on time (`fewer-on-time`); `idle-while-short`;
  `false-infeasible`; empty or idle today; crowded and overloaded days;
  interleaving; tiny and huge blocks; breaks; energy against the person's
  real curve; routines clipped, dropped or misplaced; HIGH quests left out.
- **`--week`**: each person lives seven days the way the app works (the Feed
  replans on the first open of a day and after every focus session; routines
  are topped up; Not Today ends at midnight). People skip blocks, overrun
  estimates, finish when nearly there, and get surprise quests. A second,
  perfect-follower run, plus the best possible count for the week's starting
  deadlines, separates the planner's misses from the person's.
- Night-shift people (hours past midnight) are a separate population (`n0`,
  `n1`, …; 6% extra by default) simulated after everyone else, so ordinary
  people are unchanged: `--no-night-shift`, `--only-night-shift`, `--show n12`.
- Flags: `--n`, `--seed`, `--exact` (estimates are right), `--history`
  (12 finished quests calibrate estimates), `--show <i>` (one person, plan
  and week), `--debug` (triage and budgets), `--flag <name>`,
  `--examples <k>`. Old behaviour for A/B: `--clip`, `--no-morning-refresh`,
  `--no-chronotype`. New scheduler exports are imported optionally, so
  `git stash` the scheduler to measure a before on the same people.

Result on 2 000 people it was never tuned on (seed 7, `--week --history`),
before → after the 2026-09-26 changes: deadlines met 43.0% → 57.4%; perfect
follower 56.5% → 72.5%, or 68.4% → 89.3% of the best any plan could do
(97.5% with exact estimates, so the rest is estimation error); idle time
while a deadline was short 34.5% → 1.1% of people; fewer quests on time than
possible 46.6% → 14.8%; false "infeasible" 12.6% → 1.8%; mornings with
nothing planned today 20.7% → 4.5%. Plan time p50 1.2 ms, p95 6.4 ms.

Known and accepted: overcommitters see a heavy quest interleaved with lighter
ones (the variety rules); larks at school all day get heavy work in the
afternoon (there are no better hours); owls who don't set a chronotype still
get the office curve (learning it is on PLAN.md).
