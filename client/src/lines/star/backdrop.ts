/**
 * The Star Guild's backdrop: the nebula outside the lounge in the reference
 * still, behind the whole app.
 *
 * Painted once: near-black indigo; a river of blue-violet cloud running
 * corner to corner; a rose-red glow rising from the lower right, as at the
 * right of the still's window; thin orange filaments drifting through it; and
 * star dust, thousands of points, thickest along the river, with a few bright
 * stars that carry a small cross of light.
 *
 * Alive: about thirty stars that brighten and fade in their own time. Nothing
 * changes with the day. On a phone, and for reduced motion, it is painted once
 * and left. Everything stays darker than a panel, so panels stand off it.
 */

import { defineBackdrop } from '../types';

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

interface Twinkle { x: number; y: number; ph: number; sp: number; r: number }

const cloud = (c: Ctx, x: number, y: number, r: number, rgb: string, a: number) => {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
};

export default defineBackdrop<Twinkle[]>({
  back({ ctx: c, w, h, rnd }) {
    const base = c.createLinearGradient(0, 0, w, h);
    base.addColorStop(0, '#060418');
    base.addColorStop(1, '#0B0722');
    c.fillStyle = base;
    c.fillRect(0, 0, w, h);

    const big = Math.max(w, h);
    // The river of cloud, from the upper left to the lower right.
    for (let i = 0; i < 16; i += 1) {
      const u = i / 15 + (rnd() - 0.5) * 0.08;
      cloud(c, w * u, h * (0.12 + u * 0.7) + (rnd() - 0.5) * h * 0.22, big * (0.12 + rnd() * 0.16), i % 3 ? '58,52,190' : '104,60,210', 0.1 + rnd() * 0.06);
    }
    // The rose-red glow.
    cloud(c, w * 0.98, h * 0.92, big * 0.6, '190,40,110', 0.24);
    cloud(c, w * 0.86, h * 1.02, big * 0.3, '230,70,70', 0.16);

    // Filaments.
    c.lineCap = 'round';
    for (let i = 0; i < 9; i += 1) {
      const x = w * (0.2 + rnd() * 0.75), y = h * (0.1 + rnd() * 0.8), len = 120 + rnd() * 260;
      c.strokeStyle = `rgba(255,${140 + Math.floor(rnd() * 50)},90,${0.05 + rnd() * 0.05})`;
      c.lineWidth = 0.8 + rnd() * 1.4;
      c.beginPath();
      c.moveTo(x, y);
      c.bezierCurveTo(x + len * 0.3, y - 40 - rnd() * 50, x + len * 0.6, y + 30 + rnd() * 60, x + len, y - 20 + rnd() * 40);
      c.stroke();
    }

    // Star dust, thickest along the river.
    const want = Math.min(9000, Math.round((w * h) / 150));
    for (let i = 0; i < want; i += 1) {
      const x = rnd() * w, y = rnd() * h;
      const off = Math.abs(y / h - (0.12 + (x / w) * 0.7));
      if (rnd() > 0.22 + 0.78 * Math.exp(-((off / 0.2) ** 2))) continue;
      const a = 0.12 + rnd() * rnd() * 0.7;
      c.fillStyle = rnd() < 0.2 ? `rgba(255,190,220,${a})` : `rgba(215,210,255,${a})`;
      const s = rnd() < 0.08 ? 1.6 : 1;
      c.fillRect(x, y, s, s);
    }
    // A few bright ones.
    for (let i = 0; i < Math.max(6, (w * h) / 160000); i += 1) {
      const x = rnd() * w, y = rnd() * h, r = 5 + rnd() * 6;
      cloud(c, x, y, r * 1.6, '210,200,255', 0.35);
      c.fillStyle = 'rgba(240,236,255,0.6)';
      c.fillRect(x - r, y - 0.4, r * 2, 0.8);
      c.fillRect(x - 0.4, y - r, 0.8, r * 2);
      c.beginPath();
      c.arc(x, y, 1.2, 0, TAU);
      c.fill();
    }
  },

  layout(w, h, rnd) {
    return Array.from({ length: 30 }, () => ({ x: rnd() * w, y: rnd() * h, ph: rnd() * TAU, sp: 0.4 + rnd() * 1.1, r: 0.8 + rnd() * 0.9 }));
  },

  draw(f, stars) {
    const { ctx: c, t, moving } = f;
    for (const s of stars) {
      const a = moving ? 0.5 + 0.5 * Math.sin((t / 1000) * s.sp + s.ph) : 0.5;
      c.fillStyle = `rgba(232,226,255,${a * 0.34})`;
      c.beginPath();
      c.arc(s.x, s.y, s.r * (0.6 + a * 0.6), 0, TAU);
      c.fill();
    }
  },
});
