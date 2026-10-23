// Draws the app icon (a gold d20 outline on the sheet's dark ground) as PNGs, no dependencies.
// Run with `npm run icons`; output goes to public/icons/.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [0x10, 0x13, 0x18];
const FG = [0xe3, 0xb2, 0x60];

function segments(n) {
  const cx = n / 2, cy = n / 2, r = n * 0.36;
  const hex = [...Array(6)].map((_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 3;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
  const A = [cx, cy - 0.3 * r], B = [cx - 0.55 * r, cy + 0.35 * r], C = [cx + 0.55 * r, cy + 0.35 * r];
  const segs = hex.map((p, i) => [p, hex[(i + 1) % 6]]);
  segs.push([A, B], [B, C], [C, A]);
  segs.push([A, hex[0]], [A, hex[1]], [A, hex[5]], [B, hex[5]], [B, hex[4]], [B, hex[3]], [C, hex[1]], [C, hex[2]], [C, hex[3]]);
  return segs;
}

function distToSeg(px, py, [[x1, y1], [x2, y2]]) {
  const dx = x2 - x1, dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function render(n) {
  const segs = segments(n), half = (n * 0.035) / 2, ss = 4;
  const rows = [];
  for (let y = 0; y < n; y++) {
    const row = Buffer.alloc(1 + n * 4);
    for (let x = 0; x < n; x++) {
      let hit = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const px = x + (sx + 0.5) / ss, py = y + (sy + 0.5) / ss;
          if (segs.some((s) => distToSeg(px, py, s) <= half)) hit++;
        }
      }
      const a = hit / (ss * ss);
      for (let k = 0; k < 3; k++) row[1 + x * 4 + k] = Math.round(BG[k] + (FG[k] - BG[k]) * a);
      row[1 + x * 4 + 3] = 255;
    }
    rows.push(row);
  }
  return png(n, Buffer.concat(rows));
}

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(n, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(n, 0); ihdr.writeUInt32BE(n, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))
  ]);
}

const out = new URL('../public/icons/', import.meta.url);
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(new URL(name, out), render(size));
  console.log('wrote public/icons/' + name);
}
