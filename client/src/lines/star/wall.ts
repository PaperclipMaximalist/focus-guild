/**
 * What is alive on the Star Guild's sidebar: the guild's flag, flying from a
 * slim mast in the spare room between the menu and the rank, and small stars
 * that open and close across the bulkhead.
 *
 * The flag is the one in the reference still, flying outside the lounge:
 * indigo cloth with a white device on it (ours is a ringed planet and a star).
 * A wave runs along it all the time, and faint scan lines cross it, as if it
 * were projected.
 *
 *   idle       the device is white, the mast-head light lavender
 *   boarding   the device and the flag's edge turn rose and glow
 *   caution    the mast-head light is amber
 *   still      (reduced motion) the flag is held mid-wave, lit as above
 *
 * On a short screen there is no spare room and only the stars are drawn. The
 * menu takes the top 510 px and the rank the bottom 180 px; the flag keeps out
 * of both, and the stars over them are small and faint.
 */

import { defineWall } from '../types';
import { insignia, spark } from './texture';

const TAU = Math.PI * 2;
const MENU = 510, FOOT = 180;

interface Star { x: number; y: number; ph: number; sp: number; r: number; rose: boolean }
interface State { stars: Star[]; top: number; drop: number }

export default defineWall<State>({
  layout(w, h, rnd) {
    const room = h - FOOT - MENU;
    return {
      stars: Array.from({ length: 16 }, (_, i) => ({ x: 8 + rnd() * (w - 26), y: rnd() * h, ph: rnd() * TAU, sp: 0.5 + rnd() * 0.9, r: 2 + rnd() * 2.4, rose: i % 5 === 0 })),
      top: MENU + 12,
      drop: room >= 110 ? Math.min(room - 24, 170) : 0,
    };
  },

  draw(f, s) {
    const { ctx: c, w, t, moving, boarding, caution } = f;

    // Stars opening and closing.
    for (const st of s.stars) {
      const a = moving ? 0.5 + 0.5 * Math.sin((t / 1000) * st.sp + st.ph) : 0.6;
      if (a < 0.15) continue;
      c.globalAlpha = a * 0.34;
      c.fillStyle = st.rose ? '#FF85B8' : '#E8E2FF';
      spark(c, st.x, st.y, st.r * (0.5 + a * 0.5));
    }
    c.globalAlpha = 1;
    if (!s.drop) return;

    const x0 = 34, x1 = w - 34, y0 = s.top + 10, H = Math.min(s.drop - 34, 110);
    const mast = H + 30;
    // The mast.
    c.fillStyle = '#07051E';
    c.fillRect(x0 - 4, s.top, 3.5, mast);
    c.fillStyle = 'rgba(232,226,255,0.6)';
    c.fillRect(x0 - 4, s.top, 1, mast);
    const lamp = caution ? '255,162,77' : '169,156,255';
    const lg = c.createRadialGradient(x0 - 2.2, s.top, 0, x0 - 2.2, s.top, 12);
    lg.addColorStop(0, `rgba(${lamp},0.6)`);
    lg.addColorStop(1, `rgba(${lamp},0)`);
    c.fillStyle = lg;
    c.fillRect(x0 - 16, s.top - 14, 28, 28);
    c.fillStyle = `rgb(${lamp})`;
    c.beginPath();
    c.arc(x0 - 2.2, s.top, 2.6, 0, TAU);
    c.fill();

    // The cloth: a wave that grows toward the fly.
    const N = 22, len = x1 - x0;
    const wave = (u: number) => Math.sin(u * 5.2 - (moving ? t / 420 : 1.1)) * 6.5 * u + Math.sin(u * 2.3 - (moving ? t / 900 : 0.4)) * 3 * u;
    const edge = () => {
      c.beginPath();
      for (let i = 0; i <= N; i += 1) {
        const u = i / N;
        c.lineTo(x0 + len * u, y0 + wave(u));
      }
      for (let i = N; i >= 0; i -= 1) {
        const u = i / N;
        c.lineTo(x0 + len * u, y0 + H + wave(u) * 1.1 - u * 6);
      }
      c.closePath();
    };
    edge();
    const cloth = c.createLinearGradient(x0, 0, x1, 0);
    cloth.addColorStop(0, '#3F36B8');
    cloth.addColorStop(0.55, '#2A2390');
    cloth.addColorStop(1, '#3B2FAE');
    c.fillStyle = cloth;
    c.fill();
    c.save();
    c.clip();
    // Folds follow the wave: light on the crests, shade in the troughs.
    for (let i = 0; i < N; i += 1) {
      const u = (i + 0.5) / N;
      const slope = wave(u + 0.02) - wave(u - 0.02);
      c.fillStyle = slope > 0 ? `rgba(4,2,30,${Math.min(0.4, slope * 0.5)})` : `rgba(200,190,255,${Math.min(0.26, -slope * 0.36)})`;
      c.fillRect(x0 + len * (i / N), y0 - 12, len / N + 0.6, H + 30);
    }
    // Scan lines.
    c.fillStyle = 'rgba(255,255,255,0.05)';
    for (let y = y0 - 10; y < y0 + H + 14; y += 3) c.fillRect(x0, y, len, 1);
    c.restore();

    // The device, riding the wave at the middle of the cloth.
    const mx = x0 + len * 0.52, my = y0 + H * 0.5 + wave(0.52);
    const ink = boarding ? '#FF9CC8' : '#FFFFFF';
    if (boarding) {
      c.shadowColor = 'rgba(255,125,180,0.9)';
      c.shadowBlur = 12;
    }
    c.fillStyle = ink;
    c.strokeStyle = ink;
    insignia(c, mx, my, Math.min(24, H * 0.3));
    c.shadowBlur = 0;
    edge();
    c.strokeStyle = boarding ? 'rgba(255,133,184,0.85)' : 'rgba(200,190,255,0.5)';
    c.lineWidth = 1.2;
    c.stroke();
  },
});
