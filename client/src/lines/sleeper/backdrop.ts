/**
 * The Timber Line's backdrop: the cabin's log wall behind the whole app.
 * Round logs lie one on another across the page, each about 46 px thick: a lit
 * band along the top of its curve, the brown of its side, a shaded belly, and
 * a line of dark chinking where it meets the next. Grain runs along each log
 * in short broken strokes, with a knot every so often and a stipple in the
 * shade. About twelve autumn leaves, dim amber and rust, drift down and
 * sideways, slowly, each turning as it falls (never more than 30 % opaque,
 * never faster than 10 px a second).
 *
 * State: nothing changes with the day. On a phone, and for reduced motion, the
 * wall is painted once and the leaves hold still where they are. Flat colour
 * only, and every tone darker than the boards that sit on it.
 */

import { defineBackdrop } from '../types';

const CHINK = '#090504', BELLY = '#130B07', SIDE = '#1C110A', LIT = '#26180E', RIM = '#2E1D11';
const GRAIN_DK = '#150C07', GRAIN_LT = '#2A1B10';
const LEAVES = ['#8A5A22', '#7A3A1A', '#9A6A2A'];
const LOG = 46;

interface Leaf { x: number; y: number; vy: number; vx: number; ph: number; turn: number; s: number; c: number }

export default defineBackdrop<Leaf[]>({
  back({ ctx: c, w, h, rnd }) {
    for (let y = -6; y < h; y += LOG) {
      // One log, top to bottom: rim, lit band, side, belly, chinking.
      c.fillStyle = SIDE;
      c.fillRect(0, y, w, LOG);
      c.fillStyle = RIM;
      c.fillRect(0, y + 3, w, 2);
      c.fillStyle = LIT;
      c.fillRect(0, y + 5, w, 9);
      c.fillStyle = BELLY;
      c.fillRect(0, y + LOG - 13, w, 10);
      c.fillStyle = CHINK;
      c.fillRect(0, y + LOG - 3, w, 3 + 3);
      c.fillStyle = BELLY;
      c.fillRect(0, y, w, 3);

      // Grain: short broken strokes along the log.
      for (let i = 0; i < 5; i += 1) {
        const gy = y + 8 + i * 6;
        c.fillStyle = i < 2 ? GRAIN_LT : GRAIN_DK;
        let x = -rnd() * 120;
        while (x < w) {
          const len = 24 + rnd() * 150;
          if (rnd() < 0.6) c.fillRect(Math.floor(x), gy + Math.floor(rnd() * 3), Math.floor(len), 1);
          x += len + 20 + rnd() * 110;
        }
      }
      // The stepped edge between the lit band and the side: a row of dashes.
      c.fillStyle = LIT;
      for (let x = rnd() * 9; x < w; x += 7 + rnd() * 9) c.fillRect(Math.floor(x), y + 14, 3 + Math.floor(rnd() * 4), 1);
      // Stipple in the belly.
      c.fillStyle = CHINK;
      for (let i = 0; i < w / 7; i += 1) c.fillRect(Math.floor(rnd() * w), y + LOG - 14 + Math.floor(rnd() * 10), 1, 1);
      // A knot or two: rings round a dark eye.
      for (let k = 0; k < w / 900; k += 1) {
        if (rnd() < 0.45) continue;
        const kx = rnd() * w, ky = y + 17 + rnd() * 10, r = 4 + rnd() * 4;
        c.lineWidth = 1;
        for (let ring = 2; ring >= 1; ring -= 1) {
          c.strokeStyle = ring === 2 ? GRAIN_DK : GRAIN_LT;
          c.beginPath();
          c.ellipse(kx, ky, (r + ring * 3.5) * 1.7, r * 0.5 + ring * 2, 0, 0, Math.PI * 2);
          c.stroke();
        }
        c.fillStyle = CHINK;
        c.beginPath();
        c.ellipse(kx, ky, r, r * 0.45, 0, 0, Math.PI * 2);
        c.fill();
      }
    }
  },

  layout(w, h, rnd) {
    return Array.from({ length: 12 }, () => ({
      x: rnd() * w, y: rnd() * h, vy: 5 + rnd() * 5, vx: 2 + rnd() * 4, ph: rnd() * 6.28, turn: 0.4 + rnd() * 0.6, s: 4 + rnd() * 3, c: Math.floor(rnd() * 3),
    }));
  },

  draw(f, leaves) {
    const { ctx: c, w, h, dt, moving } = f;
    for (const l of leaves) {
      if (moving) {
        l.y += l.vy * dt;
        l.ph += l.turn * dt;
        l.x += (l.vx + Math.sin(l.ph * 1.7) * 3) * dt;
        if (l.y > h + 10) { l.y = -10; l.x = f.rnd() * w; }
        if (l.x > w + 10) l.x = -10;
      }
      c.save();
      c.translate(l.x, l.y);
      c.rotate(l.ph);
      c.globalAlpha = 0.3;
      c.fillStyle = LEAVES[l.c]!;
      c.beginPath();
      c.moveTo(-l.s, 0);
      c.quadraticCurveTo(0, -l.s * 0.75 * Math.cos(l.ph * 1.3), l.s, 0);
      c.quadraticCurveTo(0, l.s * 0.75 * Math.cos(l.ph * 1.3), -l.s, 0);
      c.fill();
      c.restore();
    }
    c.globalAlpha = 1;
  },
});
