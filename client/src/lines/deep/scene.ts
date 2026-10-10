/**
 * The Abyssal Line: the bridge of an old brass submersible, deep in green water.
 * The cabin is dark riveted iron plate; through a heavy rounded viewport the
 * water is bright emerald, mottled, pale where light breaks through and black
 * where weed masses hang from above, with light shafts, plankton, jellyfish and
 * bubbles. Along the foot of the viewport runs a scrolled iron railing. Below it
 * a weathered timber ledge with a brass lip holds a ship's wheel, a bottle, a
 * rolled chart, a spyglass, and an oil lantern whose flame leans slowly.
 *
 * The visitor is a whale. Arriving, it glides in from the right and holds in the
 * lower middle of the viewport, bobbing; departing, it tips its nose down and
 * dives away; passing, a small far one crosses. Away: only the water and jellies.
 * The signal is the small lens in the lantern's cap: green, or amber with
 * stragglers. One pale shell lies on the ledge for each quest finished today (up
 * to 12). The companion is a chartreuse frog (the one accent): it breathes and
 * blinks when idle, turns to face the water and sits up while the whale is
 * alongside, and hops once as the whale leaves. Flat colour only.
 */

import { defineScene } from '../types';

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

const WATER = ['#0E4A3A', '#17705A', '#25A07A', '#5FD0A0', '#B9F2D0'];
const WEED = ['#0A2E22', '#0F3D2C'];
const IRON = ['#16201C', '#222E28', '#2E3C34'];
const IRON_HI = '#4A5E52', IRON_LO = '#0C1210', IRON_SEAM = '#2A3832';
const BRASS = ['#8A6A2C', '#B8923E', '#E0C070'];
const LAMP = '#FFC860', LAMP_HI = '#FFE6A8';
const TIMBER = ['#2A1E14', '#3A2A1C', '#4A3624'], TIMBER_LO = '#1A120B';
const WHALE = '#1E5C52', WHALE_MID = '#2E7C6C', WHALE_PALE = '#8FD6C0', WHALE_FIN = '#154A42', WHALE_FAR = '#145A48';
const FROG = '#C8F560', FROG_LT = '#E6FF9A', FROG_INK = '#10180A';
const GREEN = '#5EE6A8', AMBER = '#FFA24D';
const SHELL = '#EADFC4', SHELL_LO = '#B5A684';
const PAPER = '#D8C896', PAPER_HI = '#EFE2B6', PAPER_LO = '#A89868';

const clamp01 = (k: number) => Math.min(1, Math.max(0, k));
const easeOut = (k: number) => 1 - (1 - k) ** 3;
const easeIn = (k: number) => k ** 3;

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
/** A wobbly rounded mass: an ellipse whose radius waves with a few random harmonics. */
const blob = (c: Ctx, rnd: () => number, col: string, cx: number, cy: number, rx: number, ry: number, wob = 0.22, rot = 0) => {
  const p1 = rnd() * TAU, p2 = rnd() * TAU, p3 = rnd() * TAU;
  const n = Math.max(16, Math.min(90, Math.round((rx + ry) / 3)));
  c.save(); c.translate(cx, cy); c.rotate(rot);
  c.fillStyle = col; c.beginPath();
  for (let i = 0; i <= n; i += 1) {
    const a = (i / n) * TAU;
    const k = 1 + wob * (Math.sin(a * 2 + p1) * 0.5 + Math.sin(a * 3 + p2) * 0.35 + Math.sin(a * 5 + p3) * 0.2);
    if (i) c.lineTo(Math.cos(a) * rx * k, Math.sin(a) * ry * k);
    else c.moveTo(rx * k, 0);
  }
  c.closePath(); c.fill();
  c.restore();
};
const rrect = (c: Ctx, x: number, y: number, w: number, h: number, r: number | number[]) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
/** The point `s` px along a rounded rectangle's outline, clockwise from the top-left corner's end. */
const rrPoint = (x: number, y: number, w: number, h: number, r: number, s: number): [number, number] => {
  const a = w - 2 * r, b = h - 2 * r, q = (Math.PI * r) / 2;
  if (s < a) return [x + r + s, y];
  s -= a;
  if (s < q) { const t = s / r; return [x + w - r + Math.sin(t) * r, y + r - Math.cos(t) * r]; }
  s -= q;
  if (s < b) return [x + w, y + r + s];
  s -= b;
  if (s < q) { const t = s / r; return [x + w - r + Math.cos(t) * r, y + h - r + Math.sin(t) * r]; }
  s -= q;
  if (s < a) return [x + w - r - s, y + h];
  s -= a;
  if (s < q) { const t = s / r; return [x + r - Math.sin(t) * r, y + h - r + Math.cos(t) * r]; }
  s -= q;
  if (s < b) return [x, y + h - r - s];
  s -= b;
  const t = s / r;
  return [x + r - Math.cos(t) * r, y + r - Math.sin(t) * r];
};
const rivet = (c: Ctx, x: number, y: number, r: number) => {
  disc(c, IRON_LO, x + 0.4, y + 0.6, r + 0.8);
  disc(c, IRON[2]!, x, y, r);
  block(c, '#6A8274', Math.floor(x - r * 0.55), Math.floor(y - r * 0.55), 1, 1);
};

interface Geo {
  W: number; H: number; wide: boolean; u: number;
  ox: number; oy: number; ow: number; oh: number; ox1: number; oy1: number;
  fw: number; lw: number; R: number; sill: number; tb: number; tf: number; yb: number; rail: number; mullX: number;
  lampX: number; bottleX: number; chartX: number; spyX: number; frogX: number; wheelX: number; wheelR: number;
  shell0: number; shellStep: number; shellR: number; pipeX: number;
}

/** Every position in the scene, from the canvas size alone, so all four layers agree. */
function geo(W: number, H: number): Geo {
  const wide = W >= 560;
  const u = Math.max(0.8, Math.min(1.2, H / 256));
  const ox = Math.round(wide ? W * 0.44 : W * 0.045);
  const ow = Math.round(wide ? W * 0.49 : W * 0.91);
  const oy = Math.round(wide ? H * 0.075 : H * 0.49);
  const oy1 = Math.round(wide ? H * 0.715 : H * 0.8);
  const sill = Math.round((wide ? 9 : 5) * u);
  const tb = oy1 + sill;
  const tf = Math.round(H * (wide ? 0.915 : 0.94));
  const yb = Math.round(tb + (tf - tb) * 0.62);
  return {
    W, H, wide, u, ox, oy, ow, oh: oy1 - oy, ox1: ox + ow, oy1,
    fw: Math.round((wide ? 13 : 6) * u), lw: Math.round((wide ? 17 : 8) * u), R: Math.round((wide ? 24 : 13) * u),
    sill, tb, tf, yb, rail: Math.round((wide ? 31 : 21) * u), mullX: Math.round(ox + ow * 0.8),
    lampX: W * (wide ? 0.33 : 0.4), bottleX: W * (wide ? 0.385 : 0.5), chartX: W * (wide ? 0.5 : 0.55), spyX: W * 0.62,
    frogX: W * (wide ? 0.86 : 0.78), wheelX: W - (wide ? 36 * u : 2), wheelR: 22 * u,
    shell0: (wide ? 24 : 14) * u, shellStep: (wide ? 17 : 13) * u, shellR: (wide ? 4.4 : 3.6) * u, pipeX: Math.round(W - 27 * u),
  };
}

/** How bright the water is at a point: 0 (darkest) to 4 (pale), from the distance to the light patch. */
const lvl = (g: Geo, x: number, y: number) => {
  const d = Math.hypot((x - (g.ox + g.ow * 0.48)) / (g.ow * 0.5), (y - (g.oy + g.oh * 0.32)) / (g.oh * 0.9));
  return d < 0.22 ? 4 : d < 0.42 ? 3 : d < 0.66 ? 2 : d < 0.95 ? 1 : 0;
};

interface Mote { x: number; y: number; v: number; dx: number; a: number }
interface Bubble { x: number; y: number; v: number; r: number; ph: number }
interface Jelly { fx: number; fy: number; r: number; ph: number }
interface Frond { fx: number; h: number; ph: number }
interface State { g: Geo; snow: Mote[]; bubbles: Bubble[]; jellies: Jelly[]; fronds: Frond[]; flecks: number[][] }

/** One tarnished-brass wheel: a timber rim, eight spokes with brass-tipped handles, a brass hub. */
function wheel(c: Ctx, cx: number, cy: number, R: number, hub: number) {
  const handle = R * 0.3;
  c.lineCap = 'round';
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * TAU + 0.2;
    const ex = cx + Math.cos(a) * (R + handle), ey = cy + Math.sin(a) * (R + handle);
    c.strokeStyle = IRON_LO; c.lineWidth = R * 0.2 + 1.4;
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(ex, ey); c.stroke();
    c.strokeStyle = '#6B4A2C'; c.lineWidth = R * 0.2;
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(ex, ey); c.stroke();
    disc(c, IRON_LO, ex, ey, R * 0.17 + 0.8);
    disc(c, BRASS[1]!, ex, ey, R * 0.17);
    block(c, BRASS[2]!, Math.round(ex - R * 0.1), Math.round(ey - R * 0.1), 1.5, 1.5);
  }
  c.lineCap = 'butt';
  c.strokeStyle = IRON_LO; c.lineWidth = R * 0.26 + 1.6;
  c.beginPath(); c.arc(cx, cy, R - R * 0.05, 0, TAU); c.stroke();
  c.strokeStyle = '#6B4A2C'; c.lineWidth = R * 0.26;
  c.beginPath(); c.arc(cx, cy, R - R * 0.05, 0, TAU); c.stroke();
  c.strokeStyle = '#9A7040'; c.lineWidth = 1.2;
  c.beginPath(); c.arc(cx, cy, R - R * 0.05 - R * 0.07, Math.PI * 1.05, Math.PI * 1.6); c.stroke();
  c.strokeStyle = BRASS[0]!; c.lineWidth = 2;
  c.beginPath(); c.arc(cx, cy, R * 0.42, 0, TAU); c.stroke();
  disc(c, IRON_LO, cx, cy, hub + 1);
  disc(c, BRASS[1]!, cx, cy, hub);
  disc(c, BRASS[2]!, cx - hub * 0.25, cy - hub * 0.25, hub * 0.5);
  disc(c, BRASS[0]!, cx + hub * 0.2, cy + hub * 0.2, hub * 0.28);
}


/** The signal lens, flame and brass of the oil lantern. `y` is its ground line. */
function lantern(c: Ctx, x: number, y: number, q: number, t: number, caution: boolean) {
  const lean = Math.sin(t / 2600) * 1.6 * q + Math.sin(t / 830) * 0.5 * q;
  oval(c, TIMBER_LO, x + 2 * q, y + 1, 13 * q, 2.6 * q);
  poly(c, BRASS[0]!, [x - 9 * q, y, x + 9 * q, y, x + 7 * q, y - 4 * q, x - 7 * q, y - 4 * q]);
  poly(c, BRASS[1]!, [x - 7 * q, y - 4 * q, x + 7 * q, y - 4 * q, x + 6 * q, y - 8 * q, x - 6 * q, y - 8 * q]);
  block(c, BRASS[2]!, x - 6 * q, y - 8 * q, 12 * q, 1);
  block(c, BRASS[2]!, x - 8 * q, y - 4 * q + 1, 3 * q, 1);
  // The glass: a flat warm shape, with the cage laid over it.
  c.fillStyle = LAMP; c.beginPath();
  c.moveTo(x - 5.5 * q, y - 8 * q);
  c.quadraticCurveTo(x - 9 * q, y - 20 * q, x - 5 * q, y - 32 * q);
  c.lineTo(x + 5 * q, y - 32 * q);
  c.quadraticCurveTo(x + 9 * q, y - 20 * q, x + 5.5 * q, y - 8 * q);
  c.fill();
  block(c, LAMP_HI, x - 4.2 * q, y - 30 * q, 1.4, 14 * q);
  // The flame: a pale teardrop leaning with the draught, over a hot core.
  const fy = y - 11 * q;
  c.fillStyle = LAMP_HI; c.beginPath();
  c.moveTo(x - 3 * q, fy); c.quadraticCurveTo(x - 4 * q, fy - 8 * q, x + lean, fy - 15 * q);
  c.quadraticCurveTo(x + 4 * q, fy - 8 * q, x + 3 * q, fy);
  c.closePath(); c.fill();
  c.fillStyle = '#FFF8E0'; c.beginPath();
  c.moveTo(x - 1.4 * q, fy); c.quadraticCurveTo(x - 1.8 * q, fy - 5 * q, x + lean * 0.6, fy - 9 * q);
  c.quadraticCurveTo(x + 1.8 * q, fy - 5 * q, x + 1.4 * q, fy);
  c.closePath(); c.fill();
  block(c, '#3A2A12', Math.round(x - 0.5), Math.round(fy), 1, 2 * q);
  c.strokeStyle = BRASS[0]!; c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(x - 5.5 * q, y - 8 * q); c.quadraticCurveTo(x - 9 * q, y - 20 * q, x - 5 * q, y - 32 * q);
  c.moveTo(x + 5.5 * q, y - 8 * q); c.quadraticCurveTo(x + 9 * q, y - 20 * q, x + 5 * q, y - 32 * q);
  c.moveTo(x - 2 * q, y - 8 * q); c.lineTo(x - 2 * q, y - 32 * q);
  c.moveTo(x + 2 * q, y - 8 * q); c.lineTo(x + 2 * q, y - 32 * q);
  c.stroke();
  block(c, BRASS[0]!, x - 8.4 * q, y - 21 * q, 16.8 * q, 1.6);
  // The cap, with the lens set in it, and the ring to carry it by.
  block(c, BRASS[1]!, x - 7 * q, y - 34.5 * q, 14 * q, 2.6 * q);
  block(c, BRASS[2]!, x - 7 * q, y - 34.5 * q, 14 * q, 1);
  c.fillStyle = BRASS[1]!; c.beginPath();
  c.ellipse(x, y - 34.5 * q, 8.4 * q, 8 * q, 0, Math.PI, TAU);
  c.fill();
  c.fillStyle = BRASS[0]!; c.beginPath();
  c.ellipse(x + 2.4 * q, y - 34.5 * q, 6 * q, 6 * q, 0, Math.PI * 1.5, TAU);
  c.fill();
  const lens = caution ? AMBER : GREEN;
  disc(c, '#1A1208', x, y - 37.5 * q, 5 * q);
  disc(c, lens, x, y - 37.5 * q, 4 * q);
  block(c, caution ? '#FFE0B8' : '#C8FFE4', Math.round(x - 2.2 * q), Math.round(y - 39.8 * q), 2, 2);
  c.strokeStyle = BRASS[1]!; c.lineWidth = 1.6;
  c.beginPath(); c.arc(x, y - 43 * q, 4.4 * q, Math.PI * 0.95, Math.PI * 2.05); c.stroke();
}

/** A shell: a scallop, a whelk or a round snail, in pale bone. */
function shell(c: Ctx, x: number, y: number, r: number, i: number) {
  oval(c, TIMBER_LO, x + 1, y + 0.5, r * 1.2, r * 0.38);
  const kind = i % 3;
  if (kind === 0) {
    c.fillStyle = SHELL; c.beginPath();
    c.moveTo(x, y); c.arc(x, y, r * 1.5, -Math.PI * 0.93, -Math.PI * 0.07); c.closePath(); c.fill();
    c.strokeStyle = SHELL_LO; c.lineWidth = 1; c.beginPath();
    for (let k = 0; k < 5; k += 1) {
      const a = -Math.PI * (0.2 + 0.15 * k);
      c.moveTo(x, y); c.lineTo(x + Math.cos(a) * r * 1.45, y + Math.sin(a) * r * 1.45);
    }
    c.stroke();
    block(c, SHELL_LO, x - r * 0.5, y - 1, r, 2);
  } else if (kind === 1) {
    poly(c, SHELL, [x - r * 0.9, y, x + r * 0.9, y, x + r * 0.3, y - r * 2, x - r * 0.1, y - r * 2.3]);
    c.strokeStyle = SHELL_LO; c.lineWidth = 1; c.beginPath();
    for (const f of [0.35, 0.7]) { c.moveTo(x - r * (0.8 - f * 0.6), y - r * 2.1 * f); c.lineTo(x + r * (0.8 - f * 0.55), y - r * 2.1 * f + 1); }
    c.stroke();
    block(c, '#FFF6DE', x - r * 0.5, y - r * 1.2, 1, r * 0.9);
  } else {
    disc(c, SHELL, x, y - r * 0.85, r * 0.95);
    c.strokeStyle = SHELL_LO; c.lineWidth = 1; c.beginPath();
    c.arc(x, y - r * 0.85, r * 0.55, 0.4, 4.6); c.arc(x + 0.5, y - r * 0.85, r * 0.2, 0, TAU);
    c.stroke();
  }
}

/** The companion frog, facing +x in its own space: chartreuse, black-marked. `sit` 0 low, 1 sat up. */
function frog(c: Ctx, s: number, sit: number, swell: number, blink: boolean) {
  const part = (col: string, x: number, y: number, rx: number, ry: number, rot = 0) => {
    c.fillStyle = col; c.strokeStyle = FROG_INK; c.lineWidth = 1;
    c.beginPath(); c.ellipse(x * s, y * s, rx * s, ry * s, rot, 0, TAU); c.fill(); c.stroke();
  };
  const lift = 1 + sit * 0.32;
  part(FROG, -3.6, -3.4, 4.8, 3.6, -0.5);
  part(FROG, 0, -5.4 * lift, 7.2, 5.2 * lift, -sit * 0.3);
  // Black markings along the back and on the thigh.
  c.fillStyle = FROG_INK;
  for (const [mx, my, mr] of [[-2, -8.4, 1.7], [1.4, -9.2, 1.5], [-5.2, -5.4, 1.3], [3.2, -6.6, 1.1], [-1.2, -4.6, 1]] as const) {
    c.beginPath(); c.ellipse(mx * s, (my - sit * 1.6) * s, mr * s, mr * 0.7 * s, 0.5, 0, TAU); c.fill();
  }
  part(FROG, 3.8, -2.6, 1.3, 2.4);
  part(FROG, -0.2, -0.9, 5.4, 1.2);
  part(FROG, 3.9, -0.7, 2.4, 0.8);
  // The throat swells and falls.
  const hx = 5.4 - sit * 0.8, hy = -9 * lift + 1.6;
  part(FROG_LT, hx + 0.6, hy + 2.2, 2.4 + swell * 1.5, 1.9 + swell * 1.2);
  part(FROG, hx, hy, 4.6, 3.5, 0.15);
  // The eye: a black bead ringed in chartreuse, shut in a blink.
  part(FROG, hx + 0.8, hy - 3, 2.5, 2.4);
  if (blink) {
    c.strokeStyle = FROG_INK; c.lineWidth = 1.2; c.beginPath();
    c.moveTo((hx - 0.6) * s, (hy - 3) * s); c.lineTo((hx + 2.2) * s, (hy - 3) * s); c.stroke();
  } else {
    c.fillStyle = FROG_INK; c.beginPath(); c.ellipse((hx + 1.3) * s, (hy - 3) * s, 1.4 * s, 1.5 * s, 0, 0, TAU); c.fill();
    block(c, FROG_LT, Math.round((hx + 0.8) * s), Math.round((hy - 3.9) * s), 1, 1);
  }
  c.strokeStyle = FROG_INK; c.lineWidth = 1; c.beginPath();
  c.moveTo((hx + 1) * s, (hy + 1.3) * s); c.quadraticCurveTo((hx + 3.4) * s, (hy + 1.7) * s, (hx + 4.4) * s, (hy + 0.6) * s);
  c.stroke();
}

export default defineScene<State>({
  sky: '#0E4A3A',
  timing: { arriving: 6500, departing: 4500, passing: 6000 },

  // ── Far away, painted once: the water ──
  back(p) {
    const { ctx: c, w, h, rnd } = p;
    const g = geo(w, h);
    const { ox, oy, ow, oh } = g;
    const s = oh / 184;
    c.save(); c.beginPath();
    c.rect(ox, oy, ow, oh);
    c.clip();
    block(c, WATER[0]!, ox, oy, ow, oh);
    // Flat steps of emerald, brightest in the upper middle, each edge wobbling.
    const bx = ox + ow * 0.48, by = oy + oh * 0.32;
    ([[0.9, 1.25], [0.62, 0.8], [0.42, 0.5], [0.2, 0.22]] as const).forEach(([fx, fy], i) => blob(c, rnd, WATER[i + 1]!, bx - i * ow * 0.012, by - i * oh * 0.012, ow * fx, oh * fy, 0.18));
    // Mottling: patches a step brighter or darker than the water they sit in.
    for (let i = 0; i < (g.wide ? 110 : 60); i += 1) {
      const x = ox + rnd() * ow, y = oy + rnd() * oh * 0.9;
      const l = Math.max(0, Math.min(4, lvl(g, x, y) + (rnd() < 0.5 ? -1 : 1)));
      const r = (5 + rnd() * 20) * s;
      blob(c, rnd, WATER[l]!, x, y, r * (1 + rnd()), r * 0.7, 0.3, (rnd() - 0.5) * 0.6);
    }
    // Pale breaks in the water, long and low, where the light comes through.
    for (let i = 0; i < 5; i += 1) {
      const x = ox + ow * (0.18 + rnd() * 0.62), y = oy + oh * (0.14 + rnd() * 0.34);
      blob(c, rnd, i % 2 ? WATER[3]! : WATER[4]!, x, y, ow * (0.06 + rnd() * 0.08), oh * (0.025 + rnd() * 0.03), 0.3, (rnd() - 0.5) * 0.3);
    }
    // Shafts of light: flat wedges slanting down from the bright patch.
    for (const [fx, wd, al] of [[0.26, 0.1, 0.2], [0.45, 0.15, 0.18], [0.62, 0.09, 0.2]] as const) {
      const x0 = ox + ow * fx;
      c.globalAlpha = al; c.fillStyle = WATER[4]!;
      c.beginPath();
      c.moveTo(x0 - 6, oy); c.lineTo(x0 + 8, oy);
      c.lineTo(x0 + 8 + ow * wd + ow * 0.12, oy + oh); c.lineTo(x0 - 6 + ow * 0.12, oy + oh);
      c.fill();
    }
    c.globalAlpha = 1;
    // Far reef mounds along the bottom, then nearer ones.
    for (const [col, top] of [[WEED[1]!, 0.9], [WEED[0]!, 0.97]] as const) {
      for (let x = ox - 20; x < ox + ow + 20; x += (28 + rnd() * 34) * s) {
        const rx = (26 + rnd() * 34) * s, ry = (10 + rnd() * 16) * s;
        blob(c, rnd, col, x, oy + oh * (top + rnd() * 0.06) + ry * 0.4, rx, ry, 0.18);
      }
      block(c, col, ox, oy + oh * (top + 0.1), ow, oh);
    }
    dots(c, rnd, ox, oy + oh * 0.76, ow, oh * 0.2, g.wide ? 420 : 160, [WATER[2]!, WATER[1]!, WEED[1]!], 1, (_x, y) => 0.9 - (y - (oy + oh * 0.76)) / (oh * 0.25));
    // Weed masses hang from the top, crowding the corners.
    const weed = (x: number, depth: number, sz: number) => {
      const n = Math.max(3, Math.round(depth / (sz * 0.9)));
      for (let i = 0; i < n; i += 1) {
        const f = i / (n - 1);
        const cx = x + (rnd() - 0.5) * sz * 1.1, cy = oy + f * depth - sz * 0.3, r = sz * (0.75 + rnd() * 0.55) * (1 - f * 0.35);
        blob(c, rnd, WEED[0]!, cx, cy, r, r * 0.9, 0.3);
        blob(c, rnd, WEED[1]!, cx + r * 0.15, cy - r * 0.1, r * 0.7, r * 0.62, 0.3);
      }
    };
    for (let xi = -0.02; xi <= 1.04; xi += g.wide ? 0.05 : 0.08) {
      const ed = Math.abs(xi - 0.5) * 2;
      weed(ox + ow * xi, oh * (0.07 + 0.36 * ed ** 1.8) + rnd() * oh * 0.05, (9 + ed * 9) * s);
    }
    weed(ox + ow * 0.02, oh * 0.74, 20 * s); weed(ox + ow * 0.06, oh * 0.5, 16 * s);
    weed(ox + ow * 0.98, oh * 0.62, 19 * s); weed(ox + ow * 0.94, oh * 0.4, 15 * s);
    // A few long strands hanging loose.
    c.strokeStyle = WEED[0]!; c.lineWidth = 2 * s + 0.5; c.lineCap = 'round';
    for (let i = 0; i < 7; i += 1) {
      const x = ox + ow * (0.08 + rnd() * 0.84), len = oh * (0.2 + rnd() * 0.25), sw = (rnd() - 0.5) * 18;
      c.beginPath(); c.moveTo(x, oy);
      c.bezierCurveTo(x + sw, oy + len * 0.3, x - sw, oy + len * 0.65, x + sw * 0.4, oy + len);
      c.stroke();
    }
    c.lineCap = 'butt';
    dots(c, rnd, ox, oy, ow, oh * 0.62, g.wide ? 900 : 380, [WATER[1]!, WEED[1]!, WATER[2]!], 1, (_x, y) => 0.7 * (1 - (y - oy) / (oh * 0.62)) + 0.1);
    // Plankton and grain everywhere: pale on the dark water, dark on the bright.
    const n = g.wide ? 3000 : 1300;
    dots(c, rnd, ox, oy, ow, oh, n, [WATER[4]!, WATER[3]!], 1, (x, y) => (lvl(g, x, y) <= 2 ? 0.9 : 0));
    dots(c, rnd, ox, oy, ow, oh, n * 0.3, [WATER[2]!, WATER[3]!], 1, (x, y) => (lvl(g, x, y) >= 3 ? 0.9 : 0));
    dots(c, rnd, ox, oy, ow, oh, n * 0.05, [WATER[4]!], 2, (x, y) => (lvl(g, x, y) <= 2 ? 1 : 0));
    c.restore();
  },

  layout(w, h, rnd) {
    const g = geo(w, h);
    const k = g.wide ? 1 : 0.78;
    const snow = Array.from({ length: g.wide ? 34 : 20 }, () => ({ x: g.ox + rnd() * g.ow, y: g.oy + rnd() * g.oh, v: 3 + rnd() * 6, dx: -(1 + rnd() * 3), a: 0.45 + rnd() * 0.45 }));
    const bubbles = Array.from({ length: g.wide ? 12 : 7 }, () => ({ x: g.ox + g.ow * (0.9 + rnd() * 0.06), y: g.oy + rnd() * g.oh, v: 12 + rnd() * 12, r: (1.4 + rnd() * 2.2) * k, ph: rnd() * TAU }));
    const jellies = ([[0.07, 0.3, 10], [0.93, 0.46, 11], [0.52, 0.12, 8], [0.15, 0.66, 9]] as const).map(([fx, fy, r], i) => ({ fx, fy, r: r * k, ph: i * 1.7 + rnd() }));
    const fronds = ([0.02, 0.07, 0.13, 0.88, 0.94, 0.99] as const).map((fx) => ({ fx, h: g.oh * (0.2 + rnd() * 0.16), ph: rnd() * TAU }));
    // Marks on the whale's hide, in its own unit space: [along, across, dark?].
    const flecks = Array.from({ length: 46 }, () => [rnd(), -0.42 + rnd() * 0.7, rnd() < 0.5 ? 1 : 0]);
    return { g, snow, bubbles, jellies, fronds, flecks };
  },

  // ── Out there, every frame: snow, bubbles, jellyfish, the whale ──
  draw(f, s) {
    const { ctx: c, t, dt, moving } = f;
    const { phase, k } = f.visitor;
    const g = s.g;
    const { ox, oy, ow, oh } = g;
    c.save(); rrect(c, ox, oy, ow, oh, g.R); c.clip();

    // Kelp rising from the bottom corners, leaning slowly.
    c.lineCap = 'round';
    for (const fr of s.fronds) {
      const x0 = ox + ow * fr.fx, y0 = oy + oh * 0.98;
      for (let i = 0; i < 6; i += 1) {
        const a = i / 6, b = (i + 1) / 6;
        const sx = (q: number) => x0 + Math.sin(t / 3400 + fr.ph + q * 3) * 5 * q + Math.sin(q * 5 + fr.ph) * 3 * q;
        c.strokeStyle = i % 2 ? WEED[1]! : WEED[0]!; c.lineWidth = 4.2 * (1 - a * 0.7);
        c.beginPath(); c.moveTo(sx(a), y0 - fr.h * a); c.lineTo(sx(b), y0 - fr.h * b); c.stroke();
      }
    }
    c.lineCap = 'butt';

    // Marine snow.
    for (const m of s.snow) {
      if (moving) {
        m.y += m.v * dt; m.x += m.dx * dt;
        if (m.y > oy + oh) { m.y = oy - 2; m.x = ox + f.rnd() * ow; }
        if (m.x < ox) m.x = ox + ow;
      }
      c.globalAlpha = m.a; c.fillStyle = WATER[4]!;
      c.fillRect(Math.round(m.x), Math.round(m.y), m.v > 6 ? 2 : 1, m.v > 6 ? 2 : 1);
    }
    c.globalAlpha = 1;

    // A column of bubbles rising near the right edge.
    c.lineWidth = 1;
    for (const b of s.bubbles) {
      if (moving) {
        b.y -= b.v * dt;
        if (b.y < oy - 4) { b.y = oy + oh; b.x = ox + ow * (0.9 + f.rnd() * 0.06); }
      }
      const bx = b.x + Math.sin(t / 900 + b.ph) * 2;
      c.strokeStyle = WATER[4]!; c.beginPath(); c.arc(bx, b.y, b.r, 0, TAU); c.stroke();
      block(c, WATER[4]!, Math.round(bx - b.r * 0.5), Math.round(b.y - b.r * 0.5), 1, 1);
    }

    // Jellyfish: a flat pale dome, a darker bell inside it, tentacles that trail.
    for (const j of s.jellies) {
      const pulse = Math.sin(t / 1100 + j.ph);
      const x = ox + ow * j.fx + Math.sin(t / 4300 + j.ph) * 3, y = oy + oh * j.fy + Math.sin(t / 3100 + j.ph) * 5;
      const rx = j.r * (1 + 0.1 * pulse), ry = j.r * 0.78 * (1 - 0.14 * pulse);
      c.strokeStyle = '#E4FAEC'; c.lineWidth = 1;
      for (let i = 0; i < 4; i += 1) {
        const sx = x + (i - 1.5) * rx * 0.5;
        c.beginPath(); c.moveTo(sx, y);
        for (let q = 1; q <= 6; q += 1) c.lineTo(sx + Math.sin(t / 700 + j.ph + q * 0.9 + i) * 2.2 * (q / 6) * (i % 2 ? 1 : -1), y + q * j.r * 0.5 + pulse * q * 0.3);
        c.stroke();
      }
      c.fillStyle = '#C8F2DC'; c.strokeStyle = '#0F5A44';
      c.beginPath(); c.ellipse(x, y, rx, ry, 0, Math.PI, TAU);
      for (let q = 0; q < 4; q += 1) c.arc(x + rx - (q + 0.5) * (rx / 2), y, rx / 4, 0, Math.PI);
      c.fill(); c.stroke();
      c.fillStyle = '#6ECFA4'; c.beginPath(); c.ellipse(x, y, rx * 0.62, ry * 0.62, 0, Math.PI, TAU); c.closePath(); c.fill();
      c.fillStyle = '#B9F2D0'; c.beginPath(); c.ellipse(x - rx * 0.2, y - ry * 0.45, rx * 0.22, ry * 0.18, 0, 0, TAU); c.fill();
    }

    /**
     * A baleen whale facing left, drawn about its own middle: a big blunt head, deepest just behind it,
     * running out to a narrow tail stock ending in a thin flat fluke. `near` is the one alongside, with a
     * pale throat, grooves, flipper, eye and marks; a far one is the same outline in one flat colour.
     */
    const whale = (cx: number, cy: number, L: number, T: number, rot: number, sweep: number, near: boolean) => {
      c.save(); c.translate(cx, cy); c.rotate(rot);
      const bend = (u: number) => Math.sin(sweep - u * 2.6) * T * 0.14 * u * u - T * 0.12 * u ** 3;
      const P = (u: number, v: number): [number, number] => [(u - 0.5) * L, v * T + bend(u)];
      const cv = (a: [number, number], b: [number, number], d: [number, number]) => c.bezierCurveTo(a[0], a[1], b[0], b[1], d[0], d[1]);
      const outline = () => {
        c.beginPath(); c.moveTo(...P(0, 0.14));
        cv(P(0, -0.16), P(0.07, -0.47), P(0.25, -0.5)); cv(P(0.5, -0.53), P(0.72, -0.2), P(0.96, -0.05));
        c.lineTo(...P(0.96, 0.05));
        cv(P(0.72, 0.22), P(0.5, 0.52), P(0.27, 0.5)); cv(P(0.12, 0.49), P(0, 0.36), P(0, 0.14));
        c.closePath();
      };
      outline(); c.fillStyle = near ? WHALE : WHALE_FAR; c.fill();
      c.beginPath(); c.moveTo(...P(0.95, -0.05));
      c.quadraticCurveTo(...P(1.05, -0.16), ...P(1.14, -0.21)); c.quadraticCurveTo(...P(1.1, 0.06), ...P(0.95, 0.06));
      c.closePath(); c.fillStyle = near ? WHALE_FIN : WHALE_FAR; c.fill();
      if (near) {
        c.save(); outline(); c.clip();
        // The lit flank, then the pale belly with its throat pleats.
        c.beginPath(); c.moveTo(...P(-0.05, 0.08)); cv(P(0.2, 0.06), P(0.5, 0.12), P(0.9, 0.0));
        c.lineTo(...P(1, 0.2)); c.lineTo(...P(1, 0.9)); c.lineTo(...P(-0.05, 0.9)); c.closePath();
        c.fillStyle = WHALE_MID; c.fill();
        c.beginPath(); c.moveTo(...P(-0.05, 0.3)); cv(P(0.15, 0.26), P(0.4, 0.34), P(0.66, 0.5));
        c.lineTo(...P(0.66, 0.9)); c.lineTo(...P(-0.05, 0.9)); c.closePath();
        c.fillStyle = WHALE_PALE; c.fill();
        c.strokeStyle = WHALE_MID; c.lineWidth = 1; c.beginPath();
        for (let i = 0; i < 7; i += 1) { c.moveTo(...P(0.02, 0.33 + i * 0.05)); c.quadraticCurveTo(...P(0.22, 0.34 + i * 0.065), ...P(0.5 - i * 0.02, 0.44 + i * 0.07)); }
        c.stroke();
        // Marks on the hide: stipple, scars and a patch of barnacles on the head.
        for (const [u, v, dark] of s.flecks) {
          const [px, py] = P(u!, v!);
          c.fillStyle = dark ? WHALE_FIN : WHALE_MID;
          c.fillRect(Math.round(px), Math.round(py), 1, 1);
        }
        c.strokeStyle = WHALE_MID; c.beginPath();
        for (const [u, v, l] of [[0.46, -0.3, 0.1], [0.55, -0.18, 0.07], [0.7, -0.14, 0.08]] as const) { c.moveTo(...P(u, v)); c.lineTo(...P(u + l, v + 0.03)); }
        c.stroke();
        c.fillStyle = WHALE_PALE;
        for (const [u, v] of [[0.04, -0.1], [0.07, -0.16], [0.1, -0.08], [0.05, -0.02]] as const) c.fillRect(Math.round(P(u, v)[0]), Math.round(P(u, v)[1]), 2, 2);
        c.restore();
        c.strokeStyle = WHALE_FIN; c.lineWidth = 1; c.beginPath();
        c.moveTo(...P(0, 0.14)); c.quadraticCurveTo(...P(0.1, 0.25), ...P(0.23, 0.27)); c.stroke();
        const [ex, ey] = P(0.2, 0.19);
        disc(c, '#D9F5EA', ex, ey, 2.4); disc(c, '#0C1F1A', ex - 0.3, ey, 1.3);
        c.beginPath(); c.moveTo(...P(0.24, 0.44));
        cv(P(0.3, 0.68), P(0.42, 0.9), P(0.52, 1.04)); cv(P(0.45, 0.76), P(0.4, 0.6), P(0.37, 0.48));
        c.closePath(); c.fillStyle = WHALE_FIN; c.fill();
      }
      c.restore();
    };

    // A small far whale crosses the upper water now and then.
    if (phase === 'passing') {
      const L = ow * (g.wide ? 0.2 : 0.17);
      whale(ox + ow + L / 2 + 10 + (-ow - L - 20) * k, oy + oh * (g.wide ? 0.27 : 0.2), L, oh * 0.09, 0, t / 760, false);
    }

    // The visitor: the whale glides in from the right, holds in the lower middle, bobs, then dives.
    if (phase !== 'away' && phase !== 'passing') {
      const L = ow * (g.wide ? 0.6 : 0.46), T = oh * (g.wide ? 0.3 : 0.36);
      const stopTip = ox + ow * (g.wide ? 0.17 : 0.26), baseY = oy + oh * (g.wide ? 0.55 : 0.4);
      const bob = Math.sin((t / 6500) * TAU) * 3;
      let tip = stopTip, y = baseY + bob, rot = 0;
      if (phase === 'arriving') tip = ox + ow + 30 + (stopTip - ox - ow - 30) * easeOut(k);
      else if (phase === 'departing') {
        tip = stopTip + (ox - L - 80 - stopTip) * easeIn(k);
        y = baseY + bob * (1 - k) + oh * 0.9 * k ** 2.2;
        rot = -0.4 * clamp01(k * 3);
      }
      whale(tip + L / 2 + Math.sin((t / 5000) * TAU) * 0.9, y, L, T, rot, (t / 2400) * TAU, true);
    }
    c.restore();
  },

  // ── The bridge, painted once on a clear sheet; the viewport is left clear ──
  front(p) {
    const { ctx: c, w, h, rnd } = p;
    const g = geo(w, h);
    const { ox, oy, ow, oh, ox1, oy1, u, fw, lw, R, sill, tb, tf, wide } = g;

    // ── The wall: iron plate in staggered sheets, bolted along every seam ──
    c.save(); c.beginPath();
    c.rect(0, 0, w, h);
    c.roundRect(ox, oy, ow, oh, R);
    c.clip('evenodd');
    block(c, IRON[0]!, 0, 0, w, h);
    const ph = Math.round(62 * u), pw = Math.round(128 * u);
    const tones = ['#16201C', '#18241F', '#141E1A', '#1A2621'];
    for (let r = 0, y = 0; y < h; y += ph, r += 1) {
      for (let x = -((r % 2) * pw) / 2, i = 0; x < w; x += pw, i += 1) {
        block(c, tones[(i + r * 2) % 4]!, x, y, pw, ph);
        block(c, IRON_LO, x, y, 2, ph); block(c, IRON_SEAM, x + 2, y, 1, ph);
        for (let ry = y + 14 * u; ry < y + ph - 8; ry += 20 * u) rivet(c, x + 6 * u, ry, 1.6 * u);
        for (let rx = x + 22 * u; rx < x + pw - 8; rx += 20 * u) rivet(c, rx, y + 6 * u, 1.6 * u);
      }
      block(c, IRON_LO, 0, y, w, 2); block(c, IRON_SEAM, 0, y + 2, w, 1);
    }
    for (let r = 0, y = 0; y < h; y += ph, r += 1) {
      for (let x = -((r % 2) * pw) / 2; x < w; x += pw) { disc(c, IRON_LO, x + 1, y + 1, 3.6 * u); disc(c, IRON[2]!, x + 1, y + 1, 2.8 * u); block(c, IRON_HI, x - 0.5, y - 0.5, 1.5, 1.5); }
    }
    dots(c, rnd, 0, 0, w, h, Math.round((w * h) / 42), [IRON_LO, '#1E2C26', '#101814', '#27362F']);
    grain(c, rnd, 0, 0, w, h, wide ? 70 : 40, '#101814', 60);
    grain(c, rnd, 0, 0, w, h, wide ? 30 : 16, '#26352E', 50);
    // Stains running down from the seams.
    c.fillStyle = '#0F1814';
    for (let i = 0; i < (wide ? 40 : 20); i += 1) c.fillRect(Math.floor(rnd() * w), Math.floor(rnd() * h * 0.8), 1 + Math.floor(rnd() * 2), 6 + rnd() * 18);
    c.restore();

    // The conduit along the very top, with flanges and bolts.
    block(c, IRON[1]!, 0, 0, w, 7 * u); block(c, IRON_HI, 0, 0, w, 1); block(c, IRON_LO, 0, 7 * u, w, 2);
    for (let x = 60 * u; x < w; x += 140 * u) {
      block(c, IRON[2]!, x, 0, 7 * u, 9 * u); block(c, IRON_LO, x + 7 * u, 0, 1.5, 9 * u); block(c, IRON_HI, x, 0, 1, 9 * u);
      rivet(c, x + 3.5 * u, 4 * u, 1.3 * u);
    }

    if (wide) {
      // A pipe runs across the wall under the words, into the frame, with a small brass gauge on a stub.
      const py = Math.round(h * 0.67), pt = Math.round(9 * u);
      block(c, IRON_LO, 0, py - 1, ox - fw + 4, pt + 3);
      block(c, IRON[1]!, 0, py, ox - fw + 4, pt); block(c, IRON[2]!, 0, py, ox - fw + 4, 2); block(c, IRON_HI, 0, py, ox - fw + 4, 1); block(c, IRON_LO, 0, py + pt - 2, ox - fw + 4, 2);
      for (const x of [34 * u, 188 * u, 352 * u]) {
        block(c, IRON_LO, x - 1, py - 4 * u, 12 * u + 2, pt + 8 * u + 2); block(c, IRON[2]!, x, py - 3 * u, 12 * u, pt + 6 * u); block(c, IRON_HI, x, py - 3 * u, 1, pt + 6 * u);
        rivet(c, x + 6 * u, py - 1 * u, 1.3 * u); rivet(c, x + 6 * u, py + pt + 1 * u, 1.3 * u);
      }
      const gx = Math.round(110 * u), gr = 9 * u;
      block(c, IRON_LO, gx - 2, py - 12 * u, 5, 12 * u); block(c, IRON[2]!, gx - 1, py - 12 * u, 3, 12 * u);
      disc(c, IRON_LO, gx, py - 12 * u - gr, gr + 2); disc(c, BRASS[1]!, gx, py - 12 * u - gr, gr + 0.5); disc(c, BRASS[0]!, gx + 1, py - 12 * u - gr + 1, gr - 1);
      disc(c, '#E8E0C0', gx, py - 12 * u - gr, gr - 2.4);
      c.strokeStyle = IRON_LO; c.lineWidth = 1; c.beginPath();
      c.moveTo(gx, py - 12 * u - gr); c.lineTo(gx + 3.4 * u, py - 12 * u - gr - 3.8 * u); c.stroke();
      c.strokeStyle = '#A0501E'; c.lineWidth = 1.5; c.beginPath(); c.arc(gx, py - 12 * u - gr, gr - 3.4, -0.1, 0.9); c.stroke();
      // The vertical pipe at the wall's right end, with a valve wheel on a brass body.
      const px = g.pipeX, pr = Math.round(7 * u);
      block(c, IRON_LO, px - pr - 1, 8 * u, pr * 2 + 2, h);
      block(c, IRON[1]!, px - pr, 8 * u, pr * 2, h); block(c, IRON[2]!, px - pr, 8 * u, 3, h); block(c, IRON_HI, px - pr, 8 * u, 1, h); block(c, IRON_LO, px + pr - 3, 8 * u, 3, h);
      for (const y of [34 * u, 150 * u, 196 * u]) {
        block(c, IRON_LO, px - pr - 4 * u, y - 1, pr * 2 + 8 * u, 9 * u + 2); block(c, IRON[2]!, px - pr - 3 * u, y, pr * 2 + 6 * u, 8 * u); block(c, IRON_HI, px - pr - 3 * u, y, pr * 2 + 6 * u, 1);
        rivet(c, px - pr - 1 * u, y + 4 * u, 1.3 * u); rivet(c, px + pr + 1 * u, y + 4 * u, 1.3 * u);
      }
      const vy = Math.round(96 * u);
      block(c, IRON_LO, px - 12 * u - 1, vy - 8 * u, 24 * u + 2, 16 * u + 2); block(c, BRASS[0]!, px - 12 * u, vy - 7 * u, 24 * u, 15 * u); block(c, BRASS[1]!, px - 12 * u, vy - 7 * u, 24 * u, 3 * u); block(c, BRASS[2]!, px - 12 * u, vy - 7 * u, 24 * u, 1);
      c.strokeStyle = IRON_LO; c.lineWidth = 3; c.beginPath(); c.arc(px, vy, 10 * u, 0, TAU); c.stroke();
      c.strokeStyle = BRASS[1]!; c.lineWidth = 1.8; c.beginPath(); c.arc(px, vy, 10 * u, 0, TAU); c.stroke();
      c.lineWidth = 1.6; c.beginPath();
      for (let i = 0; i < 3; i += 1) { const a = (i / 3) * TAU + 0.5; c.moveTo(px, vy); c.lineTo(px + Math.cos(a) * 10 * u, vy + Math.sin(a) * 10 * u); }
      c.stroke();
      disc(c, IRON_LO, px, vy, 3.4 * u); disc(c, BRASS[2]!, px, vy, 2.4 * u);
    }

    // ── The viewport frame: a heavy iron ring with rounded corners, and a ring of rivets ──
    const outer = () => rrect(c, ox - fw, oy - lw, ow + 2 * fw, oh + lw + sill, [R + fw, R + fw, 3, 3]);
    c.save(); c.beginPath();
    c.roundRect(ox - fw, oy - lw, ow + 2 * fw, oh + lw + sill, [R + fw, R + fw, 3, 3]);
    c.roundRect(ox, oy, ow, oh, R);
    c.clip('evenodd');
    block(c, IRON[1]!, ox - fw, oy - lw, ow + 2 * fw, oh + lw + sill);
    rrect(c, ox - fw / 2, oy - lw / 2, ow + fw, oh + lw / 2, R + fw / 2);
    c.strokeStyle = IRON[2]!; c.lineWidth = fw * 0.55; c.stroke();
    rrect(c, ox - fw * 0.9, oy - lw * 0.9, ow + fw * 1.8, oh + lw * 0.9, R + fw * 0.9);
    c.strokeStyle = IRON_HI; c.lineWidth = 1; c.stroke();
    outer(); c.strokeStyle = IRON_LO; c.lineWidth = 3; c.stroke();
    rrect(c, ox, oy, ow, oh, R); c.strokeStyle = IRON_LO; c.lineWidth = 5; c.stroke();
    rrect(c, ox, oy, ow, oh, R); c.strokeStyle = WATER[2]!; c.lineWidth = 2; c.stroke();
    dots(c, rnd, ox - fw, oy - lw, ow + 2 * fw, oh + lw + sill, wide ? 900 : 500, [IRON_LO, '#3A4C42', IRON[0]!]);
    grain(c, rnd, ox - fw, oy - lw, ow + 2 * fw, lw, 8, IRON_LO, 80);
    c.restore();
    {
      const d = fw * 0.52, rx = ox - d, ry = oy - d, rw = ow + 2 * d, rh = oh + 2 * d, rr = R + d;
      const total = 2 * (rw - 2 * rr) + 2 * (rh - 2 * rr) + TAU * rr;
      const n = Math.round(total / (21 * u));
      for (let i = 0; i < n; i += 1) {
        const [x, y] = rrPoint(rx, ry, rw, rh, rr, (i / n) * total);
        if (y < oy1 - 6) rivet(c, x, y, 2.1 * u);
      }
    }

    // ── Brass straps clamped over the frame: two across the lintel, one on each side ──
    const strap = (x: number, y: number, sw: number, sh: number) => {
      block(c, IRON_LO, x - 1, y - 1, sw + 2, sh + 2); block(c, BRASS[0]!, x, y, sw, sh); block(c, BRASS[1]!, x, y, sw, sh * 0.6); block(c, BRASS[2]!, x, y, sw, 1);
      block(c, BRASS[2]!, x, y, 1, sh);
      for (const [rx, ry] of [[x + sw * 0.5, y + 3 * u], [x + sw * 0.5, y + sh - 3 * u]] as const) { disc(c, BRASS[0]!, rx + 0.4, ry + 0.5, 1.8 * u); disc(c, BRASS[2]!, rx, ry, 1.4 * u); }
    };
    if (wide) {
      for (const f of [0.2, 0.8]) strap(Math.round(ox + ow * f - 6 * u), oy - lw - 1, Math.round(12 * u), lw + 4);
      for (const y of [oy + oh * 0.3, oy + oh * 0.74]) { strap(ox - fw - 1, Math.round(y), fw + 4, Math.round(11 * u)); strap(ox1 - 3, Math.round(y), fw + 4, Math.round(11 * u)); }
    } else {
      for (const f of [0.25, 0.75]) strap(Math.round(ox + ow * f - 4 * u), oy - lw - 1, Math.round(9 * u), lw + 3);
    }

    // ── The one slim vertical bar, with its collars ──
    const mx = g.mullX, mw = Math.round(7 * u);
    block(c, IRON_LO, mx - 1, oy, mw + 2, oh); block(c, IRON[1]!, mx, oy, mw, oh); block(c, IRON[2]!, mx + 1, oy, mw - 3, oh); block(c, IRON_HI, mx, oy, 1, oh); block(c, IRON_LO, mx + mw - 1.5, oy, 1.5, oh);
    for (const y of [oy, oy + oh * 0.45, oy1 - g.rail - 7 * u]) {
      block(c, IRON_LO, mx - 3 * u - 1, y, mw + 6 * u + 2, 8 * u + 1); block(c, IRON[2]!, mx - 3 * u, y, mw + 6 * u, 7 * u); block(c, IRON_HI, mx - 3 * u, y, mw + 6 * u, 1);
      rivet(c, mx - 1 * u, y + 3.5 * u, 1.2 * u); rivet(c, mx + mw + 1 * u, y + 3.5 * u, 1.2 * u);
    }

    // ── The scrolled railing along the foot of the viewport ──
    const rt = oy1 - g.rail, rb = oy1, bar = Math.max(3, Math.round(4 * u));
    c.save(); rrect(c, ox - 2, oy, ow + 4, oh + 4, R); c.clip();
    const ri = (rb - bar) - (rt + bar), r0 = Math.min(ri * 0.47, 10.5 * u), M = 4 * r0 + 19 * u, mid = (rt + rb) / 2;
    c.lineCap = 'round';
    const lace = () => {
      c.beginPath();
      let n = 0;
      for (let x0 = ox - 4; x0 < ox + ow; x0 += M, n += 1) {
        // A horizontal S of two opposed scrolls, then a ring; every other one turned the other way.
        const d = n % 2 ? 1 : -1, xa = x0 + 3 * u + r0, xb = xa + 2 * r0;
        for (let i = 22; i >= 0; i -= 1) {
          const q = i / 22, r = r0 * (1 - 0.74 * q), a = d * q * 1.55 * Math.PI;
          if (i === 22) c.moveTo(xa + Math.cos(a) * r, mid + Math.sin(a) * r); else c.lineTo(xa + Math.cos(a) * r, mid + Math.sin(a) * r);
        }
        for (let i = 1; i <= 22; i += 1) {
          const q = i / 22, r = r0 * (1 - 0.74 * q), a = Math.PI + d * q * 1.55 * Math.PI;
          c.lineTo(xb + Math.cos(a) * r, mid + Math.sin(a) * r);
        }
        c.moveTo(xb + r0 + 12 * u, mid); c.arc(xb + r0 + 8 * u, mid, 4 * u, 0, TAU);
        c.moveTo(xb + r0 + 8 * u + 1.5, mid); c.arc(xb + r0 + 8 * u, mid, 1.5, 0, TAU);
      }
    };
    lace(); c.strokeStyle = IRON_LO; c.lineWidth = 4.4; c.stroke();
    lace(); c.strokeStyle = '#506A5C'; c.lineWidth = 2; c.stroke();
    lace(); c.strokeStyle = '#8CA898'; c.lineWidth = 0.8; c.stroke();
    c.lineCap = 'butt';
    for (let x0 = ox - 4; x0 < ox + ow + M; x0 += M) {
      const px = x0 - 2 * u;
      block(c, IRON_LO, px - 1, rt, 4.5 * u + 2, rb - rt); block(c, IRON[2]!, px, rt, 4.5 * u, rb - rt); block(c, IRON_HI, px, rt, 1, rb - rt);
      disc(c, IRON_LO, px + 2.2 * u, rt - 2.5 * u, 3.2 * u + 1); disc(c, IRON[2]!, px + 2.2 * u, rt - 2.5 * u, 3.2 * u); block(c, IRON_HI, px + 1.2 * u, rt - 3.8 * u, 1.5, 1.5);
    }
    block(c, IRON_LO, ox - 2, rt - 1, ow + 4, bar + 2); block(c, IRON[2]!, ox - 2, rt, ow + 4, bar); block(c, IRON_HI, ox - 2, rt, ow + 4, 1);
    block(c, IRON_LO, ox - 2, rb - bar - 1, ow + 4, bar + 2); block(c, IRON[1]!, ox - 2, rb - bar, ow + 4, bar); block(c, IRON_HI, ox - 2, rb - bar, ow + 4, 1);
    c.restore();

    // ── The sill, and the timber ledge: planked top, brass lip, and its dark front ──
    const fx0 = ox - fw, fx1 = ox1 + fw;
    block(c, IRON[1]!, fx0 - 3 * u, oy1, fx1 - fx0 + 6 * u, sill); block(c, IRON_HI, fx0 - 3 * u, oy1, fx1 - fx0 + 6 * u, 1); block(c, IRON_LO, fx0 - 3 * u, oy1 + sill - 2, fx1 - fx0 + 6 * u, 2);
    block(c, TIMBER[0]!, 0, tb, w, tf - tb);
    const pl = (tf - tb) / 3;
    for (let i = 0; i < 3; i += 1) {
      block(c, ['#3E2E20', '#4A3724', '#42301F'][i % 3]!, 0, tb + i * pl, w, pl);
      block(c, TIMBER[2]!, 0, tb + i * pl, w, 1);
      block(c, TIMBER_LO, 0, tb + (i + 1) * pl - 2, w, 2);
      for (let x = rnd() * 120; x < w; x += 90 + rnd() * 160) block(c, TIMBER_LO, x, tb + i * pl, 2, pl);
    }
    grain(c, rnd, 0, tb, w, tf - tb, wide ? 70 : 40, TIMBER_LO, 130);
    grain(c, rnd, 0, tb, w, tf - tb, wide ? 36 : 20, '#54402C', 100);
    dots(c, rnd, 0, tb, w, tf - tb, wide ? 1800 : 900, [TIMBER_LO, '#4A3624', '#201610', '#5C4630']);
    for (let i = 0; i < (wide ? 4 : 2); i += 1) {
      const kx = rnd() * w, ky = tb + pl * (0.5 + Math.floor(rnd() * 3));
      oval(c, TIMBER_LO, kx, ky, 6 * u, 2.4 * u); oval(c, '#33241A', kx, ky, 3.8 * u, 1.4 * u);
    }
    const lip = Math.max(3, Math.round(4 * u));
    block(c, BRASS[0]!, 0, tf, w, lip); block(c, BRASS[1]!, 0, tf, w, lip - 1.5); block(c, BRASS[2]!, 0, tf, w, 1);
    for (let x = 14 * u; x < w; x += 34 * u) { disc(c, BRASS[0]!, x, tf + lip / 2, 1.3); block(c, BRASS[2]!, x - 1, tf + lip / 2 - 1, 1, 1); }
    block(c, TIMBER[0]!, 0, tf + lip, w, h);
    block(c, TIMBER[1]!, 0, tf + lip, w, 2);
    grain(c, rnd, 0, tf + lip, w, h - tf - lip, wide ? 16 : 8, TIMBER_LO, 160);
    dots(c, rnd, 0, tf + lip, w, h - tf - lip, wide ? 400 : 200, [TIMBER_LO, '#33241A']);
    block(c, TIMBER_LO, 0, h - 2, w, 2);

    // ── On the ledge, painted once: a bottle, a rolled chart, a spyglass, the ship's wheel ──
    const ou = u * 1.3;
    const yb = g.yb;
    const bx = g.bottleX, bw = 11 * ou, bh = 20 * ou;
    oval(c, TIMBER_LO, bx + 2, yb + 3 * ou, bw * 0.9, 2.4 * ou);
    rrect(c, bx - bw / 2, yb + 2 * ou - bh, bw, bh, [3, 3, 2, 2]); c.fillStyle = '#3A2210'; c.fill();
    poly(c, '#3A2210', [bx - bw / 2 + 1, yb + 2 * ou - bh + 2, bx - 2 * ou, yb + 2 * ou - bh - 7 * ou, bx + 2 * ou, yb + 2 * ou - bh - 7 * ou, bx + bw / 2 - 1, yb + 2 * ou - bh + 2]);
    block(c, '#B8923E', Math.round(bx - bw / 2 + 1.5), Math.round(yb + 2 * ou - bh + 3), 1.5, bh - 6);
    block(c, PAPER, bx - bw * 0.36, yb + 2 * ou - bh * 0.62, bw * 0.72, 7 * ou); block(c, PAPER_LO, bx - bw * 0.36, yb + 2 * ou - bh * 0.62 + 7 * ou - 1, bw * 0.72, 1);
    block(c, '#8A6A3C', bx - 2 * ou, yb + 2 * ou - bh - 11 * ou, 4 * ou, 4.5 * ou); block(c, '#B89A60', bx - 2 * ou, yb + 2 * ou - bh - 11 * ou, 4 * ou, 1);
    const cx0 = g.chartX, cw = (wide ? 46 : 38) * ou, chh = 9 * ou;
    {
      // A chart lying open under the roll: a skewed sheet, a dotted route, an X, a curled corner.
      const fl = (wide ? 70 : 46) * ou, y0 = yb + 8 * ou, y1 = yb + 0.5 * ou, sk = 9 * ou;
      poly(c, TIMBER_LO, [cx0 - 8 * ou + 2, y0 + 2, cx0 + fl + 2, y0 + 2, cx0 + fl + sk + 2, y1 + 2, cx0 - 8 * ou + sk + 2, y1 + 2]);
      poly(c, PAPER_LO, [cx0 - 8 * ou, y0, cx0 + fl, y0, cx0 + fl + sk, y1, cx0 - 8 * ou + sk, y1]);
      poly(c, PAPER, [cx0 - 8 * ou, y0 - 1.5, cx0 + fl, y0 - 1.5, cx0 + fl + sk, y1, cx0 - 8 * ou + sk, y1]);
      c.fillStyle = '#7A5A30';
      for (let i = 0; i < 12; i += 1) {
        const f = i / 11;
        c.fillRect(Math.round(cx0 + 4 * ou + f * (fl - 16 * ou) + sk * 0.5), Math.round(y1 + (y0 - y1) * (0.5 + Math.sin(f * 5) * 0.3)), 2, 1);
      }
      c.strokeStyle = '#A02A1C'; c.lineWidth = 1.4; c.beginPath();
      c.moveTo(cx0 + fl * 0.8 - 2, y1 + 2); c.lineTo(cx0 + fl * 0.8 + 3, y0 - 3); c.moveTo(cx0 + fl * 0.8 + 3, y1 + 2); c.lineTo(cx0 + fl * 0.8 - 2, y0 - 3); c.stroke();
      poly(c, PAPER_LO, [cx0 + fl - 6 * ou, y0 - 1.5, cx0 + fl, y0 - 1.5, cx0 + fl - 1, y0 - 5 * ou]);
    }
    oval(c, TIMBER_LO, cx0 + cw / 2 + 2, yb + 3.5 * ou, cw * 0.58, 3 * ou);
    block(c, PAPER_LO, cx0, yb - chh + 3 * ou, cw, chh); block(c, PAPER, cx0, yb - chh + 3 * ou, cw, chh - 2 * ou); block(c, PAPER_HI, cx0, yb - chh + 3 * ou, cw, 1.5);
    oval(c, '#C2B27A', cx0, yb - chh / 2 + 3 * ou, 3.2 * ou, chh / 2); oval(c, '#8A7A48', cx0, yb - chh / 2 + 3 * ou, 1.6 * ou, chh / 3);
    oval(c, PAPER_LO, cx0 + cw, yb - chh / 2 + 3 * ou, 3 * ou, chh / 2);
    for (const f of [0.28, 0.72]) block(c, '#6A3A1C', cx0 + cw * f, yb - chh + 2.5 * ou, 3, chh + 1.5);
    dots(c, rnd, cx0 + 2, yb - chh + 3 * ou, cw - 4, chh - 1, 14, ['#8A7A48', '#B8A870']);
    if (wide) {
      const sx = g.spyX, sy = yb - 1 * ou;
      oval(c, TIMBER_LO, sx + 28 * ou, sy + 3 * ou, 32 * ou, 2.2 * ou);
      for (const [x, wd, hh, col] of [[0, 20, 7, BRASS[1]!], [20, 18, 5.6, BRASS[0]!], [38, 16, 4.4, BRASS[1]!]] as const) {
        block(c, IRON_LO, sx + x * ou, sy - hh * ou - 1, wd * ou, hh * ou + 2); block(c, col, sx + x * ou, sy - hh * ou, wd * ou, hh * ou); block(c, BRASS[2]!, sx + x * ou, sy - hh * ou, wd * ou, 1);
      }
      block(c, '#4A3624', sx + 5 * ou, sy - 7 * ou, 10 * ou, 7 * ou); block(c, '#2A1E14', sx + 5 * ou, sy - 3 * ou, 10 * ou, 1);
      for (const x of [20, 38, 54]) block(c, BRASS[2]!, sx + x * ou - 1, sy - 6 * ou, 1.5, 6 * ou);
      oval(c, '#9ADEC6', sx + 54 * ou, sy - 2.2 * ou, 1.6 * ou, 2.4 * ou);
    }
    // The ship's wheel stands at the far right, on a little timber foot.
    const wr = g.wheelR, wx = g.wheelX, wbase = yb + 6 * u;
    oval(c, TIMBER_LO, wx + 3, wbase + 1, wr * 0.9, 2.8 * u);
    block(c, TIMBER_LO, wx - 6 * u - 1, wbase - 5 * u - 1, 12 * u + 2, 6 * u + 1); block(c, TIMBER[2]!, wx - 6 * u, wbase - 5 * u, 12 * u, 5 * u);
    wheel(c, wx, wbase - 5 * u - wr - 1, wr, 5.2 * u);
  },

  // ── Alive in the cabin, every frame: the lantern, shells, caustics, the frog ──
  over(f, s) {
    const { ctx: c, t } = f;
    const { phase, k } = f.visitor;
    const g = s.g;
    const { yb, u, tb, tf, ox, ow } = g;
    const q = u * (g.wide ? 1.15 : 0.95);

    // Green light drifting over the ledge: two or three flat pale patches, kept faint.
    c.save(); c.beginPath(); c.rect(0, tb, g.W, tf - tb); c.clip();
    c.fillStyle = WATER[3]!;
    for (const [fx, fy, rx, ph] of [[0.12, 0.3, 40, 0], [0.5, 0.64, 56, 2], [0.8, 0.34, 34, 4]] as const) {
      c.globalAlpha = 0.2;
      const x = ox + ow * fx + Math.sin(t / 5200 + ph) * 5, y = tb + (tf - tb) * fy;
      c.beginPath(); c.ellipse(x, y, rx * q, 4.4 * q, 0, 0, TAU); c.fill();
      c.globalAlpha = 0.14;
      c.beginPath(); c.ellipse(x + 10 * q, y + 1, rx * 0.55 * q, 2.4 * q, 0, 0, TAU); c.fill();
    }
    c.restore();
    c.globalAlpha = 1;

    // The lantern's light: a flat warm pool on the ledge and up the wall behind it.
    const lx = g.lampX, wob = Math.sin(t / 700) * 0.8;
    c.save(); c.beginPath(); c.rect(0, 0, g.wide ? g.W : 0, tb + 1); c.clip();
    // Thin washes, so the plates and rivets still show through: light on a wall, not a shape on it.
    c.globalAlpha = 0.07;
    oval(c, '#FFC860', lx, tb + 1, 40 * q + wob, 50 * q);
    oval(c, '#FFC860', lx, tb + 1, 24 * q - wob, 30 * q);
    c.globalAlpha = 1;
    c.restore();
    oval(c, '#5A4220', lx, yb + 2, 60 * q + wob, 7.5 * q);
    oval(c, '#8A6A2C', lx, yb + 2, 40 * q - wob, 5 * q);
    oval(c, '#B8923E', lx, yb + 2, 20 * q + wob, 3 * q);

    // One shell for each quest finished today, in a row along the front of the ledge.
    const n = Math.min(12, Math.max(0, f.done));
    for (let i = 0; i < n; i += 1) {
      const row = g.wide ? 0 : Math.floor(i / 6), col = g.wide ? i : i % 6;
      shell(c, g.shell0 + col * g.shellStep, g.wide ? yb + 7 * u : tf - 3 * u - row * 8.5 * u, g.shellR, i);
    }

    lantern(c, lx, yb + 1, q, t, f.caution);

    // The frog: idle it faces the room, breathing and blinking; while the whale is alongside it turns
    // to face the water and sits up; as the whale leaves it hops once.
    const along = phase === 'stopped' ? 1 : phase === 'arriving' ? clamp01(k * 4) : phase === 'departing' ? 1 - clamp01(k * 6) : 0;
    const hop = phase === 'departing' ? Math.sin(Math.PI * clamp01(k / 0.3)) * 11 * q : 0;
    const swell = 0.5 + 0.5 * Math.sin((t / 4000) * TAU);
    const blink = along < 0.5 && (t / 1000) % 5.3 > 5.12;
    const fx = g.frogX;
    oval(c, TIMBER_LO, fx + 1, yb + 3 * q, 8 * q, 2 * q);
    c.save();
    c.translate(fx, yb + 3 * q - hop);
    c.scale(along > 0.5 ? -1 : 1, 1);
    frog(c, q * 1.3, along > 0.5 ? 1 : 0, swell, blink);
    c.restore();
  },
});
