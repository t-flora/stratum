// The continent (docs/plans/geography.md, M6): a deterministic land field from (surface regions, seed). Pure.
//
// The land is a smooth union of noisy lobes, one around each surface region's centroid, so every region has ground of its
// own and regions far apart get bays between them. A domain warp and multi-scale noise rough up the coast (fjords,
// headlands), a few islands sit offshore, and lakes are carved out inland, away from every centroid.
// Values are signed, in approximate world units: > 0 on land, < 0 at sea (or in a lake).
import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { hash32, mulberry32 } from './prng.ts';
import type { Region, Vec2 } from './types.ts';

/** How hard the lobes blend into one another (world units): larger fuses them more. */
const BLEND = 26;
/** Lobe radius as a share of the distance to the nearest other centroid, clamped to [MIN_R, MAX_R]. */
const LOBE_SHARE = 0.62;
const MIN_R = 120;
const MAX_R = 215;
/** Coast roughness. */
const WARP = 55;
const COAST_NOISE = [
  { f: 1 / 210, a: 34 },
  { f: 1 / 85, a: 16 },
  { f: 1 / 32, a: 6 },
];
/** Keep this far from the canvas edge, and start bending the coast away from it this far out. */
const EDGE_MARGIN = 14;
const EDGE_FALLOFF = 120;

export interface Lake {
  xy: Vec2;
  r: number;
}
export interface Islet {
  xy: Vec2;
  r: number;
}

export interface Landmass {
  /** Signed land value at a point (computed, not interpolated). */
  at(x: number, y: number): number;
  lakes: Lake[];
  islets: Islet[];
}

export function buildLandmass(surface: Region[], width: number, height: number, seed: number): Landmass {
  const noise = (salt: number): NoiseFunction2D => createNoise2D(mulberry32((seed ^ Math.imul(salt, 0x9e3779b1)) >>> 0));
  const nWarpX = noise(21);
  const nWarpY = noise(22);
  const nCoast = noise(23);
  const nLobe = noise(24);
  const rand = mulberry32(hash32(`landmass:${seed}`));

  const centroids = surface.map((r) => r.centroid!);
  const radius = centroids.map((c, i) => {
    let nearest = Infinity;
    centroids.forEach((o, j) => {
      if (j !== i) nearest = Math.min(nearest, Math.hypot(o[0] - c[0], o[1] - c[1]));
    });
    // Some regions bulge out to sea and some are tucked in, so the outline doesn't follow the centroid grid.
    const jitter = 0.84 + 0.32 * mulberry32(hash32(`lobe:${seed}:${surface[i]!.id}`))();
    return Math.max(MIN_R, Math.min(MAX_R, LOBE_SHARE * nearest)) * jitter;
  });

  /** The union of lobes alone (no islands or lakes): the main continent. */
  const continent = (x: number, y: number): number => {
    const wx = x + WARP * nWarpX(x / 300, y / 300);
    const wy = y + WARP * nWarpY(x / 300, y / 300);
    // Smooth maximum (log-sum-exp) of each lobe's "radius minus distance", with a noisy radius per direction: peninsulas.
    let sum = 0;
    centroids.forEach((c, i) => {
      const dx = wx - c[0];
      const dy = wy - c[1];
      const d = Math.hypot(dx, dy);
      const ux = d ? dx / d : 1;
      const uy = d ? dy / d : 0;
      const shape = 1 + 0.24 * nLobe(ux * 1.3 + i * 7.3, uy * 1.3 - i * 3.1) + 0.1 * nLobe(ux * 3.4 + i * 11.7, uy * 3.4 + i * 5.9);
      sum += Math.exp((radius[i]! * shape - d) / BLEND);
    });
    let v = BLEND * Math.log(sum);
    for (const { f, a } of COAST_NOISE) v += a * nCoast(x * f, y * f);
    // The sea wraps the continent: within EDGE_FALLOFF of the canvas edge the land is pushed down, so coasts curve away
    // from the frame instead of being cut by it.
    const edge = Math.min(x, y, width - x, height - y);
    if (edge < EDGE_FALLOFF) v -= ((EDGE_FALLOFF - edge) / EDGE_FALLOFF) ** 2 * 140;
    return v;
  };

  // Islets: a few rounded rocks a little offshore, on rays out of random centroids.
  const islets: Islet[] = [];
  const wanted = 5 + Math.floor(rand() * 4);
  for (let tries = 0; islets.length < wanted && tries < 400; tries++) {
    const i = Math.floor(rand() * centroids.length);
    const t = rand() * 2 * Math.PI;
    const c = centroids[i]!;
    // Walk out until the sea, then a bit further.
    let d = radius[i]! * 0.6;
    while (d < 900 && continent(c[0] + d * Math.cos(t), c[1] + d * Math.sin(t)) > 0) d += 8;
    const r = 14 + rand() * 30;
    d += r + 25 + rand() * 90;
    const xy: Vec2 = [c[0] + d * Math.cos(t), c[1] + d * Math.sin(t)];
    const inside = xy[0] > r + EDGE_MARGIN + 6 && xy[1] > r + EDGE_MARGIN + 6 && xy[0] < width - r - EDGE_MARGIN - 6 && xy[1] < height - r - EDGE_MARGIN - 6;
    if (inside && continent(xy[0], xy[1]) < -r && islets.every((o) => Math.hypot(o.xy[0] - xy[0], o.xy[1] - xy[1]) > o.r + r + 30)) {
      islets.push({ xy, r });
    }
  }

  // Lakes: deep inland, far from every centroid (so no region loses its heart), and not too close to each other.
  const lakes: Lake[] = [];
  const wantLakes = 1 + Math.floor(rand() * 2);
  for (let tries = 0; lakes.length < wantLakes && tries < 600; tries++) {
    const xy: Vec2 = [EDGE_MARGIN + rand() * (width - 2 * EDGE_MARGIN), EDGE_MARGIN + rand() * (height - 2 * EDGE_MARGIN)];
    const r = 24 + rand() * 26;
    const farFromHearts = centroids.every((c) => Math.hypot(c[0] - xy[0], c[1] - xy[1]) > 110 + r);
    if (farFromHearts && continent(xy[0], xy[1]) > 2.2 * r + 40 && lakes.every((o) => Math.hypot(o.xy[0] - xy[0], o.xy[1] - xy[1]) > 220)) {
      lakes.push({ xy, r });
    }
  }

  const at = (x: number, y: number): number => {
    let v = continent(x, y);
    for (const s of islets) {
      const d = Math.hypot(x - s.xy[0], y - s.xy[1]);
      v = Math.max(v, s.r * (1 + 0.25 * nCoast(x / 18 + 50, y / 18 - 50)) - d);
    }
    for (const l of lakes) {
      const d = Math.hypot(x - l.xy[0], y - l.xy[1]);
      v = Math.min(v, d - l.r * (1 + 0.3 * nCoast(x / 22 - 80, y / 22 + 80)));
    }
    return Math.min(v, Math.min(x, y, width - x, height - y) - EDGE_MARGIN);
  };

  return { at, lakes, islets };
}
