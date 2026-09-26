# Focus Guild scheduler — design + pseudocode

The Focus Guild scheduler turns a pool of `Task`s into a `Schedule` (a
time-ordered list of `Block`s) that fills the user's working hours
across a configurable horizon. It runs purely; no DB, no network, no
global state. All knobs live on `UserConfig`.

If a value disagrees with the code, **the code is the source of truth** —
update this doc. Last rewritten 2026-09-26 after the scenario-lab overhaul
(commits `4e7de29`, `d3f3e50`, `5688211`).

**Before and after any change here, run `npm run lab`** (see the end of
this doc). It plans realistic weeks and grades them against the Project
Bible; it found far more than the unit tests did.

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
                  │  allocateBudgets│  whole sittings, pacing, levelling, repair
                  └────────┬────────┘
                           │ DayBudget[]
                  ┌────────▼────────┐
                  │ constructor.ts  │  Phase 1 — in what ORDER within the day
                  │  constructDay   │  beam search, breaks, variety, peak guard
                  └────────┬────────┘
                  ┌────────▼────────┐
                  │ planner.ts plan │  Phase 2 — collect + feasibility report
                  └────────┬────────┘
                  ┌────────▼────────┐
                  │ insights.ts     │  what the plan can't say by itself
                  └─────────────────┘
```

One job per layer: **the budget decides how much** work each day holds, **the
constructor decides the order**, **the break policy decides rest**. Most of
the bugs the lab found came from those jobs leaking into each other.

For edits/inserts, the route layer calls `replan()` (= `reflow()`) which
preserves every still-valid existing block and only fills gaps. This is
the "minimal perturbation" path — see `reflow.ts`.

## File map

| File              | Purpose |
|-------------------|---------|
| `types.ts`        | `Task`, `Block`, `Mode`, `ScoreWeights`, `UserConfig`, etc. |
| `config.ts`       | Defaults: working hours, energy curve, break policy, score weights, horizon |
| `tz.ts`           | User-local day boundaries (`userMidnightUtc`, `userHourUtc`, …) |
| `adapter.ts`      | Prisma `Quest` → `Task`; applies estimate calibration; NOT_TODAY → `notBefore` |
| `budget.ts`       | `buildDayInfo`, `allocateBudgets`, `minSitting`, `dueWithinPlan` — Phase 0 |
| `constructor.ts`  | `constructDay` — beam search within a day, breaks, peak guard — Phase 1 |
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
    free intervals = window minus immovable (fixed + locked) blocks
    after a fixed block ≥ 90 min, the next free time starts 20 min later
      (TRANSITION — nobody walks out of school straight into an essay)

capacity per interval = workableMin(length, breakPolicy)
  = length − floor(length / (on + off)) × off       # per interval, not a flat %
  (a lone 30-min gap needs no break and keeps all 30)

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

PASS 2 — deadline-safety repair (only tasks dueWithinPlan):
  fill from residual: whole sittings first, then any size ≥ 10 min
  still short → PREEMPT: take minutes back from grants of tasks due LATER,
    loosest first, never leaving the donor a crumb
  donors (due within plan) refill from what's left, same rules
```

`dueWithinPlan(task, days)` = no working day after the horizon before its
deadline. **Budget, repair and the feasibility report all use this one
definition** (they used to disagree by hours at the end of the week).

`priorityScore = 4·urgency² + 2·impact + 1·staleness + 3·tierBoost`
(`planner.ts::priorityScore`), used here and as a tie-break.

## Phase 1 — within-day construction (`constructor.ts`)

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
  score = placementScore + peakGuard

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

## Reflow (`reflow.ts`) — the edit path

A block is "stable" (kept exactly in place) if it is future + unlocked, its
task still exists and isn't done, it ends before the deadline, dependencies
are met, **and it doesn't overlap a fixed block** (a meeting synced after the
plan was made invalidates the work under it). Stable blocks go to `plan()` as
extra locked blocks; consumed minutes are subtracted from `remainingMin` and
recorded as `committedMin`. Replanning with nothing changed moves 0 blocks.

Calendar blocks are swapped for fresh ones on every replan (the route filters
`isCalendarBlock` out of the old schedule and adds the current events).

## Around the planner

- **Daily routines** (`dailyFiller.ts`): recurring quests become `fixed`
  blocks noted `Daily: <title>`, placed before quest work. With no
  `preferredHour`, time words in the title set one (`inferPreferredHour`:
  morning/breakfast → start, lunch/midday/noon → 12, afternoon → 14,
  evening/end of day/tonight/night/bedtime → last hour). When routines take
  at most half the day, each gets 10 min of space around it. Recurring quests
  longer than 60 min are clipped to 60 (known issue, see PLAN.md).
- **Calendar** (`../calendar`): busy, timed, non-cancelled ICS events become
  `fixed` blocks noted `Calendar: <title>`; synced every 15 min and before
  generate/replan when stale (4 s cap).
- **Not Today**: the adapter gives NOT_TODAY quests `notBefore` = the user's
  next midnight; the budget skips days before it. `reviveDeferred` flips them
  back to ACTIVE after that midnight. (It used to delete quests from the plan
  for good.)
- **Calibration** (`insights.calibrateEstimates`): the focus timer logs
  focused minutes to `actualMinutes`. From finished quests with logged time:
  the median actual/estimate, per category with ≥ 3 samples (≥ 5 overall),
  clamped 0.6–2.0, ±15% deadband. The adapter plans `estimate × multiplier`.

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
3. Never schedule past a deadline, or before `notBefore`.
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
its first day. As of 2026-09-25: 4 findings, all defensible (a 15-min email
at 15:55 tipping one day's energy average; crunch weeks with more heavy work
than peak hours).
