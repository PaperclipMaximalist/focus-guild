/**
 * The Star Guild's small drawn things: the trim of a moulded station, in
 * lavender light and one rose glow. Painted smooth, lit from above.
 *
 *   frames.panel      a rounded rim, brighter along the top where the light
 *                     catches it, with an angled bracket cut inside two
 *                     opposite corners
 *   frames.card       a bezel with a glowing rose light channel set into it,
 *                     notches along its edge and a double chevron in each corner
 *   frames.sign       brackets in plum ink at the corners of the sheen
 *   edges.vertical    a light channel down the sidebar's edge; its segments
 *                     light by turns (4 frames)
 *   edges.horizontal  the same channel along the phone's two bars (4 frames)
 *   edges.crown       a row of indicator pips with one lit, running along (6 frames)
 *   sprites.emblem    the guild's mission patch: a stitched disc, a ringed
 *                     planet and a star on it, rimmed rose to peach
 *   sprites.mark      a double chevron, a rank's insignia; its second bar
 *                     lights after its first (8 frames)
 *   sprites.rule      a ringed planet and a ruled line running out from it,
 *                     ticked like a scale; a rose comet crosses it (12 frames)
 */

import { defineOrnaments } from '../types';
import type { Paint } from '../types';
import { spark } from './texture';

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

const DEEP = '#07051E';
const LAV = '#A99CFF', LAV_HI = '#E8E2FF', LAV_LO = '#5A50B8';
const ROSE = '#FF85B8', PEACH = '#FFC07A', PLUM = '#2A0618';

const rr = (c: Ctx, x: number, y: number, w: number, h: number, r: number) => {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
};

const sheen = (c: Ctx, x0: number, x1: number) => {
  const g = c.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, ROSE);
  g.addColorStop(1, PEACH);
  return g;
};

const corners = (p: Paint, draw: (sx: number, sy: number) => void) => {
  const { ctx: c, w } = p;
  for (const sx of [1, -1]) {
    for (const sy of [1, -1]) {
      c.save();
      c.translate(w / 2, w / 2);
      c.scale(sx, sy);
      c.translate(-w / 2, -w / 2);
      draw(sx, sy);
      c.restore();
    }
  }
};

// ── frames ──

const panel = (p: Paint) => {
  const { ctx: c, w: S } = p;
  c.lineWidth = 1;
  c.strokeStyle = 'rgba(5,3,26,0.9)';
  rr(c, 0.5, 0.5, S - 1, S - 1, 10);
  c.stroke();
  c.strokeStyle = LAV_LO;
  c.globalAlpha = 0.85;
  rr(c, 1.5, 1.5, S - 3, S - 3, 9);
  c.stroke();
  // The top catches the light.
  c.save();
  c.beginPath();
  c.rect(0, 0, S, 9);
  c.clip();
  c.strokeStyle = LAV_HI;
  c.globalAlpha = 0.75;
  rr(c, 1.5, 1.5, S - 3, S - 3, 9);
  c.stroke();
  c.restore();
  c.globalAlpha = 1;
  corners(p, (sx, sy) => {
    if (sx !== sy) return;
    c.strokeStyle = LAV;
    c.globalAlpha = 0.8;
    c.lineWidth = 1.3;
    c.beginPath();
    c.moveTo(5.5, 13);
    c.lineTo(5.5, 8.5);
    c.lineTo(8.5, 5.5);
    c.lineTo(13, 5.5);
    c.stroke();
    c.globalAlpha = 1;
    c.fillStyle = ROSE;
    c.beginPath();
    c.arc(5.5, 13.8, 1.1, 0, TAU);
    c.fill();
  });
};

const CARD = 22;
const card = (p: Paint) => {
  const { ctx: c, w: S } = p;
  // Bezel.
  c.lineWidth = 5;
  const bez = c.createLinearGradient(0, 0, 0, S);
  bez.addColorStop(0, '#5B52C4');
  bez.addColorStop(1, '#2A2478');
  c.strokeStyle = bez;
  rr(c, 3, 3, S - 6, S - 6, 8.5);
  c.stroke();
  c.lineWidth = 1;
  c.strokeStyle = 'rgba(5,3,26,0.95)';
  rr(c, 0.5, 0.5, S - 1, S - 1, 10);
  c.stroke();
  c.strokeStyle = 'rgba(232,226,255,0.7)';
  c.save();
  c.beginPath();
  c.rect(0, 0, S, 10);
  c.clip();
  rr(c, 1.5, 1.5, S - 3, S - 3, 9);
  c.stroke();
  c.restore();
  // Notches along the bezel, two to a stretch.
  c.fillStyle = 'rgba(5,3,26,0.7)';
  for (const t of [CARD + 6, CARD + 18]) {
    c.fillRect(t - 1.5, 1.5, 3, 3);
    c.fillRect(t - 1.5, S - 4.5, 3, 3);
    c.fillRect(1.5, t - 1.5, 3, 3);
    c.fillRect(S - 4.5, t - 1.5, 3, 3);
  }
  // The light channel.
  c.lineWidth = 3;
  c.strokeStyle = DEEP;
  rr(c, 8, 8, S - 16, S - 16, 6);
  c.stroke();
  c.shadowColor = 'rgba(255,125,180,0.95)';
  c.shadowBlur = 5;
  c.lineWidth = 1.3;
  c.strokeStyle = sheen(c, 0, S);
  rr(c, 8, 8, S - 16, S - 16, 6);
  c.stroke();
  c.shadowBlur = 0;
  corners(p, () => {
    c.strokeStyle = LAV_HI;
    c.globalAlpha = 0.9;
    c.lineWidth = 1.5;
    c.lineCap = 'round';
    for (const o of [0, 4]) {
      c.beginPath();
      c.moveTo(13 + o, 18 + o);
      c.lineTo(13 + o, 13 + o);
      c.lineTo(18 + o, 13 + o);
      c.stroke();
    }
    c.globalAlpha = 1;
  });
};

const sign = (p: Paint) => {
  const { ctx: c } = p;
  corners(p, () => {
    c.strokeStyle = PLUM;
    c.globalAlpha = 0.55;
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(4, 10);
    c.lineTo(4, 6.5);
    c.lineTo(6.5, 4);
    c.lineTo(10, 4);
    c.stroke();
    c.globalAlpha = 1;
  });
};

// ── edges ──

/** A light channel along x: a dark groove with two segments in it; `lit` is the bright one (-1 for none). */
const channel = (c: Ctx, len: number, th: number, lit: number) => {
  c.fillStyle = DEEP;
  c.fillRect(0, th / 2 - 2, len, 4);
  c.fillStyle = 'rgba(170,160,255,0.22)';
  c.fillRect(0, th / 2 + 2, len, 0.8);
  const seg = len / 2;
  for (let i = 0; i < 2; i += 1) {
    const on = i === lit;
    if (on) {
      c.shadowColor = 'rgba(255,125,180,0.95)';
      c.shadowBlur = 5;
    }
    c.fillStyle = on ? ROSE : '#4A3FA8';
    c.fillRect(i * seg + 2, th / 2 - 0.9, seg - 4, 1.8);
    c.shadowBlur = 0;
  }
};
const CHASE = [0, -1, 1, -1];

const vertical = {
  w: 8,
  h: 24,
  frames: 4,
  seconds: 2.4,
  paint: ({ ctx: c }: Paint, frame: number) => {
    c.translate(8, 0);
    c.rotate(Math.PI / 2);
    channel(c, 24, 8, CHASE[frame]!);
  },
};

const horizontal = {
  w: 24,
  h: 8,
  frames: 4,
  seconds: 2.4,
  paint: ({ ctx: c }: Paint, frame: number) => channel(c, 24, 8, CHASE[frame]!),
};

const crown = {
  w: 48,
  h: 10,
  frames: 6,
  seconds: 1.8,
  paint: ({ ctx: c }: Paint, frame: number) => {
    for (let i = 0; i < 6; i += 1) {
      const on = i === frame, was = i === (frame + 5) % 6;
      if (on) {
        c.shadowColor = 'rgba(255,125,180,0.95)';
        c.shadowBlur = 5;
      }
      c.fillStyle = on ? ROSE : was ? '#B06CC8' : '#4A3FA8';
      rr(c, i * 8 + 1.5, 3, 5, 2.6, 1.3);
      c.fill();
      c.shadowBlur = 0;
    }
  },
};

// ── sprites ──

const emblem = {
  w: 24,
  h: 24,
  paint: ({ ctx: c }: Paint) => {
    const field = c.createLinearGradient(0, 1, 0, 23);
    field.addColorStop(0, '#463CB0');
    field.addColorStop(1, '#120E44');
    c.fillStyle = field;
    c.beginPath();
    c.arc(12, 12, 10.6, 0, TAU);
    c.fill();
    c.strokeStyle = sheen(c, 2, 22);
    c.lineWidth = 1.8;
    c.stroke();
    // Stitching.
    c.strokeStyle = 'rgba(232,226,255,0.55)';
    c.lineWidth = 0.8;
    c.setLineDash([1.3, 1.5]);
    c.beginPath();
    c.arc(12, 12, 8.3, 0, TAU);
    c.stroke();
    c.setLineDash([]);
    // The planet, its ring, a star.
    const globe = c.createLinearGradient(8, 9, 14, 17);
    globe.addColorStop(0, LAV_HI);
    globe.addColorStop(1, '#8474E8');
    c.fillStyle = globe;
    c.beginPath();
    c.arc(11, 13.2, 3.5, 0, TAU);
    c.fill();
    c.strokeStyle = LAV_HI;
    c.lineWidth = 1.1;
    c.beginPath();
    c.ellipse(11, 13.2, 6.6, 1.9, -0.38, 0, TAU);
    c.stroke();
    c.fillStyle = ROSE;
    spark(c, 16.2, 7.6, 3);
  },
};

const BAR = [0.45, 0.45, 0.45, 1, 0.7, 0.45, 0.45, 0.45];
const mark = {
  w: 14,
  h: 14,
  frames: 8,
  seconds: 3.2,
  paint: ({ ctx: c }: Paint, frame: number) => {
    c.lineWidth = 2.2;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    const bar = (x: number, col: string, a: number) => {
      if (a === 1) {
        c.shadowColor = col;
        c.shadowBlur = 4;
      }
      c.globalAlpha = a;
      c.strokeStyle = col;
      c.beginPath();
      c.moveTo(x, 3);
      c.lineTo(x + 4, 7);
      c.lineTo(x, 11);
      c.stroke();
      c.shadowBlur = 0;
      c.globalAlpha = 1;
    };
    bar(2.5, LAV, Math.max(0.75, BAR[frame]!));
    bar(8, ROSE, BAR[(frame + 7) % 8]!);
  },
};

const rule = {
  w: 168,
  h: 14,
  frames: 12,
  seconds: 6,
  paint: ({ ctx: c }: Paint, frame: number) => {
    const line = c.createLinearGradient(20, 0, 166, 0);
    line.addColorStop(0, 'rgba(169,156,255,0.95)');
    line.addColorStop(1, 'rgba(169,156,255,0)');
    c.fillStyle = line;
    c.fillRect(20, 6.5, 146, 1.1);
    for (let x = 32; x < 150; x += 12) c.fillRect(x, 5, 1, (x - 32) % 36 === 0 ? 5 : 3.2);
    // The planet.
    const globe = c.createLinearGradient(4, 3, 14, 12);
    globe.addColorStop(0, LAV_HI);
    globe.addColorStop(1, '#7464DC');
    c.fillStyle = globe;
    c.beginPath();
    c.arc(9, 7, 4.2, 0, TAU);
    c.fill();
    c.strokeStyle = LAV_HI;
    c.lineWidth = 1.1;
    c.beginPath();
    c.ellipse(9, 7, 8, 2.1, -0.32, 0, TAU);
    c.stroke();
    // The comet, with its tail behind it.
    const x = 24 + (frame / 11) * 128;
    const tail = c.createLinearGradient(x - 22, 0, x, 0);
    tail.addColorStop(0, 'rgba(255,133,184,0)');
    tail.addColorStop(1, `rgba(255,133,184,${0.9 - frame * 0.05})`);
    c.fillStyle = tail;
    c.fillRect(Math.max(22, x - 22), 6.1, Math.min(22, x - 22), 1.9);
    c.shadowColor = 'rgba(255,125,180,0.95)';
    c.shadowBlur = 5;
    c.fillStyle = '#FFE1EE';
    c.globalAlpha = 1 - frame * 0.05;
    c.beginPath();
    c.arc(x, 7, 1.7, 0, TAU);
    c.fill();
    c.globalAlpha = 1;
    c.shadowBlur = 0;
  },
};

export default defineOrnaments({
  frames: {
    panel: { slice: 14, edge: 20, paint: panel },
    card: { slice: CARD, edge: 24, paint: card },
    sign: { slice: 10, edge: 20, paint: sign },
  },
  edges: { vertical, horizontal, crown },
  sprites: { emblem, mark, rule },
});
