import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Geometry } from './geometry.ts';
import { hash32, mulberry32 } from './prng.ts';
import type { Layer, Shrine, Vec2, World } from './types.ts';

export const LOCK_PATH = 'world/positions.lock.json';

/** §8.3 constants. */
export const PLACEMENT = {
  spacing: { surface: 38, sky: 26 } as Record<Exclude<Layer, 'depths'>, number>,
  towerRadius: 60,
  templeBand: [0.6, 0.85] as const,
  depthsRing: 22,
  attemptsPerLevel: 600,
  relax: 0.9,
  minSpacing: 4,
};

export type Lock = Record<string, Vec2>;

export interface PlacementResult {
  positions: Map<string, Vec2>;
  /** Ids placed by the algorithm in this run (not taken from the lock or `xy`). */
  placed: string[];
  /** Ids whose spacing had to be relaxed, with the spacing finally used. */
  relaxed: { id: string; spacing: number }[];
  /** The lock to write: previous entries (including stale ids) plus everything placed now. */
  lock: Lock;
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const r1 = (p: Vec2): Vec2 => [round1(p[0]), round1(p[1])];
const dist = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function readLock(root: string): Lock {
  const file = join(root, LOCK_PATH);
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Lock) : {};
}

/** Serialise with sorted keys, one entry per line, so diffs stay readable. */
export function serializeLock(lock: Lock): string {
  const ids = Object.keys(lock).sort();
  const body = ids.map((id) => `  ${JSON.stringify(id)}: [${lock[id]![0]}, ${lock[id]![1]}]`).join(',\n');
  return `{\n${body}\n}\n`;
}

export function writeLock(root: string, lock: Lock): void {
  writeFileSync(join(root, LOCK_PATH), serializeLock(lock));
}

/**
 * Deterministic, incremental placement (§8.3, §8.4).
 * - An explicit `xy` always wins.
 * - Locked ids keep their positions; `replace` ids are re-placed.
 * - New surface/sky shrines are placed in file order, keeping clear of every already-fixed shrine on their layer.
 * - Depths shrines sit on their `below` shrine, ring-offset when several share one.
 */
export function placeShrines(world: World, geo: Geometry, lockIn: Lock = {}, replace: string[] = []): PlacementResult {
  const lock: Lock = { ...lockIn };
  for (const id of replace) delete lock[id];

  const positions = new Map<string, Vec2>();
  const placed: string[] = [];
  const relaxed: PlacementResult['relaxed'] = [];
  const fixed: Record<Exclude<Layer, 'depths'>, Vec2[]> = { surface: [], sky: [] };

  // Pass 1: everything whose position is already decided.
  for (const s of world.shrines) {
    const p = s.xy ?? lock[s.id];
    if (!p) continue;
    positions.set(s.id, r1(p));
    if (s.layer !== 'depths') fixed[s.layer].push(p);
  }

  // Pass 2: new surface and sky shrines, in file order.
  for (const s of world.shrines) {
    if (s.layer === 'depths' || positions.has(s.id)) continue;
    const { p, spacing } = placeOne(s, world, geo, fixed[s.layer]);
    positions.set(s.id, r1(p));
    fixed[s.layer].push(p);
    placed.push(s.id);
    if (spacing < PLACEMENT.spacing[s.layer]) relaxed.push({ id: s.id, spacing: round1(spacing) });
  }

  // Pass 3: depths. Group by `below`; ring offsets by id order (§8.3).
  const groups = new Map<string, Shrine[]>();
  for (const s of world.shrines) {
    if (s.layer !== 'depths' || !s.below) continue;
    groups.set(s.below, [...(groups.get(s.below) ?? []), s]);
  }
  for (const [below, members] of groups) {
    const anchor = positions.get(below);
    if (!anchor) continue;
    members.sort((a, b) => (a.id < b.id ? -1 : 1));
    const k = members.length;
    const slot = (i: number): Vec2 =>
      k === 1 ? anchor : [anchor[0] + PLACEMENT.depthsRing * Math.cos((2 * Math.PI * i) / k), anchor[1] + PLACEMENT.depthsRing * Math.sin((2 * Math.PI * i) / k)];
    const taken = members.filter((m) => positions.has(m.id)).map((m) => positions.get(m.id)!);
    const free = members.map((_, i) => i);
    for (const m of members) {
      if (positions.has(m.id)) continue;
      let pos: Vec2;
      if (!taken.length) pos = slot(members.indexOf(m));
      else {
        // Joining a group with locked members: take the ring slot farthest from those already placed.
        let best = free[0]!;
        let bestD = -1;
        for (const i of free) {
          const d = Math.min(...taken.map((t) => dist(t, slot(i))));
          if (d > bestD + 1e-9) { bestD = d; best = i; }
        }
        pos = slot(best);
        free.splice(free.indexOf(best), 1);
      }
      positions.set(m.id, r1(pos));
      taken.push(pos);
      placed.push(m.id);
    }
  }

  for (const s of world.shrines) {
    const p = positions.get(s.id);
    if (p && !s.xy) lock[s.id] = p;
    if (p && s.xy) lock[s.id] = r1(s.xy);
  }
  return { positions, placed, relaxed, lock };
}

function placeOne(s: Shrine, world: World, geo: Geometry, fixed: Vec2[]): { p: Vec2; spacing: number } {
  const layer = s.layer as Exclude<Layer, 'depths'>;
  const region = world.regionById.get(s.region)!;
  const rand = mulberry32(hash32(s.id));
  const clear = (p: Vec2, spacing: number) => fixed.every((q) => dist(p, q) >= spacing);

  if (s.kind === 'tower') {
    // Highest elevation within towerRadius of the centroid (§8.3). Sky towers: nearest to the centroid.
    const [cx, cy] = region.centroid!;
    let best: Vec2 = [cx, cy];
    let bestScore = -Infinity;
    const R = PLACEMENT.towerRadius;
    for (let dy = -R; dy <= R; dy += 4) {
      for (let dx = -R; dx <= R; dx += 4) {
        if (dx * dx + dy * dy > R * R) continue;
        const p: Vec2 = [cx + dx, cy + dy];
        const inside = layer === 'surface' ? geo.regionAt(p[0], p[1]) === s.region : geo.islandSigned(region, p[0], p[1]) > 0;
        if (!inside) continue;
        const score = layer === 'surface' ? geo.elevation(p[0], p[1]) : -Math.hypot(dx, dy);
        if (score > bestScore) { bestScore = score; best = p; }
      }
    }
    return { p: best, spacing: PLACEMENT.spacing[layer] };
  }

  let spacing = PLACEMENT.spacing[layer];
  for (;;) {
    for (let attempt = 0; attempt < PLACEMENT.attemptsPerLevel; attempt++) {
      const p = s.kind === 'temple' ? sampleTemple(s, region.centroid!, geo, rand) : sampleInside(s, layer, geo, world, rand);
      if (p && clear(p, spacing)) return { p, spacing };
    }
    if (spacing <= PLACEMENT.minSpacing) {
      // Give up on spacing entirely; still inside the region.
      for (;;) {
        const p = sampleInside(s, layer, geo, world, rand);
        if (p) return { p, spacing: 0 };
      }
    }
    spacing = Math.max(PLACEMENT.minSpacing, spacing * PLACEMENT.relax);
  }
}

function sampleInside(s: Shrine, layer: Exclude<Layer, 'depths'>, geo: Geometry, world: World, rand: () => number): Vec2 | null {
  const region = world.regionById.get(s.region)!;
  if (layer === 'sky') {
    const R = region.radius! * 1.2;
    const [cx, cy] = region.centroid!;
    const p: Vec2 = [cx + (rand() * 2 - 1) * R, cy + (rand() * 2 - 1) * R];
    // Keep a margin from the island edge so glyphs don't hang off it.
    return geo.islandSigned(region, p[0], p[1]) > 12 ? p : null;
  }
  const b = geo.bbox[geo.surfaceIndex.get(s.region)!]!;
  const p: Vec2 = [b.minX + rand() * (b.maxX - b.minX), b.minY + rand() * (b.maxY - b.minY)];
  return geo.regionAt(p[0], p[1]) === s.region && geo.landSigned(p[0], p[1]) > 10 ? p : null;
}

/** A point at 60–85% of the way from the centroid to the region border along a random ray (§8.3). */
function sampleTemple(s: Shrine, c: Vec2, geo: Geometry, rand: () => number): Vec2 | null {
  const theta = rand() * 2 * Math.PI;
  const dx = Math.cos(theta);
  const dy = Math.sin(theta);
  let d = 0;
  while (d < 2000 && geo.regionAt(c[0] + dx * d, c[1] + dy * d) === s.region) d += 2;
  const [lo, hi] = PLACEMENT.templeBand;
  const t = lo + rand() * (hi - lo);
  const p: Vec2 = [c[0] + dx * d * t, c[1] + dy * d * t];
  return geo.regionAt(p[0], p[1]) === s.region ? p : null;
}
