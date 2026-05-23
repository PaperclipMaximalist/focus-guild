# Auto-Scheduler

A pure, deterministic scheduler that turns a list of deadline-driven tasks into a minute-by-minute plan across a multi-day window.

This module is self-contained — no DB, no I/O, no Prisma. Build an adapter on top to feed it `Task`s derived from `Quest`s (and to persist the resulting blocks).

## Public API

```ts
import {
  generateSchedule, replan, applyEdit, scoreTask, explainBlock,
  defaultConfig, suggestPreferredHour,
} from './scheduler';
```

- `generateSchedule(tasks, fixedBlocks, config, now) → { schedule, feasibilityReport }`
- `replan(currentSchedule, tasks, config, now, options?) → { schedule, feasibilityReport }`
- `applyEdit(schedule, edit) → schedule` — pure
- `scoreTask(task, context, config, now) → { total, breakdown }` — pure
- `explainBlock(blockId, schedule) → string`

## Data model

A `Task` carries everything the scoring function needs: `remainingMin`, `deadline`, `tediousness`, `cognitiveLoad`, `importance`, `setupCost`, `minChunkMin`/`maxChunkMin`, `category`, `preferredHour`, `dependencies`, `createdAt`, `lastWorkedAt`, `status`. All "soft" attributes are 0..1.

A `Block` is `{ id, start, end, type, taskId, locked, note }` where `type ∈ {"work", "break", "fixed", "buffer"}`. `locked=true` means the planner must respect the block at its exact start/end.

## Scoring formulas

`ε` is a small constant to avoid division by zero. Each sub-score normalizes to ~0..1 before weighting.

| Symbol | Formula | Notes |
| ------ | ------- | ----- |
| U      | `min((remainingMin / max(deadline−now, ε))², 5) / 5` | Quadratic urgency; saturates. |
| U_eff  | `U × (0.5 + 0.5 × importance)`                       | Importance-modulated urgency. |
| S      | `clamp(ln(1+days_since_created) / ln(31), 0, 1)`     | Log-scaled, saturates ~30 days. |
| T      | `exp(−(hour − preferred_hour)² / 8)`                 | σ=2 gaussian. `1` if no preferred hour. |
| E      | `1 − |cognitive_load − energy_curve(hour)|`          | Curve provided in config. |
| C      | `clamp(min(1, dur / maxChunk) × (1 + setupCost) / 2, 0, 1)` | Hard exclude if `dur < minChunk`. |
| A      | `clamp(tediousness × Σ_{i<3} prev_i.tediousness × 0.6^i / 2, 0, 1)` | Windowed; newest first. |
| X      | `1` if category changed, else `0`                    | Context-switch penalty. |
| F      | `clamp((chunks_today − 2)² / 4, 0, 1)`               | Targets 2 chunks/day. |

**Composite**

```
Score = w_urgency·U_eff + w_staleness·S + w_time_fit·T + w_energy_fit·E + w_chunk_fit·C
      − w_adjacency·A − w_switch·X − w_fragmentation·F
```

### Default weights

| Knob | Default |
| ---- | ------- |
| `urgency` | 3.0 |
| `staleness` | 0.4 |
| `timeFit` | 0.8 |
| `energyFit` | 1.0 |
| `chunkFit` | 1.0 |
| `adjacency` | 1.5 |
| `switch` | 0.5 |
| `fragmentation` | 0.4 |

### Tuning guide

- **Urgency feels too aggressive?** Drop `urgency` to 2.0 or 1.5. The default treats deadlines as the dominant signal.
- **Schedule feels stale (oldest tasks ignored)?** Bump `staleness` to 0.8.
- **Too many context switches?** Raise `switch` from 0.5 to 1.0+ to prefer category continuity.
- **Brain-killer back-to-back tedious tasks?** Raise `adjacency` to 2.0+.
- **Tasks getting sprayed across the day in tiny chunks?** Raise `fragmentation`.
- **Want long, deep focus blocks?** Raise `chunkFit` and decrease `minChunkMin` only on light tasks.

The energy curve is fully user-overridable. The default is a two-peak (high 9–11, dip 13–15, recovery 15–17, decline after 19).

## Algorithm

1. **Skeleton** — Mark working hours, insert fixed + locked blocks, insert breaks per `breakPolicy`.
2. **Fill** — For each empty work slot in chronological order, score all eligible tasks, pick `argmax(Score)`. Tie-break: earliest deadline → highest importance → lex `taskId`. Place a `chunk = min(maxChunk, remaining, blockDuration)`. If leftover time, split and continue.
3. **Local swap** — Adjacent non-locked work blocks may swap up to 10 passes if the swap reduces total adjacency + switch penalty without violating deadlines or chunk bounds.
4. **Feasibility report** — Any task whose scheduled minutes before its deadline are less than `remainingMin` is reported with a shortfall and remediation suggestions.

### Replan behavior

- Past blocks (end ≤ now) are never altered.
- Locked blocks stay at their exact `start/end`.
- All other future time is rebuilt.
- Idempotent: replanning an untouched schedule yields the same schedule.

### Soft preference learning (stub, off by default)

`suggestPreferredHour(history)` returns one suggestion per task that has been moved K=3 consecutive times in the same direction. The caller must apply suggestions explicitly — the planner never auto-updates `preferredHour`.

## Quality guarantees

- Scoring functions are pure and unit-tested.
- No randomness; determinism is enforced by the tie-break and stable sort.
- Locked blocks are never moved by the planner.
- Tasks are never silently dropped — failures appear in `feasibilityReport`.

## Where this fits

This is the auto-scheduler for Focus Guild's Guild Feed. A Quest→Task adapter (not part of this module) maps `Quest.estimatedMinutes / mentalLoad / impact` plus user-configured fields (tediousness, category, etc.) into the `Task` shape this module consumes. Daily recurring "filler" quests are expected to be pre-placed as `fixed` blocks by a separate module.
