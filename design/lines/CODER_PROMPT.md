# Brief for a line coder

Paste this to a coder agent, with `<id>` filled in. One coder builds one line.

---

You are building one visual theme (a "line") for Focus Guild, a dark-only day planner, inside an existing React + Vite + Tailwind v4 app. Work in this checkout and nowhere else:

`C:\Users\User\projects\focus-guild\.claude\worktrees\ui-refresh`

Your line is **`<id>`**. Read these, in this order, before writing anything:

1. `design/lines/CONTRACT.md` — the rules. They are not suggestions.
2. `design/lines/briefs/<id>.md` — your art direction. The decisions in it are made; do not reopen them.
3. The reference images your brief lists, in `design/lines/sources/`. Open each one and look at it. They are for mood, light and shapes only.
4. `client/src/lines/types.ts`, then `client/src/lines/night/scene.ts` and `client/src/lines/night/index.ts` — the working example to match in structure and quality.
5. `client/src/index.css`, the `@theme` block and the `@layer components` block — the tokens you override and the hooks you may style.

Then create exactly four files in `client/src/lines/<id>/`: `index.ts`, `tokens.css`, `frame.css`, `scene.ts`.

## Limits

- Create and edit files **only** inside `client/src/lines/<id>/`. If something outside it looks wrong, say so in your report; do not change it.
- No git commands that change anything (no add, commit, stash, checkout, reset). No installing packages. Do not start or stop any server: the client dev server is already running on port 5173, and the screenshot tool needs nothing else.
- Another coder is building a different line in a sibling folder at the same time. Ignore their folder. If `npx tsc -b --noEmit` reports errors only in their folder, that is theirs; errors anywhere else, report.

## How to work

Run everything from `client/`. Get `npm run line:check <id>` passing early, then spend most of your effort on the pictures:

1. Write the four files.
2. `npm run line:check <id>` and `npx tsc -b --noEmit` until both are clean.
3. `npm run line:shoot <id> scene`, then open every PNG in `design/lines/shots/<id>/` and judge it against the seven questions at the end of the contract and the checklist in your brief. Write down what is wrong before you fix it.
4. Fix and repeat. Expect at least four rounds; the first picture is never the good one. Flat shapes look cheap when proportions are off, so adjust sizes and positions by eye, not by formula.
5. When the window is right, run the full `npm run line:shoot <id>` and look at `today-1280`, `today-375`, `route-1280` and `settings-1280`. Fix colours and frame.
6. Finish with all three commands clean.

## Report

When done, reply in under 250 words:

- What is outside the window, in two sentences.
- A table: each state (away, arriving, stopped, caution, departing, passing, done count, companion) and what it looks like.
- Anything you did differently from the brief, and why.
- The last output line of `npm run line:check <id>`.
- What you think is still weakest. Be specific; this is the part I need most.
