import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Geometry } from './geometry.ts';
import { hash32, mulberry32 } from './prng.ts';
import type { Layer, Region, Shrine, Vec2, World } from './types.ts';

export const LOCK_PATH = 'world/positions.lock.json';

/** §8.3 constants, plus the theme-clustering extension (docs/decisions.md). */
export const PLACEMENT = {
  spacing: { surface: 38, sky: 26 } as Record<Exclude<Layer, 'depths'>, number>,
  towerRadius: 60,
  templeBand: [0.6, 0.85] as const,
  depthsRing: 22,
  attemptsPerLevel: 600,
  relax: 0.9,
  minSpacing: 4,
  /** A follow-up lands within [1, followUpReach] × spacing of its predecessor. */
  followUpReach: 1.5,
  /** Sky theme islets sit this far out from the archipelago centre, as a fraction of its radius. */
  skyThemeRing: 0.6,
  /** A sky shrine must be this much closer to its own theme anchor than to any other, so islets don't merge. */
  skyIsletMargin: 60,
};

export type Lock = Record<string, Vec2>;

/** Lockfile key for a theme anchor. `@` sorts before shrine ids, so anchors group at the top. */
export const themeKey = (region: string, theme: string) => `@${region}/${theme}`;

export interface PlacementResult {
  positions: Map<string, Vec2>;
  /** Theme anchors, keyed by themeKey. */
  anchors: Map<string, Vec2>;
  /** Ids placed by the algorithm in this run (not taken from the lock or `xy`). */
  placed: string[];
  /** Ids whose spacing had to be relaxed, with the spacing finally used. */
  relaxed: { id: string; spacing: number }[];
  /** The lock to write: previous entries (including stale ids) plus everything placed now. */
  lock: Lock;
}

type Surf = Exclude<Layer, 'depths'>;

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

/** Themes per region, in order of first appearance in the world. */
export function themesByRegion(world: World): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const s of world.shrines) {
    if (!s.theme) continue;
    const list = out.get(s.region) ?? [];
    if (!list.includes(s.theme)) list.push(s.theme);
    out.set(s.region, list);
  }
  return out;
}

/**
 * Deterministic, incremental placement (§8.3, §8.4), extended with theme clusters:
 * - An explicit `xy` always wins. Locked ids and locked theme anchors keep their positions.
 * - Each theme gets an anchor. New anchors are spread around the region, or go to the free space farthest from existing anchors.
 * - New shrines are placed in file order, except that same-region `after` predecessors go first. A follow-up lands
 *   next to its predecessor; other themed shrines cluster around their theme's anchor.
 * - Temples go 60–85% of the way to the border, in the direction of their `needs`.
 * - Depths shrines sit on their `below` shrine, ring-offset when several share one.
 */
export function placeShrines(world: World, geo: Geometry, lockIn: Lock = {}, replace: string[] = []): PlacementResult {
  const lock: Lock = { ...lockIn };
  for (const id of replace) delete lock[id];

  const positions = new Map<string, Vec2>();
  const placed: string[] = [];
  const relaxed: PlacementResult['relaxed'] = [];
  const fixed: Record<Surf, Vec2[]> = { surface: [], sky: [] };

  // Pass 1: everything whose position is already decided.
  for (const s of world.shrines) {
    const p = s.xy ?? lock[s.id];
    if (!p) continue;
    positions.set(s.id, r1(p));
    if (s.layer !== 'depths') fixed[s.layer].push(p);
  }

  // Theme anchors.
  const anchors = new Map<string, Vec2>();
  for (const [regionId, themes] of themesByRegion(world)) {
    const region = world.regionById.get(regionId)!;
    if (region.layer === 'depths') continue;
    const locked = themes.filter((t) => lock[themeKey(regionId, t)]);
    for (const t of locked) anchors.set(themeKey(regionId, t), r1(lock[themeKey(regionId, t)]!));
    const missing = themes.filter((t) => !lock[themeKey(regionId, t)]);
    if (!missing.length) continue;
    const fresh = locked.length === 0 ? initialAnchors(region, themes.length, geo) : null;
    for (const t of missing) {
      const existing = themes.filter((x) => anchors.has(themeKey(regionId, x))).map((x) => anchors.get(themeKey(regionId, x))!);
      const a = fresh ? fresh[themes.indexOf(t)]! : farthestAnchor(region, existing, geo);
      anchors.set(themeKey(regionId, t), r1(a));
    }
  }
  const anchorOf = (s: Shrine) => (s.theme ? anchors.get(themeKey(s.region, s.theme)) : undefined);
  const regionAnchors = (regionId: string) =>
    (themesByRegion(world).get(regionId) ?? []).map((t) => anchors.get(themeKey(regionId, t))).filter((a): a is Vec2 => !!a);

  // Pass 2: new surface and sky shrines. File order, predecessors first, temples last.
  const visiting = new Set<string>();
  const placeWithPredecessors = (s: Shrine) => {
    if (positions.has(s.id) || visiting.has(s.id)) return;
    visiting.add(s.id);
    for (const pid of s.after) {
      const p = world.shrineById.get(pid);
      if (p && p.region === s.region && p.kind === 'shrine') placeWithPredecessors(p);
    }
    const ctx: Ctx = { world, geo, fixed: fixed[s.layer as Surf], positions, anchor: anchorOf(s), siblings: regionAnchors(s.region) };
    const { p, spacing } = placeOne(s, ctx);
    positions.set(s.id, r1(p));
    fixed[s.layer as Surf].push(p);
    placed.push(s.id);
    if (spacing < PLACEMENT.spacing[s.layer as Surf]) relaxed.push({ id: s.id, spacing: round1(spacing) });
  };
  for (const s of world.shrines) if (s.layer !== 'depths' && s.kind !== 'temple') placeWithPredecessors(s);
  for (const s of world.shrines) if (s.layer !== 'depths' && s.kind === 'temple') placeWithPredecessors(s);

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
    if (p) lock[s.id] = s.xy ? r1(s.xy) : p;
  }
  for (const [k, a] of anchors) lock[k] = a;
  return { positions, anchors, placed, relaxed, lock };
}

// ---- anchors ------------------------------------------------------------------------------

/** Candidate points for anchors: a coarse lattice inside the region (surface) or archipelago disc (sky). */
function anchorCandidates(region: Region, geo: Geometry): Vec2[] {
  const out: Vec2[] = [];
  const [cx, cy] = region.centroid!;
  if (region.layer === 'sky') {
    const R = region.radius! * 0.8;
    for (let y = -R; y <= R; y += 8) for (let x = -R; x <= R; x += 8) if (x * x + y * y <= R * R) out.push([cx + x, cy + y]);
    return out;
  }
  const b = geo.bbox[geo.surfaceIndex.get(region.id)!]!;
  for (let y = b.minY; y <= b.maxY; y += 8) {
    for (let x = b.minX; x <= b.maxX; x += 8) {
      if (geo.regionAt(x, y) === region.id && geo.landSigned(x, y) > 30) out.push([x, y]);
    }
  }
  return out;
}

/**
 * First-build anchors. Surface: n seeds spread by angle around the centroid, relaxed with Lloyd iterations so each
 * theme gets a fair share of the region. Consecutive themes stay angular neighbours. Sky: a ring around the
 * archipelago centre (the centre is the tower's rock).
 */
function initialAnchors(region: Region, n: number, geo: Geometry): Vec2[] {
  const [cx, cy] = region.centroid!;
  const theta0 = ((hash32(region.id) % 3600) / 3600) * 2 * Math.PI;
  const dirs = Array.from({ length: n }, (_, i) => theta0 + (2 * Math.PI * i) / n);
  if (region.layer === 'sky') {
    const r = region.radius! * PLACEMENT.skyThemeRing;
    return dirs.map((t) => [cx + r * Math.cos(t), cy + r * Math.sin(t)]);
  }
  const cells = anchorCandidates(region, geo);
  // Seed each anchor halfway to the border along its direction.
  let anchors: Vec2[] = dirs.map((t) => {
    let d = 0;
    while (d < 2000 && geo.regionAt(cx + Math.cos(t) * d, cy + Math.sin(t) * d) === region.id) d += 2;
    return [cx + Math.cos(t) * d * 0.5, cy + Math.sin(t) * d * 0.5];
  });
  for (let iter = 0; iter < 10; iter++) {
    const sum = anchors.map(() => [0, 0, 0]);
    for (const c of cells) {
      let best = 0;
      let bd = Infinity;
      anchors.forEach((a, i) => {
        const d = dist(a, c);
        if (d < bd) { bd = d; best = i; }
      });
      const acc = sum[best]!;
      acc[0]! += c[0]; acc[1]! += c[1]; acc[2]! += 1;
    }
    anchors = anchors.map((a, i) => (sum[i]![2]! ? [sum[i]![0]! / sum[i]![2]!, sum[i]![1]! / sum[i]![2]!] : a));
  }
  // A centroid of a non-convex cell can fall outside the region: snap to the nearest candidate.
  return anchors.map((a) => (geo.regionAt(a[0], a[1]) === region.id ? a : nearest(cells, a)));
}

/** A new theme in a region that already has anchors: the free spot farthest from them (and from the centre). */
function farthestAnchor(region: Region, existing: Vec2[], geo: Geometry): Vec2 {
  const cells = anchorCandidates(region, geo);
  const avoid = [...existing, region.centroid!];
  let best = region.centroid!;
  let bd = -1;
  for (const c of cells) {
    const d = Math.min(...avoid.map((a) => dist(a, c)));
    if (d > bd) { bd = d; best = c; }
  }
  return best;
}

function nearest(points: Vec2[], p: Vec2): Vec2 {
  let best = points[0] ?? p;
  for (const q of points) if (dist(q, p) < dist(best, p)) best = q;
  return best;
}

// ---- single-shrine placement --------------------------------------------------------------

interface Ctx {
  world: World;
  geo: Geometry;
  fixed: Vec2[];
  positions: Map<string, Vec2>;
  anchor: Vec2 | undefined;
  /** All theme anchors in the shrine's region. */
  siblings: Vec2[];
}

function placeOne(s: Shrine, ctx: Ctx): { p: Vec2; spacing: number } {
  const { world, geo } = ctx;
  const layer = s.layer as Surf;
  const region = world.regionById.get(s.region)!;
  const rand = mulberry32(hash32(s.id));
  const clear = (p: Vec2, spacing: number) => ctx.fixed.every((q) => dist(p, q) >= spacing);

  if (s.kind === 'tower') {
    const [cx, cy] = region.centroid!;
    // Sky towers stand on their own rock at the archipelago centre.
    if (layer === 'sky') return { p: [cx, cy], spacing: PLACEMENT.spacing.sky };
    // Surface: highest elevation within towerRadius of the centroid (§8.3).
    let best: Vec2 = [cx, cy];
    let bestScore = -Infinity;
    const R = PLACEMENT.towerRadius;
    for (let dy = -R; dy <= R; dy += 4) {
      for (let dx = -R; dx <= R; dx += 4) {
        if (dx * dx + dy * dy > R * R) continue;
        const p: Vec2 = [cx + dx, cy + dy];
        if (geo.regionAt(p[0], p[1]) !== s.region) continue;
        const score = geo.elevation(p[0], p[1]);
        if (score > bestScore) { bestScore = score; best = p; }
      }
    }
    return { p: best, spacing: PLACEMENT.spacing.surface };
  }

  const inRegion = (p: Vec2) =>
    layer === 'surface'
      ? geo.regionAt(p[0], p[1]) === s.region && geo.landSigned(p[0], p[1]) > 10
      : dist(p, region.centroid!) <= region.radius! * 0.95;
  // Stay in the theme's share of the region: closer to its own anchor than to the others (with a margin on sky, so islets stay apart).
  const inTheme = (p: Vec2) => {
    if (!ctx.anchor) return true;
    const own = dist(p, ctx.anchor);
    const margin = layer === 'sky' ? PLACEMENT.skyIsletMargin : 0;
    const others = [...ctx.siblings.filter((a) => a !== ctx.anchor), ...(layer === 'sky' ? [region.centroid!] : [])];
    return others.every((a) => own + margin <= dist(p, a));
  };

  // A same-region, same-theme predecessor that's already placed.
  const pred = s.after
    .map((id) => ctx.world.shrineById.get(id))
    .find((p) => p && p.region === s.region && p.theme === s.theme && ctx.positions.has(p.id));
  const predPos = pred ? ctx.positions.get(pred.id)! : undefined;

  const themeSpread = layer === 'sky' ? 22 : Math.min(50, Math.max(28, themeRadius(ctx) * 0.28));
  const propose = (spacing: number, attempt: number): Vec2 | null => {
    if (s.kind === 'temple') return sampleTemple(s, ctx, rand, attempt);
    if (predPos && attempt < 400) {
      // Next to the predecessor.
      const t = rand() * 2 * Math.PI;
      const r = spacing * (1 + rand() * (PLACEMENT.followUpReach - 1));
      return [predPos[0] + r * Math.cos(t), predPos[1] + r * Math.sin(t)];
    }
    if (ctx.anchor) return gaussianAround(ctx.anchor, themeSpread * (1 + attempt / 300), rand);
    return uniformInRegion(s, layer, geo, region, rand);
  };

  let spacing = PLACEMENT.spacing[layer];
  let useTheme = true;
  for (;;) {
    for (let attempt = 0; attempt < PLACEMENT.attemptsPerLevel; attempt++) {
      const p = propose(spacing, attempt);
      if (p && inRegion(p) && (!useTheme || s.kind === 'temple' || inTheme(p)) && clear(p, spacing)) return { p, spacing };
    }
    if (spacing <= PLACEMENT.minSpacing) {
      if (useTheme) { useTheme = false; spacing = PLACEMENT.spacing[layer]; continue; }
      for (;;) {
        const p = uniformInRegion(s, layer, geo, region, rand);
        if (p && inRegion(p)) return { p, spacing: 0 };
      }
    }
    spacing = Math.max(PLACEMENT.minSpacing, spacing * PLACEMENT.relax);
  }
}

/** Rough radius of a theme's share of the region: distance to the nearest sibling anchor, halved. */
function themeRadius(ctx: Ctx): number {
  if (!ctx.anchor) return 80;
  const d = Math.min(...ctx.siblings.filter((a) => a !== ctx.anchor).map((a) => dist(a, ctx.anchor!)), 240);
  return Math.max(50, d / 2);
}

function gaussianAround(c: Vec2, sigma: number, rand: () => number): Vec2 {
  // Box–Muller.
  const u = Math.max(rand(), 1e-9);
  const v = rand();
  const r = sigma * Math.sqrt(-2 * Math.log(u));
  return [c[0] + r * Math.cos(2 * Math.PI * v), c[1] + r * Math.sin(2 * Math.PI * v)];
}

function uniformInRegion(s: Shrine, layer: Surf, geo: Geometry, region: Region, rand: () => number): Vec2 | null {
  if (layer === 'sky') {
    const R = region.radius!;
    const [cx, cy] = region.centroid!;
    return [cx + (rand() * 2 - 1) * R, cy + (rand() * 2 - 1) * R];
  }
  const b = geo.bbox[geo.surfaceIndex.get(s.region)!]!;
  return [b.minX + rand() * (b.maxX - b.minX), b.minY + rand() * (b.maxY - b.minY)];
}

/**
 * A point 60–85% of the way from the centroid to the region border (§8.3). The ray points toward the temple's
 * same-region `needs` when there are any, so the capstone sits at the end of the trail. Later attempts widen the angle.
 */
function sampleTemple(s: Shrine, ctx: Ctx, rand: () => number, attempt: number): Vec2 | null {
  const { world, geo } = ctx;
  const c = world.regionById.get(s.region)!.centroid!;
  const needPts = s.needs
    .map((id) => world.shrineById.get(id))
    .map((n) => (n?.layer === 'depths' && n.below ? world.shrineById.get(n.below) : n))
    .filter((n): n is Shrine => !!n && n.region === s.region && ctx.positions.has(n.id))
    .map((n) => ctx.positions.get(n.id)!);
  let theta = rand() * 2 * Math.PI;
  if (needPts.length) {
    const mx = needPts.reduce((a, p) => a + p[0], 0) / needPts.length;
    const my = needPts.reduce((a, p) => a + p[1], 0) / needPts.length;
    const spread = Math.min(Math.PI, 0.35 + attempt / 150);
    theta = Math.atan2(my - c[1], mx - c[0]) + (rand() * 2 - 1) * spread;
  }
  const dx = Math.cos(theta);
  const dy = Math.sin(theta);
  let d = 0;
  while (d < 2000 && geo.regionAt(c[0] + dx * d, c[1] + dy * d) === s.region) d += 2;
  const [lo, hi] = PLACEMENT.templeBand;
  const t = lo + rand() * (hi - lo);
  const p: Vec2 = [c[0] + dx * d * t, c[1] + dy * d * t];
  return geo.regionAt(p[0], p[1]) === s.region ? p : null;
}
