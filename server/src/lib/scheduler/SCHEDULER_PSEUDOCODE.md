# Auto-Scheduler — Algorithm Pseudocode, Math & Tuning Knobs

Single-file reference for tuning, testing, and reasoning about the scheduler.
Every weight, threshold, hard constraint, and tie-break rule is explicit here.

If a value disagrees with the code, **the code is the source of truth** —
update this doc.

---

## 0. Notation

- `ε = 1e-6` (avoid division by zero)
- All times in ms-epoch unless noted.
- `dur(b) = (b.end − b.start) / 60_000` minutes.
- `hour(t) = new Date(t).getHours()` — local hour, integer 0..23.
- `clamp(x, lo, hi) = min(max(x, lo), hi)`.
- "Recent work tasks" = last ≤ 3 work blocks scheduled (excluding breaks),
  newest first.

---

## 1. Inputs

```
Task {
  id, name
  remainingMin, totalMin
  deadline           : ms-epoch
  tediousness        : 0..1
  cognitiveLoad      : 0..1
  importance         : 0..1
  setupCost          : 0..1
  minChunkMin
  maxChunkMin
  category           : string
  preferredHour      : 0..23 | null
  dependencies       : taskId[]
  createdAt          : ms-epoch
  lastWorkedAt       : ms-epoch | null
  status             : "pending" | "in_progress" | "done"
}

UserConfig {
  weights         : Weights
  energyCurve     : hour → 0..1
  breakPolicy     : { shortBreakAfterMin, shortBreakDurationMin,
                      longBreakAfterMin,  longBreakDurationMin }
  workingHours    : { startHour, endHour }
  horizonDays     : number
}
```

---

## 2. Default tuning knobs

### 2.1 Weights

| Name | Default | Purpose | Raise to… | Lower to… |
| ---- | ------- | ------- | --------- | --------- |
| `urgency`       | **3.0** | Deadline pressure dominates everything else | aggressive deadline chasing | flatter prioritization |
| `staleness`     | **0.4** | Surface long-neglected tasks | reduce "always works on new stuff" drift | ignore stale tasks |
| `timeFit`       | **0.8** | Match tasks to `preferredHour` | honor user's hour preferences hard | ignore preferences |
| `energyFit`     | **1.0** | Match cognitive load to energy curve | strongly bias deep work to peaks | ignore energy curve |
| `chunkFit`      | **1.0** | Reward chunks near `maxChunkMin`, esp. high `setupCost` | prefer fewer, longer blocks | prefer fragmentation |
| `adjacency`     | **1.5** | Penalize tedious-after-tedious | strong anti-burnout sequencing | tolerate boring runs |
| `switch`        | **0.5** | Penalize category change vs prev work block | bias toward batching | tolerate context switching |
| `fragmentation` | **0.4** | Target **dynamic chunks/day** (see §3.8) | force the planner toward a steady cadence | allow chaotic dispersion |
| `oversize`      | **1.2** | Penalize blocks > `softMaxBlockMin` (1.5h default) | enforce the 1.5h cap harder | allow long marathon blocks |

### 2.2 Break policy

| Knob | Default |
| ---- | ------- |
| `shortBreakAfterMin`     | 50 |
| `shortBreakDurationMin`  | 10 |
| `longBreakAfterMin`      | 180 |
| `longBreakDurationMin`   | 30 |

### 2.3 Working hours

| Knob | Default |
| ---- | ------- |
| `startHour` | 9 |
| `endHour`   | 18 |
| `horizonDays` | 7 |
| `softMaxBlockMin` | **90** (1.5 h) — soft cap on a single work block |

### 2.4 Energy curve anchors (piecewise-linear interpolation)

| Hour | Value | Hour | Value | Hour | Value |
| ---- | ----- | ---- | ----- | ---- | ----- |
| 0    | 0.05  | 12   | 0.70  | 18   | 0.60  |
| 6    | 0.30  | 13   | 0.45  | 19   | 0.50  |
| 9    | 0.90  | 14   | 0.40  | 21   | 0.30  |
| 11   | 0.95  | 15   | 0.50  | 23   | 0.10  |
|      |       | 16   | 0.70  |      |       |
|      |       | 17   | 0.80  |      |       |

Linear between anchors. Below 0 or above 23 → 0.

### 2.5 Other constants

| Constant | Value | Used by |
| -------- | ----- | ------- |
| Urgency raw cap     | 5            | `min(load², 5)` |
| Staleness saturation | 30 days     | `ln(1+30)` denominator |
| Time-fit sigma       | 2 hours     | gaussian in `T` |
| Adjacency window     | 3 blocks    | `Σ_{i<3}` |
| Adjacency decay      | 0.6         | `0.6^i` |
| Fragmentation target | 2 chunks    | `(n−2)²/4` |
| Swap pass cap        | 10 passes   | Phase 3 |
| Preference K         | 3 moves     | soft learning |

---

## 3. Sub-score math

For task `t`, candidate block `b`, `now`:

### 3.1 Urgency (importance-modulated, multiplier-amplified)

```
slackMin    = (t.deadline − now)/60_000 − t.remainingMin
deadlineMin = max((t.deadline − now)/60_000, ε)
load        = t.remainingMin / deadlineMin
U_raw       = min(load², 5)
U           = U_raw / 5                            // 0..1
U_base      = U × (0.5 + 0.5 × t.importance)       // 0..1
U_eff       = U_base × t.urgencyMultiplier         // can exceed 1.0
```

**Per-task `urgencyMultiplier`** (default 1.0; range ~0.5..3.0): a manual
knob the user attaches to a quest in the QuestModal. >1 boosts (rush
deadline overrides), <1 dampens. Tasks with `urgencyMultiplier ≥ 1.5`
get two additional perks:
  - the 1.5h soft cap on block size is lifted (long marathon allowed)
  - the oversize penalty is dampened (§3.10)

**Hard constraint:** if `slackMin < 0` the task is excluded from the slot,
*unless no other candidate exists* — in which case it is placed and
recorded in the feasibility report.

### 3.2 Staleness

```
days = max(0, (now − t.createdAt) / (1000·60·60·24))
S    = clamp( ln(1 + days) / ln(31), 0, 1 )
```

### 3.3 Time-of-day fit

```
if t.preferredHour is null: T = 1
else:                       T = exp( −(hour(b.start) − t.preferredHour)² / 8 )
```
(σ = 2 → 2σ² = 8 in the denominator.)

### 3.4 Energy fit

```
E = clamp( 1 − |t.cognitiveLoad − energyCurve(hour(b.start))|, 0, 1 )
```

### 3.5 Chunk fit

```
ratio = min(1, dur(b) / max(t.maxChunkMin, ε))
C     = clamp( ratio × (1 + t.setupCost) / 2, 0, 1 )
```

**Hard constraint:** if `dur(b) < t.minChunkMin` → exclude.

### 3.6 Adjacency (windowed tediousness, anti-burnout)

```
prev3 = recentWorkTasks[0..2]          // newest first
acc   = Σ_{i=0..min(2,len-1)}  prev3[i].tediousness × 0.6^i
A     = clamp( t.tediousness × acc / 2, 0, 1 )
```

### 3.7 Context-switch penalty

```
X = 1  if  prevTask != null AND prevTask.category != t.category
X = 0  otherwise
```

### 3.8 Fragmentation (dynamic target)

The fragmentation target adapts to **how much work is left vs how long
until the deadline**. This implements the user's request: "steady amount on
a single topic, unless many hours remain and the deadline is closing in,
in which case allow more blocks per day."

```
TYPICAL_CHUNK_MIN = 60
daysLeft   = max(1, (t.deadline − now) / 1 day)
needPerDay = t.remainingMin / daysLeft
target     = clamp( round(needPerDay / TYPICAL_CHUNK_MIN), 2, 6 )

n = chunks of t already scheduled today
F = clamp( (n − target)² / 4, 0, 1 )
```

Behavior:
- A comfortable task (3h remaining, due in 7 days) → `target = 2` →
  steady cadence preferred.
- A crunched task (10h remaining, 2 days left → ~5h/day needed) → `target ≈ 5`
  → planner happily places multiple blocks per day.
- Static fallback when `now` is not supplied: `target = 2`.

### 3.9 Oversize penalty (1.5-hour soft cap)

The user explicitly does not want work blocks longer than **1.5 hours**
unless special circumstances. This penalty + a runtime chunk-size clamp
in the planner together enforce that.

```
softMaxBlockMin = config.softMaxBlockMin    // default 90
if dur(b) ≤ softMaxBlockMin: O = 0
else:
    over          = dur(b) − softMaxBlockMin
    raw           = clamp(over / softMaxBlockMin, 0, 1)
    setupRelief   = (t.setupCost ≥ 0.7) ? 0.5 : 0
    rushRelief    = (t.urgencyMultiplier ≥ 1.5) ? 0.5 : 0
    O = clamp( raw × (1 − min(setupRelief + rushRelief, 0.85)), 0, 1 )
```

**Planner-level clamp** (planner.ts §4.2): when a task is *picked* for a
block, its effective `maxChunkMin` is also clamped to `softMaxBlockMin`
unless `setupCost ≥ 0.7` *or* `urgencyMultiplier ≥ 1.5`. This means the
1.5h cap is enforced not just via the score but as a hard chunk-size
ceiling.

**Special circumstances** that lift the cap:
1. **High setupCost (≥ 0.7)** — task hates being interrupted; long warmup.
2. **High urgencyMultiplier (≥ 1.5)** — the user marked it as a rush.

### 3.10 Composite

```
Score = + w.urgency       · U_eff
        + w.staleness     · S
        + w.timeFit       · T
        + w.energyFit     · E
        + w.chunkFit      · C
        − w.adjacency     · A
        − w.switch        · X
        − w.fragmentation · F
        − w.oversize      · O
```

---

## 4. Algorithm — pseudocode

```text
function plan(tasks, fixedBlocks, lockedBlocks, config, now):
    idGen   = makeIdGen(prefix="blk",
                        existingIds = ids(fixedBlocks) ∪ ids(lockedBlocks))
    skeleton = buildSkeleton(fixedBlocks, lockedBlocks, config, now, idGen)
    filled   = fillSchedule(skeleton, tasks, config, now, idGen)
    swapped  = if w.adjacency + w.switch > 0
                 localSwap(filled, tasks)
               else
                 filled
    report   = buildFeasibility(swapped, tasks, now)
    return { schedule: swapped, feasibilityReport: report }
```

### 4.1 Phase 1 — Skeleton

```text
function buildSkeleton(fixed, locked, config, now, idGen):
    out = sorted( fixed ∪ locked, by start )

    for day in 0 .. config.horizonDays − 1:
        dayStart = startOfDay(now + day · DAY)
        wStart   = max( setHour(dayStart, config.workingHours.startHour), now )
        wEnd     =      setHour(dayStart, config.workingHours.endHour)

        immovableToday = blocks in out overlapping [wStart, wEnd]
        freeIntervals  = subtract immovableToday from [wStart, wEnd]

        for each (s, e) in freeIntervals:
            layWorkAndBreaks(s, e, config, idGen, out)

    return sorted(out)


function layWorkAndBreaks(start, end, config, idGen, out):
    cursor                = start
    workSinceLongBreak    = 0
    while cursor < end:
        workMin = min(remaining, config.breakPolicy.shortBreakAfterMin)
        emit work block [cursor, cursor + workMin]
        cursor += workMin
        workSinceLongBreak += workMin
        if cursor >= end: break

        breakDur = (workSinceLongBreak >= longBreakAfterMin)
                     ? longBreakDurationMin
                     : shortBreakDurationMin
        if workSinceLongBreak >= longBreakAfterMin:
            workSinceLongBreak = 0
        emit break block [cursor, min(end, cursor + breakDur)]
        cursor = end of that break
```

### 4.2 Phase 2 — Fill

```text
function fillSchedule(skeleton, tasks, config, now, idGen):
    remaining   = map { task.id → task.remainingMin }
    chunksToday = map { (day, taskId) → count }
    recentWork  = []                       // newest-first, max 3
    prevTask    = null

    blocks = mutable copy of skeleton, sorted by start
    i = 0
    while i < len(blocks):
        b = blocks[i]

        if b is non-work, locked, or already filled:
            if b is work and has taskId: update recentWork, prevTask
            i += 1; continue

        candidates = []
        fallback   = null         // best slack<0 candidate, used only if no others
        for t in tasks:
            if remaining[t.id] <= 0:                continue
            if t.status == "done":                  continue
            if not all deps of t are "done":        continue
            if t.minChunkMin > dur(b):              continue
            if t.deadline <= now:                   continue
            result = scoreTask(t, ctx(b, prevTask, recentWork, chunksToday), config, now)
            if slackMin(t, now) < 0:
                if total > fallback.total: fallback = result
                continue
            candidates.push(result)

        pick = argmax candidates by total,
               then tie-break: earliestDeadline → highestImportance → lex(taskId)
        if pick == null: pick = fallback
        if pick == null:
            blocks[i] = {...b, type: "buffer"}; i += 1; continue

        chunk     = min(pick.task.maxChunkMin, remaining[pick.task.id], dur(b))
        chunkEnd  = b.start + chunk·60_000
        blocks[i] = {...b, end: chunkEnd, taskId: pick.task.id,
                     note: summarizeBreakdown(pick.breakdown)}
        remaining[pick.task.id] −= chunk
        chunksToday[day(b.start), pick.task.id] += 1
        recentWork.unshift(pick.task); recentWork = recentWork[0..2]
        prevTask = pick.task

        if chunkEnd < b.end:
            insert empty work block (chunkEnd, b.end) at i+1   // recurse next iter

        i += 1

    return blocks


function ctx(b, prevTask, recentWork, chunksToday):
    return {
      blockStart:           b.start,
      blockEnd:             b.end,
      prevTask:             prevTask,
      recentWorkTasks:      recentWork,
      chunksTodayByTaskId:  chunksToday[day(b.start)]
    }
```

### 4.3 Phase 3 — Local adjacent-swap

```text
function localSwap(schedule, tasks):
    for pass in 1..10:
        swapped = false
        for i in 0 .. len(schedule)−2:
            a, b = schedule[i], schedule[i+1]
            if not (both work AND not locked AND both have taskId
                    AND a.end == b.start AND a.taskId != b.taskId):
                continue

            aDur, bDur = dur(a), dur(b)
            ta, tb     = task(a), task(b)

            // chunk constraints after swap
            if tb.minChunkMin > aDur or ta.minChunkMin > bDur: continue
            if aDur > tb.maxChunkMin or bDur > ta.maxChunkMin: continue
            // deadlines after swap
            if ta.deadline <= b.end or tb.deadline <= a.end:   continue

            proposed = schedule with a.taskId ↔ b.taskId
            if totalPenalty(proposed) < totalPenalty(schedule):
                schedule = proposed; swapped = true

        if not swapped: break
    return schedule


function totalPenalty(schedule):
    sum over each work block, in order, of:
        adjacency penalty (using running last-3 window)
      + switch penalty (vs previous work block)
```

### 4.4 Phase 4 — Feasibility report

```text
function buildFeasibility(schedule, tasks, now):
    issues = []
    for t in tasks where t.status != "done" and t.remainingMin > 0:
        scheduled = sum of dur(b) for b in schedule
                      where b.type=="work", b.taskId==t.id, b.end <= t.deadline
        if scheduled + ε < t.remainingMin:
            shortfall = ceil(t.remainingMin − scheduled)
            issues.push({
                taskId: t.id,
                shortfallMin: shortfall,
                suggestions: [
                  "extend_deadline_by:" + shortfall + "m",
                  "reduce_scope_by:" + shortfall + "m",
                  "drop_lower_priority_task"
                ]
            })
    return { ok: len(issues) == 0, issues }
```

---

## 5. Replan semantics

```text
function replan(currentSchedule, tasks, config, now):
    past         = blocks with b.end <= now
    fixedFuture  = blocks where b.type == "fixed"  and b.end > now
    lockedFuture = blocks where b.locked == true   and b.end > now and not fixed
    // unlocked future blocks are dropped — planner refills them.

    // Subtract minutes already committed by locked future blocks.
    adjusted = tasks with remainingMin reduced by minutes locked-future blocks
               already commit to that taskId.

    result = plan(adjusted, fixedFuture, lockedFuture, config, now)
    return { schedule: past ∪ result.schedule (sorted), feasibilityReport }
```

**Invariants:**
1. Every `b` with `b.end <= now` is returned bit-for-bit identical.
2. Every `b` with `b.locked == true` is returned at the same `start`/`end`,
   `locked` still true.
3. Idempotent: `replan(replan(s, …), …) == replan(s, …)`.

---

## 6. Edits

```text
applyEdit(schedule, edit) — pure, returns new schedule:

  move_block(blockId, newStart)  → block shifted, locked=true, duration preserved
  swap_blocks(aId, bId)          → both shifted to each other's start, locked=true
  delete_block(blockId)          → block removed
  pin_block(blockId)             → locked=true
  unpin_block(blockId)           → locked=false
```

---

## 7. Soft preference learning (off by default)

```text
function suggestPreferredHour(history):
    group history by taskId
    for each group:
        if len < K=3: skip
        recent = last K moves
        if all (newHour − originalHour) have the same nonzero sign:
            emit suggestion { taskId,
                              suggestedHour: round(avg of recent.newHour),
                              basedOnMoves: K }
```

Caller must apply suggestions explicitly. Planner never auto-mutates
`preferredHour`.

---

## 8. Anti-burnout design notes

Three signals push back on burnout sequencing:

1. **Adjacency penalty A** — tedious-after-tedious is taxed; the 0.6-decay
   window means even three tedious tasks back-to-back get progressively
   harsher penalties.
2. **Context-switch penalty X** — discourages random hopping between
   categories, but is weighted low (`0.5`) so it doesn't override urgency.
3. **Fragmentation F** — keeps a task from being sprayed across the day in
   tiny shards; target of 2 chunks/day means at least one meaningful run.

Energy fit `E` is the positive counterpart: high-load tasks naturally
gravitate to peak-energy hours.

---

## 9. Multi-urgency

The scheduler treats **three independent urgency signals**:

1. **Deadline urgency** — `U_eff` — quadratic in `load = remaining/timeLeft`.
2. **Staleness urgency** — `S` — log-scaled in days since creation.
3. **User-time urgency** — `T` — gaussian preference for a specific hour.

These compose additively (with their own weights), so a task can be urgent
because the deadline is close, because it's been ignored for weeks, *or*
because we're currently inside its preferred hour — and all three stack.

---

## 10. Determinism & tie-breaking

All comparisons that could otherwise depend on insertion order use this
sequence:

```
prefer higher Score
prefer earlier deadline
prefer higher importance
prefer lex-smaller taskId
```

No randomness anywhere. `replan(replan(s)) == replan(s)`.

---

## 11. Testing checklist (what to verify when tuning)

- [ ] **Urgency monotonicity** — tightening the slack increases `U_eff`.
- [ ] **Importance modulation** — same load, higher importance → higher `U_eff`.
- [ ] **Adjacency ordering** — tedious-after-tedious scores lower than
       tedious-after-easy.
- [ ] **Switch ordering** — same-category adjacency scores higher.
- [ ] **Fragmentation** — `F(2) == 0`, `F(0) > 0`, `F(4) > 0`.
- [ ] **Hard exclude on minChunk** — task with `minChunkMin > dur(b)` skipped.
- [ ] **Hard exclude on slack** — task with `slackMin < 0` excluded unless
       no other candidate.
- [ ] **Feasibility report** — overcommit surfaces all shortfalls.
- [ ] **Locked preservation** — pinned/moved blocks survive replan exact.
- [ ] **Past untouched** — `b.end <= now` blocks are returned unchanged.
- [ ] **Idempotence** — two consecutive replans of unchanged input match.
- [ ] **Tie-break** — three tasks identical-but-different-deadlines → earliest
       deadline picked first.
- [ ] **Dependencies** — task with unfinished dep is not placed.
- [ ] **Urgency multiplier** — same load, `urgencyMultiplier=2` should yield
       2× the urgency contribution vs `urgencyMultiplier=1`.
- [ ] **Oversize penalty** — `O(60) = 0`, `O(120) > 0`, `O(180) > O(120)`.
- [ ] **Oversize mitigation** — `setupCost ≥ 0.7` halves the penalty; same for
       `urgencyMultiplier ≥ 1.5`.
- [ ] **Dynamic fragmentation** — task with 10h remaining and 2 days left
       should accept 5 chunks/day with zero fragmentation penalty.
- [ ] **Recurring quest injection** — recurring quests appear as `fixed`
       blocks and not as work blocks; XP fires via `/complete-daily`.

---

## 12. Tuning recipes

| Symptom                                  | Action                                |
| ---------------------------------------- | ------------------------------------- |
| Deadlines slip silently                  | raise `urgency` to 4.0; tighten chunks |
| Schedule feels too aggressive            | drop `urgency` to 2.0                 |
| Stale tasks never get worked on          | raise `staleness` to 0.8              |
| Constant context switching               | raise `switch` to 1.0                 |
| Brain-killer runs of tedious tasks       | raise `adjacency` to 2.5              |
| Tasks sprayed into 10 tiny chunks        | raise `fragmentation` to 0.8          |
| Deep work landing in afternoon slump     | raise `energyFit` to 1.5              |
| Preferences ignored                      | raise `timeFit` to 1.5                |
| Setup-heavy tasks getting short chunks   | raise `chunkFit` to 1.5               |
| Blocks keep landing > 1.5 hours          | raise `oversize` to 2.0, or lower `softMaxBlockMin` |
| One specific task needs a marathon block | give it `setupCost ≥ 0.7` *or* `urgencyMult ≥ 1.5` to lift the cap |
| Crunched task isn't getting enough blocks/day | raise its `urgencyMult` and verify deadline is correct; fragmentation target adapts automatically |
| Daily/recurring quest is missing from the feed | confirm Quest.isRecurring = true and not already done today |
