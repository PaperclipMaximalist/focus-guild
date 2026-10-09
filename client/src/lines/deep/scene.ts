/**
 * The Abyssal Line: behind the viewport of a submersible, creeping along a reef
 * wall at depth. Green-black water in a few flat bands, marine snow sinking
 * slowly, rounded reef mounds along the bottom, a few kelp stalks leaning.
 *
 * The visitor is a whale. Boarding, it glides in from the right and holds
 * station in the lower middle, rising and falling a little and sweeping its
 * tail; when a quest is finished it tips down and dives off the lower left. With
 * nothing boarding, a far smaller one crosses the right half now and then.
 * The signal is a marker lamp on a pole at the right end of the reef: green,
 * or amber with stragglers. One pale pip lights on the reef's ridge for each
 * quest done today. The companion is a drift jelly: it pulses and drifts when
 * the water is empty, holds still while the whale is alongside, and rises a
 * few pixels as the whale leaves. The one chartreuse thing is the lure on an
 * arm at the bottom-right corner: your own hull.
 *
 * Flat colours only: no gradients, no blur, no glow.
 */

import { defineScene } from '../types';

const WATER = '#071A1C';
const BAND_1 = '#0A2226';
const BAND_2 = '#0D2B2F';
const BAND_3 = '#113538';
const REEF_FAR = '#0E2D2F';
const REEF_NEAR = '#091D20';
const KELP = '#144238';
const WHALE = '#265E68';
const WHALE_BACK = '#1E505A';
const WHALE_BELLY = '#3C8088';
const WHALE_GROOVE = '#2F6C74';
const WHALE_FIN = '#1B4851';
const WHALE_EYE = '#D2F1EC';
const WHALE_FAR = '#1C4953';
const SNOW = '#A8DDD6';
const PIP = '#9FE8DC';
const POLE = '#1D4B53';
const HOUSING = '#050F12';
const JELLY = '#86D2C8';
const GREEN = '#5EE6A8';
const AMBER = '#FFA24D';
const LURE = '#C8F560';

const TAU = Math.PI * 2;
const easeOut = (k: number) => 1 - (1 - k) ** 3;
const easeIn = (k: number) => k ** 3;
const clamp01 = (k: number) => Math.min(1, Math.max(0, k));

interface Fleck { x: number; y: number; v: number; dx: number; a: number }
interface Mound { cx: number; cy: number; rx: number; ry: number; far: boolean }
interface Stalk { x: number; h: number; phase: number }
interface State { snow: Fleck[]; mounds: Mound[]; stalks: Stalk[]; ridge: number[] }

export default defineScene<State>({
  sky: WATER,
  timing: { arriving: 6500, departing: 4500, passing: 6000 },

  layout(w, h, rnd) {
    const wide = w >= 560;
    const snow: Fleck[] = Array.from({ length: Math.round((w * h) / 1900) }, () => ({
      x: rnd() * w,
      y: rnd() * h,
      v: 3 + rnd() * 6,
      dx: -(2 + rnd() * 3),
      a: 0.16 + rnd() * 0.34,
    }));

    // Rounded mounds along the bottom, low on the left and rising to the right.
    const mounds: Mound[] = [];
    for (const far of [true, false]) {
      for (let x = -20; x < w + 40; ) {
        const rx = (wide ? 38 : 26) + rnd() * (wide ? 52 : 34);
        const cx = x + rx * 0.7;
        const fx = Math.min(1, Math.max(0, cx / w));
        const top = h * ((far ? 0.86 : 0.93) - 0.17 * fx ** 1.6) + (rnd() - 0.5) * h * 0.03;
        const ry = h * (0.07 + rnd() * 0.03);
        mounds.push({ cx, cy: top + ry, rx, ry, far });
        x += rx * 1.15;
      }
    }
    // The ridge: how high the reef stands at each column. Pips and the lamp sit on it.
    const ridge = Array.from({ length: Math.ceil(w) + 1 }, () => h);
    for (const m of mounds) {
      for (let x = Math.max(0, Math.floor(m.cx - m.rx)); x <= Math.min(ridge.length - 1, Math.ceil(m.cx + m.rx)); x += 1) {
        const y = m.cy - m.ry * Math.sqrt(Math.max(0, 1 - ((x - m.cx) / m.rx) ** 2));
        if (y < ridge[x]!) ridge[x] = y;
      }
    }

    const stalks: Stalk[] = [0.775, 0.805, 0.86, 0.9, 0.975].map((fx, i) => ({
      x: w * fx,
      h: h * (0.1 + ((i * 37) % 5) * 0.03 + rnd() * 0.03),
      phase: rnd() * TAU,
    }));
    return { snow, mounds, stalks, ridge };
  },

  draw(f, s) {
    const { ctx, w: W, h: H, t, dt, moving, wide } = f;
    const { phase, k } = f.visitor;

    const rect = (c: string, x: number, y: number, w: number, h: number, a = 1) => {
      ctx.globalAlpha = a;
      ctx.fillStyle = c;
      ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    };
    const ellipse = (c: string, x: number, y: number, rx: number, ry: number) => {
      ctx.globalAlpha = 1;
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
      ctx.fill();
    };
    const ridgeAt = (x: number) => s.ridge[Math.max(0, Math.min(s.ridge.length - 1, Math.round(x)))] ?? H;

    /**
     * A baleen whale facing left, in side view, drawn about its own middle. The
     * outline is a few long curves: a big blunt head, deepest just behind it,
     * running out to a narrow tail stock that ends in a thin flat fluke. `near`
     * is the one that stays alongside: a paler belly, throat grooves, a flipper
     * and an eye. A far one is the same shape in one flat colour.
     */
    const whale = (cx: number, cy: number, L: number, T: number, rot: number, sweep: number, near: boolean, alpha = 1) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.globalAlpha = alpha;
      // The tail end bends with the sweep, more the further back it is, and rides a little high.
      const bend = (u: number) => Math.sin(sweep - u * 2.6) * T * 0.14 * u * u - T * 0.12 * u ** 3;
      const P = (u: number, v: number): [number, number] => [(u - 0.5) * L, v * T + bend(u)];
      const curve = (a: [number, number], b: [number, number], c: [number, number]) => ctx.bezierCurveTo(a[0], a[1], b[0], b[1], c[0], c[1]);

      // Body.
      ctx.beginPath();
      ctx.moveTo(...P(0, 0.14));
      curve(P(0, -0.16), P(0.07, -0.47), P(0.25, -0.5));
      curve(P(0.5, -0.53), P(0.72, -0.2), P(0.96, -0.05));
      ctx.lineTo(...P(0.96, 0.05));
      curve(P(0.72, 0.22), P(0.5, 0.52), P(0.27, 0.5));
      curve(P(0.12, 0.49), P(0, 0.36), P(0, 0.14));
      ctx.closePath();
      ctx.fillStyle = near ? WHALE : WHALE_FAR;
      ctx.fill();

      // The fluke: a thin flat blade, seen edge-on, at the end of the stock.
      ctx.beginPath();
      ctx.moveTo(...P(0.95, -0.05));
      ctx.quadraticCurveTo(...P(1.05, -0.16), ...P(1.14, -0.21));
      ctx.quadraticCurveTo(...P(1.1, 0.06), ...P(0.95, 0.06));
      ctx.closePath();
      ctx.fillStyle = near ? WHALE_FIN : WHALE_FAR;
      ctx.fill();

      if (near) {
        // Everything laid on the body is kept inside its outline.
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(...P(0, 0.14));
        curve(P(0, -0.16), P(0.07, -0.47), P(0.25, -0.5));
        curve(P(0.5, -0.53), P(0.72, -0.2), P(0.96, -0.05));
        ctx.lineTo(...P(0.96, 0.05));
        curve(P(0.72, 0.22), P(0.5, 0.52), P(0.27, 0.5));
        curve(P(0.12, 0.49), P(0, 0.36), P(0, 0.14));
        ctx.closePath();
        ctx.clip();
        // A slightly darker back.
        ctx.beginPath();
        ctx.moveTo(...P(-0.05, -0.6));
        ctx.lineTo(...P(1, -0.6));
        ctx.lineTo(...P(1, -0.05));
        curve(P(0.7, -0.1), P(0.3, -0.12), P(0.1, -0.2));
        ctx.lineTo(...P(-0.05, -0.2));
        ctx.closePath();
        ctx.fillStyle = WHALE_BACK;
        ctx.fill();
        // The belly: one flat shape from the chin to mid-body.
        ctx.beginPath();
        ctx.moveTo(...P(-0.05, 0.24));
        curve(P(0.15, 0.14), P(0.4, 0.2), P(0.66, 0.42));
        ctx.lineTo(...P(0.66, 0.8));
        ctx.lineTo(...P(-0.05, 0.8));
        ctx.closePath();
        ctx.fillStyle = WHALE_BELLY;
        ctx.fill();
        // Three hairline throat grooves.
        ctx.strokeStyle = WHALE_GROOVE;
        ctx.lineWidth = 1;
        for (let i = 0; i < 3; i += 1) {
          ctx.beginPath();
          ctx.moveTo(...P(0.03, 0.3 + i * 0.07));
          ctx.quadraticCurveTo(...P(0.2, 0.34 + i * 0.08), ...P(0.38, 0.4 + i * 0.07));
          ctx.stroke();
        }
        ctx.restore();

        // The mouth, and the eye just above its corner.
        ctx.strokeStyle = WHALE_FIN;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(...P(0, 0.14));
        ctx.quadraticCurveTo(...P(0.1, 0.25), ...P(0.23, 0.27));
        ctx.stroke();
        const [ex, ey] = P(0.2, 0.19);
        ellipse(WHALE_EYE, ex, ey, 1.7, 1.7);

        // One long flipper, down and back from under the head.
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.moveTo(...P(0.24, 0.44));
        curve(P(0.3, 0.68), P(0.42, 0.9), P(0.52, 1.04));
        curve(P(0.45, 0.76), P(0.4, 0.6), P(0.37, 0.48));
        ctx.closePath();
        ctx.fillStyle = WHALE_FIN;
        ctx.fill();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    };

    // ── Water: one flat colour, and bands stepping up toward where the surface would be ──
    rect(WATER, 0, 0, W, H);
    const band = (c: string, cx: number, cy: number, rx: number, ry: number) => {
      ctx.globalAlpha = 1;
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
      ctx.fill();
    };
    if (wide) {
      band(BAND_1, W * 1.02, -H * 0.25, W * 0.44, H);
      band(BAND_2, W * 1.02, -H * 0.25, W * 0.31, H * 0.78);
      band(BAND_3, W * 1.02, -H * 0.25, W * 0.19, H * 0.52);
    } else {
      band(BAND_1, W * 1.05, H * 0.95, W * 0.62, H * 0.4);
      band(BAND_2, W * 1.05, H * 0.95, W * 0.46, H * 0.28);
      band(BAND_3, W * 1.05, H * 0.95, W * 0.3, H * 0.16);
    }

    // ── Marine snow: single pixels sinking, drifting left ──
    for (const p of s.snow) {
      if (moving) {
        p.y += p.v * dt;
        p.x += p.dx * dt;
        if (p.y > H + 1) { p.y = -1; p.x = f.rnd() * (W + 20); }
        if (p.x < -1) p.x = W + 1;
      }
      const inWords = p.x < W * (wide ? 0.55 : 1) && p.y < H * (wide ? 0.58 : 0.55);
      rect(SNOW, p.x, p.y, 1, 1, inWords ? p.a * 0.5 : p.a);
    }

    // ── A far whale passes, small, at mid height, in the right half ──
    if (phase === 'passing') {
      const L = W * (wide ? 0.345 : 0.58) * 0.35;
      const startX = W + L / 2 + 10;
      const endX = W * (wide ? 0.62 : 0.4) + L / 2;
      const x = startX + (endX - startX) * k;
      const y = H * (wide ? 0.46 : 0.58);
      whale(x, y, L, H * (wide ? 0.24 : 0.22) * 0.35, 0, t / 760, false, Math.min(1, k * 8) * Math.min(1, (1 - k) * 4));
    }

    // ── The reef ──
    for (const far of [true, false]) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = far ? REEF_FAR : REEF_NEAR;
      for (const m of s.mounds) {
        if (m.far !== far) continue;
        ctx.beginPath();
        ctx.ellipse(m.cx, m.cy, m.rx, m.ry, 0, 0, TAU);
        ctx.fill();
      }
      ctx.fillRect(0, Math.round(H * (far ? 0.95 : 0.97)), W, H);
    }
    // Kelp: a few stalks that lean a pixel or two, slowly.
    ctx.globalAlpha = 1;
    ctx.strokeStyle = KELP;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (const st of s.stalks) {
      const base = ridgeAt(st.x) + 6;
      const lean = Math.sin((t / 9000) * TAU + st.phase) * 1.6;
      ctx.beginPath();
      ctx.moveTo(st.x, base);
      for (let i = 1; i <= 4; i += 1) {
        const q = i / 4;
        ctx.lineTo(st.x + lean * q * q + Math.sin(q * 3 + st.phase) * 1.2 * q, base - st.h * q);
      }
      ctx.stroke();
    }
    ctx.lineCap = 'butt';

    // ── The visitor: a whale ──
    if (phase !== 'away' && phase !== 'passing') {
      const L = W * (wide ? 0.345 : 0.58);
      const T = H * (wide ? 0.24 : 0.22);
      const stopTip = wide ? W * 0.25 : 6;
      const baseY = H * (wide ? 0.64 : 0.68);
      const swim = Math.sin((t / 5000) * TAU) * 0.9;
      const sweep = (t / 2400) * TAU;
      const bob = Math.sin((t / 4500) * TAU) * 3;
      let tip = stopTip;
      let y = baseY + bob;
      let rot = 0;
      if (phase === 'arriving') {
        tip = W + 30 + (stopTip - (W + 30)) * easeOut(k);
      } else if (phase === 'departing') {
        const e = easeIn(k);
        tip = stopTip + (-L - 70 - stopTip) * e;
        y = baseY + bob * (1 - k) + H * 0.62 * k ** 2.2;
        rot = -0.34 * clamp01(k * 3);
      }
      whale(tip + L / 2 + swim, y, L, T, rot, sweep, true);
    }

    // ── Done: one pale pip on the ridge for each quest finished ──
    const pips = Math.min(12, Math.max(0, f.done));
    // Right of where the whale waits, clear of the jelly and the lamp. On a phone, two short rows.
    for (let i = 0; i < pips; i += 1) {
      const row = wide ? 0 : Math.floor(i / 6);
      const col = wide ? i : i % 6;
      const x = wide ? W * 0.77 + col * 12 : W * 0.7 + col * 7.5;
      rect(PIP, x - 2, ridgeAt(x) - 5 - row * 7, 4, 4, 0.95);
    }

    // ── The signal: a marker lamp on a short pole, green or amber ──
    const lx = Math.round(W * (wide ? 0.935 : 0.84));
    const ly = Math.round(ridgeAt(lx) - 26);
    rect(POLE, lx - 1, ly, 2, ridgeAt(lx) + 12 - ly);
    ellipse(HOUSING, lx, ly - 1, 6, 6);
    ellipse(f.caution ? AMBER : GREEN, lx, ly - 1, 3.6, 3.6);

    // ── The companion: a drift jelly ──
    {
      const alongside = phase === 'stopped' || phase === 'arriving';
      const pulse = alongside ? 0.5 : 0.5 + 0.5 * Math.sin((t / 4000) * TAU);
      const rise = phase === 'departing' ? Math.sin(Math.PI * k) * 6 : 0;
      const jx = W * (wide ? 0.83 : 0.94) + (alongside ? 0 : Math.sin(t / 5200) * 1.5);
      const jy = H * (wide ? 0.6 : 0.58) + (alongside ? 0 : Math.sin(t / 4300) * 1.5) - rise;
      const ry = 4.5 - pulse;
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = JELLY;
      ctx.lineWidth = 1;
      for (const [dx, len] of [[-3, 7], [0, 9], [3, 6]] as const) {
        ctx.beginPath();
        ctx.moveTo(jx + dx, jy);
        ctx.lineTo(jx + dx + (dx === 0 ? 0 : Math.sign(dx) * 0.5), jy + len);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = JELLY;
      ctx.beginPath();
      ctx.ellipse(jx, jy, 6, ry, 0, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
    }

    // ── Your own hull: an arm in from the right edge, with the one lure on its end ──
    const armY = Math.round(H * 0.7);
    rect(POLE, W - 22, armY - 1, 22, 2);
    ellipse(LURE, W - 22, armY, 2.6, 2.6);
    ctx.globalAlpha = 1;
  },
});
