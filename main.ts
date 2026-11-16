// Make the AI judge excited — ai-excited-01
// Kiko the little blue steam train LEAPS across a broken gap in the tracks,
// high above a night market, on a diagonal from lower-left to upper-right.
// A huge glowing full moon behind it, a giant ferris wheel below, lantern
// strings, and a comet trail of golden sparks. The train's smoke spirals
// up and turns into stars. No text anywhere.
//
// Node 22, standard library only (node:fs, node:path, node:zlib).
// Deterministic: fixed seed, fixed math, no clock, no network, no random.
// Writes /output/entry.png (or $MAKEFUN_OUTPUT_DIR/entry.png), 1024x1024.
// Run: mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const W = 1024;
const H = 1024;
const buf = new Uint8Array(W * H * 3);

// ---- deterministic PRNG (mulberry32, fixed seed) ----
let seed = 20261116;
function rnd(): number {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function rr(a: number, b: number): number { return a + rnd() * (b - a); }

// ---- pixel helpers ----
function px(x: number, y: number, r: number, g: number, b: number): void {
  const xi = x | 0; const yi = y | 0;
  if (xi < 0 || xi >= W || yi < 0 || yi >= H) return;
  const i = (yi * W + xi) * 3;
  buf[i] = r; buf[i + 1] = g; buf[i + 2] = b;
}
function blend(x: number, y: number, r: number, g: number, b: number, a: number): void {
  const xi = x | 0; const yi = y | 0;
  if (xi < 0 || xi >= W || yi < 0 || yi >= H || a <= 0) return;
  if (a >= 1) { px(xi, yi, r, g, b); return; }
  const i = (yi * W + xi) * 3;
  buf[i] = buf[i] + (r - buf[i]) * a;
  buf[i + 1] = buf[i + 1] + (g - buf[i + 1]) * a;
  buf[i + 2] = buf[i + 2] + (b - buf[i + 2]) * a;
}
function hline(y: number, x0: number, x1: number, r: number, g: number, b: number): void {
  const yi = y | 0;
  if (yi < 0 || yi >= H) return;
  let a = Math.max(0, Math.ceil(Math.min(x0, x1)));
  let c = Math.min(W - 1, Math.floor(Math.max(x0, x1)));
  for (let x = a; x <= c; x++) { const i = (yi * W + x) * 3; buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; }
}
function hlineA(y: number, x0: number, x1: number, r: number, g: number, b: number, a: number): void {
  const yi = y | 0;
  if (yi < 0 || yi >= H || a <= 0) return;
  let s = Math.max(0, Math.ceil(Math.min(x0, x1)));
  let e = Math.min(W - 1, Math.floor(Math.max(x0, x1)));
  for (let x = s; x <= e; x++) blend(x, yi, r, g, b, a);
}
function circle(cx: number, cy: number, rad: number, r: number, g: number, b: number): void {
  const R = Math.max(1, rad | 0);
  for (let dy = -R; dy <= R; dy++) {
    const dx = Math.floor(Math.sqrt(R * R - dy * dy));
    hline(cy + dy, cx - dx, cx + dx, r, g, b);
  }
}
function circleA(cx: number, cy: number, rad: number, r: number, g: number, b: number, a: number): void {
  const R = Math.max(1, rad | 0);
  for (let dy = -R; dy <= R; dy++) {
    const dx = Math.floor(Math.sqrt(R * R - dy * dy));
    hlineA(cy + dy, cx - dx, cx + dx, r, g, b, a);
  }
}
// soft glow: concentric discs, alpha falling with radius
function glow(cx: number, cy: number, rad: number, r: number, g: number, b: number, peak: number): void {
  const steps = 6;
  for (let s = steps; s >= 1; s--) {
    circleA(cx, cy, rad * s / steps, r, g, b, peak * (1 - s / (steps + 1)) * 0.55);
  }
}
function poly(pts: number[][], r: number, g: number, b: number): void {
  let ymin = H; let ymax = 0;
  for (const p of pts) { ymin = Math.min(ymin, p[1]); ymax = Math.max(ymax, p[1]); }
  for (let y = Math.max(0, Math.ceil(ymin)); y <= Math.min(H - 1, Math.floor(ymax)); y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]; const c = pts[(i + 1) % pts.length];
      if ((a[1] <= y && c[1] > y) || (c[1] <= y && a[1] > y)) {
        xs.push(a[0] + (y - a[1]) * (c[0] - a[0]) / (c[1] - a[1]));
      }
    }
    xs.sort((m, n) => m - n);
    for (let k = 0; k + 1 < xs.length; k += 2) hline(y, xs[k], xs[k + 1], r, g, b);
  }
}
function polyA(pts: number[][], r: number, g: number, b: number, a: number): void {
  let ymin = H; let ymax = 0;
  for (const p of pts) { ymin = Math.min(ymin, p[1]); ymax = Math.max(ymax, p[1]); }
  for (let y = Math.max(0, Math.ceil(ymin)); y <= Math.min(H - 1, Math.floor(ymax)); y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a2 = pts[i]; const c = pts[(i + 1) % pts.length];
      if ((a2[1] <= y && c[1] > y) || (c[1] <= y && a2[1] > y)) {
        xs.push(a2[0] + (y - a2[1]) * (c[0] - a2[0]) / (c[1] - a2[1]));
      }
    }
    xs.sort((m, n) => m - n);
    for (let k = 0; k + 1 < xs.length; k += 2) hlineA(y, xs[k], xs[k + 1], r, g, b, a);
  }
}
// thick line as a quad
function thickLine(x0: number, y0: number, x1: number, y1: number, w: number, r: number, g: number, b: number): void {
  const dx = x1 - x0; const dy = y1 - y0;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / len * w / 2; const ny = dx / len * w / 2;
  poly([[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]], r, g, b);
}
function star4(cx: number, cy: number, s: number, r: number, g: number, b: number, a: number): void {
  polyA([[cx, cy - s], [cx + s * 0.28, cy - s * 0.28], [cx + s, cy], [cx + s * 0.28, cy + s * 0.28], [cx, cy + s], [cx - s * 0.28, cy + s * 0.28], [cx - s, cy], [cx - s * 0.28, cy - s * 0.28]], r, g, b, a);
}

// ---- rotation helper for the leaping train (pivot + angle) ----
const PIVX = 560; const PIVY = 430;
const ANG = -0.48; const CA = Math.cos(ANG); const SA = Math.sin(ANG);
function rot(lx: number, ly: number): [number, number] {
  return [PIVX + lx * CA - ly * SA, PIVY + lx * SA + ly * CA];
}
function rcircle(lx: number, ly: number, rad: number, r: number, g: number, b: number): void {
  const p = rot(lx, ly); circle(p[0], p[1], rad, r, g, b);
}
function rcircleA(lx: number, ly: number, rad: number, r: number, g: number, b: number, a: number): void {
  const p = rot(lx, ly); circleA(p[0], p[1], rad, r, g, b, a);
}
function rpoly(local: number[][], r: number, g: number, b: number): void {
  poly(local.map((q) => rot(q[0], q[1])), r, g, b);
}
function rpolyA(local: number[][], r: number, g: number, b: number, a: number): void {
  polyA(local.map((q) => rot(q[0], q[1])), r, g, b, a);
}

// ================= SKY =================
for (let y = 0; y < H; y++) {
  const t = y / H;
  // deep indigo -> violet -> warm magenta glow near the horizon (y ~ 700)
  let r: number, g: number, b: number;
  if (t < 0.55) {
    const u = t / 0.55;
    r = 8 + 34 * u; g = 12 + 18 * u; b = 46 + 44 * u;
  } else if (t < 0.75) {
    const u = (t - 0.55) / 0.2;
    r = 42 + 58 * u; g = 30 + 22 * u; b = 90 + 10 * u;
  } else {
    const u = (t - 0.75) / 0.25;
    r = 100 - 55 * u; g = 52 - 22 * u; b = 100 - 55 * u;
  }
  for (let x = 0; x < W; x++) { const i = (y * W + x) * 3; buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; }
}

// stars (seeded, deterministic)
for (let i = 0; i < 260; i++) {
  const x = rr(0, W); const y = rr(0, 620); const s = rr(0.6, 2.2);
  const bright = rr(0.35, 1);
  if (rnd() < 0.14) star4(x, y, s * 4, 255, 240, 200, bright * 0.9);
  else circleA(x, y, s, 255, 244, 214, bright);
}
// a shooting star, top left
thickLine(90, 120, 210, 190, 3, 255, 230, 170);
glow(210, 190, 26, 255, 220, 140, 0.8);
circle(210, 190, 4, 255, 240, 190);

// ================= MOON (huge, upper right) =================
const MX = 722; const MY = 238; const MR = 196;
glow(MX, MY, 330, 255, 214, 130, 0.5);
glow(MX, MY, 250, 255, 228, 160, 0.7);
circle(MX, MY, MR, 255, 238, 196);
// craters (small, subtle — no big pale disc that reads as a second moon)
circle(MX - 55, MY - 45, 26, 233, 208, 158);
circle(MX + 48, MY + 30, 34, 233, 208, 158);
circle(MX + 70, MY - 80, 18, 236, 212, 162);
circle(MX - 10, MY + 88, 20, 236, 212, 162);
circle(MX + 110, MY - 10, 14, 238, 216, 168);
// bright rim on the moon's upper edge
for (let a = 0; a < 40; a++) {
  const th = Math.PI * (1.05 + a * 0.02);
  circle(MX + Math.cos(th) * MR * 0.98, MY + Math.sin(th) * MR * 0.98, 5, 255, 250, 225);
}

// ================= FERRIS WHEEL (giant silhouette, lower left) =================
const FX = 285; const FY = 800; const FR = 215;
circle(FX, FY, FR + 14, 16, 10, 40); // outer glow halo of the wheel silhouette
circle(FX, FY, FR, 13, 8, 34); // solid dark disc
// spokes (drawn AFTER the disc so they stay visible)
for (let k = 0; k < 8; k++) {
  const th = k * Math.PI / 4 + 0.2;
  thickLine(FX, FY, FX + Math.cos(th) * FR, FY + Math.sin(th) * FR, 7, 52, 34, 100);
}
// rim lights
for (let k = 0; k < 24; k++) {
  const th = k * Math.PI / 12;
  const x = FX + Math.cos(th) * FR; const y = FY + Math.sin(th) * FR;
  glow(x, y, 12, 255, 190, 80, 0.9);
  circle(x, y, 5, 255, 205, 100);
}
// gondolas hanging from the rim
for (let k = 0; k < 8; k++) {
  const th = k * Math.PI / 4 + 0.2;
  const x = FX + Math.cos(th) * (FR - 6); const y = FY + Math.sin(th) * (FR - 6) + 26;
  poly([[x - 16, y - 12], [x + 16, y - 12], [x + 12, y + 16], [x - 12, y + 16]], 255, 170, 60);
  circle(x, y - 2, 6, 255, 220, 130);
}
// hub + support legs
glow(FX, FY, 40, 255, 190, 90, 0.9);
circle(FX, FY, 22, 255, 205, 110);
circle(FX, FY, 10, 140, 60, 20);
thickLine(FX - 14, FY + 10, FX - 90, 1024, 14, 16, 10, 42);
thickLine(FX + 14, FY + 10, FX + 90, 1024, 14, 16, 10, 42);

// ================= NIGHT MARKET (bottom strip) =================
// distant rooftops
poly([[0, 1024], [0, 930], [120, 900], [210, 928], [330, 896], [470, 930], [560, 902], [700, 932], [830, 898], [940, 928], [1024, 906], [1024, 1024]], 12, 8, 32);
for (let i = 0; i < 46; i++) { // warm windows
  const x = rr(10, 1010); const y = rr(930, 1005);
  circle(x, y, rr(2, 4), 255, 190, 90);
}
// lantern strings sagging across the bottom
function lanternString(x0: number, y0: number, x1: number, y1: number, n: number): void {
  const sag = 46;
  let px0 = x0; let py0 = y0;
  for (let k = 1; k <= n; k++) {
    const t = k / n;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t + sag * 4 * t * (1 - t);
    thickLine(px0, py0, x, y, 2, 40, 20, 60);
    px0 = x; py0 = y;
    const red = rnd() < 0.55;
    glow(x, y + 12, 16, red ? 255 : 255, red ? 70 : 180, red ? 60 : 80, 0.8);
    // lantern: round body with ribs
    circle(x, y + 12, 11, red ? 235 : 255, red ? 60 : 170, red ? 45 : 60);
    circle(x, y + 12, 6, red ? 255 : 255, red ? 120 : 210, red ? 90 : 110);
    poly([[x - 4, y + 1], [x + 4, y + 1], [x + 3, y + 5], [x - 3, y + 5]], 255, 210, 90);
    poly([[x - 3, y + 22], [x + 3, y + 22], [x + 2, y + 26], [x - 2, y + 26]], 255, 210, 90);
  }
  thickLine(px0, py0, x1, y1, 2, 40, 20, 60);
}
lanternString(0, 872, 512, 852, 9);
lanternString(512, 852, 1024, 878, 9);
lanternString(60, 950, 500, 936, 7);
lanternString(560, 940, 1000, 958, 7);
// market stalls, lower right — warm awnings so the corner is not empty night
for (const sx of [640, 790, 920]) {
  poly([[sx - 62, 962], [sx + 62, 962], [sx + 52, 1000], [sx - 52, 1000]], 30, 16, 58);
  poly([[sx - 66, 962], [sx + 66, 962], [sx + 58, 930], [sx - 58, 930]], 200, 60, 50);
  poly([[sx - 66, 930], [sx - 22, 930], [sx - 22, 962], [sx - 66, 962]], 255, 180, 80);
  poly([[sx + 22, 930], [sx + 66, 930], [sx + 66, 962], [sx + 22, 962]], 255, 180, 80);
  glow(sx, 975, 26, 255, 190, 100, 0.8);
  circle(sx, 975, 7, 255, 215, 120);
}
// faint diagonal speed streaks in the open sky, right side
for (let i = 0; i < 10; i++) {
  const x = rr(620, 980); const y = rr(420, 700);
  hlineA(y | 0, x, x + rr(40, 110), 255, 220, 150, 0.22);
}

// ================= TRACKS (broken gap in the middle) =================
// track line: y = 430 - 0.52*(x-560); rails are two parallel lines offset +/- 14 px vertically-ish
function railSeg(x0: number, x1: number, sleepers: boolean): void {
  const y0 = 430 - 0.52 * (x0 - 560); const y1 = 430 - 0.52 * (x1 - 560);
  // dark rails with a thin gold top edge — never a bright ladder across the moon
  thickLine(x0, y0 - 16, x1, y1 - 16, 6, 70, 50, 60);
  thickLine(x0, y0 - 19, x1, y1 - 19, 2, 200, 160, 90);
  thickLine(x0, y0 + 16, x1, y1 + 16, 6, 60, 42, 52);
  if (!sleepers) return; // upper segment: bare rails only, so it never reads as a ladder on the moon
  // short sleepers, tucked under the rails
  for (let x = x0; x <= x1; x += 34) {
    const y = 430 - 0.52 * (x - 560);
    thickLine(x - 4, y - 18, x + 4, y + 18, 5, 40, 24, 58);
  }
}
railSeg(30, 330, true);
railSeg(775, 1000, false); // starts just ahead of the loco's nose
// trestle pillar under the lower track end only (the upper one read as a black bar across the moon)
thickLine(150, 660, 130, 1024, 18, 20, 12, 46);
poly([[330, 596], [352, 588], [344, 606], [362, 596], [350, 616], [330, 612]], 200, 160, 90);
poly([[800, 330], [782, 340], [796, 348], [780, 356], [798, 362], [812, 344]], 200, 160, 90);

// ================= COMET TRAIL (behind the train, to the lower left) =================
// long tapered golden band along the train's path
const tailTip = rot(-560, 30);
const tailTop = rot(-190, -46); const tailBot = rot(-190, 46);
polyA([[tailTop[0], tailTop[1]], [tailTip[0], tailTip[1] + 6], [tailBot[0], tailBot[1]]], 255, 170, 60, 0.55);
polyA([[rot(-190, -30)[0], rot(-190, -30)[1]], [tailTip[0], tailTip[1] + 2], [rot(-190, 30)[0], rot(-190, 30)[1]]], 255, 210, 110, 0.8);
// sparks along the trail (seeded)
for (let i = 0; i < 90; i++) {
  const t = rnd();
  const lx = -190 - t * 360 + rr(-26, 26);
  const ly = rr(-70, 70) * (0.4 + t * 0.6);
  const p = rot(lx, ly);
  const s = rr(1, 4.5) * (1 - t * 0.5);
  if (rnd() < 0.3) star4(p[0], p[1], s * 3, 255, 220, 130, 0.95);
  else { glow(p[0], p[1], s * 3, 255, 190, 90, 0.8); circle(p[0], p[1], s, 255, 220, 140); }
}

// ================= THE TRAIN (Kiko, leaping) =================
// ---- wagon behind (trailing, lower-left) ----
rpoly([[-330, -58], [-210, -58], [-210, 42], [-330, 42]], 26, 68, 140); // wagon body, deep blue
rpoly([[-330, -58], [-210, -58], [-210, -34], [-330, -34]], 40, 100, 190);
rcircle(-300, 62, 26, 16, 10, 34); rcircle(-240, 62, 26, 16, 10, 34); // wheels
rcircle(-300, 62, 10, 255, 200, 90); rcircle(-240, 62, 10, 255, 200, 90);
// passengers peeking out of the wagon: two round heads + a duck beak
rcircle(-305, -76, 21, 255, 214, 150); // Bimo, yellow hat
rpoly([[-326, -88], [-284, -88], [-290, -104], [-320, -104]], 255, 200, 40);
rcircle(-252, -74, 19, 255, 235, 120); // Dodo the duck
rpoly([[-236, -78], [-214, -70], [-236, -62]], 255, 140, 40); // beak
// lantern on the wagon
rcircleA(-215, -70, 16, 255, 180, 80, 0.7); rcircle(-215, -70, 8, 255, 205, 110);

// ---- loco body ----
rpoly([[-195, -118], [-95, -118], [-95, 48], [-195, 48]], 24, 62, 132); // cabin
rpoly([[-195, -118], [-95, -118], [-95, -88], [-195, -88]], 36, 96, 196);
rpoly([[-95, -72], [128, -72], [128, 48], [-95, 48]], 36, 102, 205); // boiler
rpoly([[-95, -72], [128, -72], [128, -44], [-95, -44]], 58, 140, 235); // boiler highlight
// cabin window, warm and lit
rpoly([[-182, -104], [-128, -104], [-128, -58], [-182, -58]], 255, 205, 110);
rpoly([[-182, -104], [-128, -104], [-128, -88], [-182, -88]], 255, 235, 170);
// dome on top of the boiler
rcircle(30, -78, 26, 255, 200, 80);
rcircle(30, -78, 16, 255, 220, 130);
// front face: round boiler front
rcircle(128, -12, 62, 28, 76, 160);
rcircle(128, -12, 48, 44, 112, 215);
// ---- big friendly headlamp ----
glow(150, -12, 90, 255, 210, 110, 0.95);
rcircle(150, -12, 40, 255, 225, 140);
rcircle(150, -12, 28, 255, 245, 200);
rcircle(150, -12, 12, 255, 255, 235);
// headlamp beam cutting forward-up through the night (narrow, soft)
const beamA = rot(150, -12); const beamB = rot(430, -95); const beamC = rot(430, 55);
polyA([beamA, beamB, beamC], 255, 220, 130, 0.16);
polyA([beamA, rot(360, -70), rot(360, 40)], 255, 235, 170, 0.2);
// ---- chimney ----
rpoly([[86, -168], [122, -168], [122, -66], [86, -66]], 14, 10, 30);
rpoly([[78, -186], [130, -186], [130, -164], [78, -164]], 20, 14, 44);
rcircleA(104, -172, 26, 255, 190, 90, 0.5);
// ---- cowcatcher ----
rpoly([[128, 48], [196, 48], [150, 108]], 200, 60, 40);
rpoly([[128, 48], [168, 48], [150, 88]], 230, 90, 50);
// ---- wheels, big and turning ----
for (const wx of [-140, -60, 20, 96]) {
  rcircle(wx, 66, 34, 14, 10, 30);
  rcircle(wx, 66, 22, 40, 26, 70);
  rcircle(wx, 66, 9, 255, 200, 90);
  // spokes
  const c = rot(wx, 66);
  for (let k = 0; k < 4; k++) {
    const th = k * Math.PI / 2 + 0.5;
    thickLine(c[0], c[1], c[0] + Math.cos(th) * 20, c[1] + Math.sin(th) * 20, 4, 200, 170, 110);
  }
}
// motion streaks under the wheels
for (let i = 0; i < 12; i++) {
  const lx = rr(-180, 140); const ly = rr(96, 128);
  const p = rot(lx, ly);
  hlineA(p[1], p[0] - rr(20, 60), p[0] + rr(10, 30), 255, 200, 110, 0.35);
}

// ================= SMOKE SPIRAL -> STARS (from the chimney) =================
{
  const base = rot(104, -190);
  for (let i = 0; i < 16; i++) {
    const t = i / 15;
    const ang = 0.6 + t * 3.2;
    const rad = 14 + t * 55;
    const x = base[0] + Math.cos(ang) * rad * 0.7 - t * 30;
    const y = base[1] - t * 190 + Math.sin(ang) * rad * 0.45;
    const r = 7 + t * 13;
    if (t < 0.55) circleA(x, y, r, 210, 195, 235, 0.45 * (1 - t));
    else if (t < 0.8) circleA(x, y, r * 0.7, 255, 220, 150, 0.4);
    else star4(x, y, 10 + t * 8, 255, 235, 170, 0.95);
  }
}

// ---- spark burst at the gap: the leap's flash point ----
{
  const g = rot(-195, 60);
  glow(g[0], g[1], 70, 255, 200, 100, 0.9);
  for (let i = 0; i < 14; i++) {
    const th = (i / 14) * Math.PI * 2 + 0.3;
    const x = g[0] + Math.cos(th) * rr(30, 80);
    const y = g[1] + Math.sin(th) * rr(30, 80);
    star4(x, y, rr(6, 14), 255, 220, 130, 0.9);
  }
}

// ================= PNG ENCODE (filter Up per row, zlib level 9) =================
// CRC table (built at module scope, deterministic)
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
function crc32Impl(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const crcData = new Uint8Array(4 + data.length);
  crcData.set(out.subarray(4, 8 + data.length));
  dv.setUint32(8 + data.length, crc32Impl(crcData));
  return out;
}
function u32(n: number): Uint8Array {
  const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n); return b;
}

// raw scanlines with filter type 2 (Up)
const raw = new Uint8Array(H * (1 + W * 3));
for (let y = 0; y < H; y++) {
  const off = y * (1 + W * 3);
  raw[off] = 2;
  for (let x = 0; x < W * 3; x++) {
    const cur = buf[y * W * 3 + x];
    const up = y === 0 ? 0 : buf[(y - 1) * W * 3 + x];
    raw[off + 1 + x] = (cur - up) & 0xff;
  }
}
const idat = deflateSync(raw, { level: 9 });
const ihdr = new Uint8Array(13);
{
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, W); dv.setUint32(4, H);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
}
const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const png = Buffer.concat([Buffer.from(sig), Buffer.from(chunk('IHDR', ihdr)), Buffer.from(chunk('IDAT', idat)), Buffer.from(chunk('IEND', new Uint8Array(0)))]);

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'entry.png'), png);
