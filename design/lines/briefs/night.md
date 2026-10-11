# Night Line (`night`), second pass: the waiting room

**Journey:** "A waiting room on a maglev platform in the rain, at the blue hour, somewhere that isn't here."

**Window hint (for Settings):** "A train waits while a block is boarding and leaves when you finish a quest."

**Order:** 0

The Night Line is the default, and its colours and frame are the app's own: the `@theme` block and the shared classes in `client/src/index.css`. So this line has **no `tokens.css`**, and its `frame.css` only adds to what `index.css` already does. Do not edit `index.css`.

## Why this is being redone

The first pass was a dim platform under a dim moon. The owner on the whole set: "it's just a different colorway each time … bring the app's vibes to life". The owner also asked, earlier, for "some train in the rainy night" and for it to be "a bit more futuristic, more techy and escape from reality". So: keep the maglev and the ringed moon, but see them **through rain-streaked glass from a warm, lit room**, the way `03-rainy-commute.png` does.

## The world

Open these in `design/lines/sources/` and look hard at the first:

- `03-rainy-commute.png` — **the primary.** Take: **rain on the glass** (beads, and runs that streak downward); a **twilight sky** going from deep blue to a band of warm light at the horizon; a low **sun or moon** on the skyline; **teal curtains** tied back; a **wooden table lit amber** with a lidded cup on it; the calm.
- `23-robot-teahouse.png` — a three-pane window onto rain, **small red lights** hanging in the dark outside, **two round amber lanterns** inside.
- `22-industrial-skyline.png` — a wet grey city of slabs with a few lit windows and one red pip.
- `12-midnight-driver.png` — a night skyline of lit towers; cool blue console light.

What makes it this place: **cold blue rain outside, running down the glass; warm amber inside; a train of white light gliding in.**

Leave out: every character, the backpack and its badges, lettering and logos.

## Colours

Tokens are `index.css`'s and do not change. Scene colours: sky `#141A4A #1E2A6E #2C3E96 #4A5AB8`, horizon glow `#8A4A8E #D0705A #F0A860`, moon `#3A4696` with ring `#6A78D0`, city `#10143A #1A2052` with windows `#9FE8FF` and `#FFD23A`, platform `#161C48`, train body `#232C6A` lit `#3A4696`, cold light `#9FE8FF #DDEBFF`, rain `#BED0FF`, wall `#0C1030 #121840`, curtain teals `#1E4A5A #2C6878 #16343E`, table `#3A2A1E #5A3E28` lit `#C88A4A`, lantern amber `#FFB648 #FFE2A0`, red pips `#FF5A4A`, signal yellow `#FFD23A`.

## scene.ts: the waiting room

Rebuild it as a cabin corner (see the contract). Keep the maglev's shape and behaviour from the first pass (it is in the current `scene.ts`), and its yellow platform line.

**`back` (painted once): the blue hour**
- Sky in five flat bands: deep blue at the top, through violet, to a thin band of warm light at the horizon. Stippled.
- **The ringed moon**, big, low and to the right, a clear step lighter than the sky, with a flat ring and a hard-edged lit rim. No longer hidden.
- **The far city**: slabs in two depths with lit windows, most of them cold, a few warm; a handful of **red pips** on masts at different heights.
- The **platform**: its surface, the guideway, and the wet reflections of the city lights as short vertical strokes below each light.

**`draw` (every frame): what moves outside**
- **Rain falling** beyond the glass: fine, slanted, in two depths, as now.
- Two slow **sky craft** crossing with short tails.
- **The visitor: the maglev**, as in the first pass: glides in from the right and waits at the platform, its band of windows the brightest thing outside, smeared on the wet platform beneath it; leaves to the left; an express runs through.
- The **yellow platform line**: the one use of the accent.

**`front` (painted once): the room**
- **The wall**, where the words are: dark panelling in tall rectangles with hairline joints, faint stipple. Dark and quiet.
- **The window**: a wide opening in a slim metal frame with gently rounded corners, divided by one horizontal bar a quarter of the way down and one vertical bar, as a carriage window is.
- **Curtains**: teal, tied back at both sides of the opening, each four or five flat folds with a tie.
- **The table**: a wooden top across the bottom with a rounded front edge, its surface a warm lit band where the lantern's light falls. On it, painted once: a **lidded paper cup** with a sleeve, and a folded **ticket**.

**`over` (every frame): what is alive**
- **Rain on the glass** (this line's companion: it is what you watch): 30 to 40 **beads** standing on the pane, and five or six **runs** that gather, slide down in fits and starts, and vanish at the bottom bar, leaving a short pale track. Clipped to the opening. This is the signature; make it convincing.
  - Idle: slow runs.
  - While the train waits: the beads catch its light and brighten on the side facing it.
  - When it leaves: a gust: every run slides at once for a second.
- **The lantern** on the table at the right: a round paper lantern on a small stand, amber, with a flat pool of warm light on the table. **The signal lives in it**: a small coloured cap on top is green, or amber with stragglers. (The lantern itself stays warm.)
- **Done:** small **paper tickets** stacked in a fan on the table beside the cup, one per quest finished, each with one punched hole.
- A thin thread of **steam** from the cup's lid.

**Phone:** panelled wall across the top with the words; the opening below with the moon cut by the right edge; one curtain; table with cup, tickets and lantern in frame; rain on the glass.

Timing: the defaults.

## charm.ts: the line map

A **strip map** of the line, drawn the way a transit map is: a vertical route line rising from the bottom edge with **stops** as rings along it, a small **train marker**, and a signal lamp at the top.

- The line has 8 stops, evenly spaced. `progress` moves the train marker from the bottom stop (0) to the top (1); stops behind it are filled, stops ahead are open rings.
- `done`: one small ticked flag beside each of the first N stops, up to 8; beyond 8, a small number of extra pips at the top.
- `boarding`: the marker pulses (grows and shrinks by a pixel, once every two seconds) and a short bright band shows on the line just ahead of it.
- `caution`: the lamp at the top is amber; green otherwise.
- Always: three or four raindrops falling through the canvas behind the map, slowly.
- Under 110 px tall: the marker and three stops.

Use the cold light colour for the line and the signal yellow only for the marker.

## backdrop.ts: rain against the building

- `back`: fine stipple two shades above the ground; long faint vertical streaks as if the page were a wet wall, two shades up, sparse.
- `draw`: about 30 raindrops falling, slanted, slowly (this is the one line where the specks fall fast for specks: up to 15 px a second, no more), each a short line fainter than 30 %.

## frame.css: enamel signs

`index.css` already gives the sign and the primary button one cut corner. Add:

1. **`.panel`: screwed plates.** A screw head (a 4 px dot in `--color-border-strong` with a 1 px darker slot across it) 6 px in from each corner.
2. **`.next-card`: a timetable case.** A double rule (two zero-blur inset rings 3 px apart) and the corner screws.
3. **`.app-sidebar`: a tiled wall.** A grid of faint joints, 48 px square, within two shades of the surface, and a 2 px edge in `--color-border-strong` on the right. **`.app-tabbar`:** a row of small tactile studs (2 px dots every 8 px) along its top edge, within two shades.
4. **`.scene-window`:** radius 6 px.

`index.ts` imports `./frame.css` but no `tokens.css`. The checker knows the Night Line reads its tokens from `index.css`.

## Checklist for the pictures

- At a glance, `scene-stopped` is a dark room with a **blue rainy window**, a **white-lit train** and a **warm table**. If the sky is black, it is wrong.
- Rain on the glass must read as on the glass (in front of everything outside) in `window-2x`.
- Yellow appears once: the platform line.
- With the window covered, `quests-1280` still says "station": screwed plates, the tiled sidebar, the line map.
