# Ring Line (`orbital`)

**Journey:** "A slow orbit past a ringed giant, where shuttles dock at the spur."

**Window hint (for Settings):** "A shuttle docks while a block is boarding and casts off when you finish a quest."

**Order:** 1

## Where it comes from

Open these in `design/lines/sources/`:

- `01-cosmic-compartment.png` — the grain of deep space, ringed planets, one magenta light in a dark cabin. Take: the planet half out of frame; a single pink light against indigo.
- `04-orbital-lounge.png` — the long low window with a modular bulkhead under it and a dot-matrix vent. Take: the vent grille (3 × 6 dots) and the stadium-ended window.
- `11-orbital-bunk.png` — a rounded pressure window with a docking arm outside. Take: the window's soft corners; a truss reaching across the view.
- `24-orbital-capsule.png` — Earth filling the lower window. Take: how big and how dark a planet can be and still read.

Leave out: nebula clouds and coloured gas, foliage, loose objects, any character, the decals and lettering.

## Colours

Indigo-black ground, cool lilac-white text, **pink-magenta** accent. Start from these and let the checker correct lightness:

```
bg #0A0814  surface #131022  surface2 #1E1934
border #272045  border-strong #4A3F7A
text #EEE9FA  muted #9A8FBF
primary #FF6FB1  primary-d #E0528F  on-primary #1A0612
gold #FFA24D  gold-d #D97F2B  fire #FF6B5E  green #5EE6A8  teal #57D9C7  blue #7DB4FF
radius: card 10  sm 3  md 6  lg 8  xl 10  2xl 12  3xl 14
```

Keep the accent's hue between 322 and 338. It must stay clearly pink beside the red of "late".

## Frame

1. **The window is a pressure port.** Radius 18 px, a 1 px `--color-border-strong` edge, and a second hairline 4 px inside it (two zero-blur inset box-shadows: a ring of `--color-bg`, then a ring of `--color-border`).
2. **The sign and the button lose the cut corner** and become plain rounded plates (sign: top corners `--radius-card`, bottom square; button: `--radius-md` all round).
3. **Motif: a vent.** At the right end of the sign, just left of the clock, a 3-row by 6-column grid of 2 px dots in `--color-on-primary` at about 35 % strength, drawn with one hard-stopped radial gradient on `.board-sign::after`. It must not push the clock or the title.

## Scene

You are at an observation port on a station. It is quiet out there.

Back to front:

- **Space.** One flat colour a little bluer than the ground. A few dozen fixed stars at three strengths; in the words' region none above the dimmest strength.
- **The giant.** A very large disc, lower right, more than half out of frame, two shades lighter than space, with two or three flat bands a shade apart and one thin tilted ring that passes behind it. It is the night side: dim. It should be the thing you notice third.
- **A small moon** crossing the upper right over several minutes.
- **Dust.** Six to ten flecks drifting slowly left, as if the station is turning.
- **The spur.** A docking boom along the bottom of the window at about 80 % down: a flat dark truss with a hairline of pale lilac along its top edge, a docking collar at about 62 % across, and a short mast at the far right.
- **The visitor: a shuttle.** A rounded-nose capsule about three times as long as it is tall, no taller than 18 % of the window, one band of pale lilac windows, two small thruster marks at the back. It arrives from the right, slowing all the way in (about 5 s), and docks nose-to-collar. While docked, a short boarding tube joins it to the spur: that tube's edge is the **one use of the accent**. Departing, it backs off a little, then pulls away up and to the left (about 4 s). Passing, a smaller one crosses the middle distance on the right half, below the words (about 4 s).
- **The signal:** a beacon at the top of the mast. Green and steady; amber when there are stragglers.
- **Done:** portholes along the spur, one lit per quest finished, in a single row left of the collar.
- **The companion: a capsule drone.** A pill about 14 by 8 px with a visor line, hovering just above the spur at the right. Idle: it bobs one pixel, slowly. While the shuttle is docked: it stops bobbing and sits level. On departure: its visor slides toward the leaving shuttle for a second, then back.

Suggested timing: `{ arriving: 5200, departing: 4200, passing: 4000 }`.

## Checklist for the pictures

- The giant must not look like a glowing ball. Flat, dim, cropped.
- The shuttle must read as a shuttle at a glance on the phone shot, where it will be small.
- Pink appears exactly once in the window.
- With the greeting over it, the upper left is nearly empty space.
