/**
 * Runs one line canvas: the window, the charm or the backdrop.
 *
 * It owns everything a line should not have to think about: the screen's
 * pixel ratio, the two still layers (painted once and kept), a capped frame
 * rate, stopping when scrolled away or hidden, and one still frame for people
 * who ask for reduced motion. A line only paints and draws (see Layers in
 * types.ts).
 *
 * In development the address can pose every canvas for a screenshot:
 *   ?scene=away|arriving|stopped|departing|passing  &k=0.5  &caution=1  &done=3  &progress=0.4
 */

import { useQuestStore } from '../store/useQuestStore';
import { useScheduleStore } from '../store/useScheduleStore';
import { overdueCount } from './live';
import type { AnyLayers, Frame, VisitorPhase } from './types';

const SEED = 20261008;
const PHASES: VisitorPhase[] = ['away', 'arriving', 'stopped', 'departing', 'passing'];

export interface Pose {
  phase: VisitorPhase;
  k: number;
  caution?: boolean;
  done?: number;
  progress?: number;
}

let pose: Pose | null | undefined;

/** The pose asked for in the address, if any. Development only. */
export function readPose(): Pose | null {
  if (pose !== undefined) return pose;
  pose = null;
  if (!import.meta.env.DEV) return pose;
  const q = new URLSearchParams(window.location.search);
  const phase = q.get('scene') as VisitorPhase | null;
  if (!phase || !PHASES.includes(phase)) return pose;
  const k = q.has('k') ? Number(q.get('k')) : phase === 'stopped' ? 1 : phase === 'away' ? 0 : 0.5;
  pose = {
    phase,
    k: Number.isFinite(k) ? Math.min(1, Math.max(0, k)) : 0.5,
    caution: q.has('caution') ? q.get('caution') === '1' : undefined,
    done: q.has('done') ? Number(q.get('done')) || 0 : undefined,
    progress: q.has('progress') ? Number(q.get('progress')) || 0 : undefined,
  };
  return pose;
}

export interface Live {
  boarding: boolean;
  caution: boolean;
  done: number;
  progress: number;
}

/** What is true right now, read straight from the stores so a canvas never restarts to learn it. */
export function readLive(now: number = Date.now()): Live {
  const schedule = useScheduleStore.getState().schedule;
  const day = new Date(now);
  const sameDay = (iso: string) => {
    const d = new Date(iso);
    return d.getFullYear() === day.getFullYear() && d.getMonth() === day.getMonth() && d.getDate() === day.getDate();
  };
  let boarding = false;
  let planned = 0;
  let behind = 0;
  for (const b of schedule) {
    if (b.type !== 'work') continue;
    const start = new Date(b.start).getTime();
    const end = new Date(b.end).getTime();
    if (start <= now && end > now) boarding = true;
    if (!sameDay(b.start)) continue;
    planned += end - start;
    behind += Math.max(0, Math.min(end, now) - start);
  }
  let done = 0;
  for (const q of useQuestStore.getState().completed) if (q.completedAt && sameDay(q.completedAt)) done += 1;

  const p = readPose();
  return {
    boarding: p ? p.phase === 'stopped' || p.phase === 'arriving' : boarding,
    caution: p?.caution ?? overdueCount() > 0,
    done: p?.done ?? done,
    progress: p?.progress ?? (planned ? behind / planned : 0),
  };
}

export interface MountOptions<F extends Frame> {
  canvas: HTMLCanvasElement;
  layers: AnyLayers<F>;
  /** Adds what this kind of canvas knows beyond the common frame. Called once per frame, before drawing. */
  extend: (base: Frame) => F;
  /** Frames a second. 30 is plenty for the window; the backdrop needs less. */
  fps?: number;
  /** The most device pixels per CSS pixel worth paying for. */
  maxDpr?: number;
  /** Draw one frame and stop, whatever the motion setting. */
  still?: boolean;
  /** Called once the loop is running (never for a still). */
  onStart?: (now: number) => void;
}

/** Starts the canvas and returns the function that stops it. */
export function mountLayers<F extends Frame>(o: MountOptions<F>): () => void {
  const { canvas, layers } = o;
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  const still = !!o.still || !!readPose() || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gap = 1000 / (o.fps ?? 30) - 1;

  // A small fixed-seed generator: the still frame is the same every time.
  let seed = SEED;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  let W = 0;
  let H = 0;
  let state: unknown;
  let back: HTMLCanvasElement | null = null;
  let front: HTMLCanvasElement | null = null;

  const sheet = (dpr: number, paint: ((p: { ctx: CanvasRenderingContext2D; w: number; h: number; wide: boolean; rnd: () => number }) => void) | undefined) => {
    if (!paint || !W || !H) return null;
    const c = document.createElement('canvas');
    c.width = Math.round(W * dpr);
    c.height = Math.round(H * dpr);
    const x = c.getContext('2d');
    if (!x) return null;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    paint({ ctx: x, w: W, h: H, wide: W >= 560, rnd });
    return c;
  };

  const layout = () => {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(o.maxDpr ?? 2, window.devicePixelRatio || 1);
    W = rect.width;
    H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed = SEED;
    back = sheet(dpr, layers.back);
    state = layers.layout(W, H, rnd);
    front = sheet(dpr, layers.front);
  };

  const paint = (t: number, dt: number, moving: boolean) => {
    if (!W || !H) return;
    const f = o.extend({ ctx, w: W, h: H, wide: W >= 560, rnd, t, dt, moving, ...readLive() });
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, W, H);
    if (back) ctx.drawImage(back, 0, 0, W, H);
    layers.draw(f, state);
    ctx.globalAlpha = 1;
    if (front) ctx.drawImage(front, 0, 0, W, H);
    layers.over?.(f, state);
    ctx.globalAlpha = 1;
  };

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
    if (t - last < gap) return;
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    paint(t, dt, true);
  };

  const ro = new ResizeObserver(() => {
    layout();
    if (still) paint(4000, 0, false);
  });
  ro.observe(canvas);
  const io = new IntersectionObserver(([e]) => { visible = !!e?.isIntersecting; });
  io.observe(canvas);

  if (still) {
    paint(4000, 0, false);
  } else {
    o.onStart?.(performance.now());
    raf = requestAnimationFrame(frame);
  }

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    io.disconnect();
  };
}
