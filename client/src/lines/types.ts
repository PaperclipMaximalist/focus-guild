/**
 * A line is one journey the app can be dressed as. The layout, the words and
 * every feature stay the same on all of them; a line supplies three things:
 *
 *   tokens.css  the colours (and corner radii), under :root[data-line="<id>"]
 *   frame.css   how the window, the sign and the primary button are framed
 *   scene.ts    what is outside the window on Today
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

/** Everything a scene may know when it draws one frame. */
export interface SceneFrame {
  ctx: CanvasRenderingContext2D;
  /** Size in CSS pixels. The context is already scaled for the screen. */
  w: number;
  h: number;
  /** False on a phone-width window. The page's words sit top-left and take more of a narrow one. */
  wide: boolean;
  /** Milliseconds, always increasing. Fixed in a still frame. */
  t: number;
  /** Seconds since the last frame. 0 in a still frame. */
  dt: number;
  /** False when the frame is a still (reduced motion, or a posed screenshot): draw, but advance nothing. */
  moving: boolean;
  /** `k` runs 0 → 1 through arriving, departing and passing; it is 1 while stopped and 0 while away. */
  visitor: { phase: VisitorPhase; k: number };
  /** A work block is in progress right now. */
  boarding: boolean;
  /** There are stragglers (quests past their deadline). */
  caution: boolean;
  /** Quests finished today. */
  done: number;
  /** Seeded random numbers: the same sequence after every layout, so a still frame never changes. */
  rnd: () => number;
}

export interface SceneDef<S> {
  /** The flat colour behind everything. Also fills the window before the first frame. */
  sky: string;
  timing?: Partial<SceneTiming>;
  /** Build whatever the scene keeps between frames (particles, a skyline). Called on mount and on every resize. */
  layout: (w: number, h: number, rnd: () => number) => S;
  draw: (f: SceneFrame, s: S) => void;
}

/** A scene with its own state type hidden, as the engine holds it. */
export type Scene = SceneDef<unknown>;

export function defineScene<S>(def: SceneDef<S>): Scene {
  return def as unknown as Scene;
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
}
