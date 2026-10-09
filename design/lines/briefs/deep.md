# Abyssal Line (`deep`)

**Journey:** "A slow dive along the reef wall, where a whale keeps pace while you work."

**Window hint (for Settings):** "A whale swims alongside while a block is boarding and dives away when you finish a quest."

**Order:** 2

## Where it comes from

Open these in `design/lines/sources/`:

- `02-submersible-lookout.png` — one colour of light flooding a riveted viewport. Take: the discipline of a single green-teal cast; the riveted frame; something vast and soft outside.
- `06-submerged-transit.png` — an ordinary carriage, underwater, completely still. Take: the weightlessness; small drifting jellies; a whale's shape overhead.
- `25-celestial-whale.png` — a whale gliding over a dark teal night, one warm light in front. Take: the long horizontal body as the event in the window; teal-black depth.
- `21-emerald-cathedral.png` — deep green haze with tiny warm lights far off. Take: the stepped depth of the haze, flat band over flat band.

Leave out: clutter on the sill, instruments, fish in schools, any character, buildings, lettering, chandeliers and point-lights.

## Colours

Teal-black ground, pale sea-white text, **chartreuse** accent (the lure of a deep-sea fish: the one bright thing down here). Start from these and let the checker correct lightness:

```
bg #061014  surface #0C1A20  surface2 #142730
border #1A3038  border-strong #35606C
text #E2F3F4  muted #86A9AE
primary #C8F560  primary-d #A9D640  on-primary #0B1402
gold #FFA24D  gold-d #D97F2B  fire #FF7566  green #5EE6A8  teal #57D9C7  blue #7DB4FF
radius: card 8  sm 2  md 5  lg 6  xl 8  2xl 10  3xl 12
```

Keep the accent's hue between 70 and 86: yellow-green, clearly not the green of "on time". If the checker says green is too close, move the accent toward yellow, not the status.

## Frame

1. **The window is a riveted viewport.** A 1 px `--color-border-strong` edge and, 5 px inside it, a dotted seam (`outline: 1px dotted`, negative `outline-offset`). On windows 560 px and wider only, one vertical mullion at 74 % across: a 3 px bar of `--color-surface` with a hairline each side (`.scene-window::after`, `pointer-events: none`). No mullion on a phone.
2. **The sign and the button are pressed plate.** No cut corner. The sign gets a 4 px band of `--color-primary-d` along its top edge; the button a 3 px band of `--color-primary-d` along its bottom edge. Both are zero-blur inset box-shadows.
3. **Motif: a rivet.** A 5 px hollow circle (1 px `--color-border-strong`) before each `.section-label`, vertically centred. It must not change the label's height.

## Scene

You are behind the viewport of a submersible, moving slowly along a reef wall at depth.

Back to front:

- **Water.** One flat colour a little greener than the ground. Toward the upper right, two or three broad flat bands, each one shade lighter than the last, stepping up to where the surface would be. Bands, not a fade. None of them in the words' region.
- **Marine snow.** A sparse field of single-pixel flecks sinking slowly and drifting left.
- **The reef.** Along the bottom from about 80 % down: rounded mounds in two shades, lower on the left, rising on the right. A few kelp stalks on the right third that lean a pixel or two, slowly.
- **The visitor: a whale.** A long low silhouette of a few flat facets, a shade or two lighter than the water, with a paler belly line and one small eye. About half the window wide on desktop, no taller than 18 % of the window. It glides in from the right (about 6.5 s, easing out) and holds station in the lower middle, rising and falling 3 px and sweeping its tail slowly. Departing, it tips down and dives off the lower left (about 4.5 s). Passing, a far smaller one crosses the right half in the distance at mid height (about 6 s).
- **The signal:** a marker lamp on a short pole standing on the reef at the far right. Green; amber when there are stragglers.
- **Done:** small lit pips along the reef's ridge on the right, one per quest finished, in pale teal.
- **The companion: a drift jelly.** A dome about 12 px wide with three short tendrils, low on the right, clear of the signal. Idle: the dome squashes one pixel on a four-second pulse and it drifts a pixel or two. While the whale is alongside: the pulse steadies and it holds still. On departure: it rises about 6 px and settles back.
- **The accent, once:** a single chartreuse lure-light hanging from a thin arm at the bottom-right corner of the viewport, as if mounted on your own hull. Small. No halo.

Suggested timing: `{ arriving: 6500, departing: 4500, passing: 6000 }`.

## Checklist for the pictures

- The whale must read as a whale in silhouette, calm, not cartoon. Get the proportions right before anything else: long, low, a small fluke.
- The stepped bands of water must look deliberate, not like a broken gradient: make each step clearly visible and its edge straight or one clean curve.
- Nothing glows. A lamp is a small flat shape.
- On the phone shot the whale is cropped by the left edge; its head and eye must still be in frame.
