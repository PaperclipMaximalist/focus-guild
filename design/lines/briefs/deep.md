# Abyssal Line (`deep`), second pass: the submersible's bridge

**Journey:** "The bridge of an old brass submersible, deep in green water, with a whale for company."

**Window hint (for Settings):** "A whale swims alongside while a block is boarding and dives away when you finish a quest."

**Order:** 2

## Why this is being redone

The first pass was a dark teal panel with a dim whale. The owner: "it's just a different colorway each time". This pass is built around `02-submersible-lookout.png`: the viewport **floods the bridge with green light**, and the bridge is brass, iron and oil-lamp.

## The world

Open these in `design/lines/sources/` and look hard at the first:

- `02-submersible-lookout.png` — **the primary.** Take: the **emerald water**, bright and mottled, pale where light breaks through and dark where weed masses; the **riveted iron viewport** with a heavy rounded frame and an **ornate scrolled railing** along its foot; an **oil lantern** burning warm on the ledge; a **ship's wheel**; a bottle, a rolled chart; and one small **yellow-and-black frog**.
- `06-submerged-transit.png` — jellyfish drifting, a whale's silhouette overhead, total stillness.
- `25-celestial-whale.png` — the long body of a whale as the event in the view.
- `21-emerald-cathedral.png` — deep green haze stepping back in flat layers, tiny warm lights far off.

What makes it this place: **green light pouring through riveted iron onto warm brass.** Two temperatures: cold emerald outside, lamp-warm inside.

Leave out: the man, the banjo, the masks, the barrel, any lettering.

## Colours

Move the tokens from teal to **emerald-black**; text stays pale; the accent stays chartreuse (hue 70 to 86). Start here and let the checker correct lightness:

```
bg #06110E  surface #0C1B16  surface2 #142A22
border #1B3A2E  border-strong #3A6E58
text #E4F4EC  muted #8BB3A0
primary #C8F560  primary-d #A9D640  on-primary #0B1402
gold #FFA24D  gold-d #D97F2B  fire #FF7566  green #5EE6A8  teal #57D9C7  blue #7DB4FF
radius: card 8  sm 2  md 5  lg 6  xl 8  2xl 10  3xl 12
```

Scene colours (not tokens): water `#0E4A3A #17705A #25A07A #5FD0A0 #B9F2D0`, weed masses `#0A2E22 #0F3D2C`, iron `#16201C #222E28 #2E3C34`, brass `#8A6A2C #B8923E #E0C070`, lamp light `#FFC860 #FFE6A8`, whale `#1E5C52 #2E7C6C #8FD6C0`, frog `#C8F560` with `#10180A` markings, timber ledge `#2A1E14 #3A2A1C`.

## scene.ts: the bridge

Rebuild it as a cabin corner (see the contract). Keep the whale's shape from the first pass; it was good.

**`back` (painted once): the water**
- Emerald in four or five flat steps, **brightest in the upper middle** where the surface light comes down, darkening to the edges and the bottom. Clear steps with wobbling organic edges, not straight bands.
- Dark **weed masses** hanging down from the top and crowding the upper corners: big soft-edged blotches built from overlapping rounded shapes, stippled at their edges.
- Two or three pale **light shafts**: flat wedges slanting down from the bright patch.
- Stipple everywhere: plankton and grain in pale green.
- Far reef mounds along the bottom.

**`draw` (every frame): what moves outside**
- **Marine snow** drifting, and a column of small **bubbles** rising near the right edge.
- Three or four **jellyfish**, pale and translucent-looking (a flat pale dome, a darker inner shape, trailing lines), pulsing slowly at different depths. Bigger than in the first pass: 14 to 22 px.
- **The visitor: the whale**, the first pass's silhouette in the whale colours with a pale belly and throat grooves. Glides in from the right and holds in the lower middle of the opening, bobbing 3 px (about 6.5 s); dives away down and to the right (about 4.5 s); a small one passes far off (about 6 s).

**`front` (painted once): the bridge**
- **The wall**, where the words are: dark iron plating with rows of **rivets** along the plate seams (dots with a 1 px highlight), a vertical pipe with one valve wheel at the wall's right end. Quiet behind the words: rivets along seams only.
- **The viewport frame**: a thick iron frame with generously rounded inner corners and a ring of rivets all the way round, and one slim vertical bar. Along its foot, the **scrolled railing**: a row of S-curls and circles in iron, about 16 px tall. This railing is the detail that says "old submersible".
- **The ledge**: a weathered timber shelf across the bottom with a brass edge strip. On it, painted once: a **ship's wheel** standing at the far right (spokes and handles, brass hub), a dark **bottle**, a rolled **chart**.

**`over` (every frame): what is alive**
- **The oil lantern** on the ledge at about a third across: brass base and cage, a glass with a flame, and a flat warm pool of light on the ledge and up the wall behind it. Its flame leans slowly. **This is the signal's home**: a small coloured lens in the lantern's cap is green, or amber with stragglers. (The flame itself stays warm.)
- **The companion: a frog** on the ledge near the wheel, about 16 px, chartreuse with a few black markings: **the one use of the accent.** Idle: its throat swells and falls on a four-second cycle and it blinks now and then. While the whale is alongside: it turns to face the viewport and sits up. When the whale dives: one hop.
- **Done:** small pale **shells** in a row on the ledge, one per quest finished.
- A slow shimmer of green light on the ledge: two or three flat pale patches that drift a few pixels (caustics, kept faint).

**Phone:** iron wall across the top with the words; viewport below with one bright patch; railing; ledge with lantern, frog, shells; wheel half cut by the right edge.

Timing: `{ arriving: 6500, departing: 4500, passing: 6000 }`.

## charm.ts: the gauge

A round **brass pressure gauge** (about 84 px across) on a short pipe that rises from the bottom edge, with a **sight glass** beside it: a vertical glass tube in brass collars.

- `progress`: the gauge's needle sweeps from lower left (0) to lower right (1) across a dial marked with ticks, the last fifth of the arc painted amber-brown as on a real gauge.
- `done`: one bubble in the sight glass per quest finished, stacked from the bottom, up to 12.
- `boarding`: the needle trembles a degree either way and a bubble or two rises through the tube.
- `caution`: a small jewel lamp on top of the gauge is amber; green otherwise.
- Under 110 px tall: the gauge alone.

## backdrop.ts: the water beyond the hull

- `back`: mottled stipple in a green two shades above the ground, gathered into large soft blotches; a few long kelp fronds rising from the bottom corners, two shades up.
- `draw`: about 30 specks of marine snow sinking slowly, and a few small bubbles rising at the far left.

## frame.css: riveted plate

1. **`.panel`: plates.** A 1 px `--color-border` edge and a rivet (a 4 px dot in `--color-border-strong` with a 1 px lighter top-left highlight) 6 px in from each corner. Works from 44 px tall upward.
2. **`.next-card`: the brass frame.** A double rule (two zero-blur inset rings, 2 px apart) and a row of rivets along the top and bottom edges every 28 px, plus the corner rivets.
3. **`.board-sign`: a maker's plate.** Pressed plate, no cut corner, a 4 px band of `--color-primary-d` along the top, and a rivet near each end.
4. **`.btn-primary`:** pressed plate, a 3 px band of `--color-primary-d` along the bottom.
5. **`.app-sidebar`: the hull.** Horizontal plate seams every 120 px with rivets along each seam every 24 px, all within two shades of the surface, and a 2 px rib in `--color-border-strong` down the right edge. **`.app-tabbar`:** a row of rivets along its top edge.
6. **`.scene-window`:** radius 10 px, no extra frame.

## Checklist for the pictures

- At a glance, `scene-stopped` is a dark iron room with a **bright green window** and one warm lamp. If the water is dark, it is wrong.
- The scrolled railing, the rivets and the lantern must be obvious in `window-2x`.
- Chartreuse appears once: the frog.
- With the window covered, `quests-1280` still says "submersible": rivets, plate seams, the gauge.
