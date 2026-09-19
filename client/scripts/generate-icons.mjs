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

mkdirSync(OUT, { recursive: true });
// Plain icons keep a small margin; maskable needs ~20% safe padding because
// Android crops it to whatever shape the launcher uses.
writePng(join(OUT, 'icon-192.png'), 192, icon(192, 0.12));
writePng(join(OUT, 'icon-512.png'), 512, icon(512, 0.12));
writePng(join(OUT, 'icon-maskable-512.png'), 512, icon(512, 0.34));
writePng(join(OUT, 'apple-touch-icon.png'), 180, icon(180, 0.14));
console.log('wrote icon-192, icon-512, icon-maskable-512, apple-touch-icon into public/');
