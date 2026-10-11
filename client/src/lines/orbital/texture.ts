/**
 * What the Ring Line's surfaces are made of, from the cosmic compartment in the
 * reference still: everything shaded in spray stipple, a violet sky banded like
 * a gas planet, and a wall of olive monstera leaves edged in gold.
 *
 *   panel   sprayed violet: only dots, never a line. Lighter dots gather into
 *           broad diagonal bands, sparse dark dots lie between them, and the
 *           density swells and falls smoothly, so it wraps
 *   wall    a print of monstera leaves on a deep violet ground: split blades
 *           with holes, a lit half and a shaded half, running off every edge of
 *           the tile, a rim of gold stipple along each lit edge, dark stipple
 *           in the gaps
 *   accent  a diagonal band of stipple pressed into the pink, dense in the
 *           middle and thinning to nothing
 *
 * Flat colour only. Every random number is rolled before `wrapped` paints, so
 * the nine copies agree and the tile has no seam.
 */

import { defineTextures, wrapped } from '../types';
import type { Paint } from '../types';

const TAU = Math.PI * 2;

// ── panel: sprayed violet ──

const BASE = '#20163D', LIGHT_A = '#33245A', LIGHT_B = '#3A2A66', DARK = '#1C1236';
const PS = 256;

/** How much of a band this spot is in, 0 to 1. Whole-number coefficients: it wraps both ways. */
const band = (x: number, y: number) =>
  0.5 + 0.5 * Math.sin(TAU * (x / PS + (2 * y) / PS) + 0.9 * Math.sin(TAU * ((3 * x) / PS - y / PS)));

const panel = (p: Paint) => {
  const { ctx: c, rnd } = p;
  c.fillStyle = BASE;
  c.fillRect(0, 0, PS, PS);
  const light: number[][] = [[], []];
  const dark: number[] = [];
  const fine: number[] = [];
  for (let y = 0; y < PS; y += 1) {
    for (let x = 0; x < PS; x += 1) {
      const b = band(x + 0.5, y + 0.5);
      const r = rnd();
      if (r < 0.3 * b ** 1.7) light[rnd() < 0.15 + 0.6 * b * b ? 1 : 0]!.push(x, y);
      else if (r > 1 - 0.09 * (1 - b) ** 1.4) dark.push(x, y);
      else if (r > 0.5 && r < 0.5 + 0.012 * (0.4 + b)) fine.push(x, y);
    }
  }
  const dots = (col: string, xy: number[], s = 1) => {
    c.fillStyle = col;
    c.beginPath();
    for (let i = 0; i < xy.length; i += 2) c.rect(xy[i]!, xy[i + 1]!, s, s);
    c.fill();
  };
  dots(DARK, dark);
  dots(LIGHT_A, light[0]!);
  dots(LIGHT_B, light[1]!);
  // A scatter of half-size grains, so the spray has a fine edge.
  c.fillStyle = LIGHT_A;
  c.beginPath();
  for (let i = 0; i < fine.length; i += 2) c.rect(fine[i]! + 0.25, fine[i + 1]! + 0.25, 0.5, 0.5);
  c.fill();
};

// ── wall: monstera leaves ──

const GROUND = '#1A1030', GAP = '#120A24', GAP_LT = '#241A40';
const LEAF = '#232A12', LEAF_LIT = '#2F3718', VEIN = '#1A2009', GOLD = '#5E5A20', GOLD_DIM = '#494618';
const WW = 220, WH = 280;

interface Leaf {
  x: number; y: number; ang: number; len: number; wid: number; flip: number;
  slits: number[]; shift: number; holes: number[][];
  rim: number[][]; shade: number[][];
}

const U0 = 0.1;
/** Half-width of the blade at t (0 base to 1 tip): a heart that is fullest near the base. */
const half = (t: number, wid: number) => wid * Math.sin(Math.PI * Math.max(0, Math.min(1, t)) ** 0.62) ** 0.8;
/** The edge with its cuts: a narrow notch at every slit, leaning toward the tip. */
const edge = (t: number, wid: number, slits: number[], shift: number) => {
  let k = 1;
  for (const s of slits) {
    const d = t - (s + shift);
    const w = d < 0 ? 0.05 : 0.026;
    k = Math.min(k, 1 - 0.7 * Math.max(0, 1 - Math.abs(d) / w));
  }
  return half(t, wid) * k;
};

const makeLeaf = (rnd: () => number, x: number, y: number, size: number): Leaf => {
  const len = size, wid = size * (0.34 + rnd() * 0.06), flip = rnd() < 0.5 ? 1 : -1, ang = rnd() * TAU;
  const slits = [0.3, 0.44, 0.58, 0.72, 0.86].map((s) => s + (rnd() - 0.5) * 0.03);
  const shift = rnd() * 0.04;
  const holes = [0.37, 0.51, 0.65, 0.79].map((t) => [t + (rnd() - 0.5) * 0.02, 0.4 + rnd() * 0.12, 1.6 + rnd() * 1.6, 1.1 + rnd() * 0.8]);
  const world = (t: number, v: number) => {
    const lx = (U0 + t * (1 - U0)) * len, ly = v * flip;
    return [Math.floor(x + lx * Math.cos(ang) - ly * Math.sin(ang)), Math.floor(y + lx * Math.sin(ang) + ly * Math.cos(ang))];
  };
  const rim: number[][] = [];
  const shade: number[][] = [];
  for (let i = 0; i < 150; i += 1) {
    const t = rnd();
    const e = edge(t, wid, slits, shift);
    rim.push([...world(t, -(e - rnd() ** 2 * 6)), rnd() < 0.7 ? 0 : 1]);
  }
  for (let i = 0; i < 70; i += 1) {
    const t = rnd();
    const e = edge(t, wid, slits, shift);
    shade.push(world(t, e - rnd() ** 2 * 7));
  }
  return { x, y, ang, len, wid, flip, slits, shift, holes, rim, shade };
};

const leafPath = (c: CanvasRenderingContext2D, l: Leaf) => {
  const X = (t: number) => (U0 + t * (1 - U0)) * l.len;
  c.beginPath();
  c.moveTo(X(0), 0);
  for (let i = 0; i <= 90; i += 1) c.lineTo(X(i / 90), -edge(i / 90, l.wid, l.slits, l.shift));
  for (let i = 90; i >= 0; i -= 1) c.lineTo(X(i / 90), edge(i / 90, l.wid, l.slits, l.shift) * 0.97);
  c.closePath();
  for (const [t, v, rx, ry] of l.holes) {
    for (const s of [-1, 1]) {
      c.moveTo(X(t!) + rx!, s * v! * half(t!, l.wid));
      c.ellipse(X(t!), s * v! * half(t!, l.wid), rx!, ry!, 0.3 * s, 0, TAU);
    }
  }
};

const drawLeaf = (c: CanvasRenderingContext2D, l: Leaf) => {
  const X = (t: number) => (U0 + t * (1 - U0)) * l.len;
  c.save();
  c.translate(l.x, l.y);
  c.rotate(l.ang);
  c.scale(1, l.flip);
  leafPath(c, l);
  c.fillStyle = LEAF;
  c.fill('evenodd');
  c.save();
  c.clip('evenodd');
  c.fillStyle = LEAF_LIT;
  c.fillRect(0, -l.wid - 2, l.len + 2, l.wid + 2);
  // The midrib, and a vein out to each lobe.
  c.strokeStyle = VEIN;
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(l.len, 0);
  c.stroke();
  c.lineWidth = 1;
  c.beginPath();
  const lobes = [0.23, 0.37, 0.51, 0.65, 0.79, 0.93];
  for (const t of lobes) {
    for (const s of [-1, 1]) {
      c.moveTo(X(t - 0.08), 0);
      c.lineTo(X(t), s * half(t, l.wid) * 0.82);
    }
  }
  c.stroke();
  c.restore();
  c.strokeStyle = VEIN;
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(-2, 0);
  c.lineTo(X(0) + 1, 0);
  c.stroke();
  // Put the clip back in the tile's own coordinates for the stipple.
  c.restore();
};

const wall = (p: Paint) => {
  const { ctx: c, rnd } = p;
  c.fillStyle = GROUND;
  c.fillRect(0, 0, WW, WH);
  // Gap stipple first: the leaves cover it where they lie.
  const gap = Array.from({ length: 2600 }, () => [Math.floor(rnd() * WW), Math.floor(rnd() * WH), rnd() < 0.8] as const);
  c.fillStyle = GAP;
  for (const [x, y, d] of gap) if (d) c.fillRect(x, y, 1, 1);
  c.fillStyle = GAP_LT;
  for (const [x, y, d] of gap) if (!d) c.fillRect(x, y, 1, 1);

  // Nine leaves on a jittered grid, three sizes, every one at its own angle.
  const leaves: Leaf[] = [];
  for (let r = 0; r < 3; r += 1) {
    for (let k = 0; k < 3; k += 1) {
      const size = [84, 100, 92, 108, 88, 96, 104, 82, 98][r * 3 + k]!;
      leaves.push(makeLeaf(rnd, ((k + 0.5 + (rnd() - 0.5) * 0.7) * WW) / 3, ((r + 0.5 + (rnd() - 0.5) * 0.7) * WH) / 3, size));
    }
  }
  // Each leaf is complete before the next begins, so the layering matches in all nine copies.
  for (const l of leaves) {
    wrapped(p, () => {
      drawLeaf(c, l);
      // The stipple is placed in tile coordinates; the leaf's own shape clips it.
      c.save();
      c.translate(l.x, l.y);
      c.rotate(l.ang);
      c.scale(1, l.flip);
      leafPath(c, l);
      c.restore();
      c.save();
      c.beginPath();
      c.restore();
      for (const [x, y, tone] of l.rim) {
        c.fillStyle = tone ? GOLD_DIM : GOLD;
        c.fillRect(x!, y!, 1, 1);
      }
      c.fillStyle = VEIN;
      for (const [x, y] of l.shade) c.fillRect(x!, y!, 1, 1);
    });
  }
};

// ── accent: a band of stipple ──

const INK = '#110309';
const AS = 24;

const accent = (p: Paint) => {
  const { ctx: c, rnd } = p;
  c.globalAlpha = 0.17;
  c.fillStyle = INK;
  c.beginPath();
  for (let y = 0; y < AS; y += 1) {
    for (let x = 0; x < AS; x += 1) {
      // Distance across the band, along the diagonal, wrapping at the tile's size.
      const d = Math.abs(((x + y + 0.5) % AS) - AS / 2) / (AS / 2);
      if (rnd() < 0.85 * Math.max(0, 1 - d * 1.15) ** 1.3) c.rect(x, y, 1, 1);
    }
  }
  c.fill();
  c.globalAlpha = 1;
};

export default defineTextures({
  panel: { w: PS, h: PS, paint: panel },
  wall: { w: WW, h: WH, paint: wall },
  accent: { w: AS, h: AS, paint: accent },
});
