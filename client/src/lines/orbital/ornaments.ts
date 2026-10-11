/**
 * The Ring Line's small drawn things: everything is luggage, brass and the crystal.
 *
 *   frames.panel    a suitcase's edge: a leather welt, a line of stitching, a fine rule, and a brass cap in each corner
 *   frames.card     a trunk: bigger brass corners (two rivets and an engraved curl), stitching all round,
 *                   and on the top and bottom a strap passing through with a buckle in the middle of each repeat
 *   frames.sign     a luggage tag in dark ink on the pink: a rule, stitching, and an eyelet ring at the top left
 *   edges.vertical  a strap down the sidebar: stitched edges and a brass rivet every 40 px
 *   edges.horizontal  a line of stitching with a brass rivet every 32 px, along the phone's bars
 *   sprites.emblem  the crystal with its tilted orbit ring
 *   sprites.mark    a four-point sparkle in pink with a small crystal shard at its centre
 *   sprites.rule    an orbit: a fine line with a small ringed planet at the left end and three stars along it
 *   sprites.tail    two stacked suitcases with a monstera leaf across them and the crystal hovering above
 *   sprites.spot    an open, empty suitcase with the crystal floating out of it and sheets of paper drifting up
 *
 * Everything is flat colour on the half-pixel grid (a 0.5 px cell is one real pixel at 2x), with hard edges.
 * The tans, brasses and pinks are the ones the window and the charm use.
 */

import { defineOrnaments } from '../types';
import type { Paint } from '../types';

// Leather and thread
const T1 = '#8C7448';
const T2 = '#B89B6A';
const T3 = '#D2B98A';
const TD = '#4A3A1E';
const STRAP = '#7C6234';
const STRAP_D = '#5E4C2C';
// Brass
const B0 = '#8C6B2A';
const B1 = '#C9A24A';
const B2 = '#E8CF7A';
const B3 = '#FFF0B8';
// Aubergine
const A0 = '#171226';
const A1 = '#2D2446';
const A2 = '#55467F';
// Crystal pinks
const P0 = '#7A1458';
const P1 = '#C02A8C';
const P2 = '#FF6FB1';
const P3 = '#FFC2E0';
const PD = '#3A0A2C';
// Planet lilacs, leaves, paper, ink
const L1 = '#6C56B8';
const L2 = '#8F7ADB';
const L3 = '#B9A8F0';
const PAPER = '#E9DDB8';
const PAPER_D = '#B8A67A';
const INK = '#110309';

type Pt = readonly [number, number];

// ── Helpers ────────────────────────────────────────────────────────────

const snap = (v: number) => Math.floor(v * 2) / 2;

const rect = (p: Paint, c: string, x: number, y: number, w: number, h: number) => {
  p.ctx.fillStyle = c;
  p.ctx.fillRect(x, y, w, h);
};

/** Fill every half-pixel cell inside a box whose centre `inside` accepts. Hard edges, no antialiasing. */
function cells(p: Paint, c: string, x0: number, y0: number, x1: number, y1: number, inside: (x: number, y: number) => boolean) {
  const { ctx } = p;
  ctx.fillStyle = c;
  ctx.beginPath();
  for (let y = snap(y0); y < y1; y += 0.5) {
    for (let x = snap(x0); x < x1; x += 0.5) {
      if (inside(x + 0.25, y + 0.25)) ctx.rect(x, y, 0.5, 0.5);
    }
  }
  ctx.fill();
}

function disc(p: Paint, c: string, cx: number, cy: number, r: number) {
  cells(p, c, cx - r, cy - r, cx + r, cy + r, (x, y) => Math.hypot(x - cx, y - cy) <= r);
}

function segDist(x: number, y: number, a: Pt, b: Pt) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - (a[0] + dx * t), y - (a[1] + dy * t));
}

function inPoly(x: number, y: number, pts: readonly Pt[]) {
  let inn = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
    const [xi, yi] = pts[i]!;
    const [xj, yj] = pts[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inn = !inn;
  }
  return inn;
}

/** A polygon, optionally grown by `grow` px all round (for a dark outline underneath). */
function poly(p: Paint, c: string, pts: readonly Pt[], grow = 0) {
  const xs = pts.map((q) => q[0]);
  const ys = pts.map((q) => q[1]);
  cells(p, c, Math.min(...xs) - grow, Math.min(...ys) - grow, Math.max(...xs) + grow, Math.max(...ys) + grow, (x, y) => {
    if (inPoly(x, y, pts)) return true;
    if (grow <= 0) return false;
    for (let i = 0; i < pts.length; i += 1) if (segDist(x, y, pts[i]!, pts[(i + 1) % pts.length]!) <= grow) return true;
    return false;
  });
}

/** Points along a (tilted) ellipse, stamped as `size` px squares. */
function orbit(p: Paint, c: string, cx: number, cy: number, rx: number, ry: number, tilt: number, a0: number, a1: number, size = 1) {
  const { ctx } = p;
  ctx.fillStyle = c;
  const steps = Math.ceil(Math.max(rx, ry) * Math.abs(a1 - a0) * 3) + 1;
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  for (let i = 0; i <= steps; i += 1) {
    const a = a0 + ((a1 - a0) * i) / steps;
    const ex = Math.cos(a) * rx;
    const ey = Math.sin(a) * ry;
    const x = cx + ex * ct - ey * st;
    const y = cy + ex * st + ey * ct;
    ctx.fillRect(Math.round((x - size / 2) * 2) / 2, Math.round((y - size / 2) * 2) / 2, size, size);
  }
}

/** A four-point star; `fat` near 1 is a diamond, near 0.5 is a thin sparkle. */
function star4(p: Paint, c: string, cx: number, cy: number, r: number, fat = 0.7) {
  cells(p, c, cx - r, cy - r, cx + r, cy + r, (x, y) => (Math.abs(x - cx) / r) ** fat + (Math.abs(y - cy) / r) ** fat <= 1);
}

/** Grain: random half-pixel cells, thicker where `prob` is higher. */
function stip(p: Paint, c: string, x0: number, y0: number, x1: number, y1: number, dens: number, prob: (x: number, y: number) => number = () => 1, inside: (x: number, y: number) => boolean = () => true) {
  const { ctx, rnd } = p;
  ctx.fillStyle = c;
  const n = Math.round((x1 - x0) * (y1 - y0) * 4 * dens);
  for (let i = 0; i < n; i += 1) {
    const x = snap(x0 + rnd() * (x1 - x0));
    const y = snap(y0 + rnd() * (y1 - y0));
    const k = rnd();
    if (inside(x, y) && k <= prob(x, y)) ctx.fillRect(x, y, 0.5, 0.5);
  }
}

/** A brass rivet: dark ring, a dim body, a bright dot on the lit side. */
function rivet(p: Paint, cx: number, cy: number, r: number) {
  disc(p, TD, cx, cy, r);
  disc(p, B0, cx, cy, r - 0.5);
  rect(p, B2, cx - r * 0.5 - 0.25, cy - r * 0.5 - 0.25, 0.5, 0.5);
  if (r >= 1.5) rect(p, B1, cx - r * 0.5 + 0.25, cy - r * 0.5 + 0.25, 0.5, 0.5);
}

/** Run a drawing in a frame turned on its diagonal, so a top run can also serve as a left run. */
function transposed(p: Paint, draw: () => void) {
  p.ctx.save();
  p.ctx.transform(0, 1, 1, 0, 0, 0);
  draw();
  p.ctx.restore();
}

/** Paint one corner four times: local (0,0) is the corner, x runs along the top, y runs down the left. */
function fourCorners(p: Paint, draw: (p: Paint) => void) {
  const S = p.w;
  const spots: [number, number][] = [[0, 0], [S, 0], [S, S], [0, S]];
  spots.forEach(([x, y], k) => {
    p.ctx.save();
    p.ctx.translate(x, y);
    p.ctx.rotate((k * Math.PI) / 2);
    draw(p);
    p.ctx.restore();
  });
}

/** Paint one side four times: local x runs along it from 0 to `edge`, y runs inward from the outer edge. k: 0 top, 1 right, 2 bottom, 3 left. */
function fourEdges(p: Paint, slice: number, draw: (p: Paint, k: number) => void) {
  const S = p.w;
  const spots: [number, number][] = [[slice, 0], [S, slice], [S - slice, S], [0, S - slice]];
  spots.forEach(([x, y], k) => {
    p.ctx.save();
    p.ctx.translate(x, y);
    p.ctx.rotate((k * Math.PI) / 2);
    draw(p, k);
    p.ctx.restore();
  });
}

// ── The frames ─────────────────────────────────────────────────────────

/**
 * One side of a case, drawn as a top edge from x0 to x1: a leather welt (lit, mid, seam),
 * a line of stitches, and a fine aubergine rule inside. Stitches are 2 px dashes every 4.
 */
function seam(p: Paint, x0: number, x1: number, stitchY: number, innerY: number, thread = T3, lit = T2) {
  rect(p, lit, x0, 0, x1 - x0, 0.5);
  rect(p, T1, x0, 0.5, x1 - x0, 1);
  rect(p, TD, x0, 1.5, x1 - x0, 0.5);
  for (let x = Math.ceil(x0 / 4) * 4; x < x1; x += 4) rect(p, thread, x, stitchY, Math.min(2, x1 - x), 1);
  rect(p, A2, x0, innerY, x1 - x0, 0.5);
}

/** A rounded-triangle brass cap on a corner: dark rim, lit outer edges, a bevel along the curve. */
function cap(p: Paint, L: number) {
  const f = (x: number, y: number, k: number) => (Math.max(x, 0) / k) ** 1.5 + (Math.max(y, 0) / k) ** 1.5;
  cells(p, TD, 0, 0, L + 1, L + 1, (x, y) => f(x, y, L + 0.75) <= 1);
  cells(p, B1, 0, 0, L + 1, L + 1, (x, y) => f(x, y, L) <= 1);
  cells(p, B0, 0, 0, L + 1, L + 1, (x, y) => f(x, y, L) <= 1 && f(x, y, L - 1.5) > 1);
  cells(p, B2, 0, 0, L, L, (x, y) => f(x, y, L - 0.5) <= 1 && (x < 1 || y < 1));
  cells(p, B3, 0, 0, L, L, (x, y) => f(x, y, L - 0.5) <= 1 && (x < 0.5 || y < 0.5) && x + y < L * 0.5);
}

const panel = {
  slice: 10,
  edge: 16,
  paint: (p: Paint) => {
    fourEdges(p, 10, (q) => seam(q, 0, 16, 3, 5.5, T2, T1));
    fourCorners(p, (q) => {
      seam(q, 0, 10, 3, 5.5, T2, T1);
      transposed(q, () => seam(q, 0, 10, 3, 5.5, T2, T1));
      cap(q, 9.5);
      rivet(q, 3.5, 3.5, 1.5);
    });
  },
};

const card = {
  slice: 20,
  edge: 64,
  paint: (p: Paint) => {
    fourEdges(p, 20, (q, k) => {
      seam(q, 0, 64, 3, 12.5);
      if (k % 2 === 0) {
        // A strap passing through, a buckle in the middle of the repeat.
        rect(q, TD, 0, 5, 64, 6);
        rect(q, STRAP, 0, 5.5, 64, 5);
        rect(q, T2, 0, 5.5, 64, 0.5);
        rect(q, STRAP_D, 0, 10, 64, 0.5);
        for (let x = 0; x < 64; x += 4) for (const y of [6.5, 9.5]) rect(q, T3, x, y, 2, 0.5);
        rect(q, TD, 25.5, 3, 13, 9);
        rect(q, B1, 26, 3.5, 12, 8);
        rect(q, B2, 26, 3.5, 12, 0.5);
        rect(q, B0, 26, 11, 12, 0.5);
        rect(q, TD, 28.5, 5.5, 7, 4);
        rect(q, STRAP, 29, 6, 6, 3);
        rect(q, B2, 31.5, 4, 1, 7);
        rect(q, B0, 32.5, 4, 0.5, 7);
      } else {
        for (const x of [16, 48]) rivet(q, x, 7.5, 1.5);
      }
    });
    fourCorners(p, (q) => {
      seam(q, 0, 20, 3, 12.5);
      transposed(q, () => seam(q, 0, 20, 3, 12.5));
      cap(q, 18);
      rivet(q, 4.5, 11.5, 1.5);
      rivet(q, 11.5, 4.5, 1.5);
      rivet(q, 4.5, 4.5, 1);
      // An engraved curl between the rivets.
      cells(q, B0, 6, 6, 12, 12, (x, y) => {
        const d = Math.hypot(x - 9, y - 9);
        return (d <= 2.2 && d >= 1.5 && !(x > 9 && Math.abs(y - 9) < 0.6)) || (x > 9 && x < 11.5 && y >= 9 && y < 9.5);
      });
      rect(q, B0, 8.5, 8.5, 0.5, 0.5);
    });
  },
};

const sign = {
  slice: 10,
  edge: 16,
  paint: (p: Paint) => {
    const run = (q: Paint, x0: number, x1: number) => {
      rect(q, P0, x0, 0.5, x1 - x0, 1);
      rect(q, P3, x0, 1.5, x1 - x0, 0.5);
      for (let x = Math.ceil(x0 / 4) * 4; x < x1; x += 4) rect(q, P0, x, 3.5, Math.min(2, x1 - x), 0.5);
    };
    fourEdges(p, 10, (q) => run(q, 0, 16));
    fourCorners(p, (q) => {
      run(q, 0.5, 10);
      transposed(q, () => run(q, 0.5, 10));
    });
    // The eyelet ring at the top left: a dark ring, a hole, a lit speck.
    disc(p, P0, 5.5, 5.5, 4);
    disc(p, INK, 5.5, 5.5, 2.5);
    disc(p, P2, 5.5, 5.5, 1);
    rect(p, P3, 3.5, 3.5, 1, 0.5);
  },
};

// ── The trims ──────────────────────────────────────────────────────────

/** A strap down the sidebar: 10 wide, 40 tall, stitched at both edges, a brass rivet at the middle of each repeat. */
const vertical = {
  w: 10,
  h: 40,
  paint: (p: Paint) => {
    rect(p, TD, 0, 0, 10, 40);
    rect(p, STRAP, 0.5, 0, 9, 40);
    rect(p, T1, 1, 0, 8, 40);
    rect(p, T2, 0.5, 0, 0.5, 40);
    rect(p, STRAP_D, 9, 0, 0.5, 40);
    for (let y = 0; y < 40; y += 4) for (const x of [2, 7.5]) rect(p, T3, x, y, 0.5, 2);
    rect(p, STRAP_D, 4.5, 0, 1, 40);
    disc(p, TD, 5, 20, 3.5);
    disc(p, B1, 5, 20, 3);
    disc(p, B0, 5.5, 20.5, 2);
    disc(p, B1, 5, 20, 1.5);
    rect(p, B2, 3.5, 18.5, 1, 1);
    rect(p, B3, 3.5, 18.5, 0.5, 0.5);
  },
};

/** A seam along the bars: a welt line, a row of stitches, a brass rivet every 32 px. */
const horizontal = {
  w: 32,
  h: 8,
  paint: (p: Paint) => {
    rect(p, T1, 0, 1, 32, 1);
    rect(p, T2, 0, 1, 32, 0.5);
    rect(p, TD, 0, 2, 32, 0.5);
    for (let x = 0; x < 32; x += 4) rect(p, T3, x, 4, 2, 1);
    rect(p, A2, 0, 6.5, 32, 0.5);
    disc(p, TD, 16, 4.5, 3.5);
    disc(p, B1, 16, 4.5, 3);
    disc(p, B0, 16.5, 5, 2);
    disc(p, B1, 16, 4.5, 1.5);
    rect(p, B2, 14.5, 3, 1, 1);
    rect(p, B3, 14.5, 3, 0.5, 0.5);
  },
};

// ── The crystal and its ring ───────────────────────────────────────────

/** The crystal as a kite with four lit facets: lit upper right, dim lower left. */
function crystal(p: Paint, cx: number, top: number, bot: number, half: number, belt: number, outline = 0.75) {
  const T: Pt = [cx, top];
  const B: Pt = [cx, bot];
  const Lf: Pt = [cx - half, belt];
  const R: Pt = [cx + half, belt];
  const M: Pt = [cx, belt + (bot - top) * 0.04];
  poly(p, PD, [T, R, B, Lf], outline);
  poly(p, P1, [T, Lf, M]);
  poly(p, P2, [T, R, M]);
  poly(p, P0, [B, Lf, M]);
  poly(p, P1, [B, R, M]);
  // A lit edge down the upper right facet.
  const hl = Math.max(0.5, half * 0.12);
  cells(p, P3, cx, top, cx + half, belt, (x, y) => {
    const edgeX = cx + (half * (y - top)) / (belt - top);
    return x > edgeX - hl * 2.2 && x <= edgeX - hl * 0.7 && y > top + (belt - top) * 0.18;
  });
}

const emblem = {
  w: 24,
  h: 24,
  paint: (p: Paint) => {
    const cx = 12;
    const cy = 12.5;
    const tilt = -0.5;
    orbit(p, A2, cx, cy, 11, 4, tilt, Math.PI, Math.PI * 2, 1);
    orbit(p, L2, cx, cy, 11, 4, tilt, Math.PI, Math.PI * 2, 0.5);
    crystal(p, 12, 1, 23, 5.5, 9);
    // The glint.
    star4(p, '#FFFFFF', 14.5, 7, 2.5, 0.6);
    // The ring passes in front of the lower half.
    orbit(p, A0, cx, cy, 11, 4, tilt, 0.15, Math.PI - 0.15, 2);
    orbit(p, L3, cx, cy, 11, 4, tilt, 0.15, Math.PI - 0.15, 1);
    orbit(p, L2, cx, cy, 11, 4, tilt, 0.15, Math.PI - 0.15, 0.5);
    disc(p, P3, 19.5, 12, 1.2);
    rect(p, '#FFFFFF', 19, 11.5, 0.5, 0.5);
  },
};

const mark = {
  w: 14,
  h: 14,
  paint: (p: Paint) => {
    star4(p, P0, 7, 7, 6.75, 0.72);
    star4(p, P2, 7, 7, 6.25, 0.72);
    cells(p, P3, 0, 0, 7, 7, (x, y) => (Math.abs(x - 7) / 6.25) ** 0.72 + (Math.abs(y - 7) / 6.25) ** 0.72 <= 1 && x + y < 11.6 && (x < 7.5 || y < 7.5));
    // A small crystal shard at its centre.
    poly(p, P0, [[7, 3.5], [9.25, 7], [7, 10.5], [4.75, 7]], 0.5);
    poly(p, P3, [[7, 3.5], [4.75, 7], [7, 7.5]]);
    poly(p, P2, [[7, 3.5], [9.25, 7], [7, 7.5]]);
    poly(p, P1, [[7, 10.5], [9.25, 7], [7, 7.5]]);
    poly(p, P0, [[7, 10.5], [4.75, 7], [7, 7.5]]);
  },
};

// ── The rule: an orbit ─────────────────────────────────────────────────

function ringedPlanet(p: Paint, cx: number, cy: number, r: number, rx: number, ry: number, tilt: number) {
  orbit(p, B0, cx, cy, rx, ry, tilt, Math.PI, Math.PI * 2, 1);
  orbit(p, T3, cx, cy, rx, ry, tilt, Math.PI, Math.PI * 2, 0.5);
  disc(p, A0, cx, cy, r + 0.5);
  disc(p, L2, cx, cy, r);
  cells(p, L1, cx - r, cy - r, cx + r, cy + r, (x, y) => Math.hypot(x - cx, y - cy) <= r && (x - cx) + (y - cy) > r * 0.45);
  cells(p, L3, cx - r, cy - r, cx + r, cy + r, (x, y) => Math.hypot(x - cx, y - cy) <= r - 0.5 && (x - cx) + (y - cy) < -r * 0.85);
  orbit(p, A0, cx, cy, rx, ry, tilt, 0, Math.PI, 1.5);
  orbit(p, T2, cx, cy, rx, ry, tilt, 0, Math.PI, 1);
  orbit(p, T3, cx, cy, rx, ry, tilt, 0, Math.PI, 0.5);
}

const rule = {
  w: 140,
  h: 12,
  paint: (p: Paint) => {
    rect(p, A2, 17, 6, 123, 0.5);
    rect(p, A1, 17, 6.5, 123, 0.5);
    // The planet and its ring.
    ringedPlanet(p, 8, 6, 3.5, 7.5, 2, -0.3);
    // Three stars along the orbit.
    star4(p, PAPER, 52, 6.25, 3, 0.6);
    disc(p, P2, 88, 6.25, 1.5);
    rect(p, P3, 87.5, 5.5, 0.5, 0.5);
    star4(p, T3, 121, 6.25, 2, 0.6);
    for (const [x, y] of [[70, 3.5], [104, 8.5], [32, 8.5], [136, 4]] as const) rect(p, A2, x, y, 0.5, 0.5);
  },
};

// ── The spot: an open suitcase with the crystal floating out of it ─────

/** A sheet of paper, tilted, with a few lines of writing. */
function sheet(p: Paint, cx: number, cy: number, w: number, h: number, ang: number, lines = 3) {
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const loc = (x: number, y: number): [number, number] => [(x - cx) * ca + (y - cy) * sa, -(x - cx) * sa + (y - cy) * ca];
  const r = Math.hypot(w, h) / 2 + 1;
  cells(p, PAPER_D, cx - r, cy - r, cx + r, cy + r, (x, y) => {
    const [u, v] = loc(x, y);
    return Math.abs(u) <= w / 2 + 0.5 && Math.abs(v) <= h / 2 + 0.5;
  });
  cells(p, PAPER, cx - r, cy - r, cx + r, cy + r, (x, y) => {
    const [u, v] = loc(x, y);
    return Math.abs(u) <= w / 2 && Math.abs(v) <= h / 2 && !(u > w / 2 - 2 && v > h / 2 - 2);
  });
  cells(p, T1, cx - r, cy - r, cx + r, cy + r, (x, y) => {
    const [u, v] = loc(x, y);
    if (Math.abs(u) > w / 2 - 2) return false;
    for (let i = 0; i < lines; i += 1) {
      const ly = -h / 2 + 3 + i * 2.5;
      if (Math.abs(v - ly) < 0.25 && u < w / 2 - 2 - (i === lines - 1 ? 3 : 0)) return true;
    }
    return false;
  });
}

const spot = {
  w: 180,
  h: 120,
  paint: (p: Paint) => {
    // The floor shadow, in grain.
    stip(p, A1, 24, 98, 156, 116, 1.0, (x, y) => 1 - Math.hypot((x - 90) / 66, (y - 107) / 9), (x, y) => ((x - 90) / 66) ** 2 + ((y - 107) / 9) ** 2 <= 1);
    stip(p, A2, 40, 101, 140, 112, 0.3, (x, y) => 0.9 - Math.hypot((x - 90) / 50, (y - 106) / 5), (x, y) => ((x - 90) / 50) ** 2 + ((y - 106) / 5) ** 2 <= 1);

    // The lid, stood up behind: a shell rim round a dark lining with a pocket and an elastic strap.
    poly(p, TD, [[48, 66], [132, 66], [128, 24], [52, 24]], 0.75);
    poly(p, T2, [[48, 66], [132, 66], [128, 24], [52, 24]]);
    poly(p, T1, [[51, 66], [129, 66], [125.5, 28], [54.5, 28]]);
    poly(p, A1, [[51.5, 64], [128.5, 64], [125.2, 29.5], [54.8, 29.5]]);
    stip(p, A2, 52, 30, 128, 64, 0.35, (x, y) => Math.max(0, 1 - (x - 52) / 50) * 0.5 + (y < 36 ? 0.25 : 0));
    stip(p, A0, 52, 30, 128, 64, 0.35, (x) => Math.max(0, (x - 92) / 36) * 0.7);
    // The lid's lit top edge.
    rect(p, T3, 53, 24.5, 74, 0.5);
    // A sewn pocket and its stitches.
    for (let x = 58; x < 76; x += 4) for (const y of [52, 63]) rect(p, T3, x, y, 2, 0.5);
    for (let y = 52; y < 63; y += 3) for (const x of [58, 75.5]) rect(p, T3, x, y, 0.5, 1.5);
    // The lid's hinge side hangs to the left: an elastic band, pink, with a brass slider.
    poly(p, P0, [[117, 31], [121, 31], [123, 64], [119, 64]]);
    poly(p, P1, [[117.5, 31], [120, 31], [121.8, 64], [119.5, 64]]);
    rect(p, B1, 118, 40, 3.5, 2);
    rect(p, B2, 118, 40, 3.5, 0.5);

    // The open mouth of the case: a dim lining, with a shadow along the back.
    poly(p, TD, [[38, 78], [142, 78], [134, 66], [46, 66]], 0.5);
    poly(p, A1, [[38.5, 78], [141.5, 78], [133.8, 66.5], [46.2, 66.5]]);
    stip(p, A2, 40, 67, 140, 77, 0.25, (x, y) => 0.45 * (y - 66) / 12 + (x < 70 ? 0.2 : 0));
    stip(p, A0, 46, 67, 134, 77, 0.35, (_x, y) => 0.7 * Math.max(0, 1 - (y - 66) / 7));
    // A forgotten sheet of paper at the bottom of it, flat.
    poly(p, PAPER_D, [[72, 76], [86, 76], [88, 72], [74, 72]]);
    poly(p, PAPER, [[72.5, 75.5], [85.5, 75.5], [87.2, 72.5], [74.2, 72.5]]);

    // The shell: a front face with a lid band, two latches, a lower band and four brass corners.
    rect(p, TD, 37.5, 77.5, 105, 27);
    rect(p, T2, 38, 78, 104, 26);
    rect(p, T3, 38, 78, 104, 6);
    rect(p, T1, 38, 84, 104, 0.5);
    rect(p, TD, 38, 84.5, 104, 0.5);
    rect(p, T1, 38, 96.5, 104, 7.5);
    rect(p, TD, 38, 96, 104, 0.5);
    stip(p, TD, 38, 78, 142, 104, 0.3, (x) => Math.max(0, (x - 85) / 57) * 0.75);
    stip(p, '#F2E2B0', 38, 78, 142, 90, 0.3, (x) => Math.max(0, 1 - (x - 38) / 70) * 0.6);
    for (let x = 41; x < 139; x += 4) for (const y of [99, 100.5]) rect(p, T3, x, y, 2, 0.5);
    rect(p, T2, 38, 98, 104, 0.5);
    for (const lx of [52, 122]) {
      rect(p, TD, lx - 4.5, 79.5, 9, 9);
      rect(p, B1, lx - 4, 80, 8, 8);
      rect(p, B2, lx - 4, 80, 8, 0.5);
      rect(p, B0, lx - 4, 87.5, 8, 0.5);
      rect(p, TD, lx - 2, 82.5, 4, 3);
      rect(p, B2, lx - 1.5, 83, 3, 0.5);
    }
    // A sewn patch with a star on it.
    rect(p, PAPER_D, 80.5, 87.5, 19, 9);
    rect(p, PAPER, 81, 88, 18, 8);
    for (let x = 82; x < 98; x += 4) for (const y of [88.75, 94.75]) rect(p, T1, x, y, 2, 0.5);
    star4(p, P1, 90, 92, 2.75, 0.62);
    rect(p, P3, 89.5, 91, 0.5, 0.5);
    for (const [cx, cy] of [[38, 78], [135, 78], [38, 97], [135, 97]] as const) {
      rect(p, TD, cx, cy, 7, 7);
      rect(p, T1, cx + 0.5, cy + 0.5, 6, 6);
      rect(p, B1, cx + 1, cy + 1, 5, 5);
      rect(p, B2, cx + 1, cy + 1, 3, 0.5);
      disc(p, B0, cx + 3.5, cy + 3.5, 1.2);
    }

    // The crystal, floating out of the case, with its ring.
    orbit(p, A2, 90, 46, 24, 6.5, -0.3, Math.PI, Math.PI * 2, 1);
    crystal(p, 90, 16, 62, 11, 36);
    star4(p, '#FFFFFF', 94.5, 28, 3.5, 0.6);
    orbit(p, A0, 90, 46, 24, 6.5, -0.3, 0.25, Math.PI - 0.25, 2);
    orbit(p, L2, 90, 46, 24, 6.5, -0.3, 0.25, Math.PI - 0.25, 1);
    orbit(p, L3, 90, 46, 24, 6.5, -0.3, 0.25, Math.PI - 0.25, 0.5);
    disc(p, P3, 112, 52, 1.5);
    rect(p, '#FFFFFF', 111.5, 51.5, 0.5, 0.5);

    // Sheets of paper drifting up out of it, and a few stars.
    sheet(p, 30, 56, 16, 20, -0.35, 4);
    sheet(p, 154, 40, 15, 19, 0.3, 4);
    sheet(p, 158, 76, 11, 14, 0.7, 3);
    sheet(p, 22, 20, 11, 14, 0.5, 2);
    sheet(p, 56, 12, 9, 12, -0.5, 2);
    star4(p, PAPER, 8, 38, 2.5, 0.6);
    star4(p, P2, 170, 18, 2.5, 0.6);
    star4(p, T3, 124, 10, 2, 0.6);
    for (const [x, y] of [[14, 80], [168, 62], [70, 6], [150, 8], [40, 36], [104, 14], [172, 96], [6, 100]] as const) rect(p, A2, x, y, 1, 1);
  },
};

export default defineOrnaments({
  frames: { panel, card, sign },
  edges: { vertical, horizontal },
  sprites: { emblem, mark, rule, spot },
});
