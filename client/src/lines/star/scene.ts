/**
 * The Star Guild: the guild's lounge on an orbital station, looking out on a
 * nebula. From the reference still: a wide viewport on deep indigo space that
 * burns rose-red at its right edge, a river of star dust, thin orange
 * filaments, a ringed planet; the guild's flag flying outside, top right;
 * and under the glass a moulded violet console with angled insets, a slatted
 * vent lit from behind, a block of vent holes and a strip of light.
 *
 * The words sit on the bulkhead: on a wide window the wall to the left of the
 * glass; on a phone the wall above it.
 *
 * The visitor is a guild shuttle. Arriving, it glides in from the right and
 * holds station outside the glass with its nose light on (the one use of the
 * accent); departing, it turns its engine up and slides away; passing, a small
 * one crosses far off. Away: only the stars turning over and the flag flying.
 *
 * Inside the glass: a beacon on the console (green; amber when there are
 * stragglers), one mission patch on the console for each quest finished today
 * (up to 12), and the capsule drone, a glass pill with a rose core. It bobs in
 * no gravity when idle, snaps level and brightens while a shuttle waits, and
 * turns once end over end as it leaves. Painted smooth: light is soft.
 */

import { defineScene } from '../types';
import { insignia, spark } from './texture';

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const ROSE = '#FF85B8', GREEN = '#5EE6A8', AMBER = '#FFA24D';

const easeOut = (k: number) => 1 - (1 - k) ** 2.4;
const easeIn = (k: number) => k ** 2.2;

const plan = (w: number, h: number) => {
  const wide = w >= 560;
  const sill = wide ? h * 0.74 : h * 0.8;
  const glass = wide ? { x: w * 0.44, y: 12, w: w * 0.56 - 12, h: sill - 12 } : { x: 10, y: h * 0.47, w: w - 20, h: sill - h * 0.47 };
  return {
    wide,
    sill,
    glass,
    s: h / 288,
    dock: { x: glass.x + glass.w * (wide ? 0.6 : 0.66), y: glass.y + glass.h * (wide ? 0.5 : 0.52) },
    planet: { x: glass.x + glass.w * 0.2, y: glass.y + glass.h * (wide ? 0.34 : 0.4), r: (wide ? 30 : 17) * (h / 288) },
    drone: { x: glass.x + glass.w * (wide ? 0.07 : 0.1), y: glass.y + glass.h * 0.62 },
    beacon: wide ? w * 0.957 : w * 0.93,
  };
};

const glowAt = (c: Ctx, x: number, y: number, r: number, rgb: string, a: number) => {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
};

const rr = (c: Ctx, x: number, y: number, w: number, h: number, r: number) => {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
};

/** The guild's shuttle, nose to the left, centred on (x, y). `burn` is 0 to 1. */
const shuttle = (c: Ctx, x: number, y: number, s: number, burn: number, nose: boolean) => {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  // Engine light behind it.
  glowAt(c, 40, 0, 22 + burn * 16, '255,140,190', 0.35 + burn * 0.4);
  const plume = c.createLinearGradient(34, 0, 60 + burn * 30, 0);
  plume.addColorStop(0, 'rgba(255,225,240,0.95)');
  plume.addColorStop(1, 'rgba(255,133,184,0)');
  c.fillStyle = plume;
  c.beginPath();
  c.moveTo(34, -4);
  c.lineTo(60 + burn * 30, 0);
  c.lineTo(34, 4);
  c.closePath();
  c.fill();
  // Hull: a smooth lifting body.
  const hull = c.createLinearGradient(0, -12, 0, 12);
  hull.addColorStop(0, '#EDE8FF');
  hull.addColorStop(0.45, '#A99CFF');
  hull.addColorStop(1, '#3B3196');
  c.fillStyle = hull;
  c.beginPath();
  c.moveTo(-44, 2);
  c.bezierCurveTo(-30, -10, 10, -13, 36, -7);
  c.lineTo(38, 7);
  c.bezierCurveTo(12, 12, -28, 10, -44, 2);
  c.closePath();
  c.fill();
  // Fin and wing.
  c.fillStyle = '#5B4FD0';
  c.beginPath();
  c.moveTo(14, -10);
  c.lineTo(34, -22);
  c.lineTo(36, -7);
  c.closePath();
  c.fill();
  c.fillStyle = '#2E2590';
  c.beginPath();
  c.moveTo(-6, 6);
  c.lineTo(24, 17);
  c.lineTo(32, 8);
  c.closePath();
  c.fill();
  // Canopy and a stripe in the guild's colours.
  const glassy = c.createLinearGradient(-30, -8, -12, 2);
  glassy.addColorStop(0, '#1A1460');
  glassy.addColorStop(1, '#07051E');
  c.fillStyle = glassy;
  c.beginPath();
  c.moveTo(-32, -2);
  c.bezierCurveTo(-26, -8, -14, -9, -8, -6);
  c.lineTo(-10, -1);
  c.closePath();
  c.fill();
  c.fillStyle = 'rgba(255,255,255,0.7)';
  c.fillRect(-27, -5.4, 8, 1);
  c.fillStyle = ROSE;
  c.fillRect(0, -1.5, 30, 2.2);
  if (nose) {
    glowAt(c, -45, 2, 15, '255,133,184', 0.75);
    c.fillStyle = '#FFE1EE';
    c.beginPath();
    c.arc(-44.5, 2, 2, 0, TAU);
    c.fill();
  }
  c.restore();
};

interface Tw { x: number; y: number; ph: number; sp: number; r: number }

export default defineScene<Tw[]>({
  sky: '#0B0828',
  timing: { arriving: 3000, departing: 2600, passing: 4200 },

  back({ ctx: c, w, h, rnd }) {
    const g = plan(w, h), v = g.glass;
    // Space: indigo that turns rose-red at the right.
    const sky = c.createLinearGradient(v.x, 0, v.x + v.w, 0);
    sky.addColorStop(0, '#07051C');
    sky.addColorStop(0.45, '#15114E');
    sky.addColorStop(0.78, '#4A1766');
    sky.addColorStop(1, '#B02A56');
    c.fillStyle = sky;
    c.fillRect(0, 0, w, h);
    glowAt(c, v.x + v.w * 1.02, v.y + v.h * 0.72, v.h * 1.25, '255,70,90', 0.5);
    // The river of dust, a blue cloud running up to the right.
    for (let i = 0; i < 14; i += 1) {
      const u = i / 13;
      glowAt(c, v.x + v.w * (0.05 + u * 0.8), v.y + v.h * (0.85 - u * 0.75) + (rnd() - 0.5) * 30, v.h * (0.28 + rnd() * 0.3), i % 3 ? '70,80,235' : '130,70,230', 0.2);
    }
    for (let i = 0; i < 1500; i += 1) {
      const x = v.x + rnd() * v.w, y = v.y + rnd() * v.h;
      const off = Math.abs((y - v.y) / v.h - (0.85 - ((x - v.x) / v.w) * 0.75));
      if (rnd() > 0.25 + 0.75 * Math.exp(-((off / 0.22) ** 2))) continue;
      const a = 0.25 + rnd() * rnd() * 0.75;
      c.fillStyle = rnd() < 0.25 ? `rgba(255,200,225,${a})` : `rgba(225,220,255,${a})`;
      const d = rnd() < 0.1 ? 1.5 : 0.9;
      c.fillRect(x, y, d, d);
    }
    // Filaments.
    c.lineCap = 'round';
    for (let i = 0; i < 6; i += 1) {
      const x = v.x + v.w * (0.25 + rnd() * 0.5), y = v.y + v.h * (0.2 + rnd() * 0.6), len = v.w * (0.15 + rnd() * 0.2);
      c.strokeStyle = `rgba(255,${150 + Math.floor(rnd() * 50)},100,${0.22 + rnd() * 0.2})`;
      c.lineWidth = 0.7 + rnd();
      c.beginPath();
      c.moveTo(x, y);
      c.bezierCurveTo(x + len * 0.3, y - 26, x + len * 0.6, y + 22, x + len, y - 8 + rnd() * 20);
      c.stroke();
    }
    // The ringed planet: banded, lit from the right.
    const { x: px, y: py, r } = g.planet;
    c.save();
    c.beginPath();
    c.arc(px, py, r, 0, TAU);
    c.clip();
    const globe = c.createLinearGradient(px - r, py - r, px + r, py + r);
    globe.addColorStop(0, '#1B154E');
    globe.addColorStop(0.55, '#6A4FC0');
    globe.addColorStop(1, '#F0A6C8');
    c.fillStyle = globe;
    c.fillRect(px - r, py - r, r * 2, r * 2);
    c.rotate(-0.38);
    for (let i = 0; i < 11; i += 1) {
      c.fillStyle = i % 2 ? 'rgba(20,10,70,0.22)' : 'rgba(255,220,240,0.12)';
      c.fillRect(px - r * 3, py - r * 1.3 + i * r * 0.28, r * 6, r * 0.11);
    }
    c.restore();
    c.strokeStyle = 'rgba(232,214,255,0.75)';
    c.lineWidth = Math.max(1.4, r * 0.09);
    c.beginPath();
    c.ellipse(px, py, r * 1.85, r * 0.42, -0.38, -0.18, Math.PI + 0.18);
    c.stroke();
    c.strokeStyle = 'rgba(232,214,255,0.3)';
    c.lineWidth = Math.max(2.4, r * 0.2);
    c.beginPath();
    c.ellipse(px, py, r * 1.5, r * 0.32, -0.38, -0.1, Math.PI + 0.1);
    c.stroke();
  },

  layout(w, h, rnd) {
    const v = plan(w, h).glass;
    return Array.from({ length: 26 }, () => ({ x: v.x + rnd() * v.w, y: v.y + rnd() * v.h, ph: rnd() * TAU, sp: 0.5 + rnd() * 1.4, r: 2 + rnd() * 3 }));
  },

  draw(f, stars) {
    const { ctx: c, w, h, t, moving, visitor } = f;
    const g = plan(w, h), v = g.glass;

    for (const s of stars) {
      const a = moving ? 0.5 + 0.5 * Math.sin((t / 1000) * s.sp + s.ph) : 0.6;
      c.globalAlpha = a * 0.9;
      c.fillStyle = '#F4F0FF';
      spark(c, s.x, s.y, s.r * (0.4 + a * 0.6));
    }
    c.globalAlpha = 1;

    // The flag outside, top right: a wave runs along it.
    const fx = v.x + v.w * 0.7, fy = v.y + 2, fl = v.w * 0.34, fh = v.h * (g.wide ? 0.28 : 0.34);
    const wave = (u: number) => (Math.sin(u * 4.2 + (moving ? t / 460 : 1)) * 7 + Math.sin(u * 9 + (moving ? t / 310 : 2)) * 2) * (1 - u * 0.5) * g.s;
    c.beginPath();
    for (let i = 0; i <= 18; i += 1) c.lineTo(fx + (fl * i) / 18, fy + wave(i / 18) - 6);
    for (let i = 18; i >= 0; i -= 1) c.lineTo(fx + (fl * i) / 18 - (1 - i / 18) * 26, fy + fh + wave(i / 18) * 1.3 + (i / 18) * 16);
    c.closePath();
    const cloth = c.createLinearGradient(fx, 0, fx + fl, 0);
    cloth.addColorStop(0, '#4A40C8');
    cloth.addColorStop(1, '#2A2390');
    c.fillStyle = cloth;
    c.fill();
    c.save();
    c.clip();
    // Folds follow the wave: light on the crests, shade in the troughs.
    for (let i = 0; i < 24; i += 1) {
      const x = fx - 26 + ((fl + 26) * i) / 24;
      const u = Math.max(0, Math.min(1, (x + 13 - fx) / fl)), slope = wave(u + 0.03) - wave(u - 0.03);
      c.fillStyle = slope > 0 ? `rgba(4,2,30,${Math.min(0.3, slope * 0.16)})` : `rgba(210,200,255,${Math.min(0.2, -slope * 0.12)})`;
      c.fillRect(x, fy - 14, (fl + 26) / 24 + 0.6, fh + 50);
    }
    c.restore();
    c.fillStyle = '#FFFFFF';
    c.strokeStyle = '#FFFFFF';
    insignia(c, fx + fl * 0.5, fy + fh * 0.5 + wave(0.5), fh * 0.3);

    // The visitor.
    const { phase, k } = visitor;
    if (phase === 'passing') {
      c.globalAlpha = 0.85;
      shuttle(c, v.x + v.w + 40 - k * (v.w + 90), v.y + v.h * 0.26 + k * 14, 0.3 * g.s, 0.6, false);
      c.globalAlpha = 1;
    } else if (phase !== 'away') {
      let x = g.dock.x, y = g.dock.y, burn = 0.15;
      const sc = (g.wide ? 0.95 : 0.6) * g.s;
      if (phase === 'arriving') {
        const e = easeOut(k);
        x += (1 - e) * v.w * 0.7;
        y += (1 - e) * 26;
        burn = 0.8 * (1 - e) + 0.15;
      } else if (phase === 'departing') {
        const e = easeIn(k);
        x -= e * v.w * 1.1;
        y -= e * 22;
        burn = Math.min(1, 0.3 + k * 2);
      } else if (moving) {
        y += Math.sin(t / 1100) * 1.4;
      }
      shuttle(c, x, y, sc, burn, phase === 'stopped');
    }
  },

  front({ ctx: c, w, h }) {
    const g = plan(w, h), v = g.glass;
    // The bulkhead, with the glass cut out of it.
    c.save();
    c.beginPath();
    c.rect(0, 0, w, h);
    c.roundRect(v.x, v.y, v.w, v.h, 12);
    c.clip('evenodd');
    const wallG = c.createLinearGradient(0, 0, 0, h);
    wallG.addColorStop(0, '#1D1856');
    wallG.addColorStop(1, '#0E0B34');
    c.fillStyle = wallG;
    c.fillRect(0, 0, w, h);
    glowAt(c, w * 0.12, 0, h * 1.1, '120,105,255', 0.2);
    // Plate seams, stepping at an angle, as in the still.
    c.strokeStyle = 'rgba(5,3,26,0.8)';
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(0, h * 0.66);
    c.lineTo(w * 0.1, h * 0.66);
    c.lineTo(w * 0.1 + 9, h * 0.66 + 9);
    c.lineTo(w * 0.3, h * 0.66 + 9);
    c.lineTo(w * 0.3 + 9, h * 0.66);
    c.lineTo(w, h * 0.66);
    c.stroke();
    c.strokeStyle = 'rgba(180,170,255,0.2)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(0, h * 0.66 + 1.8);
    c.lineTo(w * 0.1 - 0.8, h * 0.66 + 1.8);
    c.lineTo(w * 0.1 + 8.2, h * 0.66 + 10.8);
    c.lineTo(w * 0.3 + 0.8, h * 0.66 + 10.8);
    c.lineTo(w * 0.3 + 9.8, h * 0.66 + 1.8);
    c.lineTo(w, h * 0.66 + 1.8);
    c.stroke();
    c.restore();
    // The glass's rim: dark gasket, then a bright moulded lip, brighter above.
    c.lineWidth = 5;
    c.strokeStyle = '#07051E';
    rr(c, v.x - 1, v.y - 1, v.w + 2, v.h + 2, 13);
    c.stroke();
    c.lineWidth = 1.6;
    const lip = c.createLinearGradient(0, v.y, 0, v.y + v.h);
    lip.addColorStop(0, '#F1ECFF');
    lip.addColorStop(1, '#6B5FD0');
    c.strokeStyle = lip;
    rr(c, v.x - 3.5, v.y - 3.5, v.w + 7, v.h + 7, 15);
    c.stroke();
    // A scratch or two on the glass.
    c.strokeStyle = 'rgba(255,255,255,0.12)';
    c.lineWidth = 0.8;
    c.beginPath();
    c.moveTo(v.x + v.w * 0.3, v.y + v.h * 0.15);
    c.lineTo(v.x + v.w * 0.42, v.y + v.h * 0.4);
    c.moveTo(v.x + v.w * 0.82, v.y + v.h * 0.6);
    c.lineTo(v.x + v.w * 0.9, v.y + v.h * 0.82);
    c.stroke();

    // The console: lighter moulded violet, lit along its top.
    const top = g.sill + 5;
    const con = c.createLinearGradient(0, top, 0, h);
    con.addColorStop(0, '#6E63D8');
    con.addColorStop(0.18, '#4A40B4');
    con.addColorStop(1, '#221C6C');
    c.fillStyle = con;
    c.fillRect(0, top, w, h - top);
    c.fillStyle = 'rgba(241,236,255,0.8)';
    c.fillRect(0, top, w, 1.2);
    // The strip of light.
    c.fillStyle = '#07051E';
    c.fillRect(0, top + 8, w, 5);
    c.shadowColor = 'rgba(190,110,255,0.95)';
    c.shadowBlur = 8;
    c.fillStyle = '#C48CFF';
    c.fillRect(0, top + 9.8, w, 1.4);
    c.shadowBlur = 0;
    // Angled insets.
    const inset = (x: number, wd: number) => {
      const y0 = top + 20, y1 = h - 5;
      c.beginPath();
      c.moveTo(x + 10, y0);
      c.lineTo(x + wd, y0);
      c.lineTo(x + wd - 10, y1);
      c.lineTo(x, y1);
      c.closePath();
      c.fillStyle = 'rgba(14,10,60,0.5)';
      c.fill();
      c.strokeStyle = 'rgba(200,190,255,0.3)';
      c.lineWidth = 1;
      c.stroke();
    };
    if (g.wide) {
      inset(w * 0.05, w * 0.1);
      inset(w * 0.16, w * 0.05);
    }
    // The slatted vent, lit from behind.
    const vx = g.wide ? w * 0.26 : w * 0.06, vw = g.wide ? w * 0.13 : w * 0.26;
    c.fillStyle = '#0B0830';
    rr(c, vx, top + 19, vw, h - top - 24, 4);
    c.fill();
    for (let y = top + 23; y < h - 9; y += 5) {
      c.fillStyle = 'rgba(170,90,255,0.85)';
      c.fillRect(vx + 4, y, vw - 8, 1.6);
    }
    glowAt(c, vx + vw / 2, (top + h) / 2 + 6, vw * 0.7, '170,90,255', 0.22);
    // Vent holes, far right.
    const hx0 = g.wide ? w * 0.86 : w * 0.7;
    for (let r = 0; r < 4; r += 1) {
      for (let k = 0; k < (g.wide ? 9 : 7); k += 1) {
        const hx = hx0 + k * 8 + (r % 2) * 4, hy = top + 24 + r * 7;
        if (hy > h - 7 || Math.abs(hx - g.beacon) < 9) continue;
        c.fillStyle = '#0B0830';
        c.beginPath();
        c.arc(hx, hy, 2.3, 0, TAU);
        c.fill();
        c.strokeStyle = 'rgba(232,226,255,0.5)';
        c.lineWidth = 0.9;
        c.beginPath();
        c.arc(hx, hy, 2.5, 0.2, Math.PI - 0.2);
        c.stroke();
      }
    }
    // The beacon's housing.
    c.fillStyle = '#0B0830';
    rr(c, g.beacon - 7, top - 5, 14, 9, 3);
    c.fill();
  },

  over(f) {
    const { ctx: c, w, h, t, moving, caution, done, visitor } = f;
    const g = plan(w, h);
    const top = g.sill + 5;

    // The beacon: green, or amber when there are stragglers.
    const pulse = moving ? 0.75 + 0.25 * Math.sin(t / 520) : 1;
    glowAt(c, g.beacon, top - 6, 24, caution ? '255,162,77' : '94,230,168', 0.55 * pulse);
    c.fillStyle = caution ? AMBER : GREEN;
    c.beginPath();
    c.arc(g.beacon, top - 4, 5, Math.PI, 0);
    c.closePath();
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.75)';
    c.beginPath();
    c.arc(g.beacon - 1.6, top - 6.4, 1.3, 0, TAU);
    c.fill();

    // One mission patch for each quest finished today.
    const n = Math.min(12, Math.max(0, Math.floor(done)));
    const px0 = g.wide ? w * 0.44 : w * 0.38, gap = g.wide ? Math.min(30, (w * 0.4) / 12) : (w * 0.3) / 12 + 6;
    const pr = g.wide ? 9 : 6.5, py = top + 20 + (h - top - 20) / 2;
    for (let i = 0; i < n; i += 1) {
      const x = px0 + i * gap * (g.wide ? 1 : 0.78), y = g.wide ? py : py + (i % 2 ? 4 : -4);
      const field = c.createLinearGradient(0, y - pr, 0, y + pr);
      field.addColorStop(0, '#3A309E');
      field.addColorStop(1, '#100C40');
      c.fillStyle = field;
      c.beginPath();
      c.arc(x, y, pr, 0, TAU);
      c.fill();
      c.strokeStyle = i % 3 === 0 ? '#FFC07A' : i % 3 === 1 ? '#C9C2FF' : '#FF9CC8';
      c.lineWidth = 1.4;
      c.stroke();
      c.fillStyle = '#F1ECFF';
      c.strokeStyle = '#F1ECFF';
      insignia(c, x, y, pr * 0.62);
    }

    // The capsule drone.
    const waiting = visitor.phase === 'stopped';
    const leaving = visitor.phase === 'departing';
    const bob = waiting || !moving ? 0 : Math.sin(t / 900) * 4;
    const tilt = waiting || !moving ? 0 : leaving ? easeOut(visitor.k) * TAU : Math.sin(t / 1400) * 0.16 + 0.12;
    const s = g.wide ? 1 : 0.72;
    c.save();
    c.translate(g.drone.x, g.drone.y + bob);
    c.rotate(tilt);
    c.scale(s, s);
    glowAt(c, 0, 0, waiting ? 30 : 22, '255,133,184', waiting ? 0.5 : 0.3);
    const shell = c.createLinearGradient(-9, 0, 9, 0);
    shell.addColorStop(0, 'rgba(232,226,255,0.5)');
    shell.addColorStop(0.5, 'rgba(120,105,230,0.3)');
    shell.addColorStop(1, 'rgba(232,226,255,0.55)');
    c.fillStyle = shell;
    rr(c, -9, -16, 18, 32, 9);
    c.fill();
    c.strokeStyle = 'rgba(241,236,255,0.85)';
    c.lineWidth = 1.1;
    c.stroke();
    const core = c.createRadialGradient(0, 2, 0, 0, 2, 7);
    core.addColorStop(0, '#FFF1F7');
    core.addColorStop(0.5, ROSE);
    core.addColorStop(1, 'rgba(255,133,184,0)');
    c.fillStyle = core;
    c.beginPath();
    c.arc(0, 2, 7, 0, TAU);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.8)';
    rr(c, -5.5, -12, 2.2, 9, 1.1);
    c.fill();
    c.restore();
  },
});
