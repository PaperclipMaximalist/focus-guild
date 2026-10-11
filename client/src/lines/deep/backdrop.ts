/**
 * The Abyssal Line's backdrop: the water beyond the hull, behind the whole app.
 * Mottled stipple in a green two shades above the ground, gathered into large
 * wobbling blotches of flat colour, with a few long kelp fronds rising from the
 * bottom corners. About thirty specks of marine snow sink slowly (never more than
 * 30 % opaque, never faster than 9 px a second), and a few small bubbles rise
 * at the far left.
 *
 * State: nothing changes with the day. On a phone, and for reduced motion, the
 * water is painted once and the specks hold still where they are. Flat colour
 * only; it stays within two shades of the ground so it is never mistaken for
 * part of the interface.
 */

import { defineBackdrop } from '../types';

const TAU = Math.PI * 2;
const GROUND = ['#0A1B16', '#0C201A', '#091812'];
const KELP = '#0D2A21';

interface Speck { x: number; y: number; v: number; dx: number; r: number; ph: number; bub: boolean }

const blob = (c: CanvasRenderingContext2D, rnd: () => number, col: string, cx: number, cy: number, rx: number, ry: number) => {
  const p1 = rnd() * TAU, p2 = rnd() * TAU, p3 = rnd() * TAU;
  const n = Math.max(20, Math.min(90, Math.round((rx + ry) / 6)));
  c.fillStyle = col; c.beginPath();
  for (let i = 0; i <= n; i += 1) {
    const a = (i / n) * TAU;
    const k = 1 + 0.26 * (Math.sin(a * 2 + p1) * 0.5 + Math.sin(a * 3 + p2) * 0.35 + Math.sin(a * 5 + p3) * 0.2);
    if (i) c.lineTo(cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k); else c.moveTo(cx + rx * k, cy);
  }
  c.closePath(); c.fill();
};

export default defineBackdrop<Speck[]>({
  back({ ctx: c, w, h, rnd }) {
    // Large soft blotches: a step lighter, then a smaller one inside it.
    const n = Math.max(6, Math.round((w * h) / 90000));
    for (let i = 0; i < n; i += 1) {
      const cx = rnd() * w, cy = rnd() * h, rx = 90 + rnd() * 200, ry = 50 + rnd() * 110;
      blob(c, rnd, GROUND[0]!, cx, cy, rx, ry);
      blob(c, rnd, GROUND[1]!, cx + rx * 0.1, cy - ry * 0.1, rx * 0.5, ry * 0.5);
    }
    // Long kelp fronds rising from the bottom corners, each a run of leaning, tapering strokes.
    c.strokeStyle = KELP; c.lineCap = 'round';
    for (const side of [0, 1]) {
      for (let i = 0; i < 5; i += 1) {
        const x0 = side ? w - 6 - i * 26 - rnd() * 14 : 6 + i * 26 + rnd() * 14;
        const len = h * (0.22 + rnd() * 0.22), lean = (side ? -1 : 1) * (14 + rnd() * 26), ph = rnd() * TAU;
        const segs = 14;
        for (let s = 0; s < segs; s += 1) {
          const a = s / segs, b = (s + 1) / segs;
          const px = (q: number) => x0 + lean * q + Math.sin(q * 5 + ph) * 8 * q;
          c.lineWidth = 6 * (1 - a * 0.8) + 1;
          c.beginPath(); c.moveTo(px(a), h + 4 - len * a); c.lineTo(px(b), h + 4 - len * b); c.stroke();
          if (s % 3 === 1) {
            c.lineWidth = 1.6; c.beginPath(); c.moveTo(px(a), h + 4 - len * a);
            c.quadraticCurveTo(px(a) + (s % 2 ? 9 : -9), h - len * a - 8, px(a) + (s % 2 ? 13 : -13), h - len * a - 3); c.stroke();
          }
        }
      }
    }
    c.lineCap = 'butt';
    // Mottled stipple over everything.
    const dotsN = Math.min(15000, Math.round((w * h) / 130));
    ['#0B1E18', '#050E0B', '#0D231C'].forEach((col) => {
      c.fillStyle = col; c.beginPath();
      for (let i = 0; i < dotsN / 3; i += 1) c.rect(Math.floor(rnd() * w), Math.floor(rnd() * h), 1, 1);
      c.fill();
    });
    // A faint seam of plate here and there, so the hull is still felt through the water.
    c.fillStyle = '#071410';
    for (let y = 150 + rnd() * 60; y < h; y += 220 + rnd() * 120) c.fillRect(0, Math.floor(y), w, 2);
  },

  layout(w, h, rnd) {
    return Array.from({ length: 34 }, (_, i) => {
      const bub = i >= 28;
      return { x: bub ? 8 + rnd() * Math.min(60, w * 0.1) : rnd() * w, y: rnd() * h, v: bub ? 6 + rnd() * 3 : 3 + rnd() * 5, dx: bub ? 0 : -(1 + rnd() * 2), r: bub ? 2 + rnd() * 2.4 : 0.8 + rnd() * 1.2, ph: rnd() * TAU, bub };
    });
  },

  draw(f, specks) {
    const { ctx: c, w, h, dt, moving, t } = f;
    for (const s of specks) {
      if (moving) {
        s.y += (s.bub ? -s.v : s.v) * dt; s.x += s.dx * dt;
        if (s.bub && s.y < -6) { s.y = h + 6; s.x = 8 + f.rnd() * Math.min(60, w * 0.1); }
        if (!s.bub && s.y > h + 4) { s.y = -4; s.x = f.rnd() * w; }
        if (s.x < -4) s.x = w + 4;
      }
      c.globalAlpha = s.bub ? 0.28 : 0.26;
      if (s.bub) {
        c.strokeStyle = '#4FAE8A'; c.lineWidth = 1; c.beginPath(); c.arc(s.x + Math.sin(t / 1300 + s.ph) * 2, s.y, s.r, 0, TAU); c.stroke();
      } else {
        c.fillStyle = '#6FC9A6'; c.fillRect(Math.round(s.x), Math.round(s.y), s.r > 1.4 ? 2 : 1, s.r > 1.4 ? 2 : 1);
      }
    }
    c.globalAlpha = 1;
  },
});
