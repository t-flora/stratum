import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { mulberry32 } from './prng.ts';
import type { Region, Vec2, World } from './types.ts';

/** The landmass ellipse (§8.1). */
export const LANDMASS = { cx: 800, cy: 500, rx: 760, ry: 470 };
/** Classification grid resolution in world units (§8.1: "2-unit resolution is fine"). */
export const GRID_STEP = 2;
/** Amplitude of the domain warp that makes region borders organic. */
export const WARP_AMPLITUDE = 40;
/** Minimum shared border (in grid-cell edges) for two regions to count as adjacent; filters noise slivers. */
const MIN_ADJACENT_EDGES = 5;

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Deterministic world geometry derived from (world, seed). The same instance answers
 * rendering, placement and line-of-sight queries, so they always agree.
 */
export class Geometry {
  readonly width: number;
  readonly height: number;
  /** Surface regions, in world order. Region indices below refer to this array. */
  readonly surface: Region[];
  readonly surfaceIndex = new Map<string, number>();
  readonly sky: Region[];
  readonly gw: number;
  readonly gh: number;
  /** Region index per grid sample, -1 for sea. */
  readonly cells: Int8Array;
  /** Bounding box per surface region (world units). */
  readonly bbox: { minX: number; minY: number; maxX: number; maxY: number }[];
  /** Shared-border length (grid edges) per adjacent surface pair, keyed by pairKey. */
  readonly adjacency = new Map<string, number>();

  private readonly ridgeH = new Map<string, number>();
  private readonly ridgeDefault: number;
  private readonly centroids: Vec2[];
  private readonly nCoast: NoiseFunction2D;
  private readonly nWarp: NoiseFunction2D[];
  private readonly nElev: NoiseFunction2D[];
  private readonly nIsland: NoiseFunction2D;
  private readonly nRock: NoiseFunction2D;

  constructor(world: World, seed: number) {
    this.width = world.canvas.width;
    this.height = world.canvas.height;
    this.surface = world.regions.filter((r) => r.layer === 'surface');
    this.sky = world.regions.filter((r) => r.layer === 'sky');
    this.surface.forEach((r, i) => this.surfaceIndex.set(r.id, i));
    this.centroids = this.surface.map((r) => r.centroid!);
    this.ridgeDefault = world.ridges.default;
    for (const o of world.ridges.overrides) this.ridgeH.set(pairKey(o.between[0], o.between[1]), o.h);

    const noise = (salt: number) => createNoise2D(mulberry32((seed ^ Math.imul(salt, 0x9e3779b1)) >>> 0));
    this.nCoast = noise(1);
    this.nWarp = [noise(2), noise(3), noise(4), noise(5)];
    this.nElev = [noise(6), noise(7)];
    this.nIsland = noise(8);
    this.nRock = noise(9);

    this.gw = Math.floor(this.width / GRID_STEP) + 1;
    this.gh = Math.floor(this.height / GRID_STEP) + 1;
    this.cells = new Int8Array(this.gw * this.gh);
    this.bbox = this.surface.map(() => ({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }));
    for (let gy = 0; gy < this.gh; gy++) {
      for (let gx = 0; gx < this.gw; gx++) {
        const x = gx * GRID_STEP;
        const y = gy * GRID_STEP;
        const idx = this.landSigned(x, y) < 0 ? -1 : this.nearestTwo(x, y).i1;
        this.cells[gy * this.gw + gx] = idx;
        if (idx >= 0) {
          const b = this.bbox[idx]!;
          if (x < b.minX) b.minX = x;
          if (x > b.maxX) b.maxX = x;
          if (y < b.minY) b.minY = y;
          if (y > b.maxY) b.maxY = y;
        }
      }
    }
    const counts = new Map<string, number>();
    const bump = (a: number, b: number) => {
      if (a < 0 || b < 0 || a === b) return;
      const k = pairKey(this.surface[a]!.id, this.surface[b]!.id);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    };
    for (let gy = 0; gy < this.gh; gy++) {
      for (let gx = 0; gx < this.gw; gx++) {
        const c = this.cells[gy * this.gw + gx]!;
        if (gx + 1 < this.gw) bump(c, this.cells[gy * this.gw + gx + 1]!);
        if (gy + 1 < this.gh) bump(c, this.cells[(gy + 1) * this.gw + gx]!);
      }
    }
    for (const [k, n] of counts) if (n >= MIN_ADJACENT_EDGES) this.adjacency.set(k, n);
  }

  /** Signed distance-like value to the coastline, in approximate world units: > 0 on land. */
  landSigned(x: number, y: number): number {
    const dx = (x - LANDMASS.cx) / LANDMASS.rx;
    const dy = (y - LANDMASS.cy) / LANDMASS.ry;
    const r = Math.hypot(dx, dy);
    const c = r === 0 ? 1 : dx / r;
    const s = r === 0 ? 0 : dy / r;
    const n = this.nCoast;
    const threshold = 1 + 0.06 * n(c * 1.3, s * 1.3) + 0.03 * n(c * 4 + 10, s * 4 + 10) + 0.012 * n(c * 11 + 20, s * 11 + 20);
    const coast = (threshold - r) * LANDMASS.ry;
    const edge = Math.min(x, y, this.width - x, this.height - y) - 12;
    return Math.min(coast, edge);
  }

  isLand(x: number, y: number): boolean {
    return this.classify(x, y) >= 0;
  }

  /** Low-frequency domain warp (§8.1). */
  warp(x: number, y: number): Vec2 {
    const [a, b, c, d] = this.nWarp as [NoiseFunction2D, NoiseFunction2D, NoiseFunction2D, NoiseFunction2D];
    const f1 = 1 / 320;
    const f2 = 1 / 110;
    const amp2 = WARP_AMPLITUDE * 0.3;
    return [
      x + WARP_AMPLITUDE * a(x * f1, y * f1) + amp2 * c(x * f2, y * f2),
      y + WARP_AMPLITUDE * b(x * f1, y * f1) + amp2 * d(x * f2, y * f2),
    ];
  }

  /** The two nearest surface centroids to the warped point, with their distances. */
  nearestTwo(x: number, y: number): { i1: number; d1: number; i2: number; d2: number } {
    const [wx, wy] = this.warp(x, y);
    let i1 = -1, d1 = Infinity, i2 = -1, d2 = Infinity;
    for (let i = 0; i < this.centroids.length; i++) {
      const c = this.centroids[i]!;
      const d = Math.hypot(wx - c[0], wy - c[1]);
      if (d < d1) { i2 = i1; d2 = d1; i1 = i; d1 = d; }
      else if (d < d2) { i2 = i; d2 = d; }
    }
    return { i1, d1, i2, d2 };
  }

  /** Surface region index at a point (nearest grid sample), or -1 for sea / off-canvas. */
  classify(x: number, y: number): number {
    const gx = Math.round(x / GRID_STEP);
    const gy = Math.round(y / GRID_STEP);
    if (gx < 0 || gy < 0 || gx >= this.gw || gy >= this.gh) return -1;
    return this.cells[gy * this.gw + gx]!;
  }

  regionAt(x: number, y: number): string | null {
    const i = this.classify(x, y);
    return i >= 0 ? this.surface[i]!.id : null;
  }

  ridgeHeight(a: string, b: string): number {
    return this.ridgeH.get(pairKey(a, b)) ?? this.ridgeDefault;
  }

  isAdjacent(a: string, b: string): boolean {
    return this.adjacency.has(pairKey(a, b));
  }

  /** Terrain elevation without the prominence field (§8.5). Used for tower placement and as the rendering base. */
  elevation(x: number, y: number): number {
    const land = this.landSigned(x, y);
    const [e1, e2] = this.nElev as [NoiseFunction2D, NoiseFunction2D];
    const base = 0.5 + 0.3 * e1(x / 260, y / 260) + 0.15 * e2(x / 90, y / 90);
    if (land < 0) return Math.max(-1, land / 200) - 0.1;
    const { i1, d1, i2, d2 } = this.nearestTwo(x, y);
    const h = i2 >= 0 ? this.ridgeHeight(this.surface[i1]!.id, this.surface[i2]!.id) : 0;
    const ridge = 0.12 * h * Math.exp(-(d2 - d1) / 25);
    const shore = Math.min(1, land / 60); // taper toward the coast
    return base * shore + ridge;
  }

  /** Rock-strata noise for the depths (rendering only). */
  strata(x: number, y: number): number {
    return 0.7 * this.nRock(x / 150, y / 150) + 0.3 * this.nRock(x / 50 + 31, y / 50 + 17);
  }

  /** Islet-shape noise for the sky (rendering only). */
  isletNoise(x: number, y: number): number {
    return this.nIsland(x / 35 + 101, y / 35 + 57);
  }
}
