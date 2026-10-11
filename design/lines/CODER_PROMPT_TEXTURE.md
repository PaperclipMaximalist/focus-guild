# Brief for a materials coder

Paste this to a coder agent, with `<id>` filled in. One coder does one line.

---

You are giving one visual theme (a "line") of Focus Guild its materials and its small movements. Focus Guild is a dark-only day planner: an existing React + Vite + Tailwind v4 app. Work in this checkout and nowhere else:

`C:\Users\User\projects\focus-guild\.claude\worktrees\ui-refresh`

Your line is **`<id>`**. The owner has rejected the themes three times, the last time with: "they all still look kinda the same. I don't want a random image to fill space, I want texture and pattern. Look back at the inspiration images and see what they had. Small animations as well." Flat dark boxes with a tint are what failed. Your job is to make every surface of this line out of a material, and to make a few small things move.

Read these, in this order:

1. `design/lines/TEXTURE.md`, all of it. It says what to build, the rules, how to check, and **your line's kit** under "The kits". The choices in your kit are made; do not reopen them.
2. `client/src/lines/types.ts`: `Tile`, `wrapped`, `Textures`, `Sprite` (with `frames`), `Layers`, `Frame`.
3. The worked example, the Timber Line: `client/src/lines/sleeper/texture.ts`, `wall.ts`, `backdrop.ts`, `tokens.css`, `index.ts`, and in `ornaments.ts` the pieces `garland`, `horizontal`, `crown`, `mark` and `rule`. Then open `design/lines/shots/sleeper/quests-1280.png`, `today-1280.png`, `today-375.png`, `kit-2x.png`. That is the standard: you could name that line from a thumbnail.
4. Your line's reference still, named in your kit, in `design/lines/sources/`. Open it at full size and look at what its surfaces are made of.
5. Your line's own `client/src/lines/<id>/scene.ts` and `ornaments.ts`, for its colours and the way things are drawn: the materials must look like the same hand drew them.

Then do what `TEXTURE.md` lists under "What a line supplies now", for your line.

## Things that will save you a round

- Start with `tokens.css` and `texture.ts` and photograph at once: the panel tile decides whether text is readable, and everything else follows from it.
- A tile is painted at twice its size, so a 0.5 px rect is one real pixel. Stipple with 1 px rects; draw fine lines at `Math.floor(y) + 0.5`.
- Stipple is cheap and is what makes these look drawn rather than rendered. Two or three thousand dots in a tile is fine.
- The tile shows a seam when a random element sits near an edge and you forgot `wrapped`. Put *everything* random inside it.
- In `wall.ts`, keep particles in the state returned by `layout`, advance them only when `moving`, and wrap them at the edges. Use `globalAlpha` for faintness and set it back to 1.
- The checker rejects the bare words `window`, `document` and `Date` in canvas code, and gradients, shadows, text and images. It requires `texture.ts` to mention `panel`, `wall`, `accent` and `wrapped`; `wall.ts` to read `boarding` and `moving`; and `ornaments.ts` to mention `crown`, `frames` and `seconds`. Each canvas file must open with a comment of a few lines saying what it shows.
- If a rule in `frame.css` sets a `background` on `.panel` that hides the tile, delete that rule.

## Limits

- Edit files **only** inside `client/src/lines/<id>/`. If something outside it looks wrong, say so in your report; do not change it.
- No git commands that change anything. No installing packages. Do not start or stop any server: the client dev server is already running on port 5173.
- Another coder is doing a different line in a sibling folder at the same time. Ignore their folder; if `npx tsc -b --noEmit` reports errors only there, that is theirs.
- The account has a usage limit. Save your files often: if you are cut off, what is on disk is what survives.

## How to work

Run everything from `client/`.

1. `tokens.css`, `index.ts`, then `texture.ts`. `npm run line:shoot <id>` (about three minutes). Open `kit-2x.png` and `quests-1280.png`. Fix seams and anything hard to read before going on.
2. `backdrop.ts`. Shoot, look at `quests-1280.png` and `today-1600.png`.
3. `wall.ts`. Shoot `scene` only, look at `wall-2x.png` and `wall-caution-2x.png`.
4. `ornaments.ts`: tail out, crown in, frames on `mark`, `rule`, `crown`. Shoot `scene`, look at `kit-2x.png`.
5. Full shoot, go through the six questions under "How to check" in `TEXTURE.md`, and fix. Expect three or four rounds in all.
6. Finish with `npm run line:check <id>`, `npx tsc -b --noEmit`, `npx eslint src/lines/<id>` all clean for your folder, `npm run line:shoot <id> live` reporting no errors, and a final full shoot.

## Report

Reply in under 220 words:

- One line each for panel, wall, accent, the sidebar's movement, the backdrop, and each moving ornament: what you made.
- Anything you did differently from the kit, and why (including any colour you had to move).
- The last output line of `npm run line:check <id>` and the frames-a-second line from the live run.
- The two weakest things, and what is wrong with each.
