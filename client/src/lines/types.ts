/**
 * A line is one journey the app can be dressed as. The layout, the words and
 * every feature stay the same on all of them; a line supplies:
 *
 *   tokens.css   the colours (and corner radii), under :root[data-line="<id>"]
 *   frame.css    borders and patterns for the app's surfaces
 *   scene.ts     the cabin corner on Today: a wall, a window, what is outside it
 *   texture.ts   what its surfaces are made of: a tile for panels, one for the
 *                sidebar and the phone's bars, a pattern for the accent
 *   wall.ts      whatever is alive on the sidebar: rain, bubbles, lights
 *   backdrop.ts  the room behind the whole app, and a few drifting specks
 *   ornaments.ts the small drawn things: frames, trims, an emblem, marks, flourishes
 *
 * Each line is a folder in src/lines/ and is found by its folder, so adding
 * one touches no shared file. The contract a line has to meet is written out
 * in design/lines/CONTRACT.md and checked by `npm run line:check <id>`.
 */

/** What the visitor outside the window is doing. On the Night Line the visitor is the train. */
export type VisitorPhase = 'away' | 'arriving' | 'stopped' | 'departing' | 'passing';

export interface SceneTiming {
  /** ms for the visitor to come in and settle. */
  arriving: number;
  /** ms for it to leave. */
  departing: number;
  /** ms for one to go by without stopping. */
  passing: number;
  /** [shortest, longest] ms between passers-by when nothing is boarding. */
  passEvery: [number, number];
}

/** What a painter of a still layer is handed. */
export interface Paint {
  ctx: CanvasRenderingContext2D;
  /** Size in CSS pixels. The context is already scaled for the screen. */
  w: number;
  h: number;
  /** False on a phone-width canvas. */
  wide: boolean;
  /** Seeded random numbers: the same sequence after every layout, so a still frame never changes. */
  rnd: () => number;
}

/** What every live canvas knows when it draws one frame. */
export interface Frame extends Paint {
  /** Milliseconds, always increasing. Fixed in a still frame. */
  t: number;
  /** Seconds since the last frame. 0 in a still frame. */
  dt: number;
  /** False when the frame is a still (reduced motion, or a posed screenshot): draw, but advance nothing. */
  moving: boolean;
  /** A work block is in progress right now. */
  boarding: boolean;
  /** There are stragglers (quests past their deadline). */
  caution: boolean;
  /** Quests finished today. */
  done: number;
  /** How much of today's planned work is behind you, 0 to 1. */
  progress: number;
}

/** The window's frame also knows what the visitor is doing. */
export interface SceneFrame extends Frame {
  /** `k` runs 0 → 1 through arriving, departing and passing; it is 1 while stopped and 0 while away. */
  visitor: { phase: VisitorPhase; k: number };
}

/**
 * A canvas in four layers, drawn in this order every frame:
 *
 *   back   painted once: everything far away that never changes
 *   draw   every frame: whatever moves out there
 *   front  painted once, on a clear sheet: whatever is nearer and never changes.
 *          Leave it unpainted wherever the layers behind should show through.
 *   over   every frame: whatever is nearest and alive
 *
 * `back` and `front` cost nothing while running, so texture (grain, stipple,
 * planks, rivets) belongs there. Only `layout` and `draw` are required.
 */
export interface Layers<F extends Frame, S> {
  back?: (p: Paint) => void;
  /** Build whatever is kept between frames (particles and the like). Called on mount and on every resize. */
  layout: (w: number, h: number, rnd: () => number) => S;
  draw: (f: F, s: S) => void;
  front?: (p: Paint) => void;
  over?: (f: F, s: S) => void;
}

export interface SceneDef<S> extends Layers<SceneFrame, S> {
  /** The flat colour that fills the window before the first frame. */
  sky: string;
  timing?: Partial<SceneTiming>;
}

/** Layers with their own state type hidden, as the engine holds them. */
export type AnyLayers<F extends Frame = Frame> = Layers<F, unknown>;
export type Scene = SceneDef<unknown>;
export type Wall = AnyLayers;
export type Backdrop = AnyLayers;

export function defineScene<S>(def: SceneDef<S>): Scene {
  return def as unknown as Scene;
}
export function defineWall<S>(def: Layers<Frame, S>): Wall {
  return def as unknown as Wall;
}
export function defineBackdrop<S>(def: Layers<Frame, S>): Backdrop {
  return def as unknown as Backdrop;
}

/**
 * A small picture a line paints for itself. Sizes are CSS pixels; it is painted
 * at twice that. Give it `frames` and `seconds` and it moves: the frames are
 * shown in turn, forever, one run every `seconds`. To rest between movements,
 * paint the resting picture for most of the frames.
 */
export interface Sprite {
  w: number;
  h: number;
  frames?: number;
  seconds?: number;
  /** `frame` counts from 0. A still picture is only ever asked for frame 0. */
  paint: (p: Paint, frame: number) => void;
}

/**
 * A piece of material that repeats in both directions to cover a surface.
 * It must be seamless: whatever leaves by the right edge comes back in at the
 * left, and the same top and bottom. `wrapped` below does that for you.
 */
export interface Tile {
  w: number;
  h: number;
  paint: (p: Paint) => void;
}

/**
 * Paints the same thing nine times, a whole tile apart each way, so anything
 * that crosses an edge of the tile comes back on the opposite side. Roll every
 * random number before calling it, never inside: the nine copies must match.
 */
export function wrapped(p: Paint, paint: () => void): void {
  for (const ox of [-p.w, 0, p.w]) {
    for (const oy of [-p.h, 0, p.h]) {
      p.ctx.save();
      p.ctx.translate(ox, oy);
      paint();
      p.ctx.restore();
    }
  }
}

/** What a line's surfaces are made of. Each is optional; a surface without one stays flat. */
export interface Textures {
  /** Every panel and box. Words sit on it, so it stays dark and close-toned. */
  panel?: Tile;
  /** The sidebar, and the phone's top and bottom bars. */
  wall?: Tile;
  /** A pattern laid over the accent fill of the sign and the Start button. Paint only the pattern; leave the rest clear. */
  accent?: Tile;
}

export function defineTextures(t: Textures): Textures {
  return t;
}

/**
 * A frame in nine slices, painted as one square tile of side `slice * 2 + edge`:
 * four corners `slice` px square, and between them a stretch of `edge` px that
 * repeats along each side. The middle is left clear. It is drawn `slice` px
 * thick over the outer edge of whatever it frames.
 */
export interface FramePiece {
  slice: number;
  edge: number;
  paint: (p: Paint) => void;
}

/** Everything small and drawn. Each piece is optional; the app uses what is there. */
export interface Ornaments {
  frames?: {
    /** Round every raised surface, from a 44 px row to a tall list. `slice` at most 12. */
    panel?: FramePiece;
    /** Round the one loud card on Today. The fullest frame. `slice` at most 24. */
    card?: FramePiece;
    /** Over the accent-filled sign. `slice` at most 12. */
    sign?: FramePiece;
  };
  edges?: {
    /** A trim that repeats down the sidebar's right edge. */
    vertical?: Sprite;
    /** A trim that repeats along the phone's bottom and top bars. */
    horizontal?: Sprite;
    /** A run along the top of the one loud card, just inside its frame: lights, studs, a ticker. */
    crown?: Sprite;
  };
  sprites?: {
    /** The line's badge, beside the app's name and in the picker. About 24 px. */
    emblem?: Sprite;
    /** A small symbol before every section label. About 14 px. */
    mark?: Sprite;
    /** A drawn rule under every page title. About 140 by 12. */
    rule?: Sprite;
    /** A small picture for empty states. About 180 by 120. */
    spot?: Sprite;
  };
}

export function defineOrnaments(o: Ornaments): Ornaments {
  return o;
}

export interface Line {
  /** Folder name, and the value of data-line on <html>. */
  id: string;
  /** Shown in the picker: "Night Line". */
  name: string;
  /** One sentence: where this line runs. */
  journey: string;
  /** What the window does, in words, for the switch in Settings. */
  windowHint: string;
  /** Ground, raised surface and accent, for the picker. Must equal the tokens. */
  swatch: [string, string, string];
  /** Position in the picker. */
  order: number;
  /**
   * How the line is drawn. 'flat' (the default) is stepped flat colour and
   * stipple, like a printed comic. 'painted' is smooth: gradients, soft light
   * and glow are allowed, and the line may bring its own display typeface
   * (--font-display and --font-mono in tokens.css). The guild themes are painted.
   */
  finish?: 'flat' | 'painted';
  scene: Scene;
  textures?: Textures;
  wall?: Wall;
  backdrop?: Backdrop;
  ornaments?: Ornaments;
}
