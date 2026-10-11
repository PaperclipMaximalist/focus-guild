# Ornaments: the small drawn things

Added 2026-10-10, after the owner saw the cabin windows and said: "I don't need a picture header exactly but I need small elements to be incorporated around the UI, I mean the borders, symbols, small pictures that are unique, maybe borders that aren't a single line and have more style."

So each line paints a kit of small pieces in `client/src/lines/<id>/ornaments.ts`, and the app puts them on **every page** by itself (`client/src/lines/dress.ts` turns each piece into a picture; the last block of `client/src/index.css` places them). A line writes no CSS for any of this.

```ts
export default defineOrnaments({
  frames:  { panel, card, sign },        // FramePiece: { slice, edge, paint }
  edges:   { vertical, horizontal },     // Sprite:     { w, h, paint }
  sprites: { emblem, mark, rule, tail, spot },
});
```

`paint(p)` gets the same `Paint` as a scene's `back` (`ctx`, `w`, `h`, `rnd`). Sizes are CSS pixels; the engine paints at twice that, so half-pixel detail is real. Import nothing but `../types`. All the canvas rules of the contract apply: flat colour, stipple and hard edges, no fades, blur or glow, no text, random numbers only from `rnd`.

## The ten pieces

| Piece | Where the app puts it | Size | What it is for |
|---|---|---|---|
| `frames.panel` | Round every raised surface, from a 44 px row to a tall list | `slice` 8 to 12 | The line's everyday border. More than one line: a rule and a second rule, a stitched or riveted run, a proper drawn corner. |
| `frames.card` | Round the one loud card on Today ("Now boarding") | `slice` 16 to 24 | The fullest frame the line has. Corners with a real ornament in them. |
| `frames.sign` | Over the accent-filled sign above a board | `slice` 8 to 12 | Drawn in dark ink on the accent: `--color-on-primary` at part strength, or a darker shade of the accent. |
| `edges.vertical` | Repeats down the sidebar's right edge | 8 to 16 wide, any height | A trim with a rhythm: a route with stops, a rib with rivets, a stack of log ends. |
| `edges.horizontal` | Repeats along the top of the phone's tab bar and the bottom of its top bar | any width, 6 to 12 tall | The same idea turned on its side: a railing, a garland, a row of studs. |
| `sprites.emblem` | Beside "Focus Guild" in the sidebar, replacing the plain square; and in the line picker | 24 by 24 | The line's badge. One object, bold enough to read at 24 px. |
| `sprites.mark` | Before every section label ("Top quests", "Now boarding", "More") | about 14 by 14 | A symbol. Two or three flat colours, a clear silhouette. It appears dozens of times, so it must be quiet and crisp. |
| `sprites.rule` | Under every page title | about 140 by 12 | A drawn rule with one small motif on it. |
| `sprites.tail` | At the foot of every page, centred | about 150 by 56 | A tailpiece, as at the end of a chapter in an old book. A small picture from the line's world. |
| `sprites.spot` | In empty states ("No active quests", "Nothing planned for this day") | about 180 by 120 | A small scene with a little charm. The one place for a picture with some story in it. |

## How a frame is painted

A frame is one square tile of side `slice * 2 + edge`, in nine slices: four corners `slice` px square, and between each pair a stretch `edge` px long that **repeats** along that side. The middle is left unpainted. The tile is laid over the outer edge of the surface, `slice` px thick.

- Whatever runs along an edge must tile: its period has to divide `edge` exactly, and it must be the same at both ends of the stretch.
- Paint the four sides the same way round the tile: draw one corner and one edge, then repeat them with `ctx.translate` and `ctx.rotate` (or mirror with `ctx.scale(-1, 1)`), so the frame is symmetrical.
- Keep the edge's art within about 8 px of the outside, and the corner's art inside its `slice` square. A panel's own content starts 12 to 16 px in; a frame that reaches further will sit on text.
- Leave the centre and anything you do not draw fully clear (never fill the tile).
- The frame is square-cornered. Set the line's `--radius-card` (in `tokens.css`) small enough that the surface's own corner does not poke out from behind it, or draw a corner that covers it.

## What "more style" means here

The first borders were a hairline with a 3 px dot in each corner, and they read as nothing. Aim higher:

- A border is **two or three things together**: a strong rule, a fine rule inside it, and a run of something (stitches, rivets, ticks, notches) between or beside them.
- A corner is **an ornament**, not a dot: a cap with a rivet in it, a mitred joint with a peg, a bracket with a curl, a bolted plate with hazard stripes.
- Use three or four tones from the line's material (dark, mid, light, and one highlight edge), so the piece has a lit side.
- Use the accent **sparingly or not at all** in frames, trims, rules and tailpieces: it means "act here". The mark and the emblem may use it.
- Small does not mean vague. At 14 px, draw to the half-pixel, with hard edges, and check it at twice the size in `kit-2x.png`.

## What to remove from `frame.css`

The app now draws frames, trims and the sign's ornament from your kit. Delete from your `frame.css` anything that would double up: dots, pegs, rivets, stitched outlines and seams on `.panel`, `.next-card`, `.app-sidebar`, `.app-tabbar`, `.app-topbar`, and any `::before` / `::after` on `.board-sign`. Keep what the kit does not do: the sign's and button's fill and corner shape, button bands, and `--radius-card` on `.scene-window`.

## Checking

`npm run line:shoot <id> scene` now also writes **`kit-2x.png`**: every piece on one sheet at twice its size. Look at it first. Then the full shoot, and look at `quests-1280`, `route-1280`, `today-1280`, `today-375` (the two trims on the phone's bars) and `picker-1280` (the emblem in the picker).

Ask of the sheet:

1. Could I name the line from this sheet alone, with no window and no sidebar object in sight?
2. Is each border more than a line? Does each corner have something drawn in it?
3. Does the 44 px row still read, with its frame not touching the words?
4. Is the mark crisp, and quiet enough to appear thirty times on a page?
5. Do the trims repeat without a visible seam?

## The kits

### Night Line (`night`): station fittings

Material: blue enamel plate, steel, the line map. Tones `#1C2249 #363E78 #5A66B8 #9FE8FF`, yellow `#FFD23A` only where named.

- **panel**: an enamel plate. A strong outer rule, a fine inner rule, and in each corner a round screw head with a slot. Along each edge, small ticks like a timetable's ruling, every 8 px.
- **card**: a ticket. Corners cut on the diagonal with a small chevron pointing inward; along the top and bottom edges a row of perforation dots; a second fine rule inside.
- **sign**: on the yellow, in dark ink: a double rule and a chevron at each end pointing outward.
- **vertical**: the line itself: a cold-white route line with a ring for a stop every 48 px, a filled dot every third.
- **horizontal**: the platform edge: a row of raised studs, with the yellow line beneath them. (The one use of yellow in a trim: it is the platform line.)
- **emblem**: the ringed moon in a rounded square of night blue.
- **mark**: a stop ring with a short tail of line, in cold white with a yellow centre.
- **rule**: a route line with three stops and a terminus bar at its right end.
- **tail**: the maglev in silhouette on its line, the ringed moon behind, a few strokes of rain.
- **spot**: an empty platform bench under a lamp in the rain, an umbrella leaning on it.

### Ring Line (`orbital`): luggage

Material: tan leather, brass, stitching, and the crystal. Tans `#8C7448 #B89B6A #D2B98A`, brass `#C9A24A #E8CF7A`, aubergine `#2D2446 #55467F`, pinks `#C02A8C #FF6FB1 #FFC2E0`.

- **panel**: a suitcase's edge. A leather-toned rule, a line of stitching (dashes) just inside it, and in each corner a brass cap: a rounded triangle with a rivet in it and a lit edge.
- **card**: a trunk. Larger brass corners with two rivets each and a small engraved curl; stitching all round; and on the top and bottom edges a strap passing through, with a buckle at the middle of the repeat.
- **sign**: a luggage tag, in dark ink on the pink: stitching inside the edge and an eyelet ring at the left corner.
- **vertical**: a strap: a band with stitched edges and a brass rivet every 40 px.
- **horizontal**: a line of stitching with a brass rivet every 32 px.
- **emblem**: the crystal with its tilted orbit ring.
- **mark**: a four-point sparkle with a small crystal shard at its centre, in pink.
- **rule**: an orbit: a fine line with a small ringed planet at the left end and three star dots along it.
- **tail**: two stacked suitcases with a monstera leaf across them and the crystal hovering above.
- **spot**: an open, empty suitcase with the crystal floating out of it and a few sheets of paper drifting up.

### Abyssal Line (`deep`): brasswork

Material: brass and iron, rope, glass. Brass `#6A5222 #8A6A2C #B8923E #E0C070`, iron `#16201C #2E3C34 #46584E`, water `#25A07A #5FD0A0`, chartreuse `#C8F560` only where named.

- **panel**: a riveted plate. An iron rule, a fine brass rule inside it, round rivets with a highlight along each edge every 12 px, and a larger domed rivet in each corner.
- **card**: a porthole's surround. A thick brass band with a lit upper edge and a shadowed lower one, bolts in the band, and in each corner a scrolled bracket (an S-curl).
- **sign**: a maker's plate, in dark ink on the chartreuse: an engraved double rule and a rivet in each corner.
- **vertical**: a rope: twisted strands, with a knot every 64 px.
- **horizontal**: the scrolled railing from the bridge: S-curls and rings in iron between two rails.
- **emblem**: a ship's wheel in brass.
- **mark**: a small anchor in brass.
- **rule**: a length of rope ending in a knot at the left and frayed at the right.
- **tail**: the whale in silhouette with a trail of bubbles and a jellyfish below it.
- **spot**: a diving helmet on the seabed with a jellyfish drifting past and bubbles rising; the frog sitting on the helmet (the one use of chartreuse).

### Timber Line (`sleeper`): joinery

Material: wood in three tones, pegs, a little brass, leaves. Wood `#2A1C14 #3A281C #5C4638 #7A5E48`, honey `#F2C14E`, leaf `#C4521A #F0872A`, cream `#F4EAD8`.

- **panel**: a picture frame. Two rules the width of a moulding apart, mitred at the corners (a diagonal joint line) with a peg in each joint, and fine grain ticks along the moulding.
- **card**: a carved frame. A wider moulding with a scalloped inner edge, and in each corner a carved leaf.
- **sign**: a hung board, in dark ink on the honey: a rule, a nail head at each corner, and a short length of chain link at the top two corners.
- **vertical**: a log wall's end grain: a column of log ends, each a circle with two rings and a crack, 16 px apart.
- **horizontal**: a garland of fairy lights: a sagging wire in repeating swags with a warm bulb at each low point and two smaller ones between.
- **emblem**: an acorn.
- **mark**: a birch leaf in autumn orange.
- **rule**: a twig with three small leaves and a bud.
- **tail**: the sparrow on a branch with two acorns and a few leaves.
- **spot**: a steaming mug beside the oil lantern and a closed book, on a plank.

### Salvage Line (`dispatch`): bolted plate

Material: copper, rust, hazard paint, and the green screen. Copper `#3A2418 #4E3222 #7A5234 #9A6E48`, rust `#8A3A1E #B2522A`, hazard `#C9A227` with `#1A1410`, phosphor `#4BE083 #A8F5C4`, blue `#7CB7FF` only where named.

- **panel**: a bolted plate. A copper rule, a fine inner rule, a hex bolt in each corner with a lit facet, and short weld beads along each edge every 10 px.
- **card**: a hazard frame. In each corner a plate of 45° hazard stripes with a bolt on it; along the edges a rule with a measuring scale of ticks, a long one every fourth.
- **sign**: a stencilled plate, in dark ink on the blue: a rule and a chevron of three stripes at each end.
- **vertical**: a pipe run: a pipe with a flanged joint and two bolts every 56 px.
- **horizontal**: tread plate: a band of small raised lozenges in a staggered row.
- **emblem**: the green CRT: a bulbous monitor with three lines of readout.
- **mark**: a block cursor and a prompt chevron in phosphor green.
- **rule**: a pipe with a flange at each end and a valve wheel a third of the way along.
- **tail**: a stack of three taped parcels with the courier skiff hovering behind.
- **spot**: a crane hook lowering a parcel onto a pile of crates, a moth circling a small lamp.
