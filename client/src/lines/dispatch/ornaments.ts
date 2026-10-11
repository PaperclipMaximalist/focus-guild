/**
 * The Salvage Line's small drawn things: bolted copper plate, hazard paint, rust and the green screen.
 * Copper #3A2418 #4E3222 #7A5234 #9A6E48 (and one lit edge, #C49A6C), rust #8A3A1E #B2522A,
 * hazard #C9A227 on #1A1410, phosphor #4BE083 #A8F5C4. Blue is used only in the sign, as ink on it.
 *
 *   frames.panel     a bolted plate: a lit copper rail, a row of weld beads every 10 px, a fine
 *                    rule inside, and a chamfered corner plate with a hex bolt (one lit facet)
 *   frames.card      a hazard frame: a bevelled rail with a measuring scale (a long tick every
 *                    fourth, tipped in hazard yellow), and in each corner a plate of 45 degree
 *                    hazard stripes with a bolt on it
 *   frames.sign      a stencilled plate, in dark ink on the accent: a rule, a fine rule, stencil
 *                    dashes, and at each end a chevron of three stripes (cut across the corners)
 *   edges.vertical   a pipe run: a shaded pipe with weld rings and, every 56 px, a flanged joint
 *                    with two bolts and a rust drip
 *   edges.horizontal tread plate: staggered raised lozenges between two rails
 *   sprites.emblem   the green CRT: bulbous copper monitor, three lines of readout, a cursor
 *   sprites.mark     a prompt chevron and a block cursor in phosphor green
 *   sprites.rule     a pipe with a flange at each end, collars, and a red valve wheel a third along
 *   sprites.tail     three taped parcels stacked, the courier skiff hovering behind them
 *   sprites.spot     a crane lowering a parcel onto a pile of crates, a moth round a small lamp
 *
 * Everything is flat colour on the half-pixel grid (a 0.5 px cell is one real pixel at 2x), hard edges.
 */

import { defineOrnaments } from '../types';
import type { Paint } from '../types';

// Copper, from lit to deep
const K0 = '#120A06', K1 = '#3A2418', K2 = '#4E3222', K3 = '#7A5234', K4 = '#9A6E48', K5 = '#C49A6C';
// Rust
const RU0 = '#5E2814', RU1 = '#8A3A1E', RU2 = '#B2522A', RU3 = '#D8864A';
// Hazard paint and its black
const HZ = '#C9A227', HZ_HI = '#F0CF55', HZ_LO = '#8A6E14', HB = '#1A1410';
// Phosphor
const PH0 = '#0D3A1C', PH1 = '#124A26', PH2 = '#2F7A4A', PH = '#4BE083', PHH = '#A8F5C4';
// Paper, parcels, haze, wood, lamp
const PAR = '#E8E0D0', PAR_HI = '#F4EEE0', PAR_LO = '#C9BFA8', PAR_DK = '#8A7C62';
const HZE = '#C8AE80', HZE_LO = '#A88A5C', HZE_DK = '#7A5C3A';
const WD = '#6A4A2A', WD_LO = '#4E3620', WD_HI = '#A07040';
const AMB = '#FFA640', AMB_HI = '#FFD060', FLAME = '#E0802A';
// Ink for the sign, on the accent
const INK = '#06101F', INK2 = '#16355F';

type Pt = readonly [number, number];

// ── Helpers ────────────────────────────────────────────────────────────

const snap = (v: number) => Math.floor(v * 2) / 2;

const R = (p: Paint, c: string, x: number, y: number, w: number, h: number) => {
  p.ctx.fillStyle = c;
  p.ctx.fillRect(x, y, w, h);
};

/** Fill every half-pixel cell in a box whose centre `inside` accepts: hard edges, no antialiasing. */
function cells(p: Paint, c: string, x0: number, y0: number, x1: number, y1: number, inside: (x: number, y: number) => boolean) {
  const { ctx } = p;
  ctx.fillStyle = c;
  ctx.beginPath();
  for (let y = snap(y0); y < y1; y += 0.5) {
    for (let x = snap(x0); x < x1; x += 0.5) if (inside(x + 0.25, y + 0.25)) ctx.rect(x, y, 0.5, 0.5);
  }
  ctx.fill();
}

const disc = (p: Paint, c: string, cx: number, cy: number, r: number) =>
  cells(p, c, cx - r, cy - r, cx + r, cy + r, (x, y) => Math.hypot(x - cx, y - cy) <= r);

const ell = (p: Paint, c: string, cx: number, cy: number, rx: number, ry: number) =>
  cells(p, c, cx - rx, cy - ry, cx + rx, cy + ry, (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1);

/** A rounded rectangle. */
const rrect = (p: Paint, c: string, x: number, y: number, w: number, h: number, r: number) =>
  cells(p, c, x, y, x + w, y + h, (px, py) => {
    const dx = Math.max(x + r - px, 0, px - (x + w - r));
    const dy = Math.max(y + r - py, 0, py - (y + h - r));
    return dx * dx + dy * dy <= r * r;
  });

function inPoly(x: number, y: number, pts: readonly Pt[]) {
  let inn = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
    const [xi, yi] = pts[i]!;
    const [xj, yj] = pts[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inn = !inn;
  }
  return inn;
}

const poly = (p: Paint, c: string, pts: readonly Pt[]) =>
  cells(p, c, Math.min(...pts.map((q) => q[0])), Math.min(...pts.map((q) => q[1])), Math.max(...pts.map((q) => q[0])), Math.max(...pts.map((q) => q[1])), (x, y) => inPoly(x, y, pts));

function segDist(x: number, y: number, a: Pt, b: Pt) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - (a[0] + dx * t), y - (a[1] + dy * t));
}

/** A line through the points, `r` the half thickness (0.5 is a 1 px line). */
function path(p: Paint, c: string, pts: readonly Pt[], r = 0.5) {
  for (let i = 0; i + 1 < pts.length; i += 1) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    cells(p, c, Math.min(a[0], b[0]) - r, Math.min(a[1], b[1]) - r, Math.max(a[0], b[0]) + r, Math.max(a[1], b[1]) + r, (x, y) => segDist(x, y, a, b) <= r);
  }
}

/** A ring: a disc with a hole. */
const ring = (p: Paint, c: string, cx: number, cy: number, ro: number, ri: number) =>
  cells(p, c, cx - ro, cy - ro, cx + ro, cy + ro, (x, y) => Math.hypot(x - cx, y - cy) <= ro && Math.hypot(x - cx, y - cy) >= ri);

/** Grain: random half-pixel cells where `inside` allows. */
function stip(p: Paint, c: string, x0: number, y0: number, x1: number, y1: number, dens: number, inside: (x: number, y: number) => boolean = () => true) {
  const { ctx, rnd } = p;
  ctx.fillStyle = c;
  const n = Math.round((x1 - x0) * (y1 - y0) * 4 * dens);
  for (let i = 0; i < n; i += 1) {
    const x = snap(x0 + rnd() * (x1 - x0));
    const y = snap(y0 + rnd() * (y1 - y0));
    if (inside(x, y)) ctx.fillRect(x, y, 0.5, 0.5);
  }
}

/** A hex bolt: a dark rim, a lit upper facet, a shaded lower one, a slot. */
function bolt(p: Paint, cx: number, cy: number, r: number, face = K3, lit = K5, shade = K1) {
  const h: Pt[] = [0, 1, 2, 3, 4, 5].map((i) => [cx + r * Math.cos((i * Math.PI) / 3), cy + r * Math.sin((i * Math.PI) / 3)]);
  const o: Pt[] = [0, 1, 2, 3, 4, 5].map((i) => [cx + (r + 0.75) * Math.cos((i * Math.PI) / 3), cy + (r + 0.75) * Math.sin((i * Math.PI) / 3)]);
  const c: Pt = [cx, cy];
  poly(p, K0, o);
  poly(p, face, h);
  poly(p, lit, [h[3]!, h[4]!, c]);
  poly(p, lit, [h[4]!, h[5]!, c]);
  poly(p, shade, [h[0]!, h[1]!, c]);
  poly(p, shade, [h[1]!, h[2]!, c]);
  if (r >= 2.5) {
    R(p, K0, cx - 0.5 * r + 0.25, cy - 0.25, r - 0.5, 0.5);
    R(p, K4, cx - 0.5 * r + 0.25, cy + 0.25, r - 0.5, 0.5);
  }
}

/** Run a drawing in a frame turned on its diagonal, so a top run can also serve as a left run. */
function transposed(p: Paint, draw: () => void) {
  p.ctx.save();
  p.ctx.transform(0, 1, 1, 0, 0, 0);
  draw();
  p.ctx.restore();
}

/** Paint one corner four times: local (0,0) is the corner, x runs along the top, y runs down the left. */
function fourCorners(p: Paint, draw: (k: number) => void) {
  const S = p.w;
  ([[0, 0], [S, 0], [S, S], [0, S]] as const).forEach(([x, y], k) => {
    p.ctx.save();
    p.ctx.translate(x, y);
    p.ctx.rotate((k * Math.PI) / 2);
    draw(k);
    p.ctx.restore();
  });
}

/** Paint one side four times: local x runs along it from 0 to the edge length, y runs inward. */
function fourEdges(p: Paint, slice: number, draw: (k: number) => void) {
  const S = p.w;
  ([[slice, 0], [S, slice], [S - slice, S], [0, S - slice]] as const).forEach(([x, y], k) => {
    p.ctx.save();
    p.ctx.translate(x, y);
    p.ctx.rotate((k * Math.PI) / 2);
    draw(k);
    p.ctx.restore();
  });
}

// ── frames.panel: a bolted plate ───────────────────────────────────────

/** A copper rail 2.5 px deep: a lit top, a body, a shadow, a dark foot. */
function rail(p: Paint, x0: number, x1: number, d = 0) {
  R(p, K5, x0, d, x1 - x0, 0.5);
  R(p, K3, x0, d + 0.5, x1 - x0, 1.5);
  R(p, K1, x0, d + 2, x1 - x0, 0.5);
  R(p, K0, x0, d + 2.5, x1 - x0, 0.5);
}

const fine = (p: Paint, x0: number, x1: number, y: number) => {
  R(p, K2, x0, y, x1 - x0, 0.5);
  R(p, K0, x0, y + 0.5, x1 - x0, 0.5);
};

const panel = {
  slice: 10,
  edge: 20,
  paint: (p: Paint) => {
    fourEdges(p, 10, () => {
      rail(p, 0, 20);
      R(p, K1, 0, 4, 20, 0.5);
      // Weld beads along the seam, one every 10 px: a shadow, the body, a bright crest.
      for (const cx of [5, 15]) {
        ell(p, K0, cx + 0.25, 4.75, 3.4, 1.4);
        ell(p, K3, cx, 4.25, 3.2, 1.1);
        R(p, K5, cx - 1.5, 3.5, 3, 0.5);
        R(p, K2, cx - 2.5, 4.5, 5, 0.5);
        path(p, K1, [[cx - 2, 4], [cx - 0.5, 5], [cx + 1, 4], [cx + 2.5, 5]], 0.25);
      }
      fine(p, 0, 20, 7);
    });
    fourCorners(p, () => {
      rail(p, 0, 10);
      fine(p, 0, 10, 7);
      transposed(p, () => {
        rail(p, 0, 10);
        fine(p, 0, 10, 7);
      });
      // The corner plate, chamfered inside, and its bolt.
      const n = 10;
      const cut = 16.5;
      const inR = (x: number, y: number, m: number) => x >= m && y >= m && x < n - m && y < n - m && x + y <= cut - m * 1.5;
      cells(p, K0, 0, 0, n, n, (x, y) => inR(x, y, 0));
      cells(p, K2, 0, 0, n, n, (x, y) => inR(x, y, 0.5));
      cells(p, K1, 0, 0, n, n, (x, y) => inR(x, y, 0.5) && (x > n - 1.5 || y > n - 1.5 || x + y > cut - 2.5));
      cells(p, K4, 0, 0, n, n, (x, y) => inR(x, y, 0.5) && (x < 1 || y < 1));
      R(p, K5, 0.5, 0.5, 3, 0.5);
      R(p, K5, 0.5, 0.5, 0.5, 3);
      bolt(p, 4.75, 4.75, 2.75);
    });
  },
};

// ── frames.card: a hazard frame ────────────────────────────────────────

const SC = 18;

const card = {
  slice: SC,
  edge: 48,
  paint: (p: Paint) => {
    fourEdges(p, SC, () => {
      // A beveled rail, 4 px deep.
      R(p, K5, 0, 0, 48, 0.5);
      R(p, K4, 0, 0.5, 48, 1.5);
      R(p, K3, 0, 2, 48, 1);
      R(p, K1, 0, 3, 48, 0.5);
      R(p, K0, 0, 3.5, 48, 0.5);
      // The scale: a baseline, a short tick every 4 px, a long one every 16 tipped in hazard yellow.
      R(p, K3, 0, 5.5, 48, 0.5);
      for (let i = 0; i < 12; i += 1) {
        const x = 2 + i * 4;
        if (i % 4 === 0) {
          R(p, K5, x, 6, 1, 4);
          R(p, K1, x + 1, 6, 0.5, 4);
          R(p, HZ, x, 10, 1, 1);
          R(p, HZ_LO, x + 1, 10, 0.5, 1);
        } else {
          R(p, K4, x, 6, 0.5, 2);
        }
      }
      fine(p, 0, 48, 12.5);
    });
    fourCorners(p, () => {
      // The rail runs in under the plate.
      R(p, K4, 0, 0, SC, 4);
      const n = SC;
      const cut = 31;
      const inR = (x: number, y: number, m: number) => x >= m && y >= m && x < n - m && y < n - m && x + y <= cut - m * 1.5;
      cells(p, K0, 0, 0, n, n, (x, y) => inR(x, y, 0));
      // Hazard stripes at 45 degrees, hard-edged.
      cells(p, HB, 0, 0, n, n, (x, y) => inR(x, y, 1));
      cells(p, HZ, 0, 0, n, n, (x, y) => inR(x, y, 1) && (x + y) % 8 < 4);
      cells(p, HZ_HI, 0, 0, n, n, (x, y) => inR(x, y, 1) && (x + y) % 8 < 1);
      cells(p, HZ_LO, 0, 0, n, n, (x, y) => inR(x, y, 1) && (x + y) % 8 >= 3 && (x + y) % 8 < 4);
      // A lit top and left, and a shaded foot, over the stripes' rim.
      cells(p, K5, 0, 0, n, n, (x, y) => inR(x, y, 0) && !inR(x, y, 0.5) && (x < 1 || y < 1));
      cells(p, K2, 0, 0, n, n, (x, y) => inR(x, y, 0) && !inR(x, y, 0.5) && x >= 1 && y >= 1);
      cells(p, K1, 0, 0, n, n, (x, y) => inR(x, y, 0.5) && !inR(x, y, 1) && (x > n - 1.5 || y > n - 1.5 || x + y > cut - 3));
      // The bolt, on a dark washer so it reads against the stripes.
      disc(p, HB, 8.5, 8.5, 5.4);
      disc(p, K1, 8.5, 8.5, 4.7);
      bolt(p, 8.5, 8.5, 3.5);
    });
  },
};

// ── frames.sign: a stencilled plate, ink on the accent ─────────────────

const SS = 12;

const sign = {
  slice: SS,
  edge: 16,
  paint: (p: Paint) => {
    fourEdges(p, SS, () => {
      // Whole pixels, so the ink stays dark when the picture is shown at 1x.
      R(p, INK, 0, 1, 16, 2);
      R(p, INK, 0, 4, 16, 1);
      for (const x of [2, 10]) R(p, INK2, x, 6, 4, 1);
    });
    fourCorners(p, () => {
      // Three stripes across the corner; the four corners together make a chevron at each end of the sign.
      for (const c of [3, 7, 11]) cells(p, INK, 0, 0, SS, SS, (x, y) => x + y >= c && x + y < c + 2);
    });
  },
};

// ── edges ──────────────────────────────────────────────────────────────

/** A pipe run: one 56 px repeat. */
const vertical = {
  w: 12,
  h: 56,
  paint: (p: Paint) => {
    // The pipe: a rim, then shading across its width, with its lit stripe left of centre.
    const bands: [number, number, string][] = [[2, 0.5, K0], [2.5, 1, K2], [3.5, 0.5, K5], [4, 1, K4], [5, 1.5, K3], [6.5, 1.5, K2], [8, 1.5, K1], [9.5, 0.5, K0]];
    for (const [x, w, c] of bands) R(p, c, x, 0, w, 56);
    // Weld rings.
    for (const y of [7, 49]) {
      R(p, K0, 1.5, y, 9, 2);
      R(p, K4, 2, y + 0.5, 3, 0.5);
      R(p, K3, 5, y + 0.5, 4.5, 0.5);
      R(p, K1, 2, y + 1.5, 7.5, 0.5);
    }
    // The flange: a lit top, a body, a shadowed foot, two bolts, and a gasket line.
    R(p, K0, 0, 24.5, 12, 8.5);
    R(p, K3, 0.5, 25, 11, 7.5);
    R(p, K5, 0.5, 25, 11, 0.5);
    R(p, K4, 0.5, 25.5, 11, 0.5);
    R(p, K1, 0.5, 31.5, 11, 1);
    R(p, RU1, 0.5, 27.5, 11, 0.5);
    bolt(p, 3, 29.5, 1.5);
    bolt(p, 9, 29.5, 1.5);
    // Rust where the joint weeps.
    R(p, RU1, 6, 33, 0.5, 4);
    R(p, RU0, 6.5, 33, 0.5, 2);
    R(p, RU2, 5.5, 33, 0.5, 1.5);
    R(p, RU1, 4, 38.5, 1, 1);
  },
};

/** Tread plate: staggered lozenges between two rails; one 16 by 10 repeat. */
const horizontal = {
  w: 16,
  h: 10,
  paint: (p: Paint) => {
    R(p, K1, 0, 0, 16, 10);
    R(p, K2, 0, 0, 16, 0.5);
    R(p, K0, 0, 0.5, 16, 0.5);
    R(p, K2, 0, 9.5, 16, 0.5);
    R(p, K0, 0, 9, 16, 0.5);
    const loz = (cx: number, cy: number, up: boolean) => {
      const d = up ? -1 : 1;
      const a: Pt = [cx - 1.5, cy - 1.5 * d];
      const b: Pt = [cx + 1.5, cy + 1.5 * d];
      path(p, K0, [[a[0] + 0.5, a[1] + 0.5], [b[0] + 0.5, b[1] + 0.5]], 1);
      path(p, K3, [a, b], 0.95);
      path(p, K5, [[a[0] - 0.25, a[1] - 0.25], [b[0] - 0.25, b[1] - 0.25]], 0.35);
      R(p, K1, cx + 0.5, cy + 0.5, 0.5, 0.5);
    };
    for (const x of [4, 12]) loz(x, 2.5, true);
    for (const x of [0, 8, 16]) loz(x, 7, false);
  },
};

// ── sprites ────────────────────────────────────────────────────────────

/** The green CRT: a bulbous copper monitor with three lines of readout. */
const emblem = {
  w: 24,
  h: 24,
  paint: (p: Paint) => {
    // The bulb behind, up and to the right.
    rrect(p, K0, 4, 1.5, 19, 15.5, 6);
    rrect(p, K2, 4.5, 2, 18, 14.5, 5.5);
    rrect(p, K1, 15, 2.5, 7.5, 14, 4);
    R(p, K4, 8, 2, 9, 0.5);
    // The bezel.
    rrect(p, K0, 0.5, 3.5, 22, 17, 5.5);
    rrect(p, K4, 1, 4, 21, 16, 5);
    rrect(p, K3, 1.5, 4.5, 20, 15.5, 4.5);
    cells(p, K2, 1, 4, 22, 20, (_x, y) => y > 17.5);
    cells(p, K5, 1, 4, 22, 20, (x, y) => y < 5 && x > 4 && x < 15);
    // The glass, with its green rim and a scanline every 2 px.
    rrect(p, K0, 3, 6, 18, 12, 3.5);
    rrect(p, PH2, 3.5, 6.5, 17, 11, 3);
    rrect(p, PH0, 4, 7, 16, 10, 2.5);
    for (let y = 8; y < 16.5; y += 2) cells(p, PH1, 4, y, 20, y + 0.5, (x, yy) => Math.abs(x - 12) < 7.5 - (y < 8.5 || y > 15 ? 1 : 0) && yy > 0);
    // Readout: three lines of different length, a bright head to each, a cursor after the last.
    for (const [y, len] of [[8.5, 11], [11, 7], [13.5, 9]] as const) {
      R(p, PH, 6, y, len, 1.5);
      R(p, PHH, 6, y, 2, 1.5);
    }
    R(p, PHH, 15.5, 13.5, 2, 1.5);
    // Two knobs and a lamp in the bezel's foot, a neck and a foot.
    disc(p, K0, 5.5, 19, 1.3);
    disc(p, K4, 5.25, 18.75, 0.9);
    disc(p, K0, 9, 19, 1.3);
    disc(p, K4, 8.75, 18.75, 0.9);
    disc(p, K0, 18.5, 19, 1.3);
    disc(p, AMB, 18.5, 19, 0.8);
    R(p, K0, 8.5, 20.5, 7, 1.5);
    R(p, K2, 9, 20.5, 6, 1.5);
    R(p, K4, 9, 20.5, 1, 1.5);
    R(p, K0, 5, 22, 14, 2);
    R(p, K3, 5.5, 22, 13, 1.5);
    R(p, K5, 5.5, 22, 13, 0.5);
  },
};

/** A prompt chevron and a block cursor, in phosphor. */
const mark = {
  w: 14,
  h: 14,
  paint: (p: Paint) => {
    path(p, PH0, [[2.5, 3], [7, 7.25], [2.5, 11.5]], 1.25);
    path(p, PH, [[2, 2.5], [6.5, 7], [2, 11.5]], 1.1);
    path(p, PHH, [[1.5, 1.75], [6, 6.25]], 0.45);
    R(p, PH0, 8.5, 3.5, 5, 8.5);
    R(p, PH, 8, 3, 5, 8.5);
    R(p, PHH, 8, 3, 5, 1);
    R(p, PHH, 8, 3, 1, 8.5);
  },
};

const rule = {
  w: 140,
  h: 12,
  paint: (p: Paint) => {
    const top = 6;
    const flange = (x: number) => {
      R(p, K0, x, 2.5, 4, 9);
      R(p, K3, x + 0.5, 3, 3, 8);
      R(p, K5, x + 0.5, 3, 0.5, 8);
      R(p, K1, x + 3, 3, 0.5, 8);
      R(p, K0, x + 1.5, 4, 0.5, 0.5);
      R(p, K4, x + 1.5, 4, 0.5, 0.5);
      R(p, K4, x + 1.5, 9.5, 0.5, 0.5);
    };
    // The pipe, shaded: top rim, lit stripe, body, shadow.
    const rows: [number, number, string][] = [[0, 0.5, K0], [0.5, 0.5, K5], [1, 1, K4], [2, 1, K3], [3, 0.5, K2], [3.5, 0.5, K1], [4, 0.5, K0]];
    for (const [y, h, c] of rows) R(p, c, 4, top + y, 132, h);
    flange(2);
    flange(134);
    // Collars on the pipe.
    for (const x of [22, 74, 108]) {
      R(p, K0, x, top - 1, 3, 6.5);
      R(p, K4, x + 0.5, top - 0.5, 1, 5.5);
      R(p, K2, x + 1.5, top - 0.5, 1, 5.5);
    }
    // The valve, a third of the way along: a body on the pipe, a stem, a pilot light, and a red hand wheel.
    R(p, K0, 43, 5, 10, 7);
    R(p, K3, 43.5, 5.5, 9, 6);
    R(p, K5, 43.5, 5.5, 9, 0.5);
    R(p, K1, 43.5, 10.5, 9, 1);
    R(p, K2, 51.5, 6, 1, 4.5);
    R(p, PH0, 46, 7.5, 3, 2.5);
    R(p, PH, 46.5, 8, 2, 1.5);
    R(p, PHH, 46.5, 8, 0.5, 0.5);
    R(p, K0, 47, 3, 1.5, 2.5);
    R(p, K4, 47, 3, 0.5, 2.5);
    const wheel = (x: number, y: number) => ((x - 48) / 6.2) ** 2 + ((y - 2.2) / 2.3) ** 2;
    cells(p, K0, 41, 0, 56, 5, (x, y) => wheel(x, y) <= 1.18);
    cells(p, RU2, 41, 0, 56, 5, (x, y) => wheel(x, y) <= 1 && wheel(x, y) >= 0.42);
    cells(p, RU3, 41, 0, 56, 5, (x, y) => wheel(x, y) <= 1 && wheel(x, y) >= 0.42 && y < 2);
    cells(p, RU0, 41, 0, 56, 5, (x, y) => wheel(x, y) <= 1 && wheel(x, y) >= 0.8 && y > 2.5);
    R(p, RU1, 43, 2, 10, 0.5);
    R(p, RU1, 47.75, 0.5, 0.5, 3.5);
    disc(p, K0, 48, 2.25, 1.2);
    disc(p, RU3, 48, 2.25, 0.7);
  },
};

/** A taped parcel: cream, a lit top, a shaded foot, a band of rust tape. */
function parcel(p: Paint, x: number, y: number, w: number, h: number, tapeX: number, label = false) {
  R(p, PAR_DK, x, y, w, h);
  R(p, PAR, x + 0.5, y + 0.5, w - 1.5, h - 1.5);
  R(p, PAR_LO, x + 0.5, y + h - 3, w - 1.5, 2);
  R(p, PAR_HI, x + 0.5, y + 0.5, w - 1.5, 1);
  R(p, PAR_HI, x + 0.5, y + 0.5, 1, h - 3);
  R(p, PAR_LO, x + w - 2.5, y + 0.5, 1.5, h - 1.5);
  stip(p, PAR_LO, x + 1, y + 1, x + w - 1, y + h - 3, 0.07);
  stip(p, PAR_DK, x + 1, y + 1, x + w - 1, y + h - 1, 0.04);
  // The tape, with a lit left edge and a shaded right.
  R(p, RU1, tapeX, y, 5, h);
  R(p, RU2, tapeX + 0.5, y, 3.5, h);
  R(p, RU3, tapeX + 0.5, y, 0.5, h);
  R(p, RU0, tapeX + 4, y, 1, h);
  if (label) {
    R(p, K0, x + 3, y + 3.5, 11, 5.5);
    R(p, PAR_HI, x + 3.5, y + 4, 10, 4.5);
    for (const [bx, bw] of [[4.5, 1], [6.5, 0.5], [7.5, 1.5], [10, 0.5], [11, 1], [12.5, 0.5]] as const) R(p, K0, x + bx, y + 4.5, bw, 3.5);
  }
}

const tail = {
  w: 150,
  h: 56,
  paint: (p: Paint) => {
    // The courier skiff, far off and hazed, nose to the left, hovering above and behind the stack.
    const sx = 104;
    const sy = 22;
    ell(p, K2, sx + 4, 53.5, 22, 1.2);
    ell(p, K1, sx + 4, 53.5, 12, 0.6);
    poly(p, FLAME, [[sx + 29, sy - 1], [sx + 40, sy + 1.5], [sx + 29, sy + 4]]);
    poly(p, AMB_HI, [[sx + 29, sy + 0.5], [sx + 35, sy + 1.5], [sx + 29, sy + 3]]);
    rrect(p, HZE_DK, sx - 22, sy + 8, 46, 2, 1);
    R(p, HZE_DK, sx - 12, sy + 6, 2, 3);
    R(p, HZE_DK, sx + 12, sy + 6, 2, 3);
    rrect(p, HZE_DK, sx + 22, sy - 3, 8, 8, 2);
    rrect(p, HZE_DK, sx - 28, sy - 4, 56, 12.5, 6);
    rrect(p, HZE, sx - 27.5, sy - 3.5, 55, 11, 5.5);
    cells(p, HZE_LO, sx - 28, sy - 4, sx + 28, sy + 8.5, (_x, y) => y > sy + 5);
    cells(p, RU2, sx - 28, sy - 4, sx + 28, sy + 8.5, (x, y) => y > sy + 1.5 && y < sy + 4.5 && x > sx - 26);
    R(p, RU0, sx - 26, sy + 3.5, 52, 0.5);
    R(p, PAR_HI, sx - 22, sy - 3.5, 40, 0.5);
    // Canopy: dark glass with a lit streak.
    poly(p, HZE_DK, [[sx - 24, sy - 1], [sx - 19, sy - 6], [sx - 8, sy - 6.5], [sx - 6, sy - 1]]);
    poly(p, PAR, [[sx - 22.5, sy - 1.5], [sx - 18.5, sy - 5], [sx - 9, sy - 5.5], [sx - 8, sy - 1.5]]);
    R(p, PAR_HI, sx - 20, sy - 4.5, 5, 0.5);
    // A crate on the bed, and a nav light.
    rrect(p, PAR, sx + 2, sy - 9, 16, 6, 1);
    R(p, PAR_LO, sx + 2, sy - 5, 16, 1.5);
    R(p, RU2, sx + 8, sy - 9, 3, 6);
    R(p, PH, sx - 27, sy + 1, 1, 1);
    // The stack: three parcels, each a little off the one below.
    parcel(p, 22, 39.5, 62, 13.5, 52);
    parcel(p, 30, 27, 44, 12.5, 54, true);
    parcel(p, 38, 15.5, 27, 11.5, 48);
    // The ground: a line of dust, and a few specks of it kicked up.
    R(p, K3, 6, 53.5, 138, 0.5);
    R(p, K1, 6, 54, 138, 0.5);
    for (let x = 10; x < 142; x += 6) R(p, K2, x + ((x * 7) % 5), 55, 2 + (x % 3), 0.5);
    for (const [x, y] of [[96, 46], [118, 49], [92, 50], [128, 51], [10, 48], [140, 46]] as const) R(p, K4, x, y, 0.5, 0.5);
    for (const [x, y] of [[14, 8], [136, 10], [100, 6], [8, 28]] as const) R(p, PH, x, y, 0.5, 0.5);
    R(p, HZ, 120, 14, 1, 1);
  },
};

/** A wooden crate with corner plates, a brace and nails. */
function crate(p: Paint, x: number, y: number, w: number, h: number, band = false) {
  R(p, K0, x, y, w, h);
  R(p, WD, x + 0.5, y + 0.5, w - 1, h - 1);
  R(p, WD_HI, x + 0.5, y + 0.5, w - 1, 0.5);
  R(p, WD_HI, x + 0.5, y + 0.5, 0.5, h - 1);
  R(p, WD_LO, x + 0.5, y + h - 1.5, w - 1, 1);
  R(p, WD_LO, x + w - 1.5, y + 0.5, 1, h - 1);
  R(p, K1, x + 3, y + 3, w - 6, 0.5);
  R(p, K1, x + 3, y + h - 3.5, w - 6, 0.5);
  R(p, WD_LO, x + 3, y + 3.5, w - 6, 0.5);
  path(p, WD_LO, [[x + 3.5, y + h - 3.5], [x + w - 3.5, y + 3.5]], 0.6);
  path(p, K1, [[x + 4, y + h - 3.5], [x + w - 3, y + 3.5]], 0.25);
  for (const [nx, ny] of [[x + 1.5, y + 1.5], [x + w - 2, y + 1.5], [x + 1.5, y + h - 2], [x + w - 2, y + h - 2]] as const) {
    R(p, K1, nx, ny, 1, 1);
    R(p, K5, nx, ny, 0.5, 0.5);
  }
  if (band) {
    cells(p, HB, x + 3, y + h - 7, x + w - 3, y + h - 4, () => true);
    cells(p, HZ, x + 3, y + h - 7, x + w - 3, y + h - 4, (cx, cy) => (cx + cy) % 4 < 2);
  }
}

const spot = {
  w: 180,
  h: 120,
  paint: (p: Paint) => {
    const G = 108;
    // The ground, and dust on it.
    R(p, K4, 4, G, 172, 0.5);
    R(p, K2, 4, G + 0.5, 172, 1);
    R(p, K1, 4, G + 1.5, 172, 0.5);
    for (let x = 8; x < 174; x += 5) R(p, K1, x + ((x * 3) % 4), G + 3.5 + (x % 2) * 2, 2 + (x % 3), 0.5);

    // The crane's mast, with a lattice, on the right; the jib out across the top.
    const mx = 154;
    R(p, K0, mx, 6, 9, 102);
    R(p, K2, mx + 1, 6, 1, 102);
    R(p, K2, mx + 7, 6, 1, 102);
    R(p, K4, mx + 1, 6, 0.5, 102);
    for (let y = 8; y < 100; y += 12) {
      path(p, K3, [[mx + 1.5, y + 11], [mx + 7.5, y]], 0.5);
      path(p, K2, [[mx + 7.5, y + 11], [mx + 1.5, y + 11 + 0.5]], 0.25);
    }
    for (let y = 8; y < 108; y += 12) R(p, K3, mx + 1, y, 7, 0.5);
    R(p, K0, mx - 4, 104, 17, 4);
    R(p, K3, mx - 3.5, 104.5, 16, 3);
    R(p, K5, mx - 3.5, 104.5, 16, 0.5);
    // The jib: two chords and a zigzag between them; a counterweight behind the mast; a cab.
    R(p, K0, 60, 2, 108, 8);
    R(p, K4, 60, 2.5, 108, 1);
    R(p, K5, 60, 2.5, 108, 0.5);
    R(p, K2, 60, 8.5, 108, 1);
    R(p, K1, 60, 3.5, 108, 5);
    for (let x = 62; x < 150; x += 8) {
      path(p, K3, [[x, 9], [x + 4, 3.5]], 0.5);
      path(p, K3, [[x + 4, 3.5], [x + 8, 9]], 0.5);
    }
    R(p, K0, 163, 1, 11, 10);
    R(p, RU1, 163.5, 1.5, 10, 9);
    R(p, RU2, 163.5, 1.5, 10, 1);
    R(p, K0, 165, 4, 5, 3);
    R(p, PH, 165.5, 4.5, 4, 2);
    R(p, PHH, 165.5, 4.5, 1, 0.5);
    R(p, HZ, 60, 1, 1, 1);
    // The trolley, the cable, the hook block.
    const hx = 108;
    R(p, K0, hx - 5, 10, 10, 5);
    R(p, RU2, hx - 4.5, 10.5, 9, 4);
    R(p, RU3, hx - 4.5, 10.5, 9, 0.5);
    R(p, K0, hx - 0.75, 15, 1.5, 17);
    R(p, K4, hx - 0.5, 15, 0.5, 17);
    R(p, K2, hx, 15, 0.5, 17);
    rrect(p, K0, hx - 4.5, 31, 9, 9, 2);
    rrect(p, RU1, hx - 4, 31.5, 8, 8, 1.5);
    R(p, RU3, hx - 4, 31.5, 8, 0.5);
    R(p, RU0, hx + 2, 32, 2, 7);
    disc(p, K0, hx, 35, 2);
    disc(p, K4, hx, 35, 1.4);
    disc(p, K1, hx, 35, 0.6);
    // The hook, a sling ring in its bowl, and two straps down to the parcel.
    path(p, K1, [[hx + 2.5, 49], [99, 58]], 0.5);
    path(p, K1, [[hx + 2.5, 49], [117, 58]], 0.5);
    path(p, K3, [[hx + 2.5, 49], [99.5, 57.5]], 0.25);
    path(p, K3, [[hx + 2.5, 49], [117.5, 57.5]], 0.25);
    const bowl: Pt[] = [[hx, 40], [hx, 44], [hx + 0.8, 46.8], [hx + 3, 48], [hx + 5.2, 46.8], [hx + 5.6, 44.2]];
    path(p, K0, bowl, 1.6);
    path(p, K4, bowl, 1);
    path(p, K5, [[hx - 0.25, 40.5], [hx - 0.25, 44], [hx + 0.5, 46.4]], 0.25);
    ring(p, K0, hx + 2.5, 47, 2.9, 1.8);
    ring(p, K3, hx + 2.5, 47, 2.4, 1.3);
    // The parcel on its straps.
    parcel(p, 96, 58, 24, 15.5, 106);
    R(p, K1, 98.5, 57, 1.5, 1);
    R(p, K1, 116, 57, 1.5, 1);
    // The crates: three below, two above.
    crate(p, 72, 92, 24, 16);
    crate(p, 96, 92, 24, 16, true);
    crate(p, 120, 92, 24, 16);
    crate(p, 84, 76, 24, 16);
    crate(p, 108, 76, 24, 16);

    // A lamp post on the left, its shade, its bulb, and the dust of its light.
    const lx = 32;
    R(p, K0, lx - 1.5, 50, 3, 58);
    R(p, K3, lx - 1, 50, 2, 58);
    R(p, K5, lx - 1, 50, 0.5, 58);
    R(p, K1, lx + 0.5, 50, 0.5, 58);
    R(p, K0, lx - 6, 104, 12, 4);
    R(p, K3, lx - 5.5, 104.5, 11, 3);
    R(p, K5, lx - 5.5, 104.5, 11, 0.5);
    R(p, K0, lx - 3, 98, 6, 6);
    R(p, K2, lx - 2.5, 98.5, 5, 5);
    bolt(p, lx, 101, 1.4);
    rrect(p, K0, lx - 6, 44.5, 12, 7, 3);
    rrect(p, RU1, lx - 5.5, 45, 11, 6, 2.5);
    R(p, RU3, lx - 4, 45, 5, 0.5);
    ell(p, K0, lx, 52, 3.4, 2.4);
    ell(p, AMB, lx, 52, 2.8, 1.9);
    ell(p, AMB_HI, lx - 0.5, 51.5, 1.3, 0.8);
    stip(p, AMB, lx - 18, 36, lx + 18, 70, 0.4, (x, y) => Math.hypot(x - lx, y - 52) > 4 && Math.hypot(x - lx, y - 52) < 16 && p.rnd() < 0.7 - Math.hypot(x - lx, y - 52) / 24);
    // The moth circling: a dotted loop, and the moth on it.
    for (let i = 0; i < 20; i += 1) {
      const a = -0.4 + i * 0.28;
      if (a > 4.9) break;
      R(p, K4, snap(lx + Math.cos(a) * 14), snap(52 + Math.sin(a) * 9 - 1), 0.5, 0.5);
    }
    const mx2 = lx + 12;
    const my = 45;
    ell(p, PAR_DK, mx2 - 1.8, my - 0.75, 2.4, 1.6);
    ell(p, PAR_DK, mx2 + 1.8, my - 0.75, 2.4, 1.6);
    ell(p, PAR, mx2 - 1.9, my - 1, 1.9, 1.1);
    ell(p, PAR, mx2 + 1.9, my - 1, 1.9, 1.1);
    R(p, K5, mx2 - 0.5, my - 1.5, 1, 3.5);
    R(p, K3, mx2 - 0.5, my + 0.5, 1, 1.5);
    path(p, K5, [[mx2 - 0.5, my - 1.5], [mx2 - 2, my - 3.5]], 0.25);
    path(p, K5, [[mx2 + 0.5, my - 1.5], [mx2 + 2, my - 3.5]], 0.25);
    // A few sparks of dust high up.
    for (const [x, y] of [[50, 20], [64, 34], [140, 60], [172, 80], [14, 30], [24, 14]] as const) R(p, K4, x, y, 0.5, 0.5);
    R(p, HZ, 46, 70, 1, 1);
    R(p, PH, 166, 22, 0.5, 0.5);
  },
};

export default defineOrnaments({
  frames: {
    panel,
    card,
    sign,
  },
  edges: { vertical, horizontal },
  sprites: { emblem, mark, rule, tail, spot },
});
