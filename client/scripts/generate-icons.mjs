/**
 * Generates the PWA icons into public/.
 *
 * Writes PNGs by hand (zlib + CRC32) rather than pulling in a rasteriser:
 * the mark is simple geometry, and this keeps the client dependency-free.
 * Re-run with `npm run icons` after changing the colours or the shape.
 *
 * The mark: a gold shield on the app's near-black ground, with a chevron
 * notched out of it — a quest marker, in the Guild's palette.
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const BG = [18, 17, 16]; // --color-bg
const GOLD = [236, 131, 90]; // --color-gold
const GOLD_DEEP = [201, 101, 63]; // --color-gold-d

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** rgba(x, y) -> [r, g, b, a]; writes a non-interlaced 8-bit RGBA PNG. */
function writePng(path, size, rgba) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = rgba(x, y);
      raw[p++] = r;
      raw[p++] = g;
      raw[p++] = b;
      raw[p++] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  writeFileSync(
    path,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

/**
 * Signed-ish coverage of the shield at normalised (u, v), both in [-1, 1].
 * Straight shoulders down to mid-height, then tapering to a point.
 */
function shieldCoverage(u, v, scale) {
  const w = 0.78 * scale;
  const top = -0.86 * scale;
  const bottom = 0.92 * scale;
  if (v < top || v > bottom) return 0;
  const shoulder = 0.15 * scale;
  // Half-width at this height: full until the shoulder, then a smooth taper.
  const t = v <= shoulder ? 0 : (v - shoulder) / (bottom - shoulder);
  const halfWidth = w * Math.sqrt(Math.max(0, 1 - t * t));
  const d = Math.abs(u) - halfWidth;
  return d <= 0 ? 1 : 0;
}

/** The notched chevron: two bands pointing up, cut out of the shield. */
function inChevron(u, v, scale) {
  const band = 0.17 * scale;
  const apex = -0.18 * scale;
  const arm = Math.abs(u) * 0.9 + apex;
  return v > arm && v < arm + band;
}

function icon(size, padding) {
  const half = size / 2;
  const scale = 1 - padding;
  return (x, y) => {
    // Sample 2x2 for cheap antialiasing.
    let cov = 0;
    let chev = 0;
    for (const [dx, dy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
      const u = (x + dx - half) / half;
      const v = (y + dy - half) / half;
      const c = shieldCoverage(u, v, scale);
      cov += c;
      if (c && inChevron(u, v, scale)) chev += 1;
    }
    cov /= 4;
    chev /= 4;
    if (cov === 0) return [...BG, 255];
    // Vertical gradient down the shield, chevron punched back to the ground.
    const grad = mix(GOLD, GOLD_DEEP, Math.min(1, Math.max(0, y / size)));
    const face = mix(grad, BG, chev);
    return [...mix(BG, face, cov), 255];
  };
}

/** rgb(x, y) -> [r, g, b]; encodes a non-interlaced 8-bit RGB (colour type 2) PNG, no alpha. */
function encodePngRgb(size, rgb) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b] = rgb(x, y);
      raw[p++] = r;
      raw[p++] = g;
      raw[p++] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * The mark on a flat ground, opaque, for iOS. Same geometry and colours as
 * icon(), but supersampled n x n, with the gradient run over the shield's own
 * height (so a small mark still shows the whole gold -> deep gold sweep).
 */
function iosMark(size, scale, bg, n) {
  const half = size / 2;
  const yTop = half + -0.86 * scale * half;
  const yBot = half + 0.92 * scale * half;
  const xMax = half + 0.78 * scale * half;
  const xMin = half - 0.78 * scale * half;
  return (x, y) => {
    // Outside the mark's bounding box (with a margin) it is all ground.
    if (y < yTop - 2 || y > yBot + 2 || x < xMin - 2 || x > xMax + 2) return bg;
    let cov = 0;
    let chev = 0;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const u = (x + (i + 0.5) / n - half) / half;
        const v = (y + (j + 0.5) / n - half) / half;
        const c = shieldCoverage(u, v, scale);
        cov += c;
        if (c && inChevron(u, v, scale)) chev += 1;
      }
    }
    cov /= n * n;
    chev /= n * n;
    if (cov === 0) return bg;
    const grad = mix(GOLD, GOLD_DEEP, Math.min(1, Math.max(0, (y - yTop) / (yBot - yTop))));
    return mix(bg, mix(grad, bg, chev), cov);
  };
}

mkdirSync(OUT, { recursive: true });
// Plain icons keep a small margin; maskable needs ~20% safe padding because
// Android crops it to whatever shape the launcher uses.
writePng(join(OUT, 'icon-192.png'), 192, icon(192, 0.12));
writePng(join(OUT, 'icon-512.png'), 512, icon(512, 0.12));
writePng(join(OUT, 'icon-maskable-512.png'), 512, icon(512, 0.34));
writePng(join(OUT, 'apple-touch-icon.png'), 180, icon(180, 0.14));
console.log('wrote icon-192, icon-512, icon-maskable-512, apple-touch-icon into public/');

// ---- iOS (Capacitor shell): app icon and launch image -------------------
// Names and folders are the ones Capacitor's Contents.json files already name.
const IOS_ASSETS = join(dirname(fileURLToPath(import.meta.url)), '..', 'ios', 'App', 'App', 'Assets.xcassets');
const SPLASH_BG = [6, 8, 26]; // #06081A, the theme-color / first paint

// App icon: 1024 square, no alpha, no rounded corners (iOS masks it). Shield
// height is 0.89 * scale of the square, so scale 0.75 keeps it ~67% inside.
const appIconDir = join(IOS_ASSETS, 'AppIcon.appiconset');
mkdirSync(appIconDir, { recursive: true });
writeFileSync(join(appIconDir, 'AppIcon-512@2x.png'), encodePngRgb(1024, iosMark(1024, 0.75, BG, 4)));

// Launch image: #06081A with the mark about 360px wide (width = 0.78 * scale
// of the square), the same file three times (1x, 2x, 3x slots).
const SPLASH = 2732;
const splashDir = join(IOS_ASSETS, 'Splash.imageset');
mkdirSync(splashDir, { recursive: true });
const splashPng = encodePngRgb(SPLASH, iosMark(SPLASH, 360 / (0.78 * SPLASH), SPLASH_BG, 4));
for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  writeFileSync(join(splashDir, name), splashPng);
}
console.log('wrote AppIcon-512@2x and 3 launch images into ios/App/App/Assets.xcassets/');
