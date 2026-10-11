/**
 * The Spire Guild: the deck of the guild's airship, moored over a cathedral
 * city in green mist. From the reference still: a sky that glows emerald at its
 * heart, a great tower pricked with hundreds of amber windows and tall lancets
 * burning orange, lesser towers fading into the mist, the guild's banners
 * hanging from iron poles, iron-bound chests and a heavy rope on the deck.
 *
 * The words sit on the dark side: on a wide window the left of the deck, under
 * a great hanging banner; on a phone the dark top of the sky.
 *
 * The visitor is another guild airship. Arriving, it comes in from the right
 * and settles beside the tower; while it waits it rides at its mooring with its
 * bow lamp lit (the one use of the accent); departing, it backs away and
 * climbs; passing, a small one crosses far off and is lost in the mist. Away:
 * only the mist drifting and windows flickering.
 *
 * On the deck: a lantern on a post (green flame; amber when there are
 * stragglers), one lit candle on the chest for each quest finished today (up
 * to 12), and the raven on the rail post. The raven looks about when idle,
 * lifts its head with an amber eye while a ship waits, and throws its wings up
 * as the ship leaves. Painted smooth: light is soft, never dotted.
 */

import { defineScene } from '../types';
import { sigil } from './texture';

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const AMBER = '#F58A3C', GREEN = '#6FE0A8', GOLD = '#F5B63C';

const easeOut = (k: number) => 1 - (1 - k) ** 2.2;
const easeIn = (k: number) => k ** 2;

/** Where things stand, for a canvas of this size. */
const plan = (w: number, h: number) => {
  const wide = w >= 560;
  const deck = h * 0.83;
  return {
    wide,
    deck,
    s: h / 288,
    tower: wide ? w * 0.66 : w * 0.52,
    dock: wide ? { x: w * 0.8, y: h * 0.4 } : { x: w * 0.74, y: h * 0.63 },
    lamp: wide ? w * 0.955 : w * 0.93,
    chest: wide ? { x: w * 0.7, w: 150 } : { x: w * 0.4, w: 112 },
    raven: wide ? w * 0.6 : w * 0.24,
  };
};

const glowAt = (c: Ctx, x: number, y: number, r: number, rgb: string, a: number) => {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
};

/** A lesser tower, half lost in mist. */
const farTower = (c: Ctx, x: number, base: number, wd: number, ht: number, col: string, lit: number, rnd: () => number) => {
  c.fillStyle = col;
  c.fillRect(x - wd / 2, base - ht * 0.7, wd, ht * 0.7);
  c.fillRect(x - wd * 0.32, base - ht * 0.86, wd * 0.64, ht * 0.2);
  c.beginPath();
  c.moveTo(x - wd * 0.32, base - ht * 0.86);
  c.lineTo(x, base - ht * 1.12);
  c.lineTo(x + wd * 0.32, base - ht * 0.86);
  c.closePath();
  c.fill();
  for (let wy = base - ht * 0.82; wy < base - 4; wy += 7) {
    for (let wx = x - wd / 2 + 3; wx < x + wd / 2 - 3; wx += 5.5) {
      if (rnd() < 0.6) continue;
      c.fillStyle = `rgba(255,${160 + Math.floor(rnd() * 50)},80,${lit})`;
      c.fillRect(wx, wy, 1.6, 2.8);
    }
  }
};

/** A pointed window, burning. */
const lancet = (c: Ctx, x: number, y: number, wd: number, ht: number) => {
  glowAt(c, x, y + ht / 2, ht * 1.1, '255,140,50', 0.35);
  const g = c.createLinearGradient(0, y, 0, y + ht);
  g.addColorStop(0, '#FFE2A0');
  g.addColorStop(0.5, '#FF9E3A');
  g.addColorStop(1, '#D4601C');
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(x - wd / 2, y + ht);
  c.lineTo(x - wd / 2, y + wd * 0.7);
  c.quadraticCurveTo(x - wd / 2, y + wd * 0.1, x, y);
  c.quadraticCurveTo(x + wd / 2, y + wd * 0.1, x + wd / 2, y + wd * 0.7);
  c.lineTo(x + wd / 2, y + ht);
  c.closePath();
  c.fill();
};

/** The guild's airship, bow to the left, centred on (x, y). */
const ship = (c: Ctx, x: number, y: number, s: number, t: number, lamp: boolean) => {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  // Envelope.
  c.fillStyle = '#04100D';
  c.beginPath();
  c.moveTo(-46, 0);
  c.bezierCurveTo(-40, -15, 30, -15, 44, -3);
  c.lineTo(52, -10);
  c.lineTo(52, 10);
  c.lineTo(44, 3);
  c.bezierCurveTo(30, 13, -40, 13, -46, 0);
  c.closePath();
  c.fill();
  c.strokeStyle = 'rgba(150,240,205,0.55)';
  c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo(-44, -2);
  c.bezierCurveTo(-36, -14, 28, -14, 43, -4);
  c.stroke();
  // Ribs.
  c.strokeStyle = 'rgba(150,240,205,0.14)';
  for (const rx of [-26, -8, 10, 28]) {
    c.beginPath();
    c.ellipse(rx, 0, 3, 11.5 - Math.abs(rx) * 0.07, 0, -Math.PI / 2, Math.PI / 2);
    c.stroke();
  }
  // Gondola and its struts.
  c.strokeStyle = '#04100D';
  c.lineWidth = 1;
  for (const sx of [-18, 0, 18]) {
    c.beginPath();
    c.moveTo(sx, 10);
    c.lineTo(sx * 0.9, 17);
    c.stroke();
  }
  c.fillStyle = '#030A08';
  c.beginPath();
  c.moveTo(-24, 16);
  c.lineTo(22, 16);
  c.lineTo(18, 24);
  c.lineTo(-18, 24);
  c.closePath();
  c.fill();
  for (let i = 0; i < 5; i += 1) {
    const px = -14 + i * 7;
    glowAt(c, px, 19.6, 4.5, '255,160,70', 0.5);
    c.fillStyle = '#FFC878';
    c.beginPath();
    c.arc(px, 19.6, 1.3, 0, TAU);
    c.fill();
  }
  // Propeller at the stern, a blur.
  c.fillStyle = 'rgba(150,240,205,0.22)';
  c.beginPath();
  c.ellipse(54, 0, 1.4, 9 + Math.sin(t / 60) * 2, 0, 0, TAU);
  c.fill();
  if (lamp) {
    glowAt(c, -47, 5, 16, '245,182,60', 0.55);
    c.fillStyle = GOLD;
    c.beginPath();
    c.arc(-47, 5, 2.4, 0, TAU);
    c.fill();
  }
  c.restore();
};

/** A hanging banner: cloth from (x0..x1) at y down to `foot`, pointed, with the sigil faint on it. */
const banner = (c: Ctx, x0: number, x1: number, y: number, foot: number, rim: boolean) => {
  const mid = (x0 + x1) / 2;
  c.beginPath();
  c.moveTo(x0, y);
  c.lineTo(x1, y);
  c.lineTo(x1 - (x1 - x0) * 0.04, foot - (x1 - x0) * 0.28);
  c.lineTo(mid, foot);
  c.lineTo(x0 + (x1 - x0) * 0.04, foot - (x1 - x0) * 0.28);
  c.closePath();
  const g = c.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, '#0A1A15');
  g.addColorStop(0.35, '#0D221C');
  g.addColorStop(0.6, '#081612');
  g.addColorStop(1, '#0B1D18');
  c.fillStyle = g;
  c.fill();
  if (rim) {
    c.strokeStyle = 'rgba(140,235,200,0.28)';
    c.lineWidth = 1;
    c.stroke();
  }
  c.fillStyle = '#10291F';
  sigil(c, mid, y + (foot - y) * 0.42, (x1 - x0) * 0.2);
};

interface Flick { x: number; y: number; ph: number; sp: number }
interface State { flick: Flick[]; fog: { x: number; y: number; v: number; r: number }[] }

export default defineScene<State>({
  sky: '#0A2A24',
  timing: { arriving: 3200, departing: 3000, passing: 5200 },

  back({ ctx: c, w, h, rnd }) {
    const g = plan(w, h);
    const sky = c.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#03100D');
    sky.addColorStop(0.42, '#0E4A3E');
    sky.addColorStop(0.72, '#1C7462');
    sky.addColorStop(1, '#0C3029');
    c.fillStyle = sky;
    c.fillRect(0, 0, w, h);
    glowAt(c, g.tower, h * 0.5, h * 1.15, '150,255,215', 0.3);
    // Shafts of light.
    for (let i = 0; i < 4; i += 1) {
      const x = g.tower + (rnd() - 0.4) * w * 0.5, wd = 30 + rnd() * 70;
      const ray = c.createLinearGradient(x, 0, x - h * 0.3, h);
      ray.addColorStop(0, 'rgba(190,255,230,0.10)');
      ray.addColorStop(1, 'rgba(190,255,230,0)');
      c.fillStyle = ray;
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x + wd, 0);
      c.lineTo(x + wd * 1.5 - h * 0.35, h);
      c.lineTo(x - h * 0.35, h);
      c.closePath();
      c.fill();
    }
    // Lesser towers, far then nearer.
    for (const [col, lit, lo, hi, step] of [['#1A5E50', 0.5, 0.5, 0.8, 70], ['#0F3F35', 0.75, 0.35, 0.62, 86]] as const) {
      for (let x = rnd() * 40; x < w + 30; x += step * (0.6 + rnd() * 0.9)) {
        if (Math.abs(x - g.tower) < 46 * g.s) continue;
        farTower(c, x, g.deck + 6, (20 + rnd() * 26) * g.s, h * (lo + rnd() * (hi - lo)), col, lit, rnd);
      }
    }
    // The great tower: five tiers, pinnacles, a forest of windows.
    const tiers = [[104, 62], [82, 54], [60, 50], [40, 44], [24, 34]] as const;
    let y = g.deck + 8;
    c.fillStyle = '#0A2F27';
    const bodies: [number, number, number, number][] = [];
    for (const [tw, th] of tiers) {
      const bw = tw * g.s, bh = th * g.s;
      c.fillStyle = '#0A2F27';
      c.fillRect(g.tower - bw / 2, y - bh, bw, bh + 1);
      bodies.push([g.tower - bw / 2, y - bh, bw, bh]);
      for (const m of [-1, 1]) {
        c.beginPath();
        c.moveTo(g.tower + m * bw / 2, y - bh);
        c.lineTo(g.tower + m * (bw / 2 - 3 * g.s), y - bh - 15 * g.s);
        c.lineTo(g.tower + m * (bw / 2 - 7 * g.s), y - bh);
        c.closePath();
        c.fill();
      }
      y -= bh;
    }
    c.beginPath();
    c.moveTo(g.tower - 12 * g.s, y);
    c.lineTo(g.tower, y - 40 * g.s);
    c.lineTo(g.tower + 12 * g.s, y);
    c.closePath();
    c.fill();
    for (const [bx, by, bw, bh] of bodies) {
      for (let wy = by + 5; wy < by + bh - 12 * g.s; wy += 6.5) {
        for (let wx = bx + 3.5; wx < bx + bw - 3; wx += 5) {
          if (rnd() < 0.42) continue;
          c.fillStyle = `rgba(255,${165 + Math.floor(rnd() * 60)},${70 + Math.floor(rnd() * 40)},${0.7 + rnd() * 0.3})`;
          c.fillRect(wx, wy, 1.7, 3);
        }
      }
    }
    // Lancets on the three lower tiers.
    bodies.slice(0, 3).forEach(([bx, by, bw, bh], i) => {
      const n = 3 - i;
      for (let k = 0; k < n; k += 1) lancet(c, bx + (bw * (k + 0.5)) / n, by + bh - 17 * g.s, 5.5 * g.s, 15 * g.s);
    });
    // Mist over the city's feet.
    const mist = c.createLinearGradient(0, h * 0.45, 0, g.deck + 10);
    mist.addColorStop(0, 'rgba(150,240,205,0)');
    mist.addColorStop(1, 'rgba(150,240,205,0.34)');
    c.fillStyle = mist;
    c.fillRect(0, h * 0.45, w, g.deck + 10 - h * 0.45);
  },

  layout(w, h, rnd) {
    const g = plan(w, h);
    return {
      flick: Array.from({ length: 26 }, () => ({ x: g.tower + (rnd() - 0.5) * 84 * g.s, y: g.deck - rnd() * 200 * g.s, ph: rnd() * TAU, sp: 0.6 + rnd() * 1.6 })),
      fog: Array.from({ length: 5 }, () => ({ x: rnd() * w, y: h * (0.45 + rnd() * 0.35), v: 3 + rnd() * 5, r: 26 + rnd() * 30 })),
    };
  },

  draw(f, s) {
    const { ctx: c, w, h, t, dt, moving, visitor } = f;
    const g = plan(w, h);

    // Windows coming on and going out.
    for (const k of s.flick) {
      const a = 0.5 + 0.5 * Math.sin((t / 1000) * k.sp + k.ph);
      if (a < 0.55) continue;
      c.fillStyle = `rgba(255,220,150,${(a - 0.55) * 1.8})`;
      c.fillRect(k.x, k.y, 1.7, 3);
    }

    // The visitor.
    const { phase, k } = visitor;
    if (phase === 'passing') {
      const px = w + 40 - k * (w * 0.6 + 80);
      c.globalAlpha = Math.min(1, (1 - k) * 2.2) * 0.8;
      ship(c, px, g.wide ? h * 0.2 : h * 0.57, 0.36 * g.s, t, false);
      c.globalAlpha = 1;
    } else if (phase !== 'away') {
      let x = g.dock.x, y = g.dock.y, sc = (g.wide ? 0.95 : 0.66) * g.s;
      if (phase === 'arriving') {
        const e = easeOut(k);
        x += (1 - e) * w * 0.45;
        y -= (1 - e) * 34;
        sc *= 0.8 + 0.2 * e;
      } else if (phase === 'departing') {
        const e = easeIn(k);
        x += e * w * 0.45;
        y -= e * 46;
      } else if (moving) {
        y += Math.sin(t / 900) * 1.6;
      }
      ship(c, x, y, sc, t, phase === 'stopped');
    }

    // Mist drifting across.
    for (const m of s.fog) {
      if (moving) {
        m.x += m.v * dt;
        if (m.x - m.r * 4 > w) m.x = -m.r * 4;
      }
      c.save();
      c.translate(m.x, m.y);
      c.scale(4, 1);
      glowAt(c, 0, 0, m.r, '170,245,215', 0.13);
      c.restore();
    }
  },

  front({ ctx: c, w, h }) {
    const g = plan(w, h);
    // The dark side, for the words.
    const shade = g.wide ? c.createLinearGradient(0, 0, w * 0.58, 0) : c.createLinearGradient(0, 0, 0, h * 0.62);
    shade.addColorStop(0, 'rgba(3,10,8,0.96)');
    shade.addColorStop(0.68, 'rgba(3,10,8,0.84)');
    shade.addColorStop(1, 'rgba(3,10,8,0)');
    c.fillStyle = shade;
    c.fillRect(0, 0, w, h);

    const pole = (x0: number, x1: number, y: number, tip: -1 | 1) => {
      c.fillStyle = '#020706';
      c.fillRect(x0, y - 2, x1 - x0, 4);
      c.fillStyle = 'rgba(140,235,200,0.35)';
      c.fillRect(x0, y - 2, x1 - x0, 1);
      const tx = tip < 0 ? x0 : x1;
      c.fillStyle = '#020706';
      c.beginPath();
      c.moveTo(tx, y - 6);
      c.lineTo(tx + tip * 16, y);
      c.lineTo(tx, y + 6);
      c.closePath();
      c.fill();
    };
    if (g.wide) {
      pole(-10, w * 0.33, 13, 1);
      banner(c, w * 0.03, w * 0.29, 15, h * 0.97, false);
    }
    const bx0 = g.wide ? w * 0.9 : w * 0.72, bx1 = g.wide ? w * 0.978 : w * 0.95;
    pole(bx0 - 22, w + 10, h * 0.07, -1);
    banner(c, bx0, bx1, h * 0.07 + 2, g.wide ? h * 0.5 : h * 0.4, true);

    // The deck.
    const deck = c.createLinearGradient(0, g.deck, 0, h);
    deck.addColorStop(0, '#081713');
    deck.addColorStop(1, '#020605');
    c.fillStyle = deck;
    c.fillRect(0, g.deck, w, h - g.deck);
    c.fillStyle = 'rgba(150,240,205,0.4)';
    c.fillRect(0, g.deck, w, 1);

    // A chest, iron-bound, with its diamond inlay.
    const cx = g.chest.x, cw = g.chest.w, ct = g.deck - 24 * g.s, chh = h - ct;
    c.fillStyle = '#071511';
    c.fillRect(cx, ct, cw, chh);
    c.fillStyle = 'rgba(150,240,205,0.45)';
    c.fillRect(cx, ct, cw, 1);
    c.strokeStyle = '#1D4238';
    c.lineWidth = 1;
    c.strokeRect(cx + 5.5, ct + 5.5, cw - 11, chh);
    c.beginPath();
    for (let dx = 22; dx < cw - 10; dx += 30) {
      const mx = cx + dx, my = ct + chh * 0.5 + 2;
      c.moveTo(mx, my - 9);
      c.lineTo(mx + 9, my);
      c.lineTo(mx, my + 9);
      c.lineTo(mx - 9, my);
      c.closePath();
    }
    c.stroke();

    // The rope, from a rail post to the chest, and the lantern's post.
    const rx0 = g.raven, ry0 = g.deck - 30 * g.s;
    c.fillStyle = '#030907';
    c.fillRect(rx0 - 3, ry0, 6, g.deck - ry0);
    c.fillStyle = '#B8893A';
    c.fillRect(rx0 - 4, ry0 - 2, 8, 3);
    const rope = (px0: number, py0: number, px1: number, py1: number, sag: number) => {
      const steps = Math.ceil(Math.hypot(px1 - px0, py1 - py0) / 4.5);
      for (let i = 0; i <= steps; i += 1) {
        const u = i / steps;
        const x = px0 + (px1 - px0) * u, y = py0 + (py1 - py0) * u + sag * 4 * u * (1 - u);
        const slope = Math.atan2(py1 - py0 + sag * 4 * (1 - 2 * u), px1 - px0);
        c.save();
        c.translate(x, y);
        c.rotate(slope - 0.75);
        c.fillStyle = i % 2 ? '#6E5830' : '#8E7444';
        c.beginPath();
        c.ellipse(0, 0, 4.4, 2.1, 0, 0, TAU);
        c.fill();
        c.restore();
      }
    };
    rope(rx0, ry0 + 5, cx + 4, ct + 3, 9 * g.s);
    if (g.wide) rope(w * 0.42, g.deck + 2, rx0, ry0 + 5, 7);

    c.fillStyle = '#030907';
    c.fillRect(g.lamp - 1.5, g.deck - 38 * g.s, 3, 38 * g.s);
    c.fillRect(g.lamp - 6, g.deck - 54 * g.s, 12, 2);
    c.fillRect(g.lamp - 6, g.deck - 39 * g.s, 12, 2);
    c.fillRect(g.lamp - 6, g.deck - 54 * g.s, 1.5, 16 * g.s);
    c.fillRect(g.lamp + 4.5, g.deck - 54 * g.s, 1.5, 16 * g.s);
  },

  over(f) {
    const { ctx: c, w, h, t, moving, caution, done, visitor } = f;
    const g = plan(w, h);
    const beat = moving ? Math.sin(t / 130) * 0.5 + Math.sin(t / 47) * 0.5 : 0;

    // The lantern: green, or amber when there are stragglers.
    const ly = g.deck - 46 * g.s;
    glowAt(c, g.lamp, ly, 26 + beat * 2, caution ? '245,138,60' : '111,224,168', 0.45);
    c.fillStyle = caution ? AMBER : GREEN;
    c.beginPath();
    c.ellipse(g.lamp, ly + 1, 2.6, 4.6 + beat * 0.5, 0, 0, TAU);
    c.fill();
    c.fillStyle = '#F4FFF8';
    c.beginPath();
    c.ellipse(g.lamp, ly + 2.4, 1.1, 2, 0, 0, TAU);
    c.fill();

    // One candle for each quest finished today.
    const n = Math.min(12, Math.max(0, Math.floor(done)));
    const ct = g.deck - 24 * g.s, gap = Math.min(11.5, (g.chest.w - 22) / 11);
    for (let i = 0; i < n; i += 1) {
      const x = g.chest.x + 12 + i * gap, tall = 6 + ((i * 7) % 5);
      const fl = moving ? Math.sin(t / 110 + i * 1.9) : 0;
      c.fillStyle = '#E9DFC6';
      c.fillRect(x - 1.5, ct - tall, 3, tall);
      c.fillStyle = '#B9AD8E';
      c.fillRect(x + 0.5, ct - tall, 1, tall);
      glowAt(c, x, ct - tall - 4, 9, '255,170,70', 0.5);
      c.fillStyle = '#FFC66A';
      c.beginPath();
      c.ellipse(x + fl * 0.4, ct - tall - 3.4, 1.5, 3.2 + fl * 0.4, 0, 0, TAU);
      c.fill();
      c.fillStyle = '#FFF6DC';
      c.beginPath();
      c.ellipse(x + fl * 0.3, ct - tall - 2.4, 0.7, 1.5, 0, 0, TAU);
      c.fill();
    }

    // The raven on the rail post.
    const waiting = visitor.phase === 'stopped';
    const leaving = visitor.phase === 'departing' && visitor.k < 0.5;
    const hop = leaving ? Math.sin((visitor.k / 0.5) * Math.PI) * 5 : 0;
    const rx = g.raven, ry = g.deck - 30 * g.s - 9 - hop;
    const face = waiting || !moving ? 1 : Math.sin(t / 1700) > 0.2 ? 1 : -1;
    c.fillStyle = '#010403';
    c.beginPath();
    c.ellipse(rx, ry, 8.5, 5.6, -0.25 * face, 0, TAU);
    c.fill();
    c.beginPath();
    c.moveTo(rx - face * 6, ry + 1);
    c.lineTo(rx - face * 16, ry + 6);
    c.lineTo(rx - face * 5, ry + 4.5);
    c.closePath();
    c.fill();
    const hx = rx + face * 7, hy = ry - (waiting ? 7 : 5);
    c.beginPath();
    c.arc(hx, hy, 3.7, 0, TAU);
    c.fill();
    c.beginPath();
    c.moveTo(hx + face * 3, hy - 1.2);
    c.lineTo(hx + face * 8.5, hy + 0.8);
    c.lineTo(hx + face * 3, hy + 1.8);
    c.closePath();
    c.fill();
    if (leaving) {
      for (const m of [-1, 1]) {
        c.beginPath();
        c.moveTo(rx + m * 2, ry - 3);
        c.lineTo(rx + m * 15, ry - 15 - hop * 0.6);
        c.lineTo(rx + m * 9, ry - 1);
        c.closePath();
        c.fill();
      }
    }
    c.strokeStyle = 'rgba(150,240,205,0.5)';
    c.lineWidth = 1;
    c.beginPath();
    c.ellipse(rx, ry, 8.5, 5.6, -0.25 * face, Math.PI * 1.05, Math.PI * 1.85);
    c.stroke();
    if (waiting) {
      glowAt(c, hx + face * 1.2, hy - 0.6, 4, '245,138,60', 0.8);
      c.fillStyle = '#FFC878';
      c.beginPath();
      c.arc(hx + face * 1.2, hy - 0.6, 0.9, 0, TAU);
      c.fill();
    }
  },
});
