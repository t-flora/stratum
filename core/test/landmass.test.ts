import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  Geometry, RANGE_MIN_H, SEED_PATH, buildGeometry, buildLandmass, landmassProblems, lintGeometry, loadConfig, loadWorld, parseWorld, placeShrines,
  type Region, type World,
} from '../src/index.ts';

const root = join(import.meta.dirname, '..', '..');
const world = loadWorld(root).world!;
const seed = loadConfig(root).world.seed;

function synthetic(centroids: [number, number][]): World {
  const regions: Region[] = centroids.map((c, i) => ({ id: `r${i}`, layer: 'surface', name: `R${i}`, centroid: c }));
  return {
    canvas: { width: 1600, height: 1000 }, start: { vantage: centroids[0]!, plateau: [] }, regions,
    ridges: { default: 2, overrides: [] }, shrines: [], regionById: new Map(regions.map((r) => [r.id, r])), shrineById: new Map(),
  };
}

describe('the continent (M6)', () => {
  it('passes its guarantees on the seed world, with no geometry warnings', () => {
    const geo = new Geometry(world, seed);
    expect(lintGeometry(world, geo)).toEqual([]);
  });

  it('is deterministic for (regions, seed), and changes with the seed', () => {
    const a = new Geometry(world, seed);
    const b = new Geometry(world, seed);
    expect(Buffer.from(a.cells.buffer).equals(Buffer.from(b.cells.buffer))).toBe(true);
    expect(a.lakes).toEqual(b.lakes);
    const c = new Geometry(world, seed + 1);
    expect(Buffer.from(a.cells.buffer).equals(Buffer.from(c.cells.buffer))).toBe(false);
  });

  it('is not an ellipse: it has bays, islets and a lake on the seed world', () => {
    const geo = new Geometry(world, seed);
    expect(geo.islets.length).toBeGreaterThan(0);
    expect(geo.lakes.length).toBeGreaterThan(0);
    for (const l of geo.lakes) expect(geo.landSigned(...l.xy)).toBeLessThan(0); // water inside the land
    for (const s of geo.islets) expect(geo.landSigned(...s.xy)).toBeGreaterThan(0);
  });

  it('keeps every centroid on land, well clear of the coast', () => {
    const land = buildLandmass(world.regions.filter((r) => r.layer === 'surface'), 1600, 1000, seed);
    for (const r of world.regions.filter((x) => x.layer === 'surface')) expect(land.at(...r.centroid!), r.id).toBeGreaterThan(40);
  });

  it('reports a continent in pieces', () => {
    // Two regions 1200 apart: each lobe is at most ~250 across, so the sea runs between them.
    const w = synthetic([[200, 500], [1400, 500]]);
    const problems = landmassProblems(new Geometry(w, seed));
    expect(problems.map((p) => p.code)).toContain('landmass');
    expect(problems[0]!.message).toMatch(/cut off from r0 by water/);
  });
});

describe('biomes (M6)', () => {
  const text = readFileSync(join(root, SEED_PATH), 'utf8');
  const parse = (t: string) => parseWorld({ file: SEED_PATH, text: t });

  it('every surface region in the seed has one, and they load', () => {
    for (const r of world.regions.filter((x) => x.layer === 'surface')) expect(r.biome, r.id).toBeDefined();
  });

  it('rejects an unknown biome and ignores one on a sky island', () => {
    const bad = parse(text.replace('biome: plateau', 'biome: volcano'));
    expect(bad.diagnostics.find((d) => d.severity === 'error')?.message).toMatch(/biome must be one of/);
    const sky = parse(text.replace('centroid: [330, 760],  radius: 170 }', 'centroid: [330, 760],  radius: 170, biome: woods }'));
    expect(sky.diagnostics.some((d) => d.severity === 'warning' && /only applies to surface/.test(d.message))).toBe(true);
    expect(sky.world!.regionById.get('agentic-forge')!.biome).toBeUndefined();
  });

  it('shape the ground: the marsh lies lower than the highlands', () => {
    const geo = new Geometry(world, seed);
    const at = (id: string) => geo.elevation(...world.regionById.get(id)!.centroid!);
    expect(at('interp-engineering')).toBeLessThan(at('metaprogramming'));
  });
});

describe('features (M6)', () => {
  const geo = new Geometry(world, seed);
  const { positions } = placeShrines(world, geo);
  const a = buildGeometry(world, geo, positions).features;

  it('are deterministic', () => {
    expect(buildGeometry(world, geo, positions).features).toEqual(a);
  });

  it('every high ridge is a mountain range, and peaks keep clear of shrine glyphs', () => {
    const high = world.ridges.overrides.filter((o) => o.h >= RANGE_MIN_H);
    expect(a.ranges.length).toBe(high.length);
    const glyphs = world.shrines.filter((s) => s.layer === 'surface').map((s) => positions.get(s.id)!);
    for (const r of a.ranges) for (const p of r.peaks) for (const g of glyphs) expect(Math.hypot(g[0] - p.xy[0], g[1] - p.xy[1])).toBeGreaterThan(15);
  });

  it('rivers flow to water, or into another river', () => {
    expect(a.rivers.length).toBeGreaterThan(3);
    const ends = a.rivers.map((r) => r.line.at(-1)!);
    for (const r of a.rivers) {
      const end = r.line.at(-1)!;
      const intoWater = geo.landSigned(...end) <= 2;
      // A junction is a point on a longer river that was traced first (its mouth comes later in the list or earlier: any).
      const intoRiver = a.rivers.some((o) => o !== r && o.line.slice(0, -1).some((p) => Math.hypot(p[0] - end[0], p[1] - end[1]) < 7));
      expect(intoWater || intoRiver, r.id).toBe(true);
    }
    expect(new Set(a.rivers.map((r) => r.id)).size).toBe(a.rivers.length);
    expect(ends.length).toBe(a.rivers.length);
  });

  it('lakes are listed with ids, and nothing has a name yet', () => {
    expect(a.lakes.map((l) => l.id)).toEqual(geo.lakes.map((_, i) => `lake-${i + 1}`));
    for (const f of [...a.ranges, ...a.rivers, ...a.lakes]) expect(f.name).toBeUndefined();
  });
});
