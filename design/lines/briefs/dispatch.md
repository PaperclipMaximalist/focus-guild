# Salvage Line (`dispatch`), second pass: the dispatch cockpit

**Journey:** "A copper dispatch cockpit over a scrapyard in the dust, with a green screen ticking off the day's parcels."

**Window hint (for Settings):** "A courier skiff docks while a block is boarding and lifts off when you finish a quest."

**Order:** 4

## Why this is being redone

The first pass was a near-black view with dim hulls. The owner: "it's just a different colorway each time". This pass is built around `09-scrap-dispatch.png`: a **sepia daylight haze** outside, and inside, riveted copper, a glowing **green screen**, an amber radar and red lamps.

## The world

Open these in `design/lines/sources/` and look hard at the first:

- `09-scrap-dispatch.png` — **the primary.** Take: the **ochre and sepia air**, thick with dust, bright enough to silhouette everything; **rusted towers, tanks, pipes and ladders** stacked into a yard; the **riveted copper cockpit** with fat window pillars; the **green CRT** hanging at the upper right, lines of readout glowing; the **amber radar screen** with its grid; **red indicator lamps**; a console crowded with knobs; **parcels** in white with tape.
- `17-stranded-fleet.png` — beached freighters in the middle distance; a calm desk in front; a row of round gauges.
- `19-pilot-station.png` — hazard stripes, bracketed frames, a telemetry strip.
- `22-industrial-skyline.png` — one small lit pip in a grey silence.

What makes it this place: **dusty gold light outside, copper and rivets inside, and three small glowing things: a green screen, an amber radar, a red lamp.**

Leave out: the robot and every other character, lettering and logos, the tangle of wires.

## Colours

Tokens stay (oxide ground, parchment text, enamel-blue accent, phosphor green for "on time"); adjust only if the checker asks.

Scene colours (not tokens): haze bands `#6A5028 #8E6E38 #B89250 #D8B878 #EAD6A0`, far yard `#A08048 #86683A`, mid yard `#6A4A2A #4E3620`, near rust `#3A2416 #2A1A10` with rust reds `#8A3A1E #B2522A`, copper wall `#2A1A12 #3A2418 #4E3222` with highlights `#7A5234`, rivet highlight `#9A6E48`, CRT `#0A2A14` glass with phosphor `#4BE083 #A8F5C4`, radar amber `#E0A020 #FFD060`, lamp red `#E0402A`, parcel `#E8E0D0` with tape `#B2522A`, skiff cream `#D8CCB0`.

## scene.ts: the cockpit

Rebuild it as a cabin corner (see the contract). Keep the skiff's shape from the first pass.

**`back` (painted once): the yard**
- **Haze** in five flat bands, palest at the horizon, a deeper ochre above. Bright. Over it, fine stipple like blown dust, denser low down.
- **The yard in three depths**, each a flat silhouette a step darker and redder than the one behind: far, a line of tanks and stacks, pale and low-contrast; middle, **domed tank towers** with ladders, a leaning chimney, pipes crossing between them, one beached hull on its side; near, at the edges, big dark shapes of rusted machinery with a few rust-red plates picked out.
- A gantry crane as thin lines in the middle distance.

**`draw` (every frame): what moves outside**
- **Dust** drifting right, and now and then a thicker gust: a loose band of specks crossing.
- The crane's **hook** swinging a pixel or two.
- **The visitor: the courier skiff**, the first pass's shape in cream with a rust stripe and one pale window, a crate on its bed. It comes in from the right and settles in the lower middle of the opening, hovering with a 2 px bob (about 3.6 s); lifts away up and to the right (about 3.2 s); a small one crosses far off (about 2.6 s).

**`front` (painted once): the cockpit**
- **The wall**, where the words are: copper plating in large panels, **rivets** along every seam (dots with a 1 px highlight), a few vertical streaks of darker staining. Quiet behind the words.
- **The canopy**: a wide opening with rounded upper corners, divided by **two fat riveted pillars** into three panes (on a phone: one pillar, two panes).
- **The console** across the bottom: a dashboard that rises toward the left, in copper with a darker top. Set into it: an **amber radar screen** (a rounded square with a grid), a row of **toggle switches**, two round dials, and a block of **red indicator lamps**. At the far right, a stack of **three parcels**, cream with rust tape, one with a single **enamel-blue** label: the one use of the accent.
- **The CRT's casing**: a bulbous monitor housing hanging from an arm in the upper right of the picture, in front of the frame. Its glass is painted in `over`.

**`over` (every frame): what is alive**
- **The CRT** (the line's companion: it is the thing that keeps you company here): dark green glass with **one bright bar per quest finished**, as lines of a manifest, each a different length, up to 12; a block cursor after the last line that blinks once a second; a faint brighter scanline that drifts down the glass over six seconds; and a flat pale-green wash of its light on the casing and the pillar beside it.
  - Idle: cursor and scanline only.
  - While the skiff is docked: a short bar at the bottom fills and empties, as if receiving.
  - When the skiff leaves: the whole glass flashes one step brighter for a moment.
- **The radar**: a sweep line turning once every eight seconds, leaving nothing behind it; one blip when the skiff is near.
- **The signal:** the block of indicator lamps on the console: the green one lit; with stragglers, the amber one instead.
- Dust motes inside the cockpit, a few, slow, catching the light from the window.

**Phone:** copper wall across the top with the words; canopy with one pillar; console with radar, lamps and parcels; the CRT hanging at the upper right of the opening, small but with its bars countable in `window-phone-2x`.

Timing: `{ arriving: 3600, departing: 3200, passing: 2600 }`.

## charm.ts: the terminal

The **CRT terminal** again, larger: a bulbous housing about 150 px wide on a short neck and foot standing on the bottom edge, rivets on its casing, two knobs under the glass.

- `done`: one phosphor bar per quest finished, as manifest lines, up to 12.
- `progress`: a thin bar along the bottom of the glass, filled left to right.
- `boarding`: the cursor blinks and a second, dimmer scanline joins the first.
- `caution`: a small lamp on the casing is amber; dark otherwise.
- Always: one slow scanline, and the faint green wash on the casing.
- Under 110 px tall: the glass and its bezel only.

## backdrop.ts: dust in the works

- `back`: rust speckle as stipple, two shades above the ground, heavier toward the bottom; very large plate seams (a few long straight hairlines with rivet dots) two shades up, as if the page were one wall of the cockpit.
- `draw`: about 30 dust specks drifting right and slightly down, slowly.

## frame.css: bolted plate

1. **`.panel`: plates.** A 1 px `--color-border` edge and a bolt head (a 4 px dot in `--color-border-strong` with a 1 px lighter top-left highlight) 6 px in from each corner. Works from 44 px tall upward.
2. **`.next-card`: the hazard frame.** Bolts at the corners (5 px), and in the top-left and bottom-right corners a small triangle of 45° hazard stripes (`--color-border-strong` and the surface, 14 px), hard-stopped. A weld seam: a dashed hairline 5 px inside the edge.
3. **`.board-sign`:** keep the hazard stripe block at its left end from the first pass; no cut corner. **`.btn-primary`:** plain plate, a 2 px band of `--color-primary-d` along the bottom.
4. **`.app-sidebar`: a riveted pillar.** A vertical seam 10 px in from its right edge with a rivet every 32 px, within two shades of the surface, and a 2 px edge in `--color-border-strong`. **`.app-tabbar`:** tread plate: a band of small diagonal dashes along its top edge, within two shades.
5. **`.scene-window`:** radius 6 px, no extra frame (remove the corner brackets: the scene draws its own canopy).

## Checklist for the pictures

- At a glance, `scene-stopped` is a dark copper room with a **bright dusty-gold window** and a **green screen**. If the window is dark, it is wrong.
- Three small glows, three colours: green screen, amber radar, red or green lamp. All visible in `window-2x`.
- Blue appears once: the label on one parcel.
- With the window covered, `quests-1280` still says "dispatch cockpit": bolts, hazard corners, the terminal in the sidebar.
