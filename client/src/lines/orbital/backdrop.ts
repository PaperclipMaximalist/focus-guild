/**
 * The Ring Line's backdrop: space seen through the gaps in the cabin. A fine
 * stipple grain in a violet two shades above the page ground, thicker toward
 * the lower right, and one enormous faint ring arc sweeping across that corner
 * as if a planet sat just off the page. About thirty stars drift left at two
 * to five pixels a second in three sizes, and the largest twinkle slowly.
 * Rarely a single faint sheet of paper tumbles across, taking a minute or more.
 * On a phone, and for reduced motion, it is painted once and left still.
 */

import { defineBackdrop } from '../types';

const TAU = Math.PI * 2;

interface Star { x: number; y: number; v: number; size: number; ph: number }
interface State { stars: Star[] }

export default defineBackdrop<State>({
  layout(w, h, rnd) {
    const stars: Star[] = Array.from({ length: 30 }, (_, i) => ({
      x: rnd() * w,
      y: rnd() * h,
      v: 2 + rnd() * 3,
      size: i % 10 === 0 ? 3 : i % 3 === 0 ? 2 : 1,
      ph: rnd() * TAU,
    }));
    return { stars };
  },

  back({ ctx, w, h, rnd }) {
    // Grain: one path per colour, thicker toward the lower right.
    for (const [col, dens, bias] of [['#1A1330', 0.012, 0.35], ['#150F28', 0.01, 0.2]] as const) {
      ctx.fillStyle = col;
      ctx.beginPath();
      const n = Math.round(w * h * dens);
      for (let i = 0; i < n; i += 1) {
        const x = rnd() * w;
        const y = rnd() * h;
        if (rnd() > bias + (1 - bias) * ((x / w + y / h) / 2) ** 1.5) continue;
        ctx.rect(Math.floor(x), Math.floor(y), 1, 1);
      }
      ctx.fill();
    }
    // The ring: one hairline arc, and a dotted one just inside it.
    const [cx, cy, r] = [w * 1.02, h * 1.12, Math.min(w, h) * 1.0 + w * 0.15];
    ctx.strokeStyle = '#1B1432';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 1.25, r * 0.5, -0.32, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = '#1B1432';
    ctx.beginPath();
    for (let i = 0; i < 1400; i += 1) {
      const a = rnd() * TAU;
      const k = 1.17 + rnd() * 0.05;
      const ex = Math.cos(a) * r * k;
      const ey = Math.sin(a) * r * 0.46 * k;
      ctx.rect(Math.floor(cx + ex * Math.cos(-0.32) - ey * Math.sin(-0.32)), Math.floor(cy + ex * Math.sin(-0.32) + ey * Math.cos(-0.32)), 1, 1);
    }
    ctx.fill();
  },

  draw(f, s) {
    const { ctx, w, h, t, dt, moving } = f;
    for (const st of s.stars) {
      if (moving) {
        st.x -= st.v * dt;
        if (st.x < -4) st.x = w + 4;
      }
      const twinkle = st.size === 3 ? 0.5 + 0.5 * Math.sin(t / 1400 + st.ph) : 1;
      ctx.globalAlpha = (st.size === 3 ? 0.12 + 0.2 * twinkle : st.size === 2 ? 0.2 : 0.14);
      ctx.fillStyle = st.size > 1 ? '#CFC3F5' : '#B9A8F0';
      ctx.fillRect(Math.round(st.x), Math.round(st.y), st.size, st.size);
      if (st.size === 3) {
        ctx.fillRect(Math.round(st.x) - 1, Math.round(st.y) + 1, 5, 1);
        ctx.fillRect(Math.round(st.x) + 1, Math.round(st.y) - 1, 1, 5);
      }
    }
    // Now and then a sheet of paper, 12 px a second, with a long gap between.
    if (moving) {
      const cycle = w + 120 + 12 * 80;
      const px = w + 60 - ((t / 1000) * 12) % cycle;
      if (px > -60) {
        const spin = Math.cos(t / 3600);
        ctx.save();
        ctx.translate(px, h * 0.35 + Math.sin(t / 4200) * 14);
        ctx.rotate(0.5 + Math.sin(t / 3000) * 0.4);
        ctx.scale(Math.max(0.25, Math.abs(spin)), 1);
        ctx.globalAlpha = 0.14;
        ctx.fillStyle = '#E9DDB8';
        ctx.fillRect(-9, -12, 18, 24);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  },
});
