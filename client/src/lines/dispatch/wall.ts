/**
 * What is alive on the Salvage Line's sidebar, laid over the copper boiler:
 * a row of five indicator lamps along the very top edge, a pale green scan line
 * that sweeps the whole height of the sidebar, and puffs of steam from a pipe
 * stub on the right edge.
 *
 *   idle       the lamps light one after another in a chase and then rest; the
 *              scan line takes seven seconds to go from the top to the foot;
 *              four puffs rise from the stub, drift left and thin to nothing
 *   boarding   every lamp lit and steady, the scan line brighter and quicker,
 *              six puffs and a faster rise
 *   caution    the last lamp burns amber and does not chase
 *   still      (reduced motion) every lamp lit, the scan line a third of the way
 *              down, the puffs frozen at different heights
 *
 * The menu takes the top 510 px and the rank and the duck the bottom 180 px:
 * the stub and its steam live in the spare room between them, and are left out
 * when there is none. Over the menu, only the lamps and the scan line.
 */

import { defineWall } from '../types';

const HOUSING = '#0C0704', RING = '#6A4020';
const GREEN = '#4BE083', GREEN_HI = '#A8F5C4', GREEN_OFF = '#123A22', GREEN_OFF_HI = '#1E5A34';
const AMBER = '#FFA640', AMBER_HI = '#FFD060';
const SCAN = '#A8F5C4';
const PIPE = '#6A4020', PIPE_HI = '#9A6234', PIPE_DK = '#2A150A', PIPE_RUST = '#8A3A1E', STEAM = '#D8D0B8';

const MENU = 510, FOOT = 180;
const LAMPS = [20, 70, 120, 170, 220];

interface Lobe { dx: number; dy: number; r: number }
interface Puff { off: number; lobes: Lobe[]; drift: number; sway: number }
interface State { puffs: Puff[]; stubY: number; steam: boolean; rise: number }

export default defineWall<State>({
  layout(_w, h, rnd) {
    const room = h - FOOT - MENU;
    const puffs = Array.from({ length: 6 }, (_, i) => ({
      off: (i + rnd() * 0.5) / 6,
      lobes: Array.from({ length: 3 }, (__, k) => ({ dx: (k - 1) * 3 + (rnd() - 0.5) * 2, dy: (rnd() - 0.5) * 3, r: 2.6 + rnd() * 1.6 })),
      drift: 10 + rnd() * 14,
      sway: rnd() * 6.28,
    }));
    // The stub sits at the foot of the spare room; the steam climbs most of the way up it.
    return { puffs, stubY: h - FOOT - 26, steam: room >= 70, rise: Math.min(130, room - 24) };
  },

  draw(f, s) {
    const { ctx: c, w, h, t, moving, boarding, caution } = f;
    const sec = moving ? t / 1000 : 0;

    // ── steam, under the lamps and the scan ──
    if (s.steam) {
      const sx = w - 22, sy = s.stubY;
      // The stub: a pipe out of the edge, a flange, a nozzle with a rust band.
      c.fillStyle = PIPE_DK;
      c.fillRect(sx - 1, sy - 1, 23, 13);
      c.fillStyle = PIPE;
      c.fillRect(sx, sy, 22, 11);
      c.fillStyle = PIPE_HI;
      c.fillRect(sx, sy, 22, 2);
      c.fillStyle = PIPE_DK;
      c.fillRect(sx, sy + 9, 22, 2);
      c.fillStyle = PIPE_RUST;
      c.fillRect(sx + 12, sy, 3, 11);
      c.fillStyle = PIPE_DK;
      c.fillRect(sx - 4, sy - 3, 4, 17);
      c.fillStyle = PIPE_HI;
      c.fillRect(sx - 4, sy - 3, 1, 17);
      c.fillStyle = PIPE_DK;
      c.fillRect(sx + 2, sy - 5, 8, 6);
      c.fillStyle = PIPE;
      c.fillRect(sx + 3, sy - 4, 6, 5);
      c.fillStyle = PIPE_HI;
      c.fillRect(sx + 3, sy - 4, 2, 4);

      const count = boarding ? 6 : 4;
      const life = boarding ? 2.6 : 3.6;
      c.fillStyle = STEAM;
      for (let i = 0; i < count; i += 1) {
        const pf = s.puffs[i]!;
        const k = (sec / life + pf.off * (6 / count) + (moving ? 0 : i / count)) % 1;
        const x = sx + 6 - k * pf.drift + Math.sin(sec * 0.8 + pf.sway) * 2 * k;
        const y = sy - 6 - k * s.rise;
        const grow = 0.6 + k * 1.6;
        c.globalAlpha = 0.5 * Math.pow(1 - k, 1.3);
        for (const l of pf.lobes) {
          c.beginPath();
          c.arc(x + l.dx * grow, y + l.dy * grow, l.r * grow, 0, Math.PI * 2);
          c.fill();
        }
      }
      c.globalAlpha = 1;
    }

    // ── the scan line ──
    const y = moving ? ((sec / 7) % 1) * (h + 12) - 6 : h * 0.33;
    c.fillStyle = SCAN;
    c.globalAlpha = boarding ? 0.14 : 0.08;
    c.fillRect(0, Math.round(y), w, 2);
    c.globalAlpha = boarding ? 0.05 : 0.03;
    c.fillRect(0, Math.round(y) - 3, w, 2);
    c.globalAlpha = 1;

    // ── the lamps ──
    const step = Math.floor(sec / 0.24) % 9;
    LAMPS.forEach((x, i) => {
      const last = i === LAMPS.length - 1;
      const amber = caution && last;
      const lit = !moving || boarding || amber || step === i || step === i + 1;
      c.fillStyle = HOUSING;
      c.beginPath();
      c.arc(x, 6, 4.5, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = RING;
      c.fillRect(x - 4, 10, 8, 1);
      if (lit) {
        c.globalAlpha = boarding ? 0.2 : 0.14;
        c.fillStyle = amber ? AMBER : GREEN;
        c.beginPath();
        c.arc(x, 6, 8, 0, Math.PI * 2);
        c.fill();
        c.globalAlpha = 1;
      }
      c.fillStyle = lit ? (amber ? AMBER : GREEN) : GREEN_OFF;
      c.beginPath();
      c.arc(x, 6, 3, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = lit ? (amber ? AMBER_HI : GREEN_HI) : GREEN_OFF_HI;
      c.fillRect(x - 2, 4, 1, 1);
    });
  },
});
