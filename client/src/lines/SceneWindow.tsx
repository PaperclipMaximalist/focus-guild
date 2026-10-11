/**
 * The cabin corner on Today: a wall, a window, and somewhere else going by
 * outside. What it shows depends on the line (src/lines/<id>/scene.ts); what
 * it means is the same on every line, and it is never decoration on a loop:
 *
 *   - A block is boarding (in progress) → the visitor comes in and waits.
 *   - You finish a quest → it leaves. (With nothing waiting, one goes by.)
 *   - Nothing going on → one goes by now and then, a minute or two apart,
 *     and once when you first open the app.
 *   - The scene's one signal is calm with no stragglers and amber with some.
 *
 * The canvas itself is run by engine.ts. This file adds the one thing only
 * the window has: the visitor's comings and goings.
 */

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { currentLine, subscribeLine } from './current';
import { mountLayers, readPose } from './engine';
import type { SceneFrame, SceneTiming, VisitorPhase } from './types';

const SEEN_KEY = 'fg:platform-greeted';
const DEFAULT_TIMING: SceneTiming = { arriving: 2600, departing: 2800, passing: 1700, passEvery: [60_000, 130_000] };

export function SceneWindow({ children }: { children?: ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [line, setLine] = useState(currentLine());
  useEffect(() => subscribeLine(() => setLine(currentLine())), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const scene = line.scene;
    const timing: SceneTiming = { ...DEFAULT_TIMING, ...scene.timing };
    const pose = readPose();

    // ── What the visitor is doing ──
    let phase: VisitorPhase = 'away';
    let phaseAt = 0;
    let nextPassAt = Infinity;
    let holdUntil = 0;

    const go = (p: VisitorPhase, at: number) => {
      phase = p;
      phaseAt = at;
    };
    // Spacing between passers-by does not need to repeat, and must not disturb the scene's own seeded numbers.
    const nextPass = (t: number) => t + timing.passEvery[0] + Math.random() * (timing.passEvery[1] - timing.passEvery[0]);

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

    const stop = mountLayers<SceneFrame>({
      canvas,
      layers: scene,
      extend: (base) => {
        if (!base.moving) {
          const visitor = pose
            ? { phase: pose.phase, k: pose.k }
            : { phase: (base.boarding ? 'stopped' : 'away') as VisitorPhase, k: base.boarding ? 1 : 0 };
          return { ...base, visitor };
        }
        // The phase is read before driving, so a scene sees k reach 1 before the phase changes.
        const was = phase;
        const k = drive(base.t, base.boarding);
        return { ...base, visitor: { phase: was, k } };
      },
      onStart: (now) => {
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
      },
    });

    return () => {
      stop();
      window.removeEventListener('fg:departed', onDeparted);
    };
  }, [line]);

  return (
    <div
      className="scene-window relative h-56 overflow-hidden rounded-(--radius-card) lg:h-72"
      style={{ background: line.scene.sky }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />
      <div className="relative p-4">{children}</div>
    </div>
  );
}
