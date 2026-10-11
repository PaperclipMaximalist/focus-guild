/**
 * The Night Line's small drawn things. A first, plain set that proves the
 * plumbing: a double-ruled enamel frame with a screw at each corner, a signal
 * lozenge before section labels, a rail under page titles.
 */

import { defineOrnaments } from '../types';
import type { Paint } from '../types';

const RULE = '#363E78';
const RULE_DIM = '#1C2249';
const LIGHT = '#9FE8FF';
const YELLOW = '#FFD23A';

const px = (p: Paint, c: string, x: number, y: number, w: number, h: number, a = 1) => {
  p.ctx.globalAlpha = a;
  p.ctx.fillStyle = c;
  p.ctx.fillRect(x, y, w, h);
  p.ctx.globalAlpha = 1;
};

/** Two rules round the edge, the outer one stronger, and a screw head in each corner. */
const plate = (inset: number) => (p: Paint) => {
  const { w: s } = p;
  for (const [o, c] of [[0, RULE], [inset, RULE_DIM]] as const) {
    px(p, c, o, o, s - o * 2, 1);
    px(p, c, o, s - o - 1, s - o * 2, 1);
    px(p, c, o, o, 1, s - o * 2);
    px(p, c, s - o - 1, o, 1, s - o * 2);
  }
  for (const [x, y] of [[4, 4], [s - 8, 4], [4, s - 8], [s - 8, s - 8]] as const) {
    px(p, '#06081A', x, y, 4, 4);
    px(p, RULE, x + 0.5, y + 0.5, 3, 3);
    px(p, '#06081A', x + 0.5, y + 1.5, 3, 1);
  }
};

export default defineOrnaments({
  frames: {
    panel: { slice: 10, edge: 16, paint: plate(3) },
    card: { slice: 14, edge: 16, paint: plate(4) },
  },
  sprites: {
    mark: {
      w: 12,
      h: 12,
      paint: (p) => {
        const c = p.ctx;
        c.fillStyle = YELLOW;
        c.beginPath();
        c.moveTo(6, 1);
        c.lineTo(11, 6);
        c.lineTo(6, 11);
        c.lineTo(1, 6);
        c.closePath();
        c.fill();
        px(p, '#06081A', 5, 5, 2, 2);
      },
    },
    rule: {
      w: 140,
      h: 10,
      paint: (p) => {
        px(p, LIGHT, 0, 4, 140, 1, 0.55);
        px(p, RULE, 0, 7, 140, 1);
        for (let x = 0; x < 140; x += 14) px(p, RULE, x, 4, 2, 4);
      },
    },
  },
});
