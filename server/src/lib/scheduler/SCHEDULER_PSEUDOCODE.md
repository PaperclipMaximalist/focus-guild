# Focus Guild scheduler — design + pseudocode

The Focus Guild scheduler turns a pool of `Task`s into a `Schedule` (a
time-ordered list of `Block`s) that fills the user's working hours
across a configurable horizon. It runs purely; no DB, no network, no
global state. All knobs live on `UserConfig`.

If a value disagrees with the code, **the code is the source of truth** —
update this doc.

## Pipeline (high level)

```
                  ┌─────────────────┐
   tasks ────────▶│   eligibility   │
                  │   filter        │
                  └────────┬────────┘
                           │
                  ┌────────▼────────┐
                  │  budget.ts      │  Phase 0 — daily quotas
                  │  buildDayInfo   │  per-day capacity + free
                  │  allocateBudgets│  cross-day spread by priority
                  └────────┬────────┘
                           │ DayBudget[]
                  ┌────────▼────────┐
                  │ constructor.ts  │  Phase 1 — timeline-driven
                  │  constructDay   │  beam search (default beam=3)
                  │                 │  variety floor as candidate filter
                  └────────┬────────┘
                           │ blocks per day
                  ┌────────▼────────┐
                  │ planner.ts      │  Phase 2 — collect + report
                  │   plan()        │  feasibility shortfalls for any
                  │                 │  task that didn't fully fit
                  └─────────────────┘
```

For edits/inserts, the route layer calls `replan()` (= `reflow()`) which
preserves every still-valid existing block and only fills gaps. This is
the "minimal perturbation" path — see `reflow.ts`.

## File map

| File              | Purpose |
|-------------------|---------|
| `types.ts`        | `Task`, `Block`, `Mode`, `ScoreWeights`, `UserConfig`, etc. |
| `config.ts`       | Defaults: working hours, energy curve, score weights, horizon |
| `tz.ts`           | User-local day boundaries (`userMidnightUtc`, `userHourUtc`, …) |
| `adapter.ts`      | Prisma `Quest` → scheduler `Task` mapping |
| `budget.ts`       | `buildDayInfo`, `allocateBudgets` — Phase 0 |
| `constructor.ts`  | `constructDay` — beam search within a day, Phase 1 |
| `planner.ts`      | `plan` entry point + all per-decision scoring primitives |
| `reflow.ts`       | Minimal-perturbation reflow for edits — drives `replan()` |
| `replan.ts`       | Public entrypoints: `generateSchedule()`, `replan()` |
| `edits.ts`        | Pure `applyEdit(schedule, edit)` — block-level operations |
| `explain.ts`      | Translate dominant-term notes into sentences |
| `dailyFiller.ts`  | Pre-place recurring quests as `fixed` blocks |
| `preferences.ts`  | (unused) historical-pattern learning stub |

## The per-decision scoring (placementScore)

Each candidate placement gets one composite score. Every term is
normalized to roughly `[0, 1]` (or `[-1, 0]` for penalties) BEFORE
multiplication by its config weight, so no single term can dominate.
That was a real bug pre-revamp: `earliness = 1/hoursFromNow` returned
~1.0 for near-term slots vs ~0.02 for far slots, drowning all other
considerations.

```
blockScore =
    + w_energy   · energyFit          ∈ [0, 1]
    + w_urgency  · urgencyFit         ∈ [0, 1]
    + w_batch    · batchBonus         ∈ [0, 1]
    − w_monotony · monotonyPenalty    ∈ [0, 1]
    − w_tedium   · tediumClash        ∈ {0, 1}
    − w_cooldown · cooldownClash      ∈ {0, 1}
    − w_session  · sessionSizePenalty ∈ [0, 1]
```

Each term, pinned by unit tests in `scoring.test.ts`:

| Term                | Idea                                                       | Default weight |
|---------------------|------------------------------------------------------------|----------------|
| `energyFit`         | `1 − |task.cognitiveLoad − energyCurve(hour)|`             | 1.5            |
| `urgencyFit`        | `exp(−slack / max(remainingMin, 60))` × tier-mult          | 2.0            |
| `batchBonus`        | +0.5 if short admin/comms chained with same category       | 0.5            |
| `monotonyPenalty`   | `min(1, (runLen − 1)² / 4)` on same-mode run length        | 1.5            |
| `tediumClash`       | 1 iff both this and prev are high-tedium                   | 0.8            |
| `cooldownClash`     | 1 iff both this and prev are high-cognitive-load           | 0.8            |
| `sessionSizePenalty`| distance from `idealSessionRange(task)`                    | 0.5            |

`Mode = (category, loadTier, tediumTier)` where load/tedium bucket 0–1
into `low / med / high`. This is the variety axis — "same task" is too
narrow; "same flavor of work" is what matters.

`idealSessionRange(task)` scales with task size:

| `remainingMin` | ideal range |
|----------------|-------------|
| ≥ 180 (big)    | 30..90 min  |
| ≥  60 (medium) | 20..60 min  |
| <  60 (small)  | 10..remainingMin |

## Phase 0 — daily budgeting (`budget.ts`)

For each task, decide how much should land on each day.

```
build DayInfo[]:
  for each day in horizon:
    workStart = max(now, userHour(day, startHour))
    workEnd   = min(now + horizon, userHour(day, endHour))
    freeIntervals = working window minus immovable
    record total free minutes

allocate budgets:
  for each day in chronological order:
    residual = day.freeMinutes
    for each task in PRIORITY ORDER (priorityScore desc):
      if task.deadline < day.workStart: skip
      daysAvailable = days from this day through deadline day, capped to horizon
      perDayWant   = ceil(remainingForTask / daysAvailable)
      grant        = min(perDayWant, softMaxPerDay, residual, remainingForTask)
      if grant >= 1:
        budgets[day] += { task, targetMin: grant }
        residual -= grant
        remainingForTask -= grant
```

`softMaxPerDay = 3 × idealSessionHi(task)`. A 180-min "big" task with
ideal session 90 can claim up to 270 min/day — enough to make progress,
not so much that one task eats the whole day.

`priorityScore = 4·urgency² + 2·impact + 1·staleness + 3·tierBoost`
(see `planner.ts::priorityScore`). Used both here and as the tie-break
during construction.

## Phase 1 — within-day construction (`constructor.ts`)

For each day's `DayBudget`, run a bounded beam search. Each cursor
decision picks one of: place a candidate task, or skip the current
free interval.

```
state = { blocks: [], freeIntervals: day.free, remaining: budget.quotas, totalScore: 0 }
beam  = [state]
loop (up to 200 rounds — safety bound, usually << 20):
  next = []
  for state in beam:
    if state.freeIntervals empty: next.push(state); continue   # terminal
    candidates = enumerate eligible tasks at cursor
    if variety floor (runLen ≥ varietyFloorN) empties it: relax
    if still empty: skip the interval
    else:
      for each candidate: next.push(applyCandidate(state, c))
      next.push(skipInterval(state))    # always an option
  beam = top-k by totalScore
  if every state in beam is terminal: break
winner = beam[0]
annotate winning blocks with dominant-term notes for explain.ts
```

### Variety floor

At each cursor we count the same-mode run length ending immediately
before the cursor (`countSameModeRun`). A candidate is filtered out if
adding it would push that run beyond `varietyFloorN` (default 2). If
the filter empties the candidate list, we relax it — never leave a
slot empty just for variety's sake. The mode-based monotony penalty
in scoring still discourages near-monotony even when the floor relaxes.

### Why a beam?

Pure greedy can lock in early bad choices. Beam=3 keeps three partial
days alive, each one expanding on its own decisions, pruned every
round by cumulative score. Width 3 with no explicit lookahead is
empirically enough at this scale (5-task / 2-day generates in ~5 ms;
12-task / 7-day in ~50 ms).

Determinism: candidate sort is `(score desc, taskId asc)`; beam prune
keeps the same top-k for identical input every time.

## Reflow (`reflow.ts`) — the edit path

For edits, inserts, and quest CRUD that shouldn't shuffle existing
work: keep every still-valid block exactly in place. A block is
"stable" if:

- It's future + unlocked (past + locked + fixed handled separately).
- Its `taskId` still exists.
- The task isn't `done`.
- The block ends before the task's deadline.
- The task's dependencies are still met.

Stable blocks are passed to `plan()` as ADDITIONAL `lockedBlocks`, so
the constructor routes around them and only fills the freed gaps with
the leftover work. The "locked" flag is stripped back off in the
output so the client still sees them as user-editable.

This is why "I add one quest" doesn't shuffle the rest of the day.

## Energy meter (drain, not capacity)

Important distinction:

- **Capacity** (`energyCurve(hour)`): the user's time-of-day ability,
  consulted by `energyFit` during selection.
- **Drain meter** (`meterAt`): cumulative fatigue from placed work,
  rendered to the UI via `computeEnergyTrace()` and used as a soft
  guard against over-stacking high-load work late in the day.

They're complementary, not interchangeable. Confusing them was a bug
pre-revamp.

## Explain (`explain.ts`)

After beam selection, the constructor replays the winning sequence and
stashes a compact note on each block:

```json
{ "term": "energy", "sign": "+", "total": 2.84 }
```

`term` is the key of the largest-magnitude contribution to that block's
`placementScore`; `sign` tells us whether it was a positive or negative
pull. `explain.ts` reads this and produces a sentence like:

- `energy +` → "Your capacity is high right now — good fit for X."
- `urgency +` → "Deadline is close enough that X needed a slot soon."
- `monotony -` → "No better candidate fit; this extends a same-mode run."

The constructor doesn't compute the breakdown during beam exploration
(would be wasteful — most candidates lose). Only the winner gets
annotated.

## Hard invariants (test assertions)

1. Account for every active in-deadline quest.
2. `estimatedMinutes` is a constraint; placed minutes == `remainingMin`
   exactly, OR the difference shows up in the feasibility report.
3. Never schedule past a deadline.
4. Past + fixed + locked blocks preserved across `replan()`.
5. Work in the user's timezone (`tzOffsetMin`).
6. Feasibility output preserved: `{ taskId, shortfallMin, suggestions[] }`.
7. Public HTTP contract preserved.

## Acceptance properties (Phase B + C tests)

- **Variety by construction** — no same-mode run > `varietyFloorN`.
- **Energy fit** — high-load tasks land in higher-capacity hours on
  average than low-load tasks.
- **No front-loading** — a loose-deadline task spreads across days.
- **Minimal-perturbation reflow** — single edits don't ripple.
- **Determinism** — same inputs → identical schedule.
- **Performance** — 7-day horizon with 12-task pool < 100 ms.
