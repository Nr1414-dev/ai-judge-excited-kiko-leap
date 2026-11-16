// Kiko leaps the night market — a deterministic 1024x1024 PNG drawn pixel by pixel.
// Node 22, standard library only (node:fs, node:path, node:zlib). No network, no clock,
// no randomness: every dot of light comes from a fixed seed, so two runs are byte-identical.
//
// The scene: a small blue steam train, Kiko, leaps diagonally over a broken gap in the
// railway high above a night market — golden comet sparks streaming behind him, a huge
// glowing full moon, a ferris-wheel silhouette, lantern strings, and a smoke spiral
// curling up from his chimney and dissolving into stars.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

const W = 1024;
const H = 1024;
const SEED = 20261117;

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32) — the only source of "randomness" in the program.
// ---------------------------------------------------------------------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(SEED);

// ---------------------------------------------------------------------------
// Pixel buffer + drawing helpers (RGB, 0..255)
// ---------------------------------------------------------------------------
const img = new Uint8Array(W * H * 3);

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function setPx(x: number, y: number, r: number, g: number, b: number): void {
  const xi = x | 0;
  const yi = y | 0;
  if (xi < 0 || yi < 0 || xi >= W || yi >= H) return;
  const i = (yi * W + xi) * 3;
  img[i] = clamp255(r);
  img[i + 1] = clamp255(g);
  img[i + 2] = clamp255(b);
}

// Alpha-blend a colour over the pixel (a in 0..1).
function blendPx(x: number, y: number, r: number, g: number, b: number, a: number): void {
  const xi = x | 0;
  const yi = y | 0;
  if (xi < 0 || yi < 0 || xi >= W || yi >= H || a <= 0) return;
  if (a >= 1) {
    setPx(xi, yi, r, g, b);
    return;
  }
  const i = (yi * W + xi) * 3;
  img[i] = clamp255(img[i] + (r - img[i]) * a);
  img[i + 1] = clamp255(img[i + 1] + (g - img[i + 1]) * a);
  img[i + 2] = clamp255(img[i + 2] + (b - img[i + 2]) * a);
}

type RGB = [number, number, number];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpColor(c1: RGB, c2: RGB, t: number): RGB {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

function smooth(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

// Filled disc with a 1px soft edge.
function disc(cx: number, cy: number, r: number, c: RGB, a = 1): void {
  const x0 = Math.max(0, Math.floor(cx - r - 1));
  const x1 = Math.min(W - 1, Math.ceil(cx + r + 1));
  const y0 = Math.max(0, Math.floor(cy - r - 1));
  const y1 = Math.min(H - 1, Math.ceil(cy + r + 1));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d <= r) blendPx(x, y, c[0], c[1], c[2], a);
      else if (d <= r + 1) blendPx(x, y, c[0], c[1], c[2], a * (r + 1 - d));
    }
  }
}

// Soft radial glow: brightness falls off as 1/(1+d^2/k).
function glow(cx: number, cy: number, radius: number, c: RGB, peak: number): void {
  const x0 = Math.max(0, Math.floor(cx - radius));
  const x1 = Math.min(W - 1, Math.ceil(cx + radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const y1 = Math.min(H - 1, Math.ceil(cy + radius));
  const k = radius * radius * 0.18;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d2 = (dx * dx + dy * dy) / (radius * radius);
      if (d2 >= 1) continue;
      const edge = (1 - d2) * (1 - d2); // fade to exactly 0 at the edge: no square seam
      const a = (peak / (1 + (dx * dx + dy * dy) / k)) * edge;
      if (a > 0.004) blendPx(x, y, c[0], c[1], c[2], Math.min(1, a));
    }
  }
}

// Thick line segment (round caps) via distance to segment.
function thickLine(
  x0: number, y0: number, x1: number, y1: number,
  w: number, c: RGB, a = 1,
): void {
  const r = w / 2;
  const minX = Math.max(0, Math.floor(Math.min(x0, x1) - r - 1));
  const maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1) + r + 1));
  const minY = Math.max(0, Math.floor(Math.min(y0, y1) - r - 1));
  const maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1) + r + 1));
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy || 1;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      let t = ((x + 0.5 - x0) * dx + (y + 0.5 - y0) * dy) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = x0 + t * dx;
      const py = y0 + t * dy;
      const d = Math.hypot(x + 0.5 - px, y + 0.5 - py);
      if (d <= r) blendPx(x, y, c[0], c[1], c[2], a);
      else if (d <= r + 1) blendPx(x, y, c[0], c[1], c[2], a * (r + 1 - d));
    }
  }
}

// Filled polygon (scanline).
function poly(points: Array<[number, number]>, c: RGB, a = 1): void {
  let minY = H;
  let maxY = 0;
  for (const [, y] of points) {
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(H - 1, Math.ceil(maxY));
  for (let y = y0; y <= y1; y++) {
    const ys = y + 0.5;
    const xs: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const [x1, y1p] = points[i];
      const [x2, y2p] = points[(i + 1) % points.length];
      if ((y1p <= ys && y2p > ys) || (y2p <= ys && y1p > ys)) {
        xs.push(x1 + ((ys - y1p) * (x2 - x1)) / (y2p - y1p));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, Math.ceil(xs[k]));
      const xb = Math.min(W - 1, Math.floor(xs[k + 1]));
      for (let x = xa; x <= xb; x++) blendPx(x, y, c[0], c[1], c[2], a);
    }
  }
}

// Rounded rectangle: body + four corner discs.
function rrect(x: number, y: number, w: number, h: number, r: number, c: RGB, a = 1): void {
  const x0 = Math.max(0, Math.floor(x));
  const x1 = Math.min(W - 1, Math.ceil(x + w));
  const y0 = Math.max(0, Math.floor(y));
  const y1 = Math.min(H - 1, Math.ceil(y + h));
  for (let yy = y0; yy <= y1; yy++) {
    for (let xx = x0; xx <= x1; xx++) {
      const cx = Math.min(Math.max(xx + 0.5, x + r), x + w - r);
      const cy = Math.min(Math.max(yy + 0.5, y + r), y + h - r);
      if (Math.hypot(xx + 0.5 - cx, yy + 0.5 - cy) <= r) blendPx(xx, yy, c[0], c[1], c[2], a);
    }
  }
}

// Four-point sparkle star.
function sparkle(cx: number, cy: number, r: number, c: RGB, a = 1): void {
  thickLine(cx - r, cy, cx + r, cy, Math.max(1.5, r * 0.16), c, a);
  thickLine(cx, cy - r, cx, cy + r, Math.max(1.5, r * 0.16), c, a);
  disc(cx, cy, r * 0.22, c, a);
}

// Ellipse (axis-aligned) via scaled disc test.
function ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB, a = 1): void {
  const x0 = Math.max(0, Math.floor(cx - rx - 1));
  const x1 = Math.min(W - 1, Math.ceil(cx + rx + 1));
  const y0 = Math.max(0, Math.floor(cy - ry - 1));
  const y1 = Math.min(H - 1, Math.ceil(cy + ry + 1));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
      if (d <= 1) blendPx(x, y, c[0], c[1], c[2], a);
    }
  }
}

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------
const SKY_TOP: RGB = [9, 12, 42];
const SKY_MID: RGB = [38, 24, 84];
const SKY_LOW: RGB = [122, 46, 92];
const MOON: RGB = [255, 244, 214];
const MOON_GLOW: RGB = [255, 226, 160];
const GOLD: RGB = [255, 196, 66];
const GOLD_HOT: RGB = [255, 226, 130];
const SPARK: RGB = [255, 214, 110];
const TRAIN_BLUE: RGB = [52, 128, 220];
const TRAIN_BLUE_DARK: RGB = [28, 72, 160];
const TRAIN_RED: RGB = [226, 62, 62];
const CREAM: RGB = [255, 238, 200];
const SILHOUETTE: RGB = [16, 14, 44];
const SILHOUETTE_2: RGB = [22, 20, 58];
const WARM_WINDOW: RGB = [255, 190, 90];
const TRACK_STEEL: RGB = [168, 178, 205];
const TRACK_DARK: RGB = [74, 72, 104];

// ---------------------------------------------------------------------------
// 1. Night sky: vertical gradient + faint horizontal dusk bands
// ---------------------------------------------------------------------------
for (let y = 0; y < H; y++) {
  const t = y / (H - 1);
  let c: RGB;
  if (t < 0.55) c = lerpColor(SKY_TOP, SKY_MID, smooth(t / 0.55));
  else c = lerpColor(SKY_MID, SKY_LOW, smooth((t - 0.55) / 0.45));
  // A whisper of warm dusk hugging the horizon.
  const dusk = Math.exp(-Math.pow((y - 640) / 130, 2)) * 0.35;
  const r = lerp(c[0], 214, dusk * 0.45);
  const g = lerp(c[1], 96, dusk * 0.35);
  const b = lerp(c[2], 110, dusk * 0.25);
  for (let x = 0; x < W; x++) setPx(x, y, r, g, b);
}

// ---------------------------------------------------------------------------
// 2. Stars (seeded), kept out of the moon's face
// ---------------------------------------------------------------------------
const MOON_X = 772;
const MOON_Y = 196;
const MOON_R = 118;
for (let i = 0; i < 240; i++) {
  const x = rnd() * W;
  const y = rnd() * 560;
  const dMoon = Math.hypot(x - MOON_X, y - MOON_Y);
  if (dMoon < MOON_R + 26) continue;
  const bright = 0.35 + rnd() * 0.65;
  const warm = rnd() < 0.25;
  const c: RGB = warm ? [255, 226, 170] : [226, 236, 255];
  const s = rnd();
  if (s < 0.12) {
    sparkle(x, y, 5 + rnd() * 5, c, bright);
  } else if (s < 0.5) {
    disc(x, y, 1.6, c, bright);
    glow(x, y, 7, c, 0.25 * bright);
  } else {
    disc(x, y, 1.1, c, bright * 0.8);
  }
}

// ---------------------------------------------------------------------------
// 3. The huge glowing full moon
// ---------------------------------------------------------------------------
glow(MOON_X, MOON_Y, 320, MOON_GLOW, 0.55);
glow(MOON_X, MOON_Y, 190, MOON, 0.75);
disc(MOON_X, MOON_Y, MOON_R, MOON);
// Soft shading: moon slightly darker toward its lower-left limb.
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const d = Math.hypot(x + 0.5 - MOON_X, y + 0.5 - MOON_Y);
    if (d < MOON_R) {
      const shade = 0.1 * smooth((x - (MOON_X - MOON_R)) / (2 * MOON_R));
      blendPx(x, y, 190, 190, 220, shade * 0.35);
    }
  }
}
// Craters (seeded, inside the disc).
for (let i = 0; i < 9; i++) {
  const ang = rnd() * Math.PI * 2;
  const dist = rnd() * MOON_R * 0.62;
  const cx = MOON_X + Math.cos(ang) * dist;
  const cy = MOON_Y + Math.sin(ang) * dist;
  const cr = 7 + rnd() * 15;
  disc(cx, cy, cr, [214, 206, 188], 0.5);
  disc(cx - cr * 0.25, cy - cr * 0.25, cr * 0.55, [232, 224, 204], 0.45);
}

// ---------------------------------------------------------------------------
// 4. Ferris-wheel silhouette on the left, cabins lit warm
// ---------------------------------------------------------------------------
const FW_X = 185;
const FW_Y = 330;
const FW_R = 148;
glow(FW_X, FW_Y, FW_R + 40, [120, 90, 200], 0.12);
// Support legs.
thickLine(FW_X - 52, FW_Y + FW_R + 210, FW_X, FW_Y + 18, 13, SILHOUETTE);
thickLine(FW_X + 52, FW_Y + FW_R + 210, FW_X, FW_Y + 18, 13, SILHOUETTE);
// Rim (double ring) + spokes.
for (let i = 0; i < 12; i++) {
  const a = (i / 12) * Math.PI * 2;
  thickLine(
    FW_X, FW_Y,
    FW_X + Math.cos(a) * FW_R, FW_Y + Math.sin(a) * FW_R,
    5, SILHOUETTE_2,
  );
}
disc(FW_X, FW_Y, FW_R + 7, SILHOUETTE, 1);
disc(FW_X, FW_Y, FW_R - 9, SKY_MID, 1); // punch the sky back through the ring
// Spokes again, on top of the punched-through interior, so the wheel reads.
for (let i = 0; i < 12; i++) {
  const a = (i / 12) * Math.PI * 2;
  thickLine(
    FW_X, FW_Y,
    FW_X + Math.cos(a) * (FW_R - 9), FW_Y + Math.sin(a) * (FW_R - 9),
    5, SILHOUETTE_2,
  );
}
disc(FW_X, FW_Y, 16, SILHOUETTE);
// Cabins: warm glowing gondolas around the rim.
for (let i = 0; i < 12; i++) {
  const a = (i / 12) * Math.PI * 2 + 0.13;
  const cx = FW_X + Math.cos(a) * FW_R;
  const cy = FW_Y + Math.sin(a) * FW_R;
  glow(cx, cy, 22, WARM_WINDOW, 0.5);
  rrect(cx - 11, cy - 8, 22, 17, 5, [255, 176, 80], 0.95);
  rrect(cx - 7, cy - 4, 14, 9, 3, [255, 226, 150], 0.95);
}
disc(FW_X, FW_Y, 10, GOLD, 0.9);

// ---------------------------------------------------------------------------
// 5. Distant town skyline with lit windows
// ---------------------------------------------------------------------------
let skyX = -20;
while (skyX < W + 40) {
  const bw = 46 + rnd() * 70;
  const bh = 40 + rnd() * 95;
  const top = 648 - bh;
  poly(
    [[skyX, 660], [skyX, top], [skyX + bw * 0.5, top - 14 - rnd() * 22], [skyX + bw, top], [skyX + bw, 660]],
    SILHOUETTE_2,
  );
  // Windows.
  const cols = Math.floor(bw / 16);
  const rows = Math.floor(bh / 22);
  for (let cx = 0; cx < cols; cx++) {
    for (let cy = 0; cy < rows; cy++) {
      if (rnd() < 0.42) {
        const wx = skyX + 8 + cx * 16;
        const wy = top + 12 + cy * 22;
        const warm = rnd() < 0.7;
        disc(wx, wy, 2.4, warm ? WARM_WINDOW : [150, 220, 255], 0.85);
      }
    }
  }
  skyX += bw + 4 + rnd() * 14;
}

// ---------------------------------------------------------------------------
// 6. Night-market stalls + lantern strings
// ---------------------------------------------------------------------------
const STALL_COLORS: RGB[] = [
  [214, 58, 74],
  [28, 148, 132],
  [232, 138, 36],
  [178, 62, 150],
  [52, 120, 214],
];
for (let s = 0; s < 5; s++) {
  const x = 18 + s * 204 + (rnd() * 14 - 7);
  const awn = STALL_COLORS[s];
  // Stall body + counter.
  rrect(x, 742, 168, 118, 6, [30, 26, 64], 1);
  rrect(x + 6, 812, 156, 12, 4, [58, 40, 30], 1);
  // Striped awning.
  for (let stripe = 0; stripe < 6; stripe++) {
    const sx = x + stripe * 28;
    poly(
      [[sx, 742], [sx + 28, 742], [sx + 24, 706], [sx + 4, 706]],
      stripe % 2 === 0 ? awn : CREAM,
    );
  }
  rrect(x - 2, 700, 172, 9, 4, awn, 1);
  // Goods on the counter: glowing jars, fruit, toys.
  for (let g = 0; g < 7; g++) {
    const gx = x + 16 + g * 22 + rnd() * 6;
    const gy = 806 - rnd() * 8;
    const gc: RGB = rnd() < 0.5 ? [255, 176, 80] : rnd() < 0.5 ? [120, 220, 150] : [255, 120, 140];
    disc(gx, gy, 5 + rnd() * 3, gc, 0.95);
    glow(gx, gy, 12, gc, 0.3);
  }
  // Paper lantern hanging from the awning.
  const lx = x + 30 + rnd() * 108;
  thickLine(lx, 709, lx, 726, 2, [200, 200, 210], 0.9);
  glow(lx, 736, 26, [255, 120, 90], 0.55);
  ellipse(lx, 736, 11, 13, [255, 84, 66], 0.95);
  ellipse(lx, 736, 11, 13, [255, 150, 90], 0.25);
  rrect(lx - 5, 722, 10, 4, 2, GOLD, 0.95);
  rrect(lx - 5, 748, 10, 4, 2, GOLD, 0.95);
}
// Lantern strings swooping between tall poles above the stalls.
for (let span = 0; span < 3; span++) {
  const x0 = 30 + span * 330;
  const x1 = x0 + 330;
  const sag = 42 + rnd() * 18;
  thickLine(x0, 668, x0, 700, 7, [24, 20, 52], 1);
  thickLine(x1, 668, x1, 700, 7, [24, 20, 52], 1);
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const lx = lerp(x0, x1, t);
    const ly = 668 + Math.sin(t * Math.PI) * sag;
    if (i % 3 === 0) {
      const lc: RGB = i % 6 === 0 ? [255, 92, 80] : i % 6 === 3 ? [255, 196, 66] : [90, 220, 190];
      glow(lx, ly + 8, 16, lc, 0.5);
      disc(lx, ly + 8, 6, lc, 0.95);
    }
    if (i < 24) {
      const nx = lerp(x0, x1, (i + 1) / 24);
      const ny = 668 + Math.sin(((i + 1) / 24) * Math.PI) * sag;
      thickLine(lx, ly, nx, ny, 1.6, [90, 84, 120], 0.8);
    }
  }
}
// Tiny crowd dots with warm glow.
for (let i = 0; i < 46; i++) {
  const cx = 30 + rnd() * (W - 60);
  const cy = 872 + rnd() * 46;
  const cc: RGB = rnd() < 0.5 ? [255, 176, 90] : [140, 200, 255];
  disc(cx, cy, 3.4, [24, 22, 54], 1);
  disc(cx, cy - 6, 2.6, [255, 205, 170], 1);
  glow(cx, cy - 2, 10, cc, 0.22);
}

// ---------------------------------------------------------------------------
// 7. Foreground hill (dark) — the market sits on it
// ---------------------------------------------------------------------------
poly(
  [[0, 1024], [0, 930], [180, 898], [420, 916], [640, 890], [840, 912], [1024, 894], [1024, 1024]],
  [10, 9, 30],
);

// ---------------------------------------------------------------------------
// 8. Broken railway on a rising diagonal (left low -> right high)
//    Two steel rails + wooden ties; a jagged gap in the middle.
// ---------------------------------------------------------------------------
function railPoint(t: number): [number, number] {
  // Centreline of the track: gentle upward curve.
  const x = lerp(40, 990, t);
  const y = 788 - 330 * t - 26 * Math.sin(t * Math.PI);
  return [x, y];
}
function railNormal(t: number): [number, number] {
  const [x0, y0] = railPoint(Math.max(0, t - 0.004));
  const [x1, y1] = railPoint(Math.min(1, t + 0.004));
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  return [-dy / len, dx / len];
}
const GAP_A = 0.44;
const GAP_B = 0.60;
// Ties first (under the rails), skipping the gap.
for (let t = 0.02; t < 0.99; t += 0.016) {
  if (t > GAP_A - 0.01 && t < GAP_B + 0.01) continue;
  const [cx, cy] = railPoint(t);
  const [nx, ny] = railNormal(t);
  thickLine(cx - nx * 17, cy - ny * 17, cx + nx * 17, cy + ny * 17, 7, [52, 38, 30], 1);
}
// Rails: two parallel steel lines, broken at the gap with jagged ends.
for (const off of [-13, 13]) {
  for (const [ta, tb] of [[0.0, GAP_A], [GAP_B, 1.0]] as Array<[number, number]>) {
    let prev: [number, number] | null = null;
    for (let t = ta; t <= tb + 0.0001; t += 0.008) {
      const tt = Math.min(t, tb);
      const [cx, cy] = railPoint(tt);
      const [nx, ny] = railNormal(tt);
      const p: [number, number] = [cx + nx * off, cy + ny * off];
      if (prev) thickLine(prev[0], prev[1], p[0], p[1], 6, TRACK_STEEL, 1);
      prev = p;
    }
  }
  // Jagged torn ends at the gap.
  for (const [tg, dir] of [[GAP_A, -1], [GAP_B, 1]] as Array<[number, number]>) {
    const [cx, cy] = railPoint(tg);
    const [nx, ny] = railNormal(tg);
    const ex = cx + nx * off;
    const ey = cy + ny * off;
    for (let j = 0; j < 3; j++) {
      const jx = ex + dir * (4 + rnd() * 12);
      const jy = ey + (rnd() * 10 - 5);
      thickLine(ex, ey, jx, jy, 3, TRACK_DARK, 1);
    }
  }
}
// A few sparks + a falling rail fragment in the gap.
for (let i = 0; i < 12; i++) {
  const t = GAP_A + rnd() * (GAP_B - GAP_A);
  const [cx, cy] = railPoint(t);
  const sx = cx + (rnd() * 36 - 18);
  const sy = cy + 10 + rnd() * 42;
  glow(sx, sy, 12, SPARK, 0.6);
  disc(sx, sy, 2 + rnd() * 1.6, GOLD_HOT, 0.95);
}
poly([[498, 668], [516, 660], [522, 676], [504, 682]], TRACK_DARK);

// ---------------------------------------------------------------------------
// 9. Comet trail of golden sparks behind the leaping train
// ---------------------------------------------------------------------------
function trailPoint(t: number): [number, number] {
  // A long swooping curve from the train's tail down to the lower-left.
  const x = lerp(430, 90, t);
  const y = 560 + 170 * t * t + 26 * Math.sin(t * 9.2) * (1 - t);
  return [x, y];
}
for (let i = 0; i < 90; i++) {
  const t = i / 90;
  const [x, y] = trailPoint(t);
  const size = lerp(16, 2.5, t) * (0.7 + rnd() * 0.6);
  const a = lerp(0.95, 0.25, t);
  glow(x, y, size * 2.4, GOLD, a * 0.55);
  disc(x, y, size * 0.5, i % 3 === 0 ? GOLD_HOT : GOLD, a);
  if (i % 7 === 0) sparkle(x, y, size * 1.1, GOLD_HOT, a * 0.9);
}
// Bright comet head glow right behind the train.
glow(452, 566, 90, GOLD, 0.5);

// ---------------------------------------------------------------------------
// 10. Kiko — the little blue steam train, leaping nose-up over the gap
// ---------------------------------------------------------------------------
const KX = 540;
const KY = 512;
const ANG = -0.32; // radians, nose up to the right
const cosA = Math.cos(ANG);
const sinA = Math.sin(ANG);
function tp(lx: number, ly: number): [number, number] {
  return [KX + lx * cosA - ly * sinA, KY + lx * sinA + ly * cosA];
}
function tDisc(lx: number, ly: number, r: number, c: RGB, a = 1): void {
  const [x, y] = tp(lx, ly);
  disc(x, y, r, c, a);
}
function tLine(x0: number, y0: number, x1: number, y1: number, w: number, c: RGB, a = 1): void {
  const [ax, ay] = tp(x0, y0);
  const [bx, by] = tp(x1, y1);
  thickLine(ax, ay, bx, by, w, c, a);
}
function tPoly(points: Array<[number, number]>, c: RGB, a = 1): void {
  poly(points.map(([x, y]) => tp(x, y)), c, a);
}
function tRrect(x: number, y: number, w: number, h: number, r: number, c: RGB, a = 1): void {
  // Approximate a rotated rounded rect with its four corners + body polygon.
  const corners: Array<[number, number]> = [
    [x + r, y], [x + w - r, y], [x + w, y + r], [x + w, y + h - r],
    [x + w - r, y + h], [x + r, y + h], [x, y + h - r], [x, y + r],
  ];
  poly(corners.map(([px, py]) => tp(px, py)), c, a);
  for (const [cx, cy] of [[x + r, y + r], [x + w - r, y + r], [x + r, y + h - r], [x + w - r, y + h - r]] as Array<[number, number]>) {
    tDisc(cx, cy, r, c, a);
  }
}

// Headlamp beam cutting the dark ahead.
{
  const [bx, by] = tp(178, -8);
  const [tx, ty] = tp(420, -52);
  const [ux, uy] = tp(420, 36);
  poly([[bx, by], [tx, ty], [ux, uy]], [255, 240, 190], 0.16);
  glow(bx, by, 70, [255, 240, 190], 0.5);
}
// Chimney smoke is drawn after the body (step 11), so the body goes first.
// Boiler: long rounded body.
tRrect(-150, -52, 250, 84, 26, TRAIN_BLUE);
tRrect(-150, -52, 250, 84, 26, TRAIN_BLUE_DARK, 0.18);
// Red trim stripe along the boiler.
tLine(-146, 8, 96, 8, 10, TRAIN_RED);
// Brass dome + whistle on top.
tDisc(-52, -58, 17, GOLD);
tDisc(-52, -58, 10, GOLD_HOT);
tDisc(52, -56, 11, TRAIN_RED);
// Chimney (front-top is the right end? No — front is the right, chimney near front).
tPoly([[-118, -52], [-104, -52], [-100, -96], [-122, -96]], TRAIN_BLUE_DARK);
tRrect(-128, -104, 36, 12, 4, TRAIN_RED);
// Cabin at the rear (left end) with a warm window and the driver.
tRrect(-196, -92, 62, 124, 12, TRAIN_BLUE);
tRrect(-196, -92, 62, 14, 6, TRAIN_RED);
tRrect(-188, -78, 46, 44, 6, [20, 26, 52]);
tRrect(-182, -72, 34, 32, 4, WARM_WINDOW, 0.95);
// Driver: a small round head + cap in the window.
tDisc(-165, -52, 11, [255, 205, 170]);
tPoly([[-176, -60], [-154, -60], [-158, -70], [-172, -70]], TRAIN_RED);
// Cowcatcher (front wedge, right end).
tPoly([[100, 32], [168, 32], [168, 6], [128, -14]], TRAIN_RED);
tPoly([[100, 32], [168, 32], [150, 12]], [178, 40, 40]);
// Cheerful face on the boiler side near the front: two eyes side by side,
// a wide smile below, rosy cheeks.
tDisc(76, -30, 13, [255, 255, 255]);
tDisc(76, -30, 6, [20, 20, 30]);
tDisc(112, -30, 13, [255, 255, 255]);
tDisc(112, -30, 6, [20, 20, 30]);
// Smile: a wide arc under the eyes.
{
  const [sx, sy] = tp(76, -2);
  const [ex, ey] = tp(112, -2);
  const [mx, my] = tp(94, 16);
  thickLine(sx, sy, mx, my, 4, [20, 20, 30]);
  thickLine(mx, my, ex, ey, 4, [20, 20, 30]);
}
// Cheeks.
tDisc(64, -10, 7, [255, 130, 130], 0.55);
tDisc(124, -10, 7, [255, 130, 130], 0.55);
// Golden star badge on the boiler side.
{
  const [sx, sy] = tp(-30, -14);
  sparkle(sx, sy, 15, GOLD, 0.95);
  glow(sx, sy, 26, GOLD, 0.4);
}
// Headlamp on the boiler's top-front corner, clear of the face.
{
  const [hx, hy] = tp(100, -46);
  tDisc(100, -46, 12, GOLD_HOT);
  tDisc(100, -46, 7, [255, 255, 240]);
  glow(hx, hy, 46, GOLD_HOT, 0.55);
}
// Wheels: three big drivers + a small front wheel, with spokes, spinning free.
for (const [wx, wr] of [[-150, 26], [-84, 30], [-14, 30], [62, 22]] as Array<[number, number]>) {
  tDisc(wx, 44, wr, [24, 24, 36]);
  tDisc(wx, 44, wr - 5, TRAIN_RED);
  tDisc(wx, 44, wr - 11, [36, 36, 52]);
  const [cx, cy] = tp(wx, 44);
  for (let s = 0; s < 6; s++) {
    const a = (s / 6) * Math.PI * 2 + 0.35;
    thickLine(cx, cy, cx + Math.cos(a) * (wr - 12), cy + Math.sin(a) * (wr - 12), 4, [200, 200, 215], 0.9);
  }
  tDisc(wx, 44, 5, [220, 220, 230]);
}
// Coupling rod joining the drivers.
tLine(-150, 44, 62, 44, 7, [210, 210, 220]);
// Motion streaks under the train.
for (let i = 0; i < 5; i++) {
  const y = 96 + i * 12;
  tLine(-210 - i * 14, y, -120 - i * 8, y, 5, [255, 255, 255], 0.28 - i * 0.04);
}

// ---------------------------------------------------------------------------
// 11. Smoke spiral from the chimney, curling up and turning into stars
// ---------------------------------------------------------------------------
{
  const [sx0, sy0] = tp(-110, -104);
  for (let i = 0; i < 26; i++) {
    const t = i / 26;
    const spiral = Math.sin(t * 11) * (10 + t * 34);
    const x = sx0 - t * 150 + spiral * 0.4;
    const y = sy0 - t * 250 - t * t * 40 + spiral * 0.25;
    const r = 10 + t * 30;
    const a = 0.26 * (1 - t * 0.7);
    const shade: RGB = [228, 228, 240];
    disc(x, y, r, shade, a);
    disc(x - r * 0.3, y - r * 0.3, r * 0.55, [255, 255, 255], a * 0.5);
    if (i > 20 && i % 3 === 0) {
      sparkle(x + r * 0.7, y - r * 0.5, 5 + (i - 20) * 0.5, GOLD_HOT, 0.85);
    }
  }
}

// ---------------------------------------------------------------------------
// 12. Warm vignette + a final lift of the train's rim light
// ---------------------------------------------------------------------------
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const dx = (x + 0.5 - W / 2) / (W / 2);
    const dy = (y + 0.5 - H / 2) / (H / 2);
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > 0.82) blendPx(x, y, 4, 4, 18, (d - 0.82) * 0.9);
  }
}
// Golden rim light along the train's top edge.
tLine(-196, -92, 96, -52, 5, GOLD_HOT, 0.5);

// ---------------------------------------------------------------------------
// PNG encoder (hand-written): IHDR + IDAT (zlib) + IEND, CRC32 throughout.
// ---------------------------------------------------------------------------
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // colour type: RGB
ihdr[10] = 0; // compression
ihdr[11] = 0; // filter
ihdr[12] = 0; // interlace

// Raw scanlines, filter byte 0 (None) per row.
const raw = Buffer.alloc(H * (1 + W * 3));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 3)] = 0;
  raw.set(img.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
}
const idat = deflateSync(raw, { level: 9 });

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", idat),
  chunk("IEND", Buffer.alloc(0)),
]);

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "entry.png");
writeFileSync(outPath, png);
console.log(`wrote ${outPath} (${png.length} bytes, ${W}x${H})`);
