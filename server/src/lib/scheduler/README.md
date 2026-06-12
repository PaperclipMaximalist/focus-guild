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
  computeEnergyTrace, // drain-meter samples for the UI sparkline
  defaultConfig,
} from './scheduler';
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

- **`budget.ts`** decides *how much of each task lands on each day* so big
  tasks spread toward their deadline instead of front-loading day one.
- **`constructor.ts`** walks each day's free time in time order and picks
  the best task for each slot via a normalized scoring function
  (energy-fit, slack-gated urgency, mode-aware variety, session sizing).
  A beam (default width 3) keeps alternative partial days alive so one
  bad early pick can't ruin the day. A **variety floor** (default: max 2
  same-mode blocks in a row) is enforced at candidate-selection time —
  variety is a property of construction, not a post-hoc repair.
- **`reflow.ts`** handles edits with minimal perturbation: adding one
  quest never shuffles the rest of your day.

## Key concepts

- **Mode** `(category, loadTier, tediumTier)` — the variety axis. "Same
  task twice" is too narrow; what matters is same *flavor* of work.
- **Capacity vs drain** — `energyCurve(hour)` is time-of-day ability
  (drives slot selection); the drain meter is cumulative fatigue
  (drives the UI sparkline + over-stack guard). They are not the same
  thing and are kept separate.
- **No auto-break blocks** — gaps between work blocks ARE the breaks.

## Quality guarantees

- Pure + deterministic: same inputs → identical schedule (stable
  tie-breaks, no RNG).
- Tasks are never silently dropped — anything that can't fully fit
  before its deadline appears in `feasibilityReport` with the exact
  shortfall in minutes.
- `estimatedMinutes` is a constraint, not a weight: placed minutes equal
  `remainingMin` exactly, or the difference is reported.
- Locked + fixed + past blocks are never moved.
- All day-boundary math is in the user's timezone (`tzOffsetMin`).
- Performance: 12-task pool over a 7-day horizon plans in well under
  100 ms (typically < 50 ms).

## Tuning

Seven `ScoreWeights` knobs (see `config.ts: DEFAULT_SCORE_WEIGHTS`),
all surfaced in the Settings UI with plain-language labels. Each scoring
term is normalized to [0,1] before weighting, so the knobs are relative
importance ratios — no term can swamp the others. The tuning guide
lives in SCHEDULER_PSEUDOCODE.md.
