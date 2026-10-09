/**
 * Which line the app is running on. Saved on this device, like the other
 * Experience switches.
 *
 * The Night Line is built in: it is the default, and its colours are the
 * @theme defaults in index.css. Every other line is a folder beside this file,
 * loaded only when it is chosen, so one line cannot break another and nobody
 * downloads scenes they never see.
 *
 * `?line=<id>` in the address picks a line for this visit without saving it
 * (used by `npm run line:shoot`).
 */

import night from './night';
import type { Line } from './types';

const LS_KEY = 'fg:line';
export const DEFAULT_LINE = night.id;

const loaders = import.meta.glob<{ default: Line }>(['./*/index.ts', '!./night/index.ts']);

function loaderFor(id: string) {
  return loaders[`./${id}/index.ts`];
}

let current: Line = night;

type Listener = () => void;
const listeners = new Set<Listener>();

export function currentLine(): Line {
  return current;
}

export function subscribeLine(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

async function load(id: string): Promise<Line> {
  if (id === night.id) return night;
  const loader = loaderFor(id);
  if (!loader) return night;
  try {
    return (await loader()).default;
  } catch {
    // A line that fails to load must never take the app down with it.
    return night;
  }
}

function apply(line: Line): void {
  current = line;
  document.documentElement.dataset.line = line.id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', line.swatch[0]);
  listeners.forEach((l) => l());
}

function wanted(): string {
  try {
    const fromAddress = new URLSearchParams(window.location.search).get('line');
    if (fromAddress) return fromAddress;
    return localStorage.getItem(LS_KEY) ?? DEFAULT_LINE;
  } catch {
    return DEFAULT_LINE;
  }
}

/** Call once before the first render, so the app never paints in the wrong colours. */
export async function initLine(): Promise<void> {
  apply(await load(wanted()));
}

export async function chooseLine(id: string): Promise<void> {
  const line = await load(id);
  try {
    localStorage.setItem(LS_KEY, line.id);
  } catch {
    // Not saved; still applies for this visit.
  }
  apply(line);
}

/** Every line that loads, in picker order. */
export async function allLines(): Promise<Line[]> {
  const others = await Promise.all(Object.keys(loaders).map((path) => load(path.split('/')[1]!)));
  const seen = new Map<string, Line>([[night.id, night]]);
  for (const l of others) seen.set(l.id, l);
  return [...seen.values()].sort((a, b) => a.order - b.order);
}
