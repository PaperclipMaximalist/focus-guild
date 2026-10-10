/**
 * A line is one journey the app can be dressed as. The layout, the words and
 * every feature stay the same on all of them; a line supplies:
 *
 *   tokens.css   the colours (and corner radii), under :root[data-line="<id>"]
 *   frame.css    borders and patterns for the app's surfaces
 *   scene.ts     the cabin corner on Today: a wall, a window, what is outside it
 *   charm.ts     the line's one signature object, in the sidebar on every page
 *   backdrop.ts  texture and a few drifting specks behind the whole app
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
export type Charm = AnyLayers;
export type Backdrop = AnyLayers;

export function defineScene<S>(def: SceneDef<S>): Scene {
  return def as unknown as Scene;
}
export function defineCharm<S>(def: Layers<Frame, S>): Charm {
  return def as unknown as Charm;
}
export function defineBackdrop<S>(def: Layers<Frame, S>): Backdrop {
  return def as unknown as Backdrop;
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
  scene: Scene;
  charm?: Charm;
  backdrop?: Backdrop;
}
