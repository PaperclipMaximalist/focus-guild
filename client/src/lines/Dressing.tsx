/**
 * The two pieces of a line that are on every page, not only Today:
 *
 *   <Charm />     the line's one signature object, in the sidebar's spare room
 *   <Backdrop />  texture, and a few slow specks, behind the whole app
 *
 * Both follow the same switch as the window (Settings → Experience →
 * Scenery) and hold still for reduced motion. The backdrop only moves on a
 * wide screen with a mouse: on a phone it is a still texture, so it costs no
 * battery.
 */

import { useEffect, useRef, useState } from 'react';
import { isSceneEnabled, subscribeScene } from '../lib/scene';
import { currentLine, subscribeLine } from './current';
import { mountLayers } from './engine';
import type { AnyLayers, Line } from './types';

function useLine(): Line {
  const [line, setLine] = useState(currentLine());
  useEffect(() => subscribeLine(() => setLine(currentLine())), []);
  return line;
}

function useScenery(): boolean {
  const [on, setOn] = useState(isSceneEnabled());
  useEffect(() => subscribeScene(() => setOn(isSceneEnabled())), []);
  return on;
}

function useLayers(layers: AnyLayers | undefined, opts: { fps?: number; maxDpr?: number; still?: () => boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const { fps, maxDpr, still } = opts;
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !layers) return;
    return mountLayers({ canvas, layers, extend: (base) => base, fps, maxDpr, still: still?.() });
  }, [layers, fps, maxDpr, still]);
  return ref;
}

/** Fills whatever room its parent gives it. With no charm, or scenery off, it is only that room. */
export function Charm({ className = '' }: { className?: string }) {
  const line = useLine();
  const on = useScenery();
  const layers = on ? line.charm : undefined;
  const ref = useLayers(layers, {});
  return (
    <div className={`line-charm relative ${className}`} aria-hidden>
      {layers && <canvas ref={ref} className="absolute inset-0 h-full w-full" />}
    </div>
  );
}

const backdropStill = () => !window.matchMedia('(min-width: 1024px) and (pointer: fine)').matches;

export function Backdrop() {
  const line = useLine();
  const on = useScenery();
  const layers = on ? line.backdrop : undefined;
  const ref = useLayers(layers, { fps: 20, maxDpr: 1, still: backdropStill });
  if (!layers) return null;
  // Behind everything: under the page's own surfaces, over the bare ground colour.
  return <canvas ref={ref} className="line-backdrop pointer-events-none fixed inset-0 -z-10 h-full w-full" aria-hidden />;
}
