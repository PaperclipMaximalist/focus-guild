/**
 * The Salvage Line's charm: the cockpit's CRT terminal, larger, on a short
 * neck and a foot standing on the bottom of the sidebar's spare room. A
 * bulbous riveted copper housing, two knobs under the glass, and a small lamp
 * on the casing. On the glass: one phosphor bar per quest finished today (up to
 * 12, each a different length) as lines of a manifest, a block cursor after the
 * last, and a thin bar along the foot of the glass filled left to right by how
 * much of today's planned work is behind you. A slow scanline always drifts
 * down; while a block is boarding the cursor blinks and a second, dimmer
 * scanline joins it. The casing lamp is amber with stragglers, dark otherwise.
 * Under 110 px of height it is the glass and its bezel only; under 70 px, nothing.
 */

import { defineCharm } from '../types';

type Ctx = CanvasRenderingContext2D;

const TAU = Math.PI * 2;
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const CU = '#5A3A26';
const CU_HI = '#8A5C3A';
const CU_LO = '#40281A';
const DEEP = '#120A06';
const WALL_LO = '#1E120C';
const RIV_HI = '#9A6E48';
const RIV = '#6B4630';
const GLASS = '#0D3A1C';
const LINE = '#124A26';
const PHOS = '#4BE083';
const PHOS_HI = '#A8F5C4';
const AMBER = '#FFA640';

const box = (ctx: Ctx, col: string, x: number, y: number, w: number, h: number) => {
  ctx.fillStyle = col;
  ctx.fillRect(x, y, w, h);
};

function stip(ctx: Ctx, rnd: () => number, x: number, y: number, w: number, h: number, dens: number, col: string, p: (px: number, py: number) => number) {
  ctx.fillStyle = col;
  ctx.beginPath();
  const n = Math.round(w * h * dens);
  for (let i = 0; i < n; i += 1) {
    const px = x + rnd() * w;
    const py = y + rnd() * h;
    if (rnd() <= p(px, py)) ctx.rect(Math.floor(px), Math.floor(py), 1, 1);
  }
  ctx.fill();
}

function rivet(ctx: Ctx, x: number, y: number) {
  box(ctx, DEEP, Math.round(x) - 1, Math.round(y), 3, 3);
  box(ctx, RIV, Math.round(x) - 1, Math.round(y) - 1, 3, 3);
  box(ctx, RIV_HI, Math.round(x) - 1, Math.round(y) - 1, 1, 1);
}

function knob(ctx: Ctx, x: number, y: number, r: number, ang: number) {
  ctx.fillStyle = DEEP;
  ctx.beginPath();
  ctx.arc(x + 0.5, y + 1, r + 1, 0, TAU);
  ctx.fill();
  ctx.fillStyle = CU_HI;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#5E3F28';
  ctx.beginPath();
  ctx.arc(x + 0.8, y + 0.8, r * 0.78, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = DEEP;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(ang) * r * 0.9, y + Math.sin(ang) * r * 0.9);
  ctx.stroke();
}

interface Spot { u: number; cx: number; short: boolean; bw: number; bh: number; x0: number; y0: number; gx: number; gy: number; gw: number; gh: number }

function spot(w: number, h: number): Spot | null {
  if (h < 70) return null;
  const short = h < 110;
  const cx = w / 2;
  if (short) {
    const bh = h - 6;
    const bw = Math.min(w - 8, bh * 1.22);
    const u = bh / 122;
    const y0 = h - 3 - bh;
    return { u, cx, short, bw, bh, x0: cx - bw / 2, y0, gw: bw * 0.72, gh: bh * 0.66, gx: cx - bw * 0.36, gy: y0 + bh * 0.1 };
  }
  const u = clamp(Math.min(h / 178, w / 190), 0.4, 1.25);
  const bw = 150 * u;
  const bh = 122 * u;
  const y0 = h - 28 * u - bh;
  return { u, cx, short, bw, bh, x0: cx - bw / 2, y0, gw: 108 * u, gh: 80 * u, gx: cx - 54 * u, gy: y0 + 12 * u };
}

export default defineCharm<Record<string, never>>({
  layout: () => ({}),

  // The housing, neck and foot never change: painted once.
  back({ ctx, w, h, rnd }) {
    const sp = spot(w, h);
    if (!sp) return;
    const { u, cx, x0, y0, bw, bh } = sp;
    if (!sp.short) {
      // Foot and neck.
      box(ctx, DEEP, cx - 46 * u, h - 11 * u, 92 * u, 11 * u);
      box(ctx, CU, cx - 45 * u, h - 10 * u, 90 * u, 9 * u);
      box(ctx, CU_HI, cx - 45 * u, h - 10 * u, 90 * u, 2);
      box(ctx, CU_LO, cx - 45 * u, h - 3 * u, 90 * u, 3 * u);
      box(ctx, DEEP, cx - 19 * u, y0 + bh - 4 * u, 38 * u, 22 * u);
      box(ctx, CU_LO, cx - 18 * u, y0 + bh - 4 * u, 36 * u, 22 * u);
      box(ctx, CU_HI, cx - 18 * u, y0 + bh - 4 * u, 3 * u, 22 * u);
      box(ctx, DEEP, cx + 10 * u, y0 + bh - 4 * u, 8 * u, 22 * u);
      rivet(ctx, cx - 36 * u, h - 6 * u);
      rivet(ctx, cx + 36 * u, h - 6 * u);
    }
    // The bulb behind, up and to the right; then the bezel.
    ctx.fillStyle = DEEP;
    ctx.beginPath();
    ctx.roundRect(x0 + 10 * u, y0 - 5 * u, bw - 6 * u, bh - 6 * u, bw * 0.3);
    ctx.fill();
    const bez = new Path2D();
    bez.roundRect(x0, y0, bw, bh, bw * 0.24);
    ctx.fillStyle = CU_LO;
    ctx.fill(bez);
    ctx.save();
    ctx.clip(bez);
    box(ctx, CU, x0, y0, bw * 0.7, bh);
    box(ctx, CU_HI, x0, y0, 3 * u + 1, bh);
    box(ctx, CU_HI, x0, y0, bw, 3 * u + 1);
    box(ctx, WALL_LO, x0 + bw - 8 * u, y0, 8 * u, bh);
    box(ctx, WALL_LO, x0, y0 + bh - 9 * u, bw, 9 * u);
    stip(ctx, rnd, x0, y0, bw, bh, 0.2, DEEP, (px, py) => 0.45 * clamp(((px - x0) / bw + (py - y0) / bh) / 2));
    stip(ctx, rnd, x0, y0, bw, bh, 0.14, RIV_HI, (px, py) => 0.45 * clamp(1 - ((px - x0) / bw + (py - y0) / bh) / 1.2));
    // The faint green wash of the glass on the bezel: flat dots hugging it.
    const { gx, gy, gw, gh } = sp;
    stip(ctx, rnd, gx - 12 * u, gy - 12 * u, gw + 24 * u, gh + 24 * u, 0.3, '#4F9A6A', (px, py) => 0.55 * clamp(1 - Math.max(Math.abs(px - cx) - gw / 2, Math.abs(py - gy - gh / 2) - gh / 2) / (10 * u)) ** 1.2);
    ctx.restore();
    ctx.strokeStyle = DEEP;
    ctx.lineWidth = 1.5;
    ctx.stroke(bez);
    // The glass recess.
    ctx.fillStyle = DEEP;
    ctx.beginPath();
    ctx.roundRect(gx - 4 * u, gy - 4 * u, gw + 8 * u, gh + 8 * u, 15 * u);
    ctx.fill();
    ctx.fillStyle = GLASS;
    ctx.beginPath();
    ctx.roundRect(gx, gy, gw, gh, 11 * u);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(gx, gy, gw, gh, 11 * u);
    ctx.clip();
    ctx.fillStyle = LINE;
    for (let y = gy + 1; y < gy + gh; y += 3) ctx.fillRect(gx, Math.round(y), gw, 1);
    stip(ctx, rnd, gx, gy, gw, gh, 0.5, '#04140A', (px, py) => 0.8 * clamp(Math.max(Math.abs(px - cx) / (gw / 2), Math.abs(py - gy - gh / 2) / (gh / 2)) - 0.55));
    ctx.restore();
    ctx.strokeStyle = '#2F7A4A';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(gx - 1.5, gy - 1.5, gw + 3, gh + 3, 12 * u);
    ctx.stroke();
    if (!sp.short) {
      // Two knobs and a grille under the glass; rivets at the corners; the lamp's socket.
      const ky = gy + gh + (y0 + bh - gy - gh) * 0.5 - 2 * u;
      knob(ctx, cx - 38 * u, ky, 5.5 * u, 0.6);
      knob(ctx, cx - 18 * u, ky, 5.5 * u, -0.8);
      for (let i = 0; i < 5; i += 1) box(ctx, DEEP, cx + 8 * u + i * 6 * u, ky - 4 * u, 2, 8 * u);
      for (const [rx, ry] of [[x0 + 9 * u, y0 + 9 * u], [x0 + bw - 11 * u, y0 + 9 * u], [x0 + 9 * u, y0 + bh - 12 * u], [x0 + bw - 11 * u, y0 + bh - 12 * u]] as const) rivet(ctx, rx, ry);
      ctx.fillStyle = DEEP;
      ctx.beginPath();
      ctx.arc(x0 + bw - 20 * u, ky, 5.5 * u, 0, TAU);
      ctx.fill();
    }
  },

  draw(f) {
    const { ctx, w, h, t, moving, boarding, caution, done, progress } = f;
    const sp = spot(w, h);
    if (!sp) return;
    const { u, cx, gx, gy, gw, gh } = sp;
    const gl = new Path2D();
    gl.roundRect(gx, gy, gw, gh, 11 * u);
    ctx.save();
    ctx.clip(gl);
    // Manifest lines: one bar per quest finished, each a different length.
    const rows = 13;
    const foot = 10 * u;
    const pitch = (gh - foot - 6 * u) / rows;
    const bar = Math.max(2, Math.round(pitch * 0.72));
    const n = Math.min(12, done);
    const lens = [0.62, 0.9, 0.45, 0.78, 0.55, 0.95, 0.4, 0.7, 0.85, 0.5, 0.74, 0.6];
    for (let i = 0; i < n; i += 1) {
      const y = Math.round(gy + 5 * u + i * pitch);
      const len = Math.round((gw - 16 * u) * lens[i]!);
      box(ctx, PHOS, Math.round(gx + 8 * u), y, len, bar);
      box(ctx, PHOS_HI, Math.round(gx + 8 * u), y, Math.min(len, Math.max(3, Math.round(4 * u))), bar);
    }
    // The cursor: steady and dim at rest, blinking and bright while a block is boarding.
    const curY = Math.round(gy + 5 * u + n * pitch);
    if (boarding) {
      if (!moving || t % 1000 < 520) box(ctx, PHOS_HI, Math.round(gx + 8 * u), curY, Math.max(5, Math.round(7 * u)), bar);
    } else {
      box(ctx, '#2F7A4A', Math.round(gx + 8 * u), curY, Math.max(5, Math.round(7 * u)), bar);
    }
    // The scanline, always; a dimmer second one while boarding.
    const sl = moving ? (t % 7000) / 7000 : 0.4;
    box(ctx, '#1F7A42', gx, Math.round(gy + sl * gh), gw, 2);
    if (boarding) box(ctx, '#165C32', gx, Math.round(gy + ((sl + 0.5) % 1) * gh), gw, 2);
    // Progress: a thin bar along the foot of the glass, left to right.
    const by = Math.round(gy + gh - 7 * u);
    box(ctx, '#0E3A1C', Math.round(gx + 8 * u), by, Math.round(gw - 16 * u), Math.max(2, Math.round(3 * u)));
    const fill = Math.round((gw - 16 * u) * clamp(progress));
    if (fill > 0) box(ctx, PHOS, Math.round(gx + 8 * u), by, fill, Math.max(2, Math.round(3 * u)));
    ctx.restore();

    // The lamp on the casing: amber with stragglers, dark otherwise.
    if (!sp.short) {
      const ky = gy + gh + (sp.y0 + sp.bh - gy - gh) * 0.5 - 2 * u;
      const lx = sp.x0 + sp.bw - 20 * u;
      ctx.fillStyle = caution ? AMBER : '#3A2A18';
      ctx.beginPath();
      ctx.arc(lx, ky, 4 * u, 0, TAU);
      ctx.fill();
      ctx.fillStyle = caution ? '#FFFFFF' : '#5A4228';
      ctx.fillRect(Math.round(lx - 2 * u), Math.round(ky - 2.4 * u), Math.max(2, Math.round(2 * u)), 1);
    }
    void cx;
  },
});
