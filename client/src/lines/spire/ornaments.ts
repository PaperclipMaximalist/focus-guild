/**
 * The Spire Guild's small drawn things: the fittings of a guild airship's deck,
 * in black iron and gold. Painted smooth, lit from above.
 *
 *   frames.panel      an iron band with a gold hairline inside it, and at each
 *                     corner the stepped bracket of a cargo chest with a gold stud
 *   frames.card       a heavier band with rivets and a double gold rule; each
 *                     corner a twice-stepped bracket set with a lit diamond
 *   frames.sign       engraved into the gold: a double rule, a diamond at each corner
 *   edges.vertical    the mooring rope, twisted, down the sidebar's edge
 *   edges.horizontal  the same rope along the phone's two bars
 *   edges.crown       guild pennants on a cord, gold and green by turns, stirring
 *                     in the wind (8 frames)
 *   sprites.emblem    the guild's arms: a green shield rimmed in gold, a spire on it
 *   sprites.mark      a cut gold diamond; a glint crosses it now and then (8 frames)
 *   sprites.rule      a diamond, and a gold line running out from it and fading,
 *                     two smaller diamonds along it; a glint travels the line (12 frames)
 */

import { defineOrnaments } from '../types';
import type { Paint } from '../types';

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

const INK = '#040A08';
const IRON_HI = '#3F6E5E', IRON = '#234A3D', IRON_LO = '#122821';
const GOLD_HI = '#FFE9A8', GOLD = '#F5B63C', GOLD_LO = '#9A6A14';
const ON_GOLD = '#1B1203';

const goldDown = (c: Ctx, y0: number, y1: number) => {
  const g = c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, GOLD_HI);
  g.addColorStop(0.5, GOLD);
  g.addColorStop(1, GOLD_LO);
  return g;
};

const diamond = (c: Ctx, x: number, y: number, rx: number, ry = rx) => {
  c.beginPath();
  c.moveTo(x, y - ry);
  c.lineTo(x + rx, y);
  c.lineTo(x, y + ry);
  c.lineTo(x - rx, y);
  c.closePath();
};

/** A cut gold diamond: lit upper-left facet, shaded lower-right. */
const gem = (c: Ctx, x: number, y: number, r: number, glow = 0) => {
  if (glow) {
    c.shadowColor = 'rgba(245,182,60,0.9)';
    c.shadowBlur = glow;
  }
  c.fillStyle = GOLD;
  diamond(c, x, y, r);
  c.fill();
  c.shadowBlur = 0;
  c.fillStyle = GOLD_HI;
  c.beginPath();
  c.moveTo(x, y - r);
  c.lineTo(x, y);
  c.lineTo(x - r, y);
  c.closePath();
  c.fill();
  c.fillStyle = GOLD_LO;
  c.beginPath();
  c.moveTo(x, y + r);
  c.lineTo(x, y);
  c.lineTo(x + r, y);
  c.closePath();
  c.fill();
};

/** A small soft light. */
const glint = (c: Ctx, x: number, y: number, r: number, a = 0.95) => {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(255,252,236,${a})`);
  g.addColorStop(1, 'rgba(255,252,236,0)');
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
};

/** Draws one corner (top left) and mirrors it into the other three. */
const corners = (p: Paint, draw: () => void) => {
  const { ctx: c, w } = p;
  for (const sx of [1, -1]) {
    for (const sy of [1, -1]) {
      c.save();
      c.translate(w / 2, w / 2);
      c.scale(sx, sy);
      c.translate(-w / 2, -w / 2);
      draw();
      c.restore();
    }
  }
};

const ring = (c: Ctx, S: number, inset: number, col: string, lw = 1, a = 1) => {
  c.globalAlpha = a;
  c.strokeStyle = col;
  c.lineWidth = lw;
  c.strokeRect(inset, inset, S - inset * 2, S - inset * 2);
  c.globalAlpha = 1;
};

const bracket = (c: Ctx, pts: number[]) => {
  c.beginPath();
  c.moveTo(pts[0]!, pts[1]!);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i]!, pts[i + 1]!);
  c.closePath();
  const g = c.createLinearGradient(0, 0, pts[2]!, pts[2]!);
  g.addColorStop(0, '#3A6857');
  g.addColorStop(1, '#152E27');
  c.fillStyle = g;
  c.fill();
  c.strokeStyle = INK;
  c.lineWidth = 1;
  c.stroke();
};

// ── frames ──

const panel = (p: Paint) => {
  const { ctx: c, w: S } = p;
  ring(c, S, 2.5, IRON, 4);
  ring(c, S, 0.5, INK);
  ring(c, S, 1.5, IRON_HI, 1, 0.8);
  ring(c, S, 4.5, IRON_LO);
  ring(c, S, 7.5, '#D6A03C', 1, 0.7);
  corners(p, () => {
    bracket(c, [0.5, 0.5, 12, 0.5, 12, 5, 9, 5, 9, 9, 5, 9, 5, 12, 0.5, 12]);
    gem(c, 4.6, 4.6, 2.3, 3);
  });
};

const CARD = 22;
const card = (p: Paint) => {
  const { ctx: c, w: S } = p;
  ring(c, S, 5, IRON, 8);
  ring(c, S, 0.5, INK);
  ring(c, S, 1.5, IRON_HI, 1, 0.85);
  ring(c, S, 9.5, INK, 1, 0.9);
  ring(c, S, 12.5, '#E0AA44', 1, 0.85);
  ring(c, S, 15.5, '#E0AA44', 1, 0.35);
  // Rivets, two to a stretch, on all four sides.
  const rivet = (x: number, y: number) => {
    const g = c.createRadialGradient(x - 0.6, y - 0.6, 0, x, y, 2);
    g.addColorStop(0, '#8FBFAC');
    g.addColorStop(1, '#16332B');
    c.fillStyle = INK;
    c.beginPath();
    c.arc(x, y + 0.4, 2.2, 0, TAU);
    c.fill();
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, 1.7, 0, TAU);
    c.fill();
  };
  for (const t of [CARD + 6, CARD + 18]) {
    rivet(t, 5);
    rivet(t, S - 5);
    rivet(5, t);
    rivet(S - 5, t);
  }
  corners(p, () => {
    bracket(c, [0.5, 0.5, 22, 0.5, 22, 6, 17, 6, 17, 11, 11, 11, 11, 17, 6, 17, 6, 22, 0.5, 22]);
    c.strokeStyle = 'rgba(224,170,68,0.55)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(19.5, 3.5);
    c.lineTo(3.5, 3.5);
    c.lineTo(3.5, 19.5);
    c.stroke();
    gem(c, 8.6, 8.6, 4.4, 7);
  });
};

const sign = (p: Paint) => {
  const { ctx: c, w: S } = p;
  ring(c, S, 3.5, ON_GOLD, 1, 0.6);
  ring(c, S, 5.5, ON_GOLD, 1, 0.22);
  corners(p, () => {
    c.fillStyle = ON_GOLD;
    c.globalAlpha = 0.75;
    diamond(c, 4.5, 4.5, 3);
    c.fill();
    c.globalAlpha = 1;
  });
};

// ── edges ──

/** A twisted rope lying along x, `len` long and `th` thick. One twist every 8 px. */
const rope = (c: Ctx, len: number, th: number) => {
  c.save();
  c.beginPath();
  c.rect(0, 1, len, th - 2);
  c.clip();
  c.fillStyle = '#231A0C';
  c.fillRect(0, 0, len, th);
  for (let x = -8; x <= len + 8; x += 8) {
    c.save();
    c.translate(x + 4, th / 2);
    c.rotate(-0.72);
    const g = c.createLinearGradient(0, -th * 0.4, 0, th * 0.4);
    g.addColorStop(0, '#C7A768');
    g.addColorStop(0.55, '#8A6E3E');
    g.addColorStop(1, '#3E2F16');
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(0, 0, th * 0.72, th * 0.3, 0, 0, TAU);
    c.fill();
    c.restore();
  }
  // Round it: shade both long edges.
  const shade = c.createLinearGradient(0, 1, 0, th - 1);
  shade.addColorStop(0, 'rgba(0,0,0,0.35)');
  shade.addColorStop(0.3, 'rgba(0,0,0,0)');
  shade.addColorStop(0.7, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.55)');
  c.fillStyle = shade;
  c.fillRect(0, 0, len, th);
  c.restore();
};

const vertical = {
  w: 10,
  h: 16,
  paint: ({ ctx: c }: Paint) => {
    c.translate(10, 0);
    c.rotate(Math.PI / 2);
    rope(c, 16, 10);
  },
};

const horizontal = { w: 16, h: 8, paint: ({ ctx: c }: Paint) => rope(c, 16, 8) };

const crown = {
  w: 48,
  h: 14,
  frames: 8,
  seconds: 4,
  paint: ({ ctx: c }: Paint, frame: number) => {
    const sway = Math.sin((frame / 8) * TAU);
    const cord = (x: number) => 2 + 2.4 * (1 - ((x - 24) / 24) ** 2);
    c.strokeStyle = '#8A744A';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(0, 2);
    c.quadraticCurveTo(24, 6.8, 48, 2);
    c.stroke();
    const pennant = (cx: number, gilt: boolean, lean: number) => {
      const top = cord(cx);
      c.beginPath();
      c.moveTo(cx - 6, cord(cx - 6));
      c.lineTo(cx + 6, cord(cx + 6));
      c.lineTo(cx + lean * 1.7, top + 9.5);
      c.closePath();
      if (gilt) c.fillStyle = goldDown(c, top, top + 10);
      else {
        const g = c.createLinearGradient(0, top, 0, top + 10);
        g.addColorStop(0, '#4FA084');
        g.addColorStop(1, '#1A4638');
        c.fillStyle = g;
      }
      c.fill();
      c.strokeStyle = INK;
      c.lineWidth = 0.6;
      c.stroke();
      c.fillStyle = gilt ? ON_GOLD : GOLD;
      c.globalAlpha = 0.8;
      diamond(c, cx + lean * 0.5, top + 3.6, 1.3);
      c.fill();
      c.globalAlpha = 1;
    };
    pennant(12, true, sway);
    pennant(36, false, Math.sin((frame / 8) * TAU + 1.3));
  },
};

// ── sprites ──

const emblem = {
  w: 24,
  h: 24,
  paint: ({ ctx: c }: Paint) => {
    c.beginPath();
    c.moveTo(3.5, 2.5);
    c.lineTo(20.5, 2.5);
    c.lineTo(20.5, 11.5);
    c.bezierCurveTo(20.5, 17.5, 16.5, 20.5, 12, 22.8);
    c.bezierCurveTo(7.5, 20.5, 3.5, 17.5, 3.5, 11.5);
    c.closePath();
    const field = c.createLinearGradient(0, 2, 0, 23);
    field.addColorStop(0, '#34886F');
    field.addColorStop(1, '#0E2C24');
    c.fillStyle = field;
    c.fill();
    c.strokeStyle = goldDown(c, 2, 23);
    c.lineWidth = 1.7;
    c.stroke();
    // The spire.
    c.fillStyle = goldDown(c, 5, 19);
    c.beginPath();
    c.moveTo(12, 5);
    c.lineTo(14.6, 10.4);
    c.lineTo(14.2, 10.4);
    c.lineTo(14.2, 16.6);
    c.lineTo(15.6, 16.6);
    c.lineTo(15.6, 18.2);
    c.lineTo(8.4, 18.2);
    c.lineTo(8.4, 16.6);
    c.lineTo(9.8, 16.6);
    c.lineTo(9.8, 10.4);
    c.lineTo(9.4, 10.4);
    c.closePath();
    c.fill();
    c.fillStyle = ON_GOLD;
    c.beginPath();
    c.moveTo(11.2, 15.4);
    c.lineTo(11.2, 12.6);
    c.quadraticCurveTo(12, 11.2, 12.8, 12.6);
    c.lineTo(12.8, 15.4);
    c.closePath();
    c.fill();
  },
};

const mark = {
  w: 14,
  h: 14,
  frames: 8,
  seconds: 4,
  paint: ({ ctx: c }: Paint, frame: number) => {
    c.fillStyle = INK;
    diamond(c, 7, 7, 6.2);
    c.fill();
    gem(c, 7, 7, 5);
    if (frame === 5) glint(c, 5, 5, 3.2, 0.9);
    if (frame === 6) glint(c, 8.5, 8.5, 2.6, 0.7);
  },
};

const rule = {
  w: 168,
  h: 14,
  frames: 12,
  seconds: 6,
  paint: ({ ctx: c }: Paint, frame: number) => {
    const fade = (x0: number, x1: number, a: number) => {
      const g = c.createLinearGradient(x0, 0, x1, 0);
      g.addColorStop(0, `rgba(245,182,60,${a})`);
      g.addColorStop(1, 'rgba(245,182,60,0)');
      return g;
    };
    c.fillStyle = fade(14, 164, 0.95);
    c.fillRect(14, 6.4, 150, 1.2);
    c.fillStyle = fade(14, 96, 0.4);
    c.fillRect(14, 9.2, 82, 1);
    // Wings either side of the stone.
    c.fillStyle = GOLD;
    c.beginPath();
    c.moveTo(13, 3.4);
    c.lineTo(24, 7);
    c.lineTo(13, 10.6);
    c.closePath();
    c.fill();
    c.fillStyle = INK;
    diamond(c, 8, 7, 6.6);
    c.fill();
    gem(c, 8, 7, 5.4);
    gem(c, 44, 7, 2.6);
    c.globalAlpha = 0.75;
    gem(c, 74, 7, 2);
    c.globalAlpha = 1;
    if (frame >= 2 && frame <= 9) glint(c, 20 + ((frame - 2) / 7) * 120, 7, 5, 0.9 - (frame - 2) * 0.08);
  },
};

export default defineOrnaments({
  frames: {
    panel: { slice: 12, edge: 24, paint: panel },
    card: { slice: CARD, edge: 24, paint: card },
    sign: { slice: 10, edge: 20, paint: sign },
  },
  edges: { vertical, horizontal, crown },
  sprites: { emblem, mark, rule },
});
