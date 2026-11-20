/**
 * Copy the App Store screenshots that the simulator walk took into the
 * listing, as App Store Connect wants them: RGB, no alpha channel.
 *
 *   git fetch origin ci-shots
 *   git archive origin/ci-shots store | tar -x -C <a folder>
 *   node scripts/store-from-walk.mjs <a folder>/store
 *
 * The walk (client/ios/ci/walk-screens.sh) writes seven full-size pictures to
 * the ci-shots branch under store/: 1320 x 2868, the iPhone 6.9-inch size,
 * with the simulator's real status bar. The simulator saves them as RGBA;
 * App Store Connect can refuse a screenshot with an alpha channel, so each is
 * written again as RGB. A picture whose alpha is not fully opaque anywhere is
 * refused here rather than guessed at.
 *
 * Writes into client/ios/App/fastlane/screenshots/en-US/, replacing files of
 * the same name. No dependencies: a small PNG reader and writer below.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../ios/App/fastlane/screenshots/en-US');
const EXPECT = { width: 1320, height: 2868 };

const src = process.argv[2];
if (!src) {
  console.error('usage: node scripts/store-from-walk.mjs <folder with the walk\'s store/*.png>');
  process.exit(2);
}

function readPng(buf) {
  let pos = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
      if (data[8] !== 8 || data[12] !== 0) throw new Error('only 8-bit, non-interlaced PNGs are handled');
    }
    if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!bpp) throw new Error(`colour type ${colorType} is not RGB or RGBA`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const px = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = px.subarray(y * stride, (y + 1) * stride);
    const prev = y ? px.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[i - bpp] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[i] = v & 255;
    }
  }
  return { width, height, bpp, px };
}

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b) => {
  let c = 0xffffffff;
  for (const v of b) c = CRC[(c ^ v) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
};

function writeRgbPng({ width, height, bpp, px }) {
  const stride = width * 3;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    const row = y * (stride + 1);
    raw[row] = 0; // no filter
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * bpp;
      const d = row + 1 + x * 3;
      raw[d] = px[s];
      raw[d + 1] = px[s + 1];
      raw[d + 2] = px[s + 2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const files = readdirSync(src).filter((f) => /^\d\d_.+\.png$/.test(f)).sort();
if (!files.length) {
  console.error(`no NN_name.png pictures in ${src}`);
  process.exit(1);
}
let failed = 0;
for (const f of files) {
  try {
    const img = readPng(readFileSync(join(src, f)));
    if (img.width !== EXPECT.width || img.height !== EXPECT.height) {
      throw new Error(`${img.width} x ${img.height}, expected ${EXPECT.width} x ${EXPECT.height}`);
    }
    if (img.bpp === 4) {
      for (let i = 3; i < img.px.length; i += 4) {
        if (img.px[i] !== 255) throw new Error('has see-through pixels; not flattened on a guess');
      }
    }
    const out = writeRgbPng(img);
    writeFileSync(join(OUT, f), out);
    console.log(`ok   ${f}  ${img.width} x ${img.height}, RGB, ${Math.round(out.length / 1024)} KB`);
  } catch (e) {
    failed += 1;
    console.log(`FAIL ${f}: ${e.message}`);
  }
}
console.log(`\n${OUT}`);
process.exit(failed ? 1 : 0);
