# New member test cases

Walk-throughs of what a person who has never seen Focus Guild does in their
first ten minutes, written before launching to other people (2026-11-07).
Run them against a fresh account before each public release. Each case says
what the person does and what must be true; a case fails on the first "must"
that is not.

How to run them without touching the production database: see "Running
against a throwaway database" at the end.

## Who is visiting

- **Sam**, on a phone (375 px wide), has ADHD, has never heard the app's
  words (Route, Stragglers, Fuel check), and will leave if the first screen
  does not say what to do.
- **Kai**, on a laptop, uses only the keyboard (Tab, Enter, Esc, arrows).
- **Ren**, uses a screen reader (NVDA / VoiceOver) and needs every control
  named and every change announced.
- **Lee**, has low vision: browser zoom at 200 %, sometimes reduced motion on.

## The cases

### 1. First arrival (Sam)
1. Open the app signed in, with no quests.
2. Must: the first screen says in plain words what to do first (add a quest)
   and the way to do it is visible without scrolling.
3. Must: no word on the first screen needs the reader to already know the
   app (or it explains itself where it appears).
4. Must: nothing on the first screen is an error, a zero-filled dashboard
   or a red mark.

### 2. Jot a quest (Sam, Kai)
1. Type "Call the dentist" in the quick-add box and press Enter.
2. Must: the box is labelled (a screen reader names it), and pressing Enter
   adds it without a mouse.
3. Must: the quest appears in the list within a second, and the box is
   ready for the next one.
4. Must: typing "Write report 2h by fri" shows what the extra words mean
   before it is saved.

### 3. New quest with details (Kai, Ren)
1. Open "New quest" (button, or N).
2. Must: focus moves into the form; Tab stays inside the form; Esc closes it;
   focus returns to the button that opened it.
3. Must: every field has a visible label tied to its input.
4. Fill a title and an estimate, save. Must: the quest is in the list.
5. Must: saving with an empty title says what is missing next to the field.

### 4. Complete a quest (all)
1. Tick a quest.
2. Must: the tick fills at once, an XP message appears and is announced,
   and the quest leaves the active list.
3. Must: the tick control is named with the quest's title ("Complete
   Call the dentist"), not just "button".
4. Must: with reduced motion on, nothing large flies across the screen.

### 5. Not today, edit, delete (Sam, Kai)
1. Open a quest. Must: "Not today" is one action away.
2. Delete it. Must: no browser "Are you sure?" box; an Undo is offered and
   works; Undo is reachable by keyboard.

### 6. Fuel check (Sam)
1. Follow the prompt to the fuel check.
2. Must: it says what it is for in one sentence, the controls are labelled,
   and finishing it returns to where the person was.

### 7. Today's route (Sam, Kai)
1. With a few quests, open Route.
2. Must: the page says what it is (today's plan, in order) and what to do
   next; starting the first stop takes one action.
3. Must: an empty route says how to fill it.

### 8. Find your way around (all)
1. Visit every item in the navigation.
2. Must: each page has one h1 that matches the navigation label, and the tab
   title names the page.
3. Must: the current page is marked for a screen reader (aria-current).
4. Must: a keyboard user can skip past the navigation to the page.

### 9. Keyboard only (Kai)
1. From the top of Today, Tab through the whole page.
2. Must: every focused thing shows a visible focus ring.
3. Must: nothing that can be clicked is unreachable by Tab, and nothing
   unreachable takes focus.
4. Must: single-key shortcuts (N, ?) never fire while typing in a field.
5. Must: every dialog and sheet closes with Esc and gives focus back.

### 10. Screen reader (Ren)
1. Must: the page has landmarks (banner/navigation/main) and a heading
   outline that reads in order.
2. Must: every icon-only button has a name.
3. Must: toasts (XP, Undo, errors) are announced.
4. Must: no automated check (axe) reports a serious or critical problem on
   Today, Quests, Route, Fuel check, Settings, or with the quest editor open.

### 11. Phone, zoom and motion (Sam, Lee)
1. At 375 px wide: Must: no sideways scrolling on any page; every tap target
   is at least 44 px; dialogs open as bottom sheets.
2. At 200 % zoom on a laptop: Must: nothing is cut off or overlaps.
3. With reduced motion: Must: the moving scenery and confetti hold still.
4. Must: text contrast is at least 4.5:1 (3:1 for large text) on the default
   look.

### 12. When something goes wrong (all)
1. Stop the server and reload.
2. Must: the page says what happened in plain words and offers Try again.
3. Must: a failed save puts the screen back and says so.

## Running against a throwaway database

The local server normally talks to the production Neon database. For these
cases use an in-memory Postgres instead, so a fresh member exists and nothing
real is written:

1. In any scratch folder: `npm i @electric-sql/pglite @electric-sql/pglite-socket @prisma/adapter-pg@7.8.0 pg`.
2. Start PGlite on a port with the migrations in `server/prisma/migrations`
   applied in order (a 25-line script: `PGlite.create()`, `db.exec()` each
   `migration.sql`, then `new PGLiteSocketServer({ db, port }).start()`).
3. Start the server from a checkout with no `server/.env` and a preload that
   sets `globalThis.prisma` to a `PrismaClient` on `PrismaPg` (pool `max: 1`)
   before `src/db/client.ts` runs; it then never builds its Neon client:
   `LOCAL_PG_URL=postgresql://postgres@127.0.0.1:54329/postgres PORT=3091 CLIENT_URL=http://127.0.0.1:5191 npx tsx --import ./preload.mjs src/index.ts`.
4. Start the client with no `.env`: `VITE_API_URL=http://127.0.0.1:3091 npx vite --port 5191 --strictPort`.
5. Restarting PGlite gives a brand-new member again.

## Results

### 2026-11-07, before launch (branch `claude/website-accessibility-usability-1658f6`)
Run against a throwaway database, at 375, 320 and desktop widths, by
keyboard and by script; axe-core 4.10 on all 18 pages and with the quest
editor, the quest sheet and Route's stop card open.

**First run found**, and the change that fixed each:
- No `main` landmark, unnamed duplicate navs, no skip link; focus stayed on a link that had gone after a page change. Now: `<main id="main">`, named navs, a skip link, focus moved to the new page.
- No dialog took focus, kept Tab inside or gave focus back (quest sheet, editor, Dealer's choice, shortcuts help, hour logs, focus timer, level up, command palette, tracker sheet, Route's stop card). Now all use `client/src/lib/useDialog.ts`.
- A quest could not be opened from the keyboard (the row was a click-only `div`). The title is a button now.
- "Not today", a hard UX rule, had no button anywhere (the route and store were still there). It is in the quest sheet again.
- A brand-new member saw a greeting, three prompts with no order (plot an empty route, a "fuel check", a jot box) and a panel of zeros. Now a three-step guide that ticks itself, with the jot box inside step 1, and no zero-filled numbers until the first XP.
- The jot box dropped focus after every Enter (it was disabled while saving).
- The editor's fields were not tied to their labels (5 of 7), choice buttons had no pressed state, and an empty title gave a disabled button with no reason. Now labelled, pressed states, and "Give the quest a name first."
- Settings: 5 switches, 10 number and slider fields and 2 menus had no name.
- Fuel check had no way out but Save, and its slider had no label.
- Text below 4.5:1: locked trophies and unreached ranks (dimmed to 40 %), a rank colour used as text.
- Route had two h1s, a `<time>` with a forbidden `aria-label`, a menu without `aria-expanded` that did not close on Esc, and a link that reloaded the whole app.
- A bare "3.0" on every quest row; dates as "11/13/2026". The score is in the sheet as "Priority"; dates read "Fri, Nov 13".
- "Done today" turned over at UTC midnight (mid-afternoon in America).
- Server: `POST /quests/:id/complete` and `complete-daily` completed anyone's quest; `POST /users` skipped auth and returned any member's whole record (with the calendar token and token hash) for a Clerk id. Fixed; user responses no longer carry those two fields.

**Second run:** cases 1 to 11 pass. axe reports nothing on any page except
contrast on elements caught mid-fade: the in-app browser runs no animation
frames while its pane is hidden, so framer-motion exits and CSS transitions
freeze (rows that left stay on screen, a button stays at 50 %). Those were
checked by reading computed styles and the app's own store, not by eye.

**Not checked:** a real screen reader (NVDA / VoiceOver), a real phone,
reduced motion in a browser (checked in code: `MotionConfig
reducedMotion="user"`, confetti hidden, the scenes already hold still),
case 12 (server down), the Clerk sign-in screen, and 200 % zoom on a real
laptop (320 px reflow was checked instead).
