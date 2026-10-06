import { contours } from 'd3-contour';
import { explorerRing, type Explored, type RegionExplored } from './explore.ts';
import { buildFeatures } from './features.ts';
import type { Geometry } from './geometry.ts';
import type { HorizonCard, MapData, MapGeometry, MapRegion, MapShrine, MapTheme, MultiPolygon } from './mapdata.ts';
import { themeKey, themesByRegion } from './placement.ts';
import { hash32, mulberry32 } from './prng.ts';
import { trail, regionStats, searchText, shrineHours } from './progress.ts';
import type { Region, RequireTag, Vec2, World } from './types.ts';
import { titleKnown, type VisibilityConfig, type VisibilityResult } from './visibility.ts';
import type { ShrineWork } from './work.ts';

/** Grid step (world units) for region outlines and ridges. */
const OUTLINE_STEP = 4;
/** Grid step for elevation contours (§8.5: "a coarse grid"). */
const CONTOUR_STEP = 8;

const q = (v: number, digits: number) => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};

/** Run marching squares on a lattice sampled at x = i*step, and map back to world units. */
function contour(values: Float64Array, n: number, m: number, step: number, threshold: number, digits = 1): MultiPolygon {
  const [g] = contours().size([n, m]).thresholds([threshold])(Array.from(values));
  if (!g) return [];
  return g.coordinates.map((poly) => poly.map((ring) => ring.map((pt) => [q((pt[0]! - 0.5) * step, digits), q((pt[1]! - 0.5) * step, digits)] as Vec2)));
}

export function buildGeometry(world: World, geo: Geometry, positions: Map<string, Vec2>): MapGeometry {
  const n = Math.floor(geo.width / OUTLINE_STEP) + 1;
  const m = Math.floor(geo.height / OUTLINE_STEP) + 1;
  const k = geo.surface.length;
  const land = new Float64Array(n * m);
  const dists = new Float64Array(n * m * k);
  for (let j = 0; j < m; j++) {
    for (let i = 0; i < n; i++) {
      const x = i * OUTLINE_STEP;
      const y = j * OUTLINE_STEP;
      const cell = j * n + i;
      land[cell] = geo.landSigned(x, y);
      const [wx, wy] = geo.warp(x, y);
      geo.surface.forEach((r, ri) => {
        dists[cell * k + ri] = Math.hypot(wx - r.centroid![0], wy - r.centroid![1]);
      });
    }
  }

  // Region outlines: field_i = min(nearest other distance - own distance, land) is > 0 exactly inside region i.
  const regions: MapGeometry['regions'] = {};
  geo.surface.forEach((r, ri) => {
    const f = new Float64Array(n * m);
    for (let c = 0; c < n * m; c++) {
      let other = Infinity;
      for (let rj = 0; rj < k; rj++) if (rj !== ri) other = Math.min(other, dists[c * k + rj]!);
      f[c] = Math.min(other - dists[c * k + ri]!, land[c]!);
    }
    regions[r.id] = contour(f, n, m, OUTLINE_STEP, 0);
  });

  // Ridges: the zero set of d_b - d_a, kept only where a and b are the two nearest regions and on land.
  const ridges: MapGeometry['ridges'] = [];
  for (const key of [...geo.adjacency.keys()].sort()) {
    const [a, b] = key.split('|') as [string, string];
    const ia = geo.surfaceIndex.get(a)!;
    const ib = geo.surfaceIndex.get(b)!;
    const f = new Float64Array(n * m);
    for (let c = 0; c < n * m; c++) f[c] = dists[c * k + ib]! - dists[c * k + ia]!;
    const onBorder = ([x, y]: Vec2) => {
      if (geo.landSigned(x, y) <= 0) return false;
      const t = geo.nearestTwo(x, y);
      return (t.i1 === ia && t.i2 === ib) || (t.i1 === ib && t.i2 === ia);
    };
    const lines: Vec2[][] = [];
    for (const poly of contour(f, n, m, OUTLINE_STEP, 0)) {
      for (const ring of poly) {
        let run: Vec2[] = [];
        for (const p of ring) {
          if (onBorder(p)) run.push(p);
          else {
            if (run.length > 1) lines.push(run);
            run = [];
          }
        }
        if (run.length > 1) lines.push(run);
      }
    }
    ridges.push({ between: [a, b], h: geo.ridgeHeight(a, b), lines });
  }

  // Coastline.
  const coast = contour(land, n, m, OUTLINE_STEP, 0);

  // Elevation contours, including the prominence field (§8.5).
  const cn = Math.floor(geo.width / CONTOUR_STEP) + 1;
  const cm = Math.floor(geo.height / CONTOUR_STEP) + 1;
  const peaks = world.shrines
    .filter((s) => s.layer === 'surface' && positions.has(s.id))
    .map((s) => ({ p: positions.get(s.id)!, w: s.p / 5 }));
  const elev = new Float64Array(cn * cm);
  let max = 0;
  for (let j = 0; j < cm; j++) {
    for (let i = 0; i < cn; i++) {
      const x = i * CONTOUR_STEP;
      const y = j * CONTOUR_STEP;
      let e = geo.elevation(x, y);
      if (geo.landSigned(x, y) > 0) {
        let field = 0;
        for (const { p, w } of peaks) field += w * Math.exp(-((x - p[0]) ** 2 + (y - p[1]) ** 2) / (2 * 45 * 45));
        e += 0.35 * Math.min(field, 1.5);
      }
      elev[j * cn + i] = e;
      max = Math.max(max, e);
    }
  }
  const levels: MapGeometry['contours'] = [];
  for (let v = 0.15; v < max; v += 0.1) {
    levels.push({ value: q(v, 2), polygons: contour(elev, cn, cm, CONTOUR_STEP, v, 0) });
  }

  const islands: MapGeometry['islands'] = {};
  for (const r of geo.sky) islands[r.id] = archipelago(world, geo, r, positions);

  const shrineXY = world.shrines.filter((s) => s.layer === 'surface' && positions.has(s.id)).map((s) => positions.get(s.id)!);
  const features = buildFeatures(geo, ridges, coast, shrineXY);
  return { coast, regions, ridges, contours: levels, islands, depths: depthsTerrain(world, geo, positions, land, n, m), features };
}

/**
 * Islets as metaballs around the placed shrines: one per theme, a rock for the tower, plus a few bare rocks.
 * Drawn from positions, so adding a shrine grows its islet and never moves anything.
 */
function archipelago(world: World, geo: Geometry, region: Region, positions: Map<string, Vec2>): MultiPolygon {
  const [cx, cy] = region.centroid!;
  const R = region.radius!;
  const members = world.shrines.filter((s) => s.region === region.id && positions.has(s.id));
  const groups = new Map<string, { pts: Vec2[]; sigma: number }>();
  for (const s of members) {
    const key = s.kind === 'tower' ? '#tower' : s.theme ? `theme:${s.theme}` : `solo:${s.id}`;
    const g = groups.get(key) ?? { pts: [], sigma: s.kind === 'tower' ? 16 : 17 };
    g.pts.push(positions.get(s.id)!);
    groups.set(key, g);
  }
  // Bare rocks: seeded spots well clear of every shrine.
  const rand = mulberry32(hash32(`rocks:${region.id}`));
  const occupied = members.map((s) => positions.get(s.id)!);
  const rocks = 3 + (hash32(region.id) % 3);
  for (let placedRocks = 0, tries = 0; placedRocks < rocks && tries < 400; tries++) {
    const t = rand() * 2 * Math.PI;
    const d = R * (0.35 + rand() * 0.75);
    const p: Vec2 = [cx + d * Math.cos(t), cy + d * Math.sin(t)];
    if (occupied.every((o) => Math.hypot(o[0] - p[0], o[1] - p[1]) > 58)) {
      groups.set(`rock:${placedRocks++}`, { pts: [p], sigma: 5 + rand() * 4 });
      occupied.push(p);
    }
  }

  const step = 3;
  const x0 = cx - R * 1.4;
  const y0 = cy - R * 1.4;
  const n = Math.ceil((R * 2.8) / step) + 1;
  const f = new Float64Array(n * n);
  const list = [...groups.values()];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = x0 + i * step;
      const y = y0 + j * step;
      let best = 0;
      for (const g of list) {
        let sum = 0;
        const k = 2 * g.sigma * g.sigma;
        for (const p of g.pts) sum += Math.exp(-((x - p[0]) ** 2 + (y - p[1]) ** 2) / k);
        if (sum > best) best = sum;
      }
      f[j * n + i] = best * (1 + 0.3 * geo.isletNoise(x, y));
    }
  }
  return contour(f, n, n, step, 0.45).map((poly) => poly.map((ring) => ring.map(([x, y]) => [q(x + x0, 1), q(y + y0, 1)] as Vec2)));
}

/** Depths terrain beneath the landmass: vein territories (nearest wellspring's vein) and rock strata. Rendering only. */
function depthsTerrain(world: World, geo: Geometry, positions: Map<string, Vec2>, land: Float64Array, n: number, m: number): MapGeometry['depths'] {
  const veinIds = world.regions.filter((r) => r.layer === 'depths').map((r) => r.id);
  const roots = veinIds.map((v) => world.shrines.filter((s) => s.region === v && positions.has(s.id)).map((s) => positions.get(s.id)!));
  const nearest = new Float64Array(n * m * veinIds.length);
  for (let j = 0; j < m; j++) {
    for (let i = 0; i < n; i++) {
      const [wx, wy] = geo.warp(i * OUTLINE_STEP, j * OUTLINE_STEP);
      const cell = j * n + i;
      roots.forEach((pts, vi) => {
        let d = Infinity;
        for (const p of pts) d = Math.min(d, Math.hypot(wx - p[0], wy - p[1]));
        nearest[cell * veinIds.length + vi] = d;
      });
    }
  }
  const veins: MapGeometry['depths']['veins'] = {};
  veinIds.forEach((v, vi) => {
    if (!roots[vi]!.length) return;
    const f = new Float64Array(n * m);
    for (let c = 0; c < n * m; c++) {
      let other = Infinity;
      for (let vj = 0; vj < veinIds.length; vj++) if (vj !== vi) other = Math.min(other, nearest[c * veinIds.length + vj]!);
      f[c] = Math.min(other - nearest[c * veinIds.length + vi]!, land[c]!);
    }
    veins[v] = contour(f, n, m, OUTLINE_STEP, 0);
  });
  // Strata: level sets of rock noise, both signs, clipped to land.
  const strata: MultiPolygon[] = [];
  for (const sign of [1, -1]) {
    const f = new Float64Array(n * m);
    for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) {
      const c = j * n + i;
      f[c] = Math.min(sign * geo.strata(i * OUTLINE_STEP, j * OUTLINE_STEP), land[c]! / 20);
    }
    for (const t of [0.12, 0.3, 0.5]) strata.push(contour(f, n, m, OUTLINE_STEP, t, 0));
  }
  return { veins, strata };
}

/** Visibility and derived state for buildMapData. Without it every shrine is revealed (tests, atlas). */
export interface MapState {
  work: Map<string, ShrineWork>;
  sight: VisibilityResult;
  explored: Explored;
  /** How much of each surface region's land is explored. */
  exploredShare: Map<string, RegionExplored>;
  config: VisibilityConfig;
  available: RequireTag[];
  horizon: HorizonCard[];
  pin: string | null;
  week: string;
}

/** Assemble map.json. */
export function buildMapData(
  world: World, geo: Geometry, positions: Map<string, Vec2>, anchors: Map<string, Vec2> = new Map(),
  state: MapState | null = null, builtAt = Date.now(), geometry?: MapGeometry,
): MapData {
  const work = state?.work ?? new Map<string, ShrineWork>();
  const active = (id: string) => ['in-progress', 'cleared'].includes(work.get(id)?.status ?? 'untouched');
  const skyIds = new Set(world.shrines.filter((s) => s.layer === 'sky').map((s) => s.id));
  const shrines: MapShrine[] = world.shrines.map((s) => {
    const w = work.get(s.id);
    const visibility = state?.sight.visibility.get(s.id) ?? 'revealed';
    const marks: MapShrine['marks'] = {};
    if (s.layer === 'surface') {
      if (active(s.id) && world.shrines.some((d) => d.below === s.id)) marks.chasm = true;
      if (s.links.some((l) => skyIds.has(l)) || world.shrines.some((o) => o.layer === 'sky' && o.links.includes(s.id))) marks.draft = true;
    }
    const known = state ? titleKnown(visibility, s.p, state.config) : true;
    const out: MapShrine = {
      id: s.id, title: s.title, region: s.region, layer: s.layer, kind: s.kind, p: s.p, size: s.size,
      requires: s.requires, after: s.after, links: s.links, needs: s.needs, prompt: s.prompt, done: s.done,
      xy: positions.get(s.id)!, status: w?.status ?? 'untouched', visibility,
      titleKnown: known, search: searchText(s, visibility, known),
      charted: s.layer !== 'surface' || !state || state.explored.has(...positions.get(s.id)!), marks,
      unavailable: state ? s.requires.filter((t) => !state.available.includes(t)) : [],
      committed: w?.committed ?? false, touches: w?.touches ?? [], remnote: w?.remnote ?? 0,
    };
    if (s.below) out.below = s.below;
    if (s.from) out.from = s.from;
    if (s.theme) out.theme = s.theme;
    if (w?.startedAt) out.startedAt = w.startedAt;
    if (w?.clearedAt) out.clearedAt = w.clearedAt;
    if (w?.camp) out.camp = w.camp;
    if (w?.hours !== undefined) out.hours = w.hours;
    const h = w && w.status !== 'untouched' ? shrineHours(w.hours, w.touches) : undefined;
    if (h) out.hoursEstimate = h;
    if (w?.writeup !== undefined) out.writeup = w.writeup;
    return out;
  });
  const byId = new Map(shrines.map((s) => [s.id, s]));
  const stats = regionStats(
    world, (id) => byId.get(id)!.status === 'cleared', (id) => byId.get(id)!.visibility, (id) => byId.get(id)!.hoursEstimate,
  );
  const themes: MapTheme[] = [];
  for (const [region, names] of themesByRegion(world)) {
    const layer = world.regionById.get(region)!.layer;
    for (const name of names) {
      const anchor = anchors.get(themeKey(region, name));
      if (!anchor) continue;
      const members = world.shrines.filter((s) => s.region === region && s.theme === name).map((s) => s.id);
      themes.push({ region, layer, name, anchor, members });
    }
  }
  return {
    version: 1,
    builtAt,
    canvas: world.canvas,
    start: world.start,
    regions: world.regions.map((r) => {
      const out: MapRegion = { ...r, stats: stats.get(r.id)! };
      if (state?.sight.surveyed.has(r.id)) out.surveyed = true;
      const ex = state?.exploredShare.get(r.id);
      if (ex) out.explored = { share: Math.round(ex.share * 100) / 100, centre: ex.centre };
      return out;
    }),
    shrines,
    themes,
    sight: buildSight(world, positions, state),
    path: trail(world, (id) => work.get(id)?.clearedAt),
    horizon: state?.horizon ?? [],
    pin: state?.pin ?? null,
    week: state?.week ?? '',
    geometry: geometry ?? buildGeometry(world, geo, positions),
  };
}


function buildSight(world: World, positions: Map<string, Vec2>, state: MapState | null): MapData['sight'] {
  const cfg = state?.config;
  const lights: MapData['sight']['lights'] = [];
  for (const s of world.shrines) {
    if (s.layer !== 'depths' || !state) continue;
    const kind = state.sight.lit.has(s.id) ? 'light' : state.sight.glowing.has(s.id) ? 'glow' : null;
    if (kind) lights.push({ xy: positions.get(s.id)!, region: s.region, kind });
  }
  return {
    vantages: state ? state.sight.vantages.map((v) => ({ xy: v.xy, tower: v.tower })) : [],
    explored: state ? state.explored.explorers.map(explorerRing) : [],
    lights,
    lightRadius: cfg?.lightRadius ?? 0,
    glowRadius: cfg?.glowRadius ?? 0,
  };
}
