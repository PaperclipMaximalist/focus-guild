/**
 * What the Timber Line's surfaces are made of, from the log-cabin sleeper in
 * the reference still: boards, a buttoned red bench, a woven cushion trim.
 *
 *   panel   planed boards laid flat: three planks to a tile, each its own
 *           brown, with long wavering grain, a knot here and there, one butt
 *           joint, and a dark seam with a lit bevel under it
 *   wall    the bench's back, deep red and buttoned: diamond creases, a button
 *           where they cross, a lit facet at the top of each diamond and a
 *           stippled shade at the bottom
 *   accent  the cushion's woven trim, pressed into the honey: a zigzag over a
 *           row of stitches
 *
 * Flat colour only. Every random number is rolled before `wrapped` paints, so
 * the nine copies agree and the tile has no seam.
 */

import { defineTextures, wrapped } from '../types';
import type { Paint } from '../types';

// ── panel: boards ──

const PLANK = ['#2E1E12', '#2A1B10', '#322114'];
const GRAIN_DK = '#25170D', GRAIN_LT = '#3A2718';
const SEAM = '#150C07', BEVEL = '#402B1A', KNOT = '#1C1009';
const PW = 360, PH = 168, ROW = 56;

const panel = (p: Paint) => {
  const { ctx: c, rnd } = p;
  PLANK.forEach((col, r) => {
    c.fillStyle = col;
    c.fillRect(0, r * ROW, PW, ROW);
  });

  interface Grain { y: number; x: number; len: number; bow: number; lit: boolean }
  const grain: Grain[] = [];
  const knots: { x: number; y: number; r: number }[] = [];
  // One butt joint to a tile, in the middle board.
  const joint = Math.floor(90 + rnd() * 180);
  for (let r = 0; r < 3; r += 1) {
    for (let i = 0; i < 13; i += 1) {
      grain.push({ y: r * ROW + 6 + (i % 9) * 5.2 + rnd() * 2, x: rnd() * PW, len: 50 + rnd() * 150, bow: (rnd() - 0.5) * 4, lit: rnd() < 0.35 });
    }
  }
  knots.push({ x: 60 + rnd() * 30, y: ROW * 0.5, r: 4.5 }, { x: 250 + rnd() * 60, y: ROW * 2.5, r: 3.5 });
  const specks = Array.from({ length: 300 }, () => [Math.floor(rnd() * PW), Math.floor(rnd() * PH), rnd() < 0.5] as const);

  wrapped(p, () => {
    c.lineWidth = 1;
    for (const g of grain) {
      c.strokeStyle = g.lit ? GRAIN_LT : GRAIN_DK;
      c.beginPath();
      c.moveTo(g.x, Math.floor(g.y) + 0.5);
      c.quadraticCurveTo(g.x + g.len / 2, Math.floor(g.y) + 0.5 + g.bow, g.x + g.len, Math.floor(g.y) + 0.5);
      c.stroke();
    }
    for (const k of knots) {
      // Grain bending round the knot, then its dark eye.
      for (let ring = 2; ring >= 0; ring -= 1) {
        c.strokeStyle = ring === 1 ? GRAIN_LT : GRAIN_DK;
        c.beginPath();
        c.ellipse(k.x, k.y, (k.r + ring * 4) * 1.9, k.r * 0.6 + ring * 2.4, 0, 0, Math.PI * 2);
        c.stroke();
      }
      c.fillStyle = KNOT;
      c.beginPath();
      c.ellipse(k.x, k.y, k.r, k.r * 0.5, 0, 0, Math.PI * 2);
      c.fill();
    }
    for (const [x, y, lit] of specks) {
      c.fillStyle = lit ? GRAIN_LT : GRAIN_DK;
      c.fillRect(x, y, 1, 1);
    }
  });

  // Seams and the joint last, so the grain stops at them.
  for (let r = 0; r < 3; r += 1) {
    c.fillStyle = SEAM;
    c.fillRect(0, r * ROW, PW, 1);
    c.fillStyle = BEVEL;
    c.fillRect(0, r * ROW + 1, PW, 1);
  }
  c.fillStyle = SEAM;
  c.fillRect(joint, ROW + 1, 1, ROW - 1);
  c.fillStyle = BEVEL;
  c.fillRect(joint + 1, ROW + 2, 1, ROW - 2);
};

// ── wall: the buttoned bench ──

const RED = '#3A1515', RED_LIT = '#451A19', RED_DK = '#2A0E0E', RED_DEEP = '#1C0808';
const BUTTON = '#6A2826', BUTTON_HI = '#A04A40';
const TW = 56;

const wall = (p: Paint) => {
  const { ctx: c, rnd } = p;
  c.fillStyle = RED;
  c.fillRect(0, 0, TW, TW);

  // The two diamonds of one tile are centred on (28, 0) and (0, 28).
  const centres = [[TW / 2, 0], [0, TW / 2]] as const;
  const shade = centres.flatMap(([cx, cy]) =>
    Array.from({ length: 46 }, () => {
      const u = rnd(), v = rnd();
      // Thickest toward the bottom corner of the diamond.
      const dy = 6 + v * v * 19;
      const half = (TW / 2 - dy) * 0.9;
      return [Math.floor(cx + (u - 0.5) * 2 * half), Math.floor(cy + dy)] as const;
    }),
  );

  wrapped(p, () => {
    for (const [cx, cy] of centres) {
      // The lit facet: a smaller diamond, pushed up.
      c.fillStyle = RED_LIT;
      c.beginPath();
      c.moveTo(cx, cy - 21);
      c.lineTo(cx + 15, cy - 6);
      c.lineTo(cx, cy + 3);
      c.lineTo(cx - 15, cy - 6);
      c.closePath();
      c.fill();
    }
    c.fillStyle = RED_DK;
    for (const [x, y] of shade) c.fillRect(x, y, 1, 1);
    // Creases along both diagonals, through the buttons.
    c.lineWidth = 2;
    c.strokeStyle = RED_DK;
    c.beginPath();
    c.moveTo(-4, -4);
    c.lineTo(TW + 4, TW + 4);
    c.moveTo(-4, TW + 4);
    c.lineTo(TW + 4, -4);
    c.stroke();
    for (const [bx, by] of [[0, 0], [TW / 2, TW / 2]] as const) {
      c.fillStyle = RED_DEEP;
      c.beginPath();
      c.arc(bx, by, 4.5, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = BUTTON;
      c.beginPath();
      c.arc(bx, by, 3, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = BUTTON_HI;
      c.fillRect(bx - 2, by - 2, 2, 1);
      c.fillRect(bx - 2, by - 1, 1, 1);
    }
  });
};

// ── accent: the woven trim ──

const INK = '#1A1204';

const accent = (p: Paint) => {
  const { ctx: c } = p;
  c.globalAlpha = 0.17;
  c.strokeStyle = INK;
  c.fillStyle = INK;
  c.lineWidth = 1.5;
  wrapped(p, () => {
    c.beginPath();
    c.moveTo(-1, 9);
    c.lineTo(4, 3);
    c.lineTo(9, 9);
    c.lineTo(14, 3);
    c.lineTo(19, 9);
    c.stroke();
    // A stitch under each peak.
    c.fillRect(3, 11, 2, 1);
    c.fillRect(13, 11, 2, 1);
  });
  c.globalAlpha = 1;
};

export default defineTextures({
  panel: { w: PW, h: PH, paint: panel },
  wall: { w: TW, h: TW, paint: wall },
  accent: { w: 20, h: 14, paint: accent },
});
