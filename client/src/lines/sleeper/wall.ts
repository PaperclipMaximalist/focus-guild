/**
 * What is alive on the Timber Line's sidebar: strings of fairy lights hung
 * across the buttoned bench, and a little warm dust in the air.
 *
 * One string runs tight along the very top. Two more sag across the spare
 * room between the menu and the rank, when the screen is tall enough to have
 * any. Each bulb is a cap, a glass and, when lit, a flat pale ring of light.
 *
 *   idle       the bulbs twinkle, each in its own time: most lit, a few resting
 *   boarding   every bulb lit and steady, with a wider ring
 *   caution    every fourth bulb burns amber
 *   still      (reduced motion) every bulb lit, nothing moves
 *
 * The menu takes the top 510 px and the rank and the duck the bottom 180 px;
 * nothing here crosses either, apart from the top string above the app's name.
 */

import { defineWall } from '../types';

const WIRE = '#170C0A', CAP = '#120807';
const LIT = '#FFE2A0', LIT_HI = '#FFFBE8', RESTING = '#7A5630', AMBER = '#F58A3C', DUST = '#E8B870';

interface Bulb { x: number; y: number; ph: number; sp: number; big: boolean; n: number }
interface Mote { x: number; y: number; vy: number; ph: number }
interface State { bulbs: Bulb[]; strings: { x0: number; y0: number; x1: number; y1: number; sag: number }[]; motes: Mote[] }

const MENU = 510, FOOT = 180;

export default defineWall<State>({
  layout(w, h, rnd) {
    const strings = [{ x0: -4, y0: 1, x1: w + 4, y1: 1, sag: 7 }];
    const room = h - FOOT - MENU;
    if (room > 50) strings.push({ x0: -4, y0: MENU + 4, x1: w + 4, y1: MENU + 18, sag: Math.min(30, room - 30) });
    if (room > 150) strings.push({ x0: -4, y0: MENU + 96, x1: w + 4, y1: MENU + 70, sag: 34 });
    const bulbs: Bulb[] = [];
    strings.forEach((s, si) => {
      const count = si === 0 ? 9 : 7;
      for (let i = 0; i < count; i += 1) {
        const u = (i + 0.5 + (rnd() - 0.5) * 0.3) / count;
        bulbs.push({
          x: s.x0 + (s.x1 - s.x0) * u,
          y: s.y0 + (s.y1 - s.y0) * u + s.sag * 4 * u * (1 - u),
          ph: rnd() * 6.28,
          sp: 0.35 + rnd() * 0.5,
          big: si > 0,
          n: bulbs.length,
        });
      }
    });
    const motes = Array.from({ length: 9 }, () => ({ x: rnd() * w, y: rnd() * h, vy: 3 + rnd() * 4, ph: rnd() * 6.28 }));
    return { bulbs, strings, motes };
  },

  draw(f, s) {
    const { ctx: c, w, h, t, dt, moving, boarding, caution } = f;

    c.strokeStyle = WIRE;
    c.lineWidth = 1;
    for (const g of s.strings) {
      c.beginPath();
      c.moveTo(g.x0, g.y0);
      // A quadratic through the lowest point of the sag.
      c.quadraticCurveTo((g.x0 + g.x1) / 2, (g.y0 + g.y1) / 2 + g.sag * 2, g.x1, g.y1);
      c.stroke();
    }

    for (const b of s.bulbs) {
      const lit = !moving || boarding || Math.sin((t / 1000) * b.sp + b.ph) > -0.55;
      const amber = caution && b.n % 4 === 0;
      const r = b.big ? 3 : 2;
      const cy = b.y + 2 + r;
      c.fillStyle = CAP;
      c.fillRect(Math.round(b.x) - 1, Math.round(b.y), 2, 3);
      if (lit) {
        c.globalAlpha = 0.1;
        c.fillStyle = amber ? AMBER : LIT;
        c.beginPath();
        c.arc(b.x, cy, r + (boarding ? 8 : 5), 0, Math.PI * 2);
        c.fill();
        c.globalAlpha = 1;
      }
      c.fillStyle = lit ? (amber ? AMBER : LIT) : RESTING;
      c.beginPath();
      c.ellipse(b.x, cy, r * 0.8, r, 0, 0, Math.PI * 2);
      c.fill();
      if (lit) {
        c.fillStyle = LIT_HI;
        c.fillRect(Math.round(b.x) - 1, Math.round(cy) - 1, 1, 1);
      }
    }

    // Dust rising through the lamplight.
    c.fillStyle = DUST;
    for (const m of s.motes) {
      if (moving) {
        m.y -= m.vy * dt;
        m.ph += dt * 0.6;
        if (m.y < -4) m.y = h + 4;
      }
      c.globalAlpha = 0.16 + 0.1 * Math.sin(m.ph);
      c.fillRect(Math.round(m.x + Math.sin(m.ph) * 6) % w, Math.round(m.y), 2, 2);
    }
    c.globalAlpha = 1;
  },
});
