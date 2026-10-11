/**
 * The Ring Line: a worn compartment on a slow train through space. The wall
 * (aubergine panels, seams, rivets) holds the words on the left; a wide window
 * with a rounded frame and one bar shows violet space, a sweeping river of
 * dust, a giant ringed planet and a small mottled one, and sheets of paper
 * tumbling by. Monstera leaves crowd in from the corners, a round rust table
 * stands low in the picture with two tan suitcases stacked beside it, and a
 * pink crystal hovers over the table. Everything is flat colour and stipple.
 *
 * The visitor is a cream shuttle with a rust stripe. Arriving, it draws
 * alongside from the right and holds level in the opening; the crystal gains a
 * second ring and two circling motes. Departing, it climbs away to the right
 * and the crystal's glint flashes across its four facets. Passing, a small one
 * crosses far off in the upper pane. Away, only paper, dust and the crystal's
 * slow bob. The signal is a wall lamp by the window: green, amber with
 * stragglers. One pink shard lies on the table per quest finished today.
 */

import { defineScene } from '../types';

type Ctx = CanvasRenderingContext2D;
type Pt = [number, number];

const TAU = Math.PI * 2;
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const easeOut = (k: number) => 1 - (1 - k) ** 3;

// The cabin
const WALL = '#171027';
const WALL_HI = '#241A3E';
const WALL_LO = '#0E0919';
const FRAME = '#35284F';
const FRAME_HI = '#5A4888';
const FRAME_LO = '#1A112D';
const SEAT = '#2C1B44';
const SEAT_HI = '#40295F';
// Brass, leather, luggage
const BRASS = '#D9B25A';
const BRASS_LO = '#8C6B2A';
const TAN = '#B89B6A';
const TAN_HI = '#D2B98A';
const TAN_LO = '#8C7448';
const TAN_DK = '#4A3A1E';
// Table
const RUST = '#9A3A2A';
const RUST_HI = '#C2543A';
const RUST_LO = '#6E2A22';
// Crystal
const PINK = '#FF6FB1';
const PINK_PALE = '#FFC2E0';
const PINK_MID = '#C02A8C';
const PINK_DEEP = '#7A1458';
const SIGNAL = { green: ['#5EE6A8', '#1C3B3B', '#2E7A5E'], amber: ['#FFA24D', '#46301F', '#8A5328'] } as const;
// Leaves: base, shadow half, light dots, dark dots
const LEAF_TONES = [
  ['#6E7A2C', '#566220', '#C8CF6A', '#2C3314'],
  ['#8A9632', '#6A7626', '#DCD76E', '#313A15'],
  ['#9AA63C', '#76822C', '#E6E27E', '#38421A'],
] as const;
const PAPER = '#E9DDB8';

// ── Stipple ──

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

/** A ring of dots thinning outward from an ellipse's edge: the dithered rim of a flat shape. */
function halo(ctx: Ctx, rnd: () => number, cx: number, cy: number, rx: number, ry: number, spread: number, dens: number, colour: string, size = 1) {
  ctx.fillStyle = colour;
  ctx.beginPath();
  const n = Math.round(TAU * Math.max(rx, ry) * Math.max(rx, ry) * spread * dens * 0.5);
  for (let i = 0; i < n; i += 1) {
    const a = rnd() * TAU;
    const f = rnd();
    if (rnd() > (1 - f) ** 1.6) continue;
    const r = 1 + f * spread;
    ctx.rect(Math.floor(cx + Math.cos(a) * rx * r), Math.floor(cy + Math.sin(a) * ry * r), size, size);
  }
  ctx.fill();
}

/** Replay a list of x,y pairs as dots. */
function dots(ctx: Ctx, pts: number[], colour: string, size = 1) {
  ctx.fillStyle = colour;
  ctx.beginPath();
  for (let i = 0; i < pts.length; i += 2) ctx.rect(pts[i]!, pts[i + 1]!, size, size);
  ctx.fill();
}

// ── Where things are ──

interface Geo {
  w: number; h: number; wide: boolean; s: number;
  fr: number; gx0: number; gy0: number; gx1: number; gy1: number; gr: number; glass: Path2D;
  barY: number; barH: number;
  tx: number; ty: number; tw: number; th: number; cs: number;
  upper: { x: number; y: number; w: number; h: number };
  lower: { x: number; y: number; w: number; h: number };
  planet: { x: number; y: number; r: number };
  moon: { x: number; y: number; r: number };
  hold: { x: number; y: number; sc: number };
  lamp: { x: number; y: number; r: number };
  leaf: { x: number; y: number; ang: number; len: number };
}

function geo(w: number, h: number): Geo {
  const wide = w >= 560;
  const s = wide ? Math.min(h / 288, w / 976) : Math.min(h / 224, w / 343);
  const gx0 = w * (wide ? 0.465 : 0.07);
  const gx1 = w - (wide ? 12 : 8) * s;
  const gy0 = h * (wide ? 0.055 : 0.49);
  const gy1 = h * (wide ? 0.715 : 0.8);
  const gr = (wide ? 26 : 14) * s;
  const gw = gx1 - gx0;
  const gh = gy1 - gy0;
  const glass = new Path2D();
  glass.roundRect(gx0, gy0, gw, gh, gr);
  const upper = wide
    ? { x: w * 0.725, y: h * 0.58, w: w * 0.225, h: 60 * s }
    : { x: w * 0.69, y: h * 0.7, w: w * 0.38, h: 34 * s };
  const lower = wide
    ? { x: w * 0.71, y: upper.y + upper.h - 2, w: w * 0.255, h: h - (upper.y + upper.h - 2) + 4 }
    : { x: w * 0.68, y: upper.y + upper.h - 2, w: w * 0.4, h: h - (upper.y + upper.h - 2) + 4 };
  return {
    w, h, wide, s, fr: (wide ? 11 : 8) * s, gx0, gy0, gx1, gy1, gr, glass,
    barY: gy0 + gh * (wide ? 0.27 : 0.3), barH: (wide ? 8 : 5) * s,
    tx: w * (wide ? 0.565 : 0.43), ty: h * (wide ? 0.815 : 0.9), tw: (wide ? 112 : 62) * s, th: (wide ? 19 : 10) * s,
    cs: (wide ? 1.4 : 1.05) * s,
    upper, lower,
    planet: { x: gx0 + gw * (wide ? 0.56 : 0.66), y: gy0 + gh * (wide ? 0.68 : 0.62), r: (wide ? 64 : 27) * s },
    moon: { x: gx0 + gw * (wide ? 0.16 : 0.18), y: gy0 + gh * (wide ? 0.14 : 0.3), r: (wide ? 17 : 8) * s },
    hold: { x: gx0 + gw * (wide ? 0.76 : 0.8), y: gy0 + gh * (wide ? 0.46 : 0.36), sc: (wide ? 1 : 0.55) * s },
    lamp: { x: wide ? gx0 - 11 * s - 15 * s : 8 * s, y: h * (wide ? 0.27 : 0.58), r: (wide ? 8 : 5) * s },
    leaf: wide ? { x: -14 * s, y: h + 14 * s, ang: -0.62, len: 158 * s } : { x: -6 * s, y: h + 10 * s, ang: -0.8, len: 92 * s },
  };
}

// ── Monstera leaves ──

const LEAF_W = 0.5;
interface LeafGeom { path: Path2D; tips: Pt[]; L: number; W: number }

/** A split leaf in local space: the stem at the origin, the tip at (L, 0). Fat rounded lobes parted by narrow slits that lean toward the tip. */
function leafGeom(L: number): LeafGeom {
  const W = L * LEAF_W;
  const hw = (u: number) => W * Math.sin(Math.PI * (0.1 + 0.88 * u)) ** 0.7;
  const segs: { from: Pt; to: Pt; c?: Pt }[] = [];
  const tips: Pt[] = [];
  let cur: Pt = [0, 0];
  const go = (to: Pt, c?: Pt) => {
    segs.push({ from: cur, to, c });
    cur = to;
  };
  const n = 4;
  const u0 = 0.06;
  const step = 0.22;
  const g = 0.011;
  const lean = 0.07;
  const rin = [0.42, 0.26, 0.24, 0.26, 0.3].map((v) => v * W);
  go([(u0 + g) * L, rin[0]!], [-0.05 * L, 0.66 * W]);
  for (let i = 0; i < n; i += 1) {
    const ua = u0 + i * step;
    const rt = hw(ua + step * 0.55 + lean) * 0.97;
    const B: Pt = [(ua + lean + g) * L, rt];
    const C: Pt = [(ua + step + lean - g) * L, rt * 0.93];
    const mix = (k: number): Pt => [B[0] + (C[0] - B[0]) * k, B[1] + (C[1] - B[1]) * k];
    go(mix(0.26), B);
    go(mix(0.74), [(B[0] + C[0]) / 2, ((B[1] + C[1]) / 2) * 1.12]);
    go([(ua + step - g) * L, rin[i + 1]!], C);
    tips.push([(ua + lean + step * 0.5) * L, rt * 0.95]);
    if (i < n - 1) go([(ua + step + g) * L, rin[i + 1]!]);
  }
  go([L, 0], [L * 0.99, W * 0.2]);
  const path = new Path2D();
  path.moveTo(0, 0);
  for (const s of segs) {
    if (s.c) path.quadraticCurveTo(s.c[0], s.c[1], s.to[0], s.to[1]);
    else path.lineTo(s.to[0], s.to[1]);
  }
  for (let i = segs.length - 1; i >= 0; i -= 1) {
    const s = segs[i]!;
    if (s.c) path.quadraticCurveTo(s.c[0], -s.c[1], s.from[0], -s.from[1]);
    else path.lineTo(s.from[0], -s.from[1]);
  }
  path.closePath();
  // Holes beside the midrib, as in the real leaf.
  for (const u of [0.24, 0.46, 0.68]) {
    for (const sg of [1, -1]) path.ellipse(u * L, sg * W * 0.13, L * 0.034, L * 0.014, 0.3 * sg, 0, TAU);
  }
  return { path, tips, L, W };
}

/** Dots in a leaf's own space: light along the lit half, dark across the shaded half. */
function leafDots(rnd: () => number, L: number, flip: number, dens: number) {
  const W = L * LEAF_W;
  const lit: number[] = [];
  const dark: number[] = [];
  const n = Math.round(L * W * 2 * dens);
  for (let i = 0; i < n; i += 1) {
    const x = rnd() * L;
    const y = (rnd() * 2 - 1) * W;
    const v = (y * flip) / W;
    if (rnd() < Math.max(0, (0.12 - v) / 1.12) * 0.9) lit.push(x, y);
    if (rnd() < Math.max(0, (v + 0.1) / 1.1) * 0.85) dark.push(x, y);
  }
  return { lit, dark };
}

interface LeafDots { lit: number[]; dark: number[] }

function drawLeaf(ctx: Ctx, gm: LeafGeom, dt: LeafDots, x: number, y: number, ang: number, flip: number, tone: number) {
  const [base, shade, light, dark] = LEAF_TONES[tone]!;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  // The stalk, running back from the stem.
  ctx.strokeStyle = shade;
  ctx.lineWidth = Math.max(2, gm.L * 0.035);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-gm.L * 0.35, 0);
  ctx.lineTo(gm.L * 0.02, 0);
  ctx.stroke();
  ctx.fillStyle = base;
  ctx.fill(gm.path, 'evenodd');
  ctx.save();
  ctx.clip(gm.path, 'evenodd');
  ctx.fillStyle = shade;
  ctx.fillRect(0, flip > 0 ? gm.W * 0.35 : -gm.W, gm.L, gm.W * 0.65);
  dots(ctx, dt.lit, light, 1.3);
  dots(ctx, dt.dark, dark, 1.3);
  ctx.restore();
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1.3;
  ctx.lineJoin = 'round';
  ctx.stroke(gm.path);
  // Midrib and veins running out to each lobe.
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(gm.L * 0.97, 0);
  for (const [tx, ty] of gm.tips) {
    for (const sg of [1, -1]) {
      ctx.moveTo(tx - gm.L * 0.1, 0);
      ctx.quadraticCurveTo(tx - gm.L * 0.03, sg * ty * 0.5, tx, sg * ty * 0.92);
    }
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ── Luggage ──

interface Case { x: number; y: number; w: number; h: number }

function suitcase(ctx: Ctx, rnd: () => number, c: Case, s: number, lower: boolean, patch: boolean) {
  const { x, y, w, h } = c;
  const base = lower ? '#9C8258' : TAN;
  const lid = lower ? '#B39A6C' : TAN_HI;
  const shade = lower ? '#756040' : TAN_LO;
  const lidH = 11 * s;
  const sx = [x + w * 0.2, x + w * 0.76];
  // Handle, rising from the lid.
  if (!lower) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [lw, col] of [[6 * s, TAN_DK], [2.4 * s, TAN_LO]] as const) {
      ctx.strokeStyle = col;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(x + w * 0.4, y + 3 * s);
      ctx.lineTo(x + w * 0.4, y - 7 * s);
      ctx.lineTo(x + w * 0.58, y - 7 * s);
      ctx.lineTo(x + w * 0.58, y + 3 * s);
      ctx.stroke();
    }
  }
  const body = new Path2D();
  body.roundRect(x, y, w, h, 8 * s);
  ctx.fillStyle = base;
  ctx.fill(body);
  ctx.save();
  ctx.clip(body);
  ctx.fillStyle = lid;
  ctx.fillRect(x, y, w, lidH);
  ctx.fillStyle = TAN_DK;
  ctx.fillRect(x, y + lidH, w, Math.max(1, 1.5 * s));
  ctx.fillStyle = shade;
  ctx.fillRect(x, y + h - 9 * s, w, 9 * s);
  // Shaded on the right and underneath, lit on the lid.
  stip(ctx, rnd, x, y, w, h, 0.3, TAN_DK, ramp(x + w * 0.55, y, x + w, y, 0, 0.62));
  stip(ctx, rnd, x, y + lidH, w, h - lidH, 0.25, TAN_DK, ramp(x, y + h * 0.6, x, y + h, 0, 0.55));
  stip(ctx, rnd, x, y, w, lidH + 6 * s, 0.3, '#F2E2B0', ramp(x + w * 0.8, y, x, y, 0, 0.55));
  if (lower) stip(ctx, rnd, x, y + lidH, w, 12 * s, 0.5, '#3A2E18', ramp(x, y + lidH, x, y + lidH + 12 * s, 0.8, 0));
  // Straps with a stitched edge and a buckle each.
  for (const px of sx) {
    const sw = 12 * s;
    ctx.fillStyle = lower ? '#5E4C2C' : '#7C6234';
    ctx.fillRect(px - sw / 2, y, sw, h);
    ctx.fillStyle = TAN_DK;
    ctx.fillRect(px - sw / 2, y, 1, h);
    ctx.fillRect(px + sw / 2 - 1, y, 1, h);
    ctx.strokeStyle = TAN_HI;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(px - sw / 2 + 2.5, y);
    ctx.lineTo(px - sw / 2 + 2.5, y + h);
    ctx.moveTo(px + sw / 2 - 2.5, y);
    ctx.lineTo(px + sw / 2 - 2.5, y + h);
    ctx.stroke();
    ctx.setLineDash([]);
    const by = y + h * 0.44;
    ctx.fillStyle = BRASS_LO;
    ctx.fillRect(px - 7 * s, by - 1, 14 * s, 11 * s);
    ctx.fillStyle = BRASS;
    ctx.fillRect(px - 6 * s, by, 12 * s, 9 * s);
    ctx.fillStyle = TAN_DK;
    ctx.fillRect(px - 3.5 * s, by + 2.5 * s, 7 * s, 4 * s);
    ctx.fillStyle = BRASS;
    ctx.fillRect(px - 1, by + 3 * s, 2, 8 * s);
  }
  // Corner caps with a rivet each.
  const cap = 9 * s;
  for (const [cx, cy] of [[x, y], [x + w - cap, y], [x, y + h - cap], [x + w - cap, y + h - cap]] as const) {
    ctx.fillStyle = TAN_DK;
    ctx.fillRect(cx, cy, cap, cap);
    ctx.fillStyle = shade;
    ctx.fillRect(cx + 1, cy + 1, cap - 2, cap - 2);
    ctx.fillStyle = BRASS;
    ctx.fillRect(Math.round(cx + cap / 2 - 1), Math.round(cy + cap / 2 - 1), 2, 2);
  }
  // A stitched patch, a lighter square sewn on with dashes.
  if (patch) {
    const px = x + w * 0.48;
    const py = y + h * 0.62;
    const ps = Math.min(h * 0.34, 20 * s);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(0.08);
    ctx.fillStyle = '#D6BF8E';
    ctx.fillRect(-ps, -ps * 0.8, ps * 2, ps * 1.6);
    ctx.strokeStyle = TAN_LO;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 2.5]);
    ctx.strokeRect(-ps + 3, -ps * 0.8 + 3, ps * 2 - 6, ps * 1.6 - 6);
    ctx.beginPath();
    ctx.moveTo(-ps * 0.4, -ps * 0.2);
    ctx.lineTo(ps * 0.4, ps * 0.3);
    ctx.moveTo(ps * 0.4, -ps * 0.2);
    ctx.lineTo(-ps * 0.4, ps * 0.3);
    ctx.stroke();
    ctx.restore();
    ctx.setLineDash([]);
  }
  ctx.restore();
  ctx.strokeStyle = TAN_DK;
  ctx.lineWidth = 1;
  ctx.stroke(body);
}

/** A leather satchel on the seat: flap, buckle and an arched strap. */
function satchel(ctx: Ctx, rnd: () => number, x: number, y: number, w: number, h: number, s: number) {
  const LEATHER = '#A8683E';
  const LEATHER_HI = '#C98A56';
  const LEATHER_LO = '#6E3F24';
  ctx.strokeStyle = LEATHER_LO;
  ctx.lineWidth = 5 * s;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + w * 0.2, y + 10 * s);
  ctx.bezierCurveTo(x + w * 0.2, y - 18 * s, x + w * 0.8, y - 18 * s, x + w * 0.8, y + 10 * s);
  ctx.stroke();
  const body = new Path2D();
  body.roundRect(x, y + 8 * s, w, h - 8 * s, 8 * s);
  ctx.fillStyle = LEATHER;
  ctx.fill(body);
  const flap = new Path2D();
  flap.moveTo(x - 2 * s, y + 10 * s);
  flap.lineTo(x + w + 2 * s, y + 10 * s);
  flap.lineTo(x + w + 2 * s, y + h * 0.5);
  flap.quadraticCurveTo(x + w / 2, y + h * 0.78, x - 2 * s, y + h * 0.5);
  flap.closePath();
  ctx.fillStyle = LEATHER_HI;
  ctx.fill(flap);
  ctx.save();
  ctx.clip(body);
  stip(ctx, rnd, x, y, w, h, 0.3, LEATHER_LO, ramp(x + w * 0.4, y, x + w, y + h, 0, 0.6));
  stip(ctx, rnd, x, y, w, h * 0.6, 0.25, '#F0C890', ramp(x + w, y + h, x, y, 0, 0.5));
  ctx.restore();
  ctx.strokeStyle = LEATHER_LO;
  ctx.lineWidth = 1;
  ctx.stroke(flap);
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = '#E8B684';
  ctx.stroke(flap);
  ctx.setLineDash([]);
  const bx = x + w / 2;
  const by = y + h * 0.56;
  ctx.fillStyle = BRASS_LO;
  ctx.fillRect(bx - 8 * s, by - 6 * s, 16 * s, 14 * s);
  ctx.fillStyle = BRASS;
  ctx.fillRect(bx - 7 * s, by - 5 * s, 14 * s, 12 * s);
  ctx.fillStyle = LEATHER_LO;
  ctx.fillRect(bx - 4 * s, by - 2 * s, 8 * s, 6 * s);
}

// ── The cabin: wall, frame, table ──

function wallLayer(ctx: Ctx, rnd: () => number, g: Geo) {
  const { w, h, s } = g;
  const hole = new Path2D();
  hole.rect(0, 0, w, h);
  hole.addPath(g.glass);
  ctx.save();
  ctx.clip(hole, 'evenodd');
  ctx.fillStyle = WALL;
  ctx.fillRect(0, 0, w, h);
  const pitch = (g.wide ? 70 : 56) * s;
  for (let x = pitch * 0.55; x < w; x += pitch) {
    const px = Math.round(x);
    ctx.fillStyle = WALL_LO;
    ctx.fillRect(px, 0, 2, h);
    ctx.fillStyle = WALL_HI;
    ctx.fillRect(px + 2, 0, 1, h);
    dots(ctx, Array.from({ length: Math.ceil(h / (34 * s)) * 2 }, (_, i) => (i % 2 ? Math.round(((i >> 1) + 0.5) * 34 * s) : px - 5)), WALL_HI, 2);
  }
  stip(ctx, rnd, 0, 0, w, h, 0.14, WALL_HI, ramp(w, 0, 0, h, 0.3, 1));
  stip(ctx, rnd, 0, 0, w, h, 0.12, WALL_LO, ramp(0, 0, w, h, 0.25, 1));
  if (g.wide) {
    // A bench along the left, below the words: cushion, a lit edge, grain.
    const top = h * 0.865;
    const right = g.gx0 - g.fr - 2;
    ctx.fillStyle = SEAT;
    ctx.fillRect(0, top, right, h - top);
    ctx.fillStyle = SEAT_HI;
    ctx.fillRect(0, top, right, 3);
    ctx.fillStyle = WALL_LO;
    ctx.fillRect(0, top + 3, right, 1);
    stip(ctx, rnd, 0, top, right, h - top, 0.35, WALL_LO, ramp(0, top, 0, h, 0.2, 0.9));
    stip(ctx, rnd, 0, top, right, 12, 0.3, '#5B4080', ramp(0, top, 0, top + 12, 0.9, 0));
  }
  ctx.restore();
}

function frameLayer(ctx: Ctx, rnd: () => number, g: Geo) {
  const { gx0, gy0, gx1, gy1, fr, s } = g;
  const outer = new Path2D();
  outer.roundRect(gx0 - fr, gy0 - fr, gx1 - gx0 + 2 * fr, gy1 - gy0 + 2 * fr, g.gr + fr);
  const ring = new Path2D();
  ring.addPath(outer);
  ring.addPath(g.glass);
  ctx.save();
  ctx.clip(ring, 'evenodd');
  ctx.fillStyle = FRAME;
  ctx.fillRect(gx0 - fr, gy0 - fr, gx1 - gx0 + 2 * fr, gy1 - gy0 + 2 * fr);
  const bx = gx0 - fr;
  const by = gy0 - fr;
  const bw = gx1 - gx0 + 2 * fr;
  const bh = gy1 - gy0 + 2 * fr;
  stip(ctx, rnd, bx, by, bw, bh, 0.55, FRAME_HI, ramp(bx + bw, by + bh, bx, by, 0, 0.8));
  stip(ctx, rnd, bx, by, bw, bh, 0.5, FRAME_LO, ramp(bx, by, bx + bw, by + bh, 0, 0.85));
  // A dark lip where the glass meets the frame.
  ctx.strokeStyle = '#0F0A1B';
  ctx.lineWidth = 4 * s;
  ctx.stroke(g.glass);
  ctx.restore();
  ctx.strokeStyle = WALL_LO;
  ctx.lineWidth = 1.5;
  ctx.stroke(outer);
  // The one bar, with the thin magenta line under it that the picture has.
  const bar = g.barH;
  ctx.fillStyle = '#2B2046';
  ctx.fillRect(gx0 - 2, g.barY, gx1 - gx0 + 4, bar);
  ctx.fillStyle = FRAME_HI;
  ctx.fillRect(gx0 - 2, g.barY, gx1 - gx0 + 4, 1);
  ctx.fillStyle = '#9A3A8E';
  ctx.fillRect(gx0 - 2, g.barY + bar, gx1 - gx0 + 4, 1);
  stip(ctx, rnd, gx0, g.barY, gx1 - gx0, bar, 0.5, FRAME_LO, ramp(0, g.barY, 0, g.barY + bar, 0.1, 0.8));
  // Rivets along the sill and the head.
  const rv: number[] = [];
  const rd: number[] = [];
  for (let x = gx0 + 34 * s; x < gx1 - 30 * s; x += 26 * s) {
    for (const y of [gy1 + fr * 0.45, gy0 - fr * 0.55]) {
      rv.push(Math.round(x), Math.round(y));
      rd.push(Math.round(x), Math.round(y) + 2);
    }
  }
  dots(ctx, rd, FRAME_LO, 2);
  dots(ctx, rv, '#7C69B0', 2);
}

function tableLayer(ctx: Ctx, rnd: () => number, g: Geo) {
  const { tx, ty, tw, th, s, h } = g;
  const lip = 6 * s;
  // The warm light the table throws on the wall: dithered rust, thinning outward.
  halo(ctx, rnd, tx, ty + lip * 0.5, tw, th, 0.55, 0.3, '#7A2E24');
  halo(ctx, rnd, tx, ty + lip * 0.5, tw, th, 0.22, 0.5, '#A8402D');
  // Stem.
  const sw = 14 * s;
  ctx.fillStyle = '#2A1218';
  ctx.fillRect(tx - sw / 2, ty + th, sw, h - ty - th + 2);
  ctx.fillStyle = '#4A1E1C';
  ctx.fillRect(tx - sw / 2, ty + th, sw * 0.35, h - ty - th + 2);
  stip(ctx, rnd, tx - sw / 2, ty + th, sw, h - ty - th, 0.5, '#0E0509', ramp(tx - sw / 2, 0, tx + sw / 2, 0, 0.1, 0.9));
  // The edge, then the top in three flat bands: far edge dark, near edge bright.
  ctx.fillStyle = '#4C1B16';
  ctx.beginPath();
  ctx.ellipse(tx, ty + lip, tw, th, 0, 0, TAU);
  ctx.fill();
  const top = new Path2D();
  top.ellipse(tx, ty, tw, th, 0, 0, TAU);
  ctx.fillStyle = RUST_LO;
  ctx.fill(top);
  ctx.save();
  ctx.clip(top);
  ctx.fillStyle = RUST;
  ctx.beginPath();
  ctx.ellipse(tx, ty + th * 0.2, tw * 0.97, th * 0.84, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = RUST_HI;
  ctx.beginPath();
  ctx.ellipse(tx, ty + th * 0.5, tw * 0.92, th * 0.55, 0, 0, TAU);
  ctx.fill();
  stip(ctx, rnd, tx - tw, ty - th, tw * 2, th * 2, 0.5, '#3A1210', ramp(0, ty + th * 0.1, 0, ty - th, 0, 0.8));
  stip(ctx, rnd, tx - tw, ty, tw * 2, th, 0.5, '#FF9A72', ramp(0, ty + th * 0.1, 0, ty + th, 0, 0.55));
  ctx.restore();
  ctx.strokeStyle = '#E0805A';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(tx, ty, tw, th, 0, 0.12, Math.PI - 0.12);
  ctx.stroke();
}

function lampFixture(ctx: Ctx, g: Geo) {
  const { x, y, r } = g.lamp;
  // Bracket back to the post, cap above the shade, and the rim below it.
  ctx.fillStyle = BRASS_LO;
  ctx.fillRect(x, y - r - 5 * g.s, g.gx0 - g.fr - x + 1, 2.5 * g.s);
  ctx.fillRect(x - 1, y - r - 4 * g.s, 2, 4 * g.s);
  ctx.fillStyle = BRASS;
  ctx.fillRect(x - r - 1, y, 2 * r + 2, 2.5 * g.s);
  ctx.fillStyle = BRASS_LO;
  ctx.fillRect(x - r - 1, y + 2 * g.s, 2 * r + 2, 1);
}

// ── State ──

interface Paper { x0: number; y0: number; v: number; sz: number; ph: number; sp: number; tilt: number; pts: number[] }
interface Shard { dx: number; dy: number; rot: number; sz: number }
interface State {
  papers: Paper[];
  shipLit: number[];
  shipDark: number[];
  leaf: LeafGeom;
  leafDots: LeafDots;
  shards: Shard[];
  ringDots: number[];
  poolDots: number[];
}

const SHARDS: Pt[] = [[40, 5], [-42, 6], [64, 1], [-66, 2], [24, 12], [-26, 12], [84, 7], [-86, 8], [52, -8], [-54, -8], [100, 0], [-100, 1]];

// ── The shuttle ──

/** The shuttle in its own units (nose to +x, about 104 by 40), drawn at (cx, cy) scaled by sc and turned by ang. */
function shuttle(ctx: Ctx, st: State, cx: number, cy: number, sc: number, ang: number, flame: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(ang);
  ctx.scale(sc, sc);
  if (flame > 0) {
    const fl = 8 + 16 * flame;
    ctx.fillStyle = '#FF8A3D';
    ctx.beginPath();
    ctx.moveTo(-54, -3);
    ctx.lineTo(-54 - fl, 3);
    ctx.lineTo(-54, 9);
    ctx.fill();
    ctx.fillStyle = '#FFE08A';
    ctx.beginPath();
    ctx.moveTo(-54, -0.5);
    ctx.lineTo(-54 - fl * 0.55, 3);
    ctx.lineTo(-54, 6.5);
    ctx.fill();
  }
  // Fins behind the hull, and the engine bell.
  for (const [pts, edge] of [[[-40, -13, -49, -24, -29, -17], 1], [[-38, 16, -46, 23, -28, 18], 0]] as const) {
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    ctx.lineTo(pts[2], pts[3]);
    ctx.lineTo(pts[4], pts[5]);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#C2543A';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    ctx.lineTo(pts[2], pts[3]);
    ctx.stroke();
    if (edge) { ctx.fillStyle = '#CBB78A'; ctx.fillRect(-36, -16, 6, 3); }
  }
  ctx.fillStyle = '#5A4A38';
  ctx.fillRect(-56, -4, 9, 14);
  ctx.fillStyle = '#8A7A62';
  ctx.fillRect(-56, -4, 9, 2);
  // Hull: round nose, a dome of a back, a flat belly.
  const hull = new Path2D();
  hull.moveTo(-48, -8);
  hull.bezierCurveTo(-40, -18, -10, -22, 24, -15);
  hull.bezierCurveTo(40, -11, 53, -4, 53, 3);
  hull.bezierCurveTo(53, 11, 42, 17, 26, 18);
  hull.lineTo(-40, 18);
  hull.quadraticCurveTo(-48, 18, -48, 10);
  hull.closePath();
  ctx.fillStyle = PAPER;
  ctx.fill(hull);
  ctx.save();
  ctx.clip(hull);
  ctx.fillStyle = '#CBB78A';
  ctx.fillRect(-50, 11, 108, 10);
  ctx.fillStyle = '#C2543A';
  ctx.fillRect(-50, 3, 108, 6);
  ctx.fillStyle = '#7E2E20';
  ctx.fillRect(-50, 9, 108, 1.4);
  ctx.fillStyle = '#F5ECCF';
  ctx.fillRect(-50, -22, 108, 3);
  dots(ctx, st.shipDark, '#5E4C2C', 1);
  dots(ctx, st.shipLit, '#FFFBEA', 1);
  ctx.restore();
  // The window strip and two portholes, in lilac.
  ctx.fillStyle = '#3B2A80';
  ctx.beginPath();
  ctx.roundRect(8, -11, 33, 12, 5.5);
  ctx.fill();
  ctx.fillStyle = '#B9A8F0';
  ctx.beginPath();
  ctx.roundRect(10.5, -9, 28, 8, 4);
  ctx.fill();
  ctx.fillStyle = '#E8E0FF';
  ctx.fillRect(14, -8, 11, 2);
  for (const px of [-6, -19]) {
    ctx.fillStyle = '#3B2A80';
    ctx.beginPath();
    ctx.arc(px, -3, 4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#B9A8F0';
    ctx.beginPath();
    ctx.arc(px, -3, 2.6, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

// ── The crystal ──

const FACETS = [PINK_DEEP, PINK_MID, PINK, PINK_PALE] as const;

function crystal(ctx: Ctx, cx: number, cy: number, sc: number, t: number, moving: boolean, flash: number, travel: number) {
  const turn = moving ? Math.sin(t / 1500) : 0;
  const shift = moving ? Math.floor(t / 1500) % 4 : 2;
  const ax = turn * 2.2;
  const top: Pt = [ax * 0.4, -25];
  const bot: Pt = [ax * 0.4, 25];
  const mid: Pt = [ax, -1];
  const left: Pt = [-12 - turn * 1.2, -3];
  const right: Pt = [12 - turn * 1.2, -3];
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(sc, sc);
  const facets: Pt[][] = [[top, left, mid], [top, right, mid], [bot, right, mid], [bot, left, mid]];
  facets.forEach((f, i) => {
    ctx.fillStyle = flash === i + 1 ? '#FFF4FA' : FACETS[(i + shift) % 4]!;
    ctx.beginPath();
    ctx.moveTo(f[0]![0], f[0]![1]);
    ctx.lineTo(f[1]![0], f[1]![1]);
    ctx.lineTo(f[2]![0], f[2]![1]);
    ctx.closePath();
    ctx.fill();
  });
  ctx.strokeStyle = '#3A0A2C';
  ctx.lineWidth = 1 / sc;
  ctx.lineJoin = 'miter';
  ctx.beginPath();
  ctx.moveTo(top[0], top[1]);
  ctx.lineTo(right[0], right[1]);
  ctx.lineTo(bot[0], bot[1]);
  ctx.lineTo(left[0], left[1]);
  ctx.closePath();
  ctx.stroke();
  // The glint: a hard white four-point star, wandering round the facets while a block is boarding.
  const ga = travel;
  const gx = ax + Math.cos(ga) * 4.5;
  const gy = -4 + Math.sin(ga) * 9;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.moveTo(gx, gy - 5);
  ctx.lineTo(gx + 1.1, gy - 1.1);
  ctx.lineTo(gx + 5, gy);
  ctx.lineTo(gx + 1.1, gy + 1.1);
  ctx.lineTo(gx, gy + 5);
  ctx.lineTo(gx - 1.1, gy + 1.1);
  ctx.lineTo(gx - 5, gy);
  ctx.lineTo(gx - 1.1, gy - 1.1);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** One tilted ring round the crystal: `half` 0 is the far side (behind), 1 the near side. */
function ring(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, tilt: number, half: 0 | 1, colour: string) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, tilt, half ? 0 : Math.PI, half ? Math.PI : TAU);
  ctx.stroke();
}

function mote(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, tilt: number, a: number, sc: number, front: boolean) {
  const ex = Math.cos(a) * rx;
  const ey = Math.sin(a) * ry;
  if ((Math.sin(a) > 0) !== front) return;
  const x = cx + ex * Math.cos(tilt) - ey * Math.sin(tilt);
  const y = cy + ex * Math.sin(tilt) + ey * Math.cos(tilt);
  const r = 2.2 * sc;
  ctx.fillStyle = '#FF9ACB';
  ctx.fillRect(Math.round(x - r - 1), Math.round(y - 1), Math.round(2 * r + 2), 2);
  ctx.fillRect(Math.round(x - 1), Math.round(y - r - 1), 2, Math.round(2 * r + 2));
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(Math.round(x - 1), Math.round(y - 1), 2, 2);
}

export default defineScene<State>({
  sky: '#241A52',
  timing: { arriving: 5200, departing: 4200, passing: 4000 },

  layout(w, h, rnd) {
    const g = geo(w, h);
    const papers: Paper[] = Array.from({ length: 4 }, (_, i) => {
      const sz = (g.wide ? 17 : 8) * g.s * (i === 1 ? 1.35 : i === 3 ? 0.8 : 1);
      const pts: number[] = [];
      for (let k = 0; k < 60; k += 1) {
        const px = (rnd() * 2 - 1) * sz * 0.7;
        const py = (rnd() * 2 - 1) * sz;
        if (rnd() < 0.35 + 0.4 * ((px / sz + py / sz + 1.5) / 3)) pts.push(Math.floor(px), Math.floor(py));
      }
      return { x0: rnd(), y0: [0.14, 0.58, 0.3, 0.78][i]!, v: (6 + rnd() * 5) * g.s, sz, ph: rnd() * TAU, sp: 0.7 + rnd() * 0.6, tilt: (rnd() - 0.5) * 1.2, pts };
    });
    const shipLit: number[] = [];
    const shipDark: number[] = [];
    for (let i = 0; i < 1500; i += 1) {
      const x = -50 + rnd() * 106;
      const y = -22 + rnd() * 42;
      if (rnd() < clamp((-y - 6) / 12) * 0.8) shipLit.push(Math.round(x), Math.round(y));
      if (rnd() < clamp((y - 2) / 14) * 0.85 + (x < -34 ? 0.15 : 0)) shipDark.push(Math.round(x), Math.round(y));
    }
    const leaf = leafGeom(g.leaf.len);
    const ld = leafDots(rnd, g.leaf.len, 1, g.wide ? 0.22 : 0.3);
    const poolDots: number[] = [];
    for (let i = 0; i < 40; i += 1) poolDots.push(rnd() * 2 - 1, rnd());
    const ringDots: number[] = [];
    for (let i = 0; i < 26; i += 1) ringDots.push(rnd() * 2 - 1, rnd() * 2 - 1);
    const shards = SHARDS.map(([dx, dy]) => ({ dx, dy, rot: (rnd() - 0.5) * 2.2, sz: 0.9 + rnd() * 0.3 }));
    return { papers, shipLit, shipDark, leaf, leafDots: ld, shards, ringDots, poolDots };
  },

  // ── Outside: violet space, the river of dust, two planets ──
  back({ ctx, w, h, rnd }) {
    const g = geo(w, h);
    const { gx0, gy0, gx1, gy1, s } = g;
    const gw = gx1 - gx0;
    const gh = gy1 - gy0;
    ctx.save();
    ctx.clip(g.glass);
    const slope = -0.1;
    const lineY = (f: number) => (x: number) => gy0 + gh * f + slope * (x - gx0);
    const bands = [['#1B1340', -1], ['#251A58', 0.2], ['#302372', 0.42], ['#43297F', 0.62], ['#5A2A78', 0.8]] as const;
    ctx.fillStyle = bands[0][0];
    ctx.fillRect(gx0 - 2, gy0 - 2, gw + 4, gh + 4);
    for (let i = 1; i < bands.length; i += 1) {
      const [col, f] = bands[i]!;
      const ly = lineY(f);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(gx0 - 2, ly(gx0 - 2));
      ctx.lineTo(gx1 + 2, ly(gx1 + 2));
      ctx.lineTo(gx1 + 2, gy1 + 2);
      ctx.lineTo(gx0 - 2, gy1 + 2);
      ctx.fill();
      // The two colours leak across the join as dots.
      const y0 = ly(gx1) - 18 * s;
      const y1 = ly(gx0) + 10 * s;
      stip(ctx, rnd, gx0, y0, gw, y1 - y0, 0.9, col, (px, py) => 0.85 * clamp(1 - (ly(px) - py) / (18 * s)) ** 1.5 * (py < ly(px) ? 1 : 0));
      stip(ctx, rnd, gx0, y0, gw, y1 - y0, 0.9, bands[i - 1]![0], (px, py) => 0.5 * clamp(1 - (py - ly(px)) / (9 * s)) ** 1.5 * (py >= ly(px) ? 1 : 0));
    }
    // Stars.
    for (const [col, n, sz] of [['#CFC3F5', 150, 1], ['#E9DDB8', 40, 1], ['#F6EFD6', 14, 2]] as const) {
      ctx.fillStyle = col;
      ctx.beginPath();
      for (let i = 0; i < n; i += 1) ctx.rect(Math.floor(gx0 + rnd() * gw), Math.floor(gy0 + rnd() * gh), sz, sz);
      ctx.fill();
    }
    // The nebula: plum, then magenta, behind the planet, edged with dots.
    const pl = g.planet;
    for (const [col, ox, oy, rx, ry] of [['#53307F', -10, -4, 120, 78], ['#7A2E86', -34, 14, 70, 44]] as const) {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(pl.x + ox * s, pl.y + oy * s, rx * s, ry * s, -0.15, 0, TAU);
      ctx.fill();
      halo(ctx, rnd, pl.x + ox * s, pl.y + oy * s, rx * s, ry * s, 0.3, 0.5, col);
    }
    // The river: a curl of fine dust sweeping from the planet's side up toward the far corner.
    const bz = (t: number): Pt => {
      const u = 1 - t;
      const P = [[gx0 + gw * 0.08, gy0 + gh * 0.98], [gx0 + gw * 0.3, gy0 + gh * 0.3], [gx0 + gw * 0.62, gy0 + gh * 0.7], [gx1 + 10, gy0 + gh * 0.1]] as const;
      return [
        u * u * u * P[0][0] + 3 * u * u * t * P[1][0] + 3 * u * t * t * P[2][0] + t * t * t * P[3][0],
        u * u * u * P[0][1] + 3 * u * u * t * P[1][1] + 3 * u * t * t * P[2][1] + t * t * t * P[3][1],
      ];
    };
    const core: number[] = [];
    const edge: number[] = [];
    const grit: number[] = [];
    for (let i = 0; i < 5200; i += 1) {
      const t = rnd();
      const [px, py] = bz(t);
      const [qx, qy] = bz(Math.min(1, t + 0.01));
      const dx = qx - px || 0.01;
      const dy = qy - py;
      const len = Math.hypot(dx, dy);
      const wd = (4 + 17 * Math.sin(Math.PI * t) ** 0.7) * s;
      const off = (rnd() + rnd() + rnd() - 1.5) * wd * 1.4;
      if (rnd() > Math.sin(Math.PI * t) ** 0.4) continue;
      const x = Math.floor(px - (dy / len) * off);
      const y = Math.floor(py + (dx / len) * off);
      (Math.abs(off) < wd * 0.45 ? core : Math.abs(off) < wd ? edge : grit).push(x, y);
    }
    dots(ctx, grit, '#8F7ADB');
    dots(ctx, edge, '#B9A8F0');
    dots(ctx, core, '#E9DDB8');
    // The second planet: blue-grey and mottled, high up.
    const mn = g.moon;
    const moonPath = new Path2D();
    moonPath.arc(mn.x, mn.y, mn.r, 0, TAU);
    ctx.fillStyle = '#5B6B93';
    ctx.fill(moonPath);
    ctx.save();
    ctx.clip(moonPath);
    for (let i = 0; i < 12; i += 1) {
      ctx.fillStyle = i % 2 ? '#3F4E7A' : '#7A8DB5';
      ctx.beginPath();
      ctx.arc(mn.x + (rnd() * 2 - 1) * mn.r, mn.y + (rnd() * 2 - 1) * mn.r, (1 + rnd() * 3.4) * s, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = '#A5B4D6';
    const cres = new Path2D();
    cres.arc(mn.x, mn.y, mn.r, 0, TAU);
    cres.arc(mn.x + mn.r * 0.28, mn.y + mn.r * 0.28, mn.r * 1.02, 0, TAU);
    ctx.fill(cres, 'evenodd');
    stip(ctx, rnd, mn.x - mn.r, mn.y - mn.r, mn.r * 2, mn.r * 2, 0.7, '#1F2850', ramp(mn.x - mn.r * 0.2, mn.y - mn.r * 0.2, mn.x + mn.r, mn.y + mn.r, 0, 0.9));
    ctx.restore();

    // The giant: far half of the ring, the body in stripes, the near half of the ring.
    const tilt = -0.26;
    const annulus = (ri: number, ro: number, half: 0 | 1) => {
      const p = new Path2D();
      const a0 = half ? 0 : Math.PI;
      const a1 = half ? Math.PI : TAU;
      p.ellipse(pl.x, pl.y, pl.r * ro, pl.r * ro * 0.22, tilt, a0, a1);
      p.ellipse(pl.x, pl.y, pl.r * ri, pl.r * ri * 0.22, tilt, a1, a0, true);
      p.closePath();
      return p;
    };
    const paintRing = (half: 0 | 1) => {
      for (const [ri, ro, col, dk] of [[1.42, 1.72, '#B9A8F0', '#6C56B8'], [1.78, 1.96, '#8F7ADB', '#4C3A94']] as const) {
        const p = annulus(ri, ro, half);
        ctx.fillStyle = col;
        ctx.fill(p);
        ctx.save();
        ctx.clip(p);
        stip(ctx, rnd, pl.x - pl.r * 2, pl.y - pl.r * 0.6, pl.r * 4, pl.r * 1.2, 0.5, dk, ramp(pl.x - pl.r * 2, 0, pl.x + pl.r * 2, 0, 0.1, 0.75));
        stip(ctx, rnd, pl.x - pl.r * 2, pl.y - pl.r * 0.6, pl.r * 4, pl.r * 1.2, 0.35, '#F4EFFF', ramp(pl.x + pl.r * 2, 0, pl.x - pl.r * 2, 0, 0, 0.6));
        ctx.restore();
      }
    };
    paintRing(0);
    const body = new Path2D();
    body.arc(pl.x, pl.y, pl.r, 0, TAU);
    ctx.fillStyle = '#6C56B8';
    ctx.fill(body);
    ctx.save();
    ctx.clip(body);
    ctx.translate(pl.x, pl.y);
    ctx.rotate(0.2);
    const stripes: [number, string][] = [[-1, '#7B66C9'], [-0.62, '#9A86E0'], [-0.4, '#6C56B8'], [-0.12, '#8F7ADB'], [0.12, '#5E4AA6'], [0.4, '#7B66C9'], [0.7, '#4C3A94']];
    stripes.forEach(([y, col], i) => {
      ctx.fillStyle = col;
      ctx.fillRect(-pl.r, y * pl.r, pl.r * 2, pl.r * 2);
      if (i) {
        const yy = y * pl.r;
        const prev = stripes[i - 1]![1];
        stip(ctx, rnd, -pl.r, yy - 6 * s, pl.r * 2, 6 * s, 0.9, col, (_px, py) => 0.8 * clamp(1 - (yy - py) / (6 * s)));
        stip(ctx, rnd, -pl.r, yy, pl.r * 2, 4 * s, 0.9, prev, (_px, py) => 0.45 * clamp(1 - (py - yy) / (4 * s)));
      }
    });
    ctx.rotate(-0.2);
    ctx.translate(-pl.x, -pl.y);
    // Shaded lower right in stepped bands and dots; a hard crescent of light upper left.
    const dark = new Path2D();
    dark.arc(pl.x, pl.y, pl.r * 1.02, 0, TAU);
    dark.arc(pl.x - pl.r * 0.2, pl.y - pl.r * 0.2, pl.r * 0.96, 0, TAU);
    ctx.fillStyle = '#35286F';
    ctx.fill(dark, 'evenodd');
    stip(ctx, rnd, pl.x - pl.r, pl.y - pl.r, pl.r * 2, pl.r * 2, 0.9, '#2A1F5E', ramp(pl.x - pl.r * 0.3, pl.y - pl.r * 0.3, pl.x + pl.r * 0.9, pl.y + pl.r * 0.9, 0, 0.95));
    stip(ctx, rnd, pl.x - pl.r, pl.y - pl.r, pl.r * 2, pl.r * 2, 0.7, '#1B1345', ramp(pl.x + pl.r * 0.1, pl.y + pl.r * 0.1, pl.x + pl.r, pl.y + pl.r, 0, 0.8));
    const lit = new Path2D();
    lit.arc(pl.x, pl.y, pl.r * 1.02, 0, TAU);
    lit.arc(pl.x + pl.r * 0.08, pl.y + pl.r * 0.08, pl.r * 0.97, 0, TAU);
    ctx.fillStyle = '#CDBFFA';
    ctx.fill(lit, 'evenodd');
    stip(ctx, rnd, pl.x - pl.r, pl.y - pl.r, pl.r * 2, pl.r * 2, 0.6, '#D8CCFF', ramp(pl.x + pl.r * 0.1, pl.y + pl.r * 0.1, pl.x - pl.r * 0.9, pl.y - pl.r * 0.9, 0, 0.7));
    ctx.restore();
    paintRing(1);
    ctx.restore();
  },

  // ── Outside, moving: paper tumbling by, and the shuttle ──
  draw(f, s) {
    const { ctx, w, h, t, moving } = f;
    const { phase, k } = f.visitor;
    const g = geo(w, h);
    ctx.save();
    ctx.clip(g.glass);
    const gw = g.gx1 - g.gx0;
    const gh = g.gy1 - g.gy0;
    const span = gw + 90 * g.s;
    for (const p of s.papers) {
      const px = g.gx1 + 45 * g.s - ((p.x0 * span + (p.v * t) / 1000) % span);
      const py = g.gy0 + p.y0 * gh + Math.sin(t / 2300 + p.ph) * 5 * g.s;
      const spin = Math.cos((t / 3300) * p.sp + p.ph);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(p.tilt + Math.sin(t / 2900 + p.ph) * 0.45);
      ctx.scale(Math.max(0.24, Math.abs(spin)), 1);
      const hw = p.sz * 0.72;
      ctx.fillStyle = spin >= 0 ? PAPER : '#CDBE92';
      ctx.fillRect(-hw, -p.sz, hw * 2, p.sz * 2);
      ctx.fillStyle = '#B9A678';
      ctx.fillRect(-hw, -p.sz, hw * 2, 1);
      ctx.fillRect(-hw, p.sz - 1, hw * 2, 1);
      ctx.fillRect(-hw, -p.sz, 1, p.sz * 2);
      ctx.fillRect(hw - 1, -p.sz, 1, p.sz * 2);
      if (spin >= 0) {
        ctx.fillStyle = '#C9B684';
        for (let i = 0; i < 4; i += 1) ctx.fillRect(-hw * 0.7, -p.sz * 0.6 + i * p.sz * 0.35, hw * (i === 3 ? 0.8 : 1.4), 1);
      }
      dots(ctx, p.pts, '#A8955E', 1);
      ctx.restore();
    }
    const h0 = g.hold;
    const bob = moving ? Math.sin(t / 650) : 0;
    if (phase === 'arriving') {
      const e = easeOut(k);
      shuttle(ctx, s, h0.x + (g.gx1 + 90 * g.s - h0.x) * (1 - e) ** 1.5, h0.y - 26 * g.s * (1 - e) ** 2, h0.sc * (0.62 + 0.38 * e), 0.06 * (1 - e), 0.2 + 0.8 * (1 - e));
    } else if (phase === 'stopped') {
      shuttle(ctx, s, h0.x, h0.y + bob, h0.sc, 0, 0.12);
    } else if (phase === 'departing') {
      const q = clamp((k - 0.16) / 0.84) ** 1.9;
      const lift = clamp(q * 3);
      shuttle(ctx, s, h0.x + (g.gx1 + 110 * g.s - h0.x) * q, h0.y - (h0.y - g.gy0 + 60 * g.s) * q ** 1.2, h0.sc * (1 - 0.45 * q), -0.4 * lift, 0.3 + 0.7 * clamp(k * 4));
    } else if (phase === 'passing') {
      const x = g.gx0 - 50 * g.s + (gw + 100 * g.s) * (k * 0.8 + 0.2 * k * k);
      shuttle(ctx, s, x, g.gy0 + gh * 0.14, 0.36 * g.s * (g.wide ? 1 : 0.9), 0.02, 0.8);
    }
    ctx.restore();
  },

  // ── The cabin ──
  front({ ctx, w, h, rnd }) {
    const g = geo(w, h);
    const { s, wide } = g;
    wallLayer(ctx, rnd, g);
    if (wide) {
      const sw = w * 0.115;
      satchel(ctx, rnd, w * 0.265, h * 0.755, sw * 0.95 + 20, h * 0.225, s);
    }
    frameLayer(ctx, rnd, g);
    tableLayer(ctx, rnd, g);
    lampFixture(ctx, g);
    suitcase(ctx, rnd, g.lower, s, true, false);
    suitcase(ctx, rnd, g.upper, s, false, true);
    if (wide) {
      const L = [
        { x: w + 6 * s, y: -8 * s, ang: Math.PI * 0.78, len: 138 * s, flip: 1, tone: 0 },
        { x: w + 12 * s, y: h * 0.36, ang: Math.PI * 0.9, len: 96 * s, flip: 1, tone: 1 },
        { x: w - 58 * s, y: -16 * s, ang: Math.PI * 0.57, len: 100 * s, flip: -1, tone: 2 },
      ];
      for (const l of L) drawLeaf(ctx, leafGeom(l.len), leafDots(rnd, l.len, l.flip, 0.3), l.x, l.y, l.ang, l.flip, l.tone);
    }
  },

  // ── Alive: the swaying leaf, the signal, the crystal and what it has collected ──
  over(f, s) {
    const { ctx, w, h, t, moving } = f;
    const { phase, k } = f.visitor;
    const g = geo(w, h);
    const sc = g.cs;
    const boarding = phase === 'stopped' || (phase === 'arriving' && k > 0.6);

    // The lowest leaf, swaying a pixel or two.
    drawLeaf(ctx, s.leaf, s.leafDots, g.leaf.x, g.leaf.y, g.leaf.ang + (moving ? Math.sin(t / 1700) * 0.014 : 0), 1, g.wide ? 1 : 0);

    // The signal: a dome on the wall lamp, and a flat pool of light on the wall below it, dotted at its rim.
    const [lens, pool, rim] = f.caution ? SIGNAL.amber : SIGNAL.green;
    const { x: lx, y: ly, r: lr } = g.lamp;
    const py0 = ly + 3 * g.s;
    const py1 = py0 + lr * 3.6;
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.moveTo(lx - lr * 1.1, py0);
    ctx.lineTo(lx + lr * 1.1, py0);
    ctx.lineTo(lx + lr * 2.9, py1);
    ctx.lineTo(lx - lr * 2.9, py1);
    ctx.fill();
    ctx.fillStyle = pool;
    ctx.beginPath();
    for (let i = 0; i < s.poolDots.length; i += 2) {
      const u = s.poolDots[i]!;
      const v = s.poolDots[i + 1]!;
      ctx.rect(Math.floor(lx + u * lr * (2.6 + v * 1.2)), Math.floor(py1 + v * lr * 1.6), 1, 1);
    }
    ctx.fill();
    ctx.fillStyle = rim;
    ctx.beginPath();
    for (let i = 0; i < s.poolDots.length; i += 4) ctx.rect(Math.floor(lx + s.poolDots[i]! * lr * 2), Math.floor(py0 + (s.poolDots[i + 1]! * 0.5 + 0.5) * lr * 3), 1, 1);
    ctx.fill();
    ctx.fillStyle = lens;
    ctx.beginPath();
    ctx.arc(lx, ly, lr, Math.PI, TAU);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(Math.round(lx - lr * 0.55), Math.round(ly - lr * 0.7), Math.max(2, Math.round(lr * 0.45)), 2);

    // The table's light, shards and crystal.
    const cx = g.tx;
    const bobPeriod = boarding ? 2400 : 4000;
    const bob = moving ? Math.sin((t / bobPeriod) * TAU) : 0;
    const tipY = g.ty - 14 * sc;
    const cy = tipY - 25 * sc + bob * sc;
    ctx.fillStyle = '#C93C84';
    ctx.beginPath();
    ctx.ellipse(cx, g.ty + g.th * 0.1, 31 * g.s * (g.wide ? 1 : 0.6), g.th * 0.34, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#FF8FC0';
    ctx.beginPath();
    ctx.ellipse(cx, g.ty + g.th * 0.1, 17 * g.s * (g.wide ? 1 : 0.6), g.th * 0.18, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#FFB0D4';
    ctx.beginPath();
    for (let i = 0; i < s.ringDots.length; i += 2) {
      const rx = s.ringDots[i]!;
      const ry = s.ringDots[i + 1]!;
      if (rx * rx + ry * ry < 1) ctx.rect(Math.floor(cx + rx * 40 * g.s * (g.wide ? 1 : 0.6)), Math.floor(g.ty + g.th * 0.1 + ry * g.th * 0.5), 1, 1);
    }
    ctx.fill();
    for (let i = 0; i < Math.min(12, f.done); i += 1) {
      const sh = s.shards[i]!;
      const x = cx + sh.dx * (g.tw / 112);
      const y = g.ty + sh.dy * (g.th / 19) * 0.9 + g.th * 0.1;
      const z = sh.sz * g.s * (g.wide ? 1.2 : 0.85);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(sh.rot);
      ctx.fillStyle = '#5A1E1C';
      ctx.beginPath();
      ctx.ellipse(1, 5 * z, 4 * z, 1.4 * z, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = PINK_MID;
      ctx.beginPath();
      ctx.moveTo(0, -6 * z);
      ctx.lineTo(0, 6 * z);
      ctx.lineTo(-3.4 * z, -0.5 * z);
      ctx.fill();
      ctx.fillStyle = PINK;
      ctx.beginPath();
      ctx.moveTo(0, -6 * z);
      ctx.lineTo(3.4 * z, -0.5 * z);
      ctx.lineTo(0, 6 * z);
      ctx.fill();
      ctx.fillStyle = PINK_PALE;
      ctx.fillRect(Math.round(0.6 * z), Math.round(-2.4 * z), 1.4, 2);
      ctx.restore();
    }
    const orbit = moving ? (t / 760) % TAU : 0.9;
    ring(ctx, cx, cy + 3 * sc, 27 * sc, 7 * sc, -0.34, 0, '#FF9ACB');
    if (boarding) {
      ring(ctx, cx, cy + 2 * sc, 23 * sc, 9.5 * sc, 0.5, 0, '#C9B5FF');
      mote(ctx, cx, cy + 2 * sc, 23 * sc, 9.5 * sc, 0.5, orbit, sc, false);
      mote(ctx, cx, cy + 2 * sc, 23 * sc, 9.5 * sc, 0.5, orbit + Math.PI, sc, false);
    }
    // The glint flashes across all four facets as the shuttle leaves.
    const flash = phase === 'departing' && k > 0.1 && k < 0.7 ? Math.floor((k - 0.1) / 0.15) + 1 : 0;
    crystal(ctx, cx, cy, sc, t, moving, flash, boarding ? orbit : -0.8);
    ring(ctx, cx, cy + 3 * sc, 27 * sc, 7 * sc, -0.34, 1, '#FF9ACB');
    if (boarding) {
      ring(ctx, cx, cy + 2 * sc, 23 * sc, 9.5 * sc, 0.5, 1, '#C9B5FF');
      mote(ctx, cx, cy + 2 * sc, 23 * sc, 9.5 * sc, 0.5, orbit, sc, true);
      mote(ctx, cx, cy + 2 * sc, 23 * sc, 9.5 * sc, 0.5, orbit + Math.PI, sc, true);
    }
  },
});
