/**
 * The Timber Line's charm: a plank shelf on two brackets at the foot of the
 * sidebar. On it stand an oil lantern (brass base, glass chimney, wire handle),
 * a steaming mug and a few acorns. Above it a swag of ten fairy lights hangs
 * from two hooks.
 *
 * progress: bulbs light up left to right (unlit ones are dark glass, still
 *           there); done: one acorn per quest on the shelf, up to 12, in two
 *           rows; boarding: the lantern's flame is tall and its flat pool of
 *           light on the shelf is wide, otherwise the flame is low; caution:
 *           the small tag hanging from the shelf's edge turns amber (plain
 *           wood otherwise). Always: the flame leans a pixel, steam rises.
 * Under 110 px tall only the lantern is drawn; under 70 px, nothing.
 * Flat colour only.
 */

import { defineCharm } from '../types';

const TAU = Math.PI * 2;
const BRASS = '#B8863A', BRASS_LO = '#8A6226', BRASS_HI = '#E0B060';
const PLANK = '#4A3222', PLANK_HI = '#6B4A32', PLANK_LO = '#2E1E14';
const BULB = '#FFE2A0', BULB_HI = '#FFFBE8';

export default defineCharm<null>({
  layout: () => null,

  draw(f) {
    const { ctx: c, w, h, t, moving } = f;
    if (h < 70) return;
    const sec = t / 1000;
    const rect = (col: string, x: number, y: number, rw: number, rh: number) => { c.fillStyle = col; c.fillRect(x, y, rw, rh); };
    const oval = (col: string, x: number, y: number, rx: number, ry: number) => {
      c.fillStyle = col;
      c.beginPath();
      c.ellipse(x, y, rx, ry, 0, 0, TAU);
      c.fill();
    };

    const full = h >= 110;
    const shelfY = h - 26;
    const lx = full ? w * 0.42 : w / 2;
    const k = full ? 1 : Math.min(1, (h - 8) / 70);

    // ── The shelf: a plank on two brackets ──
    if (full) {
      const x0 = 12, x1 = w - 12;
      for (const bx of [x0 + 18, x1 - 24]) {
        c.fillStyle = PLANK_LO;
        c.beginPath();
        c.moveTo(bx, shelfY + 7); c.lineTo(bx + 9, shelfY + 7); c.lineTo(bx, shelfY + 24);
        c.fill();
        rect(PLANK, bx, shelfY + 7, 3, 17);
      }
      rect(PLANK, x0, shelfY, x1 - x0, 7);
      rect(PLANK_HI, x0, shelfY, x1 - x0, 2);
      rect(PLANK_LO, x0, shelfY + 6, x1 - x0, 1);
      // The tag on the shelf's edge: wood, or amber with stragglers.
      const tx = w * 0.58;
      rect('#8A6A52', tx + 4, shelfY + 7, 1, 4);
      rect(f.caution ? '#F58A3C' : '#6A4A32', tx, shelfY + 11, 9, 12);
      rect(f.caution ? '#FFC98A' : '#8A6A52', tx, shelfY + 11, 9, 2);
      rect('#1C130E', tx + 4, shelfY + 14, 1, 1);
    }

    // ── The lantern ──
    const lit = f.boarding;
    const base = full ? shelfY : h - 10;
    const q = k;
    oval(lit ? '#6E4410' : '#2A1C14', lx, base + 1, (lit ? 40 : 22) * q, 3.4 * q);
    if (lit) oval('#9A6218', lx, base + 1, 22 * q, 2.4 * q);
    rect(BRASS_LO, lx - 13 * q, base - 7 * q, 26 * q, 7 * q);
    rect(BRASS, lx - 13 * q, base - 7 * q, 26 * q, 2.5 * q);
    const gt = base - 7 * q - 34 * q;
    c.fillStyle = '#26333E';
    c.beginPath();
    c.moveTo(lx - 10 * q, base - 7 * q);
    c.quadraticCurveTo(lx - 13 * q, base - 22 * q, lx - 8 * q, gt);
    c.lineTo(lx + 8 * q, gt);
    c.quadraticCurveTo(lx + 13 * q, base - 22 * q, lx + 10 * q, base - 7 * q);
    c.fill();
    const lean = moving ? Math.sin(sec * 1.1) * 0.9 : 0;
    const fh = (lit ? 17 : 7) * q;
    const fb = base - 9 * q;
    rect('#8A6226', lx - 1, fb - 4 * q, 2, 4 * q);
    c.fillStyle = '#FFB648';
    c.beginPath();
    c.moveTo(lx - 3.6 * q, fb - 4 * q);
    c.quadraticCurveTo(lx - 3.6 * q + lean * 0.3, fb - fh * 0.6, lx + lean, fb - fh - 4 * q);
    c.quadraticCurveTo(lx + 3.6 * q + lean * 0.3, fb - fh * 0.6, lx + 3.6 * q, fb - 4 * q);
    c.fill();
    c.fillStyle = BULB;
    c.beginPath();
    c.moveTo(lx - 1.8 * q, fb - 4 * q);
    c.quadraticCurveTo(lx - 1.8 * q + lean * 0.2, fb - fh * 0.5, lx + lean * 0.7, fb - fh * 0.8 - 3 * q);
    c.quadraticCurveTo(lx + 1.8 * q, fb - fh * 0.5, lx + 1.8 * q, fb - 4 * q);
    c.fill();
    rect('#6C8294', lx - 7 * q, gt + 4 * q, 2 * q, 20 * q);
    rect(BRASS_LO, lx - 10 * q, gt - 3 * q, 20 * q, 4 * q);
    rect(BRASS_HI, lx - 10 * q, gt - 3 * q, 20 * q, 1.2 * q);
    c.fillStyle = BRASS;
    c.beginPath();
    c.moveTo(lx - 10 * q, gt - 3 * q); c.lineTo(lx + 10 * q, gt - 3 * q); c.lineTo(lx + 5 * q, gt - 9 * q); c.lineTo(lx - 5 * q, gt - 9 * q);
    c.fill();
    c.strokeStyle = BRASS_HI;
    c.lineWidth = 1.4;
    c.beginPath();
    c.arc(lx, gt - 9 * q, 7 * q, Math.PI, 0);
    c.stroke();
    if (!full) return;

    // ── The mug, with steam ──
    const mx = w * 0.76;
    oval('#120B08', mx + 2, shelfY, 15, 2.5);
    c.fillStyle = '#E8DCC6';
    c.beginPath();
    c.moveTo(mx - 10, shelfY - 20); c.lineTo(mx + 10, shelfY - 20); c.lineTo(mx + 9, shelfY - 2);
    c.quadraticCurveTo(mx + 8, shelfY, mx + 5, shelfY); c.lineTo(mx - 5, shelfY); c.quadraticCurveTo(mx - 8, shelfY, mx - 9, shelfY - 2);
    c.fill();
    rect('#C9BCA4', mx + 4, shelfY - 20, 6, 19);
    rect('#52647A', mx - 10, shelfY - 12, 20, 2);
    c.strokeStyle = '#E8DCC6';
    c.lineWidth = 2.4;
    c.beginPath();
    c.arc(mx + 11, shelfY - 11, 5, -Math.PI / 2, Math.PI / 2);
    c.stroke();
    oval('#E8DCC6', mx, shelfY - 20, 10, 2.6);
    oval('#3A2418', mx, shelfY - 19.6, 8, 1.8);
    for (let j = 0; j < 3; j += 1) {
      const ph = (sec / 3 + j / 3) % 1;
      const sx = mx + (j - 1) * 5 + Math.sin(ph * 5 + j * 2) * 2;
      const sy = shelfY - 25 - ph * 22;
      c.globalAlpha = Math.sin(ph * Math.PI) * 0.7;
      c.strokeStyle = '#F4EAD8';
      c.lineWidth = 1.4;
      c.beginPath();
      c.moveTo(sx, sy);
      c.quadraticCurveTo(sx + 3, sy - 3.5, sx, sy - 7);
      c.quadraticCurveTo(sx - 3, sy - 10, sx + 1, sy - 13);
      c.stroke();
    }
    c.globalAlpha = 1;

    // ── Acorns: one per quest, two rows of six ──
    const n = Math.min(12, f.done);
    for (let i = 0; i < n; i += 1) {
      const row = i < 6 ? 0 : 1;
      const col = i % 6;
      const ax = 20 + col * 10 + row * 4;
      const ay = shelfY - row * 4;
      const r = 3.8;
      const cy = ay - r * 1.25;
      oval('#120B08', ax + 1, ay, r * 1.2, 1.4);
      oval('#B07C44', ax, cy, r, r * 1.3);
      rect('#D1A06A', ax - r * 0.55, cy - 0.5, 1.2, r * 0.9);
      c.fillStyle = '#5B3A22';
      c.beginPath();
      c.ellipse(ax, cy - r * 0.55, r * 1.1, r * 0.92, 0, Math.PI, TAU);
      c.fill();
      rect('#5B3A22', ax - 0.6, cy - r * 1.95, 1.4, 2);
    }

    // ── The swag of fairy lights: ten bulbs, lit left to right by progress ──
    if (h >= 150) {
      const top = h - Math.min(h, 200);
      const x0 = 8, x1 = w - 8, y0 = top + 14, sag = 24;
      const cx = (x0 + x1) / 2, cy = y0 + 2 * sag;
      c.strokeStyle = '#5A4636';
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(x0, y0);
      c.quadraticCurveTo(cx, cy, x1, y0);
      c.stroke();
      for (const hx of [x0, x1]) { rect(BRASS, hx - 1.5, y0 - 3, 3, 5); rect(BRASS_HI, hx - 1.5, y0 - 3, 3, 1); }
      const on = Math.round(Math.max(0, Math.min(1, f.progress)) * 10);
      for (let i = 0; i < 10; i += 1) {
        const u = (i + 1) / 11;
        const bx = (1 - u) * (1 - u) * x0 + 2 * (1 - u) * u * cx + u * u * x1;
        const by = (1 - u) * (1 - u) * y0 + 2 * (1 - u) * u * cy + u * u * y0 + 5;
        rect('#1A110C', bx - 1, by - 5, 2, 3);
        if (i < on) {
          const tw = moving && (sec / 5 + i * 0.31) % 1 < 0.1 ? 1 : 0;
          c.fillStyle = '#7A5A30';
          c.beginPath(); c.arc(bx, by, 4.2, 0, TAU); c.fill();
          c.fillStyle = BULB;
          c.beginPath(); c.arc(bx, by, 3.2 + tw, 0, TAU); c.fill();
          c.fillStyle = BULB_HI;
          c.beginPath(); c.arc(bx, by, 1.4, 0, TAU); c.fill();
        } else {
          c.fillStyle = '#2A2118';
          c.beginPath(); c.arc(bx, by, 3.2, 0, TAU); c.fill();
          c.fillStyle = '#4A3C2E';
          c.beginPath(); c.arc(bx - 0.8, by - 0.8, 1, 0, TAU); c.fill();
        }
      }
    }
  },
});
