# Brief for a line coder

> This is the brief the cabin corners were built from. `charm.ts` has since been replaced by `texture.ts` and `wall.ts`: a new line needs `CODER_PROMPT_TEXTURE.md` and `CODER_PROMPT_ORNAMENTS.md` as well, and `TEXTURE.md` wins where they disagree.

Paste this to a coder agent, with `<id>` filled in. One coder builds one line.

---

You are building one visual theme (a "line") for Focus Guild, a dark-only day planner, inside an existing React + Vite + Tailwind v4 app. Work in this checkout and nowhere else:

`C:\Users\User\projects\focus-guild\.claude\worktrees\ui-refresh`

Your line is **`<id>`**. A first version of it exists in `client/src/lines/<id>/` and was rejected by the owner as "just a different colorway": too dim, too plain, nothing of the reference pictures in it. You are rebuilding it so that it is unmistakably its own place. Read these, in this order, before writing anything:

1. `design/lines/CONTRACT.md` — the rules, including what changed and why. They are not suggestions.
2. `design/lines/briefs/<id>.md` — your art direction. The decisions in it are made; do not reopen them.
3. The reference stills your brief lists, in `design/lines/sources/`. Open each one with the Read tool and study it: the colours, the light, the materials, the objects. Your work will be judged on whether it feels like it came from that world. Never reproduce a character, logo, lettering or whole composition.
4. `client/src/lines/types.ts` (the `Layers` shape, `Paint`, `Frame`, `SceneFrame`), then the current files in `client/src/lines/<id>/`.
5. `client/src/index.css`: the `@theme` block and the `@layer components` block.

Then make `client/src/lines/<id>/` contain: `index.ts`, `tokens.css`, `frame.css`, `scene.ts`, `charm.ts`, `backdrop.ts`. `index.ts` imports the two stylesheets and the three canvases and default-exports a `Line` with `scene`, `charm` and `backdrop` set (see `types.ts`), keeping `id`, taking `name`, `journey`, `windowHint` and `order` from the brief, and `swatch` equal to `[bg, surface, primary]` from your tokens.

## Things that will save you a round

- Colour is wanted. The view through the window should be about as bright and saturated as the still. Only the cabin's own surfaces are dark.
- Texture is wanted, and it is free: `back` and `front` are painted once. Write a small stipple helper (many 1 px dots from `rnd`, denser where a surface is in shadow or where the still has grain) and use it on every large surface.
- `front` is painted on a clear sheet. Leave the window opening unpainted and the layers behind show through it. To cut a rounded opening, paint the wall as a path with the opening as a hole (`ctx.fill('evenodd')`), or paint the wall in pieces around it.
- Draw anything organic or vehicle-like with curves (`quadraticCurveTo`, `bezierCurveTo`, arcs) and considered proportions. Boxes with bits stuck on read as toys.
- Count with objects, never with indicators: no hollow placeholders. Zero done draws nothing.
- Nothing that moves may cross the words (top-left on a wide window, the whole top on a phone).
- Small things vanish at 1x. Judge them in the `-2x` close-ups, and check every small object in `window-phone-2x`.
- The checker rejects the bare words `window`, `document` and `Date` in canvas code. Name variables `pane` or `opening`, not `window`.
- In `frame.css`: a pseudo-element on `.board-sign` must be `position: absolute` or it becomes a flex item and pushes the title; the window's radius comes from `--radius-card` set on `.scene-window`; `.section-label` is not a hook.

## Limits

- Create and edit files **only** inside `client/src/lines/<id>/`. If something outside it looks wrong, say so in your report; do not change it.
- No git commands that change anything (no add, commit, stash, checkout, reset). No installing packages. Do not start or stop any server: the client dev server is already running on port 5173, and the screenshot tool needs nothing else (it answers the API from sample data).
- Another coder is rebuilding a different line in a sibling folder at the same time. Ignore their folder. If `npx tsc -b --noEmit` reports errors only in their folder, that is theirs; errors anywhere else, report.

## How to work

Run everything from `client/`. Build in this order, looking at pictures after each step:

1. **`scene.ts`**, the cabin corner. This is most of the work. `npm run line:shoot <id> scene` (about two minutes), then open `window-2x.png`, `window-away-2x.png`, `window-phone-2x.png` and the seven `scene-*.png` in `design/lines/shots/<id>/`. Compare `window-2x.png` side by side with your primary still: same world? Write down what is wrong before you fix it. Expect five or more rounds here.
2. **`charm.ts`**. Look at `charm-2x.png`, `charm-idle-2x.png`, `charm-short-2x.png`.
3. **`frame.css`** and any token changes, then **`backdrop.ts`**. Run the full `npm run line:shoot <id>` and look at `today-1280`, `today-375`, `today-1600`, `route-1600`, `quests-1280`, `settings-1280`.
4. Go through the eight questions at the end of the contract and the checklist in your brief, honestly.
5. Finish with `npm run line:check <id>`, `npx tsc -b --noEmit` and `npx eslint src/lines/<id>` all clean, and a final full `npm run line:shoot <id>`.

If a screenshot prints "WARN … did not load; this is night", your line failed to import: fix the error (run tsc) and shoot again.

## Report

When done, reply in under 250 words:

- What the window shows, in two sentences, and what the charm is.
- A table: each state (away, arriving, stopped, caution, departing, passing, done, progress, companion) and what it looks like in the window and in the charm.
- Anything you did differently from the brief, and why.
- The last output line of `npm run line:check <id>`.
- What you think is still weakest. Be specific; this is the part I need most.
