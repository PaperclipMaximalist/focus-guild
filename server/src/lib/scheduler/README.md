# Auto-Scheduler

A pure, deterministic scheduler that turns a list of deadline-driven tasks
into a minute-by-minute plan across a multi-day window — built so the
resulting days feel *varied and well-paced*, not just feasible.

This module is self-contained — no DB, no I/O, no Prisma. `adapter.ts`
maps Focus Guild `Quest`s into the `Task` shape it consumes;
`routes/schedule.ts` persists the resulting blocks.

**Full design doc: [SCHEDULER_PSEUDOCODE.md](./SCHEDULER_PSEUDOCODE.md)** —
pipeline diagram, every formula, every default, tuning guide. This README
is just the orientation page.

## Public API

```ts
import {
  generateSchedule,   // full clean build (Reflow Day, first load)
  replan,             // minimal-perturbation reflow for edits/inserts
  applyEdit,          // pure block-level edit (move/swap/delete/pin)
  explainBlock,       // "why is this block here?" → sentence
  whyFromNote,        // the stored plain-language "why now" of a block
  computeEnergyTrace, // drain-meter samples for the UI sparkline
  questsToTasks,      // Quest → Task (calibration, Not Today)
  placeDailyFillers,  // recurring quests → fixed blocks
  defaultConfig,
} from './scheduler';
// insights.ts: computeInsights, calibrateEstimates, suggestWorkingHours
```

- `generateSchedule(tasks, fixedBlocks, config, now) → { schedule, feasibilityReport }`
- `replan(currentSchedule, tasks, config, now) → { schedule, feasibilityReport }`
  — keeps past + locked + still-valid blocks exactly in place; fills gaps only.
- `applyEdit(schedule, edit) → schedule` — pure
- `explainBlock(blockId, schedule, tasks) → string`

## Architecture (budget → construct → reflow)

```
plan():   eligibility → budget.ts (per-day quotas, cross-day spread)
                      → constructor.ts (per-day timeline beam search)
                      → feasibility report
replan(): reflow.ts   (preserve everything still valid; plan() the gaps)
```

- **`budget.ts`** decides *how much of each task lands on each day*: whole
  sittings (never crumbs), paced against real deadlines even past the
  horizon, levelled so one day doesn't collect every chore, and a
  deadline-safety pass that can take time back from later-due work.
- **`constructor.ts`** walks each day's free time in time order and picks
  the best task for each slot via a normalized scoring function
  (energy-fit, slack-gated urgency, mode-aware variety, session sizing).
  A beam (default width 3) keeps alternative partial days alive so one
  bad early pick can't ruin the day. A **variety floor** (default: max 2
  same-mode blocks in a row) is enforced at candidate-selection time; when
  only same-mode work is left and the day has slack, it takes a reset
  break instead. It also rests per the break policy, keeps peak hours for
  heavy work (peak guard), and opens a heavy day with a 25-min starter push.
- **`reflow.ts`** handles edits with minimal perturbation: adding one
  quest never shuffles the rest of your day.

## Key concepts

- **Mode** `(category, loadTier, tediumTier)` — the variety axis. "Same
  task twice" is too narrow; what matters is same *flavor* of work.
- **Capacity vs drain** — `energyCurve(hour)` is time-of-day ability
  (drives slot selection); the drain meter is cumulative fatigue
  (drives the UI sparkline + over-stack guard). They are not the same
  thing and are kept separate.
- **Breaks are real** — the constructor rests per `breakPolicy` (10 after
  50, 30 after 3 h, a breather after any heavy sitting) and the budget
  reserves that time. Breaks are gaps, not blocks.
- **One job per layer** — the budget decides how much, the constructor
  decides order, the break policy decides rest.

## Quality guarantees

- Pure + deterministic: same inputs → identical schedule (stable
  tie-breaks, no RNG).
- Tasks are never silently dropped — anything due within the plan that
  can't fully fit appears in `feasibilityReport` with the exact shortfall;
  work due later gets its paced share and is not reported short. Overdue
  quests, routine crowding and undated backlog surface via `insights.ts`.
- `estimatedMinutes` is a constraint, not a weight: placed minutes equal
  `remainingMin` exactly, or the difference is reported.
- Locked + fixed + past blocks are never moved.
- All day-boundary math is in the user's timezone (`tzOffsetMin`).
- Performance: 12-task pool over a 7-day horizon plans in well under
  100 ms (typically < 50 ms).

## Test it like a user would

`npm run lab` (in `server/`) plans realistic weeks through the real pipeline
and grades them against the Project Bible. Run it before and after any change
here — see the end of SCHEDULER_PSEUDOCODE.md.

## Tuning

Eight `ScoreWeights` knobs (see `config.ts: DEFAULT_SCORE_WEIGHTS`),
all surfaced in the Settings UI with plain-language labels. Each scoring
term is normalized to [0,1] before weighting, so the knobs are relative
importance ratios — no term can swamp the others. The tuning guide
lives in SCHEDULER_PSEUDOCODE.md.
