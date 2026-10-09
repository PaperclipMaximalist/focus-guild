/**
 * The platform at night, in the rain, somewhere that isn't here: a quiet
 * maglev stop under a ringed moon, a far city, slow lights crossing the sky.
 * The one piece of atmosphere in the app.
 *
 * It is not decoration running on a loop: the train follows what you are
 * doing.
 *   - A block is boarding (in progress) → a train glides in and waits.
 *   - You finish a quest → it leaves. (With nothing waiting, one runs
 *     through instead.)
 *   - Nothing going on → an express passes now and then, a minute or two
 *     apart, and once when you first open the app.
 *   - The signal at the end of the platform is green when nothing has fallen
 *     behind and amber when there are stragglers. The row under the scene
 *     says the same in words.
 *
 * The other-worldly parts are kept dim on purpose: the moon is one shade
 * lighter than the sky, the city is a silhouette, the sky traffic is two
 * slow points of light. You notice them the third time, not the first.
 *
 * It keeps out of the way: it stops drawing when scrolled off screen or when
 * the tab is hidden, holds a still frame for people who ask for reduced
 * motion, runs at 30 fps, and can be turned off in Settings.
 *
 * Drawn on a canvas in flat colours: no gradients, no blur.
 */

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useScheduleStore } from '../store/useScheduleStore';

type Phase = 'away' | 'arriving' | 'stopped' | 'departing' | 'passing';

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

const SEEN_KEY = 'fg:platform-greeted';

const easeOut = (k: number) => 1 - (1 - k) ** 3;
const easeIn = (k: number) => k ** 3;

interface Drop { x: number; y: number; len: number; v: number; a: number; near: boolean }
interface Splash { x: number; y: number; born: number }
interface Tower { x: number; w: number; h: number; lights: Array<{ dx: number; dy: number; a: number }> }
interface Craft { x: number; y: number; v: number }

export function NightPlatform({ caution, children }: { caution: boolean; children?: ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const schedule = useScheduleStore((s) => s.schedule);

  // Read by the animation loop without restarting it.
  const live = useRef({ caution, schedule });
  live.current = { caution, schedule };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // A small fixed-seed generator: the still frame is the same every time.
    let seed = 20261008;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    let W = 0;
    let H = 0;
    let drops: Drop[] = [];
    let towers: Tower[] = [];
    let craft: Craft[] = [];
    let splashes: Splash[] = [];

    const layout = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = rect.width;
      H = rect.height;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed = 20261008;
      drops = Array.from({ length: Math.round(W / 4.5) }, (_, i) => ({
        x: rnd() * (W + 80),
        y: rnd() * H,
        len: 7 + rnd() * 12,
        v: 250 + rnd() * 230,
        a: 0.1 + rnd() * 0.2,
        near: i % 2 === 0,
      }));
      // The far city: slabs of slightly lighter night, a few lit floors each.
      // Kept low on the left, where the words are, and allowed to rise on the right.
      towers = [];
      for (let tx = -6; tx < W; ) {
        const w = 10 + Math.round(rnd() * 26);
        const reach = tx < W * 0.55 ? 0.16 : 0.34;
        const h = Math.round(H * (0.05 + rnd() * reach));
        const n = rnd() < 0.75 ? 1 + Math.floor(rnd() * 3) : 0;
        towers.push({
          x: tx,
          w,
          h,
          lights: Array.from({ length: n }, () => ({ dx: 2 + rnd() * (w - 4), dy: 3 + rnd() * (h - 5), a: 0.25 + rnd() * 0.45 })),
        });
        tx += w + Math.round(rnd() * 5);
      }
      craft = [
        { x: W * 0.35, y: H * 0.13, v: -7 },
        { x: W * 0.8, y: H * 0.26, v: 11 },
      ];
      splashes = [];
    };

    // ── What the train is doing ──
    let phase: Phase = 'away';
    let phaseAt = 0;
    let x = 0;
    let nextPassAt = Infinity;
    let holdUntil = 0;

    const boardingNow = (now: number) =>
      live.current.schedule.some(
        (b) => b.type === 'work' && new Date(b.start).getTime() <= now && new Date(b.end).getTime() > now,
      );

    const go = (p: Phase, at: number) => {
      phase = p;
      phaseAt = at;
    };

    const drive = (t: number, wall: number) => {
      const boarding = boardingNow(wall);
      const k = (ms: number) => Math.min(1, (t - phaseAt) / ms);
      const startX = W + 40;
      const endX = -TRAIN_LEN - 40;

      if (phase === 'arriving') {
        x = startX + (STOP_X - startX) * easeOut(k(2600));
        if (k(2600) >= 1) go('stopped', t);
      } else if (phase === 'stopped') {
        x = STOP_X;
        if (!boarding) go('departing', t);
      } else if (phase === 'departing') {
        x = STOP_X + (endX - STOP_X) * easeIn(k(2800));
        if (k(2800) >= 1) go('away', t);
      } else if (phase === 'passing') {
        x = startX + (endX - startX) * k(1700);
        if (k(1700) >= 1) go('away', t);
      } else if (boarding && t >= holdUntil) {
        go('arriving', t);
      } else if (!boarding && t >= nextPassAt) {
        go('passing', t);
        nextPassAt = t + 60_000 + rnd() * 70_000;
      }
    };

    // ── Drawing ──
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

    const draw = (t: number, moving: boolean, dt: number) => {
      const edgeY = Math.round(H * 0.8);
      // The words sit top-left, so everything that stands up is kept to the right of them.
      const wide = W >= 560;
      const lampX = Math.round(W * (wide ? 0.6 : 0.76));
      const lampY = Math.round(H * 0.22);
      const spread = 50;

      rect(SKY, 0, 0, W, H);

      // A ringed moon, one shade off the sky, half out of frame.
      const mx = W * (wide ? 0.9 : 0.94);
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
      for (const c of craft) {
        if (moving) {
          c.x += c.v * dt;
          if (c.x < -20) c.x = W + 20;
          if (c.x > W + 20) c.x = -20;
        }
        rect(ICE, c.x - Math.sign(c.v) * 7, c.y, 7, 1, 0.16);
        rect(ICE, c.x, c.y, 2, 1, 0.75);
      }

      // The far city.
      for (const b of towers) {
        rect(CITY, b.x, edgeY - b.h, b.w, b.h);
        for (const l of b.lights) rect(ICE, b.x + l.dx, edgeY - b.h + l.dy, 1, 1, l.a * 0.6);
      }
      // One beacon on the tallest tower, breathing slowly.
      const tall = towers.reduce((a, b) => (b.h > a.h ? b : a), towers[0]!);
      if (tall && (!moving || Math.floor(t / 1300) % 2 === 0)) rect('#FF7566', tall.x + tall.w / 2, edgeY - tall.h - 3, 2, 2, 0.8);

      const rain = (near: boolean) => {
        ctx.lineWidth = near ? 1.2 : 1;
        for (const d of drops) {
          if (d.near !== near) continue;
          if (moving) {
            d.y += d.v * dt;
            d.x -= d.v * dt * 0.18;
            if (d.y > edgeY + (near ? 4 + ((d.len * 7) % (H - edgeY - 4)) : 0)) {
              if (near && splashes.length < 40) splashes.push({ x: d.x, y: d.y, born: t });
              d.y = -d.len;
              d.x = rnd() * (W + 80);
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

      rain(false);
      rect(PLATFORM, 0, edgeY, W, H - edgeY);
      // The guideway the train floats over, with a thread of light along it.
      rect(UNDER, 0, edgeY - 4, W, 4);
      rect(ICE, 0, edgeY - 4, W, 1, 0.22);
      if (phase !== 'away') drawTrain(edgeY);
      // The yellow line you stand behind.
      rect(SIGNAL_YELLOW, 0, edgeY, W, 2, 0.9);
      rect(SIGNAL_YELLOW, 0, edgeY + 6, W, 1, 0.16);

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
      ctx.fillStyle = live.current.caution ? '#FF9F45' : '#5EE6A8';
      ctx.beginPath();
      ctx.arc(sigX + 4, sigY - (live.current.caution ? 13 : 6), 2.6, 0, Math.PI * 2);
      ctx.fill();

      rain(true);

      // Where a drop lands, a short flat tick, gone in a moment.
      splashes = splashes.filter((s) => t - s.born < 220);
      for (const s of splashes) {
        const age = (t - s.born) / 220;
        rect(`rgb(${RAIN})`, s.x - 2 - age * 2, s.y, 4 + age * 4, 1, 0.3 * (1 - age));
      }
      ctx.globalAlpha = 1;
    };

    // ── Running it ──
    layout();
    let raf = 0;
    let last = 0;
    let visible = true;

    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible || document.hidden) {
        last = t;
        return;
      }
      if (t - last < 32) return; // ~30 fps is plenty for rain
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      drive(t, Date.now());
      draw(t, true, dt);
    };

    const stillFrame = () => {
      phase = boardingNow(Date.now()) ? 'stopped' : 'away';
      x = STOP_X;
      draw(0, false, 0);
    };

    const onResize = () => {
      layout();
      if (still) stillFrame();
    };
    const onDeparted = () => {
      const t = performance.now();
      if (phase === 'stopped') {
        go('departing', t);
        // Don't pull straight back in while the same block is still running.
        holdUntil = t + 25_000;
      } else if (phase === 'away') {
        go('passing', t);
      }
    };

    const ro = new ResizeObserver(onResize);
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => { visible = !!e?.isIntersecting; });
    io.observe(canvas);

    if (still) {
      stillFrame();
    } else {
      const now = performance.now();
      // One express when the app is first opened; after that they are a minute or two apart.
      let greeted = false;
      try {
        greeted = sessionStorage.getItem(SEEN_KEY) === '1';
        sessionStorage.setItem(SEEN_KEY, '1');
      } catch {
        // Storage blocked: greet every time, it is only a train.
      }
      nextPassAt = greeted ? now + 60_000 + rnd() * 70_000 : now + 1400;
      holdUntil = now + 500;
      window.addEventListener('fg:departed', onDeparted);
      raf = requestAnimationFrame(frame);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener('fg:departed', onDeparted);
    };
  }, []);

  return (
    <div className="relative h-52 overflow-hidden rounded-(--radius-card) lg:h-56" style={{ background: SKY }}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />
      <div className="relative p-4">{children}</div>
    </div>
  );
}
