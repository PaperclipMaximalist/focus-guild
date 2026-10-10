/**
 * The Ring Line's charm: the crystal from the window, larger, hovering over a
 * stack of two stitched suitcases that stand on the bottom of the sidebar's
 * spare room. It bobs slowly all the time. How much of today's planned work is
 * behind you fills it: dim plum at 0, lit from its lower point upward to full
 * pink at 1, with a hard line between lit and unlit. Each quest finished today
 * is one mote on one of two tilted rings round it (up to 12). While a block is
 * boarding it bobs a little faster and its glint travels round the facets.
 * Under 110 px of height it is the crystal alone; under 70 px, nothing.
 */

import { defineCharm } from '../types';

type Ctx = CanvasRenderingContext2D;

const TAU = Math.PI * 2;
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const LIT = ['#7A1458', '#C02A8C', '#FF6FB1', '#FFC2E0'] as const;
const UNLIT = ['#1F1030', '#2B1440', '#38194F', '#4A2563'] as const;

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

/** One suitcase: lid band, two stitched straps with buckles, corner caps, and optionally a sewn patch. */
function suitcase(ctx: Ctx, rnd: () => number, x: number, y: number, w: number, h: number, u: number, lower: boolean) {
  const body = new Path2D();
  body.roundRect(x, y, w, h, 7 * u);
  ctx.fillStyle = lower ? '#9C8258' : '#B89B6A';
  ctx.fill(body);
  ctx.save();
  ctx.clip(body);
  box(ctx, lower ? '#B39A6C' : '#D2B98A', x, y, w, 10 * u);
  box(ctx, '#4A3A1E', x, y + 10 * u, w, 1.5);
  box(ctx, lower ? '#756040' : '#8C7448', x, y + h - 8 * u, w, 8 * u);
  stip(ctx, rnd, x, y, w, h, 0.3, '#4A3A1E', (px) => clamp((px - x - w * 0.55) / (w * 0.45)) * 0.65);
  stip(ctx, rnd, x, y, w, 14 * u, 0.3, '#F2E2B0', (px) => clamp(1 - (px - x) / (w * 0.8)) * 0.55);
  for (const px of [x + w * 0.2, x + w * 0.78]) {
    const sw = 11 * u;
    box(ctx, lower ? '#5E4C2C' : '#7C6234', px - sw / 2, y, sw, h);
    ctx.strokeStyle = '#D2B98A';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    for (const dx of [-sw / 2 + 2.5, sw / 2 - 2.5]) {
      ctx.moveTo(px + dx, y);
      ctx.lineTo(px + dx, y + h);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    box(ctx, '#8C6B2A', px - 6.5 * u, y + h * 0.4 - 1, 13 * u, 11 * u);
    box(ctx, '#D9B25A', px - 5.5 * u, y + h * 0.4, 11 * u, 9 * u);
    box(ctx, '#4A3A1E', px - 3 * u, y + h * 0.4 + 2.5 * u, 6 * u, 4 * u);
  }
  const cap = 8 * u;
  for (const [cx, cy] of [[x, y], [x + w - cap, y], [x, y + h - cap], [x + w - cap, y + h - cap]] as const) {
    box(ctx, '#4A3A1E', cx, cy, cap, cap);
    box(ctx, lower ? '#756040' : '#8C7448', cx + 1, cy + 1, cap - 2, cap - 2);
    box(ctx, '#D9B25A', Math.round(cx + cap / 2 - 1), Math.round(cy + cap / 2 - 1), 2, 2);
  }
  if (!lower) {
    ctx.save();
    ctx.translate(x + w * 0.49, y + h * 0.6);
    ctx.rotate(0.08);
    box(ctx, '#D6BF8E', -13 * u, -9 * u, 26 * u, 18 * u);
    ctx.strokeStyle = '#8C7448';
    ctx.setLineDash([3, 2.5]);
    ctx.strokeRect(-10 * u, -6 * u, 20 * u, 12 * u);
    ctx.restore();
    ctx.setLineDash([]);
  }
  ctx.restore();
  ctx.strokeStyle = '#4A3A1E';
  ctx.lineWidth = 1;
  ctx.stroke(body);
}

interface Spot { u: number; cx: number; stackTop: number; shortOnly: boolean; floor: number }

function spot(w: number, h: number): Spot | null {
  if (h < 70) return null;
  const shortOnly = h < 110;
  const u = clamp(Math.min(shortOnly ? (h - 6) / 100 : h / 205, w / 216), 0.3, 1.25);
  return { u, cx: w / 2, stackTop: h - 90 * u, shortOnly, floor: h - 2 };
}

export default defineCharm<Record<string, never>>({
  layout: () => ({}),

  // The two suitcases never change: painted once.
  back({ ctx, w, h, rnd }) {
    const sp = spot(w, h);
    if (!sp || sp.shortOnly) return;
    const { u, cx, floor } = sp;
    suitcase(ctx, rnd, cx - 80 * u, floor - 46 * u, 160 * u, 46 * u, u, true);
    suitcase(ctx, rnd, cx - 62 * u, floor - 90 * u, 134 * u, 44 * u, u, false);
  },

  draw(f) {
    const { ctx, w, h, t, moving, boarding } = f;
    const sp = spot(w, h);
    if (!sp) return;
    const { u, cx, shortOnly } = sp;
    const bob = moving ? Math.sin((t / (boarding ? 2400 : 4400)) * TAU) * 2 * u : 0;
    const half = 48 * u;
    const tip = shortOnly ? h - 4 * u : sp.floor - 90 * u - 15 * u;
    const cy = tip - half + bob;
    const turn = moving ? Math.sin(t / 1700) : 0;
    const ax = turn * 3 * u;
    const top = [cx + ax * 0.4, cy - half];
    const bot = [cx + ax * 0.4, cy + half];
    const mid = [cx + ax, cy - 2 * u];
    const lft = [cx - 22 * u - turn * 2 * u, cy - 5 * u];
    const rgt = [cx + 22 * u - turn * 2 * u, cy - 5 * u];
    const shift = moving ? Math.floor(t / 1700) % 4 : 2;
    const edge = [[top, lft], [top, rgt], [bot, rgt], [bot, lft]] as const;
    const facets = (pal: readonly string[]) => {
      edge.forEach(([a, b], i) => {
        ctx.fillStyle = pal[(i + shift) % 4]!;
        ctx.beginPath();
        ctx.moveTo(a[0]!, a[1]!);
        ctx.lineTo(b[0]!, b[1]!);
        ctx.lineTo(mid[0]!, mid[1]!);
        ctx.closePath();
        ctx.fill();
      });
    };

    // Two tilted rings: the done motes ride on them, one half behind the crystal, one in front.
    const rings = [[40 * u, 10 * u, -0.3], [33 * u, 13 * u, 0.5]] as const;
    const mote = (i: number, front: boolean) => {
      const [rx, ry, tilt] = rings[i % 2]!;
      const a = (Math.floor(i / 2) * TAU) / 6 + (i % 2) * 0.5 + (moving ? t / (i % 2 ? 1500 : 1900) : 0.6);
      if ((Math.sin(a) > 0) !== front) return;
      const ex = Math.cos(a) * rx;
      const ey = Math.sin(a) * ry;
      const x = Math.round(cx + ex * Math.cos(tilt) - ey * Math.sin(tilt));
      const y = Math.round(cy + 4 * u + ex * Math.sin(tilt) + ey * Math.cos(tilt));
      box(ctx, '#FF9ACB', x - 2, y - 1, 5, 3);
      box(ctx, '#FF9ACB', x - 1, y - 2, 3, 5);
      box(ctx, '#FFFFFF', x - 1, y - 1, 2, 2);
    };
    const done = Math.min(12, f.done);
    const ringLine = (front: boolean) => {
      ctx.strokeStyle = '#6A4C94';
      ctx.lineWidth = 1;
      for (const [rx, ry, tilt] of rings) {
        ctx.beginPath();
        ctx.ellipse(cx, cy + 4 * u, rx, ry, tilt, front ? 0 : Math.PI, front ? Math.PI : TAU);
        ctx.stroke();
      }
    };
    if (!shortOnly) ringLine(false);
    for (let i = 0; i < done; i += 1) mote(i, false);

    // The crystal: unlit plum all over, then the pink part above a hard line that rises with progress.
    facets(UNLIT);
    const p = clamp(f.progress);
    if (p > 0) {
      const yLine = cy + half - p * 2 * half;
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx - 40 * u, yLine, 80 * u, h);
      ctx.clip();
      facets(LIT);
      ctx.restore();
      if (p < 1) box(ctx, '#FFC2E0', cx - (half - Math.abs(yLine - cy)) * 0.46, Math.round(yLine), (half - Math.abs(yLine - cy)) * 0.92, 1);
    }
    ctx.strokeStyle = '#3A0A2C';
    ctx.beginPath();
    ctx.moveTo(top[0]!, top[1]!);
    for (const q of [rgt, bot, lft]) ctx.lineTo(q[0]!, q[1]!);
    ctx.closePath();
    ctx.stroke();

    // The glint: a hard white star on the upper right facet, travelling round the facets while a block is boarding.
    const ga = boarding && moving ? t / 800 : -0.8;
    const gx = cx + ax + Math.cos(ga) * 9 * u;
    const gy = cy - 8 * u + Math.sin(ga) * 18 * u;
    const gr = 8 * u;
    ctx.fillStyle = p > 0.15 || boarding ? '#FFFFFF' : '#A58BC0';
    ctx.beginPath();
    ctx.moveTo(gx, gy - gr);
    ctx.lineTo(gx + gr * 0.2, gy - gr * 0.2);
    ctx.lineTo(gx + gr, gy);
    ctx.lineTo(gx + gr * 0.2, gy + gr * 0.2);
    ctx.lineTo(gx, gy + gr);
    ctx.lineTo(gx - gr * 0.2, gy + gr * 0.2);
    ctx.lineTo(gx - gr, gy);
    ctx.lineTo(gx - gr * 0.2, gy - gr * 0.2);
    ctx.closePath();
    ctx.fill();

    if (!shortOnly) ringLine(true);
    for (let i = 0; i < done; i += 1) mote(i, true);
  },
});
