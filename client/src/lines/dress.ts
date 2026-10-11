/**
 * Turns what a line paints for itself (lines/<id>/ornaments.ts and texture.ts)
 * into pictures the stylesheet can use.
 *
 * Each piece is painted once on a small canvas at twice its size, kept as a
 * data URL, and handed to CSS as a custom property on <html>. index.css then
 * puts them where they belong: a material on every panel and on the sidebar,
 * frames round panels, trims along the sidebar and the phone's bars, a mark
 * before every section label, a rule under every page title. So a line dresses
 * every page of the app without any page knowing about it.
 *
 * A piece with `frames` is painted as a strip, one frame after another, and the
 * stylesheet steps through it. `data-ornate` on <html> lists the pieces the
 * current line supplies, and `data-moving` the ones that move. With Scenery
 * off nothing moves, but the materials and the frames stay: they are the
 * theme, not the scenery.
 */

import { isSceneEnabled, subscribeScene } from '../lib/scene';
import type { FramePiece, Line, Paint, Sprite, Tile } from './types';

const SEED = 20261010;
const SCALE = 2;

/** `along` is the way a strip of frames runs: 'x' side by side, 'y' one under another. */
function picture(w: number, h: number, paint: (p: Paint, frame: number) => void, frames = 1, along: 'x' | 'y' = 'x'): string {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * SCALE * (along === 'x' ? frames : 1));
  canvas.height = Math.round(h * SCALE * (along === 'y' ? frames : 1));
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  for (let i = 0; i < frames; i++) {
    // Every frame gets the same random numbers, so only what is meant to move does.
    let seed = SEED;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    ctx.save();
    ctx.setTransform(SCALE, 0, 0, SCALE, along === 'x' ? i * w * SCALE : 0, along === 'y' ? i * h * SCALE : 0);
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
    paint({ ctx, w, h, wide: true, rnd }, i);
    ctx.restore();
  }
  return `url("${canvas.toDataURL('image/png')}")`;
}

/** A sprite's first frame as a CSS image, for the places that show another line's picture (the picker). */
export function spriteUrl(sprite: Sprite): string {
  return picture(sprite.w, sprite.h, sprite.paint);
}

let set: string[] = [];
let dressed: Line | null = null;

export function applyOrnaments(line: Line): void {
  dressed = line;
  const root = document.documentElement;
  for (const name of set) root.style.removeProperty(name);
  set = [];
  const put = (name: string, value: string) => {
    root.style.setProperty(name, value);
    set.push(name);
  };
  const have: string[] = [];
  const moving: string[] = [];
  const o = line.ornaments;
  const t = line.textures;

  const frame = (key: string, f: FramePiece | undefined) => {
    if (!f) return;
    const size = f.slice * 2 + f.edge;
    put(`--frame-${key}`, picture(size, size, f.paint));
    // The slice is counted in the picture's own pixels.
    put(`--frame-${key}-s`, String(f.slice * SCALE));
    put(`--frame-${key}-w`, `${f.slice}px`);
    have.push(key);
  };
  const sprite = (prefix: string, key: string, s: Sprite | undefined, along: 'x' | 'y' = 'x') => {
    if (!s) return;
    const frames = Math.max(1, Math.floor(s.frames ?? 1));
    put(`--${prefix}-${key}`, picture(s.w, s.h, s.paint, frames, along));
    put(`--${prefix}-${key}-w`, `${s.w}px`);
    put(`--${prefix}-${key}-h`, `${s.h}px`);
    put(`--${prefix}-${key}-n`, String(frames));
    put(`--${prefix}-${key}-t`, `${s.seconds ?? 2}s`);
    have.push(key);
    if (frames > 1) moving.push(key);
  };
  const tile = (key: string, s: Tile | undefined) => {
    if (!s) return;
    put(`--tile-${key}`, picture(s.w, s.h, s.paint));
    put(`--tile-${key}-w`, `${s.w}px`);
    put(`--tile-${key}-h`, `${s.h}px`);
    have.push(`${key}-tile`);
  };

  if (t) {
    tile('panel', t.panel);
    tile('wall', t.wall);
    tile('accent', t.accent);
  }
  if (o) {
    frame('panel', o.frames?.panel);
    frame('card', o.frames?.card);
    frame('sign', o.frames?.sign);
    sprite('edge', 'vertical', o.edges?.vertical);
    sprite('edge', 'horizontal', o.edges?.horizontal, 'y');
    sprite('edge', 'crown', o.edges?.crown, 'y');
    for (const key of ['emblem', 'mark', 'rule', 'spot'] as const) sprite('sprite', key, o.sprites?.[key]);
  }

  if (have.length) root.dataset.ornate = have.join(' ');
  else delete root.dataset.ornate;
  if (moving.length && isSceneEnabled()) root.dataset.moving = moving.join(' ');
  else delete root.dataset.moving;
}

// Scenery switched in Settings: start or stop the small movements at once.
subscribeScene(() => {
  if (dressed) applyOrnaments(dressed);
});
