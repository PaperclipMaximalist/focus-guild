# What a line is, and what it must do

A **line** is one journey the app can be dressed as. Layout, words and features are identical on every line. A line is a folder:

```
client/src/lines/<id>/
  index.ts     name, one-sentence journey, swatch, and the imports below
  tokens.css   colours and corner radii
  frame.css    borders and patterns for the app's surfaces
  scene.ts     the cabin corner on Today: a wall, a window, what is outside it
  charm.ts     the line's one signature object, in the sidebar on every page
  backdrop.ts  texture, and a few drifting specks, behind the whole app
  ornaments.ts the small drawn things: frames, trims, a badge, marks, flourishes
```

`ornaments.ts` has its own guide, `ORNAMENTS.md`: what the ten pieces are, how a frame is painted, and each line's kit. Since it was added, `frame.css` is nearly empty on every line: the app draws frames and trims from the kit, and `frame.css` keeps only the sign's and button's shape and the window's radius.

Every line comes from what the reference stills share: **a seat by a window in a small, lived-in cabin, a table in front of you, and somewhere else going by outside.**

## What changed on 2026-10-10, and why

The first version of this contract kept everything dim and put all of a line's character in one small, quiet window. The owner's verdict on the result: "it's just a different colorway each time", "I wouldn't be able to tell the theme", "bring the app's vibes to life". So:

- **A line must be recognisable from any page with the window covered.** That is the test. Colours alone fail it.
- **The window is a picture, and may be as vivid as the still it comes from.** The cabin around it is dark; the world outside is lit. That contrast is the look.
- **The cabin's own things come into the app**: its luggage, lantern, crystal, rivets, planks. In the window's foreground, in the sidebar, and in the borders.
- **Small, slow movement is welcome** in three places: the window, the charm, the backdrop. Not inside panels, and never behind text.

## Rules that hold on every line

1. **Dark only.** The app's surfaces are dark on every line. Only the view through the window is bright.
2. **One accent, and it means "act here".** It fills the sign, the Start button and the active row. Red means late, green means on time, amber means attention, on every line.
3. **Drawn, not rendered.** Flat shapes. No fades, no blur, no glow, no soft shadows, no glass. Shade the way a printed comic does: stepped bands of flat colour, stipple (fields of small dots), hatching, a hard-edged highlight. A lamp's light is a flat pale shape, not a halo. This is what keeps five lines looking like one hand drew them.
4. **Type does not change.** Same three faces, same sizes, on every line.
5. **Text always wins.** Nothing patterned, bright or moving sits behind words. A pattern lives at an edge or a corner, or stays within two shades of the surface.
6. **Original work.** The stills give the world, the materials, the light and the kinds of object. Do not reproduce a character, a logo, lettering or a whole composition from any of them. A crystal, a suitcase, a lantern are fair; that crystal on that table beside that man is not.
7. **No emoji, no text drawn on a canvas.**
8. **It all switches off.** Scenery is one switch in Settings, and everything holds still for reduced motion. The engine does this for you; do not work around it.

## tokens.css

One block, selector exactly `:root[data-line="<id>"]`. Define every colour below as a six-digit hex. You may also set the seven `--radius-*` values. Nothing else.

| Token | Job |
|---|---|
| `--color-bg` | The ground. Near black, tinted. |
| `--color-surface` | A panel: one step up. |
| `--color-surface2` | A control on a panel: another step up. |
| `--color-border` | Hairline between rows. Barely there. |
| `--color-border-strong` | The edge of an input or a frame. Findable. |
| `--color-text`, `--color-muted` | Reading text; secondary text. |
| `--color-primary`, `--color-primary-d` | The accent; the accent pressed. |
| `--color-on-primary` | Ink on the accent. Near black, tinted toward the accent. |
| `--color-rank` | Set equal to `--color-muted`. |
| `--color-green`, `--color-gold`, `--color-gold-d`, `--color-fire` | On time; attention; attention pressed; late. Retune lightness to suit the ground, keep the hue. |
| `--color-teal`, `--color-blue` | Two spare status hues. |

`npm run line:check <id>` measures contrast and hue for you and says exactly what fails.

## frame.css

One block: `@layer components { … }`. Every selector starts with `:root[data-line="<id>"] ` followed by one of these hooks, and may use `::before` / `::after`:

| Hook | What it is |
|---|---|
| `.panel` | Every raised surface, from a 44 px notice row to a tall list. Whatever you do here must look right at every size. |
| `.next-card` | The one loud card on Today ("Now boarding"). The place for the line's fullest border. It is also a `.panel`. |
| `.board-sign` | The accent-filled sign over a board (page name left, clock right). |
| `.btn-primary` | The one accent-filled button. |
| `.app-sidebar` | The desktop sidebar: a tall wall of the cabin. |
| `.app-tabbar`, `.app-topbar` | The phone's bottom tab bar and top bar. |
| `.scene-window` | The window's outer box on Today. The scene draws its own frame now, so usually only the radius. |

This is where **borders with a pattern** come from. A line's borders should be made of its cabin's material: stitching, rivets, pegs, plate seams, brackets. Ways to draw them without moving anything:

- **Corner marks** (rivets, pegs, corner caps): several `radial-gradient` / `linear-gradient` background layers, each hard-stopped, each `no-repeat`, positioned at a corner with `background-position` and `background-size`.
- **A run along one edge** (a row of rivets, plank grooves, a hazard band): one `repeating-linear-gradient` or repeated `radial-gradient` layer confined to a thin strip with `background-size` and `background-repeat: repeat-x`.
- **A stitched or seamed inner line**: `outline: 1px dashed …` with a negative `outline-offset`, or a zero-blur inset `box-shadow` ring.
- **A double rule or a band**: stacked zero-blur inset `box-shadow`s.
- **Brackets, tabs, straps**: a `::before` / `::after` with `position: absolute` and `pointer-events: none` (you may set `position: relative` on the hook).

Not allowed: margin, padding, border-width changes or anything else that moves layout; type properties; animation; `clip-path`; `url()`; blur. Keep anything patterned within about 10 px of an edge, or within two shades of the surface. Check `.panel` on Today, Route, Quests and Settings: it is used for very different boxes.

The Night Line's sign and button have one cut corner (see `.board-sign` and `.btn-primary` in `index.css`). Override `background` and `border-radius` on those hooks if your line does not want it.

## The three canvases

All three are **layers** (see `Layers` in `client/src/lines/types.ts`), drawn in this order every frame:

```
back(p)      painted once    everything far away that never changes
draw(f, s)   every frame    whatever moves out there
front(p)     painted once    whatever is nearer and never changes; leave it
                             unpainted where the layers behind should show
over(f, s)   every frame    whatever is nearest and alive
```

`back` and `front` cost nothing while running, so texture belongs there: grain, stipple, planks, rivets, stitches. Be generous with it. `draw` and `over` run thirty times a second: keep them to what actually changes.

Every frame carries what is true in the app:

| Field | Meaning |
|---|---|
| `boarding` | A work block is in progress right now. |
| `caution` | There are stragglers (quests past their deadline). |
| `done` | Quests finished today, 0 and up. |
| `progress` | How much of today's planned work is behind you, 0 to 1. |
| `moving`, `t`, `dt` | False in a still; milliseconds; seconds since the last frame. |

Import nothing but `../types`. Never read a clock (use `t`). Random numbers only from `rnd`. Advance positions only when `moving` is true. Open each file with a comment saying what it shows and what each state looks like.

### scene.ts: the cabin corner

`export default defineScene<State>({ sky, timing?, back, layout, draw, front, over })`.

The picture is a corner of the cabin, not a view with nothing in front of it:

- **A wall**, where the page's words are. On a wide window (`wide === true`, about 976 by 288) the words take the left 42 % by the top 60 %; on a phone-width one (about 343 by 224) the full width by the top 48 %. Paint the wall there: dark, the cabin's own material, texture within two shades. The words are set in the line's text colours, so this part must stay dark.
- **A window opening** with a frame of the cabin's making, taking most of the rest. Through it, the world outside: **vivid**. Use the still's real colours.
- **A table or ledge** along the bottom, in front of everything, with two to four of the cabin's own objects on it. This is where the line's character is most concentrated.

Use the layers for exactly that: `back` is the far world, `draw` is what moves in it, `front` is the wall, the frame, the table and its still objects (with the opening left clear), `over` is whatever on the table is alive.

What the scene must say:

| What is true | What the engine gives you | What the scene shows |
|---|---|---|
| A work block is in progress | `visitor.phase` goes `arriving` → `stopped` | The **visitor** comes in, outside, and waits. |
| A quest was just finished | `departing`, or `passing` if none was waiting | The visitor leaves; or one goes by. |
| Nothing is going on | `away`, with a `passing` every minute or two | A quiet view. One passer-by now and then. |
| There are stragglers | `caution` | The scene's **one signal** is amber. Otherwise green. Always visible. |
| Quests finished today | `done` | **One small object per quest**, countable, capped at 12. Only the ones that are there: never empty placeholders. |

`visitor.k` runs 0 → 1 through `arriving`, `departing` and `passing`. Apply your own easing. Nothing that moves may cross the words.

The line's **companion** lives here too: one small original creature or object with an idle state, a different state while the visitor waits, and one reaction when it leaves. The brief says what it is.

Use the accent **at most once**, on the thing the brief names.

### charm.ts: the signature object

`export default defineCharm<State>({ layout, draw, front?, over?, back? })`.

One object that says which line this is, in the sidebar's spare room on every page. The canvas is about 216 px wide and as tall as the screen leaves: anywhere from 0 to 500 px. Draw it standing on the bottom edge, centred, designed for about 200 px of height. Under 110 px, draw only its smallest recognisable form; under 70 px, draw nothing. The sidebar's colour is `--color-surface`; do not fill the canvas, let it show.

It must change with at least two of `boarding`, `done`, `progress`, `caution`, in a way someone would notice and understand after a few days. It may move a little, always: this is the one place on most pages that does.

### backdrop.ts: the air in the cabin

`export default defineBackdrop<State>({ back, layout, draw })`.

A canvas behind the whole app, the full size of the viewport (up to about 2560 by 1440). It shows in the margins and gaps between panels, mostly on wide screens.

- `back`: texture across the page, within two shades of `--color-bg`. Grain, stipple, a material's lines, one or two very large faint shapes anchored to a corner. Keep it under about 20 000 fill calls however big the canvas is.
- `draw`: at most 40 specks (dust, snow, leaves, motes, stars), each slower than 15 px a second and fainter than 35 %. Clear nothing: the engine does.

On a phone, and for reduced motion, it is painted once and left. Nothing in it may be mistaken for part of the interface.

## How to check your work

From `client/`:

```
npm run line:check <id>        the contract, measured
npx tsc -b --noEmit            types
npm run line:shoot <id> scene  the window in every state, plus close-ups at twice the size
npm run line:shoot <id>        those plus Today, Route, Quests and Settings, desktop, wide and phone
```

Pictures land in `design/lines/shots/<id>/`. **Open them and look**, the close-ups first (`window-2x`, `window-phone-2x`, `charm-2x`, `charm-idle-2x`, `charm-short-2x`). Then ask:

1. Cover the window with a hand. On `route-1600` and `quests-1280`, could I name the line from the borders, the sidebar and the backdrop alone?
2. Does the window look like it came from the same world as the stills: the same light, the same materials, the same warmth or strangeness?
3. Can I read the date, the greeting and the line under it without effort, on desktop and phone?
4. Is the visitor obviously arriving, waiting, leaving, passing?
5. Is the signal findable in under a second, and different between `scene-stopped` and `scene-caution`? Can I count the finished quests?
6. On the phone shot, are the visitor, the signal, the count and the companion all in frame?
7. On Today and Route, is there exactly one accent-filled button, and does every status word read on its row?
8. Would someone who has seen the stills say I copied one? If yes, change it.
