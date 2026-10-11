/**
 * The Night Line's backdrop: rain against the building, behind the whole app.
 * Fine stipple two shades above the ground, long faint vertical streaks as if
 * the page were a wet wall (a few ending in a pale bead), and one or two very
 * large faint slabs of the city anchored to the bottom corners. About thirty
 * raindrops fall, slanted, a little slowly (never more than 15 px a second,
 * never more than 30 % opaque).
 *
 * State: nothing changes with the day. On a phone, and for reduced motion, the
 * wall is painted once and the drops hold still where they are. Flat colour
 * only; it stays within two shades of the ground so it is never mistaken for
 * part of the interface.
 */

import { defineBackdrop } from '../types';

const GROUND = ['#0A0D26', '#0C1030', '#080B20'];
const SLAB = '#090C24';
const BEAD = '#1A2052';

interface Drop { x: number; y: number; v: number; len: number; a: number }

export default defineBackdrop<Drop[]>({
  back({ ctx: c, w, h, rnd }) {
    // One or two very large slabs of the city, faint, anchored to the bottom corners.
    c.fillStyle = SLAB;
    for (const side of [0, 1]) {
      let x = side ? w - 10 : -10;
      for (let i = 0; i < 5; i += 1) {
        const bw = 60 + rnd() * 90;
        const bh = h * (0.12 + rnd() * 0.3);
        const bx = side ? x - bw : x;
        c.fillRect(bx, h - bh, bw, bh);
        x += side ? -bw - 4 : bw + 4;
      }
    }
    // Fine stipple two shades above the ground.
    const n = Math.min(15000, Math.round((w * h) / 110));
    GROUND.concat(['#10153A']).forEach((col) => {
      c.fillStyle = col; c.beginPath();
      for (let i = 0; i < n / 4; i += 1) c.rect(Math.floor(rnd() * w), Math.floor(rnd() * h), 1, 1);
      c.fill();
    });
    // Streaks as down a wet wall: long, faint, vertical, some ending in a bead.
    c.lineWidth = 1;
    for (let i = 0; i < Math.round(w / 70); i += 1) {
      const x = Math.floor(rnd() * w) + 0.5;
      const y0 = rnd() * h * 0.8;
      const len = 60 + rnd() * 260;
      c.strokeStyle = i % 3 ? '#0E1236' : '#12183F';
      c.beginPath();
      c.moveTo(x, y0);
      c.quadraticCurveTo(x + (rnd() - 0.5) * 3, y0 + len / 2, x + (rnd() - 0.5) * 2, y0 + len);
      c.stroke();
      if (i % 2 === 0) { c.fillStyle = BEAD; c.fillRect(Math.round(x) - 1, Math.round(y0 + len), 2, 3); }
    }
    // A seam of the wall's cladding here and there.
    c.fillStyle = '#070A1E';
    for (let y = 140 + rnd() * 60; y < h; y += 200 + rnd() * 120) c.fillRect(0, Math.floor(y), w, 2);
  },

  layout(w, h, rnd) {
    return Array.from({ length: 30 }, () => ({ x: rnd() * (w + 60), y: rnd() * h, v: 8 + rnd() * 7, len: 6 + rnd() * 9, a: 0.14 + rnd() * 0.15 }));
  },

  draw(f, drops) {
    const { ctx: c, w, h, dt, moving } = f;
    c.lineWidth = 1;
    for (const d of drops) {
      if (moving) {
        d.y += d.v * dt;
        d.x -= d.v * dt * 0.18;
        if (d.y > h + 10) { d.y = -d.len; d.x = f.rnd() * (w + 60); }
        if (d.x < -10) d.x = w + 10;
      }
      c.strokeStyle = `rgba(190, 208, 255, ${d.a})`;
      c.beginPath();
      c.moveTo(d.x, d.y);
      c.lineTo(d.x + d.len * 0.18, d.y - d.len);
      c.stroke();
    }
  },
});
