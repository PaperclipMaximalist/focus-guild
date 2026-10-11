/**
 * Turns the small things a line paints for itself (lines/<id>/ornaments.ts)
 * into pictures the stylesheet can use.
 *
 * Each piece is painted once on a small canvas at twice its size, kept as a
 * data URL, and handed to CSS as a custom property on <html>. index.css then
 * puts them where they belong: frames round panels, trims along the sidebar
 * and the phone's bars, a mark before every section label, a rule under every
 * page title, a tailpiece at the foot of every page. So a line dresses every
 * page of the app without any page knowing about it.
 *
 * `data-ornate` on <html> lists the pieces the current line supplies, and the
 * stylesheet only reaches for those.
 */

import type { FramePiece, Line, Paint, Sprite } from './types';

const SEED = 20261010;
const SCALE = 2;

function picture(w: number, h: number, paint: (p: Paint) => void): string {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * SCALE);
  canvas.height = Math.round(h * SCALE);
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  let seed = SEED;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  paint({ ctx, w, h, wide: true, rnd });
  return `url("${canvas.toDataURL('image/png')}")`;
}

/** A sprite as a CSS image, for the places that show another line's picture (the picker). */
export function spriteUrl(sprite: Sprite): string {
  return picture(sprite.w, sprite.h, sprite.paint);
}

let set: string[] = [];

export function applyOrnaments(line: Line): void {
  const root = document.documentElement;
  for (const name of set) root.style.removeProperty(name);
  set = [];
  const put = (name: string, value: string) => {
    root.style.setProperty(name, value);
    set.push(name);
  };
  const have: string[] = [];
  const o = line.ornaments;

  const frame = (key: string, f: FramePiece | undefined) => {
    if (!f) return;
    const size = f.slice * 2 + f.edge;
    put(`--frame-${key}`, picture(size, size, f.paint));
    // The slice is counted in the picture's own pixels.
    put(`--frame-${key}-s`, String(f.slice * SCALE));
    put(`--frame-${key}-w`, `${f.slice}px`);
    have.push(key);
  };
  const sprite = (prefix: string, key: string, s: Sprite | undefined) => {
    if (!s) return;
    put(`--${prefix}-${key}`, picture(s.w, s.h, s.paint));
    put(`--${prefix}-${key}-w`, `${s.w}px`);
    put(`--${prefix}-${key}-h`, `${s.h}px`);
    have.push(key);
  };

  if (o) {
    frame('panel', o.frames?.panel);
    frame('card', o.frames?.card);
    frame('sign', o.frames?.sign);
    sprite('edge', 'vertical', o.edges?.vertical);
    sprite('edge', 'horizontal', o.edges?.horizontal);
    for (const key of ['emblem', 'mark', 'rule', 'tail', 'spot'] as const) sprite('sprite', key, o.sprites?.[key]);
  }

  if (have.length) root.dataset.ornate = have.join(' ');
  else delete root.dataset.ornate;
}
