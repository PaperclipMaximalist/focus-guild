# The quest manifest, version 1

A manifest is many quests written down in one go. It exists so that quests can be
moved in bulk: typed as a list, written by an AI from a syllabus or a brain-dump,
exported from one account and imported into another.

It has two forms that mean the same thing:

- **Text**, for people and for chat: one quest per line. This is what the importer
  (`/quests/import`) takes and what Quickstart exports.
- **JSON**, for programs: the tree the API takes (`POST /manifest/import`) and
  gives back (`GET /manifest/export`).

| | Where |
|---|---|
| Line grammar (one quest) | `client/src/lib/quickAdd.ts` |
| Page grammar (steps, hour logs, quoting), writer, AI guide | `client/src/lib/manifest.ts` |
| JSON shape, rules, export | `server/src/lib/questImport.ts` |
| Routes | `server/src/routes/manifest.ts` |
| Screens | `client/src/pages/Quickstart.tsx`, `client/src/pages/QuestImport.tsx` |

Two rules hold everywhere. **Nothing is guessed:** a value that cannot be read is
dropped, the default applies, and the preview says so on that line. **All or
nothing:** an import is one transaction.

## Text form

```
focus-guild manifest 1
// Steps are indented under their quest
Finish chem IA 6h by 2026-10-15 21:00 !high #chem
  Analyse the data 2h load:hard
    Plot the graphs 45m
  Write the evaluation 1h30m
"Read 2h of lectures" 2h cat:deep
Piano practice track:hours #music logged:12h30m
Stretch 10m repeat:daily hour:7
```

### The page

| Rule | Detail |
|---|---|
| Header | `focus-guild manifest 1`. Optional. When present, nothing above it is read. A higher number than the app knows is read anyway, with a note. |
| One quest per line | Only the title is required. Blank lines are ignored. |
| Steps | A line indented further than the quest above it is a step of that quest. Any consistent indent works (two spaces is what the app writes; a tab counts as four). |
| Depth | Three tiers: quest, step, sub-step. A deeper line is kept at the third tier, with a note. The API refuses a fourth tier outright. |
| Comments | A line starting with `//`. |
| List markers | A leading `- `, `* `, `• ` or `1. ` is ignored, so a pasted list works. `- [ ] ` is ignored too; a line marked `- [x] ` is left out as already done. |
| Code blocks | If the text contains a ``` block, only the first block is read. An AI wraps its answer in a sentence or two, and those are not quests. The preview says how many lines were passed over. |
| Limit | 200 quests and steps per import. |

### A line

A line is a title and any number of settings, in any order, separated by spaces.
Whatever is not a setting is the title.

| Write | Sets | Values | Left out |
|---|---|---|---|
| `2h` | Estimate | `2h` · `1.5h` · `90m` · `1h30m` | 30m |
| `by 2026-10-15` | Deadline | `2026-10-15` · `oct 15` · `15 oct` · `fri` · `tomorrow`, then an optional time `21:00` · `9pm` | none; 17:00 when no time is given |
| `!high` | Priority | `!high` · `!med` · `!low` | med |
| `#tag` | Tag | letters, digits, `_` and `-`; repeatable | none |
| `load:4` | Mental load | 1–5, or `easy` · `mild` · `medium` · `hard` · `brutal` | 3 (medium) |
| `impact:8` | Impact | 1–10 | 5 |
| `cat:deep` | Category | `deep` · `comms` · `admin` · `creative` | deep |
| `hour:10` | Preferred hour | 0–23, or `7am` · `7pm` | no preference |
| `min:15` | Shortest session | 5m–8h | 15m |
| `max:50` | Longest session | 5m–8h | 50m |
| `tedious:70` | Tediousness | 0–100 (%) | 40 |
| `setup:30` | Setup cost | 0–100 (%) | 30 |
| `urgency:1.5` | Urgency multiplier | 0.5–3 | 1 |
| `repeat:daily` | Daily round | `daily` | one-off |
| `track:hours` | Hour log | `hours` | an ordinary quest |
| `logged:1h30m` | Time already spent | `45m` · `2h` · `1h30m` | none |

The first fourteen are the Jot bar's grammar and work there too. `track:hours`
and `logged:` belong to the manifest only.

Details that matter when writing one by machine:

- **Dates.** Write `by YYYY-MM-DD` or `by YYYY-MM-DD HH:MM` (24-hour). Times are
  local to the device doing the import. `10/15` is refused, because it is the 15th
  of October to some and the 10th of May to others. Words such as `fri` work but
  mean something different a week later, so a file should not use them.
- **Quoted titles.** A title in double quotes is taken exactly as written:
  `"Read 2h of lectures" 2h`. Use it when the title contains something that reads
  as a setting (a duration, `by` and a day, a `#` or `!` word, `word:value`).
  Inside quotes, `\"` is a quote mark and `\\` is a backslash. The app's own
  export quotes a title only when it would not survive bare.
- **Hour logs.** `track:hours` makes a quest with no estimate, for things with no
  finish line; time is written down as it is spent. It takes no duration (one is
  dropped, with a note), has no steps, cannot be a step, and cannot repeat daily.
- **Rounds.** `repeat:daily` has no steps and cannot be a step.
- **A quest with steps** needs no duration: its time is the sum of its steps.
- **Nothing is inherited.** A step does not take its quest's tags, category or
  deadline. Say them on the step if they apply.
- **A shortest session above 50m** needs a longest one beside it
  (`min:60 max:90`); alone it is dropped, with a note.

## JSON form

`POST /manifest/import`

```json
{
  "dryRun": false,
  "quests": [
    {
      "title": "Finish chem IA",
      "estimatedMinutes": 360,
      "deadline": "2026-10-16T04:00:00.000Z",
      "priorityTier": "HIGH",
      "tags": ["chem"],
      "steps": [
        { "title": "Analyse the data", "estimatedMinutes": 120, "mentalLoad": 8,
          "steps": [{ "title": "Plot the graphs", "estimatedMinutes": 45 }] },
        { "title": "Write the evaluation", "estimatedMinutes": 90 }
      ]
    },
    { "title": "Piano practice", "trackHours": true, "loggedMinutes": 750, "tags": ["music"] },
    { "title": "Stretch", "estimatedMinutes": 10, "isRecurring": true, "preferredHour": 7 }
  ]
}
```

| Field | Type | Text form |
|---|---|---|
| `title` | string, 1–280 | the title |
| `estimatedMinutes` | integer, 1–6000 | `2h` |
| `trackHours` | boolean | `track:hours` |
| `loggedMinutes` | integer ≥ 1 | `logged:` |
| `deadline` | ISO 8601 with offset | `by` |
| `priorityTier` | `LOW` · `MED` · `HIGH` | `!low` … |
| `tags` | up to 10 strings | `#tag` |
| `mentalLoad` | 1–10 (the text form's 1–5, doubled) | `load:` |
| `impact` | 1–10 | `impact:` |
| `category` | `deep_work` · `comms` · `admin` · `creative` | `cat:` |
| `preferredHour` | 0–23 | `hour:` |
| `minChunkMin`, `maxChunkMin` | 5–480 | `min:`, `max:` |
| `tediousness`, `setupCost` | 0–1 (the text form's percentage ÷ 100) | `tedious:`, `setup:` |
| `urgencyMult` | 0–5 | `urgency:` |
| `isRecurring` | boolean | `repeat:daily` |
| `steps` | array of the same, two levels deep at most | indented lines |

Unknown keys are refused, not ignored, so a misspelt field or a fourth tier is an
error with its path (`quests[0].steps[1]: …`) and not a quiet loss. The rules for
hour logs and rounds are the same as in the text form, and here they are errors.

`"dryRun": true` checks the manifest and answers with what it would make
(`wouldCreate` and the counts) without making anything. A program should send
that first.

The answer to a real import is `{ created, quests, steps, hourLogs, routines }`.

`GET /manifest/export` answers `{ quests, count }`: every unfinished quest with
its unfinished steps, oldest first, in the same shape, saying only what differs
from a quest made with a bare title. Finished quests are not exported.

## How a manifest becomes rows

- A quest is a row in `quests`; a step is a row whose `parentQuestId` is its quest.
- An hour log is a row with `estimatedMinutes = 0`, and `loggedMinutes` becomes
  its total (`actualMinutes`). `server/src/lib/hourLog.ts` owns that convention.
  The time it arrives with is not given an entry: an entry has a day, the
  manifest does not say which, and one stamped with the moment of the import
  would count as hours done today. So an imported log can show a total larger
  than the entries listed under it.
- On an ordinary quest `loggedMinutes` is progress: the planner subtracts it.
- Importing never updates or replaces a quest. Importing an export makes copies.

## What round-trips

Writing a tree as text and reading it back gives the same tree (tested in
`client/src/lib/manifest.test.ts`, and checked against a real account of 78
quests), with these known limits:

- Mental load is five levels in text and ten in storage. Odd stored values are
  rounded to the nearest level.
- A tag with characters outside letters, digits, `_` and `-` is not written.
- A stored shortest session above 50m with no longest is written with a longest
  equal to it.
- Deadlines are written in local time to the minute.

## Changing the format

Additions that old manifests do not use (a new setting, a new key) stay version 1.
Anything that changes what an existing manifest means is version 2: bump
`MANIFEST_VERSION`, keep reading version 1, and update the guide in
`manifestGuide()`, which is what an AI is given.
