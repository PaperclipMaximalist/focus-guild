/**
 * What the Star Guild's surfaces are made of, from the orbital lounge in the
 * reference still: seamless moulded bulkhead plates in violet, cut at angles
 * where they meet, with perforated vent blocks let into them.
 *
 *   panel   a moulded plate: indigo with a soft sheen, one seam across it that
 *           steps down at an angle and back (the way the still's console
 *           plates interlock), and a small block of vent holes under the step
 *   wall    the bulkhead: darker plates, two stepped seams, a recessed strip
 *           with a faint light in it, and a block of hex-packed vent holes
 *           with lit lower rims
 *   accent  the quilting of the suit: a fine diagonal cross-hatch
 *
 * Painted smooth: sheen is a soft fade, never dots. Everything random is
 * rolled before `wrapped` paints, so the tiles have no seam.
 */

import { defineTextures, wrapped } from '../types';
import type { Paint } from '../types';

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

const blot = (c: Ctx, x: number, y: number, r: number, rgb: string, a: number) => {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
};

/** A seam along y that steps down by `drop` between x0 and x1: a dark cut with a lit lip under it. */
const seam = (c: Ctx, w: number, y: number, x0: number, x1: number, drop: number, a = 1) => {
  const run = (dy: number) => {
    c.beginPath();
    c.moveTo(-2, y + dy);
    c.lineTo(x0, y + dy);
    c.lineTo(x0 + drop, y + drop + dy);
    c.lineTo(x1 - drop, y + drop + dy);
    c.lineTo(x1, y + dy);
    c.lineTo(w + 2, y + dy);
    c.stroke();
  };
  c.lineWidth = 1.4;
  c.strokeStyle = `rgba(5,3,28,${0.75 * a})`;
  run(0.5);
  c.lineWidth = 1;
  c.strokeStyle = `rgba(170,160,255,${0.2 * a})`;
  run(1.9);
};

/** A block of vent holes, hex-packed, each with a lit lower rim. */
const vent = (c: Ctx, x: number, y: number, cols: number, rows: number, a = 1) => {
  for (let r = 0; r < rows; r += 1) {
    for (let k = 0; k < cols - (r % 2); k += 1) {
      const hx = x + k * 8 + (r % 2) * 4, hy = y + r * 7;
      c.fillStyle = `rgba(5,3,26,${0.9 * a})`;
      c.beginPath();
      c.arc(hx, hy, 2.3, 0, TAU);
      c.fill();
      c.strokeStyle = `rgba(180,170,255,${0.42 * a})`;
      c.lineWidth = 0.9;
      c.beginPath();
      c.arc(hx, hy, 2.5, 0.2, Math.PI - 0.2);
      c.stroke();
    }
  }
};

/** A four-point star, its sides drawn in toward the middle. */
export const spark = (c: Ctx, x: number, y: number, r: number) => {
  c.beginPath();
  c.moveTo(x, y - r);
  c.quadraticCurveTo(x, y, x + r, y);
  c.quadraticCurveTo(x, y, x, y + r);
  c.quadraticCurveTo(x, y, x - r, y);
  c.quadraticCurveTo(x, y, x, y - r);
  c.fill();
};

/** The guild's device: a ringed planet with a star over its shoulder, in the current fill and stroke. */
export const insignia = (c: Ctx, x: number, y: number, s: number) => {
  c.beginPath();
  c.arc(x - s * 0.12, y + s * 0.12, s * 0.4, 0, TAU);
  c.fill();
  c.lineWidth = Math.max(0.8, s * 0.12);
  c.beginPath();
  c.ellipse(x - s * 0.12, y + s * 0.12, s * 0.8, s * 0.22, -0.38, 0, TAU);
  c.stroke();
  spark(c, x + s * 0.56, y - s * 0.56, s * 0.4);
};

// ── panel ──

const PW = 280, PH = 200;

const panel = (p: Paint) => {
  const { ctx: c, rnd } = p;
  c.fillStyle = '#1C1850';
  c.fillRect(0, 0, PW, PH);
  const blots = Array.from({ length: 12 }, () => ({ x: rnd() * PW, y: rnd() * PH, r: 50 + rnd() * 80, lit: rnd() < 0.55 }));
  wrapped(p, () => {
    for (const b of blots) blot(c, b.x, b.y, b.r, b.lit ? '112,100,255' : '6,4,30', b.lit ? 0.09 : 0.13);
    seam(c, PW, 0, 176, 246, 7, 0.8);
    vent(c, 190, 16, 6, 2, 0.4);
  });
};

// ── wall: the bulkhead ──

const WW = 240, WH = 220;

const wall = (p: Paint) => {
  const { ctx: c, rnd } = p;
  c.fillStyle = '#15123F';
  c.fillRect(0, 0, WW, WH);
  const blots = Array.from({ length: 10 }, () => ({ x: rnd() * WW, y: rnd() * WH, r: 50 + rnd() * 70, lit: rnd() < 0.5 }));
  wrapped(p, () => {
    for (const b of blots) blot(c, b.x, b.y, b.r, b.lit ? '104,92,240' : '4,3,24', b.lit ? 0.1 : 0.16);
    seam(c, WW, 0, 28, 104, 8);
    seam(c, WW, 118, 150, 216, -8);
    // The recessed strip, with a little light in it.
    c.fillStyle = 'rgba(5,3,26,0.7)';
    c.fillRect(-2, 62, WW + 4, 5);
    c.fillStyle = 'rgba(150,110,255,0.3)';
    c.fillRect(-2, 64, WW + 4, 1);
    c.fillStyle = 'rgba(170,160,255,0.16)';
    c.fillRect(-2, 67, WW + 4, 1);
    vent(c, 152, 150, 9, 5);
  });
};

// ── accent: quilting ──

const accent = (p: Paint) => {
  const { ctx: c } = p;
  c.globalAlpha = 0.13;
  c.strokeStyle = '#2A0618';
  c.lineWidth = 1;
  c.beginPath();
  for (let k = -10; k <= 20; k += 10) {
    c.moveTo(k, 0);
    c.lineTo(k + 10, 10);
    c.moveTo(k, 10);
    c.lineTo(k + 10, 0);
  }
  c.stroke();
  c.globalAlpha = 1;
};

export default defineTextures({
  panel: { w: PW, h: PH, paint: panel },
  wall: { w: WW, h: WH, paint: wall },
  accent: { w: 10, h: 10, paint: accent },
});
