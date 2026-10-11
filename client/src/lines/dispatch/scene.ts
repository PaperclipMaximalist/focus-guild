/**
 * The Salvage Line: a riveted copper dispatch cockpit over a scrapyard in a dusty-gold haze.
 * Wall: large copper plates, rivets on every seam, stains; it holds the words. Canopy: rounded upper
 * corners and two fat riveted pillars (one on a phone) over five haze bands, a far row of tanks, domed
 * tower tanks with ladders, a chimney, pipes, a beached hull, a gantry crane whose hook sways and dark
 * rusted machinery at the edges. Console: amber radar with a turning sweep, toggles, dials, a lamp block
 * and a stack of parcels (one with the blue label: the one accent). A CRT hangs at the upper right.
 *
 * Visitor: a cream courier skiff with a rust stripe and a crate. Arriving it slides in from the right
 * behind the pillars and hovers low with a 2 px bob; departing it lifts and climbs up and right; passing,
 * a small hazed one crosses far off in the upper panes. CRT (the companion): one bar per quest finished
 * (up to 12), a cursor, a slow scanline; while the skiff is docked a bar at the foot fills and empties,
 * and the glass flashes when it leaves. The radar blip follows the skiff. Signal: green lamp lit, amber
 * instead with stragglers. Flat colour, stipple and hard highlights only.
 */

import { defineScene } from '../types';

type Ctx = CanvasRenderingContext2D;
type Pt = [number, number];

const TAU = Math.PI * 2;
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const easeOut = (k: number) => 1 - (1 - k) ** 3;
const easeInOut = (k: number) => (k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) ** 2);

// The cabin
const WALL = '#2A1A12';
const WALL_HI = '#3A2418';
const WALL_LO = '#1E120C';
const DEEP = '#120A06';
const CU = '#5A3A26';
const CU_HI = '#8A5C3A';
const CU_LO = '#40281A';
const RIV_HI = '#9A6E48';
const RIV = '#6B4630';
// The yard
const FAR = '#A08048';
const FAR_LO = '#86683A';
const MID = '#6A4A2A';
const MID_LO = '#4E3620';
const MID_HI = '#A07040';
const NEAR = '#3A2416';
const NEAR_LO = '#2A1A10';
const RUST = '#8A3A1E';
const RUST_HI = '#B2522A';
// Glowing things
const CRT_GLASS = '#0D3A1C';
const CRT_LINE = '#124A26';
const PHOS = '#4BE083';
const PHOS_HI = '#A8F5C4';
const AMBER = '#E0A020';
const AMBER_HI = '#FFD060';
const AMBER_LO = '#B87A14';
const LAMP_RED = '#E0402A';
const GREEN = '#4BE083';
const SIGNAL_AMBER = '#FFA640';
// Skiff and parcels
const CREAM = '#D8CCB0';
const CREAM_HI = '#F0E6CC';
const CREAM_LO = '#B3A486';
const SKIFF_INK = '#4A3220';
const PARCEL = '#E8E0D0';
const PARCEL_HI = '#F4EEE0';
const PARCEL_LO = '#C9BFA8';
const ACCENT = '#7CB7FF';
const HAZE = ['#6A5028', '#8E6E38', '#B89250', '#D8B878', '#EAD6A0'] as const;

// ── Stipple and small helpers ──

/** Scatter 1 px dots over a box: `dens` tries per square pixel, `p` the chance at a point. One path, one fill. */
function stip(ctx: Ctx, rnd: () => number, x: number, y: number, w: number, h: number, dens: number, colour: string, p?: (px: number, py: number) => number, size = 1) {
  ctx.fillStyle = colour;
  ctx.beginPath();
  const n = Math.round(w * h * dens);
  for (let i = 0; i < n; i += 1) {
    const px = x + rnd() * w;
    const py = y + rnd() * h;
    if (p && rnd() > p(px, py)) continue;
    ctx.rect(Math.floor(px), Math.floor(py), size, size);
  }
  ctx.fill();
}

/** A chance that rises from `a` at (x0, y0) to `b` at (x1, y1), flat beyond. */
function ramp(x0: number, y0: number, x1: number, y1: number, a: number, b: number) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const d = dx * dx + dy * dy || 1;
  return (px: number, py: number) => a + (b - a) * clamp(((px - x0) * dx + (py - y0) * dy) / d);
}

function dots(ctx: Ctx, pts: number[], colour: string, size = 1) {
  ctx.fillStyle = colour;
  ctx.beginPath();
  for (let i = 0; i < pts.length; i += 2) ctx.rect(pts[i]!, pts[i + 1]!, size, size);
  ctx.fill();
}

const box = (ctx: Ctx, col: string, x: number, y: number, w: number, h: number) => {
  ctx.fillStyle = col;
  ctx.fillRect(x, y, w, h);
};

/** A stroked line from (x0, y0) to (x1, y1). */
function line(ctx: Ctx, col: string, lw: number, x0: number, y0: number, x1: number, y1: number) {
  ctx.strokeStyle = col;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

/** Many stroked segments, four numbers each (x0, y0, x1, y1), in one path. */
function segs(ctx: Ctx, col: string, lw: number, p: number[]) {
  ctx.strokeStyle = col;
  ctx.lineWidth = lw;
  ctx.beginPath();
  for (let i = 0; i < p.length; i += 4) {
    ctx.moveTo(p[i]!, p[i + 1]!);
    ctx.lineTo(p[i + 2]!, p[i + 3]!);
  }
  ctx.stroke();
}

/** A filled circle. */
function circ(ctx: Ctx, col: string, x: number, y: number, r: number) {
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

/** A filled rounded rectangle. */
function rrect(ctx: Ctx, col: string, x: number, y: number, w: number, h: number, r: number) {
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

/** Fill a polygon. */
function poly(ctx: Ctx, col: string, pts: Pt[]) {
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i]![0], pts[i]![1]);
  ctx.closePath();
  ctx.fill();
}

/** Rivet heads: a shadow, the head, a one-pixel highlight. */
function rivets(ctx: Ctx, pts: number[], hi = RIV_HI, mid = RIV, lo = DEEP, z = 3) {
  const sh: number[] = [];
  const bd: number[] = [];
  const hl: number[] = [];
  for (let i = 0; i < pts.length; i += 2) {
    const x = Math.round(pts[i]!);
    const y = Math.round(pts[i + 1]!);
    sh.push(x - 1, y);
    bd.push(x - 1, y - 1);
    hl.push(x - 1, y - 1);
  }
  dots(ctx, sh, lo, z);
  dots(ctx, bd, mid, z);
  dots(ctx, hl, hi, 1);
}

// ── Where things are ──

interface Geo {
  w: number; h: number; wide: boolean; s: number; u: number;
  x0t: number; x0b: number; x1: number; y0: number; r: number; fr: number; hood: number;
  top: (x: number) => number;
  glass: Path2D;
  hy: number;
  pil: { x: number; w0: number; w1: number }[];
  crt: { cx: number; cy: number; bw: number; bh: number; gx: number; gy: number; gw: number; gh: number };
  radar: { x: number; y: number; w: number; h: number };
  lamps: { x: number; y: number; w: number; h: number };
  parcels: { x: number; y: number; bw: number; bh: number };
  stopX: number; baseY: number; sc: number;
  crane: { x: number; topY: number; jibX: number; trolX: number; hookY: number; baseY: number };
}

/** The opening, grown by `d` pixels all round (the bottom runs along the console's top edge). */
function openPath(g: Geo, d = 0): Path2D {
  const p = new Path2D();
  const { x0t, x0b, x1, y0, r } = g;
  p.moveTo(x0t + r, y0 - d);
  p.lineTo(x1 - r, y0 - d);
  p.quadraticCurveTo(x1 + d, y0 - d, x1 + d, y0 + r);
  p.lineTo(x1 + d, g.top(x1) + d);
  p.lineTo(x0b - d, g.top(x0b) + d);
  p.lineTo(x0t - d, y0 + r);
  p.quadraticCurveTo(x0t - d, y0 - d, x0t + r, y0 - d);
  p.closePath();
  return p;
}

function geo(w: number, h: number): Geo {
  const wide = w >= 560;
  const s = wide ? Math.min(h / 288, w / 976) : Math.min(h / 224, w / 343);
  const u = wide ? s : s * 0.62;
  const top = wide ? (x: number) => h * (0.69 + 0.15 * (x / w)) : (x: number) => h * (0.795 + 0.015 * (x / w));
  const y0 = wide ? 14 * s : h * 0.49;
  const x0t = wide ? w * 0.465 : 9 * s;
  const x0b = wide ? w * 0.415 : 7 * s;
  const x1 = w - (wide ? 12 : 7) * s;
  const r = (wide ? 34 : 16) * s;
  const g = {
    w, h, wide, s, u, x0t, x0b, x1, y0, r, top,
    fr: (wide ? 13 : 7) * s,
    hood: (wide ? 9 : 6) * s,
    hy: wide ? h * 0.52 : h * 0.64,
    pil: wide
      ? [{ x: w * 0.597, w0: 24 * s, w1: 32 * s }, { x: w * 0.808, w0: 24 * s, w1: 32 * s }]
      : [{ x: w * 0.6, w0: 12 * s, w1: 16 * s }],
  } as Geo;
  g.glass = openPath(g);
  const gh = wide ? 68 * s : 46 * s;
  const gw = wide ? 80 * s : 52 * s;
  const bw = wide ? 112 * s : 72 * s;
  const bh = wide ? 104 * s : 66 * s;
  const cx = wide ? w * 0.885 : w - 8 * s - bw / 2;
  const cy = wide ? 16 * s + bh / 2 : y0 - 6 * s + bh / 2;
  g.crt = { cx, cy, bw, bh, gw, gh, gx: cx - gw / 2, gy: cy - bh / 2 + (wide ? 11 : 7) * s };
  const ry = wide ? top(w * 0.155) + g.hood + 4 * s : top(w * 0.05) + g.hood + 3 * s;
  g.radar = wide ? { x: w * 0.155, y: ry, w: 62 * s, h: 54 * s } : { x: 12 * s, y: ry, w: 56 * s, h: 38 * s };
  g.lamps = wide
    ? { x: w * 0.615, y: top(w * 0.615) + g.hood + 6 * s, w: 60 * s, h: 38 * s }
    : { x: w * 0.3, y: top(w * 0.3) + g.hood + 4 * s, w: 52 * s, h: 32 * s };
  const bwp = wide ? 50 * s : 34 * s;
  g.parcels = { x: w - 8 * s - 2 * bwp - 6 * s, y: h - 2 * s, bw: bwp, bh: wide ? 34 * s : 24 * s };
  g.sc = (wide ? h * 0.165 : h * 0.19) / 32;
  g.stopX = wide ? w * 0.7 : w * 0.31;
  g.baseY = top(g.stopX) - (wide ? 15 : 8) * s;
  const craneX = wide ? w * 0.762 : w * 0.53;
  g.crane = wide
    ? { x: craneX, topY: h * 0.14, jibX: w * 0.63, trolX: w * 0.665, hookY: h * 0.42, baseY: g.hy + 30 * s }
    : { x: craneX, topY: y0 + 9 * s, jibX: w * 0.33, trolX: w * 0.4, hookY: y0 + 34 * s, baseY: g.hy + 14 * s };
  return g;
}

// ── The yard ──

interface Tone { base: string; shade: string; hi: string; dark: string; acc?: string }
const MIDT: Tone = { base: MID, shade: MID_LO, hi: MID_HI, dark: NEAR, acc: RUST_HI };
const RUSTT: Tone = { base: '#8A4A26', shade: '#5E2E1A', hi: '#B2652E', dark: '#3A1A10', acc: '#D8864A' };
const PIPET: Tone = { base: RUST, shade: '#5E2814', hi: RUST_HI, dark: NEAR };
const NEART: Tone = { base: NEAR, shade: NEAR_LO, hi: '#4E3620', dark: '#1A100A' };

function ladder(ctx: Ctx, x: number, y0: number, y1: number, col: string, step: number, wd: number) {
  const p = [x + 0.5, y0, x + 0.5, y1, x + wd + 0.5, y0, x + wd + 0.5, y1];
  for (let y = y1; y > y0; y -= step) p.push(x, Math.round(y) + 0.5, x + wd, Math.round(y) + 0.5);
  segs(ctx, col, 1, p);
}

function pipe(ctx: Ctx, a: Pt, c: Pt, b: Pt, wd: number, t: Tone) {
  ctx.lineCap = 'butt';
  ctx.strokeStyle = t.shade;
  ctx.lineWidth = wd + 1;
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.quadraticCurveTo(c[0], c[1], b[0], b[1]);
  ctx.stroke();
  ctx.strokeStyle = t.base;
  ctx.lineWidth = wd;
  ctx.stroke();
  ctx.strokeStyle = t.hi;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(a[0], a[1] - wd * 0.3);
  ctx.quadraticCurveTo(c[0], c[1] - wd * 0.3, b[0], b[1] - wd * 0.3);
  ctx.stroke();
}

/** A domed tank tower: a body, a dome, stepped shade on the right, hoops and stipple. */
function tank(ctx: Ctx, rnd: () => number, x: number, by: number, wd: number, ht: number, dome: number, t: Tone, lad: boolean, u: number) {
  const body = new Path2D();
  body.moveTo(x - wd / 2, by);
  body.lineTo(x - wd / 2, by - ht);
  body.quadraticCurveTo(x - wd / 2, by - ht - dome * 1.2, x, by - ht - dome);
  body.quadraticCurveTo(x + wd / 2, by - ht - dome * 1.2, x + wd / 2, by - ht);
  body.lineTo(x + wd / 2, by);
  body.closePath();
  ctx.fillStyle = t.base;
  ctx.fill(body);
  ctx.save();
  ctx.clip(body);
  box(ctx, t.shade, x + wd * 0.1, by - ht - dome - 2, wd, ht + dome + 4);
  box(ctx, t.dark, x + wd * 0.34, by - ht - dome - 2, wd, ht + dome + 4);
  box(ctx, t.hi, x - wd / 2, by - ht - dome, wd * 0.2, ht + dome);
  for (const k of [0.16, 0.5, 0.82]) {
    box(ctx, k === 0.5 && t.acc ? t.acc : t.shade, x - wd / 2, by - ht * k - 2 * u, wd, 3 * u);
    box(ctx, t.hi, x - wd / 2, by - ht * k - 3 * u, wd * 0.6, 1);
  }
  box(ctx, t.hi, x - wd / 2 + 2 * u, by - ht - dome * 0.5, 1, ht + dome * 0.5);
  stip(ctx, rnd, x - wd / 2, by - ht - dome, wd, ht + dome, 0.28, t.dark, ramp(x - wd * 0.1, 0, x + wd / 2, 0, 0, 0.8));
  stip(ctx, rnd, x - wd / 2, by - ht - dome, wd * 0.45, ht + dome, 0.18, t.hi, ramp(x + wd * 0.1, 0, x - wd / 2, 0, 0, 0.6));
  ctx.restore();
  ctx.strokeStyle = t.dark;
  ctx.lineWidth = 1;
  ctx.stroke(body);
  box(ctx, t.dark, Math.round(x - 1), Math.round(by - ht - dome - 7 * u), 2, 7 * u);
  if (lad) ladder(ctx, x - wd / 2 - 8 * u, by - ht * 0.92, by - 2, t.dark, 4 * u, 5 * u);
}

/** A leaning chimney: a tapering stack with two hoops and a flared rim. */
function chimney(ctx: Ctx, rnd: () => number, x: number, by: number, ht: number, wd: number, lean: number, t: Tone) {
  ctx.save();
  ctx.translate(x, by);
  ctx.rotate(lean);
  const body: Pt[] = [[-wd * 0.62, 0], [-wd * 0.4, -ht], [wd * 0.4, -ht], [wd * 0.62, 0]];
  poly(ctx, t.base, body);
  poly(ctx, t.shade, [[wd * 0.05, 0], [wd * 0.1, -ht], [wd * 0.4, -ht], [wd * 0.62, 0]]);
  box(ctx, t.hi, -wd * 0.55, -ht * 0.9, 1, ht * 0.9);
  for (const k of [0.3, 0.62]) box(ctx, t.dark, -wd * 0.55, -ht * k, wd * 1.1, 2);
  box(ctx, t.base, -wd * 0.56, -ht - 3, wd * 1.12, 4);
  box(ctx, t.dark, -wd * 0.56, -ht + 1, wd * 1.12, 1);
  stip(ctx, rnd, -wd * 0.62, -ht, wd * 1.24, ht, 0.2, t.dark, ramp(0, 0, wd * 0.6, 0, 0.1, 0.8));
  ctx.restore();
}

/** A beached hull on its side: raked bow, dipping sheer, a bridge and a funnel, stepped shade. */
function hull(ctx: Ctx, rnd: () => number, cx: number, by: number, L: number, D: number, tilt: number, dir: 1 | -1, t: Tone) {
  ctx.save();
  ctx.translate(cx, by);
  ctx.rotate(tilt);
  ctx.scale(dir, 1);
  const body = new Path2D();
  body.moveTo(-L * 0.5, 12);
  body.lineTo(-L * 0.5, -D * 0.78);
  body.quadraticCurveTo(-L * 0.5, -D * 0.86, -L * 0.46, -D * 0.86);
  body.bezierCurveTo(-L * 0.2, -D * 0.64, L * 0.12, -D * 0.68, L * 0.34, -D * 0.92);
  body.quadraticCurveTo(L * 0.44, -D * 1.02, L * 0.5, -D * 1.04);
  body.bezierCurveTo(L * 0.5, -D * 0.5, L * 0.46, -D * 0.1, L * 0.38, 12);
  body.closePath();
  ctx.fillStyle = t.base;
  ctx.fill(body);
  ctx.save();
  ctx.clip(body);
  box(ctx, t.shade, -L * 0.52, -D * 0.2, L * 1.1, D * 0.5);
  box(ctx, t.dark, -L * 0.52, -D * 0.02, L * 1.1, D * 0.4);
  for (let i = 0; i < 6; i += 1) box(ctx, t.dark, -L * 0.44 + i * L * 0.15, -D * 1.1, 1, D * 1.3);
  stip(ctx, rnd, -L * 0.5, -D * 1.1, L, D * 1.2, 0.2, t.hi, ramp(0, -D, 0, -D * 0.4, 0.7, 0));
  ctx.restore();
  const deck = -D * 0.66;
  const t1 = deck - D * 0.3;
  const t2 = t1 - D * 0.22;
  poly(ctx, t.base, [[-L * 0.42, deck + 3], [-L * 0.42, t1], [-L * 0.14, t1], [-L * 0.1, deck + 3]]);
  poly(ctx, t.shade, [[-L * 0.3, t1 + 1], [-L * 0.3, t2], [-L * 0.19, t2], [-L * 0.15, t1 + 1]]);
  poly(ctx, t.base, [[-L * 0.4, t1], [-L * 0.43, t1 - D * 0.3], [-L * 0.36, t1 - D * 0.3], [-L * 0.34, t1]]);
  box(ctx, t.hi, -L * 0.44, t1 - D * 0.3, L * 0.09, 2);
  ctx.restore();
}

/** A heap of scrap: a ragged skyline of beams, plates and drums. */
function heap(ctx: Ctx, rnd: () => number, x0: number, x1: number, by: number, hmax: number, t: Tone, plates: boolean) {
  const pts: Pt[] = [[x0, by + 4]];
  let x = x0;
  while (x < x1) {
    const hh = hmax * (0.25 + rnd() * 0.75) * (0.55 + 0.45 * Math.sin(((x - x0) / (x1 - x0)) * Math.PI));
    pts.push([x, by - hh], [x + 3 + rnd() * 9, by - hh * (0.6 + rnd() * 0.5)]);
    x += 4 + rnd() * 10;
  }
  pts.push([x1, by + 4]);
  poly(ctx, t.base, pts);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0]![0], pts[0]![1]);
  for (const p of pts) ctx.lineTo(p[0], p[1]);
  ctx.clip();
  stip(ctx, rnd, x0, by - hmax, x1 - x0, hmax + 6, 0.3, t.dark, ramp(0, by - hmax, 0, by + 4, 0.1, 0.9));
  stip(ctx, rnd, x0, by - hmax, x1 - x0, hmax * 0.5, 0.18, t.hi, ramp(0, by - hmax * 0.5, 0, by - hmax, 0, 0.6));
  if (plates) {
    for (let i = 0; i < 4; i += 1) {
      const px = x0 + (x1 - x0) * (0.12 + rnd() * 0.74);
      const py = by - hmax * (0.1 + rnd() * 0.5);
      const pw = 7 + rnd() * 9;
      const ph = 4 + rnd() * 6;
      box(ctx, RUST, px, py, pw, ph);
      box(ctx, RUST_HI, px, py, pw, 1);
      box(ctx, t.dark, px, py + ph - 1, pw, 1);
    }
  }
  ctx.restore();
}

function backLayer(ctx: Ctx, rnd: () => number, g: Geo) {
  const { h, u, wide } = g;
  const bx0 = g.x0b - 2;
  const bw = g.x1 - g.x0b + 4;
  const X = (f: number) => g.x0b + (g.x1 - g.x0b) * f;
  const hy = g.hy;
  ctx.save();
  ctx.clip(g.glass);
  // ── Haze: five flat bands, palest at the horizon, dust stippled across the joins ──
  const span = hy - g.y0 + 2;
  const cuts = [-1, 0.04, 0.11, 0.22, 0.36];
  box(ctx, HAZE[0], bx0, g.y0 - 2, bw, hy - g.y0 + 4);
  for (let i = 1; i < 5; i += 1) {
    const y = g.y0 + span * cuts[i]!;
    box(ctx, HAZE[i]!, bx0, y, bw, hy - y + 2);
    const lk = 13 * u;
    stip(ctx, rnd, bx0, y - lk, bw, lk, 0.9, HAZE[i]!, (_x, py) => 0.8 * clamp((py - (y - lk)) / lk) ** 1.4);
    stip(ctx, rnd, bx0, y, bw, 7 * u, 0.9, HAZE[i - 1]!, (_x, py) => 0.45 * clamp(1 - (py - y) / (7 * u)) ** 1.4);
  }
  // Blown dust: pale grit in the upper air, dark grit low down.
  stip(ctx, rnd, bx0, g.y0, bw, span * 0.7, 0.01, '#FBF0CC', ramp(0, g.y0, 0, hy, 0.3, 1));
  stip(ctx, rnd, bx0, g.y0 + span * 0.3, bw, span * 0.7, 0.012, '#A27F44', ramp(0, g.y0 + span * 0.3, 0, hy, 0.15, 1));
  // Ground: dusty ochre under the horizon.
  box(ctx, FAR, bx0, hy, bw, h - hy);
  stip(ctx, rnd, bx0, hy, bw, 14 * u, 0.6, HAZE[4], ramp(0, hy, 0, hy + 14 * u, 0.7, 0));
  // The sun, a pale disc in the haze.
  circ(ctx, '#FBF3D4', X(wide ? 0.13 : 0.35), g.y0 + span * 0.5, 20 * u);
  // ── Far yard: tanks and stacks along the horizon, pale and low ──
  const farRow = (col: string, y: number, hmax: number, step: number, seed: number) => {
    ctx.fillStyle = col;
    let x = bx0 - 6 + seed;
    while (x < bx0 + bw + 6) {
      const k = rnd();
      const wd = (8 + rnd() * 16) * u;
      const ht = hmax * (0.35 + rnd() * 0.65);
      ctx.beginPath();
      if (k < 0.34) {
        ctx.moveTo(x, y + 2);
        ctx.lineTo(x, y - ht);
        ctx.quadraticCurveTo(x + wd / 2, y - ht - wd * 0.5, x + wd, y - ht);
        ctx.lineTo(x + wd, y + 2);
      } else if (k < 0.62) {
        ctx.rect(x, y - ht, wd, ht + 2);
        ctx.rect(x + wd * 0.38, y - ht - 7 * u, wd * 0.24, 7 * u);
      } else if (k < 0.82) {
        ctx.rect(x + wd * 0.3, y - ht * 1.5, wd * 0.34, ht * 1.5 + 2);
        ctx.rect(x + wd * 0.2, y - ht * 1.5, wd * 0.54, 3 * u);
        ctx.rect(x, y - ht * 0.4, wd, ht * 0.4 + 2);
      } else {
        ctx.moveTo(x, y + 2);
        ctx.lineTo(x + wd * 0.5, y - ht * 1.1);
        ctx.lineTo(x + wd, y + 2);
      }
      ctx.fill();
      x += wd + step * (0.2 + rnd() * 0.9);
    }
  };
  farRow(FAR, hy + 3 * u, 20 * u, 8 * u, 0);
  box(ctx, '#94763F', bx0, hy + 8 * u, bw, h - hy);
  farRow(FAR_LO, hy + 9 * u, 15 * u, 10 * u, 11);
  stip(ctx, rnd, bx0, hy - 24 * u, bw, 40 * u, 0.5, HAZE[4], ramp(0, hy - 24 * u, 0, hy + 14 * u, 0.5, 0));
  // A slope of lighter ground in front of the far yard.
  poly(ctx, '#9A7440', [[bx0, hy + 30 * u], [bx0 + bw, hy + 14 * u], [bx0 + bw, h], [bx0, h]]);
  // ── The gantry crane, thin lines in the middle distance (the hook is drawn each frame) ──
  {
    const c = g.crane;
    const lw = (wide ? 17 : 9) * u;
    const jy = c.topY + 5 * u;
    const ty = c.topY - 6 * u;
    const half = (y: number) => 4 * u + ((lw - 4 * u) * (y - c.topY)) / (c.baseY - c.topY);
    const st: number[] = [c.x - lw, c.baseY, c.x - 4 * u, c.topY, c.x + lw, c.baseY, c.x + 4 * u, c.topY, c.x - 7 * u, jy, c.jibX, jy, c.x + 5 * u, jy, c.x + lw * 1.7, jy, c.x, ty, c.jibX + 10 * u, jy, c.x, ty, c.x + lw * 1.7, jy, c.x, ty, c.x, c.topY];
    for (let i = 0; i < 6; i += 1) {
      const ya = c.topY + ((c.baseY - c.topY) * i) / 6;
      const yb = c.topY + ((c.baseY - c.topY) * (i + 1)) / 6;
      st.push(c.x - half(ya), ya, c.x + half(yb), yb, c.x + half(ya), ya, c.x - half(yb), yb);
    }
    segs(ctx, MID, 1.2, st);
    box(ctx, MID_LO, c.x - 5 * u, c.topY + 1, 10 * u, 6 * u);
    box(ctx, RUST_HI, c.x + 5 * u, c.topY + 2, 3 * u, 3 * u);
  }
  // ── Middle yard: towers, a chimney, pipes and a hull ──
  if (wide) {
    // Pane 2: a beached hull on its side and a scrap heap, dark behind the skiff.
    hull(ctx, rnd, X(0.5), g.top(X(0.5)) - 38 * u, 150 * u, 52 * u, -0.05, -1, MIDT);
    heap(ctx, rnd, X(0.33), X(0.72), g.top(X(0.5)) - 20 * u, 36 * u, MIDT, true);
    // Pane 1: the domed tower with its ladder, a pipe off to the right, the leaning chimney.
    pipe(ctx, [X(0.2), hy - 6 * u], [X(0.36), hy - 40 * u], [X(0.66), hy + 6 * u], 5 * u, PIPET);
    chimney(ctx, rnd, X(0.075), g.top(X(0.075)) - 18 * u, 112 * u, 13 * u, 0.1, MIDT);
    tank(ctx, rnd, X(0.215), g.top(X(0.2)) - 14 * u, 60 * u, 78 * u, 26 * u, MIDT, true, u);
    // Pane 3: a squat tank below the CRT, and the tall rust tower at the right edge.
    tank(ctx, rnd, X(0.84), g.top(X(0.84)) - 12 * u, 78 * u, 38 * u, 22 * u, RUSTT, false, u);
    tank(ctx, rnd, X(0.98), g.top(X(0.98)) - 8 * u, 46 * u, 150 * u, 20 * u, RUSTT, false, u);
    box(ctx, RUST, X(0.98) - 23 * u, hy - 24 * u, 46 * u, 7 * u);
    box(ctx, RUST_HI, X(0.98) - 23 * u, hy - 24 * u, 46 * u, 1);
    pipe(ctx, [X(0.93), hy + 8 * u], [X(0.9), hy - 18 * u], [X(0.82), hy - 2 * u], 4 * u, PIPET);
  } else {
    hull(ctx, rnd, X(0.8), g.top(X(0.8)) - 16 * u, 130 * u, 46 * u, -0.05, -1, MIDT);
    heap(ctx, rnd, X(0.44), X(0.62), g.top(X(0.5)) - 8 * u, 26 * u, MIDT, true);
    chimney(ctx, rnd, X(0.07), g.top(X(0.07)) - 10 * u, 78 * u, 11 * u, 0.1, MIDT);
    tank(ctx, rnd, X(0.24), g.top(X(0.24)) - 8 * u, 60 * u, 52 * u, 22 * u, MIDT, true, u);
    pipe(ctx, [X(0.3), hy - 2 * u], [X(0.46), hy - 26 * u], [X(0.7), hy + 4 * u], 4 * u, MIDT);
  }
  // ── Near yard: big dark machines at the edges, a few rust plates picked out ──
  const nb = g.top(X(0.1)) + 6;
  {
    const nx = X(wide ? 0.02 : 0.0);
    const nw = (wide ? 150 : 90) * u;
    // A crusher: a boxy body, a hopper on top, a slanted chute and a big toothed wheel.
    poly(ctx, NEAR, [[nx, nb], [nx, nb - 70 * u], [nx + nw * 0.62, nb - 78 * u], [nx + nw * 0.66, nb - 40 * u], [nx + nw, nb - 16 * u], [nx + nw, nb]]);
    poly(ctx, NEAR_LO, [[nx + nw * 0.45, nb], [nx + nw * 0.45, nb - 72 * u], [nx + nw * 0.62, nb - 78 * u], [nx + nw * 0.66, nb - 40 * u], [nx + nw, nb - 16 * u], [nx + nw, nb]]);
    poly(ctx, NEAR, [[nx + nw * 0.1, nb - 70 * u], [nx + nw * 0.04, nb - 98 * u], [nx + nw * 0.5, nb - 100 * u], [nx + nw * 0.56, nb - 78 * u]]);
    box(ctx, NEART.hi, nx + nw * 0.1, nb - 99 * u, nw * 0.4, 1);
    const wx = nx + nw * 0.3;
    const wy = nb - 34 * u;
    const wr = 21 * u;
    ctx.fillStyle = NEAR_LO;
    ctx.beginPath();
    for (let i = 0; i < 14; i += 1) {
      const a = (i / 14) * TAU;
      for (const [d, da] of [[0.9, 0], [1.2, -0.1], [1.2, 0.1]] as const) ctx.lineTo(wx + Math.cos(a + da) * wr * d, wy + Math.sin(a + da) * wr * d);
    }
    ctx.fill();
    circ(ctx, NEAR_LO, wx, wy, wr);
        circ(ctx, '#1A100A', wx, wy, wr * 0.55);
    circ(ctx, NEAR, wx, wy, wr * 0.2);
    for (const [px, py, pw, ph] of [[nx + nw * 0.7, nb - 34 * u, 24 * u, 12 * u], [nx + nw * 0.08, nb - 62 * u, 18 * u, 10 * u], [nx + nw * 0.52, nb - 18 * u, 20 * u, 9 * u]] as const) {
      box(ctx, RUST, px, py, pw, ph);
      box(ctx, RUST_HI, px, py, pw, 1);
      box(ctx, NEAR_LO, px, py + ph - 1, pw, 1);
      rivets(ctx, [px + 3, py + 4, px + pw - 4, py + 4], RUST_HI, '#5E2814', NEAR_LO, 2);
    }
    stip(ctx, rnd, nx, nb - 100 * u, nw, 100 * u, 0.12, '#4E3620', ramp(0, nb - 100 * u, 0, nb - 60 * u, 0.9, 0));
  }
  {
    // Lower right: a mound of crushed hulls behind the parcels.
    heap(ctx, rnd, X(wide ? 0.72 : 0.6), X(1.02), g.top(X(0.9)) + 8, (wide ? 46 : 28) * u, NEART, true);
  }
  ctx.restore();
}

// ── The skiff ──

const SKIFF_BODY = new Path2D('M-52 -11 C-52 -7 -47 -5 -40 -5 L43 -5 Q48 -5 48 -10 L48 -19 L-12 -19 C-14 -27 -18 -32 -27 -32 C-40 -32 -48 -24 -52 -14 Z');
const SKIFF_PANE = new Path2D('M-46 -19.5 C-43 -26 -37 -29.5 -30 -29.5 L-25 -29.5 C-22 -28 -20.5 -24 -20 -19.5 Z');
const SKIFF_GLASS = new Path2D('M-44.5 -20.5 C-42 -25.5 -37 -28 -30 -28 L-26 -28 C-23.5 -27 -22 -24 -21.5 -20.5 Z');

/** The courier skiff in its own units (nose to the left, about 104 by 32 about its skid). `haze` tints it for far off. */
function skiff(ctx: Ctx, dl: number[], dd: number[], cx: number, baseY: number, sc: number, rot: number, alpha: number, flame: number, haze: number) {
  ctx.save();
  ctx.translate(cx, baseY - 16 * sc);
  ctx.rotate(rot);
  ctx.translate(0, 16 * sc);
  ctx.scale(sc, sc);
  ctx.globalAlpha = alpha;
  const ink = haze ? '#7A5C3A' : SKIFF_INK;
  const lo = haze ? '#A88A5C' : CREAM_LO;
  if (flame > 0) {
    const fl = 6 + 12 * flame;
    poly(ctx, '#E0802A', [[53, -15], [53 + fl, -11], [53, -7]]);
    poly(ctx, AMBER_HI, [[53, -13], [53 + fl * 0.55, -11], [53, -9]]);
  }
  // Skid on two struts, engine pod at the tail.
  box(ctx, ink, -28, -6, 3, 4);
  box(ctx, ink, 22, -6, 3, 4);
  rrect(ctx, ink, -42, -3, 82, 3, 1.5);
  rrect(ctx, haze ? '#8E6E48' : MID, 42, -18, 12, 11, 3);
  box(ctx, ink, 52, -15, 2, 5);
  ctx.fillStyle = haze ? '#C8AE80' : CREAM;
  ctx.fill(SKIFF_BODY);
  ctx.save();
  ctx.clip(SKIFF_BODY);
  box(ctx, lo, -60, -9, 120, 5);
  box(ctx, RUST_HI, -60, -15.5, 120, 4.5);
  box(ctx, '#7E3A1E', -60, -11, 120, 1.2);
  box(ctx, haze ? '#DCC594' : CREAM_HI, -60, -19.8, 120, 1.4);
  box(ctx, lo, -12.6, -19, 1.2, 14);
  if (!haze) {
    dots(ctx, dd, '#8A7A5C', 1);
    dots(ctx, dl, '#FFFBEA', 1);
  }
  ctx.restore();
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.2 / sc;
  ctx.stroke(SKIFF_BODY);
  ctx.fillStyle = ink;
  ctx.fill(SKIFF_PANE);
  ctx.fillStyle = haze ? '#E6D6A8' : '#F6EFD8';
  ctx.fill(SKIFF_GLASS);
  box(ctx, '#FFFFFF', -40, -26, 7, 1.4);
  // A crate on the bed: cream with a strip of rust tape.
  rrect(ctx, haze ? '#D8C8A0' : PARCEL, 8, -30, 27, 11, 1.5);
  box(ctx, haze ? '#B0946A' : PARCEL_LO, 8, -22, 27, 3);
  box(ctx, RUST_HI, 19, -30, 5, 11);
  ctx.strokeRect(8, -30, 27, 11);
  ctx.restore();
  ctx.globalAlpha = 1;
}

// ── The cabin: wall, frame, pillars, console, CRT casing, parcels ──

function wallLayer(ctx: Ctx, rnd: () => number, g: Geo) {
  const { w, h, s, wide } = g;
  const hole = new Path2D();
  hole.rect(0, 0, w, h);
  hole.addPath(g.glass);
  ctx.save();
  ctx.clip(hole, 'evenodd');
  box(ctx, WALL, 0, 0, w, h);
  // Large plates: each a shade apart, divided by seams with a rivet row either side.
  const xs = wide ? [0.1, 0.22, 0.335, 0.41].map((f) => f * w) : [0.34 * w, 0.68 * w];
  const edges = [0, ...xs, w];
  for (let i = 0; i < edges.length - 1; i += 1) {
    box(ctx, i % 2 ? '#2D1C14' : '#271811', edges[i]!, 0, edges[i + 1]! - edges[i]!, h);
    box(ctx, '#33211A', edges[i]! + 8 * s, 0, 7 * s, h);
    box(ctx, '#3A2519', edges[i]! + 8 * s, 0, 1, h);
  }
  const hseam = h * (wide ? 0.4 : 0.32);
  const words = (x: number, y: number) => (wide ? x < w * 0.42 && y < h * 0.62 : y < h * 0.5);
  const rv: number[] = [];
  const rvq: number[] = [];
  const put = (x: number, y: number) => (words(x, y) ? rvq : rv).push(x, y);
  for (const x of xs) {
    const px = Math.round(x);
    box(ctx, DEEP, px - 1, 0, 2, h);
    box(ctx, WALL_HI, px + 1, 0, 1, h);
    for (let y = 9 * s; y < h; y += 16 * s) {
      put(px - 5 * s, y);
      put(px + 6 * s, y);
    }
  }
  box(ctx, DEEP, 0, hseam - 1, w, 2);
  box(ctx, WALL_HI, 0, hseam + 1, w, 1);
  for (let x = 10 * s; x < w; x += 16 * s) {
    put(x, hseam - 5 * s);
    put(x, hseam + 6 * s);
  }
  rivets(ctx, rv);
  rivets(ctx, rvq, '#5E3F28', '#3A2418', '#150C07');
  // Stains: dark streaks running down from the seams, rust bleeding at their feet.
  for (const f of wide ? [0.05, 0.16, 0.285, 0.375] : [0.15, 0.5, 0.86]) {
    const x = f * w;
    const sw = (5 + rnd() * 5) * s;
    const len = h * (0.42 + rnd() * 0.3);
    stip(ctx, rnd, x - sw, 0, sw * 2, len, 0.5, WALL_LO, (px, py) => (1 - Math.abs(px - x) / sw) * clamp(1 - py / len) ** 0.5 * 0.9);
    stip(ctx, rnd, x - sw * 0.7, len * 0.55, sw * 1.4, len * 0.45, 0.4, '#43241A', (px, py) => (1 - Math.abs(px - x) / (sw * 0.7)) * clamp((py - len * 0.55) / (len * 0.45)) * 0.7);
  }
  // Grain: light and dark, heavier toward the window.
  stip(ctx, rnd, 0, 0, w, h, 0.12, WALL_HI, ramp(0, 0, w, 0, 0.1, 0.8));
  stip(ctx, rnd, 0, 0, w, h, 0.1, DEEP, ramp(w, h, 0, 0, 0.1, 0.9));
  // A copper pipe along the ceiling, with clamps.
  const py = 3 * s;
  const ph = 6 * s;
  box(ctx, '#33211A', 0, py, g.x0t - g.fr, ph);
  box(ctx, '#40291D', 0, py, g.x0t - g.fr, 2 * s);
  box(ctx, DEEP, 0, py + ph, g.x0t - g.fr, 1);
  for (let x = 28 * s; x < g.x0t - g.fr; x += 74 * s) {
    box(ctx, '#23150F', x, py - 1, 6 * s, ph + 3);
    box(ctx, '#40291D', x, py - 1, 1, ph + 3);
  }
  // Gauges on the wall beside the words: dark faces, copper bezels, one amber needle.
  if (wide) {
    for (const [gx, gy, gr] of [[w * 0.365, h * 0.3, 19 * s], [w * 0.365, h * 0.505, 10 * s]] as const) {
      circ(ctx, DEEP, gx, gy, gr + 4 * s);
      circ(ctx, CU, gx, gy, gr + 3 * s);
      ctx.strokeStyle = CU_HI;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(gx, gy, gr + 2 * s, Math.PI * 0.9, Math.PI * 1.6);
      ctx.stroke();
      circ(ctx, '#1B100B', gx, gy, gr);
      const tk: number[] = [];
      for (let i = 0; i <= 8; i += 1) {
        const a = Math.PI * 0.75 + (i / 8) * Math.PI * 1.5;
        tk.push(gx + Math.cos(a) * gr * 0.72, gy + Math.sin(a) * gr * 0.72, gx + Math.cos(a) * gr * 0.92, gy + Math.sin(a) * gr * 0.92);
      }
      segs(ctx, '#5E3F28', 1, tk);
      line(ctx, AMBER, 1.5, gx, gy, gx + Math.cos(-0.5) * gr * 0.8, gy + Math.sin(-0.5) * gr * 0.8);
      box(ctx, CU_HI, Math.round(gx - 1), Math.round(gy - 1), 3, 3);
      rivets(ctx, [gx - gr - 1, gy - gr - 1, gx + gr + 3, gy + gr + 2]);
    }
    // A hazard plate on a bolted bracket, in muted rust and dark stripes.
    {
      const hx = w * 0.275;
      const hz = h * 0.455;
      const hw = 52 * s;
      const hh = 11 * s;
      box(ctx, DEEP, hx - 1, hz - 1, hw + 2, hh + 2);
      ctx.save();
      ctx.beginPath();
      ctx.rect(hx, hz, hw, hh);
      ctx.clip();
      box(ctx, WALL, hx, hz, hw, hh);
      const hs: number[] = [];
      for (let x = -hh; x < hw; x += 10 * s) hs.push(hx + x, hz + hh + 1, hx + x + hh + 1, hz - 1);
      segs(ctx, '#4A2A18', 5 * s, hs);
      ctx.restore();
      rivets(ctx, [hx - 4 * s, hz + hh / 2, hx + hw + 5 * s, hz + hh / 2], '#5E3F28', '#3A2418', '#150C07', 2);
    }
  }
  ctx.restore();
}

function frameLayer(ctx: Ctx, rnd: () => number, g: Geo) {
  const { fr, s } = g;
  const outer = openPath(g, fr);
  const ring = new Path2D();
  ring.addPath(outer);
  ring.addPath(g.glass);
  ctx.save();
  ctx.clip(ring, 'evenodd');
  box(ctx, CU, 0, 0, g.w, g.h);
  // Stepped bands: a lit outer edge, a dark inner lip.
  ctx.strokeStyle = CU_HI;
  ctx.lineWidth = 2 * (fr * 0.5);
  ctx.stroke(openPath(g, fr * 0.5));
  ctx.strokeStyle = CU;
  ctx.lineWidth = 2 * fr * 0.28;
  ctx.stroke(openPath(g, fr * 0.72));
  ctx.strokeStyle = WALL_LO;
  ctx.lineWidth = 2 * 3 * s;
  ctx.stroke(g.glass);
  stip(ctx, rnd, 0, 0, g.w, g.h * 0.9, 0.2, DEEP, ramp(g.w, g.h, 0, 0, 0.1, 0.55));
  stip(ctx, rnd, 0, 0, g.w, g.h * 0.9, 0.12, '#9A6E48', ramp(0, 0, g.w, g.h, 0.0, 0.3));
  ctx.restore();
  ctx.strokeStyle = DEEP;
  ctx.lineWidth = 1.5;
  ctx.stroke(outer);
  // Rivets along the head and the two sides.
  const rv: number[] = [];
  for (let x = g.x0t + g.r; x < g.x1 - g.r; x += 22 * s) rv.push(x, g.y0 - fr * 0.5);
  for (let y = g.y0 + g.r; y < g.top(g.x1) - 10 * s; y += 24 * s) rv.push(g.x1 + fr * 0.5, y, g.x0t - fr * 0.5 + (g.x0b - g.x0t) * ((y - g.y0 - g.r) / (g.top(g.x0b) - g.y0 - g.r)), y);
  rivets(ctx, rv);
}

function pillarLayer(ctx: Ctx, rnd: () => number, g: Geo) {
  const { s } = g;
  for (const p of g.pil) {
    const yt = g.y0 - g.fr * 0.3;
    const yb = g.top(p.x) + 8 * s;
    const path = new Path2D(`M${p.x - p.w0 / 2} ${yt} L${p.x + p.w0 / 2} ${yt} L${p.x + p.w1 / 2} ${yb} L${p.x - p.w1 / 2} ${yb} Z`);
    ctx.fillStyle = CU;
    ctx.fillStyle = CU;
    ctx.fill(path);
    ctx.save();
    ctx.clip(path);
    const wx = (y: number) => p.w0 + ((p.w1 - p.w0) * (y - yt)) / (yb - yt);
    // A shaded left third, a lit right edge, a dark rim.
    poly(ctx, CU_LO, [[p.x - p.w0 / 2, yt], [p.x - p.w0 * 0.12, yt], [p.x - p.w1 * 0.12, yb], [p.x - p.w1 / 2, yb]]);
    poly(ctx, CU_HI, [[p.x + p.w0 * 0.36, yt], [p.x + p.w0 / 2 - 3, yt], [p.x + p.w1 / 2 - 3, yb], [p.x + p.w1 * 0.36, yb]]);
    poly(ctx, '#9A6E48', [[p.x + p.w0 / 2 - 3, yt], [p.x + p.w0 / 2, yt], [p.x + p.w1 / 2, yb], [p.x + p.w1 / 2 - 3, yb]]);
    stip(ctx, rnd, p.x - p.w1 / 2, yt, p.w1, yb - yt, 0.3, DEEP, ramp(p.x - p.w1 / 2, 0, p.x, 0, 0.8, 0.05));
    stip(ctx, rnd, p.x, yt, p.w1 / 2, yb - yt, 0.2, '#B07A4C', ramp(p.x, 0, p.x + p.w1 / 2, 0, 0, 0.5));
    // Collars: two bands across, each a dark line over a lit one.
    for (const f of [0.28, 0.66]) {
      const y = yt + (yb - yt) * f;
      box(ctx, DEEP, p.x - wx(y) / 2, y, wx(y), 2 * s);
      box(ctx, CU_HI, p.x - wx(y) / 2, y - 1, wx(y), 1);
      box(ctx, CU_LO, p.x - wx(y) / 2, y + 2 * s, wx(y), 2 * s);
    }
    ctx.restore();
    ctx.strokeStyle = DEEP;
    ctx.lineWidth = 1.2;
    ctx.stroke(path);
    const rv: number[] = [];
    for (let y = yt + 9 * s; y < yb - 6 * s; y += 15 * s) rv.push(p.x - wx(y) * 0.28, y, p.x + wx(y) * 0.2, y);
    rivets(ctx, rv);
  }
}

/** A round dial: copper bezel, pale face with ticks, a red arc and a needle. */
function dial(ctx: Ctx, x: number, y: number, r: number, ang: number) {
  circ(ctx, DEEP, x, y, r + 3);
  circ(ctx, CU_HI, x, y, r + 2);
  circ(ctx, CU, x + 0.7, y + 0.7, r + 1.4);
  circ(ctx, '#D8C79A', x, y, r);
  ctx.fillStyle = '#BFAE82';
  ctx.beginPath();
  ctx.arc(x, y, r, 0.1, Math.PI * 0.9);
  ctx.fill();
  ctx.strokeStyle = RUST_HI;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.78, -0.35, 0.4);
  ctx.stroke();
  ctx.strokeStyle = NEAR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= 8; i += 1) {
    const a = Math.PI * 0.8 + (i / 8) * Math.PI * 1.4;
    ctx.moveTo(x + Math.cos(a) * r * 0.74, y + Math.sin(a) * r * 0.74);
    ctx.lineTo(x + Math.cos(a) * r * 0.95, y + Math.sin(a) * r * 0.95);
  }
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(ang) * r * 0.78, y + Math.sin(ang) * r * 0.78);
  ctx.stroke();
  box(ctx, CU, Math.round(x - 1.5), Math.round(y - 1.5), 3, 3);
  box(ctx, '#FFFFFF', Math.round(x - r * 0.6), Math.round(y - r * 0.7), 2, 1);
}

/** A round knob with a notch. */
function knob(ctx: Ctx, x: number, y: number, r: number, ang: number) {
  circ(ctx, DEEP, x + 0.5, y + 1, r + 1);
  circ(ctx, CU_HI, x, y, r);
  circ(ctx, '#5E3F28', x + 0.8, y + 0.8, r * 0.78);
  box(ctx, '#B07A4C', Math.round(x - r * 0.6), Math.round(y - r * 0.6), Math.max(1, Math.round(r * 0.5)), 1);
  line(ctx, DEEP, 1, x, y, x + Math.cos(ang) * r * 0.9, y + Math.sin(ang) * r * 0.9);
}

/** A toggle switch: a dark slot, a lever up or down, a brass ball. */
function toggle(ctx: Ctx, x: number, y: number, s: number, up: boolean) {
  box(ctx, DEEP, x - 3 * s, y - 4 * s, 6 * s, 9 * s);
  box(ctx, WALL_HI, x - 3 * s, y - 4 * s, 1, 9 * s);
  line(ctx, '#B07A4C', Math.max(1.5, 1.6 * s), x, y, x + 0.5, y + (up ? -6 : 6) * s);
  circ(ctx, RIV_HI, x + 0.5, y + (up ? -6 : 6) * s, 1.8 * s);
}

function consoleLayer(ctx: Ctx, rnd: () => number, g: Geo) {
  const { w, h, s, wide, hood } = g;
  const top = g.top;
  const fy = (x: number) => top(x) + hood;
  const at = (x: number, f: number) => fy(x) + (h - fy(x)) * f;
  // The hood: a dark glare shield with a lit top edge, then the lit band of the face.
  poly(ctx, WALL_LO, [[0, top(0)], [w, top(w)], [w, h], [0, h]]);
  poly(ctx, CU_LO, [[0, fy(0)], [w, fy(w)], [w, h], [0, h]]);
  poly(ctx, '#432A1C', [[0, fy(0) + 3 * s], [w, fy(w) + 3 * s], [w, h], [0, h]]);
  poly(ctx, CU_HI, [[0, top(0) - 1], [w, top(w) - 1], [w, top(w) + 1], [0, top(0) + 1]]);
  poly(ctx, DEEP, [[0, fy(0)], [w, fy(w)], [w, fy(w) + 1.5], [0, fy(0) + 1.5]]);
  ctx.save();
  ctx.clip(new Path2D(`M0 ${fy(0) + 3 * s} L${w} ${fy(w) + 3 * s} L${w} ${h} L0 ${h} Z`));
  stip(ctx, rnd, 0, fy(0), w, h - fy(0), 0.2, WALL_LO, ramp(0, fy(0), 0, h, 0.1, 0.9));
  stip(ctx, rnd, 0, fy(0), w, 18 * s + 10, 0.12, '#7A5234', ramp(0, fy(0), 0, fy(0) + 18 * s, 0.7, 0));
  // Module seams and the rivets either side of each.
  const mods = wide ? [0.0, 0.145, 0.235, 0.375, 0.6, 0.69, 0.84] : [0.0, 0.3, 0.6, 0.72];
  const rv: number[] = [];
  for (const f of mods.slice(1)) {
    const x = Math.round(f * w);
    box(ctx, DEEP, x - 1, fy(x), 2, h);
    box(ctx, '#5E3F28', x + 1, fy(x), 1, h);
    for (let y = fy(x) + 9 * s; y < h - 4 * s; y += 18 * s) rv.push(x - 5 * s, y, x + 6 * s, y);
  }
  rivets(ctx, rv);
  // The lower lip: a darker skirt with its own rivets.
  box(ctx, WALL_LO, 0, h - 4 * s, w, 4 * s);
  box(ctx, CU, 0, h - 4 * s, w, 1);
  ctx.restore();

  // Radar bezel and screen (the sweep is drawn each frame).
  const R = g.radar;
  const rr = new Path2D();
  rr.roundRect(R.x, R.y, R.w, R.h, 5 * s);
  rrect(ctx, DEEP, R.x - 5 * s, R.y - 5 * s, R.w + 10 * s, R.h + 10 * s, 8 * s);
  rrect(ctx, CU_HI, R.x - 4 * s, R.y - 4 * s, R.w + 8 * s, R.h + 8 * s, 7 * s);
  rrect(ctx, CU, R.x - 3 * s + 1, R.y - 3 * s + 1, R.w + 6 * s - 1, R.h + 6 * s - 1, 6 * s);
  ctx.fillStyle = AMBER;
  ctx.fill(rr);
  ctx.save();
  ctx.clip(rr);
  box(ctx, '#C98A18', R.x, R.y + R.h * 0.55, R.w, R.h);
  const gcx = R.x + R.w / 2;
  const gcy = R.y + R.h / 2;
  const gl: number[] = [];
  for (let x = gcx % (9 * s); x < R.w; x += 9 * s) gl.push(Math.round(R.x + x) + 0.5, R.y, Math.round(R.x + x) + 0.5, R.y + R.h);
  for (let y = gcy % (9 * s); y < R.h; y += 9 * s) gl.push(R.x, Math.round(R.y + y) + 0.5, R.x + R.w, Math.round(R.y + y) + 0.5);
  segs(ctx, AMBER_LO, 1, gl);
  ctx.strokeStyle = '#9A6410';
  for (const k of [0.3, 0.6, 0.9]) {
    ctx.beginPath();
    ctx.arc(gcx, gcy, (R.h / 2) * k, 0, TAU);
    ctx.stroke();
  }
  stip(ctx, rnd, R.x, R.y, R.w, R.h, 0.6, AMBER_LO, (px, py) => 0.7 * clamp((Math.hypot((px - gcx) / (R.w / 2), (py - gcy) / (R.h / 2)) - 0.62) / 0.5));
  stip(ctx, rnd, R.x, R.y, R.w * 0.6, R.h * 0.5, 0.3, AMBER_HI, ramp(R.x + R.w * 0.5, R.y + R.h * 0.4, R.x, R.y, 0, 0.7));
  box(ctx, AMBER_HI, R.x + 2, R.y + 2, R.w * 0.45, 1);
  ctx.restore();
  // Spill of amber light on the hood above the screen.
  stip(ctx, rnd, R.x - 6 * s, R.y - 14 * s, R.w + 12 * s, 14 * s, 0.35, AMBER_LO, ramp(0, R.y, 0, R.y - 14 * s, 0.7, 0));
  rivets(ctx, [R.x - 2 * s, R.y - 2 * s, R.x + R.w + 3 * s, R.y - 2 * s, R.x - 2 * s, R.y + R.h + 3 * s, R.x + R.w + 3 * s, R.y + R.h + 3 * s]);

  // Dials, knobs, toggles and sliders.
  if (wide) {
    dial(ctx, w * 0.06, at(w * 0.06, 0.45), 13 * s, -0.4);
    dial(ctx, w * 0.27, at(w * 0.27, 0.44), 12 * s, 0.6);
    for (let i = 0; i < 5; i += 1) toggle(ctx, w * 0.095 + i * 9.5 * s, at(w * 0.1, 0.34), s, i % 3 !== 1);
    for (let i = 0; i < 5; i += 1) toggle(ctx, w * 0.095 + i * 9.5 * s, at(w * 0.1, 0.72), s, i % 2 === 0);
    for (let i = 0; i < 4; i += 1) toggle(ctx, w * 0.3 + i * 9.5 * s, at(w * 0.31, 0.78), s, i % 2 === 1);
    for (let i = 0; i < 6; i += 1) knob(ctx, w * 0.385 + (i % 3) * 17 * s, at(w * 0.4, i < 3 ? 0.3 : 0.7), 5 * s, i * 1.7);
    // A louvred vent between the lamps and the parcels.
    const vx = w * 0.71;
    const vw = w * 0.115;
    box(ctx, DEEP, vx, at(vx, 0.22), vw, 22 * s);
    for (let i = 0; i < 5; i += 1) {
      box(ctx, CU_LO, vx + 2, at(vx, 0.22) + 3 * s + i * 4 * s, vw - 4, 2 * s);
      box(ctx, CU, vx + 2, at(vx, 0.22) + 3 * s + i * 4 * s, vw - 4, 1);
    }
  } else {
    dial(ctx, w * 0.235, at(w * 0.235, 0.45), 9 * s, -0.4);
    for (let i = 0; i < 3; i += 1) toggle(ctx, w * 0.07 + i * 9 * s, at(w * 0.08, 0.2), s * 0.8, i % 2 === 0);
    for (let i = 0; i < 3; i += 1) knob(ctx, w * 0.5 + i * 12 * s, at(w * 0.52, 0.55), 4 * s, i * 1.7);
  }

  // The lamp housing (the lamps themselves are alive: drawn each frame).
  const L = g.lamps;
  rrect(ctx, DEEP, L.x - 3 * s, L.y - 3 * s, L.w + 6 * s, L.h + 6 * s, 4 * s);
  box(ctx, CU_HI, L.x - 2 * s, L.y - 2 * s, L.w + 4 * s, 1);
  rrect(ctx, '#17100B', L.x - 1, L.y - 1, L.w + 2, L.h + 2, 3 * s);
  rivets(ctx, [L.x - 1 * s, L.y - 1 * s, L.x + L.w + 2 * s, L.y + L.h + 2 * s], RIV_HI, RIV, DEEP, 2);
}

function crtCasing(ctx: Ctx, rnd: () => number, g: Geo) {
  const { s, wide } = g;
  const c = g.crt;
  const x0 = c.cx - c.bw / 2;
  const y0 = c.cy - c.bh / 2;
  // The arm: a bent bar from the ceiling plate, a swivel and a brace.
  const ax = c.cx + c.bw * 0.2;
  const aw = (wide ? 11 : 7) * s;
  box(ctx, DEEP, ax - aw / 2 - 1, -2, aw + 2, y0 + 8 * s);
  box(ctx, CU, ax - aw / 2, -2, aw, y0 + 8 * s);
  box(ctx, CU_HI, ax - aw / 2, -2, 2, y0 + 8 * s);
  box(ctx, CU_LO, ax + aw / 2 - 2, -2, 2, y0 + 8 * s);
  box(ctx, DEEP, ax - aw * 1.4, -2, aw * 2.8, 7 * s);
  box(ctx, CU, ax - aw * 1.4 + 1, -2, aw * 2.8 - 2, 6 * s);
  rivets(ctx, [ax - aw * 1.0, 2 * s, ax + aw * 1.0, 2 * s]);
  // The bulb behind the bezel, offset up and to the right, then the bezel itself.
  rrect(ctx, DEEP, x0 + 8 * s, y0 - 4 * s, c.bw - 6 * s, c.bh - 6 * s, c.bw * 0.3);
  const bez = new Path2D();
  bez.roundRect(x0, y0, c.bw, c.bh, c.bw * 0.24);
  ctx.fillStyle = CU_LO;
  ctx.fill(bez);
  ctx.save();
  ctx.clip(bez);
  box(ctx, CU, x0, y0, c.bw * 0.7, c.bh);
  box(ctx, CU_HI, x0, y0, 3 * s, c.bh);
  box(ctx, CU_HI, x0, y0, c.bw, 3 * s);
  box(ctx, WALL_LO, x0 + c.bw - 7 * s, y0, 7 * s, c.bh);
  box(ctx, WALL_LO, x0, y0 + c.bh - 8 * s, c.bw, 8 * s);
  stip(ctx, rnd, x0, y0, c.bw, c.bh, 0.2, DEEP, ramp(x0, y0, x0 + c.bw, y0 + c.bh, 0, 0.5));
  stip(ctx, rnd, x0, y0, c.bw, c.bh, 0.12, RIV_HI, ramp(x0 + c.bw, y0 + c.bh, x0, y0, 0, 0.45));
  // The wash of the glass's light on the bezel: flat pale-green dots hugging the glass.
  stip(ctx, rnd, c.gx - 10 * s, c.gy - 10 * s, c.gw + 20 * s, c.gh + 20 * s, 0.25, '#4F9A6A', (px, py) => 0.6 * clamp(1 - Math.max(Math.abs(px - c.cx) - c.gw / 2, Math.abs(py - (c.gy + c.gh / 2)) - c.gh / 2) / (9 * s)) ** 1.2);
  ctx.restore();
  ctx.strokeStyle = DEEP;
  ctx.lineWidth = 1.5;
  ctx.stroke(bez);
  // The glass: a dark recess, the phosphor raster, a lit rim.
  const gl = new Path2D();
  gl.roundRect(c.gx, c.gy, c.gw, c.gh, 10 * s);
  rrect(ctx, DEEP, c.gx - 4 * s, c.gy - 4 * s, c.gw + 8 * s, c.gh + 8 * s, 13 * s);
  ctx.fillStyle = CRT_GLASS;
  ctx.fill(gl);
  ctx.save();
  ctx.clip(gl);
  ctx.fillStyle = CRT_LINE;
  for (let y = c.gy + 1; y < c.gy + c.gh; y += 3) ctx.fillRect(c.gx, Math.round(y), c.gw, 1);
  stip(ctx, rnd, c.gx, c.gy, c.gw, c.gh, 0.5, '#04140A', (px, py) => 0.8 * clamp(Math.max(Math.abs(px - c.cx) / (c.gw / 2), Math.abs(py - c.gy - c.gh / 2) / (c.gh / 2)) - 0.55));
  ctx.restore();
  ctx.strokeStyle = '#2F7A4A';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(c.gx - 1.5, c.gy - 1.5, c.gw + 3, c.gh + 3, 11 * s);
  ctx.stroke();
  // Two knobs and a speaker grille under the glass; rivets round the bezel; vents on the shoulder.
  const ky = c.gy + c.gh + (c.bh - (c.gy - y0) - c.gh) * 0.5;
  knob(ctx, c.cx - c.gw * 0.3, ky, 4 * s, 0.6);
  knob(ctx, c.cx - c.gw * 0.3 + 15 * s, ky, 4 * s, -0.8);
  for (let i = 0; i < 4; i += 1) box(ctx, DEEP, c.cx + c.gw * 0.1 + i * 5 * s, ky - 3 * s, 2, 6 * s);
  rivets(ctx, [x0 + 7 * s, y0 + 7 * s, x0 + c.bw - 9 * s, y0 + 7 * s, x0 + 7 * s, y0 + c.bh - 9 * s, x0 + c.bw - 9 * s, y0 + c.bh - 9 * s]);
  if (wide) for (let i = 0; i < 4; i += 1) box(ctx, DEEP, x0 + c.bw * 0.3 + i * 6 * s, y0 + 3 * s, 3 * s, 1.5);
}

/** One parcel: a front, a top and a side, rust tape over the top and down the front. */
function parcel(ctx: Ctx, rnd: () => number, x: number, y: number, bw: number, bh: number, rot: number, label: boolean) {
  const d = bw * 0.16;
  ctx.save();
  ctx.translate(x + bw / 2, y);
  ctx.rotate(rot);
  ctx.translate(-bw / 2, 0);
  poly(ctx, PARCEL_LO, [[bw, 0], [bw + d, -d * 0.8], [bw + d, -bh - d * 0.8], [bw, -bh]]);
  poly(ctx, PARCEL_HI, [[0, -bh], [d, -bh - d * 0.8], [bw + d, -bh - d * 0.8], [bw, -bh]]);
  const front = new Path2D();
  front.rect(0, -bh, bw, bh);
  ctx.fillStyle = PARCEL;
  ctx.fill(front);
  ctx.save();
  ctx.clip(front);
  box(ctx, PARCEL_LO, 0, -bh * 0.18, bw, bh * 0.18);
  stip(ctx, rnd, 0, -bh, bw, bh, 0.3, '#A89C82', ramp(0, -bh * 0.4, bw, 0, 0, 0.7));
  stip(ctx, rnd, 0, -bh, bw, bh * 0.4, 0.3, '#FFFFFF', ramp(bw, -bh * 0.3, 0, -bh, 0, 0.6));
  ctx.restore();
  // Tape: over the top and down the front, with a rumpled edge.
  poly(ctx, RUST_HI, [[bw * 0.42, -bh], [bw * 0.42 + d, -bh - d * 0.8], [bw * 0.6 + d, -bh - d * 0.8], [bw * 0.6, -bh]]);
  box(ctx, RUST_HI, bw * 0.42, -bh, bw * 0.18, bh);
  box(ctx, '#7E3A1E', bw * 0.58, -bh, bw * 0.02, bh);
  box(ctx, '#D8764A', bw * 0.42, -bh, 1, bh);
  if (label) {
    box(ctx, ACCENT, bw * 0.08, -bh * 0.78, bw * 0.28, bh * 0.4);
    box(ctx, '#3B6FB0', bw * 0.08, -bh * 0.78 + bh * 0.4 - 1, bw * 0.28, 1);
    box(ctx, '#3B6FB0', bw * 0.12, -bh * 0.6, bw * 0.18, 1);
  }
  segs(ctx, '#6A4A2A', 1, [0, -bh, d, -bh - d * 0.8, d, -bh - d * 0.8, bw + d, -bh - d * 0.8, bw + d, -bh - d * 0.8, bw + d, -d * 0.8, 0.5, -bh + 0.5, bw - 0.5, -bh + 0.5, bw - 0.5, -bh + 0.5, bw - 0.5, -0.5, bw - 0.5, -0.5, 0.5, -0.5, 0.5, -0.5, 0.5, -bh + 0.5]);
  ctx.restore();
}

// ── State ──

interface Speck { x: number; y: number; v: number; a: number; sz: number; gust?: boolean }
interface State {
  g: Geo;
  dust: Speck[];
  motes: Speck[];
  bars: number[];
  shipLit: number[];
  shipDark: number[];
}

export default defineScene<State>({
  sky: '#D8B878',
  timing: { arriving: 3600, departing: 3200, passing: 2600 },

  layout(w, h, rnd) {
    const g = geo(w, h);
    const bx0 = g.x0b;
    const bw = g.x1 - g.x0b;
    const mk = (n: number, yl: number, yh: number, v0: number, v1: number): Speck[] =>
      Array.from({ length: n }, () => ({ x: bx0 + rnd() * bw, y: g.y0 + (g.top(bx0 + bw * 0.5) - g.y0) * (yl + rnd() * (yh - yl)), v: v0 + rnd() * (v1 - v0), a: 0.35 + rnd() * 0.4, sz: rnd() < 0.2 ? 2 : 1 }));
    const dust = [...mk(g.wide ? 40 : 22, 0.05, 0.95, 4, 9), ...mk(g.wide ? 34 : 18, 0.35, 0.65, 38, 62).map((d) => ({ ...d, gust: true }))];
    const motes = mk(7, 0.1, 0.9, 2, 5);
    const bars = Array.from({ length: 12 }, () => 0.3 + rnd() * 0.7);
    const shipLit: number[] = [];
    const shipDark: number[] = [];
    for (let i = 0; i < 900; i += 1) {
      const x = -52 + rnd() * 100;
      const y = -32 + rnd() * 28;
      if (rnd() < clamp((-y - 14) / 12) * 0.6) shipLit.push(Math.round(x), Math.round(y));
      if (rnd() < clamp((y + 12) / 8) * 0.5) shipDark.push(Math.round(x), Math.round(y));
    }
    return { g, dust, motes, bars, shipLit, shipDark };
  },

  // ── Outside: the haze and the yard ──
  back({ ctx, w, h, rnd }) {
    backLayer(ctx, rnd, geo(w, h));
  },

  // ── Outside, moving: dust and a gust, the crane hook, the courier skiff ──
  draw(f, s) {
    const { ctx, t, dt, moving } = f;
    const { phase, k } = f.visitor;
    const g = s.g;
    const { w, wide, u } = g;
    ctx.save();
    ctx.clip(g.glass);
    // The crane's hook swinging a pixel or two.
    {
      const c = g.crane;
      const sway = moving ? Math.sin(t / 2600) * 1.7 : 1;
      line(ctx, MID, 1, c.trolX, c.topY + 5 * u, c.trolX + sway, c.hookY);
      ctx.beginPath();
      ctx.arc(c.trolX + sway, c.hookY + 3 * u, 3 * u, -Math.PI * 0.55, Math.PI * 0.75);
      ctx.stroke();
      box(ctx, MID_LO, c.trolX - 2 * u, c.topY + 3 * u, 4 * u, 4 * u);
      box(ctx, RUST_HI, c.trolX - 2 * u + 1, c.hookY + 6 * u, 3 * u, 3 * u);
    }
    // Dust drifting right, then and now a thicker gust: a loose band of specks crossing.
    const gustOn = moving ? (t % 26000) / 26000 : 0.5;
    const gustK = clamp(Math.sin(gustOn * Math.PI * 3.5));
    for (const d of s.dust) {
      if (d.gust && gustOn >= 0.28 && moving) continue;
      if (moving) {
        d.x += d.v * dt;
        if (d.x > g.x1 + 4) d.x = g.x0b - 4;
      }
      ctx.globalAlpha = d.a * (d.gust && moving ? gustK : d.gust ? 0.5 : 1);
      box(ctx, d.sz > 1 ? '#F6E8BE' : '#7C5A2C', Math.round(d.x), Math.round(d.y), d.sz + (d.gust ? 1 : 0), d.gust ? 1 : d.sz);
    }
    ctx.globalAlpha = 1;
    // A small one passing far off, hazed: it crosses the upper panes and stays right of the words.
    if (phase === 'passing') {
      const ps = g.sc * 0.5;
      const pl = 104 * ps;
      const sx = g.x1 + pl;
      const ex = wide ? w * 0.52 : w * 0.3;
      const x = sx + (ex - sx) * easeInOut(k);
      const y = g.y0 + (g.hy - g.y0) * (wide ? 0.62 : 0.55);
      skiff(ctx, s.shipLit, s.shipDark, x, y, ps, 0, 0.9 * Math.min(1, k * 6) * Math.min(1, (1 - k) * 5), 0, 1);
    }
    // The visitor.
    if (phase === 'arriving' || phase === 'stopped' || phase === 'departing') {
      const L = 104 * g.sc;
      const bob = moving && phase === 'stopped' ? Math.sin((t / 3600) * TAU) * 1 : 0;
      let x = g.stopX;
      let y = g.baseY + bob;
      let rot = 0;
      let flame = 0;
      if (phase === 'arriving') {
        const e = easeOut(k);
        x = g.stopX + (g.x1 + L / 2 + 30 - g.stopX) * (1 - e);
        y = g.baseY - 8 * g.s * (1 - e) ** 2;
        rot = -0.04 * (1 - e);
        flame = clamp((1 - e) * 2.2);
      } else if (phase === 'departing') {
        const lift = (wide ? 22 : 8) * g.s;
        if (k < 0.3) {
          const q = easeInOut(k / 0.3);
          y = g.baseY - lift * q;
          x = g.stopX + 8 * q;
          rot = 0.03 * q;
          flame = q;
        } else {
          const p = (k - 0.3) / 0.7;
          const q = p ** 1.7;
          x = g.stopX + 8 + (g.x1 + L / 2 + 60 - g.stopX - 8) * q;
          y = g.baseY - lift - (wide ? 90 : 14) * g.s * q;
          rot = 0.03 + (wide ? 0.2 : 0.04) * Math.min(1, p * 2.5);
          flame = 1;
        }
      }
      skiff(ctx, s.shipLit, s.shipDark, x, y, g.sc, rot, 1, flame, 0);
    }
    ctx.restore();
  },

  // ── The cabin ──
  front({ ctx, w, h, rnd }) {
    const g = geo(w, h);
    wallLayer(ctx, rnd, g);
    frameLayer(ctx, rnd, g);
    pillarLayer(ctx, rnd, g);
    consoleLayer(ctx, rnd, g);
    // The green wash of the CRT on the pillar beside it: flat pale dots on its lit edge.
    {
      const c = g.crt;
      const p = g.pil[g.pil.length - 1]!;
      const near = p.x + p.w1 / 2;
      if (c.cx - c.bw / 2 - near < 60 * g.s) stip(ctx, rnd, p.x - p.w1 / 2, g.y0, p.w1, c.gy + c.gh - g.y0, 0.3, '#6FE0A0', (px, py) => 0.5 * clamp(1 - (c.cy - py) ** 2 / (c.bh * c.bh * 0.5)) * clamp((px - p.x + p.w1 / 2) / p.w1));
    }
    crtCasing(ctx, rnd, g);
    const P = g.parcels;
    const { bw, bh } = P;
    parcel(ctx, rnd, P.x, P.y, bw, bh, 0, false);
    parcel(ctx, rnd, P.x + bw + 4 * g.s, P.y, bw, bh, 0.02, true);
    parcel(ctx, rnd, P.x + bw * 0.5 + 4 * g.s, P.y - bh - 2 * g.s, bw, bh * 0.9, -0.05, false);
    ctx.globalAlpha = 1;
  },

  // ── Alive: the CRT and its manifest, the radar, the signal lamps, motes in the light ──
  over(f, s) {
    const { ctx, t, dt, moving, done } = f;
    const { phase, k } = f.visitor;
    const g = s.g;
    const c = g.crt;
    const sc = g.s;
    const boarding = phase === 'stopped';
    // The CRT's glass.
    const gl = new Path2D();
    gl.roundRect(c.gx, c.gy, c.gw, c.gh, 10 * sc);
    ctx.save();
    ctx.clip(gl);
    const flash = phase === 'departing' && k < 0.2;
    if (flash) {
      box(ctx, '#165C32', c.gx, c.gy, c.gw, c.gh);
      ctx.fillStyle = '#1E7A42';
      for (let y = c.gy + 1; y < c.gy + c.gh; y += 3) ctx.fillRect(c.gx, Math.round(y), c.gw, 1);
    }
    const rows = 13;
    const pitch = (c.gh - 11 * sc) / rows;
    const bar = Math.max(2, Math.round(pitch * 0.62));
    const n = Math.min(12, done);
    for (let i = 0; i < n; i += 1) {
      const y = Math.round(c.gy + 5 * sc + i * pitch);
      const len = Math.round((c.gw - 12 * sc) * s.bars[i]!);
      box(ctx, flash ? PHOS_HI : PHOS, Math.round(c.gx + 6 * sc), y, len, bar);
      box(ctx, PHOS_HI, Math.round(c.gx + 6 * sc), y, Math.min(len, Math.max(2, Math.round(3 * sc))), bar);
    }
    // The block cursor after the last line: once a second.
    if (!moving || t % 1000 < 520) box(ctx, PHOS_HI, Math.round(c.gx + 6 * sc), Math.round(c.gy + 5 * sc + n * pitch), Math.max(4, Math.round(6 * sc)), bar);
    // The scanline drifts down the glass over six seconds; a second, dimmer one joins it while a block is boarding.
    const sl = moving ? (t % 6000) / 6000 : 0.38;
    box(ctx, '#1F7A42', c.gx, Math.round(c.gy + sl * c.gh), c.gw, 2);
    if (boarding || (phase === 'arriving' && k > 0.7)) box(ctx, '#165C32', c.gx, Math.round(c.gy + ((sl + 0.5) % 1) * c.gh), c.gw, 2);
    // Receiving: a short bar at the foot of the glass fills and empties.
    if (boarding) {
      const cyc = moving ? (t % 2400) / 2400 : 0.6;
      const fill = cyc < 0.7 ? cyc / 0.7 : 1 - (cyc - 0.7) / 0.3;
      box(ctx, PHOS, Math.round(c.gx + 6 * sc), Math.round(c.gy + c.gh - 6 * sc), Math.max(1, Math.round((c.gw - 12 * sc) * fill)), Math.max(2, Math.round(3 * sc)));
    }
    ctx.restore();
    // The radar: a sweep turning once every eight seconds, and a blip while the skiff is near.
    {
      const R = g.radar;
      const rr = new Path2D();
      rr.roundRect(R.x, R.y, R.w, R.h, 5 * sc);
      const cx = R.x + R.w / 2;
      const cy = R.y + R.h / 2;
      const rad = Math.hypot(R.w, R.h) / 2;
      ctx.save();
      ctx.clip(rr);
      const a = moving ? (t / 8000) * TAU : 1.1;
      line(ctx, AMBER_HI, 2, cx, cy, cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
      ctx.strokeStyle = '#FFF0B0';
      ctx.lineWidth = 1;
      ctx.stroke();
      let r = -1;
      if (phase === 'arriving') r = 0.95 - 0.55 * easeOut(k);
      else if (phase === 'stopped') r = 0.4;
      else if (phase === 'departing') r = 0.4 + 0.55 * k;
      else if (phase === 'passing') r = 0.95 - 0.5 * k;
      if (r >= 0) {
        const ba = phase === 'passing' ? -1.2 : -0.55;
        const bx = Math.round(cx + Math.cos(ba) * r * R.h * 0.7 * (R.w / R.h) * 0.8);
        const by = Math.round(cy + Math.sin(ba) * r * R.h * 0.7);
        box(ctx, '#7A4A08', bx - 2, by - 2, 5, 5);
        box(ctx, '#FFF6C8', bx - 1, by - 1, 3, 3);
      }
      ctx.restore();
    }
    // The signal: a block of lamps. Green lit; amber instead with stragglers. Two small red lamps are always lit.
    {
      const L = g.lamps;
      const lr = Math.min(L.h * 0.27, L.w * 0.16);
      for (const [i, col, on] of [[0, GREEN, !f.caution], [1, SIGNAL_AMBER, f.caution]] as const) {
        const lx = L.x + L.w * (0.26 + 0.48 * i);
        const ly = L.y + L.h * 0.34;
        circ(ctx, DEEP, lx, ly, lr + 2);
        circ(ctx, on ? col : (i ? '#4A3014' : '#14341F'), lx, ly, lr);
        box(ctx, on ? '#FFFFFF' : i ? '#6A4A20' : '#1E5232', Math.round(lx - lr * 0.55), Math.round(ly - lr * 0.6), Math.max(2, Math.round(lr * (on ? 0.5 : 0.4))), on ? 2 : 1);
      }
      for (let i = 0; i < 3; i += 1) {
        const rx = L.x + L.w * (0.1 + 0.3 * i);
        const ry = L.y + L.h * 0.78;
        const lit = i !== 1;
        box(ctx, lit ? LAMP_RED : '#5A1E14', Math.round(rx), Math.round(ry), Math.round(L.w * 0.2), Math.max(3, Math.round(L.h * 0.12)));
        box(ctx, lit ? '#FF9A80' : '#7A2A1E', Math.round(rx), Math.round(ry), Math.round(L.w * 0.2), 1);
      }
    }
    // Dust motes in the cabin, catching the light from the opening.
    ctx.save();
    ctx.clip(g.glass);
    for (const m of s.motes) {
      if (moving) {
        m.x += m.v * dt * 0.7;
        m.y -= m.v * dt * 0.25;
        if (m.x > g.x1) m.x = g.x0b;
        if (m.y < g.y0) m.y = g.top(m.x) - 8;
      }
      ctx.globalAlpha = m.a * 0.7;
      box(ctx, '#FFF2C8', Math.round(m.x), Math.round(m.y), m.sz + 1, m.sz + 1);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  },
});
