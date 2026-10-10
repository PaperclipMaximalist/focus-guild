/**
 * The Night Line's charm: a strip map of the line, an enamel board standing on
 * the bottom edge of the sidebar. A vertical route runs up it with eight stops
 * (rings) and a signal lamp on a post above it; behind it a few drops of rain
 * fall, slowly.
 *
 * progress: the yellow train marker climbs from the bottom stop to the top;
 *           stops behind it are filled, stops ahead are open rings, and the
 *           line behind it is lit while the line ahead is dim.
 * done:     one small ticked flag beside each of the first eight stops; past
 *           eight, one extra pip beside the lamp for each (up to four more).
 * boarding: the marker grows and shrinks by a pixel every two seconds and a
 *           short bright band shows on the line just ahead of it.
 * caution:  the lamp is amber; green otherwise.
 * Under 110 px tall only the marker and three stops; under 70 px, nothing.
 * Flat colour only.
 */

import { defineCharm } from '../types';

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const ICE = '#9FE8FF', LAMP = '#DDEBFF', DIM = '#2C3680', BOARD = '#0F1331', EDGE = '#363E78', EDGE_HI = '#5A68B0', INK = '#06081A';
const YELLOW = '#FFD23A', YELLOW_D = '#DDB21C';
const GREEN = '#5EE6A8', AMBER = '#FF8F2E';

interface Drop { x: number; y: number; v: number; len: number }

const block = (c: Ctx, col: string, x: number, y: number, w: number, h: number) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
const disc = (c: Ctx, col: string, x: number, y: number, r: number) => { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); };

export default defineCharm<Drop[]>({
  layout: (w, h, rnd) => Array.from({ length: 4 }, () => ({ x: rnd() * w, y: rnd() * h, v: 22 + rnd() * 20, len: 8 + rnd() * 8 })),

  draw(f, drops) {
    const { ctx: c, w, h, t, dt, moving } = f;
    if (h < 70) return;
    const full = h >= 110;
    const sec = t / 1000;

    // Rain behind everything, slow and slanted.
    c.lineWidth = 1;
    for (const d of drops) {
      if (moving) {
        d.y += d.v * dt;
        d.x -= d.v * dt * 0.18;
        if (d.y > h + 10) { d.y = -d.len; d.x = f.rnd() * (w + 20); }
      }
      c.strokeStyle = 'rgba(190, 208, 255, 0.28)';
      c.beginPath();
      c.moveTo(d.x, d.y);
      c.lineTo(d.x + d.len * 0.18, d.y - d.len);
      c.stroke();
    }

    const cx = full ? w * 0.46 : w / 2;
    const base = h - 4;
    const stops = full ? 8 : 3;
    const boardTop = full ? 34 : 6;
    const top = full ? boardTop + 14 : 14;
    const bot = base - 16;
    const stopY = (i: number) => bot - ((bot - top) * i) / (stops - 1);
    const my = bot - (bot - top) * Math.max(0, Math.min(1, f.progress));

    // The enamel board the map is printed on: a dark plate with an edge and corner screws, on two feet.
    const bx0 = full ? 22 : cx - 34;
    const bx1 = full ? w - 22 : cx + 34;
    for (const fx of [bx0 + 14, bx1 - 20]) { block(c, EDGE, fx, base - 3, 6, 3); block(c, EDGE_HI, fx, base - 3, 6, 1); }
    c.fillStyle = EDGE; c.beginPath();
    c.roundRect(bx0, boardTop, bx1 - bx0, base - 3 - boardTop, 7);
    c.fill();
    c.fillStyle = BOARD; c.beginPath();
    c.roundRect(bx0 + 2, boardTop + 2, bx1 - bx0 - 4, base - 3 - boardTop - 4, 5);
    c.fill();
    c.strokeStyle = EDGE_HI; c.lineWidth = 1; c.beginPath();
    c.roundRect(bx0 + 0.5, boardTop + 0.5, bx1 - bx0 - 1, base - 3 - boardTop - 1, 6.5);
    c.stroke();
    if (full) for (const [sx, sy] of [[bx0 + 6, boardTop + 6], [bx1 - 6, boardTop + 6], [bx0 + 6, base - 9], [bx1 - 6, base - 9]] as const) {
      disc(c, EDGE, sx, sy, 2);
      block(c, INK, sx - 1.5, sy, 3, 1);
    }

    // The route: dim ahead of the train, lit behind it.
    const lw = 5;
    block(c, DIM, cx - lw / 2, stopY(stops - 1), lw, bot - stopY(stops - 1) + 6);
    block(c, ICE, cx - lw / 2, my, lw, base - 4 - my - 3);
    block(c, LAMP, cx - lw / 2, my, 1, base - 4 - my - 3);
    if (f.boarding) {
      // A short bright band on the line just ahead of the marker.
      block(c, LAMP, cx - 1.5, my - 24, 3, 18);
      block(c, '#FFFFFF', cx - 0.5, my - 22, 1, 14);
    }

    // The stops: filled where the train has been, open rings ahead.
    for (let i = 0; i < stops; i += 1) {
      const y = stopY(i);
      const behind = y >= my - 0.5;
      disc(c, INK, cx, y, 8);
      disc(c, behind ? ICE : DIM, cx, y, 7);
      if (behind) disc(c, LAMP, cx - 1.5, y - 1.5, 2.8);
      else disc(c, BOARD, cx, y, 4.4);
      if (full) {
        // A station name, as a dim bar to the right.
        block(c, EDGE, cx + 14, y - 1.5, 12 + ((i * 7) % 5) * 6, 3);
      }
    }

    // The day's flags: a ticked pennant on a short pole beside each of the first eight stops.
    if (full) {
      const n = Math.min(8, f.done);
      for (let i = 0; i < n; i += 1) {
        const y = stopY(i);
        block(c, LAMP, cx - 36, y - 10, 1.5, 13);
        c.fillStyle = LAMP; c.beginPath();
        c.moveTo(cx - 34.5, y - 10); c.lineTo(cx - 19, y - 7); c.lineTo(cx - 34.5, y - 3.4);
        c.fill();
        c.strokeStyle = INK; c.lineWidth = 1.3; c.beginPath();
        c.moveTo(cx - 32, y - 7); c.lineTo(cx - 30, y - 5.2); c.lineTo(cx - 25.6, y - 8.4);
        c.stroke();
      }
    }

    // The train marker: a yellow capsule with a dark window slit.
    const pulse = f.boarding && moving ? Math.sin((sec * TAU) / 2) : 0;
    const mw = 7 + pulse * 0.8;
    const mh = 11 + pulse * 1;
    c.fillStyle = INK; c.beginPath();
    c.roundRect(cx - mw - 1.5, my - mh - 1.5, mw * 2 + 3, mh * 2 + 3, mw + 1.5);
    c.fill();
    c.fillStyle = YELLOW; c.beginPath();
    c.roundRect(cx - mw, my - mh, mw * 2, mh * 2, mw);
    c.fill();
    block(c, YELLOW_D, cx + mw * 0.3, my - mh + 3, mw * 0.7, mh * 2 - 6);
    block(c, INK, cx - mw * 0.55, my - mh * 0.45, mw * 1.1, mh * 0.5);
    block(c, ICE, cx - mw * 0.4, my - mh * 0.35, mw * 0.8, mh * 0.3);
    block(c, '#FFF3B0', cx - mw + 1.5, my - mh + 3, 1.5, 4);

    // The signal lamp on its post above the board, and the extra pips beside it (past eight).
    if (full) {
      const ly = 15;
      block(c, EDGE, cx - 1.5, ly + 6, 3, boardTop - ly - 4);
      disc(c, INK, cx, ly, 10);
      disc(c, EDGE, cx, ly, 8.6);
      disc(c, INK, cx, ly, 6.8);
      disc(c, f.caution ? AMBER : GREEN, cx, ly, 5.6);
      block(c, f.caution ? '#FFE4C0' : '#D4FFEA', Math.round(cx - 3), Math.round(ly - 3.6), 2.5, 2.5);
      const extra = Math.min(4, Math.max(0, f.done - 8));
      for (let i = 0; i < extra; i += 1) { disc(c, INK, cx + 18 + i * 8, ly, 3.2); disc(c, LAMP, cx + 18 + i * 8, ly, 2.4); }
    }
  },
});
