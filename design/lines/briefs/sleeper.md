# Timber Line (`sleeper`)

**Journey:** "A night sleeper through birch country, stopping at lamp-lit halts."

**Window hint (for Settings):** "The train stops at a lamp-lit halt while a block is boarding and pulls out when you finish a quest."

**Order:** 3

## Where it comes from

Open these in `design/lines/sources/`:

- `08-autumn-sleeper.png` — honey light on dark timber, birch trunks striping the window. Take: pale trunks against dark; honey as the only warm light.
- `05-coastal-berth.png` — a wide rounded window over a work table. Take: the clean split between the view above and the table below.
- `07-woodland-berth.png` — square-cut beams framing a forest. Take: heavy square timber framing; an acorn as a small countable thing.
- `15-rainy-hearth.png` — one amber glow outside a dark, book-lined nook. Take: how little light is needed.
- `20-alpine-chess.png` — a sleeper compartment, patient and quiet. Take: the mood.

Leave out: fairy lights, vines, mugs, laptops, cushions, food, every animal character, daylight skies.

## Colours

Espresso-black ground, warm cream text, **honey** accent. Start from these and let the checker correct lightness:

```
bg #0F0B09  surface #18120F  surface2 #241B16
border #2E221C  border-strong #5C4638
text #F5E9D8  muted #A8947F
primary #F2C14E  primary-d #D4A438  on-primary #1A1204
gold #F58A3C  gold-d #D06E24  fire #F2645A  green #7FD99A  teal #6FCFC0  blue #8DB6F0
radius: card 3  sm 1  md 2  lg 3  xl 3  2xl 4  3xl 6
```

The accent is honey-yellow, hue 40 to 48. "Attention" (`gold`) is deliberately pushed toward orange so the two cannot be confused: keep them at least 14° apart.

## Frame

1. **The window is a carriage window in a timber frame.** Square corners, a 2 px `--color-border-strong` frame, and a sill: a 4 px band of `--color-surface2` along the bottom edge (zero-blur inset box-shadow).
2. **The sign and the button are square-cut boards.** No cut corner, radius from the tokens. Each gets a 2 px band of `--color-primary-d` along its bottom edge (zero-blur inset box-shadow), like the edge of a plank.
3. No motif on this line: the timber frame is enough.

## Scene

You are aboard, looking out of a sleeper carriage at night. The country goes by; when the train stops, it stops.

On this line the visitor is not something that comes to you: it is **the halt the train pulls into**. The whole view scrolls slowly left while under way and comes to rest while the visitor is `stopped`.

Back to front:

- **Sky.** One flat plum-black, a shade off the ground colour. A thin low moon on the right if it helps; no stars in the words' region.
- **Far hills.** Two flat ridgelines, the farther one barely off the sky, scrolling very slowly.
- **Birches.** Pale, narrow trunks with a few dark notches each, in two depths (thin and dim behind, wider and paler in front), scrolling left. Sparse and low-contrast on the left under the words; denser on the right. Speed about 6 px/s far and 18 px/s near while under way, easing to zero as the halt arrives and back up as it leaves. Keep your own speed in the scene's state and ease it with `dt`.
- **Leaves.** A handful of small leaves falling slowly. No rain.
- **The trackside.** A dark bank from about 80 % down, with a hairline along its top.
- **The visitor: a halt.** A short wooden platform with a low canopy on two posts, one lamp and a blank nameboard. The lamp's small flat shade is the **one use of the accent**; its light is a faint flat cone and a faint smear on the platform, as on the Night Line. It slides in from the right and comes to rest filling roughly the right 40 % of the window (about 3.8 s, easing out). Departing, it slides off to the left as the train pulls away (about 3.4 s, easing in). Passing, it goes by without stopping (about 2.2 s).
- **Inside, fixed, along the bottom right:** the window sill, a flat band a shade lighter than the frame. On it:
  - **The signal:** a small cabin lantern at the far right of the sill. Green; amber when there are stragglers.
  - **Done:** acorns in a row on the sill, one per quest finished, left of the lantern. Simple: a round body and a darker cap.
  - **The companion: a sparrow.** A plain small bird, about 16 px, standing on the sill left of the acorns. Idle: it turns its head every several seconds. While the train is stopped: it settles, lower and rounder. On departure: one small hop.

Suggested timing: `{ arriving: 3800, departing: 3400, passing: 2200 }`.

In a still frame (`moving === false`) nothing scrolls; draw the trees where `layout` put them.

## Checklist for the pictures

- Birches must read as birches, not as a barcode: vary width, spacing and height, and keep them few.
- The halt must read as a small station at a glance: canopy, lamp, platform edge.
- The sill objects are tiny. Check them on the phone shot: lantern, acorns and sparrow must all be in frame and not collide.
- Warm, but dark. If the picture looks brown rather than night, darken it.
