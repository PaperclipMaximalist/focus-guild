/**
 * The Abyssal Line's small drawn things: brasswork on the submersible's bridge.
 * Brass (#6A5222 #8A6A2C #B8923E #E0C070), iron (#0C1210 #16201C #2E3C34 #4A5E52),
 * hemp rope, green water, and chartreuse only on the maker's plate and the frog.
 * Everything lands on the half-pixel grid; round things are shaded by a lit
 * sphere with a two-by-two stipple between tones, light from the upper left.
 *
 *   frames.panel      a riveted plate: a lit iron rule, a fine brass rule inside it,
 *                     a brass rivet every 12 px, a square corner plate with a domed rivet
 *   frames.card       a porthole's surround: a thick brass band, lit above and shadowed
 *                     below, with bolts and plate joints, an iron and a brass rule inside
 *                     it, and a boss with a scrolled bracket (a pair of S-curls) in each corner
 *   frames.sign       a maker's plate, ink on the chartreuse: an engraved double rule,
 *                     a stamped dash line and a rivet in each corner
 *   edges.vertical    a rope of twisted strands with a brass-seized knot every 64 px
 *   edges.horizontal  the scrolled railing: S-curls and rings in iron between two rails
 *   sprites.emblem    a ship's wheel in brass
 *   sprites.mark      a small brass anchor
 *   sprites.rule      a length of rope: a knot at the left, a brass whipping and a fray at the right
 *   sprites.tail      the whale in silhouette, a trail of bubbles and a jellyfish below
 *   sprites.spot      a diving helmet on the seabed, a jellyfish drifting past, bubbles
 *                     rising, and the frog sitting on top
 */

import { defineOrnaments } from '../types';
import type { Paint } from '../types';

const BR = ['#6A5222', '#8A6A2C', '#B8923E', '#E0C070'];
const IR = ['#0C1210', '#16201C', '#2E3C34', '#4A5E52'];
const IRL = '#8CA898', IRM = '#506A5C';
const WATER = ['#0E4A3A', '#17705A', '#25A07A', '#5FD0A0', '#B9F2D0'];
const WH = ['#154A42', '#1E5C52', '#2E7C6C', '#8FD6C0'];
const ROPE = ['#3E3520', '#7A6C40', '#A89868', '#D8C896'];
const FROG = '#C8F560', FROG_LT = '#E6FF9A', FROG_DK = '#8FB82E', INK = '#0B1402';
const JELLY = ['#6ECFA4', '#C8F2DC', '#E4FAEC'];

// ── Helpers ──

const q = (v: number) => Math.round(v * 2) / 2;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

const R = (p: Paint, c: string, x: number, y: number, w: number, h: number, a = 1) => {
  p.ctx.globalAlpha = a;
  p.ctx.fillStyle = c;
  p.ctx.fillRect(x, y, w, h);
  p.ctx.globalAlpha = 1;
};

/** Scan a polygon (points x, y, x, y, …) into spans on the half-pixel grid. */
const spans = (pts: number[], cb: (a: number, b: number, y: number) => void) => {
  const n = pts.length / 2;
  let lo = 1e4, hi = -1e4;
  for (let i = 0; i < n; i += 1) { lo = Math.min(lo, pts[i * 2 + 1]!); hi = Math.max(hi, pts[i * 2 + 1]!); }
  for (let y = Math.floor(lo * 2) / 2; y < hi; y += 0.5) {
    const yy = y + 0.25, xs: number[] = [];
    for (let i = 0; i < n; i += 1) {
      const j = (i + 1) % n;
      const x0 = pts[i * 2]!, y0 = pts[i * 2 + 1]!, x1 = pts[j * 2]!, y1 = pts[j * 2 + 1]!;
      if ((y0 <= yy && y1 > yy) || (y1 <= yy && y0 > yy)) xs.push(x0 + ((yy - y0) * (x1 - x0)) / (y1 - y0));
    }
    xs.sort((m, o) => m - o);
    for (let k = 0; k + 1 < xs.length; k += 2) if (q(xs[k + 1]!) > q(xs[k]!)) cb(q(xs[k]!), q(xs[k + 1]!), y);
  }
};
const poly = (p: Paint, c: string, pts: number[]) => spans(pts, (a, b, y) => R(p, c, a, y, b - a, 0.5));
/** Run `fn` with painting limited to the inside of a polygon. */
const within = (p: Paint, pts: number[], fn: () => void) => {
  p.ctx.save();
  p.ctx.beginPath();
  spans(pts, (a, b, y) => p.ctx.rect(a, y, b - a, 0.5));
  p.ctx.clip();
  fn();
  p.ctx.restore();
};

type Clip = [number, number, number, number];
const ell = (p: Paint, c: string, cx: number, cy: number, rx: number, ry: number, clip: Clip = [-1e4, 1e4, -1e4, 1e4]) => {
  for (let y = Math.floor((cy - ry) * 2) / 2; y < cy + ry; y += 0.5) {
    if (y < clip[2] - 1e-6 || y + 0.5 > clip[3] + 1e-6) continue;
    const dy = (y + 0.25 - cy) / ry, s = 1 - dy * dy;
    if (s <= 0) continue;
    const hw = rx * Math.sqrt(s), x0 = Math.max(q(cx - hw), clip[0]), x1 = Math.min(q(cx + hw), clip[1]);
    if (x1 > x0) R(p, c, x0, y, x1 - x0, 0.5);
  }
};
const disc = (p: Paint, c: string, cx: number, cy: number, r: number, clip?: Clip) => ell(p, c, cx, cy, r, r, clip);

/** A flat ring: outer radius rx, ry and wall thickness t. */
const ring = (p: Paint, c: string, cx: number, cy: number, rx: number, ry: number, t: number) => {
  for (let y = Math.floor((cy - ry) * 2) / 2; y < cy + ry; y += 0.5) {
    const dy = (y + 0.25 - cy) / ry, s = 1 - dy * dy;
    if (s <= 0) continue;
    const hw = rx * Math.sqrt(s), di = (y + 0.25 - cy) / (ry - t), si = 1 - di * di;
    const hi = si > 0 ? (rx - t) * Math.sqrt(si) : 0, a = q(cx - hw), b = q(cx + hw);
    if (hi <= 0) R(p, c, a, y, b - a, 0.5);
    else { R(p, c, a, y, q(cx - hi) - a, 0.5); R(p, c, q(cx + hi), y, b - q(cx + hi), 0.5); }
  }
};

/** A line of square dots t thick. */
const line = (p: Paint, c: string, x0: number, y0: number, x1: number, y1: number, t = 1) => {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
  for (let i = 0; i <= n; i += 1) R(p, c, q(x0 + ((x1 - x0) * i) / n - t / 2), q(y0 + ((y1 - y0) * i) / n - t / 2), t, t);
};
const trace = (p: Paint, c: string, pts: number[], t: number, ox = 0, oy = 0) => {
  for (let i = 2; i < pts.length; i += 2) line(p, c, pts[i - 2]! + ox, pts[i - 1]! + oy, pts[i]! + ox, pts[i + 1]! + oy, t);
};
const bz = (a: number[], b: number[], c: number[], d: number[], n = 14) => {
  const o: number[] = [];
  for (let i = 1; i <= n; i += 1) {
    const t = i / n, m = 1 - t;
    for (const k of [0, 1]) o.push(m * m * m * a[k]! + 3 * m * m * t * b[k]! + 3 * m * t * t * c[k]! + t * t * t * d[k]!);
  }
  return o;
};

/** Light from the upper left: -1 (shade) to 1 (lit) for a surface normal. */
const lum = (nx: number, ny: number, nz: number) => -0.5 * nx - 0.6 * ny + 0.62 * nz;
const BAYER = [0, 2, 3, 1];
const pick = (n: number, l: number, x: number, y: number, dith: boolean) => {
  let f = ((l + 0.35) / 1.3) * (n - 1);
  if (dith) f += (BAYER[(Math.round(x * 2) & 1) + 2 * (Math.round(y * 2) & 1)]! + 0.5) / 4 - 0.5;
  return clamp(Math.round(f), 0, n - 1);
};

/** A lit sphere in a ramp of tones, dark to light. fx/fy turn the light round inside a mirrored corner. */
const ball = (p: Paint, t: string[], cx: number, cy: number, r: number, dith = true, fx = false, fy = false) => {
  for (let y = Math.floor((cy - r) * 2) / 2; y < cy + r; y += 0.5) {
    for (let x = Math.floor((cx - r) * 2) / 2; x < cx + r; x += 0.5) {
      const dx = (x + 0.25 - cx) / r, dy = (y + 0.25 - cy) / r, d2 = dx * dx + dy * dy;
      if (d2 > 1) continue;
      R(p, t[pick(t.length, lum(fx ? -dx : dx, fy ? -dy : dy, Math.sqrt(1 - d2)), x, y, dith)]!, x, y, 0.5, 0.5);
    }
  }
};
/** A lit ring (a torus) from inner radius ri to outer radius ro. */
const tube = (p: Paint, t: string[], cx: number, cy: number, ri: number, ro: number, dith = false) => {
  for (let y = Math.floor((cy - ro) * 2) / 2; y < cy + ro; y += 0.5) {
    for (let x = Math.floor((cx - ro) * 2) / 2; x < cx + ro; x += 0.5) {
      const dx = x + 0.25 - cx, dy = y + 0.25 - cy, d = Math.hypot(dx, dy);
      if (d < ri || d > ro) continue;
      const u = (d - (ri + ro) / 2) / ((ro - ri) / 2);
      R(p, t[pick(t.length, lum((dx / d) * u, (dy / d) * u, Math.sqrt(1 - u * u)), x, y, dith)]!, x, y, 0.5, 0.5);
    }
  }
};
const IRON_T = [IR[0]!, IR[2]!, IR[3]!, IRL];

/** A flat plate with a lit and a shaded side; sx/sy put the light on the far side in a mirrored corner. */
const bevel = (p: Paint, x: number, y: number, w: number, h: number, o: string, body: string, hi: string, lo: string, sx = false, sy = false, e = 0.5) => {
  R(p, o, x, y, w, h);
  R(p, body, x + e, y + e, w - 2 * e, h - 2 * e);
  R(p, hi, x + e, sy ? y + h - 2 * e : y + e, w - 2 * e, e);
  R(p, lo, x + e, sy ? y + e : y + h - 2 * e, w - 2 * e, e);
  R(p, hi, sx ? x + w - 2 * e : x + e, y + e, e, h - 2 * e);
  R(p, lo, sx ? x + e : x + w - 2 * e, y + e, e, h - 2 * e);
};

type Row = [string, number, number];
/** Parallel bands along an edge, as [colour, depth, thickness]. On the far sides they are turned round inside their own `tot`, so the light stays up and to the left. */
const rows = (p: Paint, far: boolean, x0: number, x1: number, off: number, tot: number, r: Row[]) => {
  for (const [c, d, t] of r) R(p, c, x0, off + (far ? tot - d - t : d), x1 - x0, t);
};

/** Draw one corner and get four: draw(k, mirrorX, mirrorY), k = 0 TL, 1 TR, 2 BR, 3 BL. */
const fourCorners = (p: Paint, draw: (k: number, sx: boolean, sy: boolean) => void) => {
  const s = p.w;
  const m: number[][] = [[1, 0, 0, 1, 0, 0], [-1, 0, 0, 1, s, 0], [-1, 0, 0, -1, s, s], [1, 0, 0, -1, 0, s]];
  m.forEach((t, k) => {
    p.ctx.save();
    p.ctx.transform(t[0]!, t[1]!, t[2]!, t[3]!, t[4]!, t[5]!);
    draw(k, k === 1 || k === 2, k === 2 || k === 3);
    p.ctx.restore();
  });
};
/** Draw the top edge once (x from 0 to edge, depth down from the outside) and get all four sides. far is true for the bottom and right. */
const fourEdges = (p: Paint, slice: number, draw: (far: boolean) => void) => {
  const s = p.w;
  const m: number[][] = [[1, 0, 0, 1, slice, 0], [1, 0, 0, -1, slice, s], [0, 1, 1, 0, 0, slice], [0, 1, -1, 0, s, slice]];
  m.forEach((t, k) => {
    p.ctx.save();
    p.ctx.transform(t[0]!, t[1]!, t[2]!, t[3]!, t[4]!, t[5]!);
    draw(k === 1 || k === 3);
    p.ctx.restore();
  });
};

// ── frames.panel: a riveted plate ──

const IRON_RULE: Row[] = [[IR[0]!, 0, 0.5], [IRL, 0.5, 0.5], [IR[3]!, 1, 1], [IR[2]!, 2, 1.5], [IR[0]!, 3.5, 0.5]];
const BRASS_RULE: Row[] = [[BR[2]!, 0, 0.5], [BR[1]!, 0.5, 0.5], [BR[0]!, 1, 0.5]];

const panel = (p: Paint) => {
  const SL = 10, E = p.w - SL * 2;
  fourEdges(p, SL, (far) => {
    rows(p, far, 0, E, 0, 4, IRON_RULE);
    rows(p, far, 0, E, 5, 1.5, BRASS_RULE);
    // A brass rivet every 12 px on the iron rule, with its lit side up and left.
    for (let x = 6; x < E; x += 12) {
      disc(p, IR[0]!, x, 2, 1.9);
      ball(p, BR, x, 2, 1.5, false, false, far);
    }
  });
  fourCorners(p, (_k, sx, sy) => {
    bevel(p, 0, 0, SL, SL, IR[0]!, IR[2]!, IR[3]!, IR[1]!, sx, sy);
    for (const [x, y] of [[2, 2], [8, 2], [2, 8], [8, 8]] as const) R(p, IR[0]!, x, y, 0.5, 0.5);
    disc(p, IR[0]!, 5, 5, 3.6);
    ball(p, BR, 5, 5, 3.1, true, sx, sy);
    R(p, BR[3]!, sx ? 5.5 : 3.5, sy ? 5.5 : 3.5, 1, 0.5);
  });
};

// ── frames.card: a porthole's surround ──

const BAND: Row[] = [[IR[0]!, 0, 0.5], [BR[3]!, 0.5, 1], [BR[2]!, 1.5, 2], [BR[1]!, 3.5, 2], [BR[0]!, 5.5, 1], [IR[0]!, 6.5, 0.5]];
const INNER: Row[] = [[IR[0]!, 0, 0.5], [IRL, 0.5, 0.5], [IR[3]!, 1, 1], [IR[2]!, 2, 0.5], [IR[0]!, 2.5, 0.5]];

/** The S-curl of a bracket, in a 20 px corner: a tail off the boss that dips, then a spiral. */
const curlPts = () => {
  const o = [13, 8.2, 14, 8.9, 14.9, 9.3, 15.6, 9.5];
  for (let i = 1; i <= 28; i += 1) {
    const t = i / 28, a = -Math.PI / 2 + t * 2.3 * Math.PI, r = 2.8 - 1.9 * t;
    o.push(15.6 + Math.cos(a) * r, 12.3 + Math.sin(a) * r);
  }
  return o;
};

const card = (p: Paint) => {
  const SL = 20, E = p.w - SL * 2;
  fourEdges(p, SL, (far) => {
    rows(p, far, 0, E, 0, 7, BAND);
    rows(p, far, 0, E, 9, 3, INNER);
    rows(p, far, 0, E, 12.5, 1, [[BR[1]!, 0, 0.5], [BR[0]!, 0.5, 0.5]]);
    // A plate joint at the start of each 24 px run, and an iron bolt in the middle of it.
    R(p, IR[0]!, 0, 0.5, 0.5, 6);
    R(p, BR[3]!, 0.5, far ? 0.5 : 1, 0.5, 5.5);
    disc(p, IR[0]!, 12, 3.5, 2.5);
    ball(p, IRON_T, 12, 3.5, 2, true, false, far);
  });
  fourCorners(p, (_k, sx, sy) => {
    const c = p.ctx;
    // The two runs of band under the boss, then the boss itself.
    rows(p, sy, 0, SL, 0, 7, BAND);
    c.save();
    c.transform(0, 1, 1, 0, 0, 0);
    rows(p, sx, 0, SL, 0, 7, BAND);
    c.restore();
    bevel(p, 0, 0, 13, 13, IR[0]!, BR[2]!, BR[3]!, BR[0]!, sx, sy, 1);
    bevel(p, 2.5, 2.5, 8, 8, BR[0]!, BR[1]!, BR[0]!, BR[3]!, sx, sy);
    disc(p, IR[0]!, 6.5, 6.5, 3.2);
    ball(p, IRON_T, 6.5, 6.5, 2.7, true, sx, sy);
    // The bracket: one S-curl running right under the top band and one running down under the left.
    const pts = curlPts(), ox = sx ? 0.3 : -0.3, oy = sy ? 0.3 : -0.3;
    const curl = (hx: number, hy: number) => {
      trace(p, IR[0]!, pts, 2.5);
      trace(p, BR[1]!, pts, 1.5);
      trace(p, BR[2]!, pts, 1, hx * 0.4, hy * 0.4);
      trace(p, BR[3]!, pts, 0.5, hx, hy);
      disc(p, BR[3]!, 15.6, 12.3, 0.6);
    };
    curl(ox, oy);
    c.save();
    c.transform(0, 1, 1, 0, 0, 0);
    curl(oy, ox);
    c.restore();
  });
};

// ── frames.sign: a maker's plate, ink on the chartreuse ──

const sign = (p: Paint) => {
  const SL = 10, E = p.w - SL * 2;
  fourEdges(p, SL, () => {
    R(p, INK, 0, 1.5, E, 1, 0.85);
    R(p, INK, 0, 3.5, E, 0.5, 0.55);
    for (let x = 2; x < E; x += 8) R(p, INK, x, 5.5, 3, 0.5, 0.3);
  });
  fourCorners(p, (_k, sx, sy) => {
    R(p, INK, 1.5, 1.5, 8.5, 1, 0.85);
    R(p, INK, 1.5, 1.5, 1, 8.5, 0.85);
    R(p, INK, 3.5, 3.5, 6.5, 0.5, 0.55);
    R(p, INK, 3.5, 3.5, 0.5, 6.5, 0.55);
    disc(p, FROG, 5.5, 5.5, 3);
    disc(p, INK, 5.5, 5.5, 2.4);
    disc(p, '#59701F', sx ? 5.2 : 5.8, sy ? 5.2 : 5.8, 1.6);
    R(p, FROG_LT, sx ? 6.5 : 4.5, sy ? 6.5 : 4.5, 1, 0.5);
    R(p, INK, 4.5, 5.25, 2, 0.5, 0.5);
  });
};

// ── Rope ──

/** A length of twisted rope along s (hor: left to right, else top to bottom), centred at c, hw each side. */
const rope = (p: Paint, hor: boolean, a0: number, a1: number, c: number, hw: number, per: number, sl: number) => {
  for (let s = a0; s < a1; s += 0.5) {
    for (let n = c - hw - 0.5; n < c + hw + 0.5; n += 0.5) {
      const nn = n + 0.25 - c, u = ((((s + 0.25 + nn * sl) / per) % 1) + 1) % 1;
      if (Math.abs(nn) > hw - (u > 0.72 ? 0.5 : 0)) continue;
      let i = u > 0.72 ? 0 : u < 0.12 ? 3 : u < 0.45 ? 2 : 1;
      const a = Math.abs(nn) / hw;
      if (a > 0.72) i = Math.max(0, i - 1);
      else if (a < 0.45 && nn < 0 && i === 2) i = 3;
      R(p, ROPE[i]!, hor ? s : n, hor ? n : s, 0.5, 0.5);
    }
  }
};
/** A knot: a lit bulge wrapped the other way to the lay of the rope. */
const knot = (p: Paint, hor: boolean, cx: number, cy: number, rx: number, ry: number) => {
  ell(p, IR[0]!, cx, cy, rx + 0.7, ry + 0.7);
  for (let y = Math.floor((cy - ry) * 2) / 2; y < cy + ry; y += 0.5) {
    for (let x = Math.floor((cx - rx) * 2) / 2; x < cx + rx; x += 0.5) {
      const dx = (x + 0.25 - cx) / rx, dy = (y + 0.25 - cy) / ry, d2 = dx * dx + dy * dy;
      if (d2 > 1) continue;
      const s = hor ? x + 0.25 - cx : y + 0.25 - cy, n = hor ? y + 0.25 - cy : x + 0.25 - cx;
      const u = ((((s - n * 0.8) / 3.4) % 1) + 1) % 1;
      let i = u > 0.7 ? 0 : u < 0.15 ? 3 : u < 0.5 ? 2 : 1;
      const l = lum(dx, dy, Math.sqrt(1 - d2));
      if (l < -0.3) i = Math.max(0, i - 1);
      else if (l > 0.5 && i > 0 && i < 3) i += 1;
      R(p, ROPE[i]!, x, y, 0.5, 0.5);
    }
  }
};

// ── edges ──

const vertical = {
  w: 12,
  h: 64,
  paint: (p: Paint) => {
    rope(p, false, 0, 64, 6, 5, 8, 1.6);
    knot(p, false, 6, 32, 6, 6.5);
    for (const y of [24, 38.5]) bevel(p, 0, y, 12, 2, IR[0]!, BR[2]!, BR[3]!, BR[0]!);
  },
};

/** An S of two opposed scrolls: its middle at x = xa + r0, running out to the left and right. */
const sPts = (xa: number, mid: number, r0: number, d: number) => {
  const o: number[] = [], xb = xa + 2 * r0;
  for (let i = 22; i >= 0; i -= 1) {
    const t = i / 22, r = r0 * (1 - 0.74 * t), a = d * t * 1.55 * Math.PI;
    o.push(xa + Math.cos(a) * r, mid + Math.sin(a) * r);
  }
  for (let i = 1; i <= 22; i += 1) {
    const t = i / 22, r = r0 * (1 - 0.74 * t), a = Math.PI + d * t * 1.55 * Math.PI;
    o.push(xb + Math.cos(a) * r, mid + Math.sin(a) * r);
  }
  return o;
};

const horizontal = {
  w: 64,
  h: 12,
  paint: (p: Paint) => {
    for (const y of [0, 10]) {
      R(p, IR[0]!, 0, y, 64, 2);
      R(p, IRL, 0, y + 0.5, 64, 0.5);
      R(p, IR[3]!, 0, y + 1, 64, 0.5);
    }
    for (const x0 of [0, 32]) {
      const pts = sPts(x0 + 8.7, 6, 3.2, x0 ? 1 : -1);
      trace(p, IR[0]!, pts, 2.5);
      trace(p, IRM, pts, 1.5);
      trace(p, IRL, pts, 0.5, -0.4, -0.4);
      ring(p, IR[0]!, x0 + 23.2, 6, 3.1, 3.1, 2);
      ring(p, IRM, x0 + 23.2, 6, 2.6, 2.6, 1.2);
      R(p, IRL, x0 + 21.7, 4.3, 1.5, 0.5);
      disc(p, BR[2]!, x0 + 23.2, 6, 0.6);
    }
    // A post at each end of the run: iron, with a brass bead.
    for (const x of [0, 32, 64]) {
      bevel(p, x - 1.25, 0, 2.5, 12, IR[0]!, IR[2]!, IRL, IR[1]!);
      disc(p, IR[0]!, x, 6, 2.1);
      ball(p, BR, x, 6, 1.7, false);
    }
  },
};

// ── sprites ──

const emblem = {
  w: 24,
  h: 24,
  paint: (p: Paint) => {
    const cx = 12, cy = 12;
    const ang = (i: number) => (i * Math.PI) / 4 - Math.PI / 2;
    for (let i = 0; i < 8; i += 1) line(p, IR[0]!, cx, cy, cx + Math.cos(ang(i)) * 9.4, cy + Math.sin(ang(i)) * 9.4, 3);
    ring(p, IR[0]!, cx, cy, 8.2, 8.2, 4.2);
    for (let i = 0; i < 8; i += 1) {
      const c = Math.cos(ang(i)), s = Math.sin(ang(i)), l = -(c * 0.5 + s * 0.6);
      line(p, l > 0.3 ? BR[3]! : l > -0.2 ? BR[2]! : BR[1]!, cx, cy, cx + c * 9.2, cy + s * 9.2, 1.5);
    }
    tube(p, BR, cx, cy, 4.5, 7.6);
    for (let i = 0; i < 8; i += 1) {
      const kx = cx + Math.cos(ang(i)) * 9.6, ky = cy + Math.sin(ang(i)) * 9.6;
      disc(p, IR[0]!, kx, ky, 2.1);
      ball(p, BR, kx, ky, 1.6, false);
    }
    disc(p, IR[0]!, cx, cy, 3.1);
    ball(p, BR, cx, cy, 2.6, false);
    R(p, IR[1]!, cx - 0.5, cy - 0.5, 1, 1);
  },
};

const mark = {
  w: 14,
  h: 14,
  paint: (p: Paint) => {
    const draw = (body: string, hi: string | null, lo: string | null, g: number) => {
      ring(p, body, 7, 2.4, 1.9 + g, 1.9 + g, 0.9 + g);
      R(p, body, 6.25 - g, 3.6, 1.5 + 2 * g, 8.4 + g);
      R(p, body, 4 - g, 4.6 - g, 6 + 2 * g, 1.2 + 2 * g);
      const arc: number[] = [];
      for (let i = 0; i <= 14; i += 1) { const a = Math.PI * (0.1 + 0.8 * (i / 14)); arc.push(7 + Math.cos(a) * 5.2, 7.2 + Math.sin(a) * 5.2); }
      trace(p, body, arc, 1.5 + 2 * g);
      for (const m of [1, -1]) poly(p, body, [7 + m * 6.4 - g * m, 7 - g, 7 + m * 3.4 + g * m, 9.6 + g, 7 + m * 5.2, 10.8 + g, 7 + m * 6.2 + g * m, 8]);
      if (hi && lo) {
        R(p, hi, 6.25, 5.6, 0.5, 6.4);
        R(p, lo, 7.25, 5.6, 0.5, 6.4);
        R(p, hi, 4, 4.6, 6, 0.5);
        trace(p, hi, arc.slice(0, 14), 0.5, -0.3, -0.5);
      }
    };
    draw(IR[0]!, null, null, 0.5);
    draw(BR[2]!, BR[3]!, BR[0]!, 0);
    ring(p, BR[0]!, 7, 2.4, 1.9, 1.9, 0.9);
    ring(p, BR[3]!, 7, 2.4, 1.9, 1.9, 0.5);
    R(p, BR[3]!, 7.4, 3.2, 0.5, 0.5);
  },
};

const rule = {
  w: 140,
  h: 12,
  paint: (p: Paint) => {
    rope(p, true, 13, 121, 6, 2.3, 5.6, 1.5);
    knot(p, true, 8, 6, 6.5, 4.8);
    bevel(p, 120, 3, 4, 6, IR[0]!, BR[2]!, BR[3]!, BR[0]!);
    rope(p, true, 124, 128, 6, 2.3, 5.6, 1.5);
    for (const [i, sx] of [[-1, 0.5], [0, 0], [1, -0.5]] as const) {
      const y = (x: number) => 6 + i * (x - 128) * 0.4;
      for (let x = 128; x < 134.5; x += 0.5) {
        R(p, ROPE[i === 0 ? 2 : 1]!, x, q(y(x) - 0.5), 0.5, 1);
        R(p, ROPE[3]!, x, q(y(x) - 0.5), 0.5, 0.5);
      }
      for (let h = 0; h < 5; h += 1) {
        const a = (p.rnd() - 0.5) * 1.4 + sx, l = 2.5 + p.rnd() * 4;
        line(p, ROPE[h % 2 ? 3 : 2]!, 134, y(134), 134 + Math.cos(a) * l, y(134) + Math.sin(a) * l, 0.5);
      }
    }
  },
};

// ── tail: the whale, bubbles and a jellyfish ──

const bubble = (p: Paint, x: number, y: number, r: number) => {
  ring(p, WATER[3]!, x, y, r, r, 0.5);
  R(p, WATER[4]!, q(x - r * 0.55), q(y - r * 0.55), 0.5, 0.5);
  if (r > 2) R(p, WATER[1]!, q(x + r * 0.3), q(y + r * 0.3), 0.5, 0.5);
};

/** A jellyfish drifting: a pale bell, a darker core and four trailing tentacles. */
const jelly = (p: Paint, x: number, y: number, r: number, len: number, ph: number) => {
  for (let i = 0; i < 4; i += 1) {
    const sx = x + (i - 1.5) * r * 0.5;
    const pts = [sx, y];
    for (let k = 1; k <= 10; k += 1) pts.push(sx + Math.sin(k * 0.8 + ph + i) * 1.6 * (k / 10), y + (k / 10) * len);
    trace(p, i % 2 ? JELLY[0]! : JELLY[1]!, pts, 0.5);
  }
  ell(p, JELLY[1]!, x, y, r, r * 0.8, [-1e4, 1e4, -1e4, y]);
  for (let k = 0; k < 4; k += 1) ell(p, JELLY[1]!, x - r + (k + 0.5) * (r / 2), y, r / 4, r * 0.22, [-1e4, 1e4, y, 1e4]);
  ell(p, JELLY[0]!, x, y, r * 0.62, r * 0.5, [-1e4, 1e4, -1e4, y]);
  ell(p, WATER[1]!, x + r * 0.15, y, r * 0.4, r * 0.3, [-1e4, 1e4, -1e4, y]);
  R(p, JELLY[2]!, q(x - r * 0.55), q(y - r * 0.55), q(r * 0.4), 0.5);
};

const tail = {
  w: 150,
  h: 56,
  paint: (p: Paint) => {
    const x0 = 18, cy = 31, L = 104, T = 22;
    const P = (u: number, v: number): number[] => [x0 + u * L, cy + v * T - T * 0.4 * u * u * u];
    const body = [
      ...P(0, 0.14),
      ...bz(P(0, 0.14), P(0, -0.16), P(0.07, -0.47), P(0.25, -0.5)),
      ...bz(P(0.25, -0.5), P(0.5, -0.53), P(0.72, -0.2), P(0.96, -0.05)),
      ...P(0.96, 0.05),
      ...bz(P(0.96, 0.05), P(0.72, 0.22), P(0.5, 0.52), P(0.27, 0.5)),
      ...bz(P(0.27, 0.5), P(0.12, 0.49), P(0, 0.36), P(0, 0.14)),
    ];
    // The fluke: two lobes raised on the end of the tail stock.
    const E = P(0.98, 0), th = -0.95, ax = Math.cos(th), ay = Math.sin(th);
    const F = (n: number, a: number) => [E[0]! + ax * a - ay * n, E[1]! + ay * a + ax * n];
    poly(p, WH[0]!, [...F(2.5, -6), ...F(2.5, 0), ...F(8, 1), ...F(14, 5), ...F(15, 10), ...F(10, 9.5), ...F(4, 6.5), ...F(0, 8), ...F(-4, 6.5), ...F(-10, 9.5), ...F(-15, 10), ...F(-14, 5), ...F(-8, 1), ...F(-2.5, 0), ...F(-2.5, -6)]);
    poly(p, WH[1]!, body);
    within(p, body, () => {
      poly(p, WH[2]!, [...P(-0.05, 0.1), ...P(0.2, 0.07), ...P(0.5, 0.13), ...P(0.9, 0), ...P(1, 0.2), ...P(1, 0.9), ...P(-0.05, 0.9)]);
      poly(p, WH[3]!, [...P(-0.05, 0.3), ...P(0.15, 0.26), ...P(0.4, 0.34), ...P(0.66, 0.5), ...P(0.66, 0.9), ...P(-0.05, 0.9)]);
      for (let i = 0; i < 6; i += 1) trace(p, WH[2]!, [...P(0.02, 0.34 + i * 0.05), ...bz(P(0.02, 0.34 + i * 0.05), P(0.15, 0.34 + i * 0.06), P(0.3, 0.38 + i * 0.07), P(0.5 - i * 0.02, 0.44 + i * 0.07), 8)], 0.5);
      for (let i = 0; i < 46; i += 1) {
        const u = p.rnd(), v = -0.45 + p.rnd() * 0.9;
        const [fx, fy] = P(u, v);
        R(p, v > 0.1 ? WH[1]! : WH[2]!, q(fx!), q(fy!), 0.5, 0.5);
      }
    });
    // The flipper, the eye and the line of the mouth.
    poly(p, WH[0]!, [...P(0.24, 0.44), ...bz(P(0.24, 0.44), P(0.3, 0.68), P(0.42, 0.9), P(0.52, 1.04), 8), ...bz(P(0.52, 1.04), P(0.45, 0.76), P(0.4, 0.6), P(0.37, 0.48), 8)]);
    trace(p, WH[0]!, [...P(0, 0.14), ...bz(P(0, 0.14), P(0.1, 0.25), P(0.18, 0.27), P(0.23, 0.27), 8)], 0.5);
    const [ex, ey] = P(0.2, 0.18);
    disc(p, WH[3]!, ex!, ey!, 1.6);
    disc(p, IR[0]!, ex! - 0.2, ey!, 0.9);
    // Bubbles streaming up from the head, and a jellyfish well below the tail.
    for (const [x, y, r] of [[11, 27, 2.8], [6.5, 19, 2], [11.5, 13.5, 1.6], [7, 8.5, 1.1], [3.5, 33, 1.2]] as const) bubble(p, x, y, r);
    jelly(p, 114, 40, 6.5, 14, 0.4);
    for (const [x, y] of [[58, 4], [92, 7], [136, 28], [138, 50], [30, 50]] as const) R(p, WATER[3]!, x, y, 0.5, 0.5);
  },
};

// ── spot: a diving helmet on the seabed ──

const frog = (p: Paint, x: number, y: number) => {
  ell(p, FROG_DK, x - 5.5, y - 2, 5, 3.4);
  ell(p, FROG, x - 5.5, y - 2.4, 4.5, 3);
  ell(p, FROG_DK, x, y - 4.5, 8.4, 5);
  ell(p, FROG, x, y - 5.2, 7.9, 4.5);
  ell(p, FROG_LT, x + 1.5, y - 2.2, 5, 1.8);
  ell(p, FROG, x + 5.5, y - 7.2, 5, 3);
  R(p, FROG_DK, x + 3, y - 4.7, 8, 0.5);
  for (const dx of [2.6, 7.4]) { disc(p, FROG_DK, x + dx, y - 10.5, 2.5); disc(p, FROG, x + dx, y - 10.7, 2.1); disc(p, INK, x + dx + 0.3, y - 10.5, 1.1); R(p, FROG_LT, x + dx - 0.6, y - 11.5, 0.5, 0.5); }
  for (const [dx, dy, r] of [[-3, -8, 1.2], [-6, -5.5, 1], [0, -7.5, 0.8], [-1, -3, 0.9]] as const) disc(p, INK, x + dx, y + dy, r);
  R(p, INK, x + 6, y - 6.2, 5, 0.5);
  R(p, FROG, x + 9, y - 1.5, 3.5, 1.5);
  R(p, FROG_DK, x + 9, y - 0.5, 3.5, 0.5);
};

const spot = {
  w: 180,
  h: 120,
  paint: (p: Paint) => {
    const hx = 92, ground = 106;
    // The seabed: dark silt, stippled, with a shell or two and weed.
    for (let x = 2; x < 178; x += 0.5) {
      const u = Math.abs(x - 90) / 88, top = q(ground + 8 * u ** 3 + Math.sin(x * 0.9) * 0.5), bot = q(119 - 9 * u ** 2.2);
      if (bot <= top) continue;
      R(p, WATER[0]!, x, top, 0.5, bot - top);
      R(p, WATER[1]!, x, top, 0.5, 0.5);
      if (u > 0.7) R(p, IR[1]!, x, bot - 0.5, 0.5, 0.5);
    }
    for (let i = 0; i < 160; i += 1) {
      const x = q(8 + p.rnd() * 164), y = q(ground + 2 + p.rnd() * 10);
      if (Math.abs(x - 90) / 88 > 0.6 && y > 112) continue;
      R(p, [IR[1]!, '#0A2E22', WATER[1]!, IR[2]!][i % 4]!, x, y, 0.5, 0.5);
    }
    ell(p, IR[0]!, hx + 3, ground, 40, 3);
    for (const [wx, wh] of [[34, 22], [42, 15], [146, 26], [154, 18]] as const) {
      const pts = [wx, ground + 2];
      for (let k = 1; k <= 16; k += 1) pts.push(wx + Math.sin(k * 0.5 + wx) * 2.4 * (k / 16), ground + 2 - (k / 16) * wh);
      trace(p, WATER[1]!, pts, 1.5);
      trace(p, WATER[2]!, pts, 0.5, -0.5, 0);
    }
    // The air hose, lying out to the left.
    const hose = [64, 74, 58, 78, 53, 88, 48, 98, 38, 103, 28, 105];
    trace(p, IR[0]!, hose, 4);
    trace(p, IR[2]!, hose, 3);
    trace(p, IR[3]!, hose, 0.5, -0.8, -0.8);
    // The corselet and its collar.
    poly(p, IR[0]!, [64.5, 106, 119.5, 106, 114, 87, 70, 87]);
    poly(p, BR[1]!, [66, 105, 118, 105, 113, 88, 71, 88]);
    poly(p, BR[2]!, [71, 88, 74, 88, 69, 105, 66, 105]);
    R(p, BR[0]!, 66, 102.5, 52, 2.5);
    for (let x = 71; x < 115; x += 7) ball(p, BR, x, 98.5, 1.5, false);
    bevel(p, 69, 82, 46, 7, IR[0]!, BR[2]!, BR[3]!, BR[0]!, false, false, 1);
    for (let x = 74; x < 112; x += 7) { disc(p, IR[0]!, x, 85.5, 1.9); ball(p, IRON_T, x, 85.5, 1.5, false); }
    // The dome, with the front glass in a bolted bezel, and a port to each side.
    disc(p, IR[0]!, hx, 58, 29.3);
    ball(p, BR, hx, 58, 28.5);
    const port = (x: number, y: number, ri: number, ro: number) => {
      disc(p, IR[0]!, x, y, ro + 0.7);
      tube(p, BR, x, y, ri, ro, true);
      disc(p, WATER[0]!, x, y, ri);
      disc(p, WATER[1]!, x - ri * 0.1, y - ri * 0.1, ri * 0.75, [-1e4, 1e4, -1e4, y + ri * 0.2]);
      ell(p, WATER[3]!, x - ri * 0.4, y - ri * 0.45, ri * 0.35, ri * 0.2);
      R(p, WATER[4]!, q(x - ri * 0.55), q(y - ri * 0.5), 0.5, 0.5);
    };
    port(hx, 62, 10, 14.5);
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2 + 0.2, bx = hx + Math.cos(a) * 17.2, by = 62 + Math.sin(a) * 17.2;
      disc(p, IR[0]!, bx, by, 1.8);
      ball(p, IRON_T, bx, by, 1.4, false);
    }
    port(hx - 24, 58, 3, 5);
    port(hx + 24, 58, 3, 5);
    // The vent on the right, with the bubbles that rise from it.
    line(p, IR[0]!, 112, 42, 115, 38, 4);
    line(p, BR[2]!, 112, 42, 115, 38, 2.5);
    ball(p, BR, 116, 36.5, 3.2);
    for (const [x, y, r] of [[117, 29, 1.2], [115, 23, 1.7], [119, 16, 2.1], [116, 9, 2.6], [121, 4, 1.4], [134, 78, 1.2], [138, 66, 1.8], [133, 54, 1.2]] as const) bubble(p, x, y, r);
    frog(p, hx - 8, 31.5);
    jelly(p, 38, 44, 11, 32, 0);
    jelly(p, 152, 32, 6, 17, 2);
    for (const [x, y] of [[62, 14], [28, 20], [150, 60], [168, 40], [100, 8], [10, 70]] as const) R(p, WATER[3]!, x, y, 0.5, 0.5);
  },
};

export default defineOrnaments({
  frames: {
    panel: { slice: 10, edge: 12, paint: panel },
    card: { slice: 20, edge: 24, paint: card },
    sign: { slice: 10, edge: 16, paint: sign },
  },
  edges: { vertical, horizontal },
  sprites: { emblem, mark, rule, tail, spot },
});
