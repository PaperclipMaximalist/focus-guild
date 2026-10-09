# Salvage Line (`dispatch`)

**Journey:** "A dispatch cabin over the breaker's yard, where a courier skiff docks while you work."

**Window hint (for Settings):** "A courier skiff docks while a block is boarding and lifts off when you finish a quest."

**Order:** 4

## Where it comes from

Open these in `design/lines/sources/`:

- `09-scrap-dispatch.png` — a riveted operator's cabin over a dusty yard, one green screen. Take: oxide and brass darkness; phosphor green as the colour of "all is well"; a parcel as a countable thing.
- `17-stranded-fleet.png` — beached hulls seen from a calm desk. Take: tilted ship silhouettes; gantries as thin lines; the calm.
- `19-pilot-station.png` — a canopy with corner brackets and hazard stripes. Take: bracketed corners; one hazard stripe.
- `22-industrial-skyline.png` — a grey, silent skyline with a single lit pip. Take: the restraint. One small light is enough.

Leave out: wires, dials, toggles, boxes in heaps, robots and every other character, lettering, ivy.

## Colours

Oxide-black ground, parchment text, **enamel blue** accent (the one cool, clean thing in a rusted world). Start from these and let the checker correct lightness:

```
bg #0F0D0A  surface #191511  surface2 #26201A
border #302820  border-strong #615240
text #F1E6D4  muted #A59682
primary #7CB7FF  primary-d #5B9AE6  on-primary #06101F
gold #FFA640  gold-d #D9842B  fire #FF6A55  green #4BE083  teal #5FD6C4  blue #B7A6FF
radius: card 4  sm 2  md 3  lg 4  xl 4  2xl 6  3xl 8
```

Keep the accent's hue between 205 and 220. `blue` (a spare status hue) is moved to violet on this line so it cannot be mistaken for the accent. `green` is phosphor green: on this line "on time" is the colour of the yard's screens.

## Frame

1. **The window is a canopy with bracketed corners.** A 1 px `--color-border-strong` edge. At the top-right and bottom-right corners only, an L-shaped bracket 14 px long and 2 px thick in `--color-muted`, set 6 px in from the edge (`::before` and `::after`, `pointer-events: none`). Nothing at the left corners: the words are there.
2. **The sign carries one hazard stripe.** No cut corner. At its left end, a 10 px-wide block of 45° stripes in `--color-on-primary` and `--color-primary` (one hard-stopped repeating gradient as a second background layer). The title must stay clear of it, so draw it in the sign's existing left padding only. The button: plain plate, no cut corner, a 2 px band of `--color-primary-d` along the bottom.
3. The hazard stripe is this line's motif. Nothing else.

## Scene

You are in a dispatch cabin above a salvage yard, after dark.

Back to front:

- **Sky.** One flat warm black. Low down, one or two broad flat bands a shade lighter: dust in the air. Bands, not a fade. None in the words' region.
- **The yard.** Silhouettes of beached hulls, each leaning a few degrees, in two depths. Low on the left; on the right a gantry crane as thin lines, its hook swinging a pixel or two, slowly.
- **Dust.** A sparse field of flecks drifting slowly right.
- **The dock.** A landing rail along the bottom from about 80 % down, with a hairline top edge and a short mast at the far right.
- **The visitor: a courier skiff.** A boxy hover-barge: a small cab at the front with one pale window, a flat cargo bed with one crate, a skid under it. About three times as long as tall, no taller than 16 % of the window. A single stripe along its side is the **one use of the accent**. It comes in from the right and settles over the rail at about 60 % across (about 3.6 s, easing out), then hovers with a 2 px bob. Departing, it lifts and leaves up and to the left (about 3.2 s). Passing, a smaller one crosses higher up on the right half, below the words (about 2.6 s).
- **The signal:** a two-lamp stack light on the mast. Green lower lamp; amber upper lamp when there are stragglers. Only one lit at a time.
- **Done:** crates stacked on the dock left of the mast, one per quest finished, in rows of four, at most three rows.
- **The companion: a moth.** About 12 px across, resting on the right-hand edge of the window frame about a third of the way up. Idle: wings folded, a one-pixel twitch every nine seconds or so. While the skiff is docked: wings open flat and still. On departure: it lifts about 6 px and settles back.

Suggested timing: `{ arriving: 3600, departing: 3200, passing: 2600 }`.

## Checklist for the pictures

- The hulls must read as ships on their sides, not as random polygons: a hull line, a bridge, maybe one funnel each.
- The skiff must not look like a toy truck. Low, long, plain.
- Rust is a tint, not a colour: if the picture looks orange or brown instead of night, darken it and pull the saturation down.
- Blue appears exactly once in the window. Green appears only on the signal.
- Crates must be countable on the phone shot.
