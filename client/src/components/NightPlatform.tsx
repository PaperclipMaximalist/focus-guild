/**
 * The platform at night, in the rain. The one piece of atmosphere in the app.
 *
 * It is not decoration running on a loop: the train follows what you are
 * doing.
 *   - A block is boarding (in progress) → a train pulls in and waits.
 *   - You finish a quest → it pulls out. (With nothing waiting, one runs
 *     through instead.)
 *   - Nothing going on → an express passes now and then, a minute or two
 *     apart, and once when you first open the app.
 *   - The signal at the end of the platform is green when nothing has fallen
 *     behind and amber when there are stragglers. The row under the scene
 *     says the same in words.
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

const SKY = '#0A1122';
const PLATFORM = '#111A30';
const POLE = '#19233F';
const SIGNAL_YELLOW = '#FFD23A';
const BODY = '#1C2848';
const BODY_LIT = '#293763';
const UNDER = '#080D1A';
const WINDOW = '#FFE2A6';
const LAMP = '#FFEFC9';
const RAIN = '196, 210, 242';

const CAR_W = 172;
const CAR_GAP = 5;
const CARS = 3;
const TRAIN_LEN = CARS * CAR_W + (CARS - 1) * CAR_GAP;
const STOP_X = 14;

const SEEN_KEY = 'fg:platform-greeted';

const easeOut = (k: number) => 1 - (1 - k) ** 3;
const easeIn = (k: number) => k ** 3;

interface Drop { x: number; y: number; len: number; v: number; a: number; near: boolean }
interface Splash { x: number; y: number; born: number }

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
    let lights: Array<{ x: number; y: number; w: number; a: number; warm: boolean }> = [];
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
      lights = Array.from({ length: Math.round(W / 26) }, () => ({
        x: rnd() * W,
        y: H * 0.5 + rnd() * H * 0.16,
        w: rnd() < 0.3 ? 2 : 1,
        a: 0.2 + rnd() * 0.4,
        warm: rnd() < 0.7,
      }));
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
        x = startX + (STOP_X - startX) * easeOut(k(2800));
        if (k(2800) >= 1) go('stopped', t);
      } else if (phase === 'stopped') {
        x = STOP_X;
        if (!boarding) go('departing', t);
      } else if (phase === 'departing') {
        x = STOP_X + (endX - STOP_X) * easeIn(k(3200));
        if (k(3200) >= 1) go('away', t);
      } else if (phase === 'passing') {
        x = startX + (endX - startX) * k(2300);
        if (k(2300) >= 1) go('away', t);
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

    const drawTrain = (edgeY: number) => {
      const carH = Math.round(H * 0.28);
      const carY = edgeY - carH - 3;
      const winW = 18;
      const winH = Math.round(carH * 0.36);
      const winY = carY + Math.round(carH * 0.2);
      for (let c = 0; c < CARS; c += 1) {
        const cx = x + c * (CAR_W + CAR_GAP);
        if (cx > W || cx + CAR_W < 0) continue;
        rect(UNDER, cx + 10, carY + carH, CAR_W - 20, 3);
        rect(BODY, cx, carY, CAR_W, carH);
        rect(BODY_LIT, cx, carY, CAR_W, 2);
        rect(SIGNAL_YELLOW, cx, carY + carH - 9, CAR_W, 3, 0.55);
        // Two doors and five windows a car; the door panes are narrower.
        const slots = [10, 34, 62, 90, 114, 142];
        slots.forEach((off, i) => {
          const door = i === 0 || i === 5;
          const w = door ? 12 : winW;
          rect(WINDOW, cx + off, winY, w, door ? winH + 6 : winH, door ? 0.75 : 0.92);
          // On the wet platform, each lit window is a long faint smear.
          rect(WINDOW, cx + off, edgeY + 5, w, H - edgeY - 7, 0.085);
        });
        if (c === 0) {
          rect(SIGNAL_YELLOW, cx + 34, carY + 5, 46, 5, 0.9);
          rect('#FFFFFF', cx + 2, carY + carH - 17, 5, 5);
          rect('#FFFFFF', cx - 2, edgeY + 5, 10, H - edgeY - 7, 0.1);
        }
      }
      ctx.globalAlpha = 1;
    };

    const draw = (t: number, moving: boolean, dt: number) => {
      const edgeY = Math.round(H * 0.8);
      // The words sit top-left, so everything that stands up is kept to the right of them.
      const wide = W >= 560;
      const lampX = Math.round(W * (wide ? 0.6 : 0.76));
      const lampY = Math.round(H * 0.2);
      const spread = 50;

      rect(SKY, 0, 0, W, H);
      for (const l of lights) rect(l.warm ? WINDOW : '#A9C2FF', l.x, l.y, l.w, 1, l.a);

      // Overhead wire and its masts, behind the train.
      const wireY = edgeY - Math.round(H * 0.28) - 18;
      if (wide) {
        rect(POLE, Math.round(W * 0.44), wireY, W, 1);
        rect(POLE, Math.round(W * 0.82), wireY - 6, 2, edgeY - wireY + 6);
      }

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
      if (phase !== 'away') drawTrain(edgeY);
      // The yellow line you stand behind.
      rect(SIGNAL_YELLOW, 0, edgeY, W, 2, 0.9);
      rect(SIGNAL_YELLOW, 0, edgeY + 6, W, 1, 0.18);

      // Platform lamp, its pool of light, and its smear on the wet ground.
      ctx.globalAlpha = 0.055;
      ctx.fillStyle = LAMP;
      ctx.beginPath();
      ctx.moveTo(lampX - 7, lampY + 4);
      ctx.lineTo(lampX + 7, lampY + 4);
      ctx.lineTo(lampX + spread, edgeY);
      ctx.lineTo(lampX - spread, edgeY);
      ctx.closePath();
      ctx.fill();
      rect(POLE, lampX - 1, lampY, 2, H - lampY);
      rect(LAMP, lampX - 8, lampY, 16, 4);
      rect(LAMP, lampX - 14, edgeY + 5, 28, H - edgeY - 7, 0.06);

      // The signal: green when nothing has fallen behind, amber when something has.
      const sigX = W - 26;
      const sigY = Math.round(H * 0.4);
      rect(POLE, sigX + 3, sigY, 2, edgeY - sigY);
      rect(UNDER, sigX, sigY - 20, 8, 20);
      ctx.globalAlpha = 1;
      ctx.fillStyle = live.current.caution ? '#FF9F45' : '#62E08A';
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
