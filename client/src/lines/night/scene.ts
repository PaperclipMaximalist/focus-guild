/**
 * The Night Line: a platform in the rain, somewhere that isn't here. A quiet
 * maglev stop under a ringed moon, a far city, slow lights crossing the sky.
 *
 * The visitor is the train: it glides in and waits while a block is boarding,
 * leaves when a quest is finished, and an express runs through otherwise. The
 * signal at the end of the platform is green with no stragglers and amber
 * with some. A stud in the platform lights for each quest finished today.
 *
 * The other-worldly parts are kept dim on purpose: the moon is one shade
 * lighter than the sky, the city is a silhouette, the sky traffic is two slow
 * points of light. You notice them the third time, not the first.
 *
 * Flat colours only: no gradients, no blur.
 */

import { defineScene } from '../types';
import type { SceneFrame } from '../types';

const SKY = '#070920';
const MOON = '#0E1233';
const CITY = '#0B0E29';
const PLATFORM = '#0F1330';
const POLE = '#1B2150';
const SIGNAL_YELLOW = '#FFD23A';
const BODY = '#1A2152';
const BODY_LIT = '#2C3680';
const UNDER = '#04051A';
/** The cold light everything here runs on. */
const ICE = '#9FE8FF';
const LAMP = '#DDEBFF';
const RAIN = '190, 208, 255';

const CAR_W = 186;
const CAR_GAP = 2;
const CARS = 3;
const NOSE = 40;
const TRAIN_LEN = NOSE + CARS * CAR_W + (CARS - 1) * CAR_GAP;
const STOP_X = 12;

const easeOut = (k: number) => 1 - (1 - k) ** 3;
const easeIn = (k: number) => k ** 3;

interface Drop { x: number; y: number; len: number; v: number; a: number; near: boolean }
interface Splash { x: number; y: number; born: number }
interface Tower { x: number; w: number; h: number; lights: Array<{ dx: number; dy: number; a: number }> }
interface Craft { x: number; y: number; v: number }
interface State { drops: Drop[]; towers: Tower[]; craft: Craft[]; splashes: Splash[] }

function trainX(f: SceneFrame): number {
  const startX = f.w + 40;
  const endX = -TRAIN_LEN - 40;
  const { phase, k } = f.visitor;
  if (phase === 'arriving') return startX + (STOP_X - startX) * easeOut(k);
  if (phase === 'departing') return STOP_X + (endX - STOP_X) * easeIn(k);
  if (phase === 'passing') return startX + (endX - startX) * k;
  return STOP_X;
}

export default defineScene<State>({
  sky: SKY,

  layout(w, h, rnd) {
    const drops: Drop[] = Array.from({ length: Math.round(w / 4.5) }, (_, i) => ({
      x: rnd() * (w + 80),
      y: rnd() * h,
      len: 7 + rnd() * 12,
      v: 250 + rnd() * 230,
      a: 0.1 + rnd() * 0.2,
      near: i % 2 === 0,
    }));
    // The far city: slabs of slightly lighter night, a few lit floors each.
    // Kept low on the left, where the words are, and allowed to rise on the right.
    const towers: Tower[] = [];
    for (let tx = -6; tx < w; ) {
      const tw = 10 + Math.round(rnd() * 26);
      const reach = tx < w * 0.55 ? 0.16 : 0.34;
      const th = Math.round(h * (0.05 + rnd() * reach));
      const n = rnd() < 0.75 ? 1 + Math.floor(rnd() * 3) : 0;
      towers.push({
        x: tx,
        w: tw,
        h: th,
        lights: Array.from({ length: n }, () => ({ dx: 2 + rnd() * (tw - 4), dy: 3 + rnd() * (th - 5), a: 0.25 + rnd() * 0.45 })),
      });
      tx += tw + Math.round(rnd() * 5);
    }
    const craft: Craft[] = [
      { x: w * 0.35, y: h * 0.13, v: -7 },
      { x: w * 0.8, y: h * 0.26, v: 11 },
    ];
    return { drops, towers, craft, splashes: [] };
  },

  draw(f, s) {
    const { ctx, w: W, h: H, t, dt, moving } = f;
    const x = trainX(f);

    const rect = (c: string, px: number, py: number, w: number, h: number, a = 1) => {
      ctx.globalAlpha = a;
      ctx.fillStyle = c;
      ctx.fillRect(Math.round(px), Math.round(py), Math.round(w), Math.round(h));
    };

    /** A maglev: one long low body, a wedge of a nose, a single band of cold light. */
    const drawTrain = (edgeY: number) => {
      const carH = Math.round(H * 0.17);
      const floatGap = 5;
      const carY = edgeY - carH - floatGap - 4;
      const bandY = carY + Math.round(carH * 0.32);
      const bandH = Math.max(3, Math.round(carH * 0.14));

      // Nose: a wedge, with the cab glass as a smaller wedge inside it.
      if (x + NOSE > 0 && x < W) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = BODY;
        ctx.beginPath();
        ctx.moveTo(x, carY + carH);
        ctx.lineTo(x + NOSE, carY);
        ctx.lineTo(x + NOSE, carY + carH);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = ICE;
        ctx.beginPath();
        ctx.moveTo(x + NOSE * 0.5, bandY + bandH);
        ctx.lineTo(x + NOSE * 0.5 + bandH * 1.6, bandY);
        ctx.lineTo(x + NOSE, bandY);
        ctx.lineTo(x + NOSE, bandY + bandH);
        ctx.closePath();
        ctx.fill();
        rect('#FFFFFF', x + 3, carY + carH - 4, 6, 2);
      }

      for (let c = 0; c < CARS; c += 1) {
        const cx = x + NOSE + c * (CAR_W + CAR_GAP);
        if (cx > W || cx + CAR_W < 0) continue;
        rect(BODY, cx, carY, CAR_W, carH);
        rect(BODY_LIT, cx, carY, CAR_W, 1);
        // The window band, parted by thin posts.
        rect(ICE, cx + 6, bandY, CAR_W - 12, bandH, 0.88);
        for (let m = cx + 50; m < cx + CAR_W - 12; m += 44) rect(BODY, m, bandY, 2, bandH);
        // It floats: a hairline of light under the body, and the band smeared on the wet platform.
        rect(ICE, cx + 4, carY + carH + floatGap - 1, CAR_W - 8, 1, 0.5);
        rect(ICE, cx + 6, edgeY + 5, CAR_W - 12, H - edgeY - 7, 0.06);
      }
      ctx.globalAlpha = 1;
    };

    const edgeY = Math.round(H * 0.8);
    // The words sit top-left, so everything that stands up is kept to the right of them.
    const lampX = Math.round(W * (f.wide ? 0.6 : 0.76));
    const lampY = Math.round(H * 0.22);
    const spread = 50;

    rect(SKY, 0, 0, W, H);

    // A ringed moon, one shade off the sky, half out of frame.
    const mx = W * (f.wide ? 0.9 : 0.94);
    const my = H * 0.2;
    const mr = H * 0.36;
    ctx.globalAlpha = 1;
    ctx.fillStyle = MOON;
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = POLE;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(mx, my, mr * 1.55, mr * 0.2, -0.32, 0, Math.PI * 2);
    ctx.stroke();

    // Two slow lights crossing the sky, each with a short tail.
    for (const c of s.craft) {
      if (moving) {
        c.x += c.v * dt;
        if (c.x < -20) c.x = W + 20;
        if (c.x > W + 20) c.x = -20;
      }
      rect(ICE, c.x - Math.sign(c.v) * 7, c.y, 7, 1, 0.16);
      rect(ICE, c.x, c.y, 2, 1, 0.75);
    }

    // The far city.
    for (const b of s.towers) {
      rect(CITY, b.x, edgeY - b.h, b.w, b.h);
      for (const l of b.lights) rect(ICE, b.x + l.dx, edgeY - b.h + l.dy, 1, 1, l.a * 0.6);
    }
    // One beacon on the tallest tower, breathing slowly.
    const tall = s.towers.reduce((a, b) => (b.h > a.h ? b : a), s.towers[0]!);
    if (tall && (!moving || Math.floor(t / 1300) % 2 === 0)) rect('#FF7566', tall.x + tall.w / 2, edgeY - tall.h - 3, 2, 2, 0.8);

    const rain = (near: boolean) => {
      ctx.lineWidth = near ? 1.2 : 1;
      for (const d of s.drops) {
        if (d.near !== near) continue;
        if (moving) {
          d.y += d.v * dt;
          d.x -= d.v * dt * 0.18;
          if (d.y > edgeY + (near ? 4 + ((d.len * 7) % (H - edgeY - 4)) : 0)) {
            if (near && s.splashes.length < 40) s.splashes.push({ x: d.x, y: d.y, born: t });
            d.y = -d.len;
            d.x = f.rnd() * (W + 80);
          }
        }
        // Under the lamp the rain catches the light.
        const inCone = d.y > lampY && Math.abs(d.x - lampX) < spread * ((d.y - lampY) / (edgeY - lampY));
        ctx.strokeStyle = `rgba(${RAIN}, ${(near ? d.a : d.a * 0.55) * (inCone ? 2.3 : 1)})`;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + d.len * 0.18, d.y - d.len);
        ctx.stroke();
      }
    };

    ctx.globalAlpha = 1;
    rain(false);
    rect(PLATFORM, 0, edgeY, W, H - edgeY);
    // The guideway the train floats over, with a thread of light along it.
    rect(UNDER, 0, edgeY - 4, W, 4);
    rect(ICE, 0, edgeY - 4, W, 1, 0.22);
    if (f.visitor.phase !== 'away') drawTrain(edgeY);
    // The yellow line you stand behind.
    rect(SIGNAL_YELLOW, 0, edgeY, W, 2, 0.9);
    rect(SIGNAL_YELLOW, 0, edgeY + 6, W, 1, 0.16);
    // Studs set into the platform, one lit for each quest finished today.
    for (let i = 0; i < Math.min(12, f.done); i += 1) rect(ICE, W - 44 - i * 10, edgeY + 12, 4, 2, 0.7);

    // Platform lamp, its pool of light, and its smear on the wet ground.
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = LAMP;
    ctx.beginPath();
    ctx.moveTo(lampX - 7, lampY + 3);
    ctx.lineTo(lampX + 7, lampY + 3);
    ctx.lineTo(lampX + spread, edgeY);
    ctx.lineTo(lampX - spread, edgeY);
    ctx.closePath();
    ctx.fill();
    rect(POLE, lampX - 1, lampY, 2, H - lampY);
    rect(LAMP, lampX - 9, lampY, 18, 2);
    rect(LAMP, lampX - 14, edgeY + 5, 28, H - edgeY - 7, 0.05);

    // The signal: green when nothing has fallen behind, amber when something has.
    const sigX = W - 26;
    const sigY = Math.round(H * 0.44);
    rect(POLE, sigX + 3, sigY, 2, edgeY - sigY);
    rect(UNDER, sigX, sigY - 20, 8, 20);
    ctx.globalAlpha = 1;
    ctx.fillStyle = f.caution ? '#FF9F45' : '#5EE6A8';
    ctx.beginPath();
    ctx.arc(sigX + 4, sigY - (f.caution ? 13 : 6), 2.6, 0, Math.PI * 2);
    ctx.fill();

    rain(true);

    // Where a drop lands, a short flat tick, gone in a moment.
    s.splashes = s.splashes.filter((sp) => t - sp.born < 220);
    for (const sp of s.splashes) {
      const age = (t - sp.born) / 220;
      rect(`rgb(${RAIN})`, sp.x - 2 - age * 2, sp.y, 4 + age * 4, 1, 0.3 * (1 - age));
    }
    ctx.globalAlpha = 1;
  },
});
