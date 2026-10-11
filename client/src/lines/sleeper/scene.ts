/**
 * The Timber Line: a corner of a log-cabin sleeper at dusk, seen from a seat
 * at the table. Behind the dark room the window is on fire: bands of burnt
 * orange to pale gold, clouds of autumn leaves as stipple, cold blue shadows
 * at the foot of white birch trunks that slide slowly left.
 *
 * The cabin around it (all painted once): horizontal log walls with grain and
 * knots, a square timber frame with a deep sill that catches the glow, grey-blue
 * curtains tied back at both sides, a sagging wire of fairy lights, a hanging
 * plant, a red quilted bench, a shelf of books, and a dark slab table with a
 * rounded corner, a cream mug and a closed book. On a phone: the log wall with
 * the words on top, the opening below it, one curtain, and the table.
 *
 * The visitor is the halt the train pulls into, a dark silhouette against the
 * glow with one honey lamp lit (the only use of the accent), a nameboard with
 * nothing on it, a clock and a pale platform edge. Arriving, it slides in from
 * the right and rests in the right half of the opening while the birches ease
 * to a stop; departing, it slides away left and they pick up; passing, one goes
 * by. Away: only the birches and falling leaves.
 *
 * Alive on the table: fairy bulbs (one or two twinkle at a time), steam from the
 * mug, one acorn per quest finished today (up to 12), a brass signal lamp at the
 * far right (green; amber with stragglers), and the sparrow (turns its head when
 * idle, settles low and round while the halt waits, hops once as it leaves).
 * One trailing leaf of the plant sways. Flat colour only.
 */

import { defineScene } from '../types';

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

const SKY_BANDS = ['#3A1508', '#7A2B0C', '#C4521A', '#F0872A', '#FFB648', '#FFD98A'];
const SKY_CUTS = [0, 0.13, 0.27, 0.42, 0.56, 0.69, 1];
const FOLIAGE = [['#5A1E0A', '#C4521A', '#F0872A'], ['#7A2B0C', '#E06A22', '#FFB648'], ['#C4521A', '#F0872A', '#FFD98A']];
const BIRCH = '#F4EAD8', BIRCH_SHADE = '#D9CDB8', BIRCH_COLD = '#B7C4D6', BIRCH_COLD_SHADE = '#8FA3BE', NOTCH = '#3A2A20';
const BLUES = ['#2B4A6E', '#3E6C96', '#5A93BE'];
const GROUND = '#2B4A6E', GROUND_LOW = '#1E3552';
const LEAF_COL = ['#FFB648', '#F0872A', '#C4521A'];
const LOG = '#2A1C14', LOG_LO = '#221610', LOG_SEAM = '#120B08', LOG_DARK = '#1C130E';
const TIMBER = '#4A3222', TIMBER_HI = '#6B4A32', TIMBER_LO = '#2E1E14', SILL_TOP = '#9A5A2C', SILL_GLOW = '#F0872A';
const CURTAIN: [string, string][] = [['#3C4A5C', '#52647A'], ['#52647A', '#6C809A'], ['#2A3442', '#3C4A5C'], ['#52647A', '#6C809A'], ['#3C4A5C', '#52647A']];
const CURTAIN_CREASE = '#1B232E', ROPE = '#9A7A48';
const GREENS = ['#3F5A2A', '#5E7F38', '#2B3F1C'], POT = '#8A3E1C';
const RED = '#7A2318', RED_LO = '#5A1710', RED_HI = '#A83A2A';
const TABLE = '#34241A', TABLE_DK = '#241812', TABLE_EDGE = '#8A6A52', TABLE_EDGE_LO = '#5E4332';
const CREAM = '#E8DCC6', CREAM_LO = '#C9BCA4', BULB = '#FFE2A0', BULB_HI = '#FFFBE8';
/** The one accent: the halt's lamp shade. */
const HONEY = '#F2C14E';
const GREEN = '#7FD99A', AMBER = '#F58A3C';
const BRASS = '#B8863A', BRASS_LO = '#8A6226', BRASS_HI = '#E0B060';
const NUT = '#B07C44', NUT_HI = '#D1A06A', NUT_CAP = '#5B3A22';
const SIL = '#150A04', SIL_WALL = '#33190B';

const smooth = (x: number) => {
  const c = Math.max(0, Math.min(1, x));
  return c * c * (3 - 2 * c);
};
const easeIn = (k: number) => k ** 1.7;
const easeOut = (k: number) => 1 - (1 - k) ** 1.7;

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
/** Fields of 1 px dots; `keep` thins them out where it returns less than 1. */
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

interface Geo {
  W: number; H: number; wide: boolean; u: number; s: number;
  ox: number; oy: number; ow: number; oh: number; ox1: number; oy1: number; gy: number;
  sideW: number; lintel: number;
  tl: number; tb: number; tf: number; tb2: number; by: number;
  lampX: number; acorn0: number; acornStep: number; acornR: number;
  sparrowX: number; mugX: number; bookX: number; mw: number;
  wire: { x0: number; y0: number; cx: number; cy: number; x1: number; y1: number }[];
}

/** Every position in the scene, from the canvas size alone, so all four layers agree. */
function geo(W: number, H: number): Geo {
  const wide = W >= 560;
  const u = Math.max(0.8, Math.min(1.2, H / 256));
  const ox = Math.round(wide ? W * 0.44 : W * 0.03);
  const ow = Math.round(wide ? W * 0.525 : W * 0.94);
  const oy = Math.round(wide ? H * 0.17 : H * 0.49);
  const oh = Math.round(wide ? H * 0.53 : H * 0.3);
  const sideW = Math.round((wide ? 12 : 4) * u);
  const lintel = Math.round((wide ? 15 : 6) * u);
  const tb = Math.round(wide ? H * 0.77 : H * 0.835);
  const tf = Math.round(wide ? H * 0.905 : H * 0.94);
  const tb2 = Math.round(tf + H * (wide ? 0.045 : 0.035));
  const by = tb + (tf - tb) * 0.66;
  const ox1 = ox + ow;
  const lampX = wide ? W * 0.945 : W - 24;
  const acornStep = (wide ? 15 : 11.5) * u;
  const hookY = wide ? 5 * u : H * 0.43;
  const sag = wide ? 14 * u : 8;
  const xm = ox + ow / 2;
  const xl = wide ? ox - 14 * u : ox + 2;
  const xr = wide ? ox1 + 14 * u : ox1 + 4;
  const yl = hookY + 2 * u;
  const ym = hookY - (wide ? 2 * u : 1);
  const seg = (x0: number, y0: number, x1: number, y1: number) => ({ x0, y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 + 2 * sag, x1, y1 });
  return {
    W, H, wide, u, s: oh / 120,
    ox, oy, ow, oh, ox1, oy1: oy + oh, gy: oy + Math.round(oh * 0.8), sideW, lintel,
    tl: Math.round(wide ? W * 0.11 : W * 0.02), tb, tf, tb2, by,
    lampX, acorn0: lampX - (wide ? 25 : 22) * u, acornStep, acornR: (wide ? 5 : 4.5) * u,
    sparrowX: wide ? W * 0.345 : W * 0.115, mugX: wide ? W * 0.625 : W * 0.4, bookX: wide ? W * 0.525 : W * 0.255, mw: (wide ? 25 : 20) * u,
    wire: [seg(xl, yl, xm, ym), seg(xm, ym, xr, yl)],
  };
}

/** The fairy bulbs hang along the wire. */
function bulbsOn(g: Geo): { x: number; y: number }[] {
  const per = g.wide ? 7 : 5;
  const out: { x: number; y: number }[] = [];
  for (const sgm of g.wire) {
    for (let j = 1; j <= per; j += 1) {
      const t = j / (per + 1);
      const a = (1 - t) * (1 - t);
      const b = 2 * (1 - t) * t;
      const d = t * t;
      out.push({ x: a * sgm.x0 + b * sgm.cx + d * sgm.x1, y: a * sgm.y0 + b * sgm.cy + d * sgm.y1 });
    }
  }
  return out;
}

/** The hanging plant's leaves: [x, y, angle, size, colour]. Only on a wide window. */
function plantLeaves(g: Geo): number[][] {
  if (!g.wide) return [];
  const px = g.ox1 + 11 * g.u;
  const potY = g.H * 0.2;
  const out: number[][] = [];
  for (let i = 0; i < 9; i += 1) {
    const a = -Math.PI * (0.05 + (i / 8) * 0.9);
    out.push([px + Math.cos(a) * 9 * g.u, potY - 1 + Math.sin(a) * 5 * g.u, a - Math.PI / 2 + (i % 2 ? 0.4 : -0.4), 6.5 * g.u, i % 3]);
  }
  const vines = [[-8, 0.34], [2, 0.44], [10, 0.3]];
  vines.forEach(([dx, len], vi) => {
    const n = 8;
    for (let j = 0; j < n; j += 1) {
      const f = j / (n - 1);
      const x = px + dx! * g.u + Math.sin(f * 3 + vi) * 4 * g.u;
      const y = potY + 5 * g.u + f * len! * g.H;
      out.push([x, y, (j % 2 ? 1 : -1) * 1.1 + Math.sin(f * 4) * 0.3, (6 - f * 1.5) * g.u, (j + vi) % 3]);
    }
  });
  return out;
}

const leafShape = (c: Ctx, col: string, x: number, y: number, a: number, s: number) => {
  c.save();
  c.translate(x, y);
  c.rotate(a);
  c.fillStyle = col; c.beginPath();
  c.moveTo(0, 0);
  c.quadraticCurveTo(s * 0.9, -s * 0.45, 0, -s * 1.7);
  c.quadraticCurveTo(-s * 0.9, -s * 0.45, 0, 0);
  c.fill();
  c.restore();
};

interface Notch { f: number; side: number; len: number }
interface Birch { x: number; w: number; lean: number; bow: number; notches: Notch[] }
interface Leaf { x: number; y: number; v: number; ph: number; sway: number; s: number; c: number }
interface State {
  g: Geo;
  far: Birch[];
  near: Birch[];
  leaves: Leaf[];
  bulbs: { x: number; y: number }[];
  period: number;
  scroll: number;
  speed: number;
}

function trunk(c: Ctx, b: Birch, x: number, top: number, bottom: number, wd: number, notchH: number) {
  const hw = wd / 2;
  const hgt = bottom - top;
  const lean = b.lean * hgt;
  const midY = (top + bottom) / 2;
  c.fillStyle = BIRCH; c.beginPath();
  c.moveTo(x - hw, bottom);
  c.quadraticCurveTo(x - hw * 0.85 + b.bow + lean / 2, midY, x - hw * 0.8 + lean, top);
  c.lineTo(x + hw * 0.8 + lean, top);
  c.quadraticCurveTo(x + hw * 0.85 + b.bow + lean / 2, midY, x + hw, bottom);
  c.fill();
  // Inside the trunk: a shaded side, a foot in cold blue shade, and the dark notches.
  c.save(); c.clip();
  block(c, BIRCH_SHADE, x + hw * 0.25 + lean / 2, top, hw, hgt);
  block(c, BIRCH_COLD, x - hw - 1, bottom - hgt * 0.13, wd + 2, hgt * 0.13);
  block(c, BIRCH_COLD_SHADE, x + hw * 0.25, bottom - hgt * 0.13, hw, hgt * 0.13);
  c.fillStyle = NOTCH; c.beginPath();
  for (const n of b.notches) {
    const y = bottom - n.f * hgt;
    const cx = x + lean * n.f + 2 * n.f * (1 - n.f) * b.bow;
    const len = wd * n.len;
    c.rect(n.side < 0 ? cx - hw * 0.8 : cx + hw * 0.8 - len, y, len, notchH);
    if (wd > 9) c.rect(cx - hw * 0.1, y + notchH * 1.8, len * 0.45, Math.max(1, notchH * 0.6));
  }
  c.fill();
  c.restore();
}

/** Two bulbs of drawn light, a brass cap and a pale 4-point glint when twinkling. */
const bulb = (c: Ctx, x: number, y: number, r: number, twinkle: number) => {
  block(c, '#1A110C', Math.round(x) - 1, Math.round(y) - 1, 2, 2);
  disc(c, '#7A5A30', x, y + r * 0.5, r + 1.6);
  disc(c, BULB, x, y + r * 0.5, r + 0.6 + twinkle * 1.2);
  disc(c, BULB_HI, x, y + r * 0.5, r * 0.45 + twinkle * 0.5);
  if (twinkle > 0.2) {
    const l = 3 + twinkle * 3.5;
    c.fillStyle = BULB;
    c.fillRect(x - l, y + r * 0.5 - 0.5, l * 2, 1);
    c.fillRect(x - 0.5, y + r * 0.5 - l, 1, l * 2);
  }
};

function acorn(c: Ctx, x: number, y: number, r: number) {
  oval(c, '#120B08', x + r * 0.25, y, r * 1.2, r * 0.38);
  const cy = y - r * 1.25;
  oval(c, NUT, x, cy, r, r * 1.3);
  block(c, NUT_HI, x - r * 0.55, cy - r * 0.1, Math.max(1, r * 0.3), r * 0.95);
  c.fillStyle = NUT_CAP; c.beginPath();
  c.ellipse(x, cy - r * 0.55, r * 1.1, r * 0.92, 0, Math.PI, TAU);
  c.fill();
  block(c, '#7A5230', x - r * 0.6, cy - r * 1.25, 1, 1);
  block(c, '#7A5230', x + r * 0.1, cy - r * 1.05, 1, 1);
  block(c, '#7A5230', x - r * 0.15, cy - r * 0.75, 1, 1);
  block(c, NUT_CAP, x - 0.6, cy - r * 1.95, Math.max(1.4, r * 0.3), 2.2);
}

export default defineScene<State>({
  sky: LOG_DARK,
  timing: { arriving: 3800, departing: 3400, passing: 2200 },

  // ── Far away, painted once: the glow ──
  back(p) {
    const { ctx: c, w, h, rnd } = p;
    const g = geo(w, h);
    const { ox, oy, ow, oh, s } = g;
    c.save(); c.beginPath();
    c.rect(ox, oy, ow, oh);
    c.clip();
    // Bands of flat colour, dithered a few pixels at each step.
    SKY_BANDS.forEach((col, i) => block(c, col, ox, oy + SKY_CUTS[i]! * oh, ow, (SKY_CUTS[i + 1]! - SKY_CUTS[i]!) * oh + 1));
    for (let i = 1; i < SKY_BANDS.length; i += 1) {
      const y = oy + SKY_CUTS[i]! * oh;
      dots(c, rnd, ox, y - 5 * s, ow, 5 * s, ow * 0.5, [SKY_BANDS[i]!], 1);
      dots(c, rnd, ox, y, ow, 5 * s, ow * 0.5, [SKY_BANDS[i - 1]!], 1);
    }
    // Autumn leaves as vertical painterly streaks and a few clumps, lighter lower down, then stipple.
    const sx = g.wide ? 1 : 1.5;
    const tone = (f: number) => FOLIAGE[f < 0.18 ? 0 : f < 0.38 ? 1 : 2]!;
    for (let i = 0; i < (g.wide ? 230 : 130); i += 1) {
      const f = rnd() ** 1.25 * 0.66;
      const set = tone(f);
      const x = ox + rnd() * ow;
      const y = oy + f * oh - rnd() * 8 * s;
      const wd = (2 + rnd() * 6) * sx;
      const len = (8 + rnd() * 34) * s;
      block(c, set[Math.floor(rnd() * 3)]!, x, y, wd, len);
      block(c, set[2]!, x + wd * 0.55, y + len * 0.1, Math.max(1, wd * 0.3), len * 0.55);
    }
    for (let i = 0; i < (g.wide ? 30 : 18); i += 1) {
      const f = rnd() * 0.5;
      const set = tone(f);
      const cx = ox + rnd() * ow;
      const cy = oy + f * oh;
      const rx = (6 + rnd() * 11) * s * sx;
      const a = Math.floor(rnd() * 3);
      oval(c, set[a]!, cx, cy, rx, rx * 0.75);
      oval(c, set[(a + 1) % 3]!, cx + rx * 0.5, cy - rx * 0.3, rx * 0.55, rx * 0.45);
      dots(c, rnd, cx - rx, cy - rx, rx * 2, rx * 2, 22, [set[2]!, set[0]!], 1);
    }
    dots(c, rnd, ox, oy, ow, oh * 0.66, g.wide ? 2300 : 900, ['#F0872A', '#FFB648', '#C4521A', '#7A2B0C', '#FFD98A'], 1, (_x, y) => 0.12 + 0.88 * (1 - (y - oy) / (oh * 0.66)));
    dots(c, rnd, ox, oy, ow, oh * 0.5, g.wide ? 300 : 110, ['#FFD98A', '#FFB648', '#C4521A'], 2, (_x, y) => 0.8 - (y - oy) / (oh * 0.6));
    // Cold blue shade pooled low between the trunk bases: wide, irregular, rounded patches, never towers.
    const gy = g.gy;
    for (let x = ox - 10; x < ox + ow; ) {
      const cw = (8 + rnd() * 20) * sx;
      const hh = oh * (0.03 + rnd() ** 2 * 0.15);
      const r = rnd();
      const col = r < 0.4 ? BLUES[1]! : r < 0.7 ? BLUES[2]! : r < 0.88 ? BLUES[0]! : '#7DB8E6';
      oval(c, col, x + cw, gy + 2, cw, hh);
      oval(c, BLUES[1 + Math.floor(rnd() * 2)]!, x + cw * (0.6 + rnd() * 0.8), gy + 2, cw * 0.5, hh * (1.2 + rnd() * 0.5));
      x += cw * (0.9 + rnd() * 1.2);
    }
    dots(c, rnd, ox, gy - oh * 0.4, ow, oh * 0.4, g.wide ? 500 : 200, ['#6FA3CF', '#2B4A6E', '#F0872A'], 1, (_x, y) => (y - (gy - oh * 0.4)) / (oh * 0.4));
    // The ground: blue shade with leaf litter.
    block(c, GROUND, ox, gy, ow, oh);
    block(c, GROUND_LOW, ox, gy + (oy + oh - gy) * 0.5, ow, oh);
    block(c, '#3E6C96', ox, gy, ow, Math.max(1, s * 1.4));
    dots(c, rnd, ox, gy, ow, oy + oh - gy, g.wide ? 620 : 240, ['#F0872A', '#C4521A', '#FFB648', '#5A93BE', '#1E3552'], 1);
    // A far line of pale thin trunks, still.
    for (let x = ox + rnd() * 20; x < ox + ow; x += (14 + rnd() * 24) * s * (g.wide ? 1 : 1.4)) {
      const wd = (2 + rnd() * 2.2) * Math.max(0.9, s * 0.9);
      const top = oy + oh * (0.04 + rnd() * 0.12);
      block(c, BIRCH_SHADE, x, top, wd, gy - top + 1);
      block(c, BIRCH, x, top, wd * 0.55, gy - top + 1);
      c.fillStyle = NOTCH; c.beginPath();
      for (let n = 0; n < 4; n += 1) c.rect(x, top + rnd() * (gy - top), wd * (0.4 + rnd() * 0.6), 1);
      c.fill();
    }
    c.restore();
  },

  layout(w, h, rnd) {
    const g = geo(w, h);
    const period = g.ow + 140;
    const t = g.wide ? 1 : 0.8;
    const grow = (near: boolean): Birch[] => {
      const out: Birch[] = [];
      let x = rnd() * 40;
      while (x < period) {
        const wd = near ? (13 + rnd() * 8) * t : (5.5 + rnd() * 3.5) * t;
        const notches: Notch[] = [];
        const n = (near ? 6 : 3) + Math.floor(rnd() * 3);
        for (let i = 0; i < n; i += 1) notches.push({ f: 0.08 + rnd() * 0.86, side: rnd() < 0.5 ? -1 : 1, len: 0.3 + rnd() * 0.5 });
        out.push({ x, w: wd, lean: (rnd() - 0.5) * 0.04, bow: (rnd() - 0.5) * 2.4, notches });
        x += (near ? 78 + rnd() * 120 : 44 + rnd() * 70) * t;
      }
      return out;
    };
    const leaves: Leaf[] = Array.from({ length: g.wide ? 9 : 5 }, () => ({
      x: g.ox + rnd() * g.ow,
      y: g.oy + rnd() * g.oh * 0.8,
      v: 7 + rnd() * 6,
      ph: rnd() * 6.28,
      sway: 4 + rnd() * 6,
      s: (g.wide ? 3.4 : 2.8) * (0.8 + rnd() * 0.4),
      c: Math.floor(rnd() * 3),
    }));
    return { g, far: grow(false), near: grow(true), leaves, bulbs: bulbsOn(g), period, scroll: 0, speed: 1 };
  },

  // ── Out there, every frame: birches, the halt, leaves ──
  draw(f, s) {
    const { ctx: c, dt, moving } = f;
    const { phase, k } = f.visitor;
    const g = s.g;
    const { ox, oy, ow, oh, gy } = g;

    if (moving) {
      const target =
        phase === 'stopped' ? 0
        : phase === 'arriving' ? Math.max(0, 1 - k * 1.5)
        : phase === 'departing' ? Math.min(1, Math.max(0, (k - 0.1) * 1.5))
        : 1;
      s.speed += (target - s.speed) * Math.min(1, dt * 2.2);
      s.scroll += s.speed * dt;
    }

    c.save(); c.beginPath();
    c.rect(ox, oy, ow, oh);
    c.clip();
    const wrap = (x: number) => ((x % s.period) + s.period) % s.period - 70;
    const bottom = oy + oh;
    for (const b of s.far) trunk(c, b, ox + wrap(b.x - s.scroll * 6), oy - 4, bottom, b.w, 1.3);
    for (const b of s.near) trunk(c, b, ox + wrap(b.x - s.scroll * 18), oy - 4, bottom, b.w, g.wide ? 2.2 : 1.6);

    // ── The halt: the visitor, a dark silhouette against the glow ──
    const hs = oh / 123;
    const hl = Math.round(ow * (g.wide ? 0.46 : 0.44));
    const restX = Math.round(ox + ow * 0.4);
    const inX = ox + ow + 24;
    const outX = ox - hl - 24;
    let hx: number | null = null;
    if (phase === 'arriving') hx = inX + (restX - inX) * easeOut(k);
    else if (phase === 'stopped') hx = restX;
    else if (phase === 'departing') hx = restX + (outX - restX) * easeIn(k);
    else if (phase === 'passing') hx = inX + (outX - inX) * k;
    if (hx !== null && hx < ox + ow + 30 && hx + hl > ox - 30) {
      const x0 = Math.round(hx);
      const roof = gy - Math.round(oh * 0.5);
      const under = roof + Math.round(11 * hs);
      const sx0 = x0 + Math.round(9 * hs);
      const sw = hl - Math.round(18 * hs);
      const sx1 = sx0 + sw;
      const pw = Math.max(2, Math.round(4 * hs));
      const lampX = Math.round(sx0 + sw * 0.3);
      const wain = gy - (gy - under) * 0.36;
      // Platform: a dark face, a pale lit edge, a short ramp at each end.
      block(c, SIL, x0, gy, hl, 8 * hs);
      poly(c, SIL, [x0 - 28 * hs, gy + 8 * hs, x0, gy, x0, gy + 8 * hs]);
      poly(c, SIL, [x0 + hl, gy, x0 + hl + 28 * hs, gy + 8 * hs, x0 + hl, gy + 8 * hs]);
      block(c, BIRCH_SHADE, x0, gy - 1, hl, Math.max(1.5, 2 * hs));
      poly(c, BIRCH_SHADE, [x0 - 28 * hs, gy + 8 * hs - 1, x0, gy - 1, x0, gy + 1, x0 - 28 * hs, gy + 8 * hs]);
      // A plank wainscot with the pool of lamplight on it; above it the glow shows through.
      block(c, SIL_WALL, sx0, wain, sw, gy - wain);
      block(c, SIL, sx0, wain - 1.5, sw, 2.5);
      c.fillStyle = SIL; c.beginPath();
      for (let px = sx0 + 9 * hs; px < sx1; px += 10 * hs) c.rect(Math.round(px), wain, 1, gy - wain);
      c.fill();
      poly(c, '#7A4A14', [lampX - 11 * hs, wain, lampX + 11 * hs, wain, lampX + 24 * hs, gy, lampX - 24 * hs, gy]);
      poly(c, '#A86A1C', [lampX - 5 * hs, wain, lampX + 5 * hs, wain, lampX + 11 * hs, gy, lampX - 11 * hs, gy]);
      // A bench, and a small suitcase.
      const bnx = Math.round(sx0 + sw * 0.5);
      block(c, SIL, bnx, gy - 9 * hs, 46 * hs, 3 * hs);
      block(c, SIL, bnx + 3 * hs, gy - 6 * hs, 2 * hs, 6 * hs);
      block(c, SIL, bnx + 41 * hs, gy - 6 * hs, 2 * hs, 6 * hs);
      c.fillStyle = SIL; c.beginPath();
      c.roundRect(sx1 - 26 * hs, gy - 10 * hs, 12 * hs, 10 * hs, 1.5);
      c.fill();
      block(c, BIRCH_SHADE, sx1 - 22 * hs, gy - 7 * hs, Math.max(1, 3 * hs), Math.max(1, 1.2 * hs));
      // Posts with braces, and the roof: a low arch lit along its top edge.
      for (const px of [sx0 + 2, Math.round(sx0 + sw / 2), sx1 - pw - 2]) {
        block(c, SIL, px, under, pw, gy - under);
        if (px === Math.round(sx0 + sw / 2)) continue;
        const d = px < sx0 + sw / 2 ? 1 : -1;
        const e = px + (d > 0 ? pw : 0);
        poly(c, SIL, [e, under, e + d * 9 * hs, under, e, under + 9 * hs]);
      }
      const rx0 = sx0 - 9 * hs;
      const rx1 = sx1 + 9 * hs;
      const arch = () => {
        c.beginPath();
        c.moveTo(rx0, roof + 8 * hs);
        c.quadraticCurveTo((rx0 + rx1) / 2, roof - 7 * hs, rx1, roof + 8 * hs);
      };
      c.fillStyle = SIL;
      arch();
      c.lineTo(rx1, under + 1);
      c.lineTo(rx0, under + 1);
      c.fill();
      c.strokeStyle = '#E06A22'; c.lineWidth = 1.2;
      arch();
      c.stroke();
      // The nameboard, blank, hung by two chains from the roof.
      const bw = 40 * hs;
      const bx = Math.round(sx0 + sw * 0.7 - bw / 2);
      block(c, SIL, bx + 4 * hs, under, 1, 4 * hs);
      block(c, SIL, bx + bw - 5 * hs, under, 1, 4 * hs);
      block(c, BIRCH_SHADE, bx - 1, under + 4 * hs, bw + 2, 11 * hs);
      block(c, SIL, bx, under + 5 * hs, bw, 9 * hs);
      // A clock: a cream disc, two hands, no numerals.
      const cx = Math.round(sx0 + sw * 0.9) + 0.5;
      const cy = under + 13 * hs;
      block(c, SIL, cx - 0.5, under, 1, 5 * hs);
      disc(c, SIL, cx, cy, 5.6 * hs);
      disc(c, BIRCH, cx, cy, 4.5 * hs);
      c.strokeStyle = SIL; c.lineWidth = 1; c.beginPath();
      c.moveTo(cx, cy - 3.4 * hs);
      c.lineTo(cx, cy);
      c.lineTo(cx + 2.6 * hs, cy + 1.4 * hs);
      c.stroke();
      // The lamp: a chain, a domed shade (the accent), a bulb.
      const shadeY = under + 8 * hs;
      const sr = 9 * hs;
      block(c, SIL, lampX, under, 1, 7 * hs);
      c.fillStyle = HONEY; c.beginPath();
      c.moveTo(lampX - sr, shadeY + 5 * hs);
      c.quadraticCurveTo(lampX - sr, shadeY - 1, lampX + 0.5, shadeY - 2 * hs);
      c.quadraticCurveTo(lampX + sr + 1, shadeY - 1, lampX + sr + 1, shadeY + 5 * hs);
      c.fill();
      block(c, BULB, lampX - 2.5 * hs, shadeY + 5 * hs, 5 * hs, 2.4 * hs);
    }

    // ── Leaves coming down ──
    for (const l of s.leaves) {
      if (moving) {
        l.y += l.v * dt;
        l.ph += dt * 0.9;
        if (l.y > bottom - 4) {
          l.y = oy - 4;
          l.x = ox + f.rnd() * ow;
        }
      }
      c.save();
      c.translate(l.x + Math.sin(l.ph) * l.sway, l.y);
      c.rotate(Math.sin(l.ph * 0.8) * 0.9);
      c.fillStyle = LEAF_COL[l.c]!; c.beginPath();
      c.moveTo(-l.s, 0);
      c.quadraticCurveTo(0, -l.s * 0.75, l.s, 0);
      c.quadraticCurveTo(0, l.s * 0.75, -l.s, 0);
      c.fill();
      c.restore();
    }
    c.restore();
  },

  // ── The cabin, painted once on a clear sheet; the opening is left clear ──
  front(p) {
    const { ctx: c, w, h, rnd } = p;
    const g = geo(w, h);
    const { ox, oy, ow, oh, ox1, u, sideW, lintel, tb, tf, tb2 } = g;
    const ch = Math.round(24 * u);

    // The log wall, cut around the opening.
    c.save(); c.beginPath();
    c.rect(0, 0, w, h);
    c.rect(ox, oy, ow, oh);
    c.clip('evenodd');
    block(c, LOG, 0, 0, w, h);
    const tints = [LOG, '#2D1F16', '#271A12'];
    for (let i = 0, y = 0; y < h; y += ch, i += 1) {
      block(c, tints[i % 3]!, 0, y, w, ch);
      block(c, '#3E2B1F', 0, y + 1, w, 2);
      block(c, '#33231A', 0, y + 3, w, Math.round(ch * 0.2));
      block(c, LOG_LO, 0, y + Math.round(ch * 0.6), w, Math.round(ch * 0.24));
      block(c, LOG_DARK, 0, y + Math.round(ch * 0.82), w, Math.round(ch * 0.1));
      block(c, LOG_SEAM, 0, y + ch - 2, w, 2);
      dots(c, rnd, 0, y + ch * 0.6, w, ch * 0.34, w * 0.7, [LOG_SEAM, LOG_DARK], 1);
      // Where one log ends and the next begins: a butt joint with a lit end-grain cap.
      for (let j = 0; j < 2; j += 1) {
        let jx = rnd() * w;
        if (y < h * 0.64 && jx < w * (g.wide ? 0.46 : 1)) jx = g.wide ? jx + w * 0.45 : -9;
        block(c, LOG_SEAM, jx, y + 2, 2, ch - 3);
        block(c, '#3E2B1F', jx + 2, y + 3, 1, ch - 6);
      }
    }
    dots(c, rnd, 0, 0, w, h, g.wide ? 5200 : 2800, [LOG_SEAM, LOG_DARK, '#33241B', '#3A281C']);
    grain(c, rnd, 0, 0, w, h, g.wide ? 90 : 50, '#1B120C');
    grain(c, rnd, 0, 0, w, h, g.wide ? 40 : 20, '#352519');
    for (let i = 0; i < (g.wide ? 7 : 4); i += 1) {
      let kx = rnd() * w;
      const ky = Math.round(rnd() * (h / ch - 1)) * ch + ch * 0.45;
      if (g.wide && kx < w * 0.45 && ky < h * 0.64) kx += w * 0.46;
      if (!g.wide && ky < h * 0.5) continue;
      oval(c, LOG_DARK, kx, ky, 8 * u, 4.4 * u);
      oval(c, '#3A281C', kx, ky, 5.6 * u, 2.9 * u);
      oval(c, '#17100B', kx, ky, 3.4 * u, 1.6 * u);
    }
    c.restore();

    // A red quilted bench behind the table, on the left, and a shelf of books beside it.
    if (g.wide) {
      const bx1 = Math.round(w * 0.265);
      const bt = Math.round(h * 0.64);
      c.save(); c.beginPath();
      c.roundRect(-8, bt, bx1 + 8, h, [14, 14, 0, 0]);
      c.clip();
      block(c, RED, 0, bt, bx1, h);
      block(c, RED_LO, 0, bt + (h - bt) * 0.55, bx1, h);
      block(c, RED_HI, 0, bt, bx1, 2);
      block(c, '#8E2C1E', 0, bt + 2, bx1, 2);
      c.strokeStyle = RED_LO; c.lineWidth = 1; c.beginPath();
      const sp = 17 * u;
      for (let x = -sp; x < bx1 + sp * 4; x += sp) {
        c.moveTo(x, bt); c.lineTo(x + (h - bt), h);
        c.moveTo(x + (h - bt), bt); c.lineTo(x, h);
      }
      c.stroke();
      for (let x = sp / 2; x < bx1; x += sp) {
        for (let y = bt + sp * 0.75; y < h; y += sp) disc(c, '#3A0E0A', x, y, 1.5);
      }
      dots(c, rnd, 0, bt, bx1, h - bt, 900, ['#8E2C1E', RED_LO, '#6A1C12']);
      c.restore();

      // The shelf: a plank on two brackets, with books standing.
      const sx0 = Math.round(w * 0.285);
      const sx1 = Math.round(w * 0.405);
      const sy = Math.round(h * 0.705);
      let bxx = sx0 + 3;
      const spines = ['#7A2318', '#3F5A2A', '#8A5A2C', '#2B4A6E', '#5A3A28', '#A03424', '#4A3A5C'];
      let si = 0;
      while (bxx < sx1 - 8) {
        const bwid = (4 + rnd() * 3.5) * u;
        const bh = (13 + rnd() * 7) * u;
        const col = spines[si % spines.length]!;
        si += 1;
        block(c, col, bxx, sy - bh, bwid, bh);
        block(c, CREAM_LO, bxx, sy - bh, 1, 1);
        block(c, CREAM, bxx + 0.5, sy - bh * 0.7, bwid - 1, 1);
        block(c, CREAM_LO, bxx + 0.5, sy - bh * 0.3, bwid - 1, 1);
        bxx += bwid + 0.6;
      }
      block(c, TIMBER, sx0 - 2, sy, sx1 - sx0 + 4, 4 * u);
      block(c, TIMBER_HI, sx0 - 2, sy, sx1 - sx0 + 4, 1);
      block(c, TIMBER_LO, sx0 + 4, sy + 4 * u, 3, 8 * u);
      block(c, TIMBER_LO, sx1 - 6, sy + 4 * u, 3, 8 * u);
    }

    // The window frame: a square-cut timber, a lit sill, and the thickness of the wall.
    const fx0 = ox - sideW;
    const fx1 = ox1 + sideW;
    const fy0 = oy - lintel;
    const sillT = Math.round((g.wide ? 8 : 3) * u);
    const sillF = Math.round((g.wide ? 7 : 3) * u);
    const sy1 = oy + oh;
    block(c, TIMBER, fx0 - 3 * u, fy0, fx1 - fx0 + 6 * u, lintel);
    block(c, TIMBER_HI, fx0 - 3 * u, fy0, fx1 - fx0 + 6 * u, 2);
    block(c, TIMBER_LO, fx0 - 3 * u, oy - 3, fx1 - fx0 + 6 * u, 3);
    block(c, TIMBER, fx0, fy0, sideW, oh + lintel + sillT);
    block(c, TIMBER, ox1, fy0, sideW, oh + lintel + sillT);
    block(c, TIMBER_HI, fx0, fy0, 2, oh + lintel);
    block(c, TIMBER_HI, ox1, fy0, 2, oh + lintel);
    block(c, TIMBER_LO, ox - 2, oy, 2, oh);
    block(c, TIMBER_LO, ox1, oy, 2, oh);
    grain(c, rnd, fx0 - 3 * u, fy0, fx1 - fx0 + 6 * u, lintel, 8, '#35241A', 90);
    grain(c, rnd, fx0, fy0, sideW, oh, 6, '#35241A', 20);
    grain(c, rnd, ox1, fy0, sideW, oh, 6, '#35241A', 20);
    dots(c, rnd, fx0 - 3 * u, fy0, fx1 - fx0 + 6 * u, lintel, 160, ['#2E1E14', '#5E412C']);
    // The wall's thickness, seen inside the opening: dark under the lintel, a warm reveal on each side.
    block(c, '#2A1208', ox, oy, ow, Math.max(3, Math.round(4 * u)));
    block(c, '#4A2410', ox, oy, Math.max(2, Math.round(3 * u)), oh);
    block(c, '#6A3A1E', ox1 - Math.max(2, Math.round(3 * u)), oy, Math.max(2, Math.round(3 * u)), oh);
    // The sill: its top face takes the glow; its front is plain timber.
    block(c, SILL_TOP, fx0 - 4 * u, sy1, fx1 - fx0 + 8 * u, sillT);
    block(c, SILL_GLOW, ox, sy1, ow, 1.5);
    dots(c, rnd, fx0 - 4 * u, sy1, fx1 - fx0 + 8 * u, sillT, g.wide ? 220 : 120, ['#C4521A', '#E8883A', '#7A4A24']);
    block(c, TIMBER, fx0 - 4 * u, sy1 + sillT, fx1 - fx0 + 8 * u, sillF);
    block(c, TIMBER_HI, fx0 - 4 * u, sy1 + sillT, fx1 - fx0 + 8 * u, 1);
    block(c, LOG_SEAM, fx0 - 4 * u, sy1 + sillT + sillF, fx1 - fx0 + 8 * u, 1.5);
    // Peg heads in the frame.
    for (const px of [fx0 + sideW / 2, ox1 + sideW / 2]) {
      disc(c, '#1C130E', px, fy0 + lintel * 0.5, Math.max(1.2, u * 1.5));
      disc(c, '#1C130E', px, sy1 - 4 * u, Math.max(1.2, u * 1.5));
    }

    // Curtains: grey-blue, tied back, four or five flat folds.
    const curtain = (xa: number, dir: number, wt: number, top: number, bottom: number, tieY: number) => {
      const wAt = (y: number) => {
        if (y < tieY) return wt * (0.62 + 0.38 * ((tieY - y) / (tieY - top)) ** 1.4);
        return wt * (0.62 + 0.4 * ((y - tieY) / (bottom - tieY)) ** 1.15);
      };
      const n = CURTAIN.length;
      const xs = (i: number, y: number) => xa + dir * wAt(y) * (i / n);
      const step = Math.max(2, Math.round(3 * u));
      const ys: number[] = [];
      for (let y = top; y < bottom; y += step) ys.push(y);
      ys.push(bottom);
      const edge = (i: number, off = 0) => ys.forEach((y, j) => (j ? c.lineTo(xs(i, y) + off, y) : c.moveTo(xs(i, y) + off, y)));
      const back = (i: number) => { for (let j = ys.length - 1; j >= 0; j -= 1) c.lineTo(xs(i, ys[j]!), ys[j]!); };
      for (let i = 0; i < n; i += 1) {
        for (let band = 0; band < 2; band += 1) {
          const a0 = i + band * 0.58;
          const a1 = band === 0 ? i + 0.58 : i + 1;
          c.fillStyle = CURTAIN[i]![band]!; c.beginPath();
          edge(a0);
          back(a1);
          c.fill();
        }
      }
      // Creases, a warm rim where the glow touches the inner edge, cloth stipple.
      c.strokeStyle = CURTAIN_CREASE; c.lineWidth = 1; c.beginPath();
      for (let i = 1; i < n; i += 1) edge(i);
      c.stroke();
      c.strokeStyle = '#E8883A'; c.lineWidth = Math.max(1.5, 2 * u); c.beginPath();
      edge(n, -dir);
      c.stroke();
      c.save(); c.beginPath();
      edge(0);
      back(n);
      c.clip();
      const bx = Math.min(xs(0, bottom), xs(n, bottom)) - 4;
      dots(c, rnd, bx, top, wt * 1.4, bottom - top, wt * 4, ['#6C809A', '#2A3442', '#1B232E']);
      c.restore();
      // The tie: a rope band with a small bead and a hanging tassel.
      const t0 = xs(0, tieY);
      const t1 = xs(n, tieY);
      block(c, ROPE, Math.min(t0, t1) - 1, tieY - 1.5, Math.abs(t1 - t0) + 2, 3 * u);
      block(c, '#6A5030', Math.min(t0, t1) - 1, tieY + 2 * u, Math.abs(t1 - t0) + 2, 1);
      disc(c, BRASS_HI, t1 - dir * 2, tieY, 2 * u);
      block(c, ROPE, t1 - dir * 2 - 0.5, tieY + 2 * u, 1.4, 5 * u);
      // The rod.
      block(c, BRASS_LO, Math.min(xs(0, top), xs(n, top)) - 3, top - 2, wt + 6, 3);
      block(c, BRASS_HI, Math.min(xs(0, top), xs(n, top)) - 3, top - 2, wt + 6, 1);
    };
    const ctop = fy0 + 2;
    const cbot = tb + 2;
    if (g.wide) {
      curtain(ox - 20 * u, 1, 52 * u, ctop, cbot, oy + (tb - oy) * 0.62);
      curtain(ox1 + 20 * u, -1, 52 * u, ctop, cbot, oy + (tb - oy) * 0.6);
    } else {
      curtain(ox1 + 9, -1, 46 * u, ctop, cbot, oy + (tb - oy) * 0.55);
    }

    // The wire for the fairy lights, hooked at both ends and in the middle.
    c.strokeStyle = '#5A4636'; c.lineWidth = 1.2; c.beginPath();
    for (const sg of g.wire) {
      c.moveTo(sg.x0, sg.y0);
      c.quadraticCurveTo(sg.cx, sg.cy, sg.x1, sg.y1);
    }
    c.stroke();
    for (const [hk, hy] of [[g.wire[0]!.x0, g.wire[0]!.y0], [g.wire[0]!.x1, g.wire[0]!.y1], [g.wire[1]!.x1, g.wire[1]!.y1]] as const) {
      block(c, BRASS, hk - 1.5, hy - 2.5, 3, 4);
      block(c, BRASS_HI, hk - 1.5, hy - 2.5, 3, 1);
    }

    // The hanging plant, top right: a pot on cords, leaves spilling and trailing.
    if (g.wide) {
      const px = ox1 + 2 * u;
      const potY = h * 0.2;
      c.strokeStyle = '#C9B48A'; c.lineWidth = 1; c.beginPath();
      c.moveTo(px - 7 * u, potY);
      c.lineTo(px, 0);
      c.lineTo(px + 7 * u, potY);
      c.moveTo(px - 3.5 * u, potY + 1);
      c.lineTo(px, 0);
      c.lineTo(px + 3.5 * u, potY + 1);
      c.stroke();
      const leaves = plantLeaves(g);
      leaves.forEach((l, i) => {
        if (i === leaves.length - 1) return;
        leafShape(c, GREENS[l[4]!]!, l[0]!, l[1]!, l[2]!, l[3]!);
      });
      poly(c, POT, [px - 8.5 * u, potY, px + 8.5 * u, potY, px + 6 * u, potY + 12 * u, px - 6 * u, potY + 12 * u]);
      block(c, '#B0562A', px - 9.5 * u, potY - 2, 19 * u, 3.5 * u);
      block(c, '#5A2610', px + 2 * u, potY + 3.5 * u, 4.5 * u, 8.5 * u);
      dots(c, rnd, px - 7 * u, potY + 4 * u, 14 * u, 8 * u, 20, ['#B0562A', '#5A2610']);
    }

    // The table: a dark slab with a rounded front corner, a lit bevelled edge, its own warm reflection.
    const tl = g.tl;
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
    // The bevelled front edge first, then the top over it.
    c.save();
    slab(tb2);
    c.clip();
    block(c, TABLE_EDGE_LO, 0, tf, w, bevel);
    block(c, TABLE_EDGE, 0, tf, w, Math.max(2, bevel * 0.4));
    block(c, '#B58E6E', 0, tf, w, 1);
    dots(c, rnd, tl, tf, w, bevel, 160, ['#A07A5C', '#4A3626']);
    c.restore();
    c.save();
    slab(tf);
    c.clip();
    block(c, TABLE, 0, tb, w, tf - tb);
    grain(c, rnd, tl, tb, w, tf - tb, g.wide ? 44 : 24, TABLE_DK, 140);
    grain(c, rnd, tl, tb, w, tf - tb, g.wide ? 26 : 14, '#46321F', 120);
    dots(c, rnd, tl, tb, w, tf - tb, g.wide ? 1500 : 900, [TABLE_DK, '#3E2B1E', '#2B1D14']);
    const gx0 = ox + ow * 0.08;
    const gx1 = ox + ow * 0.93;
    const gd = (tf - tb) * 0.6;
    poly(c, '#5A3520', [gx0, tb, gx1, tb, gx1 - ow * 0.14, tb + gd, gx0 + ow * 0.12, tb + gd]);
    poly(c, '#7E4A28', [gx0 + ow * 0.1, tb, gx1 - ow * 0.1, tb, gx1 - ow * 0.2, tb + gd * 0.5, gx0 + ow * 0.2, tb + gd * 0.5]);
    poly(c, '#A8642C', [gx0 + ow * 0.22, tb, gx1 - ow * 0.25, tb, gx1 - ow * 0.3, tb + gd * 0.22, gx0 + ow * 0.3, tb + gd * 0.22]);
    dots(c, rnd, gx0, tb, gx1 - gx0, gd, g.wide ? 260 : 120, ['#9A5A2C', '#E8883A', '#6A3E22']);
    c.restore();
    c.save(); c.beginPath();
    c.rect(tl + 6 * u, tb2, w, h);
    c.clip();
    block(c, TABLE_DK, 0, tb2, w, h - tb2);
    block(c, '#0E0805', 0, tb2, w, Math.max(2, (h - tb2) * 0.45));
    dots(c, rnd, tl, tb2, w, h - tb2, 200, ['#1A110C', '#2E1F16']);
    c.restore();

    // On the table, painted once: a closed book and a cream mug.
    const by = g.by;
    const bkx = g.bookX;
    const bu = u * (g.wide ? 1 : 0.9);
    oval(c, '#120B08', bkx + 2 * bu, by + 1, 24 * bu, 4 * bu);
    poly(c, '#5A3A28', [bkx - 20 * bu, by - 9 * bu, bkx + 19 * bu, by - 9 * bu, bkx + 23 * bu, by - 2 * bu, bkx - 18 * bu, by - 2 * bu]);
    poly(c, '#7A5236', [bkx - 17 * bu, by - 8 * bu, bkx + 17 * bu, by - 8 * bu, bkx + 20 * bu, by - 3 * bu, bkx - 15 * bu, by - 3 * bu]);
    poly(c, '#5A3A28', [bkx - 14 * bu, by - 7 * bu, bkx + 16 * bu, by - 7 * bu, bkx + 18 * bu, by - 4 * bu, bkx - 13 * bu, by - 4 * bu]);
    block(c, '#3A281C', bkx - 20 * bu, by - 2 * bu, 41 * bu, 1.8 * bu);
    block(c, CREAM, bkx - 18 * bu, by - 0.2 * bu, 40 * bu, 2.4 * bu);
    block(c, CREAM_LO, bkx - 18 * bu, by + 1.2 * bu, 40 * bu, 1);
    block(c, '#3A281C', bkx - 19 * bu, by + 2.6 * bu, 40 * bu, 1.5 * bu);
    block(c, RED, bkx + 8 * bu, by + 0.8 * bu, 1.8 * bu, 5 * bu);
    const mx = g.mugX;
    const mw = g.mw;
    const mh = mw * 0.95;
    oval(c, '#120B08', mx + 2, by + 1, mw * 0.78, 3.4 * bu);
    oval(c, TABLE_DK, mx, by, mw * 0.72, 3 * bu);
    c.fillStyle = CREAM; c.beginPath();
    c.moveTo(mx - mw / 2, by - mh);
    c.lineTo(mx + mw / 2, by - mh);
    c.lineTo(mx + mw * 0.44, by - 3 * bu);
    c.quadraticCurveTo(mx + mw * 0.4, by + 1, mx + mw * 0.2, by + 1);
    c.lineTo(mx - mw * 0.2, by + 1);
    c.quadraticCurveTo(mx - mw * 0.4, by + 1, mx - mw * 0.44, by - 3 * bu);
    c.fill();
    c.save(); c.clip();
    block(c, CREAM_LO, mx + mw * 0.14, by - mh, mw, mh + 2);
    c.restore();
    block(c, '#F8F0E0', mx - mw * 0.38, by - mh + 3 * bu, 2, mh * 0.55);
    block(c, '#52647A', mx - mw / 2, by - mh * 0.62, mw, 2.4 * bu);
    c.strokeStyle = CREAM; c.lineWidth = 2.6 * bu; c.beginPath();
    c.arc(mx + mw / 2 + 1.5 * bu, by - mh * 0.55, mw * 0.24, -Math.PI * 0.5, Math.PI * 0.5);
    c.stroke();
    c.strokeStyle = CREAM_LO; c.lineWidth = 1; c.beginPath();
    c.arc(mx + mw / 2 + 1.5 * bu, by - mh * 0.55, mw * 0.24 + 1.3 * bu, -Math.PI * 0.1, Math.PI * 0.5);
    c.stroke();
    oval(c, CREAM, mx, by - mh, mw / 2, 3.2 * bu);
    oval(c, '#3A2418', mx, by - mh + 0.6, mw / 2 - 2, 2.3 * bu);
    block(c, '#6A4630', mx - mw * 0.2, by - mh + 0.4 * bu, mw * 0.2, 1);
  },

  // ── Alive: bulbs, steam, acorns, the signal, the sparrow ──
  over(f, s) {
    const { ctx: c, t, moving } = f;
    const { phase, k } = f.visitor;
    const g = s.g;
    const { u, by } = g;
    const sec = t / 1000;

    // Fairy bulbs: all warm; one or two flare at a time.
    s.bulbs.forEach((b, i) => {
      const ph = (sec / 4.5 + i * 0.173) % 1;
      const tw = ph < 0.14 ? Math.sin((ph / 0.14) * Math.PI) : 0;
      bulb(c, b.x, b.y, g.wide ? 2.4 : 2, tw);
    });

    // One trailing leaf of the plant sways a pixel.
    const pl = plantLeaves(g);
    const last = pl[pl.length - 1];
    if (last) leafShape(c, GREENS[last[4]!]!, last[0]! + (moving ? Math.sin(sec * 1.3) : 0.4), last[1]!, last[2]! + (moving ? Math.sin(sec * 1.1) * 0.08 : 0), last[3]!);

    // Steam: three short curls rising and thinning over about three seconds.
    const mugTop = by - g.mw * 0.95 - 3 * u;
    for (let j = 0; j < 3; j += 1) {
      const ph = (sec / 3 + j / 3) % 1;
      const y = mugTop - ph * 20 * u;
      const x = g.mugX + (j - 1) * g.mw * 0.24 + Math.sin(ph * 5 + j * 2) * 2.2 * u;
      c.globalAlpha = Math.sin(ph * Math.PI) * 0.7;
      c.strokeStyle = '#F4EAD8'; c.lineWidth = 1.5 * u; c.beginPath();
      c.moveTo(x, y);
      c.quadraticCurveTo(x + 3 * u, y - 3.5 * u, x, y - 7 * u);
      c.quadraticCurveTo(x - 3 * u, y - 10 * u, x + 1 * u, y - 13 * u);
      c.stroke();
    }
    c.globalAlpha = 1;

    // One acorn per quest finished today, running left from the signal.
    for (let i = 0; i < Math.min(12, f.done); i += 1) acorn(c, g.acorn0 - i * g.acornStep, by + 1, g.acornR);

    // The signal: a brass lamp with a coloured glass, green or amber.
    const glass = f.caution ? AMBER : GREEN;
    const glassHi = f.caution ? '#FFC98A' : '#B6F0C6';
    const lx = g.lampX;
    const q = u * (g.wide ? 1.05 : 0.95);
    c.globalAlpha = 0.3;
    oval(c, glass, lx, by + 1.5, 18 * q, 3.6 * q);
    c.globalAlpha = 1;
    oval(c, '#120B08', lx + 1, by + 1, 9 * q, 2.4 * q);
    oval(c, BRASS_LO, lx, by, 8.5 * q, 2.6 * q);
    poly(c, BRASS, [lx - 8 * q, by - 1, lx + 8 * q, by - 1, lx + 5.5 * q, by - 6 * q, lx - 5.5 * q, by - 6 * q]);
    block(c, BRASS_HI, lx - 7 * q, by - 3 * q, 2 * q, 2 * q);
    c.fillStyle = glass; c.beginPath();
    c.roundRect(lx - 5.5 * q, by - 22 * q, 11 * q, 16 * q, 3 * q);
    c.fill();
    block(c, glassHi, lx - 4.5 * q, by - 20.5 * q, 2 * q, 12 * q);
    block(c, '#FFFBE8', lx - 1.2 * q, by - 17 * q, 2.4 * q, 8 * q);
    block(c, BRASS_LO, lx - 5.5 * q, by - 22 * q, 1.2, 16 * q);
    block(c, BRASS_LO, lx + 4.3 * q, by - 22 * q, 1.2, 16 * q);
    poly(c, BRASS, [lx - 7 * q, by - 21.5 * q, lx + 7 * q, by - 21.5 * q, lx + 4 * q, by - 26 * q, lx - 4 * q, by - 26 * q]);
    block(c, BRASS_HI, lx - 6 * q, by - 21.5 * q, 12 * q, 1);
    c.strokeStyle = BRASS_HI; c.lineWidth = 1.2; c.beginPath();
    c.arc(lx, by - 27 * q, 3 * q, Math.PI, 0);
    c.stroke();

    // The companion: a sparrow, left of the book. Settles while the halt waits, hops as it leaves.
    let settle = 0;
    if (phase === 'stopped') settle = 1;
    else if (phase === 'arriving') settle = smooth((k - 0.55) / 0.4);
    else if (phase === 'departing') settle = 1 - smooth(k / 0.15);
    const hop = phase === 'departing' && k > 0.3 && k < 0.6 ? Math.sin(((k - 0.3) / 0.3) * Math.PI) * 4 : 0;
    const hf = moving && settle < 0.5 && (sec + 3) % 9 > 6.2 ? -1 : 1;
    const sg = 1.4 * u;
    const legH = 3 * (1 - settle);
    const rxB = 6 + settle * 0.9;
    const ryB = 4.2 + settle * 0.8;
    const cyB = -legH - ryB + settle * 0.2;
    c.save();
    c.translate(g.sparrowX, by + 1 - hop * sg);
    c.scale(sg, sg);
    oval(c, '#120B08', 1, 0.6 + hop, rxB + 1, 1.2);
    if (legH > 0.5) {
      block(c, '#6A5030', -1.7, -legH, 1, legH + 0.5);
      block(c, '#6A5030', 1.2, -legH, 1, legH + 0.5);
    }
    poly(c, '#46321F', [-rxB + 2, cyB - 1.5, -rxB - 4.5, cyB + 0.8, -rxB - 4, cyB + 2.6, -rxB + 2.5, cyB + 2.8]);
    oval(c, '#8A6448', 0, cyB, rxB, ryB);
    oval(c, '#D8C3A0', 2.4, cyB + 1.4, rxB * 0.58, ryB * 0.62);
    oval(c, '#533A2B', -1.4, cyB - 0.4, rxB * 0.62, ryB * 0.6, -0.2);
    block(c, '#D8C3A0', -3.4, cyB - 1.6, 3, 0.8);
    const hX = hf * (4.6 - settle);
    const hY = cyB - 3.2 + settle * 1.6;
    disc(c, '#CDBFA8', hX, hY, 3.5);
    c.fillStyle = '#9A4E2C'; c.beginPath();
    c.ellipse(hX - hf * 0.4, hY - 1.5, 3.1, 1.9, 0, Math.PI, TAU);
    c.fill();
    block(c, '#2A1C14', hX + hf * 1.6 - 1, hY + 1, 2, 1.6);
    poly(c, '#CBA96B', [hX + hf * 3, hY - 0.8, hX + hf * 5.8, hY + 0.7, hX + hf * 3, hY + 1.6]);
    disc(c, '#0F0B09', hX + hf * 1.1, hY - 0.8, 0.85);
    c.restore();
  },
});
