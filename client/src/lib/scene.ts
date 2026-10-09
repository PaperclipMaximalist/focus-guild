/**
 * Whether the night-platform scene on Today is shown. Saved on this device,
 * like the sound and haptics switches, and exposed through the same kind of
 * tiny pub/sub so a page re-renders when Settings flips it.
 */

const LS_KEY = 'fg:scene';

type Listener = () => void;
const listeners = new Set<Listener>();

let enabled = true;
try {
  enabled = localStorage.getItem(LS_KEY) !== '0';
} catch {
  // Storage blocked: keep the default.
}

export function isSceneEnabled(): boolean {
  return enabled;
}

export function setSceneEnabled(on: boolean): void {
  enabled = on;
  try {
    localStorage.setItem(LS_KEY, on ? '1' : '0');
  } catch {
    // Not saved; still applies for this visit.
  }
  listeners.forEach((l) => l());
}

export function subscribeScene(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
