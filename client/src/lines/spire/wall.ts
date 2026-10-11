/**
 * What is alive on the Spire Guild's sidebar: the guild's banner, hung from an
 * iron pole in the spare room between the menu and the rank, and embers
 * drifting up past it.
 *
 * The banner is green cloth trimmed in gold with a swallowtail foot and the
 * guild's sigil (a sun with eight rays) worked on it. It stirs all the time:
 * the foot swings a few pixels and soft folds cross it.
 *
 *   idle       the sigil is dull gold
 *   boarding   the sigil is lit: bright gold with a glow, as if the hall were in session
 *   caution    the trim along the foot turns amber
 *   still      (reduced motion) the banner hangs straight, lit as above
 *
 * On a short screen there is no spare room and only the embers are drawn. The
 * menu takes the top 510 px and the rank the bottom 180 px; the banner keeps
 * out of both, and the embers over them are small and faint.
 */

import { defineWall } from '../types';
import { sigil } from './texture';

const TAU = Math.PI * 2;
const MENU = 510, FOOT = 180;

interface Mote { x: number; y: number; vy: number; ph: number; r: number }
interface State { motes: Mote[]; top: number; drop: number }

export default defineWall<State>({
  layout(w, h, rnd) {
    const room = h - FOOT - MENU;
    return {
      motes: Array.from({ length: 12 }, () => ({ x: rnd() * w, y: rnd() * h, vy: 5 + rnd() * 7, ph: rnd() * TAU, r: 0.8 + rnd() * 0.9 })),
      top: MENU + 14,
      drop: room >= 120 ? Math.min(room - 36, 210) : 0,
    };
  },

  draw(f, s) {
    const { ctx: c, w, h, t, dt, moving, boarding, caution } = f;

    if (s.drop) {
      const cx = (w - 10) / 2, bw = Math.min(128, w - 80), y = s.top + 7, H = s.drop;
      const sway = moving ? Math.sin(t / 1900) * 5 + Math.sin(t / 830) * 1.5 : 0;

      // The pole: iron, a spearhead at each end, two rings.
      c.fillStyle = '#050B09';
      c.fillRect(cx - bw / 2 - 16, s.top + 1, bw + 32, 4);
      c.fillStyle = '#4B7D6B';
      c.fillRect(cx - bw / 2 - 16, s.top + 1, bw + 32, 1);
      for (const m of [-1, 1]) {
        c.fillStyle = '#0B1814';
        c.beginPath();
        c.moveTo(cx + m * (bw / 2 + 14), s.top - 3);
        c.lineTo(cx + m * (bw / 2 + 27), s.top + 3);
        c.lineTo(cx + m * (bw / 2 + 14), s.top + 9);
        c.closePath();
        c.fill();
        c.strokeStyle = '#B8893A';
        c.lineWidth = 1.4;
        c.beginPath();
        c.arc(cx + m * (bw / 2 - 12), s.top + 5, 3.4, 0, TAU);
        c.stroke();
      }

      // The cloth.
      const L = cx - bw / 2, R = cx + bw / 2;
      const cloth = () => {
        c.beginPath();
        c.moveTo(L, y);
        c.lineTo(R, y);
        c.bezierCurveTo(R + sway * 0.2, y + H * 0.4, R + sway * 0.6, y + H * 0.7, R + sway * 0.8, y + H);
        c.lineTo(cx + sway, y + H * 0.8);
        c.lineTo(L + sway * 0.8, y + H);
        c.bezierCurveTo(L + sway * 0.6, y + H * 0.7, L + sway * 0.2, y + H * 0.4, L, y);
        c.closePath();
      };
      cloth();
      const g = c.createLinearGradient(0, y, 0, y + H);
      g.addColorStop(0, '#1C5646');
      g.addColorStop(1, '#0C2A22');
      c.fillStyle = g;
      c.fill();
      c.save();
      c.clip();
      // Folds: soft bands of shade and light that drift across.
      for (let i = 0; i < 3; i += 1) {
        const fx = L + bw * (0.18 + 0.32 * i) + (moving ? Math.sin(t / 1300 + i * 1.7) * 4 : 0) + sway * 0.4;
        const fold = c.createLinearGradient(fx - 13, 0, fx + 13, 0);
        fold.addColorStop(0, 'rgba(0,0,0,0)');
        fold.addColorStop(0.45, 'rgba(0,0,0,0.3)');
        fold.addColorStop(0.7, 'rgba(150,255,215,0.07)');
        fold.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = fold;
        c.fillRect(fx - 13, y, 26, H);
      }
      // A gold band under the pole and the sigil.
      c.fillStyle = 'rgba(214,160,60,0.5)';
      c.fillRect(L, y + 9, bw, 1.4);
      c.restore();
      const size = Math.min(24, H * 0.15);
      if (boarding) {
        c.shadowColor = 'rgba(245,182,60,0.85)';
        c.shadowBlur = 14;
      }
      c.fillStyle = boarding ? '#F5C453' : '#A98236';
      sigil(c, cx + sway * 0.35, y + H * 0.42, size);
      c.shadowBlur = 0;
      // Trim.
      cloth();
      c.strokeStyle = 'rgba(214,160,60,0.6)';
      c.lineWidth = 1.3;
      c.stroke();
      if (caution) {
        c.strokeStyle = '#F58A3C';
        c.lineWidth = 2.2;
        c.beginPath();
        c.moveTo(R + sway * 0.8, y + H);
        c.lineTo(cx + sway, y + H * 0.8);
        c.lineTo(L + sway * 0.8, y + H);
        c.stroke();
      }
    }

    // Embers rising.
    for (const m of s.motes) {
      if (moving) {
        m.y -= m.vy * dt;
        m.ph += dt * 0.7;
        if (m.y < -6) m.y = h + 6;
      }
      const x = m.x + Math.sin(m.ph) * 7;
      const a = 0.16 + 0.12 * Math.sin(m.ph * 1.9);
      c.fillStyle = `rgba(255,170,70,${a * 0.35})`;
      c.beginPath();
      c.arc(x, m.y, m.r * 3, 0, TAU);
      c.fill();
      c.fillStyle = `rgba(255,205,120,${a})`;
      c.beginPath();
      c.arc(x, m.y, m.r, 0, TAU);
      c.fill();
    }
  },
});
