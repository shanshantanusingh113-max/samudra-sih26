/**
 * Decode a PNG to pixels, so a probe can measure a picture instead of a file.
 *
 * `CLAUDE.md` says it outright: **never diff PNG bytes for a magnitude.** A PNG is a zlib
 * stream, so changing a handful of pixels shifts every compressed byte after them and two frames
 * that differ in 0.5% of their pixels read as 99.4% different at the byte level. The same pair
 * read either way depending only on which was counted, and that is how a working render was
 * once reported as broken.
 *
 * There is no image dependency in this project and there does not need to be one: an 8-bit
 * non-interlaced PNG is four chunk headers, one inflate and one unfilter pass. Node ships the
 * inflate. Anything else - 16-bit, palette, interlaced - is refused rather than guessed at,
 * because a probe that silently decodes the wrong thing is worse than one that stops.
 */
import { inflateSync } from "node:zlib";

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** Bytes per pixel, per PNG colour type. */
const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 };

export function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error("not a PNG");

  let width = 0;
  let height = 0;
  let depth = 0;
  let colourType = 0;
  const idat = [];

  let offset = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      depth = body[8];
      colourType = body[9];
      if (depth !== 8) throw new Error(`unsupported bit depth ${depth}`);
      if (!(colourType in CHANNELS)) throw new Error(`unsupported colour type ${colourType}`);
      if (body[12] !== 0) throw new Error("interlaced PNGs are not supported");
    } else if (type === "IDAT") {
      idat.push(body);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }

  const channels = CHANNELS[colourType];
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);

  // Unfilter. Each scanline carries a one-byte filter type; `a` is the pixel to the left, `b`
  // the one above, `c` the one above-left, exactly as the specification names them.
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? out[y * stride + x - channels] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? out[(y - 1) * stride + x - channels] : 0;
      let value = line[x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) {
        throw new Error(`unknown filter ${filter} on row ${y}`);
      }
      out[y * stride + x] = value & 0xff;
    }
  }

  return { width, height, channels, data: out };
}

/**
 * How many pixels differ between two decoded frames, and by how much on average.
 *
 * `threshold` is the sum of the absolute channel differences a pixel has to clear before it
 * counts, which keeps dithering and the ray marcher's own jitter out of the number.
 */
export function comparePixels(one, two, threshold = 8) {
  if (one.width !== two.width || one.height !== two.height) {
    throw new Error("frames are different sizes");
  }
  const total = one.width * one.height;
  let count = 0;
  let sum = 0;
  for (let i = 0; i < total; i++) {
    const a = i * one.channels;
    const b = i * two.channels;
    const d =
      Math.abs(one.data[a] - two.data[b]) +
      Math.abs(one.data[a + 1] - two.data[b + 1]) +
      Math.abs(one.data[a + 2] - two.data[b + 2]);
    if (d > threshold) {
      count++;
      sum += d;
    }
  }
  return { count, total, share: count / total, meanDifference: count ? sum / count : 0 };
}
