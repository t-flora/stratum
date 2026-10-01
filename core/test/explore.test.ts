import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG, EXPLORE_RAYS, Geometry, RIDGE_OVERSHOOT, computeExplored, computeVisibility, explorerRing, exploredShare,
  loadWorld, placeShrines, readLock, type Region, type Shrine, type ShrineStatus, type Terrain, type Vec2, type World,
} from '../src/index.ts';

const cfg = DEFAULT_CONFIG.visibility;

/** The visibility tests' bands: west | mid at x = 600 (h=2), mid | east at x = 1000 (h=4), sea above y = 100 and a strait in east. */
const terrain: Terrain = {
  regionAt(x, y) {
    if (y < 100 || y > 1000 || x < 0 || x > 1600 || (x > 1100 && x < 1150)) return null;
    return x < 600 ? 'west' : x < 1000 ? 'mid' : 'east';
  },
  ridgeHeight(a, b) {
    return [a, b].sort().join('|') === 'east|mid' ? 4 : 2;
  },
};

const REGIONS: Region[] = [
  { id: 'west', layer: 'surface', name: 'West', centroid: [300, 500] },
  { id: 'mid', layer: 'surface', name: 'Mid', centroid: [800, 500] },
  { id: 'east', layer: 'surface', name: 'East', centroid: [1300, 500] },
];

function explore(specs: { id: string; region: string; xy: Vec2; kind?: Shrine['kind'] }[], statuses: Record<string, ShrineStatus> = {}) {
  const regionById = new Map(REGIONS.map((r) => [r.id, r]));
  const shrines: Shrine[] = specs.map((s, order) => ({
    title: s.id, kind: 'shrine', p: 2, size: 'M', requires: [], after: [], links: [], needs: [], prompt: 'p', done: 'd',
    source: 'seed', order, layer: 'surface', ...s,
  }));
  const world: World = {
    canvas: { width: 1600, height: 1000 },
    start: { vantage: [300, 500], plateau: [] },
    regions: REGIONS,
    ridges: { default: 2, overrides: [] },
    shrines,
    regionById,
    shrineById: new Map(shrines.map((s) => [s.id, s])),
  };
  const positions = new Map(specs.map((s) => [s.id, s.xy] as [string, Vec2]));
  return { world, ex: computeExplored(world, positions, (id) => statuses[id] ?? 'untouched', terrain, cfg) };
}

describe('explored land (docs/plans/unknown.md)', () => {
  it('reaches R(2) from the start and stops just past the first high ridge', () => {
    const { ex } = explore([]);
    expect(ex.explorers).toHaveLength(1);
    expect(ex.has(300, 820)).toBe(true); // 320 away, same region
    expect(ex.has(300, 840)).toBe(false); // beyond R(2) = 330
    expect(ex.has(600 + RIDGE_OVERSHOOT - 2, 500)).toBe(true); // the ridge itself is in view
    expect(ex.has(620, 500)).toBe(false); // but not the land behind it
  });

  it('carries on over the sea, to land of the same region on the far shore', () => {
    const { ex } = explore([{ id: 'isle', region: 'east', xy: [1300, 500] }], { isle: 'in-progress' });
    expect(ex.has(1125, 500)).toBe(true); // the strait
    expect(ex.has(1050, 500)).toBe(true); // east again, beyond it
    expect(ex.has(300, 60)).toBe(false); // sea too, but out of range
  });

  it('grows from every shrine worked on, shelved ones included, and never from untouched ones', () => {
    const specs = [
      { id: 'here', region: 'mid', xy: [800, 500] as Vec2 },
      { id: 'there', region: 'mid', xy: [800, 800] as Vec2 },
    ];
    expect(explore(specs).ex.has(800, 500)).toBe(false);
    const { ex } = explore(specs, { here: 'in-progress', there: 'shelved' });
    expect(ex.explorers).toHaveLength(3);
    expect(ex.has(800, 500)).toBe(true);
    expect(ex.has(800, 950)).toBe(true);
    expect(ex.has(1050, 500)).toBe(false); // behind the h=4 ridge
  });

  it('a cleared tower sees farther and over ridges 2 lower, and charts its whole region', () => {
    const specs = [{ id: 'tower-mid', region: 'mid', xy: [800, 500] as Vec2, kind: 'tower' as const }];
    const { ex } = explore(specs, { 'tower-mid': 'cleared' });
    expect(ex.surveyed).toEqual(new Set(['mid']));
    expect(ex.has(300, 500)).toBe(true); // 500 away, across h=2 (counts as 0), within 630
    expect(ex.has(1005, 500)).toBe(true); // h=4 counts as 2: stops just past it
    expect(ex.has(1030, 500)).toBe(false);
    expect(ex.has(990, 990)).toBe(true); // the far corner of mid: surveyed, whatever the rays did
  });

  it('rings run through the ray tips', () => {
    const { ex } = explore([]);
    const ring = explorerRing(ex.explorers[0]!);
    expect(ring).toHaveLength(EXPLORE_RAYS);
    expect(ring[0]).toEqual([600 + RIDGE_OVERSHOOT, 500]); // due east: stopped at the ridge
    expect(ring[EXPLORE_RAYS / 2]![0]).toBeCloseTo(-30); // due west: R(2) = 330, out over the sea
  });

  it('reports how much of each region is explored, and the middle of that part', () => {
    const { world, ex } = explore([]);
    const share = exploredShare(world, terrain, ex);
    expect(share.get('west')!.share).toBeGreaterThan(0.3);
    expect(share.get('mid')!.share).toBeLessThan(0.05);
    expect(share.get('east')).toEqual({ share: 0, centre: null });
    const [cx] = share.get('west')!.centre!;
    expect(Math.abs(cx - 350)).toBeLessThan(80);
  });
});

describe('a fresh repo on the seed world (M4b acceptance)', () => {
  const root = join(import.meta.dirname, '..', '..');
  const world = loadWorld(root).world!;
  const geo = new Geometry(world, DEFAULT_CONFIG.world.seed);
  const { positions } = placeShrines(world, geo, readLock(root));
  const { visibility } = computeVisibility(world, positions, () => 'untouched', geo, cfg);
  const ex = computeExplored(world, positions, () => 'untouched', geo, cfg);
  const seen = world.shrines.filter((s) => visibility.get(s.id) !== 'hidden');
  const core = world.start.plateau.map((id) => world.shrineById.get(id)!.region)[0]!;

  it('shows 15–25% of all shrines, sky included', () => {
    expect(seen.length / world.shrines.length).toBeGreaterThanOrEqual(0.15);
    expect(seen.length / world.shrines.length).toBeLessThanOrEqual(0.25);
  });

  it('reveals the whole start region and some shrines in at least three others', () => {
    for (const s of world.shrines.filter((x) => x.region === core)) expect(visibility.get(s.id), s.id).toBe('revealed');
    const others = new Set(seen.filter((s) => s.layer === 'surface' && s.region !== core && s.kind === 'shrine').map((s) => s.region));
    expect(others.size).toBeGreaterThanOrEqual(3);
  });

  it('charts the start region and leaves most of the land unknown', () => {
    const share = exploredShare(world, geo, ex);
    expect(share.get(core)!.share).toBeGreaterThan(0.95);
    const land = [...share.values()];
    expect(land.filter((r) => r.share < 0.05).length).toBeGreaterThanOrEqual(5);
  });
});
