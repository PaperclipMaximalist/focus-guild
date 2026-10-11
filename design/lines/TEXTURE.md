# Materials and movement

The owner, on the ornament kits (2026-10-10): "they all still look kinda the same. I don't want a random image to fill space, I want texture and pattern. Look back at the inspiration images and see what they had. Small animations as well."

They were right. Every surface in the stills is made of something: logs, stippled leather, rusted plate, a buttoned bench, pleated curtains. Ours were flat near-black boxes with a thin frame, in five tints. So:

- **Every surface gets a material**, painted as a tile and repeated: panels, the sidebar, the phone's bars, the page behind them.
- **Colours are no longer near-black.** A surface is dark enough to read cream text on, and no darker. It has a real hue.
- **Pasted-in pictures are gone**: the object in the sidebar (`charm.ts`) and the tailpiece at the foot of every page (`sprites.tail`). The space they filled is now material.
- **Small things move**: lights twinkle, a leaf turns, rain runs, a cursor blinks. Always small, always looping, never in the way of words.

Where this file disagrees with `CONTRACT.md` or `ORNAMENTS.md`, this file wins. The worked example is the Timber Line: read all of `client/src/lines/sleeper/` before writing anything, and open `design/lines/shots/sleeper/quests-1280.png`, `today-1280.png`, `today-375.png` and `kit-2x.png` to see what "done" looks like.

## The test

Put two lines' `quests-1280.png` side by side at thumbnail size, 300 px wide. If you can tell them apart only by tint, the line has failed. You must be able to name the material of the panel, the sidebar and the page from that thumbnail.

## What a line supplies now

```
client/src/lines/<id>/
  tokens.css    colours with a real hue (see below)
  texture.ts    NEW  three tiles: panel, wall, accent
  wall.ts       NEW  whatever is alive on the sidebar (replaces charm.ts)
  backdrop.ts   REWRITTEN  the room behind the app, as a bold material
  ornaments.ts  tail removed; crown added; mark and rule (at least) move
  index.ts      imports texture and wall; swatch equals the new tokens
  frame.css     only if the sign or button needs it
  scene.ts      unchanged
```

### tokens.css

Use the hex values in your line's kit below. `npm run line:check <id>` measures contrast; if it fails, move the colour the smallest amount that passes and say so in your report. `index.ts`'s `swatch` must equal the new `--color-bg`, `--color-surface`, `--color-primary`.

### texture.ts

`export default defineTextures({ panel, wall, accent })`. Each is a `Tile`: `{ w, h, paint }`, whole-number sizes, painted once at twice its size and repeated in both directions by CSS.

| Tile | Where it goes | Size | Rules |
|---|---|---|---|
| `panel` | Every panel and box, behind words | 200 to 400 px each way | Fill it completely. Every tone within about 14 per channel of `--color-surface`, except thin lines (2 px or less), which may be any darker. Nothing lighter than `--color-surface2`. No shape that looks like a control, an icon or a letter. |
| `wall` | The sidebar, the phone's top and bottom bars | 48 to 320 px each way | Fill it completely. The menu's words sit on it in `--color-muted`: keep every tone as dark as `--color-surface2` or darker. Bolder than the panel: this is where the material shows most. Must look right 240 px wide and also as a strip 52 px tall. |
| `accent` | Over the accent fill of the sign and the Start button, under their words | 4 to 40 px each way | Clear ground. Paint the pattern in `--color-on-primary` at 12 to 20 % opacity (`globalAlpha`), nothing else. |

**Seamless, or it shows.** A tile repeats, so whatever leaves by one edge must come back in by the opposite one. `wrapped(p, () => { … })` from `../types` paints its callback nine times, a whole tile apart, which does exactly that. Roll every random number into an array *before* calling it, never inside (the nine copies must be identical). A flat fill and anything aligned to the tile's own edges go outside `wrapped`. Look at the tile swatches at the bottom right of `kit-2x.png`, and at a tall panel on `today-1280.png`: a seam is a straight line where the pattern jumps.

**A tile is a material, not a picture.** Planks, plating, scales, pleats, stipple, weave. One knot or one rust bloom per tile is fine; an object is not. If a feature is so distinct that you see it repeating down a tall panel, make it quieter or make the tile bigger.

### wall.ts

`export default defineWall<State>({ layout, draw, back? })`: a clear canvas over the whole sidebar (240 px wide, the full height of the screen, 600 to 1400 px), above the wall tile and under the menu. Do not fill it.

- The app's name and the menu take the top 510 px. The rank and the duck take the bottom 180 px. Between them is spare room, but only on a tall screen: it may be 0 px. Over the menu and the foot, anything you draw must be small (6 px or less), fainter than 35 %, or within 12 px of the left edge. In the spare room you may be bolder.
- **It must be visibly alive within three seconds of looking**, and it must not be a picture of an object standing there. Rain, bubbles, sparks, lights, dust, steam, a scan line.
- `boarding` (a work block is running) must change it in a way someone would notice. `caution` (stragglers) should tint one part of it amber.
- When `moving` is false, draw a complete, good-looking still and advance nothing.
- Same rules as every canvas: import only `../types`, no clock but `t`/`dt`, random numbers only from `rnd`, flat colour, no gradients, shadows, text or images. Under 320 lines.

### backdrop.ts

Rewrite `back`. It used to stay "within two shades of the ground"; that is why nobody saw it. It is now the room's wall or the world outside, in its real material, across the whole viewport (up to 2560 by 1440): as bold as you like so long as **every tone is darker than `--color-surface`**, so panels still stand off it. Under about 20 000 fill calls. Keep `layout` and `draw` (up to 40 specks, slower than 15 px a second, fainter than 35 %) unless your kit says to change them.

### ornaments.ts

1. **Delete `tail`**: its painter, and any helper only it used (`npx tsc -b --noEmit` names them). It is already out of the exported kit.
2. **Add `edges.crown`**: a `Sprite` about 64 by 12 that repeats along the top of the one loud card ("Now boarding"), between the frame's corners and *over* its top edge. Design it to sit on your own card frame's top edge. It moves.
3. **Make pieces move.** A `Sprite` may have `frames` and `seconds`, and its `paint(p, frame)` is then called once per frame, 0 to `frames - 1`; the app steps through them forever, one run every `seconds`. `mark`, `rule` and `crown` must move; `emblem` and `horizontal` may. Rules:
   - Small movement: a few pixels, one part of the picture. The rest must be painted identically in every frame (the random numbers are the same for every frame, so stipple will not shimmer).
   - To rest between movements, repeat the resting picture: 10 frames over 4 seconds with 6 of them identical is a leaf that stirs and hangs still.
   - Every section label's mark moves in step with every other. So keep it gentle: a blink, a twinkle, a sway.
   - 2 to 12 frames; `seconds` from 1 to 8.
   - `kit-2x.png` shows every frame of each moving piece side by side, right of centre. Check that only what you meant to move differs between them.
4. Update the comment at the top of the file.

### index.ts

Remove nothing but what refers to the charm; add `import textures from './texture';`, `import wall from './wall';` and `textures, wall,` in the line. Update the swatch and the comment.

## How to check

From `client/`:

```
npm run line:check <id>
npx tsc -b --noEmit          (errors in other lines' folders are not yours)
npm run line:shoot <id>      every picture
npm run line:shoot <id> live errors, and frames a second, while it runs
```

Open, at full size: `kit-2x.png` (tiles bottom right, frames right of centre), `wall-2x.png`, `wall-caution-2x.png`, `quests-1280.png`, `today-1280.png`, `today-375.png`, `route-1280.png`, `settings-1280.png`. Ask:

1. The thumbnail test above.
2. Can every word be read without effort: quest titles, the quiet line under them, the menu, section labels, the words on the sign and the Start button?
3. Does any tile show a seam or an obvious repeat?
4. Does the sidebar look like a material with something alive on it, or like a picture?
5. Do the panels stand off the page behind them?
6. On the phone, do the two bars look right as thin strips of the wall?

## The kits

Colours are a starting point; the material is not negotiable.

### Ring Line (`orbital`): still 01, the cosmic compartment

What the still has: everything shaded with spray stipple, never a smooth tone; violet space with banded planets; tan stitched luggage; olive monstera leaves edged with gold stipple; one pink crystal.

- **Tokens**: `--color-bg #120B24`, `--color-surface #261A44`, `--color-surface2 #36265C`, `--color-border #40306A`, `--color-border-strong #6E58A8`, `--color-muted #B4A6CC` (and `--color-rank` the same).
- **panel**: sprayed violet. Base `#261A44`. Stipple gathered into broad diagonal bands like a gas planet's: dense lighter dots (`#33245A`, `#3A2A66`) in the bands, sparse dark dots (`#1C1236`) between them, the density rising and falling smoothly across the tile (use a sine of `x/w + 2*y/h` so it wraps). No lines at all: this material is only dots. About 256 by 256.
- **wall**: a print of monstera leaves. Ground `#1A1030`. Big dark leaves (`#232A12`, lit side `#2F3718`), 80 to 110 px long, with the splits and holes that make them monstera, overlapping and running off the tile's edges; a rim of gold stipple (`#5E5A20`) along each leaf's lit edge; dark stipple in the gaps. About 220 by 280.
- **accent**: a diagonal band of stipple, dense in the middle and thinning to nothing, on a 24 by 24 tile.
- **wall.ts**: four-point sparkles that open and close among the leaves, each in its own time (10 to 14 alive at once, cream and a few pink), and a thin stream of gold dust that winds slowly up through the spare room like the trail from the crystal in the still. `boarding`: the sparkles turn pink and half as many again. `caution`: every fourth is amber.
- **backdrop**: deep space, bold. An enormous banded planet rising from the bottom right corner (radius about 60 % of the viewport's height, its bands in `#1C1236`, `#221640`, `#1A1030`, all stippled at the edges, never a hard smooth arc), a ring across it, a second small moon top left, and a starfield of 1 and 2 px stars. Specks: keep the dust.
- **ornaments**: `crown` is a strap of stitches along which one pink glint travels (8 frames, 4 s). `mark`: the sparkle opens and closes (6 frames, 3 s, resting half of them). `rule`: the small planet travels along its orbit line and back (12 frames, 8 s).

### Salvage Line (`dispatch`): still 09, the scrap dispatch

What the still has: olive-brass instrument panels, rusted copper boilers and pipes, rivets on everything, a gridded yellow screen, a green screen of scan lines, red lamps.

- **Tokens**: `--color-bg #12100A`, `--color-surface #2A2614`, `--color-surface2 #3A3420`, `--color-border #4A4226`, `--color-border-strong #7A6C3C`, `--color-muted #B5A98A` (and `--color-rank`).
- **panel**: an olive-brass instrument plate. Base `#2A2614`. A fine engineering grid like the yellow screen's: a line every 24 px one step lighter (`#312D19`), every fourth line one step darker (`#221F10`). Short scratches at odd angles. One rust bloom per tile: a cluster of orange-brown stipple (`#3A2A14`, `#33240F`). No rivets here (they are on the frame). About 288 by 192.
- **wall**: a riveted copper boiler. Base `#3A2010`. Vertical plates 80 px wide: a dark seam (`#1E0F07`) with a lit edge (`#4E2C16`) and a rivet every 30 px either side of it (a 5 px dome with a highlight and a shadow under it). Rust running down from some rivets in darker streaks, and patches of verdigris stipple (`#23382E`). About 80 by 240, or 160 wide if you want the plates to differ.
- **accent**: scan lines: a 1 px line every 3 px.
- **wall.ts**: a row of five indicator lamps along the very top edge, above the app's name, lit one after another in a chase (green; steady and all lit when `boarding`; the last one amber when `caution`). A pale green scan line, 2 px, at 8 %, travelling down the whole sidebar once every seven seconds. In the spare room, puffs of steam (flat pale shapes, 3 or 4 at a time) rising from a pipe stub on the right edge and thinning as they go.
- **backdrop**: the hull from inside. Big plates about 220 by 150, staggered like bricks, each its own rust tone (`#1A120A`, `#20160C`, `#1C1409`, `#241A0E`), dark seams with a row of rivets along each, rust streaks under some rivets, a hazard chevron band (no letters) low on one or two plates. Specks: gold dust.
- **ornaments**: `crown` is a rail of small lamps lit in a chase (6 frames, 2.4 s). `mark`: the cursor blinks (2 frames, 1.1 s). `rule`: a puff of steam leaves the valve and thins (8 frames, 5 s, resting for 4 of them).

### Abyssal Line (`deep`): still 02, the submersible lookout

What the still has: emerald water full of bubbles, barrel staves and iron hoops, brass pipes with flanges, scrolled ironwork, a carved disc of sawtooth triangles.

- **Tokens**: `--color-bg #06140F`, `--color-surface #0F2C24`, `--color-surface2 #184036`, `--color-border #1F4A3E`, `--color-border-strong #3F8A70`, `--color-muted #8FBFAA` (and `--color-rank`).
- **panel**: fish scales. Base `#0F2C24`. Rows of overlapping scallops, each about 36 wide and 18 tall, alternate rows offset by half: the arc of each scale a thin dark line (`#0A2019`), a crescent of lighter stipple (`#153A30`) just inside the top of it, darker stipple (`#0C241D`) at its foot. About 216 by 216 (6 by 12 scales).
- **wall**: barrel staves. Vertical staves 30 px wide in three browns gone green (`#16261C`, `#1A2C20`, `#132119`), a dark joint between them, long vertical grain, and every 150 px an iron hoop right across: a 12 px band (`#0C1512`) with a lit top edge (`#2A4038`) and a rivet on each stave. About 180 by 300.
- **accent**: a row of sawtooth triangles, point up, with a line under them, from the carved disc.
- **wall.ts**: bubbles rising the whole height of the sidebar: rings in pale teal with a highlight tick, 3 to 9 px, wobbling as they rise, about 14 at once, faint over the menu. Now and then a burst of small ones together. `boarding`: twice as many, and faster. `caution`: every fifth is amber.
- **backdrop**: open water. Stepped shafts of light slanting down from the top left in three flat tones (`#081C16`, `#0B241C`, `#0D2A21`), with stippled edges; a kelp forest in silhouette (`#04100C`) rising from the bottom edge, tall, swaying fronds drawn still; stipple murk. Specks: bubbles and plankton, rising.
- **ornaments**: `crown` is a string of bubbles along the top that swell and pop in turn (6 frames, 3 s). `mark`: the anchor swings a few degrees on its ring (8 frames, 4 s). `rule`: a small fish swims along the rope and back (12 frames, 8 s).

### Night Line (`night`): stills 03, 12, 13, 22, 23

What the stills have: rain running down glass, the far lights of a city gone soft, cold navy with one warm yellow, station tile, a buttoned leather seat, pleated teal curtains.

- **Tokens**: Night's colours are the app's defaults in `client/src/index.css`, which the director has already changed (`--color-surface #131A3D`, `--color-surface2 #1D2654`). Do not edit that file; if `line:check night` fails on a colour, say so in your report. Use those two values for the panel and the wall.
- **panel**: glazed station tile. Bricks 64 by 32 in running bond, each glazed in one of three navies (`#131A3D`, `#151D43`, `#111738`), grout lines 1 px (`#090D22`), a hard 1 px highlight along the top and left inside edge of each brick (`#1B2452`), a crazed or chipped brick once per tile, fine stipple. 256 by 128.
- **wall**: a wet window at night. Ground `#0A0F26`. Still drops beaded on the glass: 2 to 5 px, a dark lower rim and a bright tick at the top (`#5A6AA8`), about 40 per tile, and a few short dried runs under the bigger ones. Behind them the city's far lights as soft flat shapes: discs and rounded squares 10 to 26 px in dim amber (`#2A2318`), teal (`#10262C`) and pink (`#2A1626`), few and overlapping. About 240 by 320.
- **accent**: diagonal hazard stripes at 45 degrees, 12 px apart, as on a platform edge.
- **wall.ts**: rain running down the glass. About ten drops at once that start, run a little, stop, gather and run again, each leaving a short trail that fades; pale blue at 40 %, at most 3 px wide. In the spare room, when one comes, a far train: a row of small dim yellow windows sliding across in about four seconds, then nothing for a while. `boarding`: the far train is stopped in the spare room, windows lit, and the rain is heavier. `caution`: its last window is amber.
- **backdrop**: the carriage's curtain, drawn across the whole wall behind the app: vertical pleats about 56 px apart in four stepped bands of dark teal-navy (`#070B1E`, `#0A1028`, `#0D1532`, `#060918`), a fold's highlight as a 1 px line, a woven band of small diamonds running across every 240 px, and a hem of stitches. Specks: keep the rain if it is there, slanted; otherwise dust.
- **ornaments**: `crown` is a row of platform studs that light in turn toward the right, as if a train were coming (8 frames, 2.4 s). `mark`: the stop ring pulses, a second ring opening outward and gone (6 frames, 3 s, resting for 3). `rule`: a small train runs along the route line from one end to the terminus and waits there (12 frames, 8 s). Also remove the pattern `frame.css` puts on `.panel`: the tile replaces it.
