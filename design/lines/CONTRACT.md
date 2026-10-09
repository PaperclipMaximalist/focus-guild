# What a line is, and what it must do

A **line** is one journey the app can be dressed as. Layout, words and features are identical on every line. A line changes four files and nothing else:

```
client/src/lines/<id>/
  index.ts     name, one-sentence journey, swatch, and the imports below
  tokens.css   colours and corner radii
  frame.css    how the window, the sign and the primary button are framed
  scene.ts     what is outside the window on Today
```

The Night Line (`client/src/lines/night/`) is the reference: read its `scene.ts` before writing one. It has no `tokens.css` or `frame.css` because its look is the app's default (`client/src/index.css`).

Every line comes from the same idea, which is what the reference images share: **a seat by a window, a table in front of you, and somewhere else going by outside.** The window is the scene. The table is the app. Atmosphere lives in the window; the table stays plain.

## Rules that hold on every line

1. **Dark only.** There is no light theme.
2. **One accent, and it means "act here".** It fills the sign, the Start button and the active row. It never means a status. Red means late, green means on time, amber means attention, on every line.
3. **Flat.** No gradients that fade, no glow, no blur, no shadows with blur, no glass. A hard-stopped gradient is allowed as a drawing tool (a cut corner, a dot, a stripe).
4. **Type does not change.** Same three faces, same sizes, on every line.
5. **Nothing moves outside the window**, and nothing in the window moves without a reason (see the state table).
6. **Original work.** The reference images are for mood, light and shapes. Do not reproduce a character, a logo, a piece of signage or a composition from any of them.
7. **No emoji, no text drawn in the scene.**

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

`npm run line:check <id>` measures contrast and hue for you and says exactly what fails. Fix by changing lightness first; change hue only if the brief allows.

## frame.css

One block: `@layer components { … }` (so a utility class on the same element still wins). Every selector starts with `:root[data-line="<id>"] ` followed by one of these hooks, and may use `::before` / `::after`:

| Hook | What it is |
|---|---|
| `.scene-window` | The window on Today. It is `position: relative; overflow: hidden` and already has a radius from `--radius-card`. The page's date and greeting sit inside it, top-left. |
| `.board-sign` | The accent-filled sign over a board (page name left, clock right). |
| `.btn-primary` | The one accent-filled button. |
| `.panel` | Every raised surface. Touch it lightly or not at all. |
| `.section-label` | The small capital label over a group of rows. |

At most **two** frame treatments and **one** small motif per line. The brief names them. No margin or padding, no type properties, no animation, no `clip-path` (it cuts off the focus ring), no `url()`. Anything drawn with a pseudo-element must not sit over the top-left of the window, where the words are, and must set `pointer-events: none`.

The Night Line's sign and button have one cut corner (see `.board-sign` and `.btn-primary` in `index.css`). If your line does not want it, override `background` and `border-radius` on those hooks.

## scene.ts

`export default defineScene<State>({ sky, timing?, layout, draw })`. The engine (`client/src/lines/SceneWindow.tsx`) owns the canvas, the frame rate, pausing, reduced motion and the visitor's comings and goings. You only draw. Import nothing but `../types`.

Open the file with a comment that says what is outside the window and what each state looks like.

### What the scene must say

| What is true | What the engine gives you | What the scene shows |
|---|---|---|
| A work block is in progress | `visitor.phase` goes `arriving` → `stopped` | The **visitor** comes in and waits. |
| A quest was just finished | `departing`, or `passing` if none was waiting | The visitor leaves; or one goes by. |
| Nothing is going on | `away`, with a `passing` every minute or two | A quiet scene. One passer-by now and then. |
| There are stragglers | `caution` | The scene's **one signal** is amber. Otherwise it is green. Always visible, in every phase. |
| Quests finished today | `done` (0 and up) | **One small thing per quest**, in a row or cluster you could count, capped at 12. |

`visitor.k` runs 0 → 1 through `arriving`, `departing` and `passing`. Apply your own easing. `timing` sets how long each takes (milliseconds).

A line also has a **companion**: one small original creature or object, no more than 24 px, that lives in the scene. It has an idle pose, a different pose while the visitor is stopped, and one small reaction when the visitor departs. The brief says what it is.

### Composition

- The page's words sit **top-left**: about the left 55 % by the top 58 % of a wide window, and the full width by the top 55 % of a phone-width one (`wide === false`, about 343 px). Keep that region to the sky and things one or two shades off it. Nothing bright, nothing tall, nothing moving fast there.
- Ground or horizon line about 80 % down. Things that stand up go right of 58 % (wide) or right of 72 % (narrow).
- The visitor waits in the lower part of the window and reads at a glance as what it is. Use the accent **at most once** in the scene, on the thing you would step toward.
- Eight to twelve flat colours, close to the line's tokens. One pale "light" colour for windows and lamps, used sparingly.
- It must look finished as a **still frame** (`moving === false`): reduced-motion users and every screenshot see exactly that.

### Motion budget

- When idle, at most three kinds of thing move, slowly. Ambient particles (rain, dust, snow) count as one.
- Nothing blinks faster than once a second. Nothing but the visitor travels faster than about 40 px a second.
- Advance positions only when `moving` is true, by `dt` seconds. Never read a clock; use `t`. Random numbers only from `rnd`.
- Keep it cheap: build arrays in `layout`, not in `draw`; a few hundred fill calls a frame at most.

## How to check your work

From `client/`:

```
npm run line:check <id>        the contract, measured
npx tsc -b --noEmit            types
npm run line:shoot <id> scene  seven pictures of the window, one per state
npm run line:shoot <id>        those plus Today, Route and Settings, desktop and phone
```

Pictures land in `design/lines/shots/<id>/`. **Open them and look.** Then ask of each:

1. Can I read the date, the greeting and the line under it without effort?
2. Is the visitor obviously arriving, waiting, leaving, passing? Is `away` calm but not empty?
3. Is the signal findable in under a second, and clearly different between `scene-stopped` and `scene-caution`?
4. Can I count the finished quests (0, 2, 4, 7, 5, 1 across the shots)?
5. On the phone shot, are the visitor, the signal and the companion all still in frame?
6. On Today and Route, is there exactly one accent-filled button, and does every status word read on its row?
7. Would someone who has seen the reference images say I copied one? If yes, change it.
