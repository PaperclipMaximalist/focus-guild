/**
 * Check a line against the contract in design/lines/CONTRACT.md.
 *
 *   npm run line:check <id>
 *
 * It checks what a machine can: the files are there, every colour is defined
 * and readable, the line is dark, the accent cannot be mistaken for a status,
 * the frame only touches the hooks it is allowed, and the scene keeps to flat
 * colour and the engine's clock. Whether it looks good is `npm run line:shoot`
 * and a pair of eyes.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const id = process.argv[2];
if (!id || !/^[a-z][a-z0-9-]*$/.test(id)) {
  console.error('usage: npm run line:check <id>   (id: lower-case letters, digits, hyphens)');
  process.exit(2);
}
const dir = resolve(here, '../src/lines', id);
const builtIn = id === 'night';

const fails = [];
const notes = [];
const fail = (m) => fails.push(m);
const read = (name) => (existsSync(join(dir, name)) ? readFileSync(join(dir, name), 'utf8').replace(/\r\n/g, '\n') : null);
const noComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

// ── Colour maths ──
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const lum = (hex) => {
  const [r, g, b] = rgb(hex).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const hue = (hex) => {
  const [r, g, b] = rgb(hex);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
const apart = (a, b) => {
  const d = Math.abs(hue(a) - hue(b));
  return Math.min(d, 360 - d);
};
const within = (h, from, to) => (from <= to ? h >= from && h <= to : h >= from || h <= to);

// ── Tokens ──
const COLOURS = ['bg', 'surface', 'surface2', 'border', 'border-strong', 'text', 'muted', 'primary', 'primary-d', 'on-primary', 'rank', 'gold', 'gold-d', 'fire', 'green', 'teal', 'blue'];
const RADII = ['card', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'];

function readTokens() {
  const src = builtIn ? readFileSync(resolve(here, '../src/index.css'), 'utf8') : read('tokens.css');
  if (src === null) {
    fail('tokens.css is missing');
    return null;
  }
  const css = noComments(src);
  let body;
  if (builtIn) {
    body = css.match(/@theme\s*\{([\s\S]*?)\}/)?.[1] ?? '';
  } else {
    const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    if (blocks.length !== 1 || blocks[0][1].trim() !== `:root[data-line="${id}"]`) {
      fail(`tokens.css must be exactly one block: :root[data-line="${id}"] { … }`);
    }
    body = blocks[0]?.[2] ?? '';
  }
  const t = {};
  for (const [, name, value] of body.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) t[name] = value.trim();
  if (!builtIn) {
    const allowed = new Set([...COLOURS.map((c) => `color-${c}`), ...RADII.map((r) => `radius-${r}`)]);
    for (const name of Object.keys(t)) if (!allowed.has(name)) fail(`tokens.css sets --${name}, which a line may not change (colours and radii only; never fonts)`);
  }
  for (const c of COLOURS) {
    const v = t[`color-${c}`];
    if (!v) fail(`--color-${c} is not defined`);
    else if (!/^#[0-9a-fA-F]{6}$/.test(v)) fail(`--color-${c} must be a six-digit hex colour, got "${v}"`);
  }
  return Object.fromEntries(COLOURS.map((c) => [c, t[`color-${c}`]]));
}

function checkColours(c) {
  if (COLOURS.some((k) => !/^#[0-9a-fA-F]{6}$/.test(c[k] ?? ''))) return;
  const need = (fg, bg, min, why) => {
    const r = contrast(c[fg], c[bg]);
    if (r < min) fail(`${fg} on ${bg} is ${r.toFixed(2)}:1, needs ${min}:1 (${why})`);
  };
  for (const ground of ['bg', 'surface', 'surface2']) need('text', ground, 9, 'body text');
  need('muted', 'bg', 5, 'secondary text');
  need('muted', 'surface', 4.5, 'secondary text');
  need('muted', 'surface2', 4, 'secondary text on a raised control');
  need('primary', 'bg', 7, 'the accent as text and outline');
  need('primary', 'surface', 6.5, 'the accent as text and outline');
  need('on-primary', 'primary', 7, 'ink on the accent');
  need('on-primary', 'primary-d', 5.5, 'ink on the pressed accent');
  for (const status of ['green', 'gold', 'fire', 'teal', 'blue']) {
    need(status, 'bg', 4.5, 'a status word');
    need(status, 'surface', 4.5, 'a status word');
  }
  need('border-strong', 'bg', 1.8, 'the edge of an input must be findable');
  need('border', 'surface', 1.12, 'the hairline between rows');

  // Dark only, and each surface a step up from the one below.
  if (lum(c.bg) > 0.012) fail(`bg is too light for a dark-only app (luminance ${lum(c.bg).toFixed(3)}, at most 0.012)`);
  if (lum(c.surface2) > 0.06) fail(`surface2 is too light (luminance ${lum(c.surface2).toFixed(3)}, at most 0.06)`);
  if (!(lum(c.bg) < lum(c.surface) && lum(c.surface) < lum(c.surface2))) fail('surfaces must rise in lightness: bg < surface < surface2');

  // One accent that means "act here": it must not read as a status.
  const h = hue(c.primary);
  if (!within(hue(c.fire), 345, 22)) fail(`fire (late) must stay red, hue 345–22; it is ${hue(c.fire).toFixed(0)}`);
  if (!within(hue(c.green), 115, 178)) fail(`green (on time) must stay green, hue 115–178; it is ${hue(c.green).toFixed(0)}`);
  if (!within(hue(c.gold), 18, 46)) fail(`gold (attention) must stay amber, hue 18–46; it is ${hue(c.gold).toFixed(0)}`);
  if (apart(c.primary, c.fire) < 25) fail(`the accent (hue ${h.toFixed(0)}) is too close to fire (late); keep 25° apart`);
  if (apart(c.primary, c.green) < 25) fail(`the accent (hue ${h.toFixed(0)}) is too close to green (on time); keep 25° apart`);
  if (apart(c.primary, c.gold) < 12) fail(`the accent (hue ${h.toFixed(0)}) is too close to gold (attention); keep 12° apart`);
}

// ── Frame ──
const HOOKS = ['.scene-window', '.board-sign', '.btn-primary', '.panel', '.section-label'];
const FRAME_BANNED = [
  [/!important/, '!important'],
  [/text-shadow/, 'text-shadow'],
  [/(^|[\s;{])filter\s*:/, 'filter'],
  [/backdrop-filter/, 'backdrop-filter'],
  [/clip-path/, 'clip-path (it cuts the focus ring off; cut corners with a hard-stopped gradient)'],
  [/(^|[\s;{])mask/, 'mask'],
  [/transition\s*:\s*all/, 'transition: all'],
  [/animation|@keyframes/, 'animation (the frame holds still; movement belongs to the scene)'],
  [/font-(family|size|weight)|letter-spacing|text-transform/, 'type changes (every line keeps the same faces and scale)'],
  [/url\(/, 'url() (no images or outside files)'],
  [/position\s*:\s*(fixed|sticky)/, 'position: fixed or sticky'],
  [/display\s*:\s*none|visibility\s*:\s*hidden/, 'hiding things'],
  [/(^|[\s;{])(margin|padding)[a-z-]*\s*:/, 'margin or padding (the frame may not move anything)'],
];

function checkFrame() {
  const src = read('frame.css');
  if (src === null) return fail('frame.css is missing');
  const css = noComments(src).trim();
  const layer = css.match(/^@layer components\s*\{([\s\S]*)\}$/);
  if (!layer) return fail('frame.css must be one block: @layer components { … } (so a utility class on the same element still wins)');
  for (const [re, what] of FRAME_BANNED) if (re.test(css)) fail(`frame.css uses ${what}`);
  for (const [, value] of css.matchAll(/box-shadow\s*:\s*([^;]+);/g)) {
    for (const shadow of value.split(/,(?![^(]*\))/)) {
      const lengths = shadow.replace(/\([^)]*\)/g, '').match(/-?\d*\.?\d+(px|rem|em)?\b/g) ?? [];
      if (lengths.length >= 3 && parseFloat(lengths[2]) !== 0) fail(`frame.css has a blurred box-shadow ("${shadow.trim()}"); only hard edges, no glow`);
    }
  }
  // Every rule must be scoped to this line and to a hook.
  const prefix = `:root[data-line="${id}"] `;
  for (const [, raw] of layer[1].matchAll(/([^{};]+)\{/g)) {
    const sel = raw.trim();
    if (sel.startsWith('@media')) {
      if (!/^@media\s*\((hover: hover|pointer: coarse|min-width: \d+px|max-width: \d+px)\)$/.test(sel)) fail(`frame.css: unexpected ${sel}`);
      continue;
    }
    for (const one of sel.split(',').map((s) => s.trim())) {
      if (!one.startsWith(prefix)) fail(`frame.css: "${one}" must start with ${prefix.trim()}`);
      else if (!HOOKS.some((hook) => one.slice(prefix.length).startsWith(hook))) fail(`frame.css: "${one}" styles something other than ${HOOKS.join(', ')}`);
    }
  }
  const gradients = (css.match(/gradient\(/g) ?? []).length;
  if (gradients) notes.push(`frame.css has ${gradients} gradient(s): each must be hard-stopped (a cut corner, a dot, a stripe), never a fade`);
}

// ── Scene ──
const SCENE_BANNED = [
  [/create(Linear|Radial|Conic)Gradient/, 'a canvas gradient'],
  [/shadow(Blur|Color|OffsetX|OffsetY)/, 'a canvas shadow'],
  [/\.filter\s*=/, 'a canvas filter'],
  [/globalCompositeOperation/, 'a blend mode'],
  [/(fill|stroke)Text|measureText|\.font\s*=/, 'text in the scene (words belong to the page)'],
  [/drawImage|new Image|createPattern/, 'an image'],
  [/Math\.random/, 'Math.random (use the seeded rnd the engine hands you)'],
  [/\bDate\b|performance\.|requestAnimationFrame|setTimeout|setInterval/, 'its own clock or timers (use f.t and f.dt)'],
  [/\bwindow\b|\bdocument\b|localStorage|sessionStorage|\bfetch\(|\bimport\(/, 'the page or the network'],
];

function checkScene() {
  const src = read('scene.ts');
  if (src === null) return fail('scene.ts is missing');
  const code = noComments(src);
  for (const [re, what] of SCENE_BANNED) if (re.test(code)) fail(`scene.ts uses ${what}`);
  for (const [, from] of code.matchAll(/import[^;]*from\s*['"]([^'"]+)['"]/g)) {
    if (from !== '../types') fail(`scene.ts imports "${from}"; a scene may only import ../types`);
  }
  if (!/export default defineScene</.test(code)) fail('scene.ts must `export default defineScene<State>({ … })`');
  for (const word of ['visitor', 'caution', 'done', 'moving', 'wide']) {
    if (!new RegExp(`\\b${word}\\b`).test(code)) fail(`scene.ts never reads "${word}"; every scene answers to it (see the contract)`);
  }
  const lines = src.split('\n').length;
  if (lines > 560) fail(`scene.ts is ${lines} lines; keep it under 560 (a scene is a few flat shapes)`);
  if (!builtIn && !/^\/\*\*[\s\S]{200,}?\*\//.test(src.trim())) fail('scene.ts must open with a comment saying what is outside the window and what each state looks like');
}

// ── Index ──
function checkIndex(c) {
  const src = read('index.ts');
  if (src === null) return fail('index.ts is missing');
  if (!new RegExp(`id:\\s*'${id}'`).test(src)) fail(`index.ts must have id: '${id}' (the folder name)`);
  for (const key of ['name', 'journey', 'windowHint', 'order']) if (!new RegExp(`\\b${key}:`).test(src)) fail(`index.ts is missing ${key}`);
  if (!builtIn) {
    for (const file of ['./tokens.css', './frame.css']) if (!src.includes(`import '${file}'`)) fail(`index.ts must import '${file}'`);
  }
  const swatch = src.match(/swatch:\s*\[\s*'(#[0-9a-fA-F]{6})'\s*,\s*'(#[0-9a-fA-F]{6})'\s*,\s*'(#[0-9a-fA-F]{6})'\s*\]/);
  if (!swatch) fail("index.ts needs swatch: ['#bg', '#surface', '#primary']");
  else if (c && [c.bg, c.surface, c.primary].some((v, i) => (v ?? '').toLowerCase() !== swatch[i + 1].toLowerCase())) {
    fail(`index.ts swatch must equal the tokens: ['${c.bg}', '${c.surface}', '${c.primary}']`);
  }
}

if (!existsSync(dir)) {
  console.error(`No such line: ${dir}`);
  process.exit(2);
}
const colours = readTokens();
if (colours) checkColours(colours);
if (!builtIn) checkFrame();
checkScene();
checkIndex(colours);
for (const name of ['index.ts', 'tokens.css', 'frame.css', 'scene.ts']) {
  const src = read(name);
  if (src && /\p{Extended_Pictographic}/u.test(src.replace(/[©®™]/g, ''))) fail(`${name} contains an emoji or pictograph`);
}

for (const n of notes) console.log(`note  ${n}`);
for (const f of fails) console.log(`FAIL  ${f}`);
console.log(fails.length ? `\n${id}: ${fails.length} problem${fails.length === 1 ? '' : 's'}` : `\n${id}: passes the contract`);
process.exit(fails.length ? 1 : 0);
