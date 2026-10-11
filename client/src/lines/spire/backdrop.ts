/**
 * The Spire Guild's backdrop: the cathedral city in green mist, as it is seen
 * from the airship's deck in the reference still, behind the whole app.
 *
 * Painted once: a dark sky that lightens to a soft emerald glow at the middle,
 * shafts of light slanting through it, and three ranks of towers rising from
 * the bottom edge. The far rank is the palest, half lost in mist; the near one
 * is almost black. Every tower is a stepped body under a pointed spire with
 * pinnacles at its shoulders, pricked with small amber windows. Bands of fog
 * lie across their feet.
 *
 * Alive: about twenty embers drifting up, slow and faint. Nothing changes with
 * the day. On a phone, and for reduced motion, it is painted once and left.
 * Everything stays darker than a panel, so panels stand off it.
 */

import { defineBackdrop } from '../types';

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

interface Ember { x: number; y: number; vy: number; ph: number; r: number }

/** One tower standing on `base`: tiers that narrow as they rise, a spire, pinnacles and windows. */
const tower = (c: Ctx, x: number, base: number, wd: number, ht: number, col: string, lit: number, rnd: () => number) => {
  c.fillStyle = col;
  let y = base, half = wd / 2;
  const tiers = 2 + Math.floor(rnd() * 3);
  const bodies: [number, number, number, number][] = [];
  for (let i = 0; i < tiers; i += 1) {
    const th = (ht * 0.72) / tiers * (0.8 + rnd() * 0.4);
    c.fillRect(x - half, y - th, half * 2, th + 1);
    bodies.push([x - half, y - th, half * 2, th]);
    // Pinnacles at this tier's shoulders.
    for (const m of [-1, 1]) {
      c.beginPath();
      c.moveTo(x + m * half, y - th);
      c.lineTo(x + m * (half - 3), y - th - 10 - rnd() * 8);
      c.lineTo(x + m * (half - 6), y - th);
      c.closePath();
      c.fill();
    }
    y -= th;
    half *= 0.62 + rnd() * 0.16;
  }
  c.beginPath();
  c.moveTo(x - half, y);
  c.lineTo(x, y - ht * 0.28 - half * 2);
  c.lineTo(x + half, y);
  c.closePath();
  c.fill();
  // Windows.
  for (const [bx, by, bw, bh] of bodies) {
    for (let wy = by + 6; wy < by + bh - 5; wy += 9) {
      for (let wx = bx + 4; wx < bx + bw - 4; wx += 7) {
        if (rnd() < 0.68) continue;
        c.fillStyle = `rgba(255,${150 + Math.floor(rnd() * 50)},70,${lit * (0.5 + rnd() * 0.5)})`;
        c.fillRect(wx, wy, 2, 3.4);
      }
    }
  }
};

export default defineBackdrop<Ember[]>({
  back({ ctx: c, w, h, rnd }) {
    const sky = c.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#040B09');
    sky.addColorStop(0.5, '#0A211B');
    sky.addColorStop(1, '#06120F');
    c.fillStyle = sky;
    c.fillRect(0, 0, w, h);
    const glow = c.createRadialGradient(w * 0.6, h * 0.5, 0, w * 0.6, h * 0.5, Math.max(w, h) * 0.62);
    glow.addColorStop(0, 'rgba(46,150,118,0.26)');
    glow.addColorStop(1, 'rgba(46,150,118,0)');
    c.fillStyle = glow;
    c.fillRect(0, 0, w, h);

    // Shafts of light through the mist.
    for (let i = 0; i < 5; i += 1) {
      const x = w * (0.2 + rnd() * 0.7), wd = 60 + rnd() * 140;
      const ray = c.createLinearGradient(x, 0, x - h * 0.25, h);
      ray.addColorStop(0, 'rgba(120,230,190,0.07)');
      ray.addColorStop(1, 'rgba(120,230,190,0)');
      c.fillStyle = ray;
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x + wd, 0);
      c.lineTo(x + wd * 1.6 - h * 0.3, h);
      c.lineTo(x - h * 0.3, h);
      c.closePath();
      c.fill();
    }

    const ranks: [string, number, number, number, number][] = [
      // colour, window light, shortest and tallest (as shares of the height), step
      ['#0D2A23', 0.3, 0.42, 0.78, 190],
      ['#0A201A', 0.42, 0.28, 0.55, 150],
      ['#061511', 0.5, 0.14, 0.34, 120],
    ];
    ranks.forEach(([col, lit, lo, hi, step], ri) => {
      for (let x = -40 + rnd() * 80; x < w + 60; x += step * (0.55 + rnd() * 0.9)) {
        tower(c, x, h, 44 + rnd() * 70, h * (lo + rnd() * (hi - lo)), col, lit, rnd);
      }
      // Fog at the feet of each rank.
      const fog = c.createLinearGradient(0, h * (0.62 + ri * 0.1), 0, h);
      fog.addColorStop(0, 'rgba(30,110,88,0)');
      fog.addColorStop(1, `rgba(30,110,88,${0.2 - ri * 0.04})`);
      c.fillStyle = fog;
      c.fillRect(0, h * 0.6, w, h * 0.4);
    });
  },

  layout(w, h, rnd) {
    return Array.from({ length: 20 }, () => ({ x: rnd() * w, y: rnd() * h, vy: 4 + rnd() * 8, ph: rnd() * TAU, r: 0.8 + rnd() }));
  },

  draw(f, embers) {
    const { ctx: c, h, dt, moving } = f;
    for (const e of embers) {
      if (moving) {
        e.y -= e.vy * dt;
        e.ph += dt * 0.6;
        if (e.y < -6) e.y = h + 6;
      }
      const x = e.x + Math.sin(e.ph) * 9;
      const a = 0.14 + 0.1 * Math.sin(e.ph * 2.1);
      c.fillStyle = `rgba(255,170,70,${a * 0.3})`;
      c.beginPath();
      c.arc(x, e.y, e.r * 3.2, 0, TAU);
      c.fill();
      c.fillStyle = `rgba(255,210,130,${a})`;
      c.beginPath();
      c.arc(x, e.y, e.r, 0, TAU);
      c.fill();
    }
  },
});
