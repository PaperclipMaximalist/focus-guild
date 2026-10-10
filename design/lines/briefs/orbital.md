# Ring Line (`orbital`), second pass: the cosmic compartment

**Journey:** "A worn, cosy compartment on a slow train through space, with a crystal for company."

**Window hint (for Settings):** "A shuttle draws alongside while a block is boarding and peels away when you finish a quest."

**Order:** 1

## Why this is being redone

The first pass was a dark panel with a dim planet. The owner: "the crystal and … the space orbital ship elements aren't present and it's just a different colorway". This pass is built around `01-cosmic-compartment.png`, and it should be unmistakable.

## The world

Open these in `design/lines/sources/` and look hard at the first:

- `01-cosmic-compartment.png` — **the primary.** A cluttered train compartment in space. Take: the **magenta crystal** hovering over a small round table; **tan suitcases** with straps, buckles and stitched patches; **monstera leaves** crowding in from the corners; a **purple** sky with ringed and striped planets; sheets of paper adrift outside; and above all the **stipple**: every surface shaded with grain like a risograph print.
- `04-orbital-lounge.png` — violet and magenta deep space behind a long low window; a dot-matrix vent in the bulkhead.
- `24-orbital-capsule.png` — a planet filling the lower window; warm interior against cold space.
- `14-dining-car.png` — a marquee over a panoramic window; curtains; dusk pink and violet together.

What makes it this place and no other: **purple space, warm tan luggage, a pink crystal, olive leaves, and grain over everything.** Four colour families, not one.

Leave out: the man, the cat, the clock, the neon lettering, the cigarette.

## Colours

Aubergine ground, **warm parchment text** (not cold white: this cabin is lit by a lamp), pink-magenta accent. Start here and let the checker correct lightness:

```
bg #0D0A17  surface #171226  surface2 #231C38
border #2D2446  border-strong #55467F
text #F3E7CC  muted #A99BBE
primary #FF6FB1  primary-d #E0528F  on-primary #110309
gold #FFA24D  gold-d #D97F2B  fire #FF6B5E  green #5EE6A8  teal #57D9C7  blue #7DB4FF
radius: card 10  sm 3  md 6  lg 8  xl 10  2xl 12  3xl 14
```

Scene colours (not tokens; use freely on the canvases): space violets `#241A52 #2E2168 #3B2A80`, nebula plum and magenta `#5A2A78 #8A2F86`, planet lilacs `#6C56B8 #8F7ADB #B9A8F0`, luggage tans `#B89B6A #D2B98A #8C7448`, table rust `#9A3A2A #C2543A`, leaf olives `#6E7A2C #9AA63C #C8CF6A`, crystal pinks `#7A1458 #C02A8C #FF6FB1 #FFC2E0`, paper cream `#E9DDB8`.

## scene.ts: the compartment

Rebuild it as a cabin corner (see the contract). The first pass's station spur and drone are gone.

**`back` (painted once): outside**
- Space in three or four broad flat bands of violet, darkest at the top. Over them, **stipple**: a river of fine dots sweeping diagonally across the view, like the tan dust trail in the still, in pale lilac and cream. This is the texture that makes the picture; give it thousands of dots.
- A **giant ringed planet**, low and right of centre in the opening, about 60 % of the opening's height, partly cut by the frame. Lilac, with five or six flat stripes, a hard-edged lighter crescent on its lit side and stippled shadow on the other. A broad flat ring crossing in front of it.
- A second, smaller planet, blue-grey and mottled, high up.

**`draw` (every frame): what moves outside**
- Three or four **sheets of paper** tumbling slowly past, cream, each a tilted rectangle that changes its tilt as it drifts. Unmistakably from the still.
- **The visitor: a shuttle.** Keep the capsule from the first pass (rounded nose, one window strip) but paint it for this world: cream hull, a rust stripe, lilac window. It draws alongside from the right and holds level in the lower right of the opening (about 5 s, easing out); leaves by climbing away to the right (about 4 s); a small one passes far off (about 4 s).

**`front` (painted once): the cabin**
- **The wall**, where the words are: deep aubergine, vertical panel seams every 70 px or so, faint stipple. Dark and quiet.
- **The window frame**: a wide opening with generously rounded corners in a thick, slightly lighter frame, split by one horizontal bar a quarter of the way down, as in the still.
- **Monstera leaves** coming in from the top-right corner and the right edge, in front of the frame: three or four big split leaves in the olives, stippled. Bold. They are the first thing that says "this cabin".
- **The table**: a round café table top seen from slightly above (a wide ellipse), rust red, low in the picture at about 55 % across on a wide window, with its far edge darker. A short stem below it running off the bottom.
- **Two stacked suitcases** at the bottom right, tan, each with two straps, buckles, corner caps, and one **stitched patch** (a lighter square sewn on with dashes). Stippled shading on their shadowed side.

**`over` (every frame): what is alive**
- **The crystal** (this line's companion and its one use of the accent): a tall diamond hovering about 14 px above the table, around 22 by 46 px, in four flat facets from deep to pale pink with one hard white glint. Under it, on the table, a flat pink ellipse of its light. Around it, one thin tilted orbit ring.
  - Idle: it bobs 2 px over four seconds and turns slowly (swap which facets are light on a slow cycle).
  - While the shuttle waits: a second ring appears and two bright motes circle it.
  - When the shuttle leaves: the glint flashes across all four facets once.
- **Done:** small pink shards lying on the table around the crystal's foot, one per quest finished, scattered but countable (fixed positions, filled in order).
- **The signal:** a small wall lamp on the frame's left post, between the words and the opening: a dome with a flat pool of light on the wall below it. Green; amber with stragglers.
- The lowest leaf sways a pixel or two.

**Phone:** wall across the top with the words; the opening below; table, crystal, shards and signal all in frame; suitcases may be half cut by the right edge; one leaf.

Timing: `{ arriving: 5200, departing: 4200, passing: 4000 }`.

## charm.ts: the crystal

The crystal again, larger (about 44 by 96 px), hovering over **a stack of two suitcases** that stands on the bottom edge. Same stitching and straps as in the scene.

- `progress` fills it: the crystal is dim plum at 0 and lights from its lower point upward to full pink at 1, with a hard line between lit and unlit.
- `done`: one mote in orbit per quest finished (up to 12), on two tilted rings.
- `boarding`: it bobs a little faster and the glint travels round the facets.
- Always: a slow bob.
- Under 110 px tall: the crystal alone, no suitcases.

## backdrop.ts: space through the cabin's gaps

- `back`: stipple grain across the whole page in a violet two shades above the ground, denser toward the bottom right; and one enormous faint ring arc, a hairline two shades up, sweeping across the lower right corner as if a planet sat just off the page.
- `draw`: about 30 stars drifting left at 2 to 5 px a second, three sizes, the largest twinkling slowly; and, rarely, one sheet of paper tumbling across.

## frame.css: luggage

The app's surfaces are made like the suitcases.

1. **`.panel`: corner caps.** A small quarter-round cap in `--color-border-strong` at each corner (about 7 px), like the metal corners on a case. A 1 px `--color-border` edge all round. Works from 44 px tall upward.
2. **`.next-card`: a stitched case.** The corner caps, larger (10 px), plus a dashed line of stitching 6 px inside the edge all the way round in `--color-border-strong`. This is the one fully stitched surface on the page.
3. **`.board-sign`: a luggage tag.** Rounded plate, no cut corner, with a line of stitching (dashes in `--color-on-primary` at about 35 %) 4 px inside its edge. Keep the title and the clock clear of it.
4. **`.btn-primary`:** rounded plate, no cut corner, a 2 px band of `--color-primary-d` along the bottom.
5. **`.app-sidebar`: a bulkhead.** Along its right edge, a double hairline with a rivet every 56 px. **`.app-tabbar`:** the same along its top edge.
6. **`.scene-window`:** radius 14 px, no extra frame: the scene draws its own.

## Checklist for the pictures

- At a glance from across the room, `scene-stopped` should be purple, tan, pink and olive. If it is mostly near-black, it is wrong.
- The stipple must be visible in `window-2x`. If the surfaces look like flat vector fills, add grain.
- The crystal is the brightest thing in the window and the only pink.
- The words sit on plain dark wall with nothing behind them.
- With the window covered, `quests-1280` still says "luggage": corner caps, the stitched tag, the crystal in the sidebar.
