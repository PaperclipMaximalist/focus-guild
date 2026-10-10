/**
 * The Abyssal Line's charm: a round brass pressure gauge on a short pipe rising
 * from a bolted flange at the foot of the sidebar, with a sight glass beside it
 * in brass collars, joined by a low pipe with a valve wheel. A jewel lamp sits on
 * top of the gauge.
 *
 * progress: the needle sweeps from lower left (0) to lower right (1) across a
 *           ticked dial whose last fifth is painted amber-brown; done: one
 *           bubble in the sight glass per quest finished, stacked from the
 *           bottom, up to 12; boarding: the needle trembles and a bubble or two
 *           rises through the tube; caution: the jewel lamp is amber, green
 *           otherwise. Under 110 px tall only the gauge on its stub is drawn;
 *           under 70 px, nothing. Flat colour only.
 */

import { defineCharm } from '../types';

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const IRON = ['#16201C', '#222E28', '#2E3C34'], IRON_HI = '#4A5E52', IRON_LO = '#0C1210';
const BRASS = ['#8A6A2C', '#B8923E', '#E0C070'];
const WATER = ['#0E4A3A', '#17705A', '#25A07A', '#5FD0A0', '#B9F2D0'];
const GREEN = '#5EE6A8', AMBER = '#FFA24D';

const block = (c: Ctx, col: string, x: number, y: number, w: number, h: number) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
const disc = (c: Ctx, col: string, x: number, y: number, r: number) => {
  c.fillStyle = col; c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fill();
};
const bolt = (c: Ctx, x: number, y: number, r: number) => {
  disc(c, IRON_LO, x + 0.4, y + 0.6, r + 0.8);
  disc(c, BRASS[1]!, x, y, r);
  block(c, BRASS[2]!, Math.floor(x - r * 0.55), Math.floor(y - r * 0.55), 1, 1);
};

/** A brass collar: a short wide band with a lit top edge and bolts at each end. */
const collar = (c: Ctx, cx: number, y: number, w: number, h: number) => {
  block(c, IRON_LO, cx - w / 2 - 1, y - 1, w + 2, h + 2);
  block(c, BRASS[0]!, cx - w / 2, y, w, h);
  block(c, BRASS[1]!, cx - w / 2, y, w, h * 0.55);
  block(c, BRASS[2]!, cx - w / 2, y, w, 1);
  bolt(c, cx - w / 2 + 3, y + h / 2, 1.5);
  bolt(c, cx + w / 2 - 3, y + h / 2, 1.5);
};

/** The dial: a brass bezel with bolts, a cream face ticked round 270 degrees, an amber-brown last fifth. */
function gauge(c: Ctx, cx: number, cy: number, R: number, progress: number, shake: number, caution: boolean) {
  disc(c, IRON_LO, cx + 1, cy + 1.5, R + 3);
  disc(c, BRASS[0]!, cx, cy, R + 1.5);
  disc(c, BRASS[1]!, cx, cy, R - 1.5);
  c.strokeStyle = BRASS[2]!; c.lineWidth = 1.5; c.beginPath();
  c.arc(cx, cy, R - 2.5, Math.PI * 1.05, Math.PI * 1.55); c.stroke();
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * TAU + 0.4;
    if (R > 26) bolt(c, cx + Math.cos(a) * (R - 3.6), cy + Math.sin(a) * (R - 3.6), 1.4);
  }
  const fr = R - (R > 26 ? 8 : 5);
  disc(c, IRON_LO, cx, cy, fr + 1.5);
  disc(c, '#E4DCB4', cx, cy, fr);
  c.fillStyle = '#C8BE90'; c.beginPath();
  c.arc(cx, cy, fr, Math.PI * 0.1, Math.PI * 0.9); c.arc(cx, cy - fr * 0.18, fr * 0.97, Math.PI * 0.9, Math.PI * 0.1, true);
  c.fill();
  const a0 = Math.PI * 0.75, sweep = Math.PI * 1.5;
  // The last fifth of the arc: a band of amber-brown under its ticks.
  c.strokeStyle = '#B0541E'; c.lineWidth = Math.max(3, fr * 0.14);
  c.beginPath(); c.arc(cx, cy, fr * 0.8, a0 + sweep * 0.8, a0 + sweep); c.stroke();
  const ticks = R > 26 ? 20 : 10;
  c.strokeStyle = '#2A1A0A'; c.lineWidth = 1; c.beginPath();
  for (let i = 0; i <= ticks; i += 1) {
    const a = a0 + (i / ticks) * sweep, major = i % (ticks / 4) === 0;
    const r1 = fr * (major ? 0.62 : 0.7), r2 = fr * 0.92;
    c.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); c.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
  }
  c.stroke();
  // The needle.
  const a = a0 + sweep * Math.max(0, Math.min(1, progress)) + shake;
  const nx = Math.cos(a), ny = Math.sin(a);
  c.fillStyle = '#2A1A0A'; c.beginPath();
  c.moveTo(cx + nx * fr * 0.88, cy + ny * fr * 0.88);
  c.lineTo(cx - ny * 2.2, cy + nx * 2.2); c.lineTo(cx - nx * fr * 0.24, cy - ny * fr * 0.24); c.lineTo(cx + ny * 2.2, cy - nx * 2.2);
  c.closePath(); c.fill();
  disc(c, IRON_LO, cx, cy, 4.6); disc(c, BRASS[1]!, cx, cy, 3.6); block(c, BRASS[2]!, Math.round(cx - 2), Math.round(cy - 2), 1.5, 1.5);
  // The jewel lamp on a brass socket on top of the dial.
  const jy = cy - R - 1;
  block(c, IRON_LO, cx - 7, jy - 1, 14, 6); block(c, BRASS[0]!, cx - 6, jy, 12, 4); block(c, BRASS[2]!, cx - 6, jy, 12, 1);
  c.fillStyle = IRON_LO; c.beginPath(); c.arc(cx, jy, 6.6, Math.PI, TAU); c.fill();
  c.fillStyle = caution ? AMBER : GREEN; c.beginPath(); c.arc(cx, jy, 5.2, Math.PI, TAU); c.fill();
  block(c, caution ? '#FFE0B8' : '#C8FFE4', Math.round(cx - 2.6), Math.round(jy - 3.8), 2, 2);
}

export default defineCharm<null>({
  layout: () => null,

  draw(f) {
    const { ctx: c, w, h, t, moving } = f;
    if (h < 70) return;
    const full = h >= 110;
    const sec = t / 1000;
    const shake = f.boarding ? Math.sin(sec * 38) * 0.0175 : moving ? Math.sin(sec * 0.9) * 0.004 : 0;
    const cx = full ? w * 0.4 : w / 2;
    const k = full ? Math.min(1, (h - 6) / 168) : 1;
    const R = full ? 42 * k : Math.min(40, (h - 26) / 2);
    const base = h - 4;

    // ── The flange the pipe stands on, and the pipe ──
    if (full) {
      const fw = 164 * k;
      block(c, IRON_LO, w / 2 - fw / 2 - 1, base - 9 * k - 1, fw + 2, 11 * k + 1);
      block(c, IRON[1]!, w / 2 - fw / 2, base - 9 * k, fw, 10 * k); block(c, IRON_HI, w / 2 - fw / 2, base - 9 * k, fw, 1);
      block(c, IRON[2]!, w / 2 - fw / 2, base - 9 * k + 1, fw, 2);
      for (const bx of [-fw / 2 + 8, -fw / 2 + 24, fw / 2 - 24, fw / 2 - 8]) bolt(c, w / 2 + bx, base - 4 * k, 2 * k + 0.4);
    }
    const pw = 14 * k;
    const gy = full ? base - 10 * k - 50 * k - R : h - R - 18;
    const pipeTop = gy + R;
    const pipeBot = full ? base - 9 * k : h - 2;
    block(c, IRON_LO, cx - pw / 2 - 1, pipeTop, pw + 2, pipeBot - pipeTop);
    block(c, IRON[1]!, cx - pw / 2, pipeTop, pw, pipeBot - pipeTop);
    block(c, IRON[2]!, cx - pw / 2 + 1, pipeTop, 4 * k + 1, pipeBot - pipeTop);
    block(c, IRON_HI, cx - pw / 2, pipeTop, 1, pipeBot - pipeTop);
    block(c, IRON_LO, cx + pw / 2 - 3, pipeTop, 3, pipeBot - pipeTop);
    if (full) {
      collar(c, cx, pipeBot - 9 * k - 8 * k, pw + 12 * k, 8 * k);
      collar(c, cx, pipeTop + 4 * k, pw + 8 * k, 7 * k);
    }

    // ── The sight glass, in brass collars, joined to the pipe by a low run with a valve wheel ──
    if (full) {
      const sx = w * 0.4 + 76 * k, tw = 17 * k;
      const top = gy - R + 12 * k, bot = base - 10 * k - 3;
      const inTop = top + 10 * k, inBot = bot - 10 * k;
      const run = base - 10 * k - 18 * k;
      block(c, IRON_LO, cx, run - 1, sx - cx, 10 * k + 2);
      block(c, IRON[1]!, cx, run, sx - cx, 9 * k); block(c, IRON_HI, cx, run, sx - cx, 1); block(c, IRON[2]!, cx, run + 1, sx - cx, 2);
      block(c, IRON_LO, cx, run + 9 * k - 2, sx - cx, 2);
      const vx = (cx + sx) / 2;
      block(c, IRON_LO, vx - 5 * k - 1, run - 7 * k, 10 * k + 2, 7 * k + 1); block(c, BRASS[1]!, vx - 5 * k, run - 6 * k, 10 * k, 6 * k); block(c, BRASS[2]!, vx - 5 * k, run - 6 * k, 10 * k, 1);
      c.strokeStyle = IRON_LO; c.lineWidth = 3; c.beginPath(); c.arc(vx, run - 12 * k, 8 * k, 0, TAU); c.stroke();
      c.strokeStyle = BRASS[1]!; c.lineWidth = 1.6; c.beginPath(); c.arc(vx, run - 12 * k, 8 * k, 0, TAU);
      for (let i = 0; i < 3; i += 1) { const a = (i / 3) * TAU + 0.3; c.moveTo(vx, run - 12 * k); c.lineTo(vx + Math.cos(a) * 8 * k, run - 12 * k + Math.sin(a) * 8 * k); }
      c.stroke();
      disc(c, BRASS[2]!, vx, run - 12 * k, 2 * k);
      // The tube: dark green water with a lit edge, and the bubbles of the day inside it.
      block(c, IRON_LO, sx - tw / 2 - 2, inTop, tw + 4, inBot - inTop);
      block(c, WATER[0]!, sx - tw / 2, inTop, tw, inBot - inTop);
      block(c, WATER[1]!, sx - tw / 2, inTop, 4 * k, inBot - inTop);
      block(c, WATER[3]!, sx - tw / 2 + 1, inTop + 3, 1.5, inBot - inTop - 6);
      for (const [y, hh] of [[0.12, 0.22], [0.5, 0.1]] as const) block(c, WATER[2]!, sx - tw / 2 + 1, inTop + (inBot - inTop) * y, 1.5, (inBot - inTop) * hh);
      const space = (inBot - inTop - 8) / 12, br = Math.min(3.8 * k, space * 0.45);
      const n = Math.min(12, Math.max(0, f.done));
      for (let i = 0; i < n; i += 1) {
        const y = inBot - 4 - br - i * space;
        disc(c, WATER[4]!, sx, y, br); disc(c, WATER[3]!, sx + 0.8, y + 0.8, br * 0.6);
        block(c, '#F2FFF8', Math.round(sx - br * 0.55), Math.round(y - br * 0.55), 1.5, 1.5);
      }
      if (f.boarding) {
        // One or two small bubbles rise through the tube, over the stack.
        for (let i = 0; i < 2; i += 1) {
          const p = ((sec * 0.28 + i * 0.5) % 1);
          const y = inBot - 3 - p * (inBot - inTop - 6);
          disc(c, WATER[3]!, sx + Math.sin(sec * 5 + i * 2) * 2.4 * k, y, 2.1 * k);
          block(c, '#F2FFF8', Math.round(sx + Math.sin(sec * 5 + i * 2) * 2.4 * k - 1), Math.round(y - 1), 1, 1);
        }
      }
      collar(c, sx, top, tw + 12 * k, 11 * k);
      collar(c, sx, bot - 10 * k, tw + 12 * k, 12 * k);
      collar(c, sx, (inTop + inBot) / 2 - 3 * k, tw + 8 * k, 5 * k);
      // The brass caps and the little stem at the top.
      block(c, IRON_LO, sx - 3 * k - 1, top - 6 * k, 6 * k + 2, 7 * k); block(c, BRASS[1]!, sx - 3 * k, top - 5 * k, 6 * k, 6 * k); block(c, BRASS[2]!, sx - 3 * k, top - 5 * k, 6 * k, 1);
    }

    gauge(c, cx, gy, R, f.progress, shake, f.caution);
  },
});
