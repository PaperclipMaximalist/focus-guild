/**
 * The Timber Line: the window of a night sleeper, looking out over birch
 * country. Under way, the country slides slowly left: two soft ridgelines, pale
 * birches in two depths (sparse and dim on the left, where the words are,
 * denser and paler on the right) and a few leaves coming down. A thin moon
 * hangs low on the right. Below 78 % runs the dark trackside bank.
 *
 * The visitor is the halt the train pulls into: a short timber platform with a
 * low shelter, a bench, a blank nameboard and one hanging lamp whose honey
 * shade is the only accent in the scene. Arriving, it slides in from the right
 * and settles over the right 40 % of the window while the country slows to a
 * stop. Stopped, it waits. Departing, it slides away left as the country picks
 * up again. Passing, one goes by without stopping. Away, only the country.
 *
 * Fixed inside, along the bottom: the timber sill. The signal is a cabin
 * lantern at its right end (green, or amber when there are stragglers). One
 * acorn per quest finished today stands in a row left of it (up to 12). The
 * companion is a sparrow left of the acorns: it turns its head now and then,
 * settles low and round while the halt is stopped, and hops once as the train
 * pulls out.
 *
 * Flat colours only: no gradients, no blur.
 */

import { defineScene } from '../types';

const SKY = '#120E10';
const HILL_FAR = '#1D1613';
const HILL_NEAR = '#271D17';
const MOON = '#C9BCA4';
const BIRCH_FAR = '#4D4038';
const BIRCH = '#C4B7A2';
const BIRCH_SHADE = '#8E8271';
const NOTCH = '#1A1210';
const BANK = '#0A0706';
const BANK_LINE = '#2C201A';
const TUFT = '#4B362B';
const DECK = '#2F221A';
const DECK_TOP = '#6D5039';
const DECK_EDGE = '#C2B39A';
const CLOCK_FACE = '#DCD0BA';
const CLOCK_HAND = '#2A1E18';
const WALL = '#1B1310';
const WALL_SEAM = '#150E0B';
const ROOF = '#1E1612';
const ROOF_EDGE = '#53392A';
const FASCIA = '#4A3425';
const POST = '#5E4531';
const POST_HI = '#7B5C42';
const BENCH = '#6F5338';
const BOARD = '#9A8970';
/** The one accent: the lamp's shade. Its light is the same honey, faint. */
const HONEY = '#F2C14E';
const BULB = '#FFF1C4';
const SILL = '#241B16';
const SILL_SEAM = '#1A120E';
const IRON_HI = '#5A463A';
const SILL_LIP = '#3E2E25';
const LEAF = '#A9702D';
const LEAF_DARK = '#7B5429';
const GREEN = '#7FD99A';
const AMBER = '#F58A3C';
const IRON = '#4A382C';
const NUT = '#B07C44';
const NUT_HI = '#D1A06A';
const NUT_CAP = '#5B3A22';
const BIRD = '#80604A';
const BIRD_HEAD = '#8E6D52';
const BIRD_WING = '#533A2B';
const BIRD_TAIL = '#46321F';
const BIRD_BREAST = '#B9A78F';
const BEAK = '#CBA96B';
const EYE = '#0F0B09';

const smooth = (x: number) => {
  const c = Math.max(0, Math.min(1, x));
  return c * c * (3 - 2 * c);
};
const easeIn = (k: number) => k ** 1.7;
const easeOut = (k: number) => 1 - (1 - k) ** 1.7;

interface Notch { f: number; side: number; len: number }
interface Birch { x: number; w: number; top: number; lean: number; bow: number; notches: Notch[] }
interface Leaf { x: number; y: number; v: number; ph: number; sway: number; s: number; dark: boolean }
interface Tuft { x: number; h: number; lean: number; n: number }
interface State {
  tufts: Tuft[];
  far: Birch[];
  near: Birch[];
  leaves: Leaf[];
  period: number;
  ridge: number[];
  scroll: number;
  speed: number;
}

export default defineScene<State>({
  sky: SKY,
  timing: { arriving: 3800, departing: 3400, passing: 2200 },

  layout(w, h, rnd) {
    const wide = w >= 560;
    const period = w + 80;
    const unit = wide ? 1 : 0.62;

    const grow = (near: boolean): Birch[] => {
      const out: Birch[] = [];
      let x = rnd() * 50;
      while (x < period) {
        const right = x > period * 0.5;
        const w0 = near ? (wide ? 6 : 5) + rnd() * (wide ? 5 : 4) : 2.5 + rnd() * 1.6;
        const notches: Notch[] = [];
        const n = (near ? 5 : 2) + Math.floor(rnd() * (near ? 4 : 2));
        for (let i = 0; i < n; i += 1) {
          notches.push({ f: 0.1 + rnd() * 0.86, side: rnd() < 0.5 ? -1 : 1, len: 0.35 + rnd() * 0.5 });
        }
        out.push({ x, w: w0, top: -6, lean: (rnd() - 0.5) * 0.05, bow: (rnd() - 0.5) * 3, notches });
        const gap = near ? (right ? 70 + rnd() * 110 : 140 + rnd() * 170) : 62 + rnd() * 80;
        x += gap * unit;
      }
      return out;
    };

    const tufts: Tuft[] = [];
    for (let x = rnd() * 30; x < period; x += (24 + rnd() * 46) * unit) {
      tufts.push({ x, h: 4 + rnd() * 4, lean: (rnd() - 0.5) * 4, n: 2 + Math.floor(rnd() * 3) });
    }

    const leafCount = wide ? 8 : 5;
    const leaves: Leaf[] = Array.from({ length: leafCount }, () => ({
      x: w * (wide ? 0.62 : 0.76) + rnd() * w * (wide ? 0.34 : 0.2),
      y: h * (0.12 + rnd() * 0.62),
      v: 6 + rnd() * 5,
      ph: rnd() * 6.28,
      sway: 4 + rnd() * 6,
      s: wide ? 3 : 3.5,
      dark: rnd() < 0.4,
    }));

    return { tufts, far: grow(false), near: grow(true), leaves, period, ridge: [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28, rnd() * 6.28, rnd() * 6.28, rnd() * 6.28], scroll: 0, speed: 1 };
  },

  draw(f, s) {
    const { ctx, w: W, h: H, t, dt, moving, wide } = f;
    const { phase, k } = f.visitor;

    const rect = (c: string, px: number, py: number, w: number, h: number, a = 1) => {
      ctx.globalAlpha = a;
      ctx.fillStyle = c;
      ctx.fillRect(Math.round(px), Math.round(py), Math.round(w), Math.round(h));
    };
    const disc = (c: string, x: number, y: number, r: number, a = 1) => {
      ctx.globalAlpha = a;
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    };
    const poly = (c: string, pts: number[], a = 1) => {
      ctx.globalAlpha = a;
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(pts[0]!, pts[1]!);
      for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i]!, pts[i + 1]!);
      ctx.closePath();
      ctx.fill();
    };

    // ── The country slides left while under way, and eases to rest at a halt ──
    if (moving) {
      const target =
        phase === 'stopped' ? 0
        : phase === 'arriving' ? Math.max(0, 1 - k * 1.5)
        : phase === 'departing' ? Math.min(1, Math.max(0, (k - 0.1) * 1.5))
        : 1;
      s.speed += (target - s.speed) * Math.min(1, dt * 2.2);
      s.scroll += s.speed * dt;
    }

    const sillH = 12;
    const sillTop = H - sillH;
    const edgeY = sillTop - 12;

    rect(SKY, 0, 0, W, H);

    // ── A thin moon, low on the right ──
    const mx = W * (wide ? 0.86 : 0.88);
    const my = H * (wide ? 0.3 : 0.27);
    disc(MOON, mx, my, 10, 0.85);
    disc(SKY, mx + 4.5, my - 2.5, 9.2);

    // ── Two ridgelines, the far one barely off the sky ──
    const rise = (x: number) => {
      const a = wide ? W * 0.45 : W * 0.55;
      const b = wide ? W * 0.8 : W * 0.85;
      return 0.3 + 0.7 * smooth((x - a) / (b - a));
    };
    const ridge = (colour: string, low: number, amp: number, drift: number, off: number) => {
      ctx.globalAlpha = 1;
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.moveTo(0, edgeY);
      const sh = s.scroll * drift;
      for (let x = 0; x <= W + 6; x += 6) {
        const u = ((x + sh) / W) * Math.PI * 2;
        const shape = 0.5 + 0.5 * (0.55 * Math.sin(u + s.ridge[off]!) + 0.3 * Math.sin(u * 3 + s.ridge[off + 1]!) + 0.15 * Math.sin(u * 5 + s.ridge[off + 2]!));
        ctx.lineTo(x, H * low - H * amp * rise(x) * shape);
      }
      ctx.lineTo(W + 6, edgeY);
      ctx.closePath();
      ctx.fill();
    };
    ridge(HILL_FAR, 0.79, 0.21, 1.5, 0);
    ridge(HILL_NEAR, 0.85, 0.12, 3, 3);

    // ── Birches: pale, narrow trunks with dark notches, in two depths ──
    const wrap = (x: number) => ((x % s.period) + s.period) % s.period - 40;
    const trunks = (list: Birch[], colour: string, shade: string, drift: number, strength: number, notchH: number) => {
      const bottom = edgeY + 2;
      for (const b of list) {
        const x = wrap(b.x - s.scroll * drift);
        if (x < -20 || x > W + 20) continue;
        // None under the words; a few thin, dim ones at the edge of the wood; paler toward the right.
        const lo = W * (wide ? 0.45 : 0.6);
        const open = smooth((x - lo) / (W * 0.03));
        if (open <= 0) continue;
        const grown = smooth((x - lo - W * 0.04) / (W * (wide ? 0.15 : 0.14)));
        const a = strength * (0.3 + 0.7 * grown) * open;
        const hw = (b.w * (0.55 + 0.45 * grown)) / 2;
        const hgt = bottom - b.top;
        const lean = b.lean * hgt;
        const midY = (bottom + b.top) / 2;
        ctx.globalAlpha = a;
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.moveTo(x - hw, bottom);
        ctx.quadraticCurveTo(x - hw * 0.85 + b.bow + lean / 2, midY, x - hw * 0.7 + lean, b.top);
        ctx.lineTo(x + hw * 0.7 + lean, b.top);
        ctx.quadraticCurveTo(x + hw * 0.85 + b.bow + lean / 2, midY, x + hw, bottom);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = shade;
        ctx.beginPath();
        ctx.moveTo(x + hw * 0.3, bottom);
        ctx.lineTo(x + hw, bottom);
        ctx.quadraticCurveTo(x + hw * 0.85 + b.bow + lean / 2, midY, x + hw * 0.7 + lean, b.top);
        ctx.lineTo(x + hw * 0.1 + lean, b.top);
        ctx.quadraticCurveTo(x + hw * 0.4 + b.bow + lean / 2, midY, x + hw * 0.3, bottom);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = NOTCH;
        ctx.beginPath();
        for (const n of b.notches) {
          const y = bottom - n.f * hgt;
          const cx = x + lean * n.f + 2 * n.f * (1 - n.f) * b.bow;
          const len = b.w * n.len;
          ctx.rect(n.side < 0 ? cx - hw * 0.7 : cx + hw * 0.7 - len, y, len, notchH);
        }
        ctx.fill();
      }
    };
    trunks(s.far, BIRCH_FAR, BIRCH_FAR, 6, 0.7, 1);
    trunks(s.near, BIRCH, BIRCH_SHADE, 18, 0.95, wide ? 2 : 1.6);

    // ── The trackside bank ──
    rect(BANK, 0, edgeY, W, H - edgeY);
    rect(BANK_LINE, 0, edgeY, W, 1);
    // Tufts of grass along the bank, passing a little faster than the birches.
    ctx.globalAlpha = 1;
    ctx.strokeStyle = TUFT;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (const tf of s.tufts) {
      const x = wrap(tf.x - s.scroll * 28);
      if (x < -10 || x > W + 10) continue;
      for (let j = 0; j < tf.n; j += 1) {
        const bx = x + j * 2.4;
        const sway = tf.lean + (j - tf.n / 2) * 1.4;
        ctx.moveTo(bx, edgeY + 1);
        ctx.quadraticCurveTo(bx + sway * 0.3, edgeY - tf.h * 0.6, bx + sway, edgeY - tf.h + (j % 2));
      }
    }
    ctx.stroke();

    // ── The halt: the visitor ──
    const haltLen = Math.round(W * 0.4) + 24;
    const restX = Math.round(W * 0.6);
    const inX = W + 34;
    const outX = -haltLen - 40;
    let hx: number | null = null;
    if (phase === 'arriving') hx = inX + (restX - inX) * easeOut(k);
    else if (phase === 'stopped') hx = restX;
    else if (phase === 'departing') hx = restX + (outX - restX) * easeIn(k);
    else if (phase === 'passing') hx = inX + (outX - inX) * k;

    if (hx !== null && hx < W + 34 && hx + haltLen > -4) {
      const x0 = Math.round(hx);
      const roofTop = Math.round(H * 0.59);
      const under = roofTop + 14;
      const sx0 = x0 + 12;
      const sw = Math.round(haltLen * 0.76);
      const sx1 = sx0 + sw;
      const pw = wide ? 5 : 4;
      const lampX = Math.round(sx0 + sw * 0.28);

      // Platform: a plank face, a lit top edge, a short ramp at the near end.
      rect(DECK, x0, edgeY, haltLen, 8);
      ctx.globalAlpha = 1;
      ctx.fillStyle = WALL_SEAM;
      ctx.beginPath();
      for (let px = x0 + 11; px < x0 + haltLen; px += 12) ctx.rect(px, edgeY + 2, 1, 6);
      ctx.fill();
      rect(DECK_EDGE, x0, edgeY, haltLen, 1);
      rect(DECK_TOP, x0, edgeY + 1, haltLen, 1);
      ctx.globalAlpha = 1;
      ctx.fillStyle = DECK;
      ctx.beginPath();
      ctx.moveTo(x0 - 32, edgeY + 8);
      ctx.quadraticCurveTo(x0 - 12, edgeY + 7, x0, edgeY);
      ctx.lineTo(x0, edgeY + 8);
      ctx.closePath();
      ctx.fill();
      const xe = x0 + haltLen;
      ctx.beginPath();
      ctx.moveTo(xe, edgeY);
      ctx.quadraticCurveTo(xe + 12, edgeY + 7, xe + 32, edgeY + 8);
      ctx.lineTo(xe, edgeY + 8);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = DECK_EDGE;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0 - 32, edgeY + 7.5);
      ctx.quadraticCurveTo(x0 - 12, edgeY + 6.5, x0, edgeY + 0.5);
      ctx.moveTo(xe, edgeY + 0.5);
      ctx.quadraticCurveTo(xe + 12, edgeY + 6.5, xe + 32, edgeY + 7.5);
      ctx.stroke();

      // The shelter's back wall, plank seams, and the pool of lamplight on it.
      rect(WALL, sx0, under, sw, edgeY - under);
      ctx.globalAlpha = 1;
      ctx.fillStyle = WALL_SEAM;
      ctx.beginPath();
      for (let px = sx0 + 13; px < sx1; px += 14) ctx.rect(px, under, 1, edgeY - under);
      ctx.fill();
      const reach = wide ? 38 : 28;
      poly(HONEY, [lampX - 5, under + 6, lampX + 5, under + 6, lampX + reach, edgeY, lampX - reach, edgeY], 0.045);

      // The nameboard, blank, hung by two short chains.
      const bw = wide ? 44 : 30;
      const bx = Math.round(sx0 + sw * 0.7 - bw / 2);
      rect(IRON, bx + 4, under, 1, 3);
      rect(IRON, bx + bw - 5, under, 1, 3);
      rect(IRON, bx - 1, under + 3, bw + 2, wide ? 11 : 9);
      rect(BOARD, bx, under + 4, bw, wide ? 9 : 7);

      // A small round station clock, hung under the canopy: a cream disc, two hands, no numerals.
      const cx = Math.round(sx0 + sw * (wide ? 0.9 : 0.89));
      const cy = under + 11;
      rect(IRON, cx, under, 1, 5);
      disc(IRON, cx + 0.5, cy, 5.2);
      disc(CLOCK_FACE, cx + 0.5, cy, 4.3);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = CLOCK_HAND;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx + 0.5, cy);
      ctx.lineTo(cx + 0.5, cy - 3.3);
      ctx.moveTo(cx + 0.5, cy);
      ctx.lineTo(cx + 2.6, cy + 1.4);
      ctx.stroke();

      // A bench against the wall.
      const bnx = Math.round(sx0 + sw * 0.5);
      const bnw = wide ? 56 : 38;
      rect(BENCH, bnx, edgeY - 10, bnw, 3);
      rect(POST, bnx + 3, edgeY - 7, 2, 7);
      rect(POST, bnx + bnw - 5, edgeY - 7, 2, 7);

      // Posts, with a brace under the fascia, and the roof: a low arch over a timber fascia.
      for (const px of [sx0 + 2, sx1 - pw - 2]) {
        rect(POST, px, under, pw, edgeY - under);
        rect(POST_HI, px, under, 1, edgeY - under);
        const dir = px < sx0 + sw / 2 ? 1 : -1;
        poly(POST, [px + (dir > 0 ? pw : 0), under, px + (dir > 0 ? pw + 8 : -8), under, px + (dir > 0 ? pw : 0), under + 8]);
      }
      const rx0 = sx0 - 10;
      const rx1 = sx1 + 10;
      ctx.globalAlpha = 1;
      ctx.fillStyle = ROOF;
      ctx.beginPath();
      ctx.moveTo(rx0, roofTop + 9);
      ctx.quadraticCurveTo((rx0 + rx1) / 2, roofTop - 6, rx1, roofTop + 9);
      ctx.lineTo(rx1, roofTop + 14);
      ctx.lineTo(rx0, roofTop + 14);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = ROOF_EDGE;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(rx0, roofTop + 9);
      ctx.quadraticCurveTo((rx0 + rx1) / 2, roofTop - 6, rx1, roofTop + 9);
      ctx.stroke();
      rect(FASCIA, rx0, roofTop + 10, rx1 - rx0, 4);

      // The lamp: a chain, a small domed shade (the accent), a bulb, and its faint cone.
      const shadeY = under + 6;
      const sr = wide ? 7 : 5.5;
      poly(HONEY, [lampX - 4, shadeY + 6, lampX + 4, shadeY + 6, lampX + reach * 1.15, edgeY, lampX - reach * 1.15, edgeY], 0.06);
      rect(IRON, lampX, under, 1, 5);
      ctx.globalAlpha = 1;
      ctx.fillStyle = HONEY;
      ctx.beginPath();
      ctx.moveTo(lampX - sr, shadeY + 4);
      ctx.quadraticCurveTo(lampX - sr, shadeY - 1, lampX + 0.5, shadeY - 1.5);
      ctx.quadraticCurveTo(lampX + sr + 1, shadeY - 1, lampX + sr + 1, shadeY + 4);
      ctx.closePath();
      ctx.fill();
      rect(BULB, lampX - 2, shadeY + 4, 4, 2);
      rect(HONEY, lampX - reach * 0.5, edgeY + 2, reach, 2, 0.14);
    }

    // ── Leaves, coming down slowly on the right ──
    for (const l of s.leaves) {
      if (moving) {
        l.y += l.v * dt;
        l.ph += dt * 0.9;
        if (l.y > edgeY - 4) {
          l.y = -4;
          l.x = W * (wide ? 0.62 : 0.76) + f.rnd() * W * (wide ? 0.34 : 0.2);
        }
      }
      ctx.save();
      ctx.translate(l.x + Math.sin(l.ph) * l.sway, l.y);
      ctx.rotate(Math.sin(l.ph * 0.8) * 0.9);
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = l.dark ? LEAF_DARK : LEAF;
      ctx.beginPath();
      ctx.moveTo(-l.s, 0);
      ctx.quadraticCurveTo(0, -l.s * 0.75, l.s, 0);
      ctx.quadraticCurveTo(0, l.s * 0.75, -l.s, 0);
      ctx.fill();
      ctx.restore();
    }

    // ── Inside: the timber sill ──
    rect(SILL, 0, sillTop, W, sillH);
    rect(SILL_LIP, 0, sillTop, W, 1);
    rect(SILL_SEAM, W * 0.28, sillTop + 1, 1, sillH - 7);
    rect(SILL_SEAM, W * 0.52, sillTop + 1, 1, sillH - 7);

    const box = (c: string, x: number, y: number, w: number, h: number, a = 1) => {
      ctx.globalAlpha = a;
      ctx.fillStyle = c;
      ctx.fillRect(x, y, w, h);
    };
    const g = wide ? 1.3 : 1.2;

    // The signal: a cabin lantern at the right end. Green, or amber with stragglers.
    const lx = W - (wide ? 26 : 21);
    const glass = f.caution ? AMBER : GREEN;
    rect(glass, lx - 13, sillTop, 26, 2, 0.28);
    ctx.save();
    ctx.translate(lx, sillTop);
    ctx.scale(g, g);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = IRON_HI;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, -15, 3.2, Math.PI, 0);
    ctx.stroke();
    box(IRON_HI, -5, -14, 10, 3);
    ctx.fillStyle = glass;
    ctx.beginPath();
    ctx.roundRect(-4.5, -11.5, 9, 9, 2);
    ctx.fill();
    box(BULB, -1, -9, 2, 4, 0.75);
    ctx.strokeStyle = IRON_HI;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-1.6, -11);
    ctx.lineTo(-1.6, -3);
    ctx.moveTo(1.6, -11);
    ctx.lineTo(1.6, -3);
    ctx.stroke();
    box(IRON_HI, -6, -3, 12, 3);
    ctx.restore();

    // Done today: one acorn per quest on the sill, running left from the lantern.
    const step = wide ? 15 : 12;
    const first = lx - (wide ? 25 : 21);
    const nr = wide ? 4.8 : 4.2;
    for (let i = 0; i < Math.min(12, f.done); i += 1) {
      const ax = first - i * step;
      const ay = sillTop - nr * 1.3;
      ctx.globalAlpha = 1;
      ctx.fillStyle = NUT;
      ctx.beginPath();
      ctx.ellipse(ax, ay, nr, nr * 1.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = NUT_CAP;
      ctx.beginPath();
      ctx.ellipse(ax, ay - nr * 0.7, nr + 0.9, nr * 0.95, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      rect(NUT_CAP, ax - 0.5, ay - nr * 1.95, 1.6, 2);
      rect(NUT_HI, ax - nr * 0.5, ay + nr * 0.1, 1.4, nr * 0.9, 0.8);
    }

    // The companion: a sparrow left of the acorns.
    const bx0 = first - 11 * step - (wide ? 26 : 22);
    let settle = 0;
    if (phase === 'stopped') settle = 1;
    else if (phase === 'arriving') settle = smooth((k - 0.55) / 0.4);
    else if (phase === 'departing') settle = 1 - smooth(k / 0.15);
    const hop = phase === 'departing' && k > 0.3 && k < 0.6 ? Math.sin(((k - 0.3) / 0.3) * Math.PI) * 4 : 0;
    // Idle, it looks the other way for a moment now and then.
    const hf = moving && settle < 0.5 && (t / 1000 + 3) % 9 > 6.2 ? -1 : 1;
    const legH = 3 * (1 - settle);
    const rxB = 6 + settle * 0.9;
    const ryB = 4.2 + settle * 0.8;
    const cyB = -legH - ryB + settle * 0.2;
    ctx.save();
    ctx.translate(bx0, sillTop - hop * g);
    ctx.scale(g, g);
    if (legH > 0.5) {
      box(IRON_HI, -1.7, -legH, 1, legH + 0.5);
      box(IRON_HI, 1.2, -legH, 1, legH + 0.5);
    }
    poly(BIRD_TAIL, [-rxB + 2, cyB - 1.5, -rxB - 4.5, cyB + 0.8, -rxB - 4, cyB + 2.6, -rxB + 2.5, cyB + 2.8]);
    ctx.globalAlpha = 1;
    ctx.fillStyle = BIRD;
    ctx.beginPath();
    ctx.ellipse(0, cyB, rxB, ryB, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = BIRD_BREAST;
    ctx.beginPath();
    ctx.ellipse(2.4, cyB + 1.4, rxB * 0.58, ryB * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = BIRD_WING;
    ctx.beginPath();
    ctx.ellipse(-1.4, cyB - 0.4, rxB * 0.62, ryB * 0.6, -0.2, 0, Math.PI * 2);
    ctx.fill();
    const hX = hf * (4.6 - settle);
    const hY = cyB - 3.2 + settle * 1.6;
    disc(BIRD_HEAD, hX, hY, 3.5);
    ctx.globalAlpha = 1;
    ctx.fillStyle = BEAK;
    ctx.beginPath();
    ctx.moveTo(hX + hf * 3, hY - 0.8);
    ctx.lineTo(hX + hf * 5.8, hY + 0.7);
    ctx.lineTo(hX + hf * 3, hY + 1.6);
    ctx.closePath();
    ctx.fill();
    disc(EYE, hX + hf * 1.3, hY - 0.8, 0.85);
    ctx.restore();
    ctx.globalAlpha = 1;
  },
});
