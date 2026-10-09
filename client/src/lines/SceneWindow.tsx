/**
 * The window on Today. What is outside depends on the line (src/lines/<id>/
 * scene.ts); what it means is the same on every line, and it is never
 * decoration running on a loop:
 *
 *   - A block is boarding (in progress) → the visitor comes in and waits.
 *   - You finish a quest → it leaves. (With nothing waiting, one goes by.)
 *   - Nothing going on → one goes by now and then, a minute or two apart,
 *     and once when you first open the app.
 *   - The scene's one signal is calm with no stragglers and amber with some.
 *
 * This file owns everything a scene should not have to think about: the
 * canvas, the screen's pixel ratio, 30 fps, stopping when scrolled away or
 * hidden, a still frame for reduced motion, and the visitor's comings and
 * goings. A scene only draws.
 *
 * In development the address can pose the scene for a screenshot:
 *   ?scene=away|arriving|stopped|departing|passing  &k=0.5  &caution=1  &done=3
 */

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useScheduleStore } from '../store/useScheduleStore';
import { currentLine, subscribeLine } from './current';
import type { SceneFrame, SceneTiming, VisitorPhase } from './types';

const SEEN_KEY = 'fg:platform-greeted';
const SEED = 20261008;
const PHASES: VisitorPhase[] = ['away', 'arriving', 'stopped', 'departing', 'passing'];
const DEFAULT_TIMING: SceneTiming = { arriving: 2600, departing: 2800, passing: 1700, passEvery: [60_000, 130_000] };

interface Pose { phase: VisitorPhase; k: number; caution?: boolean; done?: number }

function readPose(): Pose | null {
  if (!import.meta.env.DEV) return null;
  const q = new URLSearchParams(window.location.search);
  const phase = q.get('scene') as VisitorPhase | null;
  if (!phase || !PHASES.includes(phase)) return null;
  const k = q.has('k') ? Number(q.get('k')) : phase === 'stopped' ? 1 : phase === 'away' ? 0 : 0.5;
  return {
    phase,
    k: Number.isFinite(k) ? Math.min(1, Math.max(0, k)) : 0.5,
    caution: q.has('caution') ? q.get('caution') === '1' : undefined,
    done: q.has('done') ? Number(q.get('done')) || 0 : undefined,
  };
}

export function SceneWindow({ caution, done, children }: { caution: boolean; done: number; children?: ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const schedule = useScheduleStore((s) => s.schedule);
  const [line, setLine] = useState(currentLine());
  useEffect(() => subscribeLine(() => setLine(currentLine())), []);

  // Read by the animation loop without restarting it.
  const live = useRef({ caution, done, schedule });
  useEffect(() => {
    live.current = { caution, done, schedule };
  }, [caution, done, schedule]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const scene = line.scene;
    const timing: SceneTiming = { ...DEFAULT_TIMING, ...scene.timing };
    const pose = readPose();
    const still = !!pose || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // A small fixed-seed generator: the still frame is the same every time.
    let seed = SEED;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    let W = 0;
    let H = 0;
    let state: unknown;

    const layout = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = rect.width;
      H = rect.height;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed = SEED;
      state = scene.layout(W, H, rnd);
    };

    // ── What the visitor is doing ──
    let phase: VisitorPhase = 'away';
    let phaseAt = 0;
    let nextPassAt = Infinity;
    let holdUntil = 0;

    const boardingNow = (now: number) =>
      live.current.schedule.some(
        (b) => b.type === 'work' && new Date(b.start).getTime() <= now && new Date(b.end).getTime() > now,
      );

    const go = (p: VisitorPhase, at: number) => {
      phase = p;
      phaseAt = at;
    };

    const nextPass = (t: number) => t + timing.passEvery[0] + rnd() * (timing.passEvery[1] - timing.passEvery[0]);

    /** Moves the visitor on, and says how far through its phase it is. */
    const drive = (t: number, boarding: boolean): number => {
      const through = (ms: number) => Math.min(1, (t - phaseAt) / ms);
      if (phase === 'arriving') {
        const k = through(timing.arriving);
        if (k >= 1) go('stopped', t);
        return k;
      }
      if (phase === 'stopped') {
        if (!boarding) go('departing', t);
        return 1;
      }
      if (phase === 'departing') {
        const k = through(timing.departing);
        if (k >= 1) go('away', t);
        return k;
      }
      if (phase === 'passing') {
        const k = through(timing.passing);
        if (k >= 1) go('away', t);
        return k;
      }
      if (boarding && t >= holdUntil) go('arriving', t);
      else if (!boarding && t >= nextPassAt) {
        go('passing', t);
        nextPassAt = nextPass(t);
      }
      return 0;
    };

    const paint = (f: Omit<SceneFrame, 'ctx' | 'w' | 'h' | 'wide' | 'rnd'>) => {
      ctx.globalAlpha = 1;
      scene.draw({ ctx, w: W, h: H, wide: W >= 560, rnd, ...f }, state);
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
      if (t - last < 32) return; // ~30 fps is plenty
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const boarding = boardingNow(Date.now());
      // The phase is read before driving, so a scene sees k reach 1 before the phase changes.
      const was = phase;
      const k = drive(t, boarding);
      paint({ t, dt, moving: true, visitor: { phase: was, k }, boarding, caution: live.current.caution, done: live.current.done });
    };

    const stillFrame = () => {
      const boarding = boardingNow(Date.now());
      paint({
        t: 4000,
        dt: 0,
        moving: false,
        visitor: pose ? { phase: pose.phase, k: pose.k } : { phase: boarding ? 'stopped' : 'away', k: boarding ? 1 : 0 },
        boarding: pose ? pose.phase === 'stopped' || pose.phase === 'arriving' : boarding,
        caution: pose?.caution ?? live.current.caution,
        done: pose?.done ?? live.current.done,
      });
    };

    const onResize = () => {
      layout();
      if (still) stillFrame();
    };
    const onDeparted = () => {
      const t = performance.now();
      if (phase === 'stopped') {
        go('departing', t);
        // Don't come straight back in while the same block is still running.
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
      // One passer-by when the app is first opened; after that they are a minute or two apart.
      let greeted = false;
      try {
        greeted = sessionStorage.getItem(SEEN_KEY) === '1';
        sessionStorage.setItem(SEEN_KEY, '1');
      } catch {
        // Storage blocked: greet every time.
      }
      nextPassAt = greeted ? nextPass(now) : now + 1400;
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
  }, [line]);

  return (
    <div
      className="scene-window relative h-52 overflow-hidden rounded-(--radius-card) lg:h-56"
      style={{ background: line.scene.sky }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />
      <div className="relative p-4">{children}</div>
    </div>
  );
}
