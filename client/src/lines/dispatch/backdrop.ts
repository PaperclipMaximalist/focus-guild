/**
 * The Salvage Line's backdrop: dust in the works. The page is one wall of the
 * cockpit: a rust speckle two shades above the page ground, heavier toward the
 * bottom, and a few very large plate seams (long straight hairlines with a
 * rivet dot every so often) two shades up. About thirty dust specks drift right
 * and slightly down, slowly and faintly. On a phone, and for reduced motion, it
 * is painted once and left still.
 */

import { defineBackdrop } from '../types';

interface Speck { x: number; y: number; v: number; a: number; size: number }
interface State { dust: Speck[] }

export default defineBackdrop<State>({
  layout(w, h, rnd) {
    const dust: Speck[] = Array.from({ length: 30 }, () => ({
      x: rnd() * w,
      y: rnd() * h,
      v: 3 + rnd() * 7,
      a: 0.1 + rnd() * 0.2,
      size: rnd() < 0.2 ? 2 : 1,
    }));
    return { dust };
  },

  back({ ctx, w, h, rnd }) {
    // Rust speckle: two tones, heavier toward the bottom.
    for (const [col, dens] of [['#221A14', 0.014], ['#281E16', 0.008], ['#150F0B', 0.01]] as const) {
      ctx.fillStyle = col;
      ctx.beginPath();
      const n = Math.round(w * h * dens);
      for (let i = 0; i < n; i += 1) {
        const x = rnd() * w;
        const y = rnd() * h;
        if (rnd() > 0.25 + 0.75 * (y / h) ** 1.4) continue;
        ctx.rect(Math.floor(x), Math.floor(y), 1, 1);
      }
      ctx.fill();
    }
    // Plate seams: long hairlines, each with rivets along it.
    const seam = '#261D16';
    const rivet = '#2E231A';
    const cols = [0.17, 0.52, 0.86].map((f) => Math.round(f * w));
    const rows = [0.3, 0.74].map((f) => Math.round(f * h));
    ctx.fillStyle = seam;
    for (const x of cols) ctx.fillRect(x, 0, 1, h);
    for (const y of rows) ctx.fillRect(0, y, w, 1);
    ctx.fillStyle = rivet;
    ctx.beginPath();
    for (const x of cols) for (let y = 14; y < h; y += 46) ctx.rect(x - 4, y, 2, 2);
    for (const y of rows) for (let x = 20; x < w; x += 46) ctx.rect(x, y - 4, 2, 2);
    ctx.fill();
    // Stains: a few darker streaks below the horizontal seams.
    ctx.fillStyle = '#130E0A';
    ctx.beginPath();
    for (const x of cols) {
      for (let i = 0; i < 160; i += 1) {
        const y = rnd() * h * 0.5;
        ctx.rect(Math.floor(x + 6 + rnd() * 5), Math.floor(rows[0]! + y), 1, 1 + Math.floor(rnd() * 3));
      }
    }
    ctx.fill();
  },

  draw(f, s) {
    const { ctx, w, h, dt, moving } = f;
    for (const d of s.dust) {
      if (moving) {
        d.x += d.v * dt;
        d.y += d.v * 0.15 * dt;
        if (d.x > w + 4) d.x = -4;
        if (d.y > h + 4) d.y = -4;
      }
      ctx.globalAlpha = d.a;
      ctx.fillStyle = '#B59A6A';
      ctx.fillRect(Math.round(d.x), Math.round(d.y), d.size, d.size);
    }
    ctx.globalAlpha = 1;
  },
});
