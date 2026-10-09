/**
 * The Ring Line: an observation port on a quiet station, looking out past a
 * ringed giant. Space is a flat blue-black with a few dozen fixed stars; the
 * giant is the night side of a planet, lower right and more than half out of
 * frame, one ring passing behind it. A small moon takes minutes to cross the
 * upper right and a few flecks of dust drift left, as if the station turned.
 * Along the bottom runs the spur, a dark docking truss, with a collar at about
 * 62 % across and a short mast at the far right.
 *
 * The visitor is a shuttle. Arriving, it slows all the way in from the right
 * and docks nose-to-collar, and a boarding tube, edged in the accent (the one
 * pink in the scene), joins it to the spur. Stopped, it waits there. Departing,
 * the tube retracts, it backs off a little and pulls away up and to the left.
 * Passing, a smaller one crosses the middle distance. Away, only the spur,
 * the drone, the dust and the moon remain.
 *
 * The signal is a beacon on the mast: green and steady, amber (ringed) when
 * there are stragglers. One porthole along the spur is lit per quest finished
 * today (up to 12), in a single row left of the collar. The companion is a
 * capsule drone above the spur: it bobs a pixel while the station is idle,
 * sits level while the shuttle is docked, and its visor slides toward the
 * shuttle as it leaves.
 *
 * Flat colours only: no gradients, no blur.
 */

import { defineScene } from '../types';

const SPACE = '#090B1D';
const GIANT = '#13122B';
const GIANT_LIGHT = '#181634';
const GIANT_DARK = '#0F0F25';
const RING = '#1F1C40';
const MOON = '#38346B';
const MOON_DARK = '#201D44';
const SPUR = '#0E0B1E';
const SPUR_BEAM = '#1A1636';
const SPUR_STRUT = '#2A2452';
const SPUR_STRUT_DIM = '#1C1839';
const SPUR_STRUT_MID = '#231F48';
const BODY = '#312B63';
const BODY_HI = '#4A3F7A';
const BODY_LO = '#1D1840';
/** The one pale light: windows, lamps, and the hairline along the spur. */
const LIGHT = '#E4DCFA';
const PINK = '#FF6FB1';
const GREEN = '#5EE6A8';
const AMBER = '#FFA24D';
const DRONE = '#8E82C4';

const easeOut = (k: number) => 1 - (1 - k) ** 2.2;
const easeInOut = (k: number) => (k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) ** 2);

interface Star { x: number; y: number; a: number; s: number }
interface Fleck { x: number; y: number; v: number; a: number; s: number }
interface State { stars: Star[]; dust: Fleck[] }

export default defineScene<State>({
  sky: SPACE,
  timing: { arriving: 5200, departing: 4200, passing: 4000 },

  layout(w, h, rnd) {
    const wide = w >= 560;
    const wordsX = wide ? w * 0.55 : w;
    const wordsY = h * (wide ? 0.58 : 0.55);
    const stars: Star[] = Array.from({ length: Math.round(w / 22) }, () => {
      const x = Math.round(rnd() * w);
      const y = Math.round(rnd() * h * 0.78);
      const roll = rnd();
      // Where the words sit, nothing brighter than the dimmest star.
      const strength = x < wordsX && y < wordsY ? 0 : roll < 0.62 ? 0 : roll < 0.9 ? 1 : 2;
      return { x, y, a: [0.26, 0.5, 0.85][strength]!, s: strength === 2 ? 2 : 1 };
    });
    const dust: Fleck[] = Array.from({ length: 8 }, () => ({
      x: rnd() * w,
      y: h * (0.1 + rnd() * 0.62),
      v: 3 + rnd() * 6,
      a: 0.16 + rnd() * 0.14,
      s: rnd() < 0.7 ? 1 : 2,
    }));
    return { stars, dust };
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

    // ── Where things are ──
    const spurY = Math.round(H * 0.8);
    const collarX = Math.round(W * (wide ? 0.62 : 0.4));
    const COLLAR_W = 10;
    const dockNose = collarX + COLLAR_W;
    const hgt = Math.round(H * 0.155);
    const len = Math.round(hgt * (wide ? 3.2 : 3));
    const gap = wide ? 15 : 13; // the gangway's length
    const dockCy = spurY - gap - hgt / 2;
    const mastX = W - (wide ? 24 : 16);
    const mastTop = Math.round(H * 0.42);
    const gx = W * (wide ? 0.92 : 0.98);
    const gy = H * 0.64;
    const gr = H * (wide ? 0.75 : 0.62);
    const tilt = 0.25;
    const ringW = wide ? 1.4 : 1.2;

    // ── Space ──
    rect(SPACE, 0, 0, W, H);
    for (const st of s.stars) {
      if (st.s === 2) {
        rect(LIGHT, st.x - 1, st.y, 3, 1, st.a * 0.55);
        rect(LIGHT, st.x, st.y - 1, 1, 3, st.a * 0.55);
        rect(LIGHT, st.x, st.y, 1, 1, st.a);
      } else rect(LIGHT, st.x, st.y, 1, 1, st.a);
    }

    // Dust, drifting left: the station is turning.
    for (const d of s.dust) {
      if (moving) {
        d.x -= d.v * dt;
        if (d.x < -3) d.x = W + 3;
      }
      rect(LIGHT, d.x, d.y, d.s, d.s, d.a);
    }

    // ── The giant: the night side, flat, cropped, one ring behind it ──
    const ringHalf = (from: number, to: number) => {
      ctx.save();
      ctx.translate(gx, gy);
      ctx.rotate(tilt);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = RING;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, gr * ringW, gr * 0.2, 0, from, to);
      ctx.stroke();
      ctx.restore();
    };
    ringHalf(0, Math.PI * 2);
    disc(GIANT, gx, gy, gr);
    ctx.save();
    ctx.beginPath();
    ctx.arc(gx, gy, gr, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(gx, gy);
    ctx.rotate(0.07);
    ctx.globalAlpha = 1;
    ctx.fillStyle = GIANT_LIGHT;
    ctx.fillRect(-gr, -gr * 0.62, gr * 2, gr * 0.12);
    ctx.fillStyle = GIANT_DARK;
    ctx.fillRect(-gr, -gr * 0.34, gr * 2, gr * 0.09);
    ctx.fillStyle = GIANT_LIGHT;
    ctx.fillRect(-gr, -gr * 0.12, gr * 2, gr * 0.16);
    ctx.restore();
    // The near half of the ring, across the disc.
    ringHalf(0, Math.PI);

    // A small moon, taking minutes to cross the upper right, in front of the giant.
    const span = W * 0.34;
    const along = moving ? (t / 1000) * 2.4 : 0;
    const mx = W * 0.97 - ((span * 0.4 + along) % span);
    const my = H * (wide ? 0.1 : 0.09);
    const fadeIn = Math.max(0, Math.min(1, Math.min(mx - (W * 0.97 - span), W * 0.97 + 8 - mx) / 24));
    if (fadeIn > 0) {
      disc(MOON, mx, my, 6, fadeIn);
      ctx.save();
      ctx.beginPath();
      ctx.arc(mx, my, 6, 0, Math.PI * 2);
      ctx.clip();
      disc(MOON_DARK, mx + 3, my + 2, 5.6, fadeIn);
      ctx.restore();
    }

    /** A shuttle: a lifting-body capsule, nose to the left, one window strip, an engine bell at the back. */
    const shuttle = (cx: number, cy: number, L: number, Hh: number, ang: number, burn: boolean, far = 1) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ang);
      const x0 = -L / 2;
      const y0 = -Hh / 2;
      // The engine bell, behind the body.
      ctx.globalAlpha = far;
      ctx.fillStyle = BODY_LO;
      ctx.beginPath();
      ctx.moveTo(L / 2 - 2, y0 + Hh * 0.42);
      ctx.lineTo(L / 2 + Math.max(3, Hh * 0.14), y0 + Hh * 0.34);
      ctx.lineTo(L / 2 + Math.max(3, Hh * 0.14), y0 + Hh * 0.82);
      ctx.lineTo(L / 2 - 2, y0 + Hh * 0.74);
      ctx.closePath();
      ctx.fill();
      if (burn) {
        ctx.globalAlpha = 0.5 * far;
        ctx.fillStyle = LIGHT;
        ctx.fillRect(L / 2 + Math.max(3, Hh * 0.14) + 1, y0 + Hh * 0.5, 7, Math.max(1, Math.round(Hh * 0.1)));
      }
      // The hull: rounded nose, a gentle back that tapers to the rear, a flat belly.
      ctx.globalAlpha = far;
      ctx.fillStyle = BODY;
      ctx.beginPath();
      ctx.moveTo(x0, y0 + Hh * 0.64);
      ctx.bezierCurveTo(x0, y0 + Hh * 0.22, x0 + L * 0.14, y0, x0 + L * 0.34, y0);
      ctx.bezierCurveTo(x0 + L * 0.62, y0, x0 + L * 0.88, y0 + Hh * 0.1, L / 2, y0 + Hh * 0.26);
      ctx.lineTo(L / 2, y0 + Hh * 0.9);
      ctx.quadraticCurveTo(L / 2, y0 + Hh, L / 2 - 3, y0 + Hh);
      ctx.lineTo(x0 + L * 0.2, y0 + Hh);
      ctx.bezierCurveTo(x0 + L * 0.07, y0 + Hh, x0, y0 + Hh * 0.86, x0, y0 + Hh * 0.64);
      ctx.closePath();
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = BODY_HI;
      ctx.fillRect(x0, y0, L, Math.max(1, Math.round(Hh * 0.07)));
      ctx.fillStyle = BODY_LO;
      ctx.fillRect(x0, y0 + Hh * 0.74, L, Hh * 0.26);
      ctx.restore();
      // One continuous window strip with rounded ends, near the nose.
      const wh = Math.max(3, Math.round(Hh * 0.2));
      ctx.fillStyle = LIGHT;
      ctx.globalAlpha = 0.92 * far;
      ctx.beginPath();
      ctx.roundRect(x0 + L * 0.15, y0 + Hh * 0.3, L * 0.33, wh, wh / 2);
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
    };

    // ── A smaller one going by in the middle distance, behind the spur ──
    if (phase === 'passing') {
      const pl = Math.round(len * 0.55);
      const ph = Math.round(hgt * 0.55);
      const frac = k ** 1.9;
      const nose = W + 12 + (-pl - 20 - (W + 12)) * frac;
      shuttle(nose + pl / 2, H * 0.68, pl, ph, 0, true, 0.9);
    }

    // ── The spur: a flat truss along the bottom, a hairline of light on top ──
    rect(SPUR, 0, spurY, W, H - spurY);
    rect(SPUR_BEAM, 0, spurY + 1, W, 5);
    rect(SPUR_BEAM, 0, spurY + 17, W, 3);
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1.5;
    const quietTo = W * 0.55;
    for (const [from, to, colour] of [[-99, quietTo, SPUR_STRUT_DIM], [quietTo, W * 0.66, SPUR_STRUT_MID], [W * 0.66, W + 99, SPUR_STRUT]] as const) {
      ctx.strokeStyle = colour;
      ctx.beginPath();
      for (let x = -6; x < W + 12; x += 16) {
        if (x + 8 < from || x + 8 >= to) continue;
        ctx.moveTo(x, spurY + 17);
        ctx.lineTo(x + 8, spurY + 6);
        ctx.lineTo(x + 16, spurY + 17);
      }
      ctx.stroke();
    }
    rect(LIGHT, 0, spurY, quietTo, 1, 0.3);
    rect(LIGHT, quietTo, spurY, W - quietTo, 1, 0.5);

    // Low modules along the spur, on the left, below the words.
    const mod = (x: number, w: number, h: number) => {
      rect(SPUR_BEAM, x, spurY - h, w, h);
      rect(BODY_HI, x, spurY - h, w, 1, 0.7);
    };
    mod(W * 0.06, wide ? 46 : 32, 12);
    mod(W * 0.06 + (wide ? 54 : 38), wide ? 24 : 16, 8);
    rect(LIGHT, W * 0.06 + 8, spurY - 7, 2, 2, 0.55);
    const aerial = W * (wide ? 0.33 : 0.3);
    rect(BODY_HI, aerial, spurY - 17, 1, 17);
    rect(BODY_HI, aerial - 3, spurY - 17, 7, 1);
    rect(BODY_HI, aerial - 3, spurY - 19, 1, 3);
    rect(BODY_HI, aerial + 3, spurY - 19, 1, 3);

    // The collar: a post with a lit docking face on the side the shuttle comes to.
    const collarTop = Math.round(dockCy - hgt / 2 - 5);
    rect(SPUR_BEAM, collarX, collarTop, COLLAR_W - 2, spurY - collarTop);
    rect(BODY_HI, collarX, collarTop, COLLAR_W - 2, 2);
    rect(BODY_HI, collarX, collarTop, 1, spurY - collarTop);
    rect(BODY, collarX + COLLAR_W - 4, Math.round(dockCy - hgt * 0.42), 4, Math.round(hgt * 0.84));
    rect(LIGHT, collarX + COLLAR_W - 3, Math.round(dockCy - hgt * 0.2), 1, Math.round(hgt * 0.4), 0.7);

    // Done today: one small lit window set into the hull per quest, in a row running left from the collar.
    const wStep = wide ? 9 : 7;
    for (let i = 0; i < Math.min(12, f.done); i += 1) {
      const wx = collarX - 8 - i * wStep;
      rect(SPUR_BEAM, wx - 1, spurY + 25, 5, 5);
      rect(LIGHT, wx, spurY + 26, 3, 3, 0.95);
    }

    // The mast and its beacon: green when nothing has fallen behind, amber when something has.
    rect(SPUR_BEAM, mastX - 1, mastTop, 4, spurY - mastTop);
    rect(BODY_HI, mastX + 2, mastTop, 1, spurY - mastTop, 0.8);
    rect(SPUR_BEAM, mastX - 6, mastTop - 8, 14, 8);
    rect(BODY_HI, mastX - 6, mastTop - 8, 14, 1);
    const sig = f.caution ? AMBER : GREEN;
    disc(sig, mastX + 1, mastTop - 4, 3.2);
    if (f.caution) {
      ctx.globalAlpha = 0.75;
      ctx.strokeStyle = AMBER;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(mastX + 1, mastTop - 4, 8, 0, Math.PI * 2);
      ctx.stroke();
    }

    // ── The companion: a capsule drone above the spur ──
    const dx = Math.round(wide ? mastX - 52 : W * 0.8);
    let bob = 0;
    if (moving && (phase === 'away' || phase === 'passing')) bob = Math.round(Math.sin(t / 1900));
    const dy = spurY - 14 + bob;
    let visor = 0;
    if (phase === 'departing' && k > 0.28 && k < 0.52) visor = -Math.sin(((k - 0.28) / 0.24) * Math.PI) * 3;
    ctx.globalAlpha = 1;
    ctx.fillStyle = DRONE;
    ctx.beginPath();
    ctx.roundRect(dx - 7, dy, 14, 8, 4);
    ctx.fill();
    ctx.fillStyle = BODY_LO;
    ctx.beginPath();
    ctx.roundRect(Math.round(dx - 4 + visor), dy + 2, 8, 3, 1.5);
    ctx.fill();
    rect(LIGHT, dx - 2 + Math.round(visor), dy + 3, 2, 1, 0.9);
    rect(SPUR_BEAM, dx - 1, dy + 9, 2, 2);

    // ── The visitor ──
    if (phase === 'arriving') {
      const e = easeOut(k);
      const nose = dockNose + (W + 30 - dockNose) * (1 - e);
      shuttle(nose + len / 2, dockCy - 10 * (1 - e) ** 2, len, hgt, 0, false);
    } else if (phase === 'stopped') {
      shuttle(dockNose + len / 2, dockCy, len, hgt, 0, false);
    } else if (phase === 'departing') {
      let cx = dockNose + len / 2;
      let cy = dockCy;
      let ang = 0;
      if (k < 0.22) {
        cx += 14 * easeInOut(k / 0.22);
      } else {
        // Tail first, away from the collar: up and to the right, toward the giant.
        const p = (k - 0.22) / 0.78;
        const q = p ** 1.3;
        const fromX = cx + 14;
        cx = fromX + (W * 0.84 - fromX) * q;
        cy = dockCy + (-hgt * 2.6 - dockCy) * q;
        ang = -0.45 * Math.min(1, q * 2.5);
      }
      shuttle(cx, cy, len, hgt, ang, false);
    }

    // The gangway: solid, in the spur's own dark. The docking seal where it meets the hull is the one pink.
    const tubeK = phase === 'stopped' ? 1 : phase === 'departing' && k < 0.1 ? 1 - k / 0.1 : 0;
    if (tubeK > 0) {
      const th = Math.round(gap * tubeK);
      const tw = wide ? 16 : 14;
      const tx = Math.round(dockNose + len * 0.3);
      rect(SPUR_BEAM, tx, spurY - th, tw, th + 1);
      rect(BODY_HI, tx, spurY - th, 1, th, 0.6);
      rect(PINK, tx - 3, spurY - th, tw + 6, 2);
    }
    ctx.globalAlpha = 1;
  },
});
