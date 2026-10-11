/**
 * The Timber Line's small drawn things: joinery, leaves and a few warm lights.
 * Wood in three tones (#2A1C14 #3A281C #5C4638 #7A5E48), honey, birch-leaf
 * orange and cream, drawn on the half-pixel grid so every edge is hard.
 *
 *   frames.panel      a picture-frame moulding: two rules a moulding apart, a
 *                     routed groove and grain ticks, mitred at the corners with
 *                     a peg in each joint
 *   frames.card       a carved frame: a wide moulding with a scalloped inner
 *                     edge, and a corner block with a carved leaf in each corner
 *   frames.sign       a hung board, in dark ink on the honey: a double rule, a
 *                     nail head at each corner and a length of chain at the top two
 *   edges.vertical    a log wall's end grain: log ends with two rings and a crack
 *   edges.horizontal  a garland of fairy lights: swags of wire, a warm bulb at
 *                     each low point and a smaller one either side
 *   sprites.emblem    an acorn
 *   sprites.mark      a birch leaf in autumn orange
 *   sprites.rule      a twig with three small leaves and a bud
 *   sprites.tail      the sparrow on a branch, two acorns and a few leaves
 *   sprites.spot      a steaming mug beside the oil lantern and a closed book,
 *                     on a plank
 */

import { defineOrnaments } from '../types';
import type { Paint } from '../types';

const W0 = '#2A1C14', W1 = '#3A281C', W2 = '#5C4638', W3 = '#7A5E48';
const HONEY = '#F2C14E', LEAF_LO = '#C4521A', LEAF_HI = '#F0872A', LEAF_DK = '#7A2B0C';
const CREAM = '#F4EAD8', CREAM_LO = '#D8C3A0';
const BULB = '#FFE2A0', BULB_HI = '#FFFBE8';
const BRASS = '#B8863A', BRASS_LO = '#8A6226', BRASS_HI = '#E0B060';
const INK = '#1A1204';
const NUT = '#B07C44', NUT_LO = '#8A5C30', NUT_HI = '#D1A06A', CAP = '#5B3A22';

// ── Helpers: everything lands on the half-pixel grid ──

const q = (v: number) => Math.round(v * 2) / 2;

const R = (p: Paint, c: string, x: number, y: number, w: number, h: number, a = 1) => {
  p.ctx.globalAlpha = a;
  p.ctx.fillStyle = c;
  p.ctx.fillRect(x, y, w, h);
  p.ctx.globalAlpha = 1;
};

type Clip = [number, number, number, number];

/** A hard-edged ellipse, optionally cut to [x0, x1, y0, y1]. */
const ell = (p: Paint, c: string, cx: number, cy: number, rx: number, ry: number, clip: Clip = [-1e4, 1e4, -1e4, 1e4], a = 1) => {
  for (let y = Math.floor((cy - ry) * 2) / 2; y < cy + ry; y += 0.5) {
    if (y < clip[2] - 1e-6 || y + 0.5 > clip[3] + 1e-6) continue;
    const dy = (y + 0.25 - cy) / ry;
    const s = 1 - dy * dy;
    if (s <= 0) continue;
    const hw = rx * Math.sqrt(s);
    const x0 = Math.max(q(cx - hw), clip[0]);
    const x1 = Math.min(q(cx + hw), clip[1]);
    if (x1 > x0) R(p, c, x0, y, x1 - x0, 0.5, a);
  }
};
const disc = (p: Paint, c: string, cx: number, cy: number, r: number, clip?: Clip) => ell(p, c, cx, cy, r, r, clip);

/** A ring: an ellipse with a hole. */
const ring = (p: Paint, c: string, cx: number, cy: number, rx: number, ry: number, t: number) => {
  for (let y = Math.floor((cy - ry) * 2) / 2; y < cy + ry; y += 0.5) {
    const dy = (y + 0.25 - cy) / ry;
    const s = 1 - dy * dy;
    if (s <= 0) continue;
    const hw = rx * Math.sqrt(s);
    const di = (y + 0.25 - cy) / (ry - t);
    const si = 1 - di * di;
    const hi = si > 0 ? (rx - t) * Math.sqrt(si) : 0;
    const a = q(cx - hw), b = q(cx + hw);
    if (hi <= 0) R(p, c, a, y, b - a, 0.5);
    else {
      R(p, c, a, y, q(cx - hi) - a, 0.5);
      R(p, c, q(cx + hi), y, b - q(cx + hi), 0.5);
    }
  }
};

/** A hard-edged polygon, points as x, y, x, y, … */
const poly = (p: Paint, c: string, pts: number[]) => {
  const n = pts.length / 2;
  let lo = 1e4, hi = -1e4;
  for (let i = 0; i < n; i += 1) { lo = Math.min(lo, pts[i * 2 + 1]!); hi = Math.max(hi, pts[i * 2 + 1]!); }
  for (let y = Math.floor(lo * 2) / 2; y < hi; y += 0.5) {
    const yy = y + 0.25;
    const xs: number[] = [];
    for (let i = 0; i < n; i += 1) {
      const j = (i + 1) % n;
      const x0 = pts[i * 2]!, y0 = pts[i * 2 + 1]!, x1 = pts[j * 2]!, y1 = pts[j * 2 + 1]!;
      if ((y0 <= yy && y1 > yy) || (y1 <= yy && y0 > yy)) xs.push(x0 + ((yy - y0) * (x1 - x0)) / (y1 - y0));
    }
    xs.sort((m, o) => m - o);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = q(xs[k]!), b = q(xs[k + 1]!);
      if (b > a) R(p, c, a, y, b - a, 0.5);
    }
  }
};

/** A line of dots t thick. */
const line = (p: Paint, c: string, x0: number, y0: number, x1: number, y1: number, t = 1) => {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
  for (let i = 0; i <= n; i += 1) {
    const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n;
    R(p, c, q(x - t / 2), q(y - t / 2), t, t);
  }
};

/** A leaf from its base (ox, oy) along angle `ang`: a lit half, a shaded half, a midrib. */
const leaf = (p: Paint, ox: number, oy: number, ang: number, len: number, wid: number, lit = LEAF_HI, shade = LEAF_LO, vein = LEAF_DK, teeth = 0) => {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const ext = len + wid;
  for (let y = Math.floor((oy - ext) * 2) / 2; y < oy + ext; y += 0.5) {
    for (let x = Math.floor((ox - ext) * 2) / 2; x < ox + ext; x += 0.5) {
      const dx = x + 0.25 - ox, dy = y + 0.25 - oy;
      const u = (dx * ca + dy * sa) / len;
      if (u < 0 || u > 1) continue;
      const v = -dx * sa + dy * ca;
      let hw = wid * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.7)), 0.85);
      if (teeth && (u * teeth) % 1 < 0.5 && u > 0.2 && u < 0.9) hw -= 0.4;
      if (Math.abs(v) > hw) continue;
      R(p, Math.abs(v) < 0.3 ? vein : v < 0 ? lit : shade, x, y, 0.5, 0.5);
    }
  }
};

/** An acorn standing on its tip at (cx, tip); r is half the nut's width. */
const acorn = (p: Paint, cx: number, tip: number, r: number) => {
  const cy = tip - 1.45 * r;
  const capY = cy - 0.5 * r;
  ell(p, W0, cx + 0.5, cy + 0.5, r + 0.5, 1.2 * r + 0.5);
  poly(p, NUT_LO, [cx - 0.3 * r, cy + 1.1 * r, cx + 0.3 * r, cy + 1.1 * r, cx, tip]);
  ell(p, NUT, cx, cy, r, 1.2 * r);
  ell(p, NUT_LO, cx, cy, r, 1.2 * r, [cx + 0.3 * r, 1e4, -1e4, 1e4]);
  R(p, NUT_HI, q(cx - 0.62 * r), q(cy - 0.1 * r), Math.max(0.5, q(0.2 * r)), q(0.9 * r));
  const rim = Math.max(0.5, q(0.14 * r));
  ell(p, CAP, cx, capY, 1.14 * r, 0.95 * r, [-1e4, 1e4, -1e4, capY]);
  R(p, W3, q(cx - 1.14 * r), capY - rim, q(2.28 * r), rim);
  if (r >= 3.4) {
    for (let gy = capY - 0.8 * r; gy < capY - 0.2; gy += 1.5) {
      for (let gx = cx - 1.0 * r; gx < cx + 1.0 * r; gx += 1.5) {
        const o = Math.round((gy - capY) / 1.5) % 2 ? 0.75 : 0;
        const dx = (gx + o - cx) / (1.0 * r), dy = (gy - capY) / (0.85 * r);
        if (dx * dx + dy * dy < 0.9) R(p, W1, q(gx + o), q(gy), 0.5, 0.5);
      }
    }
    R(p, '#7A5236', q(cx - 0.8 * r), q(capY - 0.7 * r), q(0.5 * r), 0.5);
  }
  R(p, CAP, q(cx) - 0.5, q(capY - 0.95 * r - Math.max(1.5, 0.35 * r)), 1.5, Math.max(1.5, 0.35 * r));
};

/** Draw a corner once in the top-left; k is 0 TL, 1 TR, 2 BR, 3 BL (mirrored copies). */
const fourCorners = (p: Paint, draw: (k: number) => void) => {
  const s = p.w;
  const m: number[][] = [[1, 0, 0, 1, 0, 0], [-1, 0, 0, 1, s, 0], [-1, 0, 0, -1, s, s], [1, 0, 0, -1, 0, s]];
  m.forEach((t, k) => {
    p.ctx.save();
    p.ctx.transform(t[0]!, t[1]!, t[2]!, t[3]!, t[4]!, t[5]!);
    draw(k);
    p.ctx.restore();
  });
};

/** Draw the top edge once, x from 0 to edge, y from 0 to slice, and get all four sides. */
const fourEdges = (p: Paint, slice: number, draw: () => void) => {
  const s = p.w;
  const m: number[][] = [[1, 0, 0, 1, slice, 0], [1, 0, 0, -1, slice, s], [0, 1, 1, 0, 0, slice], [0, 1, -1, 0, s, slice]];
  for (const t of m) {
    p.ctx.save();
    p.ctx.transform(t[0]!, t[1]!, t[2]!, t[3]!, t[4]!, t[5]!);
    draw();
    p.ctx.restore();
  }
};

// ── frames.panel: a picture-frame moulding ──

/** One run of moulding, 7.5 px deep, from x0 to x1. */
const moulding = (p: Paint, x0: number, x1: number) => {
  const w = x1 - x0;
  R(p, W3, x0, 0, w, 1);
  R(p, W2, x0, 1, w, 5);
  R(p, W0, x0, 6, w, 1);
  R(p, W3, x0, 7, w, 0.5);
  R(p, W1, x0, 3.5, w, 0.5);
  R(p, W3, x0, 4, w, 0.5, 0.55);
  for (const [gx, gy, gl] of [[2, 2, 4], [10, 2.5, 3], [4, 5, 5], [12, 5.5, 3]] as const) {
    if (gx + x0 < x1) R(p, W1, x0 + gx, gy, Math.min(gl, w - gx), 0.5);
  }
};

const panel = (p: Paint) => {
  const SL = 10, EDGE = p.w - SL * 2;
  fourEdges(p, SL, () => moulding(p, 0, EDGE));
  fourCorners(p, () => {
    const c = p.ctx;
    // The top run, cut on the diagonal: rows from the joint to the right.
    c.save();
    c.beginPath();
    for (let y = 0; y < SL; y += 0.5) c.rect(y, y, SL - y, 0.5);
    c.clip();
    moulding(p, 0, SL);
    c.restore();
    // The side run: the same moulding turned, rows from the left to the joint.
    c.save();
    c.beginPath();
    for (let y = 0; y < SL; y += 0.5) c.rect(0, y, y, 0.5);
    c.clip();
    c.transform(0, 1, 1, 0, 0, 0);
    moulding(p, 0, SL);
    c.restore();
    // The mitre joint and its peg.
    for (let i = 0; i < 15; i += 1) {
      R(p, W0, i * 0.5, i * 0.5, 1, 0.5);
      if (i > 2) R(p, W3, i * 0.5 + 1, i * 0.5, 0.5, 0.5, 0.7);
    }
    disc(p, W0, 3.5, 3.5, 2.2);
    disc(p, '#9A7A5C', 3.5, 3.5, 1.6);
    R(p, W3, 3.5, 3.5, 1.5, 1.5);
    R(p, CREAM, 2.5, 2.5, 1, 0.5);
  });
};

// ── frames.card: a carved frame ──

const SC = 20;
const cardBand = (p: Paint, x0: number, x1: number) => {
  const w = x1 - x0;
  // Scallops first, then the body over their upper halves.
  const clip: Clip = [x0, x1, -1e4, 1e4];
  for (let cx = Math.floor(x0 / 6) * 6; cx <= x1 + 6; cx += 6) {
    ell(p, W0, cx, 9.5, 3.6, 3.6, clip);
    ell(p, W3, cx, 8.5, 3.1, 3.1, clip);
    ell(p, W2, cx + 0.5, 8, 2.2, 2.2, clip);
  }
  R(p, W3, x0, 0, w, 1);
  R(p, W2, x0, 1, w, 7.5);
  R(p, W0, x0, 2, w, 0.5);
  R(p, W3, x0, 2.5, w, 0.5);
  R(p, W1, x0, 6, w, 0.5);
  R(p, W3, x0, 6.5, w, 0.5, 0.55);
  const base = Math.floor(x0 / 24) * 24;
  for (const [gx, gy, gl] of [[1, 3.5, 5], [9, 4, 4], [16, 4.5, 5], [3, 5.5, 3], [12, 5, 5], [19, 3.5, 3]] as const) {
    for (const o of [0, 24]) if (base + gx + o >= x0 && base + gx + o + gl <= x1) R(p, W1, base + gx + o, gy, gl, 0.5);
  }
};

const card = (p: Paint) => {
  const EDGE = p.w - SC * 2;
  fourEdges(p, SC, () => cardBand(p, 0, EDGE));
  fourCorners(p, () => {
    const c = p.ctx;
    // The run of moulding under the block, both ways, in the same coordinates as the edge.
    c.save();
    c.translate(SC, 0);
    cardBand(p, -SC, 0);
    c.restore();
    c.save();
    c.transform(0, 1, 1, 0, 0, SC);
    cardBand(p, -SC, 0);
    c.restore();
    // The block: a lit top and left, a shaded foot and right.
    const B = 18;
    R(p, W0, 0, 0, B + 1, B + 1);
    R(p, W2, 1, 1, B - 1, B - 1);
    R(p, W3, 0, 0, B, 1);
    R(p, W3, 0, 0, 1, B);
    R(p, W1, 1, B - 1, B - 1, 1);
    R(p, W1, B - 1, 1, 1, B - 1);
    // A sunk field with a leaf carved in it.
    R(p, W0, 3, 3, 13, 13);
    R(p, W1, 3.5, 3.5, 12, 12);
    R(p, W3, 3.5, 15.5, 12.5, 0.5, 0.8);
    R(p, W3, 15.5, 3.5, 0.5, 12, 0.8);
    leaf(p, 4.4, 4.4, Math.PI / 4, 12.2, 4.2, '#9A7A5C', W3, W0, 0);
    for (const u of [0.3, 0.5, 0.7]) {
      const bx = 4.4 + u * 12.2 * 0.707, by = 4.4 + u * 12.2 * 0.707;
      line(p, W0, bx + 0.5, by - 0.5, bx + 2.4, by - 2.4, 0.5);
      line(p, W0, bx - 0.5, by + 0.5, bx - 2.4, by + 2.4, 0.5);
    }
  });
};

// ── frames.sign: a hung board, ink on honey ──

const sign = (p: Paint) => {
  const SL = 10, EDGE = p.w - SL * 2;
  fourEdges(p, SL, () => {
    R(p, INK, 0, 1.5, EDGE, 1, 0.8);
    R(p, INK, 0, 3.5, EDGE, 0.5, 0.45);
    for (let x = 4; x < EDGE; x += 8) R(p, INK, x, 5.5, 2, 0.5, 0.25);
  });
  fourCorners(p, (k) => {
    const top = k < 2;
    R(p, INK, 1.5, 1.5, 8.5, 1, 0.8);
    R(p, INK, 1.5, 1.5, 1, 8.5, 0.8);
    if (!top) {
      R(p, INK, 3.5, 3.5, 6.5, 0.5, 0.45);
      R(p, INK, 3.5, 3.5, 0.5, 6.5, 0.45);
      disc(p, INK, 5.8, 5.8, 2);
      R(p, CREAM, 5, 5, 0.5, 0.5, 0.8);
      line(p, INK, 4.8, 6.8, 6.8, 6.8, 0.5);
    } else {
      // A chain link through a nail, and the next link edge-on.
      R(p, INK, 3.5, 7.5, 0.5, 2.5, 0.45);
      ring(p, INK, 5.4, 5.8, 2.4, 2.6, 0.9);
      disc(p, INK, 5.4, 5.8, 0.9);
      R(p, INK, 7.6, 5.3, 2.4, 1, 0.9);
      R(p, CREAM, 7.6, 5.3, 2.4, 0.5, 0.35);
      R(p, INK, 3.5, 3.5, 6.5, 0.5, 0.45);
    }
  });
};

// ── edges ──

const logEnd = (p: Paint, cx: number, cy: number) => {
  disc(p, W0, cx, cy, 6.5);
  disc(p, W2, cx - 0.25, cy - 0.25, 6);
  disc(p, W3, cx, cy, 4.8);
  disc(p, W2, cx, cy, 3.6);
  disc(p, W3, cx, cy, 3.0);
  disc(p, W2, cx, cy, 1.9);
  disc(p, W3, cx, cy, 1.3);
  disc(p, W1, cx, cy, 0.5);
  line(p, W1, cx + 0.5, cy, cx + 5.2, cy - 2.4, 0.5);
  line(p, W0, cx + 1.5, cy - 0.3, cx + 6, cy - 2.4, 0.5);
  R(p, CREAM_LO, cx - 4.5, cy - 3.5, 1, 0.5, 0.6);
  R(p, W3, cx - 3, cy + 5.5, 3, 0.5);
};

const vertical = {
  w: 14,
  h: 16,
  paint: (p: Paint) => {
    logEnd(p, 7, 8);
  },
};

const horizontal = {
  w: 64,
  h: 12,
  paint: (p: Paint) => {
    const wireY = (x: number) => 0.75 + 4 * (1 - Math.pow((x - 32) / 32, 2));
    for (let x = 0; x < 64; x += 0.5) {
      const y = q(wireY(x + 0.25));
      R(p, W3, x, y, 0.5, 1);
      R(p, W1, x, y + 1, 0.5, 0.5);
    }
    for (const hx of [0, 64]) {
      R(p, BRASS_LO, hx - 1.5, 0, 3, 2);
      R(p, BRASS_HI, hx - 1.5, 0, 3, 0.5);
    }
    const bulb = (x: number, big: boolean) => {
      const y = wireY(x) + 0.5;
      const r = big ? 2.7 : 1.8;
      R(p, '#1A110C', x - 0.75, y, 1.5, big ? 1.8 : 1.3);
      const cy = y + (big ? 1.8 : 1.3) + r - 0.3;
      disc(p, '#7A5A30', x, cy, r + 0.7);
      disc(p, BULB, x, cy, r);
      disc(p, BULB_HI, x - r * 0.25, cy - r * 0.25, r * 0.45);
    };
    bulb(32, true);
    bulb(16, false);
    bulb(48, false);
  },
};

// ── sprites ──

const emblem = {
  w: 24,
  h: 24,
  paint: (p: Paint) => {
    acorn(p, 12, 23, 7);
    R(p, HONEY, 6.5, 14, 0.5, 2.5);
    leaf(p, 12.6, 2.2, -0.35, 8.5, 2.4, LEAF_HI, LEAF_LO, LEAF_DK);
  },
};

const mark = {
  w: 14,
  h: 14,
  paint: (p: Paint) => {
    leaf(p, 2.8, 11.2, -Math.PI / 4, 12.6, 4.4, LEAF_HI, LEAF_LO, LEAF_DK, 6);
    line(p, W3, 0.5, 13.5, 3, 11, 1);
    R(p, '#FFB648', 6.5, 5.5, 1, 0.5);
    R(p, '#FFB648', 5.5, 6.5, 0.5, 1);
  },
};

const rule = {
  w: 140,
  h: 14,
  paint: (p: Paint) => {
    const ty = (x: number) => 8 + Math.sin(x / 19) * 1.1;
    for (let x = 4; x < 128; x += 0.5) {
      const y = q(ty(x));
      R(p, W3, x, y - 0.5, 0.5, 0.5);
      R(p, W2, x, y, 0.5, 1.5);
      R(p, W1, x, y + 1.5, 0.5, 0.5);
    }
    for (const gx of [14, 44, 80, 112]) R(p, W1, gx, ty(gx) + 0.5, 4, 0.5);
    ell(p, W3, 4, 8.3, 1.4, 2.2);
    ell(p, W2, 4, 8.3, 0.7, 1.3);
    leaf(p, 28, ty(28) - 0.5, -0.95, 11, 3.6, LEAF_HI, LEAF_LO, LEAF_DK, 5);
    leaf(p, 64, ty(64) + 1, 0.95, 9, 3.2, LEAF_HI, LEAF_LO, LEAF_DK, 5);
    leaf(p, 100, ty(100) - 0.5, -0.8, 11, 3.6, LEAF_HI, LEAF_LO, LEAF_DK, 5);
    // The bud at the tip.
    line(p, W2, 126, ty(126) + 0.5, 131, ty(131) - 1, 1.5);
    ell(p, W3, 134.5, ty(134) - 1.6, 4, 2.2);
    ell(p, LEAF_LO, 136, ty(136) - 1.7, 2.6, 1.7);
    ell(p, LEAF_HI, 136.5, ty(136) - 2.1, 1.3, 0.8);
    R(p, W1, 131, ty(131) - 0.5, 2, 0.5);
  },
};

const tail = {
  w: 150,
  h: 56,
  paint: (p: Paint) => {
    const by = (x: number) => 42 + Math.sin(x / 31) * 1.8 - x * 0.012;
    // The branch, thicker at the cut end and thinning to the right.
    for (let x = 3; x < 148; x += 0.5) {
      const t = 5.5 - ((x - 3) / 145) * 3;
      const y = by(x);
      R(p, W2, x, q(y - t / 2), 0.5, q(t));
      R(p, W3, x, q(y - t / 2), 0.5, 1);
      R(p, W1, x, q(y + t / 2) - 1, 0.5, 1);
    }
    for (const gx of [12, 34, 54, 96, 118, 134]) R(p, W1, gx, by(gx) - 0.5, 4, 0.5);
    ell(p, W3, 3, by(3), 1.4, 2.8);
    ell(p, W2, 3, by(3), 0.7, 1.7);
    // A twig, and the leaves on it.
    line(p, W2, 28, by(28) - 2, 22, 28, 1.5);
    line(p, W2, 22, 28, 17, 22, 1);
    leaf(p, 22, 28, -2.3, 10, 3, LEAF_HI, LEAF_LO, LEAF_DK, 5);
    leaf(p, 22, 28, -0.6, 10, 3, LEAF_HI, LEAF_LO, LEAF_DK, 5);
    leaf(p, 17, 22, -2.9, 8, 2.5, LEAF_HI, LEAF_LO, LEAF_DK, 5);
    // The branch's far twig, with a small leaf.
    line(p, W2, 136, by(136) - 1.5, 142, 31, 1);
    leaf(p, 142, 31, -1.1, 8, 2.4, LEAF_HI, LEAF_LO, LEAF_DK, 5);
    // Two acorns.
    acorn(p, 110, by(110) - 1.5, 3.6);
    acorn(p, 123, by(123) - 1.5, 3);
    // The sparrow, facing right.
    const sx = 72;
    const feet = by(sx) - 2;
    R(p, W0, sx - 8, feet + 1.5, 24, 1);
    R(p, '#6A5030', sx - 1, feet - 3, 1, 4);
    R(p, '#6A5030', sx + 4, feet - 3, 1, 4);
    poly(p, '#46321F', [sx - 7, feet - 12, sx - 21, feet - 9, sx - 20, feet - 6, sx - 6, feet - 5]);
    ell(p, '#8A6448', sx, feet - 11, 11, 8);
    ell(p, CREAM_LO, sx + 4, feet - 8.5, 7, 5);
    ell(p, '#533A2B', sx - 3, feet - 12, 8, 5);
    R(p, CREAM_LO, sx - 8, feet - 14.5, 7, 1);
    R(p, '#8A6448', sx - 5, feet - 9.5, 6, 0.5);
    ell(p, '#CDBFA8', sx + 9, feet - 19, 6.2, 5.8);
    ell(p, '#9A4E2C', sx + 8.5, feet - 20.5, 6.2, 5.8, [-1e4, 1e4, -1e4, feet - 21]);
    ell(p, W1, sx + 12.5, feet - 15.3, 2.3, 1.6);
    poly(p, '#CBA96B', [sx + 14.5, feet - 20, sx + 19.5, feet - 18.3, sx + 14.5, feet - 16.8]);
    R(p, '#8A6A3C', sx + 14.5, feet - 17.6, 4.5, 0.5);
    disc(p, '#0F0B09', sx + 11.2, feet - 19.2, 1.2);
    R(p, CREAM, sx + 10.7, feet - 19.8, 0.5, 0.5);
    R(p, W1, sx + 8, feet - 16.5, 3, 0.5);
    // A leaf drifting down, and one more.
    leaf(p, 100, 10, 1.2, 8, 2.4, LEAF_HI, LEAF_LO, LEAF_DK, 5);
    leaf(p, 46, 20, 0.2, 7, 2.1, LEAF_HI, LEAF_LO, LEAF_DK, 5);
    R(p, HONEY, 126, 12, 1, 1);
    R(p, HONEY, 38, 8, 1, 1);
    R(p, BULB, 112, 24, 0.5, 0.5);
  },
};

const spot = {
  w: 180,
  h: 120,
  paint: (p: Paint) => {
    const top = 96;
    // A string of lights across the top.
    for (let x = 6; x < 174; x += 0.5) R(p, W2, x, q(4 + 9 * (1 - Math.pow((x - 90) / 84, 2))), 0.5, 1);
    for (const [x, on] of [[30, 0], [54, 1], [78, 0], [102, 1], [126, 0], [150, 1]] as const) {
      const y = 4 + 9 * (1 - Math.pow((x - 90) / 84, 2)) + 1;
      R(p, '#1A110C', x - 0.75, y, 1.5, 1.5);
      disc(p, on ? '#7A5A30' : W1, x, y + 3.4, 2.7);
      disc(p, on ? BULB : W2, x, y + 3.4, 2.1);
      if (on) disc(p, BULB_HI, x - 0.5, y + 2.8, 0.8);
    }
    for (const hx of [6, 174]) { R(p, BRASS_LO, hx - 1.5, 2.5, 3, 4); R(p, BRASS_HI, hx - 1.5, 2.5, 3, 0.5); }

    // The plank.
    R(p, W0, 8, top + 13, 164, 1);
    R(p, W1, 8, top + 3, 164, 10);
    R(p, W2, 8, top, 164, 4);
    R(p, W3, 8, top, 164, 1);
    R(p, W0, 8, top + 4, 164, 0.5);
    for (const [gx, gy, gl] of [[16, 7, 18], [58, 9, 26], [110, 6.5, 22], [142, 10, 18], [30, 11, 14], [90, 11, 12]] as const) R(p, W0, gx, top + gy, gl, 0.5);
    for (const nx of [14, 166]) { disc(p, W0, nx, top + 8, 1.5); disc(p, W3, nx - 0.2, top + 7.8, 0.8); }
    R(p, W0, 76, top + 4, 1, 9);
    // A pool of lamplight on the plank.
    ell(p, '#6E4410', 90, top + 0.5, 34, 2.2, [-1e4, 1e4, -1e4, top + 3]);
    ell(p, '#9A6218', 90, top + 0.5, 20, 1.6, [-1e4, 1e4, -1e4, top + 3]);

    // The book, closed: red cover, cream pages, a honey ribbon.
    R(p, '#120B08', 18, top - 1, 44, 1);
    R(p, '#5A1810', 18, top - 12, 44, 11);
    R(p, '#7A2318', 18, top - 12, 44, 9);
    R(p, '#9A3A2A', 18, top - 12, 44, 1);
    R(p, CREAM, 62, top - 11, 1.5, 9.5);
    R(p, '#C9BCA4', 19, top - 3, 43, 1.5);
    R(p, CREAM, 19, top - 2.5, 43, 1);
    R(p, '#3A1008', 18, top - 12, 3, 11);
    R(p, BRASS, 24, top - 9, 24, 0.5);
    R(p, BRASS, 24, top - 5.5, 24, 0.5);
    R(p, HONEY, 58, top - 1, 1.5, 4);
    R(p, BRASS_HI, 28, top - 8, 3, 0.5);

    // The lantern.
    const lx = 90;
    R(p, BRASS_LO, lx - 11, top - 6, 22, 6);
    R(p, BRASS, lx - 11, top - 6, 22, 2);
    R(p, BRASS_HI, lx - 11, top - 6, 22, 0.5);
    R(p, W0, lx - 13, top - 1, 26, 1);
    poly(p, '#26333E', [lx - 9, top - 6, lx - 11, top - 19, lx - 7, top - 33, lx + 7, top - 33, lx + 11, top - 19, lx + 9, top - 6]);
    poly(p, '#C98A3E', [lx - 7.5, top - 7, lx - 9.5, top - 19, lx - 6, top - 31, lx + 6, top - 31, lx + 9.5, top - 19, lx + 7.5, top - 7]);
    poly(p, BULB, [lx - 5, top - 8, lx - 6.5, top - 19, lx - 3.5, top - 29, lx + 3.5, top - 29, lx + 6.5, top - 19, lx + 5, top - 8]);
    poly(p, '#FFB648', [lx - 3, top - 8.5, lx - 3.5, top - 14, lx, top - 24, lx + 3.5, top - 14, lx + 3, top - 8.5]);
    poly(p, BULB_HI, [lx - 1.2, top - 9, lx - 1.3, top - 14, lx, top - 20, lx + 1.3, top - 14, lx + 1.2, top - 9]);
    R(p, BULB_HI, lx - 5, top - 26, 1, 12, 0.7);
    R(p, BRASS_LO, lx - 6, top - 34, 12, 1.5);
    poly(p, BRASS, [lx - 9, top - 33, lx + 9, top - 33, lx + 5, top - 38, lx - 5, top - 38]);
    R(p, BRASS_HI, lx - 9, top - 33, 18, 0.5);
    R(p, BRASS_HI, lx - 5, top - 38, 10, 0.5);
    ring(p, BRASS_HI, lx, top - 39.5, 5, 5, 1);

    // The mug, with steam.
    const mx = 134;
    R(p, W0, mx - 12, top - 1, 28, 1);
    poly(p, CREAM, [mx - 11, top - 22, mx + 11, top - 22, mx + 10, top - 3, mx + 8, top - 0.5, mx - 8, top - 0.5, mx - 10, top - 3]);
    poly(p, '#C9BCA4', [mx + 4, top - 22, mx + 11, top - 22, mx + 10, top - 3, mx + 8, top - 0.5, mx + 4, top - 0.5]);
    R(p, '#F8F0E0', mx - 8.5, top - 20, 2, 14);
    R(p, '#52647A', mx - 11, top - 13, 22, 2.5);
    R(p, '#3C4A5C', mx - 11, top - 10.5, 22, 0.5);
    ring(p, CREAM, mx + 13, top - 11.5, 5.5, 5.5, 2.2);
    ell(p, CREAM, mx, top - 22, 11, 3);
    ell(p, W1, mx, top - 21.5, 8.8, 2.1);
    R(p, '#6A4630', mx - 5, top - 21.5, 6, 0.5);
    for (const [ox, oy, ph] of [[-4, 0, 0], [1, 6, 1.4], [5, 2, 0.6]] as const) {
      const x = mx + ox, y = top - 27 - oy;
      for (let i = 0; i < 14; i += 1) R(p, '#CDBFA8', q(x + Math.sin(i * 0.5 + ph) * 1.8), y - i, 1, 1);
    }
    R(p, BULB, 106, 62, 1, 1);
    R(p, BULB, 72, 55, 1, 1);
    R(p, HONEY, 148, 50, 1, 1);
    // A leaf that came in with someone.
    leaf(p, 160, top - 1.5, -0.3, 9, 2.6, LEAF_HI, LEAF_LO, LEAF_DK, 5);
  },
};

export default defineOrnaments({
  frames: {
    panel: { slice: 10, edge: 16, paint: panel },
    card: { slice: SC, edge: 24, paint: card },
    sign: { slice: 10, edge: 16, paint: sign },
  },
  edges: { vertical, horizontal },
  sprites: { emblem, mark, rule, tail, spot },
});

