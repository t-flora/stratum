// Visibility: the triangle rule (§6). Pure functions of (world, positions, work state, config, terrain).
import type { Config } from './config.ts';
import type { ShrineStatus, Visibility } from './mapdata.ts';
import type { Shrine, Vec2, World } from './types.ts';

/** The slice of Geometry that line of sight needs. `Geometry` satisfies it; tests use synthetic terrain. */
export interface Terrain {
  regionAt(x: number, y: number): string | null;
  ridgeHeight(a: string, b: string): number;
}

export type VisibilityConfig = Config['visibility'];

/** Sample spacing along a sight line (§6.2: "every 5 units"). */
export const SIGHT_STEP = 5;

/**
 * H(v, s): the highest ridge crossed by the segment a→b (§6.2). Each change of region A→B crosses h(A, B).
 * Sea samples are skipped: a line over water compares the regions on either shore (see docs/decisions.md).
 */
export function maxRidgeCrossed(t: Terrain, a: Vec2, b: Vec2, step = SIGHT_STEP): number {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(1, Math.ceil(d / step));
  let prev: string | null = null;
  let h = 0;
  for (let i = 0; i <= n; i++) {
    const r = t.regionAt(a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n);
    if (r === null) continue;
    if (prev !== null && r !== prev) h = Math.max(h, t.ridgeHeight(prev, r));
    prev = r;
  }
  return h;
}

/** R(p) = radiusBase + radiusPerP·p (§6.2). */
export const sightRadius = (cfg: VisibilityConfig, p: number) => cfg.radiusBase + cfg.radiusPerP * p;

export interface Vantage {
  xy: Vec2;
  /** A cleared tower: R(p) + towerRadiusBonus and H − towerRidgeBonus (§6.2). */
  tower: boolean;
  /** The shrine standing here, or undefined for the start vantage. */
  id?: string;
}

export interface VisibilityResult {
  visibility: Map<string, Visibility>;
  /** Surface vantage points (§6.1), for the fog. */
  vantages: Vantage[];
  /** Regions whose tower is cleared (§5.3): fully rendered, no fog wash. */
  surveyed: Set<string>;
  /** Depths shrines whose `below` is cleared or in progress (§6.4). */
  glowing: Set<string>;
  /** Cleared depths shrines: centres of the light circles (§6.4). */
  lit: Set<string>;
  /** §6.6: false while a sky start hasn't descended yet. */
  landed: boolean;
}

const rank: Record<Visibility, number> = { hidden: 0, silhouette: 1, revealed: 2 };
const atLeast = (v: Visibility, floor: Visibility): Visibility => (rank[v] >= rank[floor] ? v : floor);
const atMost = (v: Visibility, cap: Visibility): Visibility => (rank[v] <= rank[cap] ? v : cap);

/**
 * §5.4 locks: the shrine ids in `needs` that aren't cleared yet. A shrine (or temple) with any is locked: you can see it
 * and read it, but you can't set out or clear it until you've built what it needs. Temples are also sealed (§6.2).
 */
export function unmetNeeds(s: Shrine, cleared: (id: string) => boolean): string[] {
  return s.needs.filter((id) => !cleared(id));
}

/**
 * §6.6 the descent. A world with `start.sky` begins on that island; you've landed once an opening shrine is cleared (the
 * glider is earned), or once you've worked on any surface shrine (you climbed down yourself, so the sky is never a lock).
 * A world without `start.sky` starts landed.
 */
export function hasLanded(world: World, status: (id: string) => ShrineStatus): boolean {
  const sky = world.start.sky;
  if (!sky?.length) return true;
  return sky.some((id) => status(id) === 'cleared') || world.shrines.some((s) => s.layer === 'surface' && status(s.id) !== 'untouched');
}

/**
 * Surface visibility of one shrine from the vantage set (§6.2, before overrides).
 * Revealed: within R(p) with no ridge in the way (a cleared tower's bonus can lower H to 0).
 * Silhouette: within 1.6·R(p) and p > H + peekMargin. With the default margin of 1, p=3 peeks over the
 * plateau's low (h=1) borders, only p≥4 landmarks peek over a default ridge (h=2), and nothing over h=4.
 */
function surfaceSight(s: Shrine, xy: Vec2, vantages: Vantage[], t: Terrain, cfg: VisibilityConfig): Visibility {
  let best: Visibility = 'hidden';
  for (const v of vantages) {
    const r = sightRadius(cfg, s.p) + (v.tower ? cfg.towerRadiusBonus : 0);
    const d = Math.hypot(xy[0] - v.xy[0], xy[1] - v.xy[1]);
    if (d > cfg.silhouetteFactor * r) continue;
    const raw = maxRidgeCrossed(t, v.xy, xy);
    const h = v.tower ? Math.max(0, raw - cfg.towerRidgeBonus) : raw;
    // Only an unobstructed line reveals; peeking over a ridge needs a margin (docs/decisions.md, M3 and M4b).
    if (d <= r && h === 0) return 'revealed';
    if (s.p > h + cfg.peekMargin) best = 'silhouette';
  }
  return best;
}

/**
 * §6 in full. `status` gives each shrine's derived work state; `positions` are the placed coordinates.
 * The M1/M2 atlas view is gone: this is what the map shows by default (Atlas mode arrives in M5).
 */
export function computeVisibility(
  world: World, positions: Map<string, Vec2>, status: (id: string) => ShrineStatus, terrain: Terrain, cfg: VisibilityConfig,
): VisibilityResult {
  // Shelved work is set aside: it keeps its own reveal but is no longer a vantage, glow source or launch point.
  const active = (id: string) => status(id) === 'in-progress' || status(id) === 'cleared';
  /** Any shrine you've worked on (shelved included) stays revealed itself. */
  const worked = (id: string) => status(id) !== 'untouched';
  const cleared = (id: string) => status(id) === 'cleared';
  const pos = (id: string) => positions.get(id)!;

  // §6.1 vantages (surface only; sky and depths clears only matter on their own layers).
  const vantages: Vantage[] = [{ xy: world.start.vantage, tower: false }];
  for (const s of world.shrines) {
    if (s.layer !== 'surface' || !active(s.id)) continue;
    vantages.push({ xy: pos(s.id), tower: s.kind === 'tower' && cleared(s.id), id: s.id });
  }
  const surveyed = new Set(world.shrines.filter((s) => s.kind === 'tower' && s.layer === 'surface' && cleared(s.id)).map((s) => s.region));
  const plateau = new Set(world.start.plateau);
  const landed = hasLanded(world, status);

  const visibility = new Map<string, Visibility>();

  // §6.2 surface, with the overrides applied in the order the spec lists them. Before landing (§6.6) you look down from
  // the sky: the start vantage still sees, but nothing on the ground is closer than a silhouette, the plateau included.
  for (const s of world.shrines) {
    if (s.layer !== 'surface') continue;
    let v = surfaceSight(s, pos(s.id), vantages, terrain, cfg);
    if (!landed) v = atMost(v, 'silhouette');
    if (plateau.has(s.id)) v = landed ? 'revealed' : 'silhouette';
    if (worked(s.id)) v = 'revealed';
    if (surveyed.has(s.region)) v = atLeast(v, 'silhouette');
    if (s.kind === 'tower') v = atLeast(v, 'silhouette');
    if (s.kind === 'temple' && !s.needs.every(cleared)) v = atMost(v, 'silhouette');
    visibility.set(s.id, v);
  }

  // §6.4 depths: darkness, lit by cleared wellsprings; glows under active surface shrines.
  const lit = new Set(world.shrines.filter((s) => s.layer === 'depths' && cleared(s.id)).map((s) => s.id));
  const glowing = new Set<string>();
  for (const s of world.shrines) {
    if (s.layer !== 'depths') continue;
    if (s.below && active(s.below)) glowing.add(s.id);
    const xy = pos(s.id);
    const inLight = [...lit].some((id) => {
      const c = pos(id);
      return Math.hypot(c[0] - xy[0], c[1] - xy[1]) <= cfg.lightRadius;
    });
    visibility.set(s.id, worked(s.id) || inLight ? 'revealed' : glowing.has(s.id) ? 'silhouette' : 'hidden');
  }

  // §6.3 sky (after the surface and depths, which it looks at). Islands are always visible; their shrines are revealed via
  // the island's tower or an active launch point (a linked shrine in either direction), silhouettes once a launch point is
  // in sight, and hidden otherwise.
  const linkedTo = new Map<string, Set<string>>();
  const link = (a: string, b: string) => linkedTo.set(a, (linkedTo.get(a) ?? new Set()).add(b));
  for (const s of world.shrines) for (const l of s.links) {
    link(s.id, l);
    link(l, s.id);
  }
  const skyTowerCleared = new Set(world.shrines.filter((s) => s.kind === 'tower' && s.layer === 'sky' && cleared(s.id)).map((s) => s.region));
  const opening = new Set(world.start.sky ?? []);
  for (const s of world.shrines) {
    if (s.layer !== 'sky') continue;
    const linked = [...(linkedTo.get(s.id) ?? [])];
    const open = s.kind === 'tower' || opening.has(s.id) || worked(s.id) || skyTowerCleared.has(s.region) || linked.some(active);
    // You can see the updraft from the ground: a revealed launch point (on another layer) shows the sky shrine's outline.
    const seen = linked.some((l) => world.shrineById.get(l)?.layer !== 'sky' && visibility.get(l) === 'revealed');
    visibility.set(s.id, open ? 'revealed' : seen ? 'silhouette' : 'hidden');
  }

  return { visibility, vantages, surveyed, glowing, lit, landed };
}

/** Whether a silhouette's title may be shown (§6.2: landmarks, p ≥ silhouetteTitleMinP, are recognisable from afar). */
export function titleKnown(v: Visibility, p: number, cfg: VisibilityConfig): boolean {
  return v === 'revealed' || (v === 'silhouette' && p >= cfg.silhouetteTitleMinP);
}
