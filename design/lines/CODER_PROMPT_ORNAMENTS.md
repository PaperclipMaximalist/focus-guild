# Brief for an ornaments coder

Paste this to a coder agent, with `<id>` filled in. One coder paints one line's kit.

---

You are painting the small drawn things (borders, trims, symbols, little pictures) for one visual theme (a "line") of Focus Guild, a dark-only day planner, inside an existing React + Vite + Tailwind v4 app. Work in this checkout and nowhere else:

`C:\Users\User\projects\focus-guild\.claude\worktrees\ui-refresh`

Your line is **`<id>`**. Its window, sidebar object and backdrop are built and accepted. The owner's latest words: "I need small elements to be incorporated around the UI, I mean the borders, symbols, small pictures that are unique, maybe borders that aren't a single line and have more style." That is your job. Read these, in this order:

1. `design/lines/ORNAMENTS.md` — what the ten pieces are, how a frame is painted, what "more style" means, and **your line's kit** under "The kits". The choices in your kit are made; do not reopen them.
2. `client/src/lines/types.ts` — `Sprite`, `FramePiece`, `Ornaments`, `Paint`.
3. `client/src/lines/night/ornaments.ts` — a plain working example of the file's shape (it is a placeholder: far plainer than what you must make).
4. Your line's own `client/src/lines/<id>/scene.ts` and `charm.ts` — the colours and the way things are drawn there. Your kit must look like the same hand drew it: reuse its hex values, its stipple, its lit-edge highlights.
5. Open `design/lines/shots/<id>/window-2x.png` and `charm-2x.png`, and the primary reference still named in `design/lines/briefs/<id>.md`, to remind yourself what the place looks like.

Then:

- Create `client/src/lines/<id>/ornaments.ts` with all ten pieces, opening with a comment that lists them and says what each is.
- In `client/src/lines/<id>/index.ts`, import it and add `ornaments` to the `Line`.
- In `client/src/lines/<id>/frame.css`, delete what the kit now replaces (see "What to remove from frame.css" in `ORNAMENTS.md`).
- If the surface's rounded corner pokes out from behind your square frame, lower `--radius-card` and friends in `tokens.css` (the Night Line has no `tokens.css`: there, draw corners that cover a 6 px radius).

## Things that will save you a round

- Write small helpers first: a pixel-rect, a line, a dot with a highlight, and a `fourCorners(p, slice, draw)` / `fourEdges(p, slice, edge, draw)` pair that rotate the canvas so you draw one corner and one edge and get all four.
- The tile for a frame is `slice * 2 + edge` px square. The edge stretch repeats, so its pattern's period must divide `edge` exactly. Pick `edge` to suit your pattern (16, 20, 24, 32, 40 and 48 are all fine).
- You are painting at 2x: a 0.5 px line is one real pixel. Use it for highlights and fine rules.
- Three or four tones per piece, with one lit edge. A single flat colour reads as a CSS border.
- The 14 px mark and the 24 px emblem are the hardest. Draw them as bold silhouettes first, then add one highlight.
- The checker rejects the bare words `window`, `document` and `Date` in canvas code, and it requires the words `panel`, `card`, `sign`, `vertical`, `horizontal`, `emblem`, `mark`, `rule`, `tail`, `spot` to appear (they will, as keys).

## Limits

- Edit files **only** inside `client/src/lines/<id>/`. If something outside it looks wrong, say so in your report; do not change it.
- No git commands that change anything. No installing packages. Do not start or stop any server: the client dev server is already running on port 5173.
- Another coder is painting a different line's kit in a sibling folder at the same time. Ignore their folder; if `npx tsc -b --noEmit` reports errors only there, that is theirs.
- The account has a usage limit. Save your file often: if you are cut off, what is on disk is what survives.

## How to work

Run everything from `client/`.

1. Write the whole kit, plainly, and get `npx tsc -b --noEmit` clean.
2. `npm run line:shoot <id> scene` (about two minutes), then open **`design/lines/shots/<id>/kit-2x.png`**: every piece on one sheet at twice its size. Go through the five questions under "Checking" in `ORNAMENTS.md`. Write down what is wrong before you fix it. Expect four or five rounds on this sheet.
3. When the sheet is right, run the full `npm run line:shoot <id>` and look at `quests-1280.png`, `route-1280.png`, `today-1280.png`, `today-375.png` (the trims on the phone's two bars) and `picker-1280.png`. Fix whatever only shows up in the real pages: a frame touching text, a trim that fights the nav, a tailpiece too loud.
4. Finish with `npm run line:check <id>`, `npx tsc -b --noEmit` and `npx eslint src/lines/<id>` all clean, and a final full shoot.

## Report

Reply in under 200 words:

- One line per piece: what you drew.
- Anything you did differently from the kit, and why.
- The last output line of `npm run line:check <id>`.
- Which two pieces are weakest, and what is wrong with each.
