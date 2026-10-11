/**
 * What the Spire Guild's surfaces are made of, from the airship deck over the
 * cathedral city in the reference still: iron-bound chests and hanging banners.
 *
 *   panel   the lid of a chest: dark green-black iron, softly mottled, with
 *           the chests' diamond inlay engraved across it as a faint lattice
 *           (a dark cut with a lit edge beside it)
 *   wall    banner cloth: a damask of the guild's sigil, a sun with eight
 *           rays, woven tone on tone in half-drop rows, with the weave's
 *           threads running down it
 *   accent  small engraved diamonds, pressed into the gold
 *
 * Painted smooth: soft light is radial fades, never dots. Everything random
 * is rolled before `wrapped` paints, so the tiles have no seam.
 */

import { defineTextures, wrapped } from '../types';
import type { Paint } from '../types';

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

/** A soft round patch of light or shade. */
const blot = (c: Ctx, x: number, y: number, r: number, rgb: string, a: number) => {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
};

// ── panel: the chest lid ──

const PS = 240, CELL = 60;

const panel = (p: Paint) => {
  const { ctx: c, rnd } = p;
  c.fillStyle = '#11261F';
  c.fillRect(0, 0, PS, PS);
  const blots = Array.from({ length: 14 }, () => ({ x: rnd() * PS, y: rnd() * PS, r: 40 + rnd() * 70, lit: rnd() < 0.5, a: 0.05 + rnd() * 0.06 }));
  wrapped(p, () => {
    for (const b of blots) blot(c, b.x, b.y, b.r, b.lit ? '38,84,68' : '4,12,9', b.a);
  });
  // The inlay: two families of diagonals, each a dark cut with a lit edge.
  const cut = (dx: number, col: string, a: number) => {
    c.globalAlpha = a;
    c.strokeStyle = col;
    c.lineWidth = 1;
    c.beginPath();
    for (let k = -PS; k <= PS * 2; k += CELL) {
      c.moveTo(k + dx, 0);
      c.lineTo(k + dx + PS, PS);
      c.moveTo(k + dx, PS);
      c.lineTo(k + dx + PS, 0);
    }
    c.stroke();
  };
  cut(0, '#050E0B', 0.8);
  cut(1.2, '#3A7A64', 0.24);
  c.globalAlpha = 1;
};

// ── wall: banner damask ──

const WW = 120, WH = 168;

/** The guild's sigil: a ring, a diamond in it, four long rays and four short. */
export const sigil = (c: Ctx, x: number, y: number, s: number) => {
  c.beginPath();
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * TAU - Math.PI / 2;
    const long = i % 2 === 0;
    const r0 = s * 0.62, r1 = s * (long ? 1.25 : 0.95), half = long ? 0.13 : 0.1;
    c.moveTo(x + Math.cos(a - half) * r0, y + Math.sin(a - half) * r0);
    c.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
    c.lineTo(x + Math.cos(a + half) * r0, y + Math.sin(a + half) * r0);
    c.closePath();
  }
  c.fill();
  c.beginPath();
  c.arc(x, y, s * 0.5, 0, TAU);
  c.arc(x, y, s * 0.38, 0, TAU, true);
  c.fill();
  c.beginPath();
  c.moveTo(x, y - s * 0.26);
  c.lineTo(x + s * 0.2, y);
  c.lineTo(x, y + s * 0.26);
  c.lineTo(x - s * 0.2, y);
  c.closePath();
  c.fill();
};

const wall = (p: Paint) => {
  const { ctx: c, rnd } = p;
  c.fillStyle = '#0C1C17';
  c.fillRect(0, 0, WW, WH);
  const blots = Array.from({ length: 8 }, () => ({ x: rnd() * WW, y: rnd() * WH, r: 30 + rnd() * 50, lit: rnd() < 0.5 }));
  wrapped(p, () => {
    for (const b of blots) blot(c, b.x, b.y, b.r, b.lit ? '30,70,56' : '2,8,6', 0.09);
    // The woven pattern: a sigil, a leaf-shaped flourish either side, and a small diamond between rows.
    for (const [sx, sy] of [[WW / 2, WH * 0.25], [0, WH * 0.75], [WW, WH * 0.75]] as const) {
      c.fillStyle = '#17352B';
      sigil(c, sx, sy, 17);
      c.strokeStyle = '#17352B';
      c.lineWidth = 1.6;
      c.lineCap = 'round';
      for (const m of [-1, 1]) {
        c.beginPath();
        c.moveTo(sx + m * 26, sy + 6);
        c.bezierCurveTo(sx + m * 40, sy - 6, sx + m * 46, sy + 22, sx + m * 34, sy + 30);
        c.bezierCurveTo(sx + m * 26, sy + 35, sx + m * 22, sy + 26, sx + m * 29, sy + 22);
        c.stroke();
      }
      c.beginPath();
      c.moveTo(sx, sy + 34);
      c.lineTo(sx + 5, sy + 42);
      c.lineTo(sx, sy + 50);
      c.lineTo(sx - 5, sy + 42);
      c.closePath();
      c.fill();
    }
  });
  // Threads.
  for (let x = 0; x < WW; x += 3) {
    c.fillStyle = x % 6 === 0 ? 'rgba(120,200,170,0.035)' : 'rgba(0,0,0,0.10)';
    c.fillRect(x, 0, 1, WH);
  }
};

// ── accent: engraved diamonds ──

const accent = (p: Paint) => {
  const { ctx: c } = p;
  c.globalAlpha = 0.16;
  c.strokeStyle = '#1B1203';
  c.lineWidth = 1;
  wrapped(p, () => {
    for (const [x, y] of [[0, 0], [9, 7]] as const) {
      c.beginPath();
      c.moveTo(x, y - 4);
      c.lineTo(x + 5, y);
      c.lineTo(x, y + 4);
      c.lineTo(x - 5, y);
      c.closePath();
      c.stroke();
    }
  });
  c.globalAlpha = 1;
};

export default defineTextures({
  panel: { w: PS, h: PS, paint: panel },
  wall: { w: WW, h: WH, paint: wall },
  accent: { w: 18, h: 14, paint: accent },
});
