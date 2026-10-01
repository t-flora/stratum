// Explored terrain (docs/plans/unknown.md). The shape of the land is unknown until you have looked at it: rays from every
// place you've stood run out to R(2) and stop at the first ridge at least `exploreRidge` high. Pure; Terrain injected.
import type { ShrineStatus } from './mapdata.ts';
import type { Vec2, World } from './types.ts';
import { sightRadius, type Terrain, type VisibilityConfig } from './visibility.ts';

/** Rays per explorer. At the tower radius (630) neighbouring ray tips are about 11 units apart. */
export const EXPLORE_RAYS = 360;
/** March step along a ray, in world units. */
export const EXPLORE_STEP = 4;
/** How far past a blocking ridge a ray still reaches, so the ridge itself is drawn at the edge of the known world. */
export const RIDGE_OVERSHOOT = 10;

export interface Explorer {
  xy: Vec2;
  /** A cleared tower: the bonus radius, and ridges count `towerRidgeBonus` lower. */
  tower: boolean;
  /** Ray lengths, EXPLORE_RAYS of them, starting due east and turning towards +y. */
  reach: number[];
}

export interface Explored {
  explorers: Explorer[];
  /** Surface regions whose tower is cleared: explored in full. */
  surveyed: Set<string>;
  /** Whether a point on the canvas is explored land (or sea). */
  has(x: number, y: number): boolean;
}

/**
 * How far one ray gets. Sea samples are skipped, as in line of sight: a bay doesn't stop the eye, but the ridge
 * between the regions on either shore does.
 */
function castRay(t: Terrain, from: Vec2, angle: number, radius: number, tower: boolean, cfg: VisibilityConfig): number {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let prev: string | null = null;
  for (let d = 0; d <= radius; d += EXPLORE_STEP) {
    const r = t.regionAt(from[0] + dx * d, from[1] + dy * d);
    if (r === null) continue;
    if (prev !== null && r !== prev) {
      const h = t.ridgeHeight(prev, r) - (tower ? cfg.towerRidgeBonus : 0);
      if (h >= cfg.exploreRidge) return Math.min(radius, d + RIDGE_OVERSHOOT);
    }
    prev = r;
  }
  return radius;
}

/**
 * Explorers are the start vantage and every surface shrine you've worked on, shelved ones included: set-aside work stops
 * being a vantage, but you have still been there, so explored land never shrinks.
 */
export function computeExplored(
  world: World, positions: Map<string, Vec2>, status: (id: string) => ShrineStatus, terrain: Terrain, cfg: VisibilityConfig,
): Explored {
  const base = sightRadius(cfg, 2);
  const spots: { xy: Vec2; tower: boolean }[] = [{ xy: world.start.vantage, tower: false }];
  for (const s of world.shrines) {
    if (s.layer !== 'surface' || status(s.id) === 'untouched') continue;
    spots.push({ xy: positions.get(s.id)!, tower: s.kind === 'tower' && status(s.id) === 'cleared' });
  }
  const explorers = spots.map(({ xy, tower }) => {
    const radius = base + (tower ? cfg.towerRadiusBonus : 0);
    const reach = Array.from({ length: EXPLORE_RAYS }, (_, i) => castRay(terrain, xy, (2 * Math.PI * i) / EXPLORE_RAYS, radius, tower, cfg));
    return { xy, tower, reach };
  });
  const surveyed = new Set(
    world.shrines.filter((s) => s.kind === 'tower' && s.layer === 'surface' && status(s.id) === 'cleared').map((s) => s.region),
  );
  const maxReach = explorers.map((e) => Math.max(...e.reach));
  const has = (x: number, y: number) => {
    for (const [k, e] of explorers.entries()) {
      const dx = x - e.xy[0];
      const dy = y - e.xy[1];
      const d = Math.hypot(dx, dy);
      if (d > maxReach[k]!) continue;
      // Interpolate between the two rays either side of the point: the explored shape is the polygon through the ray tips.
      const a = ((Math.atan2(dy, dx) / (2 * Math.PI)) * EXPLORE_RAYS + EXPLORE_RAYS) % EXPLORE_RAYS;
      const i = Math.floor(a);
      const f = a - i;
      const r = e.reach[i]! * (1 - f) + e.reach[(i + 1) % EXPLORE_RAYS]! * f;
      if (d <= r) return true;
    }
    const region = terrain.regionAt(x, y);
    return region !== null && surveyed.has(region);
  };
  return { explorers, surveyed, has };
}

/** The explored shape of one explorer as a closed ring through its ray tips (for the renderer's mask). */
export function explorerRing(e: Explorer): Vec2[] {
  return e.reach.map((r, i) => {
    const a = (2 * Math.PI * i) / EXPLORE_RAYS;
    return [Math.round((e.xy[0] + Math.cos(a) * r) * 10) / 10, Math.round((e.xy[1] + Math.sin(a) * r) * 10) / 10] as Vec2;
  });
}

export interface RegionExplored {
  /** Share of the region's land that is explored (0–1). */
  share: number;
  /** Mean position of the explored part (the region label goes there), or null if none is. */
  centre: Vec2 | null;
}

/** How much of each surface region is explored, sampled every `step` units. Drives region labels. */
export function exploredShare(world: World, terrain: Terrain, explored: Explored, step = 10): Map<string, RegionExplored> {
  const acc = new Map<string, { n: number; seen: number; sx: number; sy: number }>();
  for (let y = step / 2; y < world.canvas.height; y += step) {
    for (let x = step / 2; x < world.canvas.width; x += step) {
      const r = terrain.regionAt(x, y);
      if (r === null) continue;
      const a = acc.get(r) ?? acc.set(r, { n: 0, seen: 0, sx: 0, sy: 0 }).get(r)!;
      a.n++;
      if (!explored.has(x, y)) continue;
      a.seen++;
      a.sx += x;
      a.sy += y;
    }
  }
  return new Map(
    [...acc].map(([r, a]) => [r, { share: a.seen / a.n, centre: a.seen ? ([Math.round(a.sx / a.seen), Math.round(a.sy / a.seen)] as Vec2) : null }]),
  );
}
