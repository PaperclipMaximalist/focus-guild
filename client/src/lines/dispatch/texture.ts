/**
 * What the Salvage Line's surfaces are made of, from the scrap-dispatch still:
 * olive-brass instrument plate, a riveted copper boiler, and the green screen's
 * scan lines.
 *
 *   panel   an instrument plate in olive brass: a fine engineering grid every
 *           24 px like the yellow screen's, every fourth line cut a step deeper,
 *           short scratches at odd angles, a fine pitting of dots, and one bloom
 *           of rust stippled in orange-brown. No rivets: they are on the frame
 *   wall    the boiler: two copper plates, each 80 px wide, with a dark seam
 *           between them and a lit edge beside it, a domed rivet every 30 px on
 *           either side of each seam, rust running down from some of them, and
 *           patches of verdigris stipple
 *   accent  scan lines, one pixel in three, pressed into the enamel
 *
 * Flat colour only. Every random number is rolled before `wrapped` paints, so
 * the nine copies agree and the tile has no seam.
 */

import { defineTextures, wrapped } from '../types';
import type { Paint } from '../types';

// ── panel: the instrument plate ──

const BRASS = '#2A2614', GRID = '#312D19', GRID_DK = '#221F10';
const PIT_LT = '#2F2B18', PIT_DK = '#25210F', PIT_DEEP = '#1E1B0D';
const SCR_LT = '#363119', SCR_DK = '#1F1C0F';
const RUST = ['#3A2A14', '#33240F', '#2F2210'];
const PW = 288, PH = 192, CELL = 24;

const panel = (p: Paint) => {
  const { ctx: c, rnd } = p;
  c.fillStyle = BRASS;
  c.fillRect(0, 0, PW, PH);

  // Everything random is rolled here.
  const pits = Array.from({ length: 2600 }, () => [Math.floor(rnd() * PW), Math.floor(rnd() * PH), rnd()] as const);
  const scratches = Array.from({ length: 18 }, () => {
    const a = rnd() * Math.PI;
    const len = 5 + rnd() * 17;
    return { x: rnd() * PW, y: rnd() * PH, dx: Math.cos(a) * len, dy: Math.sin(a) * len, lit: rnd() < 0.5 };
  });
  const bx = 70 + rnd() * 150, by = 50 + rnd() * 90;
  const bloom = Array.from({ length: 340 }, () => {
    const a = rnd() * Math.PI * 2;
    const r = 24 * Math.pow(rnd(), 0.8) * (0.55 + 0.45 * rnd());
    return [Math.floor(bx + Math.cos(a) * r * 1.3), Math.floor(by + Math.sin(a) * r * 0.85), Math.floor(rnd() * 3)] as const;
  });
  // Where the rust has run a little, downward.
  const runs = Array.from({ length: 5 }, () => [Math.floor(bx + (rnd() - 0.5) * 36), Math.floor(by + 8 + rnd() * 10), 4 + Math.floor(rnd() * 12)] as const);

  // The grid is aligned to the tile's own edges, so it needs no wrapping.
  for (let i = 0; i < PW / CELL; i += 1) {
    c.fillStyle = i % 4 === 0 ? GRID_DK : GRID;
    c.fillRect(i * CELL, 0, 0.5, PH);
  }
  for (let j = 0; j < PH / CELL; j += 1) {
    c.fillStyle = j % 4 === 0 ? GRID_DK : GRID;
    c.fillRect(0, j * CELL, PW, 0.5);
  }

  wrapped(p, () => {
    for (const [x, y, v] of pits) {
      c.fillStyle = v < 0.45 ? PIT_LT : v < 0.93 ? PIT_DK : PIT_DEEP;
      c.fillRect(x, y, 1, 1);
    }
    c.lineWidth = 0.5;
    for (const s of scratches) {
      c.strokeStyle = s.lit ? SCR_LT : SCR_DK;
      c.beginPath();
      c.moveTo(s.x, s.y);
      c.lineTo(s.x + s.dx, s.y + s.dy);
      c.stroke();
    }
    for (const [x, y, k] of bloom) {
      c.fillStyle = RUST[k]!;
      c.fillRect(x, y, 1, 1);
    }
    c.fillStyle = RUST[1]!;
    for (const [x, y, n] of runs) for (let i = 0; i < n; i += 1) if (i % 3 !== 2) c.fillRect(x, y + i, 1, 1);
  });
};

// ── wall: the copper boiler ──

const COPPER = ['#3A2010', '#3D2312'];
const SEAM = '#1E0F07', LIT = '#4E2C16', SEAM_SH = '#2C170B';
const DOME = '#472812', DOME_HI = '#583318', DOME_SH = '#1E0F07';
const STREAK = '#26110A', STREAK_RUST = '#4A2612';
const GREEN = '#23382E', GREEN_DK = '#1B2D24';
const FLK_LT = '#432512', FLK_DK = '#311A0C';
const WW = 160, WH = 240, PLATE = 80, STEP = 30;

const wall = (p: Paint) => {
  const { ctx: c, rnd } = p;
  COPPER.forEach((col, i) => {
    c.fillStyle = col;
    c.fillRect(i * PLATE, 0, PLATE, WH);
  });

  const seams = [0, PLATE];
  const flecks = Array.from({ length: 1900 }, () => [Math.floor(rnd() * WW), Math.floor(rnd() * WH), rnd() < 0.5] as const);
  // A rivet on either side of each seam, every 30 px; rust runs from some of them.
  const rivets: { x: number; y: number }[] = [];
  seams.forEach((sx, si) => {
    for (let y = 15; y < WH; y += STEP) {
      rivets.push({ x: sx - 8, y: y + (si ? 15 : 0) }, { x: sx + 9, y: y + (si ? 15 : 0) });
    }
  });
  const streaks = rivets
    .filter(() => rnd() < 0.55)
    .map((r) => ({ x: Math.floor(r.x), y: r.y + 3, len: 12 + Math.floor(rnd() * 34), wide: rnd() < 0.4, drift: rnd() < 0.3 }));
  const patches = seams.flatMap((sx) =>
    Array.from({ length: 2 }, () => ({ x: sx + (rnd() < 0.5 ? -16 : 18) + rnd() * 6, y: rnd() * WH, r: 8 + rnd() * 9 })),
  );
  const moss = patches.flatMap((q) =>
    Array.from({ length: 70 }, () => {
      const a = rnd() * Math.PI * 2;
      const r = q.r * Math.pow(rnd(), 0.7);
      return [Math.floor(q.x + Math.cos(a) * r * 0.8), Math.floor(q.y + Math.sin(a) * r * 1.2), rnd() < 0.3] as const;
    }),
  );

  wrapped(p, () => {
    for (const [x, y, lt] of flecks) {
      c.fillStyle = lt ? FLK_LT : FLK_DK;
      c.fillRect(x, y, 1, 1);
    }
    // The seams: a lit edge on the right, a shadow on the left, the dark crack between.
    for (const sx of seams) {
      c.fillStyle = SEAM_SH;
      c.fillRect(sx - 4, 0, 3, WH);
      c.fillStyle = LIT;
      c.fillRect(sx + 1, 0, 3, WH);
      c.fillStyle = SEAM;
      c.fillRect(sx - 1, 0, 2, WH);
    }
    for (const s of streaks) {
      c.fillStyle = STREAK;
      c.fillRect(s.x, s.y, s.wide ? 2 : 1, s.len);
      c.fillStyle = STREAK_RUST;
      for (let i = 2; i < s.len; i += 4) c.fillRect(s.x + (s.drift && i > s.len / 2 ? 1 : 0) + (s.wide ? 2 : 1), s.y + i, 1, 2);
    }
    for (const [x, y, dk] of moss) {
      c.fillStyle = dk ? GREEN_DK : GREEN;
      c.fillRect(x, y, 1, 1);
    }
    for (const r of rivets) {
      // Shadow below and to the right, the dome, its highlight.
      c.fillStyle = DOME_SH;
      c.beginPath();
      c.arc(r.x + 0.8, r.y + 1.4, 3, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = DOME;
      c.beginPath();
      c.arc(r.x, r.y, 2.5, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = DOME_HI;
      c.fillRect(r.x - 1.5, r.y - 1.5, 1.5, 1);
    }
  });
};

// ── accent: scan lines ──

const INK = '#06101F';

const accent = (p: Paint) => {
  const { ctx: c } = p;
  c.fillStyle = INK;
  // One pixel in three; every fourth line a little stronger, so the screen seems to roll.
  [0.15, 0.12, 0.12, 0.19].forEach((a, i) => {
    c.globalAlpha = a;
    c.fillRect(0, i * 3, 12, 1);
  });
  c.globalAlpha = 1;
};

export default defineTextures({
  panel: { w: PW, h: PH, paint: panel },
  wall: { w: WW, h: WH, paint: wall },
  accent: { w: 12, h: 12, paint: accent },
});
