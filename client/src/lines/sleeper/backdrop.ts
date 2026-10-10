/**
 * The Timber Line's backdrop: the room's own wood behind the whole app. Long,
 * broken, uneven grain lines run across the page two shades above the ground,
 * with a knot here and there and a fine stipple over them. About twelve autumn
 * leaves, dim amber and rust, drift down and sideways, slowly, each turning as
 * it falls (never more than 30 % opaque, never faster than 10 px a second).
 *
 * State: nothing changes with the day. On a phone, and for reduced motion, the
 * wood is painted once and the leaves hold still where they are. Flat colour
 * only; it stays within two shades of the ground so it is never mistaken for
 * part of the interface.
 */

import { defineBackdrop } from '../types';

const GRAIN = ['#18110D', '#1D150F', '#130D0A'];
const LEAVES = ['#8A5A22', '#7A3A1A', '#9A6A2A'];

interface Leaf { x: number; y: number; vy: number; vx: number; ph: number; turn: number; s: number; c: number }

export default defineBackdrop<Leaf[]>({
  back({ ctx: c, w, h, rnd }) {
    // Grain: long wavering lines, broken into uneven runs.
    GRAIN.forEach((col, ci) => {
      c.strokeStyle = col;
      c.lineWidth = ci === 1 ? 1.4 : 1;
      c.beginPath();
      for (let y = 3 + ci * 2; y < h; y += 6 + rnd() * 5) {
        let x = -rnd() * 200;
        while (x < w) {
          const len = 30 + rnd() * 260;
          if (rnd() < 0.72) {
            const yy = Math.floor(y + (rnd() - 0.5) * 2) + 0.5;
            c.moveTo(x, yy);
            c.quadraticCurveTo(x + len / 2, yy + (rnd() - 0.5) * 3, x + len, yy + (rnd() - 0.5) * 2);
          }
          x += len + 10 + rnd() * 120;
        }
      }
      c.stroke();
    });
    // A plank seam every so often, a little darker than the ground.
    c.fillStyle = '#0B0807';
    for (let y = 70 + rnd() * 30; y < h; y += 96 + rnd() * 60) c.fillRect(0, Math.floor(y), w, 2);
    // Knots: rings of grain bending round a dark eye.
    const knots = Math.max(3, Math.round((w * h) / 120000));
    for (let i = 0; i < knots; i += 1) {
      const kx = rnd() * w, ky = rnd() * h, r = 7 + rnd() * 9;
      for (let ring = 3; ring >= 0; ring -= 1) {
        c.strokeStyle = ring % 2 ? '#1D150F' : '#18110D';
        c.lineWidth = 1.2;
        c.beginPath();
        c.ellipse(kx, ky, (r + ring * 5) * 1.8, r * 0.55 + ring * 2.6, 0, 0, Math.PI * 2);
        c.stroke();
      }
      c.fillStyle = '#0D0907';
      c.beginPath();
      c.ellipse(kx, ky, r * 0.9, r * 0.38, 0, 0, Math.PI * 2);
      c.fill();
    }
    // Fine stipple over everything.
    const n = Math.min(14000, Math.round((w * h) / 140));
    ['#1C140F', '#0C0806', '#21180F'].forEach((col) => {
      c.fillStyle = col;
      c.beginPath();
      for (let i = 0; i < n / 3; i += 1) c.rect(Math.floor(rnd() * w), Math.floor(rnd() * h), 1, 1);
      c.fill();
    });
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
