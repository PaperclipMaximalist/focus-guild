/**
 * The Night Line's small drawn things: station fittings. Blue enamel and steel
 * (#06081A #0C1027 #1C2249 #363E78 #5A66B8, lit edge #8896E0), cold white light
 * (#9FE8FF #DDEBFF) and the signal yellow (#FFD23A) only where it is named.
 * Everything is flat colour on the half-pixel grid, hard edges.
 *
 *   frames.panel     an enamel plate: a lit outer rule, a fine inner rule, timetable
 *                    ticks between them every 8 px, and a slotted screw head in each
 *                    chamfered corner
 *   frames.card      a ticket: corners cut on the diagonal with a pair of chevrons
 *                    pointing in, a row of perforation holes along the top and bottom,
 *                    a fine second rule inside
 *   frames.sign      a double rule and, in each corner, two stripes of a chevron that
 *                    points outward at each end; whole-pixel ink, dark on the yellow
 *   edges.vertical   the line itself: a cold-white route with a ring for a stop every
 *                    48 px and a filled dot at every third
 *   edges.horizontal the platform edge: a row of raised studs with the yellow line
 *                    beneath (the one use of yellow in a trim)
 *   sprites.emblem   the ringed moon in a rounded square of night blue
 *   sprites.mark     a stop ring on a short tail of line, cold white with a yellow centre
 *   sprites.rule     a route line with three stops and a terminus bar at its right end
 *   sprites.tail     the maglev in silhouette on its guideway, the ringed moon behind,
 *                    a few strokes of rain
 *   sprites.spot     an empty platform bench under a lamp in the rain, an umbrella
 *                    leaning on it
 */

import { defineOrnaments } from '../types';
import type { Paint } from '../types';

// Blue enamel, from the page's dark to the lit edge
const N0 = '#06081A', N1 = '#0C1027', N2 = '#1C2249', N3 = '#363E78', N4 = '#5A66B8', N5 = '#8896E0';
// Cold light, and the signal yellow
const ICE = '#9FE8FF', LAMP = '#DDEBFF', Y = '#FFD23A', YD = '#DDB21C';
// Ink for the sign, on the yellow
const INK = '#0A0F1C';
// The moon
const M0 = '#4A58B8', M1 = '#8A98F0', M2 = '#C4CEFF', M3 = '#EEF2FF', MC = '#6C7ADA';
// The train
const RAIN = '#5A66B8', RAIN_HI = '#BED0FF';

type Pt = readonly [number, number];

// ── Helpers ────────────────────────────────────────────────────────────

const snap = (v: number) => Math.floor(v * 2) / 2;

const R = (p: Paint, c: string, x: number, y: number, w: number, h: number) => {
  p.ctx.fillStyle = c;
  p.ctx.fillRect(x, y, w, h);
};

/** Fill every cell (half a pixel, or `step`) in a box whose centre `inside` accepts: hard edges, no smoothing. */
function cells(p: Paint, c: string, x0: number, y0: number, x1: number, y1: number, inside: (x: number, y: number) => boolean, step = 0.5) {
  const { ctx } = p;
  ctx.fillStyle = c;
  ctx.beginPath();
  for (let y = Math.floor(y0 / step) * step; y < y1; y += step) {
    for (let x = Math.floor(x0 / step) * step; x < x1; x += step) if (inside(x + step / 2, y + step / 2)) ctx.rect(x, y, step, step);
  }
  ctx.fill();
}

const disc = (p: Paint, c: string, cx: number, cy: number, r: number) =>
  cells(p, c, cx - r, cy - r, cx + r, cy + r, (x, y) => Math.hypot(x - cx, y - cy) <= r);

const ring = (p: Paint, c: string, cx: number, cy: number, ro: number, ri: number) =>
  cells(p, c, cx - ro, cy - ro, cx + ro, cy + ro, (x, y) => {
    const d = Math.hypot(x - cx, y - cy);
    return d <= ro && d >= ri;
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

/** A rounded rectangle. */
const rrect = (p: Paint, c: string, x: number, y: number, w: number, h: number, r: number) =>
  cells(p, c, x, y, x + w, y + h, (px, py) => {
    const dx = Math.max(x + r - px, 0, px - (x + w - r));
    const dy = Math.max(y + r - py, 0, py - (y + h - r));
    return dx * dx + dy * dy <= r * r;
  });

/** Random half-pixel specks where `inside` allows. */
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

/** Paint one side four times: local x runs along it from 0 to the edge length, y runs inward. k is 0 top, 1 right, 2 bottom, 3 left. */
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

// ── frames.panel: an enamel plate ──────────────────────────────────────

const PS = 10;
const PE = 16;

const panel = {
  slice: PS,
  edge: PE,
  paint: (p: Paint) => {
    fourEdges(p, PS, () => {
      // The outer rule: a lit crest, the body, a shadow.
      R(p, N5, 0, 0, PE, 0.5);
      R(p, N4, 0, 0.5, PE, 1);
      R(p, N2, 0, 1.5, PE, 0.5);
      // The fine inner rule, with its dark foot.
      R(p, N3, 0, 6, PE, 0.5);
      R(p, N0, 0, 6.5, PE, 0.5);
      // Timetable ticks hang between the rules, every 8 px; every other one runs the whole way.
      for (const [x, len] of [[4, 2], [12, 3]] as const) {
        R(p, N3, x - 0.5, 2, 1, len + 1.5);
        R(p, N4, x - 0.5, 2, 0.5, len + 1.5);
      }
    });
    fourCorners(p, () => {
      const cut = 3.5;
      // Anything outside the chamfer is the page, so the surface's own rounded corner never shows.
      cells(p, N0, 0, 0, 5, 5, (x, y) => x + y < cut);
      // The outer rule, turned along the top and down the left, stopping at the chamfer.
      cells(p, N5, 0, 0, PS, 0.5, (x, y) => x + y >= cut);
      cells(p, N4, 0, 0.5, PS, 1.5, (x, y) => x + y >= cut);
      cells(p, N2, 0, 1.5, PS, 2, (x, y) => x + y >= cut);
      cells(p, N5, 0, 0, 0.5, PS, (x, y) => x + y >= cut);
      cells(p, N4, 0.5, 0, 1.5, PS, (x, y) => x + y >= cut);
      cells(p, N2, 1.5, 0, 2, PS, (x, y) => x + y >= cut);
      // The chamfer itself: a lit face with a dark foot.
      cells(p, N5, 0, 0, 6, 6, (x, y) => x + y >= cut && x + y < cut + 1);
      cells(p, N4, 0, 0, 6, 6, (x, y) => x + y >= cut + 1 && x + y < cut + 2);
      cells(p, N2, 0, 0, 6, 6, (x, y) => x + y >= cut + 2 && x + y < cut + 2.5);
      // The inner rule runs up to the screw from both sides.
      R(p, N3, 8.5, 6, PS - 8.5, 0.5);
      R(p, N0, 8.5, 6.5, PS - 8.5, 0.5);
      R(p, N3, 6, 8.5, 0.5, PS - 8.5);
      R(p, N0, 6.5, 8.5, 0.5, PS - 8.5);
      // The screw: a dark seat, a lit head, a shaded foot, a slot across it and one bright crest.
      const cx = 5.5;
      const cy = 5.5;
      disc(p, N0, cx, cy, 3.5);
      disc(p, N3, cx, cy, 3);
      cells(p, N4, 0, 0, 10, 10, (x, y) => Math.hypot(x - cx + 0.4, y - cy + 0.4) <= 2.6);
      cells(p, N5, 0, 0, 10, 10, (x, y) => Math.hypot(x - cx + 0.9, y - cy + 0.9) <= 1.6 && Math.hypot(x - cx, y - cy) <= 2.8);
      cells(p, N0, 0, 0, 10, 10, (x, y) => Math.abs(x - cx + (y - cy)) < 0.9 && Math.hypot(x - cx, y - cy) <= 2.5);
      cells(p, N3, 0, 0, 10, 10, (x, y) => Math.abs(x - cx + (y - cy) - 1) < 0.6 && Math.hypot(x - cx, y - cy) <= 2.2 && x - cx > y - cy);
      R(p, LAMP, 3.5, 3.5, 0.5, 0.5);
    });
  },
};

// ── frames.card: a ticket ──────────────────────────────────────────────

const CS = 20;
const CE = 16;

/** A punched hole: a lit rim and a dark bore. */
const hole = (p: Paint, x: number, y: number) => {
  disc(p, N4, x, y, 1.75);
  disc(p, N0, x, y, 1.1);
  R(p, N4, x - 0.5, y + 1, 1, 0.5);
};

const card = {
  slice: CS,
  edge: CE,
  paint: (p: Paint) => {
    fourEdges(p, CS, (k) => {
      R(p, N5, 0, 0, CE, 0.5);
      R(p, N4, 0, 0.5, CE, 1);
      R(p, N2, 0, 1.5, CE, 0.5);
      if (k % 2 === 0) {
        // Perforation: a hole every 8 px.
        for (const x of [4, 12]) hole(p, x, 4.5);
      } else {
        // Down the sides, the ticks of a rule.
        for (const [x, len] of [[4, 2], [12, 3]] as const) {
          R(p, N3, x - 0.5, 3, 1, len);
          R(p, N4, x - 0.5, 3, 0.5, len);
        }
      }
      // The fine second rule.
      R(p, N3, 0, 8, CE, 0.5);
      R(p, N0, 0, 8.5, CE, 0.5);
    });
    fourCorners(p, (k) => {
      const cut = 10;
      // The cut: the page shows through, and the plate has a lit face along it.
      cells(p, N0, 0, 0, 14, 14, (x, y) => x + y < cut + 0.5);
      cells(p, N5, 0, 0, 20, 20, (x, y) => x + y >= cut && x + y < cut + 1);
      cells(p, N4, 0, 0, 20, 20, (x, y) => x + y >= cut + 1 && x + y < cut + 2);
      cells(p, N2, 0, 0, 20, 20, (x, y) => x + y >= cut + 2 && x + y < cut + 2.5);
      // The outer rule, along the top and the left, ending at the cut.
      cells(p, N5, 0, 0, CS, 0.5, (x, y) => x + y >= cut + 0.5);
      cells(p, N4, 0, 0.5, CS, 1.5, (x, y) => x + y >= cut + 0.5);
      cells(p, N2, 0, 1.5, CS, 2, (x, y) => x + y >= cut + 0.5);
      cells(p, N5, 0, 0, 0.5, CS, (x, y) => x + y >= cut + 0.5);
      cells(p, N4, 0.5, 0, 1.5, CS, (x, y) => x + y >= cut + 0.5);
      cells(p, N2, 1.5, 0, 2, CS, (x, y) => x + y >= cut + 0.5);
      // A perforation hole near the corner on the top and bottom runs, ticks on the sides.
      if (k % 2 === 0) hole(p, 16, 4.5);
      else {
        R(p, N3, 3.5, 15.5, 1, 2);
        R(p, N4, 3.5, 15.5, 0.5, 2);
      }
      // A bold chevron pointing in along the diagonal, with a dark shadow under it.
      R(p, N0, 5.5, 10, 6, 1.5);
      R(p, N0, 10, 5.5, 1.5, 6);
      R(p, ICE, 5, 9.5, 6, 1.5);
      R(p, ICE, 9.5, 5, 1.5, 6);
      R(p, LAMP, 5, 9.5, 6, 0.5);
      R(p, LAMP, 9.5, 5, 0.5, 6);
      // The fine rule follows the cut round the corner, a chevron's width behind it.
      R(p, N3, 16, 8, CS - 16, 0.5);
      R(p, N0, 16, 8.5, CS - 16, 0.5);
      R(p, N3, 8, 16, 0.5, CS - 16);
      R(p, N0, 8.5, 16, 0.5, CS - 16);
      cells(p, N3, 0, 0, 20, 20, (x, y) => x + y >= 24 && x + y < 24.75 && x < 16.5 && y < 16.5);
      cells(p, N0, 0, 0, 20, 20, (x, y) => x + y >= 24.75 && x + y < 25.25 && x < 16.5 && y < 16.5);
    });
  },
};

// ── frames.sign: ink on the yellow ─────────────────────────────────────

const SS = 12;
const SE = 16;

const sign = {
  slice: SS,
  edge: SE,
  paint: (p: Paint) => {
    // Whole pixels, so the ink stays dark when the picture is shown at 1x.
    fourEdges(p, SS, () => {
      R(p, INK, 0, 1, SE, 1);
      R(p, INK, 0, 4, SE, 1);
    });
    fourCorners(p, () => {
      // The outer rule turns the corner; two stripes of the chevron run across it, whole pixels.
      cells(p, INK, 0, 0, SS, SS, (x, y) => (y >= 1 && y < 2 && x >= 1) || (x >= 1 && x < 2 && y >= 1), 1);
      for (const c of [13, 17]) cells(p, INK, 0, 0, SS, SS, (x, y) => x + y >= c && x + y < c + 2 && x >= 3 && y >= 3, 1);
    });
  },
};

// ── edges ──────────────────────────────────────────────────────────────

/** The line, 144 px to the repeat: a stop every 48 px, and the third of them a filled dot. */
const vertical = {
  w: 12,
  h: 144,
  paint: (p: Paint) => {
    const cx = 6;
    // The route: a lit stripe on the left, the body, a shaded edge.
    R(p, ICE, cx - 1, 0, 1, 144);
    R(p, N4, cx, 0, 1, 144);
    // A short bar to the platform edge at every stop.
    for (const y of [24, 72, 120]) {
      R(p, N3, 9.5, y - 0.5, 2.5, 1);
      R(p, N5, 9.5, y - 0.5, 2.5, 0.5);
      // The stop, with a dark seat so the line breaks around it.
      disc(p, N0, cx, y, 5.25);
      if (y === 120) {
        disc(p, ICE, cx, y, 4);
        cells(p, N4, 0, y - 5, 12, y + 5, (x, yy) => Math.hypot(x - cx - 0.8, yy - y - 0.8) <= 4 && Math.hypot(x - cx + 0.5, yy - y + 0.5) > 3.6);
        disc(p, LAMP, cx - 1, y - 1, 1.6);
      } else {
        ring(p, ICE, cx, y, 4.5, 2.75);
        cells(p, N4, 0, y - 5, 12, y + 5, (x, yy) => Math.hypot(x - cx, yy - y) <= 4.5 && Math.hypot(x - cx, yy - y) >= 2.75 && x - cx + (yy - y) > 3);
        disc(p, N1, cx, y, 2.25);
        R(p, LAMP, cx - 3.5, y - 2.5, 1, 0.5);
      }
    }
    // The joint between repeats: a small dash so the line is not featureless.
    for (const y of [0, 48, 96]) R(p, N3, cx - 0.5, y + 1, 1, 0.5);
  },
};

/** The platform edge: raised studs above the yellow line. One 16 by 10 repeat. */
const horizontal = {
  w: 16,
  h: 10,
  paint: (p: Paint) => {
    for (const cx of [4, 12]) {
      const cy = 3.5;
      disc(p, N0, cx + 0.25, cy + 0.5, 3);
      disc(p, N3, cx, cy, 2.75);
      cells(p, N4, 0, 0, 16, 8, (x, y) => Math.hypot(x - cx + 0.4, y - cy + 0.4) <= 2.3);
      cells(p, N5, 0, 0, 16, 8, (x, y) => Math.hypot(x - cx + 0.9, y - cy + 0.9) <= 1.3 && Math.hypot(x - cx, y - cy) <= 2.6);
      R(p, LAMP, cx - 1.5, cy - 1.5, 0.5, 0.5);
    }
    // The platform line.
    R(p, N0, 0, 7, 16, 0.5);
    R(p, Y, 0, 7.5, 16, 2);
    R(p, YD, 0, 9, 16, 1);
  },
};

// ── sprites ────────────────────────────────────────────────────────────

/** A ring tilted by `a`, as a mask over (x, y); `front` picks the half toward the viewer. */
const ringMask = (cx: number, cy: number, a: number, rx: number, ry: number, t: number, front: boolean | null) => (x: number, y: number) => {
  const dx = x - cx;
  const dy = y - cy;
  const u = dx * Math.cos(a) + dy * Math.sin(a);
  const v = -dx * Math.sin(a) + dy * Math.cos(a);
  const o = (u / rx) ** 2 + (v / ry) ** 2;
  const i = (u / (rx - t * 1.2)) ** 2 + (v / (ry - t)) ** 2;
  if (o > 1 || i < 1) return false;
  return front === null || (front ? v >= 0 : v < 0);
};

/** The ringed moon: used in the emblem and, larger, in the tailpiece. */
function moon(p: Paint, cx: number, cy: number, r: number, a: number, ringRx: number, ringRy: number, ringT: number, detail: boolean) {
  const x0 = cx - ringRx - 1;
  const x1 = cx + ringRx + 1;
  const y0 = cy - Math.max(r, ringRx) - 1;
  const y1 = cy + Math.max(r, ringRx) + 1;
  // The back of the ring, then the globe, then the front of the ring.
  cells(p, M1, x0, y0, x1, y1, ringMask(cx, cy, a, ringRx, ringRy, ringT, false));
  disc(p, M1, cx, cy, r);
  cells(p, M0, x0, y0, x1, y1, (x, y) => Math.hypot(x - cx, y - cy) <= r && Math.hypot(x - cx + r * 0.3, y - cy + r * 0.3) > r);
  cells(p, M3, x0, y0, x1, y1, (x, y) => Math.hypot(x - cx, y - cy) <= r && Math.hypot(x - cx - r * 0.12, y - cy - r * 0.12) > r - 0.01);
  if (detail) {
    disc(p, MC, cx + r * 0.2, cy - r * 0.35, r * 0.2);
    disc(p, MC, cx - r * 0.35, cy + r * 0.3, r * 0.14);
  }
  // The ring throws a thin shadow on the globe below it.
  const front = ringMask(cx, cy, a, ringRx, ringRy, ringT, true);
  cells(p, M0, x0, y0, x1, y1, (x, y) => Math.hypot(x - cx, y - cy) <= r && front(x, y - ringT * 1.1) && !front(x, y));
  cells(p, M2, x0, y0, x1, y1, front);
}

const emblem = {
  w: 24,
  h: 24,
  paint: (p: Paint) => {
    // A rounded square of night blue with a lit top and left and a dark foot.
    rrect(p, N0, 0, 0, 24, 24, 6);
    rrect(p, N4, 0.5, 0.5, 23, 23, 5.5);
    rrect(p, N3, 1, 1, 22, 22, 5);
    rrect(p, N2, 1.5, 1.5, 21, 21, 4.5);
    cells(p, N5, 0, 0, 24, 24, (x, y) => (y >= 0.5 && y < 1 && x > 5 && x < 17) || (x >= 0.5 && x < 1 && y > 5 && y < 17));
    cells(p, N1, 0, 0, 24, 24, (x, y) => y > 21.5 && y < 22.5 && x > 5 && x < 19);
    // A few stars, and the moon with its ring.
    for (const [x, y] of [[4.5, 5], [19.5, 4.5], [20.5, 19], [4, 18.5]] as const) R(p, ICE, x, y, 1, 1);
    R(p, LAMP, 15, 4, 0.5, 0.5);
    moon(p, 12, 12, 5.5, -0.45, 10.5, 3, 1.3, false);
  },
};

/** A stop ring on a short tail of line. Two tones and a yellow centre. */
const mark = {
  w: 14,
  h: 14,
  paint: (p: Paint) => {
    // The tail of line, running in from the left.
    R(p, N0, 0, 5.5, 5, 3);
    R(p, ICE, 0, 6, 5, 2);
    R(p, N4, 0, 7.5, 5, 0.5);
    // The ring, with a dark seat.
    disc(p, N0, 9, 7, 5.5);
    ring(p, ICE, 9, 7, 5, 3);
    cells(p, N4, 0, 0, 14, 14, (x, y) => Math.hypot(x - 9, y - 7) <= 5 && Math.hypot(x - 9, y - 7) >= 3 && x - 9 + (y - 7) > 3.2);
    disc(p, Y, 9, 7, 3);
    R(p, LAMP, 7, 5, 1, 1);
  },
};

const rule = {
  w: 140,
  h: 12,
  paint: (p: Paint) => {
    const y = 6;
    // The route.
    R(p, ICE, 4, y - 1, 128, 1.5);
    R(p, LAMP, 4, y - 1, 128, 0.5);
    R(p, N4, 4, y + 0.5, 128, 1);
    // Three stops: two open rings and a filled dot.
    for (const [x, filled] of [[12, false], [58, false], [104, true]] as const) {
      disc(p, N0, x, y, 5.25);
      if (filled) {
        disc(p, ICE, x, y, 4);
        cells(p, N4, 0, 0, 140, 12, (px, py) => Math.hypot(px - x - 0.8, py - y - 0.8) <= 4 && Math.hypot(px - x + 0.5, py - y + 0.5) > 3.6);
        disc(p, LAMP, x - 1, y - 1, 1.4);
      } else {
        ring(p, ICE, x, y, 4.5, 2.75);
        cells(p, N4, 0, 0, 140, 12, (px, py) => Math.hypot(px - x, py - y) <= 4.5 && Math.hypot(px - x, py - y) >= 2.75 && px - x + (py - y) > 3);
        disc(p, N1, x, y, 2.25);
        R(p, LAMP, x - 3.5, y - 2.5, 1, 0.5);
      }
    }
    // Ticks on the line, between the stops.
    for (const x of [35, 81, 120]) R(p, N3, x - 0.5, y - 3.5, 1, 2);
    // The terminus: a bar across the line, with a lit edge and a foot.
    R(p, N0, 131.5, 0.5, 5, 11);
    R(p, ICE, 132, 1, 3.5, 10);
    R(p, LAMP, 132, 1, 1, 10);
    R(p, N4, 134.5, 1, 1, 10);
    R(p, N0, 130, y - 1.5, 2, 3);
    R(p, ICE, 130, y - 1, 2, 2);
    R(p, N3, 138, y - 0.5, 2, 1);
  },
};

/** One strokes of rain: a slanted dash. */
const drop = (p: Paint, x: number, y: number, len: number, c: string) => path(p, c, [[x, y], [x - len * 0.25, y + len]], 0.25);

const spot = {
  w: 180,
  h: 120,
  paint: (p: Paint) => {
    const G = 102;
    // The platform: its edge, a lit face, and joints in the slab.
    R(p, N5, 6, G, 168, 0.5);
    R(p, N4, 6, G + 0.5, 168, 1.5);
    R(p, N3, 6, G + 2, 168, 4);
    R(p, N2, 6, G + 6, 168, 1);
    for (let x = 14; x < 170; x += 28) R(p, N2, x, G + 2.5, 0.5, 3.5);
    R(p, N0, 6, G + 7, 168, 0.5);

    // The lamp: a post on the left, an arm over the bench, a hooded head.
    const px = 34;
    R(p, N0, px - 2, 24, 4, G - 24);
    R(p, N3, px - 1.5, 24, 3, G - 24);
    R(p, N4, px - 1.5, 24, 1, G - 24);
    R(p, N2, px + 0.5, 24, 1, G - 24);
    R(p, N0, px - 5, G - 6, 10, 6);
    R(p, N3, px - 4.5, G - 5.5, 9, 5.5);
    R(p, N5, px - 4.5, G - 5.5, 9, 0.5);
    path(p, N0, [[px, 25], [px + 4, 18], [px + 14, 14.5], [px + 26, 14.5]], 2);
    path(p, N3, [[px, 25], [px + 4, 18], [px + 14, 14.5], [px + 26, 14.5]], 1.25);
    path(p, N4, [[px, 24], [px + 4, 17], [px + 14, 13.5], [px + 26, 13.5]], 0.5);
    const lx = 76;
    poly(p, N0, [[lx - 13, 20], [lx - 9, 14], [lx + 9, 14], [lx + 13, 20]]);
    poly(p, N3, [[lx - 12, 19.5], [lx - 8.5, 14.5], [lx + 8.5, 14.5], [lx + 12, 19.5]]);
    R(p, N5, lx - 8.5, 14.5, 17, 0.5);
    R(p, N0, lx - 4, 12, 8, 2.5);
    R(p, N4, lx - 3.5, 12.5, 7, 1);
    R(p, N0, lx - 11, 19.5, 22, 5);
    R(p, ICE, lx - 10, 20, 20, 3.5);
    R(p, LAMP, lx - 8, 20, 12, 1);
    R(p, N4, lx - 10, 23, 20, 0.5);

    // The cone of light: a scatter of cold specks, and a pool of them on the platform.
    const cone: Pt[] = [[lx - 10, 25], [lx + 10, 25], [lx + 46, G], [lx - 46, G]];
    stip(p, ICE, lx - 46, 25, lx + 46, G, 0.075, (x, y) => inPoly(x, y, cone));
    stip(p, LAMP, lx - 46, 25, lx + 46, G, 0.03, (x, y) => inPoly(x, y, cone));
    stip(p, ICE, lx - 50, G + 2, lx + 50, G + 6, 0.35, (x, y) => ((x - lx) / 50) ** 2 + ((y - G - 3) / 4) ** 2 < 1);

    // The bench: a steel frame, two backrest slats, two seat planks, a pair of arms.
    const bx0 = 54;
    const bx1 = 122;
    // Under the seat it is dark.
    R(p, N0, bx0 + 4, 86, bx1 - bx0 - 8, G - 86);
    for (const x of [bx0 + 4, bx1 - 8]) {
      R(p, N0, x - 0.5, 56, 5, G - 56 + 0.5);
      R(p, N3, x, 56, 4, G - 56);
      R(p, N4, x, 56, 1, G - 56);
      R(p, N2, x + 3, 56, 1, G - 56);
      R(p, N0, x - 2, G - 2, 8, 2);
      R(p, N3, x - 1.5, G - 2, 7, 1.5);
    }
    const slat = (y: number, h: number) => {
      R(p, N0, bx0, y - 0.5, bx1 - bx0, h + 1);
      R(p, N3, bx0 + 0.5, y, bx1 - bx0 - 1, h);
      R(p, N5, bx0 + 0.5, y, bx1 - bx0 - 1, 0.5);
      R(p, N4, bx0 + 0.5, y + 0.5, bx1 - bx0 - 1, 1);
      R(p, N2, bx0 + 0.5, y + h - 1, bx1 - bx0 - 1, 1);
    };
    slat(58, 5);
    slat(66, 5);
    slat(79, 4.5);
    slat(85, 4.5);
    // The arms.
    for (const x of [bx0 - 1, bx1 - 5]) {
      R(p, N0, x, 73, 6, 5);
      R(p, N3, x + 0.5, 73.5, 5, 4);
      R(p, N5, x + 0.5, 73.5, 5, 0.5);
      R(p, N2, x + 0.5, 76.5, 5, 1);
    }
    // Rivets on the slats.
    for (const x of [bx0 + 7, bx1 - 7]) for (const y of [60, 68]) R(p, N5, x, y, 0.5, 0.5);

    // The umbrella: furled, its tip on the platform and its crook hooked over the bench's arm.
    const tip: Pt = [138, G - 0.5];
    const top2: Pt = [126.5, 72];
    const dx = top2[0] - tip[0];
    const dy = top2[1] - tip[1];
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    const along = (x: number, y: number) => ((x - tip[0]) * ux + (y - tip[1]) * uy) / len;
    const side = (x: number, y: number) => -(x - tip[0]) * uy + (y - tip[1]) * ux;
    const hw = (t: number) => (t < 0.1 || t > 0.78 ? 0 : 3.6 * Math.sin(((t - 0.1) / 0.68) * Math.PI) ** 0.6);
    // The shaft, and the canopy around it.
    path(p, N0, [tip, top2], 1);
    path(p, N5, [tip, top2], 0.5);
    cells(p, N0, 110, 60, 146, G, (x, y) => Math.abs(side(x, y)) <= hw(along(x, y)) + 0.5 && hw(along(x, y)) > 0);
    cells(p, N4, 110, 60, 146, G, (x, y) => Math.abs(side(x, y)) <= hw(along(x, y)) && hw(along(x, y)) > 0);
    cells(p, N3, 110, 60, 146, G, (x, y) => side(x, y) > 0.1 && side(x, y) <= hw(along(x, y)) && hw(along(x, y)) > 0);
    cells(p, N5, 110, 60, 146, G, (x, y) => side(x, y) < -0.1 && side(x, y) >= -hw(along(x, y)) * 0.6 && side(x, y) <= -hw(along(x, y)) * 0.25 && hw(along(x, y)) > 0);
    // Two folds, and the strap that holds it shut.
    cells(p, N2, 110, 60, 146, G, (x, y) => Math.abs(side(x, y) - 1.2) < 0.3 && hw(along(x, y)) > 1.5);
    cells(p, N0, 110, 60, 146, G, (x, y) => Math.abs(along(x, y) - 0.34) < 0.012 && Math.abs(side(x, y)) <= hw(0.34) + 0.7);
    cells(p, ICE, 110, 60, 146, G, (x, y) => Math.abs(along(x, y) - 0.34) < 0.012 && Math.abs(side(x, y)) <= 0.5);
    // The crook: a hook of steel that goes over the arm.
    path(p, N0, [top2, [top2[0] - 0.5, 69], [top2[0] - 2.5, 67.2], [top2[0] - 5, 69]], 1.1);
    path(p, N5, [top2, [top2[0] - 0.5, 69], [top2[0] - 2.5, 67.2], [top2[0] - 5, 69]], 0.6);

    // A puddle with a ripple, and the lamp's reflection standing in it.
    cells(p, N2, 60, G + 4, 120, G + 8, (x, y) => ((x - 92) / 26) ** 2 + ((y - G - 6) / 1.9) ** 2 <= 1);
    cells(p, N4, 60, G + 4, 120, G + 8, (x, y) => ((x - 92) / 26) ** 2 + ((y - G - 6) / 1.9) ** 2 <= 1 && ((x - 92) / 26) ** 2 + ((y - G - 6) / 1.9) ** 2 >= 0.72);
    R(p, ICE, 74, G + 5.5, 4, 0.5);
    R(p, ICE, 85, G + 6, 7, 0.5);
    R(p, ICE, 100, G + 5.5, 5, 0.5);

    // Rain, slanted: cold white where it crosses the light, steel elsewhere.
    for (let i = 0; i < 46; i += 1) {
      const x = 8 + p.rnd() * 164;
      const y = 6 + p.rnd() * 86;
      const lit = inPoly(x, y, cone);
      const near = i % 4 === 0;
      drop(p, x, y, near ? 7 : 4.5, lit ? RAIN_HI : near ? N5 : RAIN);
    }
    // Rings where drops hit the platform.
    for (const [x, y] of [[20, G + 3], [44, G + 5], [140, G + 4], [158, G + 3]] as const) {
      R(p, N5, x - 1.5, y, 3, 0.5);
      R(p, N4, x - 2.5, y + 0.5, 5, 0.5);
    }
  },
};

export default defineOrnaments({
  frames: { panel, card, sign },
  edges: { vertical, horizontal },
  sprites: { emblem, mark, rule, spot },
});
