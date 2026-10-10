# Timber Line (`sleeper`), second pass: the lantern cabin

**Journey:** "A log-cabin sleeper rolling through birch country at dusk, fairy lights up and something hot on the table."

**Window hint (for Settings):** "The train stops at a lamp-lit halt while a block is boarding and pulls out when you finish a quest."

**Order:** 3

## Why this is being redone

The first pass was a night view in browns. The owner: "it's just a different colorway each time … bring the app's vibes to life". This pass is built around `08-autumn-sleeper.png`: the window **blazes**, and the cabin around it is a cabin.

## The world

Open these in `design/lines/sources/` and look hard at the first:

- `08-autumn-sleeper.png` — **the primary.** Take: the **window on fire with autumn**: orange and gold behind **white birch trunks**, with cold blue in the shadows between them; **fairy lights** sagging across the top of the frame; **grey-blue curtains** gathered at the sides; a dark **table with a rounded corner**, a **steaming mug** and a book on it; **hanging plants**; log walls; red upholstery.
- `07-woodland-berth.png` — square-cut log framing, a pendant lamp, a slab table, an **acorn**.
- `15-rainy-hearth.png` — shelves of books in near darkness, one amber glow.
- `05-coastal-berth.png` — a rounded window over a work table at sunset; brass and wood.

What makes it this place: **a wall of orange light with white trunks in it, seen from a warm dark room with small lights strung up.**

Leave out: the raccoon and every other character, the laptop, the lettered cushion.

## Colours

Tokens stay as they are (espresso ground, cream text, honey accent); adjust only if the checker asks.

Scene colours (not tokens): dusk bands `#3A1508 #7A2B0C #C4521A #F0872A #FFB648 #FFD98A`, birch whites `#F4EAD8 #D9CDB8` with notches `#3A2A20`, shadow blues `#2B4A6E #3E6C96`, curtain grey-blues `#3C4A5C #52647A #2A3442`, log browns `#1C130E #2A1C14 #3A281C`, table `#241812 #34241A`, upholstery red `#7A2318`, leaf greens `#3F5A2A #5E7F38`, mug cream `#E8DCC6`, bulb `#FFE2A0`.

## scene.ts: the cabin

Rebuild it as a cabin corner (see the contract). Keep what worked in the first pass: the halt as the visitor, the sparrow, the acorns, the scrolling that eases to a stop.

**`back` (painted once): the glow**
- Sky as five or six horizontal flat bands from deep burnt orange at the top to pale gold near the ground. No fade: clear steps.
- Over the upper bands, **foliage as stipple**: clouds of orange, gold and rust dots, dense at the top and thinning downward.
- Low down, broken shapes of cold blue shadow between where the trunks will be, as in the still.
- A far line of pale thin trunks, small and still.

**`draw` (every frame): what moves outside**
- **Birches** scrolling left in two depths: bright cream trunks with dark notches, the near ones wide (10 to 16 px) and brilliant against the orange. About 6 px/s far and 18 px/s near while under way, easing to zero as the halt arrives and back up as it leaves.
- A few **leaves** falling.
- **The visitor: the halt**, as before, but now a **dark silhouette against the glow** with its one honey lamp lit (the lamp's shade is the one use of the accent), a clock, a nameboard with nothing on it, and a pale platform edge. It slides in from the right and rests in the right half of the opening (about 3.8 s); slides off left (about 3.4 s); goes by without stopping (about 2.2 s). Its position comes from `visitor.phase` and `visitor.k` alone.

**`front` (painted once): the cabin**
- **The wall**, where the words are: horizontal logs, each course about 26 px, a darker seam between courses, grain as fine stipple and a few long hairlines. Dark and quiet.
- **The window**: a wide opening in a square timber frame with a deep sill. No mullions.
- **Curtains**: grey-blue, gathered and tied back at both sides of the opening, each drawn as four or five flat vertical folds with a tie. They overlap the opening's edges by 20 to 30 px.
- **The fairy-light wire**: a thin dark line sagging in two swags across the top of the opening, hooked at the middle.
- **A hanging plant** in the top-right corner: a pot on cords with trailing leaves.
- **The table**: a dark slab across the bottom with a rounded front corner and a paler bevelled edge. On it, painted once: a **mug** (cream, with a handle) and a closed **book**.

**`over` (every frame): what is alive**
- **Fairy bulbs** along the wire, about 14, warm. Each is a 3 px dot with a 1 px brighter centre. They twinkle slowly and never more than one or two at a time.
- **Steam** from the mug: three short curved strokes rising and fading over about three seconds.
- **Done:** acorns in a row on the table, one per quest finished.
- **The signal:** a small brass lamp on the table at the far right with a coloured glass: green; amber with stragglers.
- **The companion: the sparrow**, on the table left of the acorns. Idle: turns its head every several seconds. While stopped at the halt: settles, lower and rounder. On departure: one hop.
- One trailing leaf of the plant sways a pixel.

**Phone:** log wall across the top with the words; the opening below, glowing; curtain on the right side only; the table with mug, sparrow, acorns and signal all in frame; bulbs along the top of the opening.

Timing: `{ arriving: 3800, departing: 3400, passing: 2200 }`.

## charm.ts: the shelf

A plank shelf on two brackets near the bottom edge, and on it an **oil lantern** (glass chimney, brass base, wire handle), a **steaming mug** and a few **acorns**. Above, a swag of **fairy lights** from one side of the canvas to the other.

- `progress`: bulbs on the swag light up left to right, 10 bulbs in all; unlit ones are dark glass, still visible.
- `done`: acorns on the shelf, one per quest, up to 12, in two rows if needed.
- `boarding`: the lantern's flame is tall and its flat pool of light on the shelf is wide; otherwise the flame is low.
- `caution`: a small tag hanging from the shelf's edge turns amber (it is plain wood otherwise).
- Always: the flame leans a pixel side to side, slowly; steam rises from the mug.
- Under 110 px tall: the lantern alone.

## backdrop.ts: the room's own wood and air

- `back`: long horizontal grain lines across the page two shades above the ground, broken and uneven, with a knot here and there; fine stipple over them.
- `draw`: about 12 leaves drifting down and sideways, slowly, in dim amber and rust; each turns as it falls.

## frame.css: joinery

The app's surfaces are built like the cabin's woodwork.

1. **`.panel`: pegged boards.** A 1 px `--color-border` edge, and a small square peg (3 px, `--color-border-strong`) set 6 px in from each corner. Works from 44 px tall upward.
2. **`.next-card`: a framed board.** A 2 px timber frame in `--color-border-strong` (inset box-shadow), pegs at the corners (4 px), and a second hairline 5 px inside the frame.
3. **`.board-sign`: a hung sign.** Square-cut board, no cut corner, a 2 px band of `--color-primary-d` along the bottom, and a round nail head (4 px, `--color-on-primary` at about 45 %) near each end, vertically centred. Keep the title and the clock clear of them.
4. **`.btn-primary`:** square-cut, a 2 px band of `--color-primary-d` along the bottom.
5. **`.app-sidebar`: a log wall.** Faint horizontal seams every 52 px across its whole height, each within two shades of the surface, and a 2 px post in `--color-border-strong` down its right edge. **`.app-tabbar`:** a double rule along its top edge.
6. **`.scene-window`:** radius 3 px, no extra frame: the scene draws its own.

## Checklist for the pictures

- At a glance, `scene-stopped` is a dark room with a **blazing orange window**. If the window is dark, it is wrong.
- White trunks, orange light, blue shadows: all three must be there.
- The fairy lights and the curtains must be obvious in `window-2x`.
- The words sit on plain dark log wall with nothing bright behind them.
- With the window covered, `quests-1280` still says "cabin": pegged boards, the log-wall sidebar, the lantern shelf.
