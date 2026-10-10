/**
 * The Night Line: the waiting room. A dark panelled corner of a maglev
 * platform's waiting room at the blue hour, seen from the table. The wall is
 * navy panelling with a chair rail and a plum leather bench; the opening is a
 * wide carriage pane in slim blue metal with one bar across and one up,
 * teal curtains tied back at its sides, and a wooden table lit amber below it.
 *
 * Out there (the pane): deep blue sky in flat bands down to a seam of warm
 * light, a big ringed moon, a far city with lit floors and red pips on masts,
 * a wet platform with the city smeared in it, a yellow line (the one accent),
 * and the maglev. Rain falls beyond the glass, two crafts cross the sky.
 * Arriving, the train glides in from the right and waits, its band of windows
 * the brightest thing outside; departing, it leaves to the left; passing, an
 * express runs through. Away: just the rain and the city.
 *
 * On the glass (companion, `over`): beads of rain stand on the pane and
 * several runs gather and slide down in fits and starts, leaving pale tracks.
 * Idle: slow. While the train waits: the beads near it brighten. As it
 * leaves: a gust sends every run down at once and the tracks come out long.
 *
 * On the table: a lidded paper cup with a sleeve and a thread of steam, a
 * folded ticket, and a round paper lantern whose small cap is the signal
 * (green; amber with stragglers). One punched ticket per quest finished
 * today (up to 12) lies in a fan beside the cup. Flat colour only.
 */

import { defineScene } from '../types';
import type { SceneFrame } from '../types';

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

const SKY = ['#1A2480', '#2C3E96', '#4A5AB8', '#7A6ED0', '#B05A9A', '#E0705A', '#F0A860'];
const SKY_CUT = [0, 0.14, 0.3, 0.44, 0.56, 0.66, 0.76, 1];
const MOON = '#8A98F0', MOON_RING = '#C4CEFF', MOON_LIT = '#EEF2FF', MOON_SHADE = '#4A58B8', MOON_CRATER = '#6C7ADA';
const FAR = '#1C2356', FAR_TOP = '#2E3A86', NEAR = '#10143A', NEAR_TOP = '#1A2052';
const PLAT = '#1A2158', PLAT_HI = '#2C3680', PLAT_LO = '#0E1236';
const ICE = '#9FE8FF', LAMP = '#DDEBFF', RAIN = '190, 208, 255';
const WARM = '#FFB648', WARM_HI = '#FFE2A0', PIP = '#FF5A4A';
const BODY = '#26307A', BODY_LIT = '#4654B0', BODY_LO = '#171E52', UNDER = '#080B24';
const YELLOW = '#FFD23A';
const WALL = ['#0C1030', '#0F1438', '#121840'], WALL_HI = '#1A2052', WALL_LO = '#06081A', WALL_DK = '#080B24';
const METAL = '#3A4676', METAL_HI = '#7482C0', METAL_LO = '#262E5E', METAL_DK = '#141944';
const CURT: [string, string][] = [['#16343E', '#1E4A5A'], ['#1E4A5A', '#2C6878'], ['#112A33', '#16343E'], ['#1E4A5A', '#2C6878'], ['#16343E', '#1E4A5A']];
const CURT_CREASE = '#0A1C22', CURT_RIM = '#8A82E0';
const LEATHER = '#2E1A20', LEATHER_LO = '#241319', LEATHER_HI = '#6A4048', LEATHER_MID = '#4E2E34';
const WOOD = '#3A2A1E', WOOD_MID = '#5A3E28', WOOD_DK = '#241912', WOOD_LIT = '#C88A4A';
const POOL = ['#4A3424', '#6E4A2C', '#9A6A38', '#C88A4A'];
const CREAM = '#E8DCC6', CREAM_LO = '#C9BCA4', CREAM_HI = '#FFF8E8', KRAFT = '#B07C44', KRAFT_LO = '#8A5C30', TEAL = '#2C6878';
const GREEN = '#5EE6A8', AMBER = '#FF8F2E';

const clamp01 = (k: number) => Math.min(1, Math.max(0, k));
const smooth = (x: number) => { const k = clamp01(x); return k * k * (3 - 2 * k); };
const easeOut = (k: number) => 1 - (1 - k) ** 3;
const easeIn = (k: number) => k ** 3;
/** A fixed pseudo-noise in [0, 1): the same city every time, with no state. */
const hh = (i: number, k = 0) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };

const block = (c: Ctx, col: string, x: number, y: number, w: number, h: number) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
const oval = (c: Ctx, col: string, x: number, y: number, rx: number, ry: number, rot = 0) => {
  c.fillStyle = col; c.beginPath();
  c.ellipse(x, y, rx, ry, rot, 0, TAU);
  c.fill();
};
const disc = (c: Ctx, col: string, x: number, y: number, r: number) => oval(c, col, x, y, r, r);
const poly = (c: Ctx, col: string, pts: number[]) => {
  c.fillStyle = col; c.beginPath();
  c.moveTo(pts[0]!, pts[1]!);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i]!, pts[i + 1]!);
  c.fill();
};
/** Fields of 1 px dots; `keep` thins them where it returns less than 1. */
const dots = (c: Ctx, rnd: () => number, x: number, y: number, w: number, h: number, n: number, cols: string[], size = 1, keep?: (px: number, py: number) => number) => {
  for (const col of cols) {
    c.fillStyle = col; c.beginPath();
    for (let i = 0; i < Math.ceil(n / cols.length); i += 1) {
      const px = x + rnd() * w;
      const py = y + rnd() * h;
      if (!keep || rnd() <= keep(px, py)) c.rect(Math.floor(px), Math.floor(py), size, size);
    }
    c.fill();
  }
};
/** Long, slightly wavering hairlines: grain. */
const grain = (c: Ctx, rnd: () => number, x: number, y: number, w: number, h: number, n: number, col: string, len = 70) => {
  c.strokeStyle = col; c.lineWidth = 1; c.beginPath();
  for (let i = 0; i < n; i += 1) {
    const gx = x + rnd() * w;
    const gy = Math.floor(y + rnd() * h) + 0.5;
    const l = 18 + rnd() * len;
    c.moveTo(gx, gy);
    c.quadraticCurveTo(gx + l / 2, gy + (rnd() - 0.5) * 2.2, gx + l, gy + (rnd() - 0.5) * 1.6);
  }
  c.stroke();
};
const screw = (c: Ctx, x: number, y: number, r: number) => {
  disc(c, METAL_DK, x + 0.4, y + 0.6, r + 0.8);
  disc(c, METAL, x, y, r);
  block(c, METAL_HI, Math.floor(x - r * 0.55), Math.floor(y - r * 0.55), 1, 1);
};

interface Geo {
  W: number; H: number; wide: boolean; u: number;
  ox: number; oy: number; ow: number; oh: number; ox1: number; oy1: number;
  r: number; fw: number; bt: number; hb: number; vb: number; edge: number;
  tb: number; tf: number; tb2: number; tl: number; yb: number;
  cupX: number; tickX: number; fanX: number; lampX: number; seatX: number; rail: number;
  car: number; nose: number; trainLen: number; stopX: number;
}

/** Every position in the scene, from the canvas size alone, so all four layers agree. */
function geo(W: number, H: number): Geo {
  const wide = W >= 560;
  const u = Math.max(0.8, Math.min(1.2, H / 256));
  const ox = Math.round(wide ? W * 0.45 : W * 0.04);
  const ow = Math.round(wide ? W * 0.5 : W * 0.92);
  const oy = Math.round(wide ? H * 0.075 : H * 0.49);
  const oy1 = Math.round(wide ? H * 0.7 : H * 0.795);
  const oh = oy1 - oy;
  const fw = Math.round((wide ? 7 : 4) * u);
  const bt = Math.max(3, Math.round((wide ? 5 : 3.4) * u));
  const tb = oy1 + fw;
  const tf = Math.round(H * (wide ? 0.905 : 0.935));
  const tb2 = Math.round(tf + H * (wide ? 0.042 : 0.032));
  const car = Math.round(ow * 0.28);
  const nose = Math.round(ow * 0.1);
  return {
    W, H, wide, u, ox, oy, ow, oh, ox1: ox + ow, oy1,
    r: Math.round((wide ? 15 : 9) * u), fw, bt,
    hb: oy + Math.round(oh * 0.25), vb: ox + Math.round(ow * 0.58),
    edge: oy + Math.round(oh * 0.82),
    tb, tf, tb2, tl: Math.round(wide ? W * 0.11 : W * 0.015), yb: Math.round(tb + (tf - tb) * 0.66),
    cupX: W * (wide ? 0.5 : 0.2), tickX: W * (wide ? 0.585 : 0.335), fanX: W * (wide ? 0.645 : 0.46), lampX: W * (wide ? 0.885 : 0.74),
    seatX: W * 0.255, rail: Math.round(H * 0.645),
    car, nose, trainLen: nose + 3 * car + 4, stopX: ox + Math.round(ow * 0.03),
  };
}

interface Tower { x: number; w: number; h: number; i: number }
interface Pip { x: number; y: number; i: number }

/** The far city and the near one, and the masts, from the geometry alone. */
function city(g: Geo) {
  const base = g.edge - 4;
  const make = (layer: number, wLo: number, wHi: number, hLo: number, hHi: number) => {
    const out: Tower[] = [];
    let x = g.ox - 6;
    for (let i = 0; x < g.ox1; i += 1) {
      const w = Math.round((wLo + hh(i, layer * 7 + 1) * (wHi - wLo)) * g.u);
      const bias = 0.65 + 0.7 * ((x - g.ox) / g.ow);
      out.push({ x, w, h: Math.round(g.oh * (hLo + hh(i, layer * 7 + 2) * (hHi - hLo) * bias)), i: i + layer * 100 });
      x += w + Math.round(hh(i, layer * 7 + 3) * 3 * g.u);
    }
    return out;
  };
  const far = make(0, 14, 34, 0.12, 0.36);
  const near = make(1, 10, 26, 0.05, 0.19);
  const pips: Pip[] = [];
  for (const b of far) {
    if (hh(b.i, 9) < 0.32 && b.h > g.oh * 0.14) {
      pips.push({ x: b.x + Math.round(b.w * (0.3 + hh(b.i, 10) * 0.4)), y: base - b.h - Math.round((6 + hh(b.i, 11) * 10) * g.u), i: b.i });
    }
  }
  return { base, far, near, pips };
}

interface Drop { x: number; y: number; len: number; v: number; a: number; near: boolean }
interface Splash { x: number; y: number; born: number }
interface Craft { x: number; y: number; v: number }
interface Bead { x: number; y: number; r: number; gone: boolean }
interface Run { x: number; y0: number; y: number; ph: number; vmax: number; r: number; dead: number }
interface State { g: Geo; drops: Drop[]; craft: Craft[]; splashes: Splash[]; beads: Bead[]; runs: Run[] }

function trainX(f: SceneFrame, g: Geo): number {
  const startX = g.ox1 + 40;
  const endX = g.ox - g.trainLen - 40;
  const { phase, k } = f.visitor;
  if (phase === 'arriving') return startX + (g.stopX - startX) * easeOut(k);
  if (phase === 'departing') return g.stopX + (endX - g.stopX) * easeIn(k);
  if (phase === 'passing') return startX + (endX - startX) * k;
  return g.stopX;
}

/** A recessed rounded-rectangle ring: the frame, outermost edge first. */
function ring(c: Ctx, g: Geo, e: number, col: string) {
  c.fillStyle = col; c.beginPath();
  c.roundRect(g.ox - e, g.oy - e, g.ow + 2 * e, g.oh + 2 * e, g.r + e);
  c.roundRect(g.ox + 1, g.oy + 1, g.ow - 2, g.oh - 2, Math.max(1, g.r - 1));
  c.fill('evenodd');
}

/** A curtain: teal, tied back, five flat folds; `xa` is its edge against the wall. */
function curtain(c: Ctx, rnd: () => number, u: number, xa: number, dir: number, wt: number, top: number, bottom: number, tieY: number) {
  const wAt = (y: number) => (y < tieY
    ? wt * (0.62 + 0.38 * ((tieY - y) / (tieY - top)) ** 1.4)
    : wt * (0.62 + 0.4 * ((y - tieY) / (bottom - tieY)) ** 1.15));
  const n = CURT.length;
  const xs = (i: number, y: number) => xa + dir * wAt(y) * (i / n);
  const step = Math.max(2, Math.round(3 * u));
  const ys: number[] = [];
  for (let y = top; y < bottom; y += step) ys.push(y);
  ys.push(bottom);
  const edge = (i: number, off = 0) => ys.forEach((y, j) => (j ? c.lineTo(xs(i, y) + off, y) : c.moveTo(xs(i, y) + off, y)));
  const back = (i: number) => { for (let j = ys.length - 1; j >= 0; j -= 1) c.lineTo(xs(i, ys[j]!), ys[j]!); };
  for (let i = 0; i < n; i += 1) {
    for (let band = 0; band < 2; band += 1) {
      c.fillStyle = CURT[i]![band]!; c.beginPath();
      edge(i + band * 0.58);
      back(band === 0 ? i + 0.58 : i + 1);
      c.fill();
    }
  }
  c.strokeStyle = CURT_CREASE; c.lineWidth = 1; c.beginPath();
  for (let i = 1; i < n; i += 1) edge(i);
  c.stroke();
  // The blue hour on the inner edge.
  c.strokeStyle = CURT_RIM; c.lineWidth = Math.max(1.5, 1.8 * u); c.beginPath();
  edge(n, -dir);
  c.stroke();
  c.save(); c.beginPath();
  edge(0);
  back(n);
  c.clip();
  const bx = Math.min(xs(0, bottom), xs(n, bottom)) - 4;
  dots(c, rnd, bx, top, wt * 1.4, bottom - top, wt * 5, ['#2C6878', '#112A33', '#0A1C22', '#3C8090']);
  c.restore();
  // The tie: a teal strap with a brass button, a short tassel.
  const t0 = xs(0, tieY);
  const t1 = xs(n, tieY);
  const tx = Math.min(t0, t1) - 1;
  const tw = Math.abs(t1 - t0) + 2;
  block(c, CURT_CREASE, tx, tieY - 2.5 * u, tw, 5 * u);
  block(c, TEAL, tx, tieY - 2 * u, tw, 3 * u);
  block(c, '#4A98A8', tx, tieY - 2 * u, tw, 1);
  disc(c, WOOD_LIT, t1 - dir * 2.5 * u, tieY, 2.2 * u);
  block(c, '#FFE2A0', t1 - dir * 3 * u, tieY - 1.2 * u, 1.2, 1.2);
  block(c, KRAFT_LO, t1 - dir * 2.5 * u - 0.5, tieY + 2.5 * u, 1.4, 6 * u);
  // The rod, with a finial at the wall end.
  const rx0 = Math.min(xs(0, top), xs(n, top)) - 4;
  block(c, METAL_DK, rx0, top - 3, wt + 8, 4);
  block(c, METAL, rx0, top - 3, wt + 8, 3);
  block(c, METAL_HI, rx0, top - 3, wt + 8, 1);
  disc(c, METAL_HI, dir > 0 ? rx0 : rx0 + wt + 8, top - 1.5, 2.6 * u);
}

/** A flat paper lantern on a short stand: warm shape, ribs, dark caps and, on top, the signal. */
function lantern(c: Ctx, x: number, y: number, q: number, t: number, caution: boolean, moving: boolean) {
  const fl = moving ? Math.sin(t / 700) * 0.6 + Math.sin(t / 230) * 0.3 : 0;
  oval(c, '#120B08', x + 2 * q, y + 1, 15 * q, 3.2 * q);
  oval(c, METAL_DK, x, y - 1.2 * q, 11 * q, 3 * q);
  oval(c, METAL, x, y - 2.2 * q, 10 * q, 2.6 * q);
  block(c, METAL_HI, Math.round(x - 6 * q), Math.round(y - 4 * q), 4 * q, 1);
  block(c, METAL_LO, x - 1.8 * q, y - 10 * q, 3.6 * q, 8 * q);
  block(c, METAL, x - 1.8 * q, y - 10 * q, 1.6 * q, 8 * q);
  oval(c, METAL_DK, x, y - 10.4 * q, 8.6 * q, 2.4 * q);
  oval(c, METAL, x, y - 11.2 * q, 8 * q, 2 * q);
  const cy = y - 11 * q - 12.5 * q;
  const rx = 12.5 * q;
  const ry = 13 * q;
  oval(c, KRAFT_LO, x, cy, rx + 1.2, ry + 1.2);
  oval(c, WARM, x, cy, rx, ry);
  c.save(); c.beginPath();
  c.ellipse(x, cy, rx, ry, 0, 0, TAU);
  c.clip();
  oval(c, '#E8902C', x + rx * 0.62, cy + ry * 0.1, rx * 0.8, ry * 1.1);
  oval(c, WARM_HI, x - rx * 0.12, cy + fl * 0.3, rx * (0.62 + fl * 0.02), ry * (0.7 + fl * 0.02));
  oval(c, '#FFF6DA', x - rx * 0.12, cy + fl * 0.4, rx * 0.34, ry * 0.4);
  c.strokeStyle = '#D8801E'; c.lineWidth = 1;
  for (const f of [0.34, 0.68, 0.98]) { c.beginPath(); c.ellipse(x, cy, rx * f, ry, 0, -TAU / 4, TAU / 4); c.stroke(); c.beginPath(); c.ellipse(x, cy, rx * f, ry, 0, TAU / 4, TAU * 0.75); c.stroke(); }
  block(c, '#FFF6DA', Math.round(x - rx * 0.62), Math.round(cy - ry * 0.55), Math.max(1.5, q * 1.4), ry * 0.5);
  c.restore();
  // Dark caps top and bottom, and the signal: a bead of colour on a ring.
  poly(c, METAL_DK, [x - 5 * q, cy - ry - 0.5, x + 5 * q, cy - ry - 0.5, x + 4 * q, cy - ry - 4 * q, x - 4 * q, cy - ry - 4 * q]);
  block(c, METAL, x - 4.4 * q, cy - ry - 1.5, 8.8 * q, 1);
  poly(c, METAL_DK, [x - 4.5 * q, cy + ry + 0.5, x + 4.5 * q, cy + ry + 0.5, x + 3 * q, cy + ry - 2 * q, x - 3 * q, cy + ry - 2 * q]);
  const sy = cy - ry - 4 * q;
  disc(c, '#06081A', x, sy - 2 * q, 5.6 * q);
  disc(c, caution ? AMBER : GREEN, x, sy - 2 * q, 4.4 * q);
  block(c, caution ? '#FFE4C0' : '#D4FFEA', Math.round(x - 2.4 * q), Math.round(sy - 4.6 * q), Math.max(1.6, 1.6 * q), Math.max(1.6, 1.6 * q));
}

/** A lidded paper cup in a kraft sleeve. `y` is where it stands. */
function cup(c: Ctx, x: number, y: number, q: number) {
  oval(c, '#120B08', x + 2 * q, y + 1, 11.5 * q, 2.6 * q);
  const body = () => {
    c.beginPath();
    c.moveTo(x - 9 * q, y - 27 * q);
    c.lineTo(x + 9 * q, y - 27 * q);
    c.lineTo(x + 6.6 * q, y - 1.5 * q);
    c.quadraticCurveTo(x + 6 * q, y, x + 4.5 * q, y);
    c.lineTo(x - 4.5 * q, y);
    c.quadraticCurveTo(x - 6 * q, y, x - 6.6 * q, y - 1.5 * q);
    c.closePath();
  };
  c.fillStyle = CREAM; body(); c.fill();
  c.save(); body(); c.clip();
  block(c, CREAM_LO, x + 1.5 * q, y - 28 * q, 9 * q, 30 * q);
  // The sleeve.
  block(c, KRAFT, x - 10 * q, y - 21 * q, 20 * q, 13 * q);
  block(c, KRAFT_LO, x + 2 * q, y - 21 * q, 9 * q, 13 * q);
  block(c, '#D49A5C', x - 8 * q, y - 21 * q, 1.6 * q, 13 * q);
  block(c, TEAL, x - 10 * q, y - 15.5 * q, 20 * q, 2 * q);
  block(c, KRAFT_LO, x - 10 * q, y - 8.4 * q, 20 * q, 1);
  block(c, CREAM_HI, x - 6.6 * q, y - 26 * q, 1.4 * q, 4 * q);
  c.restore();
  // The lid: a rim, a dome, a sip hole.
  poly(c, CREAM_LO, [x - 10.4 * q, y - 29.6 * q, x + 10.4 * q, y - 29.6 * q, x + 9.4 * q, y - 26.4 * q, x - 9.4 * q, y - 26.4 * q]);
  block(c, CREAM, x - 10.4 * q, y - 29.6 * q, 20.8 * q, 1.6 * q);
  c.fillStyle = CREAM_HI; c.beginPath();
  c.moveTo(x - 9 * q, y - 29.6 * q);
  c.quadraticCurveTo(x - 7 * q, y - 34 * q, x, y - 34 * q);
  c.quadraticCurveTo(x + 7 * q, y - 34 * q, x + 9 * q, y - 29.6 * q);
  c.fill();
  block(c, CREAM_LO, x + 2 * q, y - 33 * q, 5.5 * q, 3.4 * q);
  block(c, '#3A2A1E', x - 1 * q, y - 31.8 * q, 4 * q, 1.4);
}

/** A folded paper ticket lying on the table: two halves, a stripe, a row of stub dashes. */
function ticket(c: Ctx, x: number, y: number, q: number) {
  poly(c, '#120B08', [x - 14 * q, y + 1.5, x + 17 * q, y + 1, x + 19 * q, y + 4.5 * q, x - 12 * q, y + 5 * q]);
  poly(c, CREAM, [x - 14 * q, y - 3 * q, x + 1 * q, y - 4.5 * q, x + 1 * q, y + 2.5 * q, x - 15 * q, y + 3 * q]);
  poly(c, CREAM_LO, [x + 1 * q, y - 4.5 * q, x + 16 * q, y - 3.4 * q, x + 17 * q, y + 3 * q, x + 1 * q, y + 2.5 * q]);
  poly(c, TEAL, [x - 13.4 * q, y - 1.5 * q, x + 1 * q, y - 2.5 * q, x + 1 * q, y - 0.6 * q, x - 13.8 * q, y + 0.3 * q]);
  block(c, '#8A7A5A', x + 4 * q, y - 1.4 * q, 9 * q, 1);
  block(c, '#8A7A5A', x + 4 * q, y + 0.2 * q, 6 * q, 1);
  block(c, CREAM_HI, x - 14 * q, y - 3 * q, 14 * q, 1);
}

export default defineScene<State>({
  sky: '#2C3E96',

  // ── Far away, painted once: the blue hour ──
  back(p) {
    const { ctx: c, w, h, rnd } = p;
    const g = geo(w, h);
    const { ox, oy, ow, oh, ox1, oy1, edge, u } = g;
    const ct = city(g);
    c.save(); c.beginPath();
    c.rect(ox, oy, ow, oh);
    c.clip();

    // Sky in seven flat bands, dithered a few pixels at each step; the horizon is the warm one.
    const sh = edge - oy;
    SKY.forEach((col, i) => block(c, col, ox, oy + SKY_CUT[i]! * sh, ow, (SKY_CUT[i + 1]! - SKY_CUT[i]!) * sh + 1));
    for (let i = 1; i < SKY.length; i += 1) {
      const y = oy + SKY_CUT[i]! * sh;
      dots(c, rnd, ox, y - 6 * u, ow, 6 * u, ow * 0.9, [SKY[i]!], 1, (_x, py) => (py - (y - 6 * u)) / (6 * u));
      dots(c, rnd, ox, y, ow, 6 * u, ow * 0.9, [SKY[i - 1]!], 1, (_x, py) => 1 - (py - y) / (6 * u));
    }
    // Flat streaks of cloud, and grain.
    for (let i = 0; i < (g.wide ? 16 : 8); i += 1) {
      const band = 1 + Math.floor(rnd() * 5);
      const y = oy + (SKY_CUT[band]! + rnd() * (SKY_CUT[band + 1]! - SKY_CUT[band]!)) * sh;
      const len = (30 + rnd() * 110) * u;
      block(c, SKY[band + 1]!, ox + rnd() * ow, y, len, Math.max(1, 1.6 * u));
    }
    dots(c, rnd, ox, oy, ow, sh, g.wide ? 1500 : 600, ['#3A4696', '#141C6A'], 1, (_x, py) => 0.5 * (1 - (py - oy) / sh));
    dots(c, rnd, ox, oy + sh * 0.6, ow, sh * 0.4, g.wide ? 500 : 200, ['#FFD0A0', '#8A4A8E'], 1);

    // The ringed moon: big, low, to the right; the ring passes behind it and in front.
    const mx = ox + ow * (g.wide ? 0.78 : 0.87);
    const my = oy + oh * (g.wide ? 0.36 : 0.54);
    const mr = oh * (g.wide ? 0.24 : 0.24);
    const ringArc = (a0: number, a1: number, scale: number, lw: number, col: string) => {
      c.strokeStyle = col; c.lineWidth = lw; c.beginPath();
      c.ellipse(mx, my, mr * 1.8 * scale, mr * 0.3 * scale, -0.3, a0, a1);
      c.stroke();
    };
    const lw = Math.max(1.5, mr * 0.1);
    ringArc(Math.PI, TAU, 1, lw, MOON_RING);
    ringArc(Math.PI, TAU, 1.14, Math.max(1, lw * 0.6), MOON_SHADE);
    disc(c, MOON, mx, my, mr);
    c.save(); c.beginPath();
    c.arc(mx, my, mr, 0, TAU);
    c.clip();
    disc(c, MOON_SHADE, mx + mr * 0.45, my - mr * 0.3, mr * 0.95);
    disc(c, MOON, mx + mr * 0.22, my - mr * 0.18, mr * 0.88);
    oval(c, MOON_CRATER, mx - mr * 0.3, my - mr * 0.1, mr * 0.2, mr * 0.16);
    oval(c, MOON_CRATER, mx + mr * 0.15, my + mr * 0.42, mr * 0.13, mr * 0.1);
    oval(c, MOON_CRATER, mx - mr * 0.1, my - mr * 0.55, mr * 0.09, mr * 0.07);
    dots(c, rnd, mx - mr, my - mr, mr * 2, mr * 2, g.wide ? 200 : 60, ['#A8B4FA', '#4A58B8']);
    c.strokeStyle = MOON_LIT; c.lineWidth = Math.max(1.5, mr * 0.09); c.beginPath();
    c.arc(mx, my, mr - c.lineWidth / 2, Math.PI * 0.62, Math.PI * 1.05);
    c.stroke();
    c.restore();
    ringArc(0, Math.PI, 1, lw, MOON_RING);
    ringArc(0, Math.PI, 1.14, Math.max(1, lw * 0.6), MOON_SHADE);
    block(c, MOON_LIT, Math.round(mx - mr * 1.2), Math.round(my + mr * 0.5), Math.max(2, mr * 0.12), Math.max(2, mr * 0.12));

    // The far city: pale slabs against the glow, then the near one in front of it, darker.
    const slab = (b: Tower, col: string, top: string) => {
      block(c, col, b.x, ct.base - b.h, b.w, b.h);
      block(c, top, b.x, ct.base - b.h, b.w, 1);
      block(c, top, b.x, ct.base - b.h, 1, Math.min(b.h, 26 * u));
      dots(c, rnd, b.x, ct.base - b.h + 2, b.w, b.h - 2, Math.round(b.w * b.h * 0.05), col === NEAR ? ['#080B24', '#1E2660'] : ['#141A48', '#2C3680']);
      // A stepped crown on some, so the skyline is not a row of boxes.
      if (hh(b.i, 21) < 0.45 && b.w > 12) {
        const cw = Math.round(b.w * (0.4 + hh(b.i, 22) * 0.3));
        const chh = Math.round((4 + hh(b.i, 23) * 7) * u);
        block(c, col, b.x + Math.round((b.w - cw) / 2), ct.base - b.h - chh, cw, chh);
        block(c, top, b.x + Math.round((b.w - cw) / 2), ct.base - b.h - chh, cw, 1);
      }
    };
    for (const b of ct.far) {
      slab(b, FAR, FAR_TOP);
      for (let ro = 0; ro < b.h - 6; ro += 6) {
        for (let co = 3; co < b.w - 3; co += 5) {
          const v = hh(b.i * 50 + ro, co);
          if (v < 0.17) block(c, v < 0.02 ? WARM : ICE, b.x + co, ct.base - b.h + 4 + ro, 2, 2);
        }
      }
    }
    // Masts, and a gas-holder dome to break the line.
    c.fillStyle = FAR; c.beginPath();
    for (const pip of ct.pips) c.rect(pip.x, pip.y, 1, ct.base - pip.y - 6);
    c.fill();
    const dx = ox + ow * 0.2;
    c.fillStyle = FAR; c.beginPath();
    c.arc(dx, ct.base - 4 * u, 18 * u, Math.PI, TAU);
    c.fill();
    block(c, FAR_TOP, Math.round(dx - 18 * u), ct.base - 4 * u - 1, 36 * u, 1);
    const reflect: Array<{ x: number; col: string; a: number }> = [];
    for (const b of ct.near) {
      slab(b, NEAR, NEAR_TOP);
      for (let ro = 4; ro < b.h - 4; ro += 5) {
        for (let co = 3; co < b.w - 3; co += 4) {
          const v = hh(b.i * 50 + ro, co + 3);
          if (v < 0.3) {
            const col = v < 0.05 ? WARM : v < 0.2 ? ICE : '#4A5AB8';
            block(c, col, b.x + co, ct.base - b.h + ro, 2, 2);
            if (col !== '#4A5AB8') reflect.push({ x: b.x + co, col, a: v });
          }
        }
      }
    }

    // The platform: wet paving with the city smeared into it.
    block(c, PLAT, ox, edge, ow, oy1 - edge);
    block(c, PLAT_HI, ox, edge + 2, ow, 1);
    for (let x = ox + 10; x < ox1; x += Math.round(26 * u)) block(c, PLAT_LO, x, edge + 5, 1, oy1 - edge);
    block(c, PLAT_LO, ox, edge + Math.round((oy1 - edge) * 0.5), ow, 1);
    dots(c, rnd, ox, edge, ow, oy1 - edge, g.wide ? 500 : 160, ['#0E1236', '#2C3680']);
    const pd = oy1 - edge - 4;
    for (const r of reflect) {
      c.globalAlpha = r.col === ICE ? 0.4 : 0.55;
      block(c, r.col, r.x, edge + 3, 1, 2 + (pd - 3) * (0.25 + 0.75 * ((r.a * 97) % 1)));
    }
    c.globalAlpha = 0.28;
    for (let i = 0; i < (g.wide ? 18 : 8); i += 1) block(c, i % 2 ? '#D0705A' : '#F0A860', ox + rnd() * ow, edge + 3, 1 + Math.floor(rnd() * 2), 3 + rnd() * pd);
    c.globalAlpha = 1;
    // The guideway the train floats over, with a thread of light along it.
    block(c, UNDER, ox, edge - 4, ow, 4);
    block(c, ICE, ox, edge - 4, ow, 1);
    c.restore();
  },

  layout(w, h, rnd) {
    const g = geo(w, h);
    const drops: Drop[] = Array.from({ length: Math.round(g.ow / 4.5) }, (_, i) => ({
      x: g.ox + rnd() * (g.ow + 60),
      y: g.oy + rnd() * g.oh,
      len: 6 + rnd() * 11,
      v: 250 + rnd() * 230,
      a: 0.22 + rnd() * 0.3,
      near: i % 2 === 0,
    }));
    const craft: Craft[] = [
      { x: g.ox + g.ow * 0.4, y: g.oy + g.oh * 0.12, v: -7 },
      { x: g.ox + g.ow * 0.78, y: g.oy + g.oh * 0.27, v: 11 },
    ];
    const beads: Bead[] = Array.from({ length: g.wide ? 40 : 24 }, () => ({
      x: g.ox + 4 + rnd() * (g.ow - 8), y: g.oy + 4 + rnd() * (g.oh - 8), r: (1.1 + rnd() * rnd() * 3) * Math.max(0.85, g.u), gone: false,
    }));
    const runs: Run[] = Array.from({ length: g.wide ? 10 : 5 }, (_, i) => {
      const y = g.oy + 8 + rnd() * g.oh * 0.75;
      return { x: g.ox + g.ow * ((i + 0.3 + rnd() * 0.4) / (g.wide ? 10 : 5)), y0: y - 20 - rnd() * 50, y, ph: rnd() * TAU, vmax: 15 + rnd() * 10, r: 2.2 + rnd() * 1, dead: -1 };
    });
    return { g, drops, craft, splashes: [], beads, runs };
  },

  // ── Out there, every frame: sky craft, pips, rain, the train ──
  draw(f, s) {
    const { ctx: c, t, dt, moving } = f;
    const g = s.g;
    const { ox, oy, ow, oh, ox1, oy1, edge } = g;
    const x = trainX(f, g);
    const rect = (col: string, px: number, py: number, rw: number, rh: number, a = 1) => {
      c.globalAlpha = a;
      c.fillStyle = col;
      c.fillRect(Math.round(px), Math.round(py), Math.round(rw), Math.round(rh));
    };
    c.save(); c.beginPath();
    c.rect(ox, oy, ow, oh);
    c.clip();

    // Two lights crossing the sky, each with a short tail.
    for (const cr of s.craft) {
      if (moving) {
        cr.x += cr.v * dt;
        if (cr.x < ox - 20) cr.x = ox1 + 20;
        if (cr.x > ox1 + 20) cr.x = ox - 20;
      }
      rect(ICE, cr.x - Math.sign(cr.v) * 9, cr.y, 9, 1, 0.3);
      rect(LAMP, cr.x, cr.y, 2, 2, 0.95);
      rect(PIP, cr.x - Math.sign(cr.v) * 4, cr.y + 2, 1, 1, 0.9);
    }
    // Red pips on the masts, each breathing on its own beat.
    for (const pip of city(g).pips) {
      if (moving && ((t / 1500 + pip.i * 0.37) % 1) > 0.72) continue;
      rect(PIP, pip.x - 1, pip.y - 1, 3, 3, 0.9);
    }
    c.globalAlpha = 1;

    const rain = (near: boolean) => {
      c.lineWidth = near ? 1.2 : 1;
      for (const d of s.drops) {
        if (d.near !== near) continue;
        if (moving) {
          d.y += d.v * dt;
          d.x -= d.v * dt * 0.18;
          if (d.y > (near ? edge + 5 + ((d.len * 7) % (oy1 - edge - 5)) : edge)) {
            if (near && s.splashes.length < 40 && d.y < oy1) s.splashes.push({ x: d.x, y: d.y, born: t });
            d.y = oy - d.len;
            d.x = ox + f.rnd() * (ow + 60);
          }
        }
        c.strokeStyle = `rgba(${RAIN}, ${near ? d.a * 0.8 : d.a * 0.4})`;
        c.beginPath();
        c.moveTo(d.x, d.y);
        c.lineTo(d.x + d.len * 0.18, d.y - d.len);
        c.stroke();
      }
    };
    rain(false);

    /** A maglev: one long low body, a curved nose, a bright band of windows with people waiting in them. */
    if (f.visitor.phase !== 'away') {
      const carH = Math.round(oh * (g.wide ? 0.19 : 0.24));
      const gap = Math.max(3, Math.round(carH * 0.12));
      const carY = edge - 4 - gap - carH;
      const bandY = carY + Math.round(carH * 0.26);
      const bandH = Math.max(3, Math.round(carH * 0.36));
      const sk = Math.max(2, Math.round(carH * 0.2));
      if (x + g.nose > ox - 4 && x < ox1 + 4) {
        c.globalAlpha = 1;
        c.fillStyle = BODY; c.beginPath();
        c.moveTo(x, carY + carH);
        c.bezierCurveTo(x + g.nose * 0.12, carY + carH * 0.62, x + g.nose * 0.45, carY + carH * 0.04, x + g.nose, carY);
        c.lineTo(x + g.nose, carY + carH);
        c.closePath(); c.fill();
        c.strokeStyle = BODY_LIT; c.lineWidth = 1; c.beginPath();
        c.moveTo(x + 1, carY + carH - 1);
        c.bezierCurveTo(x + g.nose * 0.12, carY + carH * 0.62, x + g.nose * 0.45, carY + carH * 0.06, x + g.nose, carY + 0.5);
        c.stroke();
        c.fillStyle = LAMP; c.beginPath();
        c.moveTo(x + g.nose * 0.3, bandY + bandH);
        c.quadraticCurveTo(x + g.nose * 0.4, bandY + bandH * 0.1, x + g.nose * 0.7, bandY);
        c.lineTo(x + g.nose, bandY);
        c.lineTo(x + g.nose, bandY + bandH);
        c.closePath(); c.fill();
        rect('#FFFFFF', x + 2, carY + carH - 4, Math.max(4, carH * 0.2), 2);
        // The light thrown ahead along the platform's wet surface.
        rect(LAMP, x - 22, edge + 5, 22, 2, 0.16);
      }
      for (let ci = 0; ci < 3; ci += 1) {
        const cx = x + g.nose + ci * (g.car + 2);
        if (cx > ox1 || cx + g.car < ox) continue;
        rect(BODY, cx, carY, g.car, carH);
        rect(BODY_LIT, cx, carY, g.car, 1);
        rect(BODY_LO, cx, carY + carH - sk, g.car, sk);
        rect(BODY_LIT, cx + g.car * 0.3, carY - 2, g.car * 0.3, 2);
        rect(LAMP, cx + 5, bandY, g.car - 10, bandH, 0.97);
        rect(ICE, cx + 5, bandY + bandH - 1, g.car - 10, 1, 0.9);
        const nW = Math.max(3, Math.round((g.car - 10) / (g.wide ? 40 : 30)));
        const pw = (g.car - 10) / nW;
        for (let m = 1; m < nW; m += 1) rect(BODY, cx + 5 + m * pw - 1, bandY, 2, bandH);
        if (bandH >= 6) {
          for (let m = 0; m < nW; m += 1) {
            if (hh(ci * 9 + m, 40) < 0.42) {
              const px = cx + 5 + (m + 0.5) * pw;
              oval(c, BODY, px, bandY + bandH * 0.42, 2.2, 2.6);
              rect(BODY, px - 3.6, bandY + bandH * 0.62, 7.2, bandH * 0.4);
            }
          }
        }
        c.globalAlpha = 1;
        rect(UNDER, cx + 3, carY + carH, g.car - 6, gap - 1);
        rect(ICE, cx + 4, carY + carH + gap - 1, g.car - 8, 1, 0.7);
        // Smeared on the wet platform below.
        rect(LAMP, cx + 5, edge + 5, g.car - 10, oy1 - edge - 6, 0.09);
        for (let m = cx + 9; m < cx + g.car - 8; m += 13) rect(LAMP, m, edge + 5, 2, Math.min(oy1 - edge - 6, 12), 0.22);
      }
      c.globalAlpha = 1;
    }
    // The yellow line you stand behind: the one use of the accent.
    rect(YELLOW, ox, edge, ow, 2, 1);
    rect(YELLOW, ox, edge + 6, ow, 1, 0.2);

    // A platform lamp stands nearest of all: its pole, its head, a flat pale cone.
    const lampX = Math.round(ox + ow * (g.wide ? 0.33 : 0.3));
    const lampY = oy + Math.round(oh * 0.34);
    c.globalAlpha = 0.06;
    c.fillStyle = LAMP; c.beginPath();
    c.moveTo(lampX - 7, lampY + 3);
    c.lineTo(lampX + 7, lampY + 3);
    c.lineTo(lampX + 40, edge);
    c.lineTo(lampX - 40, edge);
    c.closePath(); c.fill();
    rect('#232C6A', lampX - 1, lampY, 2, oy1 - lampY);
    rect(LAMP, lampX - 9, lampY, 18, 2);
    rect(LAMP, lampX - 14, edge + 5, 28, oy1 - edge - 6, 0.05);
    c.globalAlpha = 1;

    rain(true);
    s.splashes = s.splashes.filter((sp) => t - sp.born < 220);
    for (const sp of s.splashes) {
      const age = (t - sp.born) / 220;
      rect(`rgb(${RAIN})`, sp.x - 2 - age * 2, sp.y, 4 + age * 4, 1, 0.34 * (1 - age));
    }
    c.globalAlpha = 1;
    c.restore();
  },

  // ── The room, painted once on a clear sheet; the opening is left clear ──
  front(p) {
    const { ctx: c, w, h, rnd } = p;
    const g = geo(w, h);
    const { ox, oy, ow, oh, ox1, oy1, u, fw, bt, tb, tf, tb2, tl, yb } = g;

    // The wall: navy panelling in tall recessed rectangles, a chair rail, beadboard below; cut around the opening.
    c.save(); c.beginPath();
    c.rect(0, 0, w, h);
    c.roundRect(ox, oy, ow, oh, g.r);
    c.clip('evenodd');
    block(c, WALL[0]!, 0, 0, w, h);
    const mold = Math.round(7 * u);
    const pw = Math.round((g.wide ? 92 : 74) * u);
    for (let x = 0; x < w; x += pw) {
      const x0 = x + 7;
      const pwid = Math.min(pw - 7, w - x0);
      block(c, WALL_DK, x, mold, 7, g.rail - mold);
      block(c, WALL_HI, x + 6, mold, 1, g.rail - mold);
      block(c, WALL[1]!, x0, mold + 4, pwid, g.rail - mold - 8);
      block(c, WALL_HI, x0, mold + 4, pwid, 1);
      block(c, WALL_HI, x0, mold + 4, 1, g.rail - mold - 8);
      block(c, WALL_LO, x0, g.rail - 5, pwid, 1);
      block(c, WALL_LO, x0 + pwid - 1, mold + 4, 1, g.rail - mold - 8);
      const ix = x0 + 8, iy = mold + 14, iw = pwid - 16, ih = g.rail - mold - 28;
      if (iw > 6) {
        block(c, WALL[0]!, ix, iy, iw, ih);
        block(c, WALL_LO, ix, iy, iw, 1);
        block(c, WALL_LO, ix, iy, 1, ih);
        block(c, WALL_HI, ix, iy + ih - 1, iw, 1);
        block(c, WALL_HI, ix + iw - 1, iy, 1, ih);
      }
    }
    // The cornice and the chair rail.
    block(c, WALL[2]!, 0, 0, w, mold);
    block(c, WALL_HI, 0, mold - 2, w, 1);
    block(c, WALL_LO, 0, mold, w, 2);
    block(c, WALL_HI, 0, g.rail - 3, w, 7);
    block(c, '#2C3680', 0, g.rail - 3, w, 1);
    block(c, WALL_LO, 0, g.rail + 3, w, 2);
    for (let x = 12; x < w; x += 24) disc(c, '#0C1030', x, g.rail, 1.2);
    // Beadboard below the rail: tall slats and their seams.
    const slat = Math.round(11 * u);
    for (let x = 0, i = 0; x < w; x += slat, i += 1) {
      block(c, WALL[i % 3]!, x, g.rail + 5, slat, h);
      block(c, WALL_LO, x, g.rail + 5, 1, h);
      block(c, WALL_HI, x + 1, g.rail + 5, 1, h);
    }
    dots(c, rnd, 0, 0, w, h, Math.round(w * h * 0.03), [WALL_LO, WALL_DK, '#161C48', WALL_HI]);
    c.restore();

    // A plum leather bench behind the table, on the left, quilted and buttoned.
    if (g.wide) {
      const bx1 = Math.round(g.seatX);
      const bt0 = Math.round(h * 0.64);
      c.save(); c.beginPath();
      c.roundRect(-8, bt0, bx1 + 8, h, [16, 16, 0, 0]);
      c.clip();
      block(c, LEATHER, 0, bt0, bx1, h);
      block(c, LEATHER_LO, 0, bt0 + (h - bt0) * 0.5, bx1, h);
      block(c, LEATHER_HI, 0, bt0, bx1, 2);
      block(c, LEATHER_MID, 0, bt0 + 2, bx1, 3);
      const sp = 19 * u;
      c.strokeStyle = LEATHER_LO; c.lineWidth = 1; c.beginPath();
      for (let x = -sp; x < bx1 + sp * 4; x += sp) {
        c.moveTo(x, bt0); c.lineTo(x + (h - bt0), h);
        c.moveTo(x + (h - bt0), bt0); c.lineTo(x, h);
      }
      c.stroke();
      for (let x = sp / 2; x < bx1; x += sp) {
        for (let y = bt0 + sp * 0.75; y < h; y += sp) { disc(c, '#10070A', x, y, 1.6); block(c, '#5A3A40', x - 1, y - 1, 1, 1); }
      }
      dots(c, rnd, 0, bt0, bx1, h - bt0, 900, ['#4E2E34', '#1B0E13', '#3A2128']);
      c.restore();
    }

    // The pane's frame: slim blue metal, gently rounded, with a bead of lit edge on the glass side.
    ring(c, g, fw, METAL_DK);
    ring(c, g, fw - 1.5, METAL);
    ring(c, g, Math.max(2, fw * 0.4), METAL_HI);
    ring(c, g, Math.max(1, fw * 0.18), METAL_LO);
    c.save(); c.beginPath();
    c.roundRect(ox - fw, oy - fw, ow + 2 * fw, oh + 2 * fw, g.r + fw);
    c.roundRect(ox, oy, ow, oh, g.r);
    c.clip('evenodd');
    dots(c, rnd, ox - fw, oy - fw, ow + 2 * fw, oh + 2 * fw, g.wide ? 500 : 250, [METAL_DK, '#5A68A8']);
    c.restore();
    // One bar across, a quarter of the way down, and one up.
    const { hb, vb } = g;
    block(c, METAL_DK, ox, hb - 1, ow, bt + 2);
    block(c, METAL, ox, hb, ow, bt);
    block(c, METAL_HI, ox, hb, ow, 1);
    block(c, METAL_LO, ox, hb + bt - 1, ow, 1);
    block(c, METAL_DK, vb - 1, oy, bt + 2, oh);
    block(c, METAL, vb, oy, bt, oh);
    block(c, METAL_HI, vb, oy, 1, oh);
    block(c, METAL_LO, vb + bt - 1, oy, 1, oh);
    block(c, METAL_DK, vb - 3, hb - 3, bt + 6, bt + 6);
    block(c, METAL, vb - 2, hb - 2, bt + 4, bt + 4);
    block(c, METAL_HI, vb - 2, hb - 2, bt + 4, 1);
    screw(c, vb + bt / 2, hb + bt / 2, Math.max(1.2, bt * 0.28));
    for (const sx of [ox + ow * 0.18, ox + ow * 0.4, ox + ow * 0.78, ox + ow * 0.94]) screw(c, sx, hb + bt / 2, Math.max(1, bt * 0.24));
    for (const sy of [oy + oh * 0.55, oy + oh * 0.88]) screw(c, vb + bt / 2, sy, Math.max(1, bt * 0.24));
    for (const [px, py] of [[ox - fw / 2, oy + oh * 0.5], [ox1 + fw / 2, oy + oh * 0.5], [ox + ow / 2, oy - fw / 2], [ox + ow / 2, oy1 + fw / 2]] as const) screw(c, px, py, Math.max(1.2, fw * 0.26));

    // A round amber wall lamp between the bench and the pane (wide only).
    if (g.wide) {
      const lx = Math.round(w * 0.35);
      const ly = Math.round(h * 0.68);
      const gr = 10 * u;
      c.globalAlpha = 0.1;
      oval(c, WARM, lx, ly, gr * 4.2, gr * 3.4);
      c.globalAlpha = 0.1;
      oval(c, WARM, lx, ly, gr * 2.6, gr * 2.2);
      c.globalAlpha = 1;
      block(c, METAL_DK, lx - 20 * u, ly - 4 * u, 6 * u, 24 * u);
      block(c, METAL, lx - 19 * u, ly - 4 * u, 4 * u, 24 * u);
      block(c, METAL_HI, lx - 19 * u, ly - 4 * u, 1, 24 * u);
      c.strokeStyle = METAL_DK; c.lineWidth = 4 * u; c.beginPath();
      c.moveTo(lx - 16 * u, ly + 14 * u); c.quadraticCurveTo(lx - 6 * u, ly + 18 * u, lx, ly + gr * 1.2); c.stroke();
      c.strokeStyle = METAL; c.lineWidth = 2.4 * u; c.beginPath();
      c.moveTo(lx - 16 * u, ly + 14 * u); c.quadraticCurveTo(lx - 6 * u, ly + 18 * u, lx, ly + gr * 1.2); c.stroke();
      screw(c, lx - 17 * u, ly, 1.4 * u); screw(c, lx - 17 * u, ly + 16 * u, 1.4 * u);
      poly(c, METAL_DK, [lx - 6 * u, ly + gr * 0.7, lx + 6 * u, ly + gr * 0.7, lx + 4 * u, ly + gr * 1.5, lx - 4 * u, ly + gr * 1.5]);
      disc(c, '#FFD8A0', lx, ly, gr);
      c.save(); c.beginPath();
      c.arc(lx, ly, gr, 0, TAU);
      c.clip();
      disc(c, WARM, lx + gr * 0.5, ly + gr * 0.4, gr * 0.95);
      disc(c, WARM_HI, lx - gr * 0.12, ly - gr * 0.1, gr * 0.8);
      disc(c, '#FFF6DA', lx - gr * 0.2, ly - gr * 0.2, gr * 0.42);
      c.restore();
      c.strokeStyle = '#E8902C'; c.lineWidth = 1; c.beginPath();
      c.arc(lx, ly, gr, 0, TAU);
      c.stroke();
      block(c, '#FFFFFF', Math.round(lx - gr * 0.62), Math.round(ly - gr * 0.55), 2, 3);
    }

    // Curtains, teal and tied back, at both sides (one, on the left, on a phone).
    const cTop = g.wide ? 8 : oy - fw - 5;
    const cBot = tb + 2;
    if (g.wide) {
      curtain(c, rnd, u, ox - 20 * u, 1, 46 * u, cTop, cBot, oy + (tb - oy) * 0.62);
      curtain(c, rnd, u, ox1 + 20 * u, -1, 46 * u, cTop, cBot, oy + (tb - oy) * 0.6);
    } else {
      curtain(c, rnd, u, ox - 4, 1, 42 * u, cTop, cBot, oy + (tb - oy) * 0.55);
    }

    // The table: a wooden top with a rounded front edge and a lit bevel; the room's warm light pools on it.
    const r = Math.round(16 * u);
    const bevel = tb2 - tf;
    const slab = (bottom: number) => {
      c.beginPath();
      c.moveTo(tl + r, tb);
      c.lineTo(w + 6, tb);
      c.lineTo(w + 6, bottom);
      c.lineTo(tl + r, bottom);
      c.quadraticCurveTo(tl - 2 * u, bottom, tl, bottom - 8 * u);
      c.closePath();
    };
    c.save();
    slab(tb2);
    c.clip();
    block(c, WOOD_MID, 0, tf, w, bevel);
    block(c, '#7A5230', 0, tf, w, Math.max(2, bevel * 0.4));
    block(c, '#B88A58', 0, tf, w, 1);
    block(c, WOOD, 0, tb2 - 2, w, 2);
    dots(c, rnd, tl, tf, w, bevel, 200, ['#8A5E36', '#3A2A1E']);
    c.restore();
    c.save();
    slab(tf);
    c.clip();
    block(c, WOOD, 0, tb, w, tf - tb);
    grain(c, rnd, tl, tb, w, tf - tb, g.wide ? 46 : 24, WOOD_DK, 140);
    grain(c, rnd, tl, tb, w, tf - tb, g.wide ? 26 : 14, '#4A3422', 120);
    dots(c, rnd, tl, tb, w, tf - tb, g.wide ? 1700 : 900, [WOOD_DK, '#2E2016', '#4A3422']);
    // Cold blue from the pane lies in slanted bars along the back of the table.
    const td = tf - tb;
    for (const fx of [0.1, 0.34, 0.66]) {
      const bx = ox + ow * fx;
      poly(c, '#2A2B5C', [bx, tb, bx + 38 * u, tb, bx + 24 * u, tb + td * 0.42, bx - 14 * u, tb + td * 0.42]);
    }
    // The lantern's pool of warm light: four stepped bands, stippled where one meets the next.
    const px = g.lampX;
    const rxs = [150, 100, 62, 34];
    rxs.forEach((rx, i) => {
      const rxx = rx * u * (g.wide ? 1 : 0.78);
      const ryy = td * (0.95 - i * 0.17);
      c.fillStyle = POOL[i]!; c.beginPath();
      c.ellipse(px, yb + 2, rxx, ryy, 0, 0, TAU);
      c.fill();
      if (i < 3) dots(c, rnd, px - rxx * 1.25, yb + 2 - ryy * 1.25, rxx * 2.5, ryy * 2.5, 900, [POOL[i]!], 1, (qx, qy) => {
        const d = Math.hypot((qx - px) / rxx, (qy - yb - 2) / ryy);
        return d > 1 && d < 1.22 ? ((1.22 - d) / 0.22) * 0.8 : 0;
      });
    });
    block(c, '#E8B070', px - 130 * u, tf, 260 * u, 1);
    // A small warm pool under the wall lamp, and under the cup.
    if (g.wide) { oval(c, '#4A3424', w * 0.35, yb - 4, 46 * u, td * 0.5); oval(c, '#6E4A2C', w * 0.35, yb - 4, 24 * u, td * 0.3); }
    oval(c, WOOD_MID, g.cupX, yb + 2, 24 * u, 5 * u);
    c.restore();
    c.save(); c.beginPath();
    c.rect(tl + 6 * u, tb2, w, h);
    c.clip();
    block(c, METAL_DK, 0, tb2, w, h - tb2);
    block(c, '#05071A', 0, tb2, w, Math.max(2, (h - tb2) * 0.5));
    dots(c, rnd, tl, tb2, w, h - tb2, 200, ['#10143A', '#1A2052']);
    c.restore();

    // A furled umbrella lies on the table's left end, handle towards the bench (wide only).
    if (g.wide) {
      const ux = w * 0.235;
      const uy = yb + 4;
      c.save(); c.translate(ux, uy); c.rotate(-0.1);
      oval(c, '#120B08', 4 * u, 4 * u, 52 * u, 3.4 * u);
      c.strokeStyle = '#8A5E36'; c.lineWidth = 3.2 * u; c.beginPath();
      c.arc(-46 * u, -5 * u, 5.5 * u, Math.PI * 0.5, Math.PI * 1.9, false); c.stroke();
      block(c, '#C88A4A', -42 * u, -2.2 * u, 12 * u, 2.4 * u);
      c.fillStyle = '#2C3E96'; c.beginPath();
      c.moveTo(-30 * u, -3.5 * u);
      c.quadraticCurveTo(-8 * u, -9 * u, 14 * u, -8 * u);
      c.quadraticCurveTo(34 * u, -7 * u, 48 * u, -1 * u);
      c.quadraticCurveTo(34 * u, 4 * u, 12 * u, 4.5 * u);
      c.quadraticCurveTo(-12 * u, 5 * u, -30 * u, 1 * u);
      c.fill();
      c.strokeStyle = '#4A5AB8'; c.lineWidth = 1.6 * u; c.beginPath();
      c.moveTo(-26 * u, -3 * u); c.quadraticCurveTo(-6 * u, -7.4 * u, 14 * u, -6.6 * u); c.quadraticCurveTo(32 * u, -5.6 * u, 44 * u, -1.4 * u); c.stroke();
      c.strokeStyle = '#141C6A'; c.lineWidth = 1; c.beginPath();
      for (const fx of [-18, -6, 8, 22, 34]) { c.moveTo(fx * u, -7 * u + Math.abs(fx) * 0.05); c.lineTo((fx - 3) * u, 3.4 * u); }
      c.stroke();
      block(c, '#C88A4A', 4 * u, -8.6 * u, 3 * u, 12.6 * u);
      block(c, '#C88A4A', 47 * u, -1.8 * u, 4 * u, 1.8 * u);
      c.restore();
    }

    // On the table, painted once: a lidded cup with a sleeve, and a folded ticket.
    const q = u * (g.wide ? 1.05 : 0.92);
    cup(c, g.cupX, yb, q);
    ticket(c, g.tickX, yb - 1, q);
  },

  // ── Alive: rain on the glass, the lantern and its signal, steam, the day's tickets ──
  over(f, s) {
    const { ctx: c, t, dt, moving } = f;
    const g = s.g;
    const { ox, oy, ow, oh, oy1, u, yb } = g;
    const { phase, k } = f.visitor;
    const sec = t / 1000;

    // How much of the train's light there is to catch, and where it stands.
    const lit = phase === 'stopped' ? 1 : phase === 'arriving' ? smooth((k - 0.2) / 0.8) : phase === 'departing' ? 1 - smooth(k / 0.6) : phase === 'passing' ? Math.sin(k * Math.PI) * 0.7 : 0;
    const tx = trainX(f, g);
    const gust = phase === 'departing' ? Math.sin(clamp01(k / 0.6) * Math.PI) : 0;

    c.save(); c.beginPath();
    c.roundRect(ox + 1, oy + 1, ow - 2, oh - 2, Math.max(1, g.r - 1));
    c.clip();

    // Beads standing on the pane; the ones near the train catch its light.
    for (const b of s.beads) {
      if (b.gone) continue;
      const d = b.x < tx ? tx - b.x : b.x > tx + g.trainLen ? b.x - (tx + g.trainLen) : 0;
      const br = lit * clamp01(1 - d / (ow * 0.3)) * (b.y > oy + oh * 0.3 ? 1 : 0.5);
      c.globalAlpha = 0.2 + br * 0.4;
      disc(c, br > 0.2 ? LAMP : `rgb(${RAIN})`, b.x, b.y, b.r + br * 0.4);
      c.globalAlpha = 0.65;
      c.strokeStyle = '#0A0D2A'; c.lineWidth = 1; c.beginPath();
      c.arc(b.x, b.y, b.r, 0.2, 2.9);
      c.stroke();
      c.globalAlpha = 0.45 + br * 0.5;
      block(c, '#FFFFFF', Math.round(b.x - b.r * 0.5), Math.round(b.y - b.r * 0.6), b.r > 2 ? 2 : 1, b.r > 2 ? 2 : 1);
      if (br > 0.3) block(c, LAMP, Math.round(b.x + b.r * 0.2), Math.round(b.y + b.r * 0.3), 1, 1);
    }

    // Runs: they gather, slide in fits and starts, and vanish at the bottom bar, leaving a pale track.
    for (const r of s.runs) {
      if (moving) {
        if (r.dead >= 0) {
          r.dead += dt;
          if (r.dead > 3.6) {
            r.x = ox + 6 + f.rnd() * (ow - 12);
            r.y = oy + 3;
            r.y0 = r.y;
            r.dead = -1;
            r.r = 2 + f.rnd() * 1;
            for (const b of s.beads) if (b.gone) { b.gone = false; b.x = ox + 4 + f.rnd() * (ow - 8); b.y = oy + 4 + f.rnd() * (oh - 8); }
          }
        } else {
          r.ph += dt * 1.5;
          const pulse = Math.max(0, Math.sin(r.ph)) ** 2;
          const prev = r.y;
          r.y += r.vmax * pulse * (1 + gust * 5) * dt;
          for (const b of s.beads) {
            if (!b.gone && Math.abs(b.x - r.x) < 5 && b.y > prev - 1 && b.y < r.y + 2) { b.gone = true; r.r = Math.min(3.4, r.r + 0.4); }
          }
          if (r.y >= oy1 - 2) { r.y = oy1 - 2; r.dead = 0; }
        }
      }
      const cap = (g.wide ? 60 : 30) * (1 + gust * 1.6);
      const bottom = r.dead >= 0 ? oy1 : r.y;
      const top = Math.max(r.y0, bottom - cap);
      c.globalAlpha = r.dead >= 0 ? 0.42 * (1 - r.dead / 3.6) : 0.45 + gust * 0.25;
      c.strokeStyle = `rgb(${RAIN})`; c.lineWidth = 1.5; c.beginPath();
      for (let y = top; y <= bottom; y += 4) {
        const wx = r.x + Math.sin(y * 0.19 + r.x) * 0.7;
        if (y === top) c.moveTo(wx, y); else c.lineTo(wx, y);
      }
      c.stroke();
      if (r.dead < 0) {
        c.globalAlpha = 0.9;
        oval(c, `rgb(${RAIN})`, r.x, r.y, r.r, r.r * 1.35);
        c.globalAlpha = 0.5;
        c.strokeStyle = '#080B24'; c.lineWidth = 1; c.beginPath();
        c.ellipse(r.x, r.y, r.r, r.r * 1.35, 0, 0.3, 2.8);
        c.stroke();
        c.globalAlpha = 1;
        block(c, '#FFFFFF', Math.round(r.x - r.r * 0.55), Math.round(r.y - r.r * 0.7), 2, 2);
      }
    }
    // The room, faintly, in the glass: the lantern's warm ghost.
    c.globalAlpha = 0.1;
    oval(c, WARM, g.lampX, oy + oh * 0.62, 15 * u, 17 * u);
    c.globalAlpha = 0.08;
    oval(c, WARM_HI, g.lampX, oy + oh * 0.62, 6 * u, 8 * u);
    c.globalAlpha = 1;
    c.restore();

    // The day's tickets, fanned flat beside the cup, one punched hole each.
    const n = Math.min(12, Math.max(0, f.done));
    const fq = u * (g.wide ? 1.05 : 0.92);
    const L = 38 * fq;
    const th = 9 * fq;
    const step = Math.min(0.3, 2.2 / Math.max(1, n));
    for (let i = 0; i < n; i += 1) {
      const a = -1.1 + i * step;
      c.save();
      c.translate(g.fanX, yb + 3);
      c.scale(1, 0.62);
      c.rotate(a);
      c.fillStyle = '#120B08'; c.fillRect(1, -th / 2 + 2.5, L, th);
      c.fillStyle = '#7A6A4A'; c.fillRect(-1, -th / 2 - 1, L + 2, th + 2);
      c.fillStyle = i % 2 ? CREAM : '#F2E8D2'; c.fillRect(0, -th / 2, L, th);
      c.fillStyle = CREAM_LO; c.fillRect(L * 0.88, -th / 2, L * 0.12, th);
      c.fillStyle = TEAL; c.fillRect(L * 0.08, -th / 2, 2, th);
      c.fillStyle = '#B8AA90'; c.fillRect(0, th / 2 - 1, L, 1);
      c.restore();
      const hx = g.fanX + Math.cos(a) * L * 0.62;
      const hy = yb + 3 + Math.sin(a) * L * 0.62 * 0.62;
      oval(c, WOOD, hx, hy, 1.7, 1.1);
    }

    // Steam: a thin thread from the cup's lid, rising in a slow S.
    const lidY = yb - 34 * fq;
    for (let j = 0; j < 2; j += 1) {
      const ph = (sec / 3.2 + j * 0.5) % 1;
      const y = lidY - ph * 26 * fq;
      const x = g.cupX + (j - 0.5) * 4 * fq + Math.sin(ph * 5 + j * 2) * 2.4 * fq;
      c.globalAlpha = Math.sin(ph * Math.PI) * 0.6;
      c.strokeStyle = LAMP; c.lineWidth = 1.5; c.beginPath();
      c.moveTo(x, y);
      c.quadraticCurveTo(x + 3 * fq, y - 4 * fq, x, y - 8 * fq);
      c.quadraticCurveTo(x - 3 * fq, y - 12 * fq, x + 1 * fq, y - 16 * fq);
      c.stroke();
    }
    c.globalAlpha = 1;

    // The lantern, its signal on top.
    lantern(c, g.lampX, yb + 4, u * (g.wide ? 1.3 : 1.0), t, f.caution, moving);
  },
});
