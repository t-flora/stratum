import { contours } from 'd3-contour';
import type { Geometry } from './geometry.ts';
import type { MapData, MapGeometry, MapShrine, MultiPolygon } from './mapdata.ts';
import type { Vec2, World } from './types.ts';

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
  for (const r of geo.sky) islands[r.id] = geo.islandRing(r).map(([x, y]) => [q(x, 1), q(y, 1)]);

  return { coast, regions, ridges, contours: levels, islands };
}

/** Assemble map.json. M1: every shrine is revealed and untouched; derived state arrives in M2/M3. */
export function buildMapData(world: World, geo: Geometry, positions: Map<string, Vec2>): MapData {
  const shrines: MapShrine[] = world.shrines.map((s) => {
    const out: MapShrine = {
      id: s.id, title: s.title, region: s.region, layer: s.layer, kind: s.kind, p: s.p, size: s.size,
      requires: s.requires, links: s.links, needs: s.needs, prompt: s.prompt, done: s.done,
      xy: positions.get(s.id)!, status: 'untouched', visibility: 'revealed',
    };
    if (s.below) out.below = s.below;
    if (s.from) out.from = s.from;
    return out;
  });
  return {
    version: 1,
    canvas: world.canvas,
    start: world.start,
    regions: world.regions.map((r) => ({ ...r })),
    shrines,
    geometry: buildGeometry(world, geo, positions),
  };
}

