// Draws the PhoneMail logo into PNG app icons (for the PWA and the home screen).
// Pure Node, no image libraries: the logo is simple shapes, so we test each
// pixel against them (with 4×4 supersampling for smooth edges).
//
//   node scripts/make-icons.mjs      → apps/web/public/icons/*.png
import { mkdirSync, writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';

const BRAND = [0, 128, 105];
const WHITE = [255, 255, 255];
const OUT = new URL('../apps/web/public/icons/', import.meta.url);

// ---- the logo, in its 48×48 design grid (same shapes as Logo.tsx) ----
function inRoundedRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const dx = Math.max(x0 + r - x, 0, x - (x1 - r));
  const dy = Math.max(y0 + r - y, 0, y - (y1 - r));
  return dx * dx + dy * dy <= r * r;
}
function inTriangle(x, y, [ax, ay], [bx, by], [cx, cy]) {
  const s = (px, py, qx, qy, rx, ry) => (px - rx) * (qy - ry) - (qx - rx) * (py - ry);
  const d1 = s(x, y, ax, ay, bx, by);
  const d2 = s(x, y, bx, by, cx, cy);
  const d3 = s(x, y, cx, cy, ax, ay);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}
function distToSegment(x, y, [ax, ay], [bx, by]) {
  const t = Math.max(
    0,
    Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)),
  );
  return Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay)));
}
const inBubble = (x, y) =>
  inRoundedRect(x, y, 4, 8, 44, 36, 5) || inTriangle(x, y, [12, 35], [21, 35], [12, 43]);
const inFlap = (x, y) =>
  Math.min(
    distToSegment(x, y, [10.5, 14.5], [24, 24.5]),
    distToSegment(x, y, [24, 24.5], [37.5, 14.5]),
  ) <= 1.6;

/**
 * background: 'rounded' (app icon) or 'square' (maskable / Apple, which round it themselves).
 * logoScale: share of the icon the logo's width takes.
 */
function render(size, { background, logoScale }) {
  const pixels = Buffer.alloc(size * size * 4);
  const s = (size * logoScale) / 40; // the bubble is 40 units wide
  const ox = size / 2 - 24 * s;
  const oy = size / 2 - 25.5 * s;
  const radius = size * 0.22;
  const N = 4;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      for (let sy = 0; sy < N; sy++) {
        for (let sx = 0; sx < N; sx++) {
          const x = px + (sx + 0.5) / N;
          const y = py + (sy + 0.5) / N;
          const inBackground =
            background === 'square' ||
            (background === 'rounded' && inRoundedRect(x, y, 0, 0, size, size, radius));
          const lx = (x - ox) / s;
          const ly = (y - oy) / s;
          // White bubble with a green flap, on a green background.
          let color = null;
          if (inBubble(lx, ly)) color = inFlap(lx, ly) ? BRAND : WHITE;
          else if (inBackground) color = BRAND;
          if (color) {
            r += color[0];
            g += color[1];
            b += color[2];
            a += 255;
          }
        }
      }
      const i = (py * size + px) * 4;
      const n = N * N;
      const coverage = a / 255;
      pixels[i] = coverage ? Math.round(r / coverage) : 0;
      pixels[i + 1] = coverage ? Math.round(g / coverage) : 0;
      pixels[i + 2] = coverage ? Math.round(b / coverage) : 0;
      pixels[i + 3] = Math.round(a / n);
    }
  }
  return encodePng(size, pixels);
}

function encodePng(size, rgba) {
  const rows = [];
  for (let y = 0; y < size; y++) {
    rows.push(Buffer.from([0]), rgba.subarray(y * size * 4, (y + 1) * size * 4));
  }
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
const icons = {
  'icon-192.png': render(192, { background: 'rounded', logoScale: 0.62 }),
  'icon-512.png': render(512, { background: 'rounded', logoScale: 0.62 }),
  // Android crops maskable icons to a circle or squircle: keep the logo in the middle 60%.
  'maskable-512.png': render(512, { background: 'square', logoScale: 0.5 }),
  'apple-touch-icon.png': render(180, { background: 'square', logoScale: 0.6 }),
};
for (const [name, png] of Object.entries(icons)) {
  writeFileSync(new URL(name, OUT), png);
  console.log(`${name}: ${png.length} bytes`);
}
