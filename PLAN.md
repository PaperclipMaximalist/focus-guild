# Focus Guild — Plan

The living roadmap: what's done, what's open, in priority order. Current
state and how to run everything: `FocusGuildInstructions.md` → "Current
Build Phase". History with hours: `WORKLOG.md`.

**Status 2026-09-26:** everything below "Done" is live in production
(`main` @ `5688211`).

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

---

## Still open

### Product, in priority order
1. **Personal energy curve.** The default curve is an office worker's, peaking 9–11. Learn it from check-ins (energy 1–5) and from when focus sessions actually happen and finish. The lab can grade the difference.
2. **Dailies longer than 60 min are silently clipped to 60** (`recurringToFillers` in `routes/schedule.ts`: a 3 h daily becomes 1 h). Honour the length, or say so in insights.
3. **Duplicate detection.** The dev account has every recurring quest twice, most likely from a double import. Warn on import or creation when the title matches and the duration is the same, and offer to merge.
4. **Replan on focus overrun** (a Bible promise). When a focus session runs 10+ min over, extend the block and compress or defer the lowest-priority rest of the day.
5. **Overdue quests** now surface via insights and Rescue; consider a one-tap "move all to tomorrow".
6. **Tracker one-line quick-add** (deferred from Phase 1): reuse the markdown line grammar, e.g. `EE intro > write one ugly paragraph @EE due:fri cas:c`.
7. **Calendar write-back via OAuth** (Google / Microsoft) and **Google Classroom** assignments, only if ICS links and the inbox aren't enough.

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
- Migrations are **idempotent**, because Railway runs `migrate deploy` on boot and a failing migration takes the server down.
