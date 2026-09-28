import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG, Geometry, computeVisibility, loadWorld, maxRidgeCrossed, placeShrines, sightRadius, titleKnown,
  type Region, type Shrine, type ShrineStatus, type Terrain, type Vec2, type World,
} from '../src/index.ts';

const cfg = DEFAULT_CONFIG.visibility;

/**
 * Synthetic terrain: three surface bands split at x = 600 and x = 1000, with sea above y = 100 and
 * a strait at 1100 < x < 1150. Ridges: west|mid 2 (the default), mid|east 4, west|east 2.
 */
const terrain: Terrain = {
  regionAt(x, y) {
    if (y < 100 || (x > 1100 && x < 1150)) return null;
    return x < 600 ? 'west' : x < 1000 ? 'mid' : 'east';
  },
  ridgeHeight(a, b) {
    const k = [a, b].sort().join('|');
    return k === 'east|mid' ? 4 : 2;
  },
};

const REGIONS: Region[] = [
  { id: 'west', layer: 'surface', name: 'West', centroid: [300, 500] },
  { id: 'mid', layer: 'surface', name: 'Mid', centroid: [800, 500] },
  { id: 'east', layer: 'surface', name: 'East', centroid: [1300, 500] },
  { id: 'isle', layer: 'sky', name: 'Isle', centroid: [800, 300], radius: 150 },
  { id: 'vein', layer: 'depths', name: 'Vein' },
];

type Spec = Partial<Shrine> & { id: string; region: string; xy: Vec2 };

/** A hand-built world plus positions; every shrine has an explicit position. */
function scene(specs: Spec[], opts: { vantage?: Vec2; plateau?: string[] } = {}) {
  const regionById = new Map(REGIONS.map((r) => [r.id, r]));
  const shrines: Shrine[] = specs.map((s, order) => ({
    title: s.id, kind: 'shrine', p: 2, size: 'M', requires: [], after: [], links: [], needs: [], prompt: 'p', done: 'd',
    source: 'seed', order, ...s, layer: regionById.get(s.region)!.layer,
  }));
  const world: World = {
    canvas: { width: 1600, height: 1000 },
    start: { vantage: opts.vantage ?? [300, 500], plateau: opts.plateau ?? [] },
    regions: REGIONS,
    ridges: { default: 2, overrides: [] },
    shrines,
    regionById,
    shrineById: new Map(shrines.map((s) => [s.id, s])),
  };
  const positions = new Map(specs.map((s) => [s.id, s.xy] as [string, Vec2]));
  return { world, positions };
}

function see(specs: Spec[], statuses: Record<string, ShrineStatus> = {}, opts: { vantage?: Vec2; plateau?: string[] } = {}) {
  const { world, positions } = scene(specs, opts);
  const res = computeVisibility(world, positions, (id) => statuses[id] ?? 'untouched', terrain, cfg);
  return { ...res, of: (id: string) => res.visibility.get(id) };
}

describe('line of sight', () => {
  it('is 0 within a region and the highest ridge crossed otherwise', () => {
    expect(maxRidgeCrossed(terrain, [200, 500], [550, 500])).toBe(0);
    expect(maxRidgeCrossed(terrain, [200, 500], [700, 500])).toBe(2);
    expect(maxRidgeCrossed(terrain, [200, 500], [1050, 500])).toBe(4);
    expect(maxRidgeCrossed(terrain, [1050, 500], [700, 500])).toBe(4);
  });

  it('skips sea samples and compares the regions on either shore', () => {
    expect(maxRidgeCrossed(terrain, [1050, 500], [1300, 500])).toBe(0);
    expect(maxRidgeCrossed(terrain, [950, 500], [1300, 500])).toBe(4);
  });

  it('R(p) = 150 + 90p', () => {
    expect([1, 2, 3, 4, 5].map((p) => sightRadius(cfg, p))).toEqual([240, 330, 420, 510, 600]);
  });
});

describe('surface rule (§6.2, §13 M3)', () => {
  it('p=2 shrines across a default ridge are hidden and p=3 ones are silhouettes', () => {
    const v = see([
      { id: 'near-p2', region: 'west', xy: [500, 500] },
      { id: 'across-p2', region: 'mid', xy: [650, 500] },
      { id: 'across-p3', region: 'mid', xy: [650, 520], p: 3 },
    ]);
    expect(v.of('near-p2')).toBe('revealed');
    expect(v.of('across-p2')).toBe('hidden');
    expect(v.of('across-p3')).toBe('silhouette');
  });

  it('an h=4 ridge hides p=3 (and p=4), while p=5 peeks over it', () => {
    const v = see(
      [
        { id: 'e3', region: 'east', xy: [1050, 500], p: 3 },
        { id: 'e4', region: 'east', xy: [1050, 540], p: 4 },
        { id: 'e5', region: 'east', xy: [1050, 580], p: 5 },
      ],
      {},
      { vantage: [950, 500] },
    );
    expect(v.of('e3')).toBe('hidden');
    expect(v.of('e4')).toBe('hidden');
    expect(v.of('e5')).toBe('silhouette');
  });

  it('a cleared tower reveals across an h=2 ridge, with its bonus radius', () => {
    const specs: Spec[] = [
      { id: 'tower-west', region: 'west', kind: 'tower', p: 5, xy: [500, 800] },
      { id: 'mid-far', region: 'mid', xy: [700, 400] },
    ];
    const vantage: Vec2 = [100, 150];
    expect(see(specs, {}, { vantage }).of('mid-far')).toBe('hidden');
    // An in-progress tower is an ordinary vantage: the ridge still hides p=2.
    expect(see(specs, { 'tower-west': 'in-progress' }, { vantage }).of('mid-far')).toBe('hidden');
    expect(see(specs, { 'tower-west': 'cleared' }, { vantage }).of('mid-far')).toBe('revealed');
  });

  it('a silhouette band reaches 1.6·R(p); beyond it a shrine is hidden', () => {
    // Same region, so H = 0: revealed within R(2) = 330, silhouette to 528, hidden beyond.
    const v = see([
      { id: 'a', region: 'west', xy: [300, 820] },
      { id: 'b', region: 'west', xy: [300, 990] },
      { id: 'c', region: 'west', xy: [300, 1040] },
    ]);
    expect([v.of('a'), v.of('b'), v.of('c')]).toEqual(['revealed', 'silhouette', 'hidden']);
  });

  it('applies the overrides: plateau, active shrines, surveyed regions, towers, locked temples', () => {
    const v = see(
      [
        { id: 'plat', region: 'east', xy: [1400, 500] },
        { id: 'camp', region: 'west', xy: [200, 900] },
        { id: 'tower-mid', region: 'mid', kind: 'tower', p: 5, xy: [800, 900] },
        { id: 'tower-east', region: 'east', kind: 'tower', p: 5, xy: [1500, 300] },
        { id: 'mid-deep', region: 'mid', xy: [850, 200] },
        { id: 'temple', region: 'west', kind: 'temple', p: 5, needs: ['plat'], xy: [400, 500] },
      ],
      { camp: 'in-progress', 'tower-mid': 'cleared' },
      { plateau: ['plat'] },
    );
    expect(v.of('plat')).toBe('revealed');
    expect(v.of('camp')).toBe('revealed');
    expect(v.of('tower-east')).toBe('silhouette');
    expect(v.surveyed).toEqual(new Set(['mid']));
    expect(v.of('mid-deep')).not.toBe('hidden');
    expect(v.of('temple')).toBe('silhouette');
    expect(v.vantages.map((x) => x.id ?? 'start')).toEqual(['start', 'camp', 'tower-mid']);
    expect(v.vantages.find((x) => x.id === 'tower-mid')!.tower).toBe(true);
  });

  it('a temple opens once its needs are cleared', () => {
    const specs: Spec[] = [
      { id: 'need', region: 'west', xy: [350, 500] },
      { id: 'temple', region: 'west', kind: 'temple', p: 5, needs: ['need'], xy: [400, 500] },
    ];
    expect(see(specs).of('temple')).toBe('silhouette');
    expect(see(specs, { need: 'cleared' }).of('temple')).toBe('revealed');
  });
});

describe('shelved work', () => {
  it('stays revealed itself but is no longer a vantage or a glow source', () => {
    const specs: Spec[] = [
      { id: 'shelf', region: 'mid', xy: [800, 500] },
      { id: 'beside', region: 'mid', xy: [900, 500] },
      { id: 'root', region: 'vein', below: 'shelf', xy: [800, 500] },
    ];
    const active = see(specs, { shelf: 'in-progress' });
    expect([active.of('beside'), active.of('root')]).toEqual(['revealed', 'silhouette']);
    const shelved = see(specs, { shelf: 'shelved' });
    expect(shelved.of('shelf')).toBe('revealed');
    expect(shelved.of('beside')).toBe('hidden');
    expect(shelved.of('root')).toBe('hidden');
    expect(shelved.vantages.map((v) => v.id ?? 'start')).toEqual(['start']);
  });
});

describe('sky rule (§6.3)', () => {
  const specs: Spec[] = [
    { id: 'tower-isle', region: 'isle', kind: 'tower', p: 5, xy: [800, 300] },
    { id: 'sky-a', region: 'isle', xy: [760, 280], links: ['ground'] },
    { id: 'sky-b', region: 'isle', xy: [840, 320] },
    { id: 'ground', region: 'west', xy: [350, 500] },
    { id: 'ground-2', region: 'west', xy: [350, 600], links: ['sky-b'] },
  ];

  it('sky shrines are never hidden; the tower is always revealed', () => {
    const v = see(specs);
    expect([v.of('tower-isle'), v.of('sky-a'), v.of('sky-b')]).toEqual(['revealed', 'silhouette', 'silhouette']);
  });

  it('a launch point (linked either way) opens a sky shrine once it is active', () => {
    const v = see(specs, { ground: 'in-progress', 'ground-2': 'cleared' });
    expect(v.of('sky-a')).toBe('revealed');
    expect(v.of('sky-b')).toBe('revealed');
  });

  it('clearing the island tower reveals the whole island', () => {
    expect(see(specs, { 'tower-isle': 'cleared' }).of('sky-b')).toBe('revealed');
  });
});

describe('depths rule (§6.4, §13 M3)', () => {
  const specs: Spec[] = [
    { id: 'above-1', region: 'west', xy: [300, 500] },
    { id: 'above-2', region: 'west', xy: [450, 500] },
    { id: 'above-3', region: 'mid', xy: [800, 500] },
    { id: 'root-1', region: 'vein', below: 'above-1', xy: [300, 500] },
    { id: 'root-2', region: 'vein', below: 'above-2', xy: [450, 500] },
    { id: 'root-3', region: 'vein', below: 'above-3', xy: [800, 500] },
  ];

  it('the depths are dark until something happens above', () => {
    const v = see(specs);
    expect(['root-1', 'root-2', 'root-3'].map(v.of)).toEqual(['hidden', 'hidden', 'hidden']);
    expect(v.lit.size + v.glowing.size).toBe(0);
  });

  it('glows appear under cleared and in-progress surface shrines', () => {
    const v = see(specs, { 'above-1': 'cleared', 'above-3': 'in-progress' });
    expect(v.of('root-1')).toBe('silhouette');
    expect(v.of('root-3')).toBe('silhouette');
    expect(v.of('root-2')).toBe('hidden');
    expect(v.glowing).toEqual(new Set(['root-1', 'root-3']));
  });

  it('a cleared lightroot lights everything within lightRadius', () => {
    const v = see(specs, { 'root-1': 'cleared' });
    expect(v.of('root-1')).toBe('revealed');
    expect(v.of('root-2')).toBe('revealed'); // 150 away
    expect(v.of('root-3')).toBe('hidden'); // 500 away
    expect(v.lit).toEqual(new Set(['root-1']));
  });
});

describe('silhouette titles', () => {
  it('show only for landmarks (p ≥ 3)', () => {
    expect(titleKnown('silhouette', 2, cfg)).toBe(false);
    expect(titleKnown('silhouette', 3, cfg)).toBe(true);
    expect(titleKnown('revealed', 1, cfg)).toBe(true);
    expect(titleKnown('hidden', 5, cfg)).toBe(false);
  });
});

describe('a fresh repo (tiny fixture, real geometry)', () => {
  it('shows only the plateau, what the start vantage sees, the towers and the sky', () => {
    const world = loadWorld(join(import.meta.dirname, '..', '..', 'fixtures', 'tiny')).world!;
    const geo = new Geometry(world, DEFAULT_CONFIG.world.seed);
    const { positions } = placeShrines(world, geo);
    const { visibility: v } = computeVisibility(world, positions, () => 'untouched', geo, cfg);
    const start = world.start.vantage;
    for (const s of world.shrines) {
      const vis = v.get(s.id)!;
      if (s.layer === 'depths') expect(vis, s.id).toBe('hidden');
      if (s.layer === 'sky') expect(vis, s.id).toBe(s.kind === 'tower' ? 'revealed' : 'silhouette');
      if (s.layer !== 'surface') continue;
      if (s.kind === 'tower') expect(vis, s.id).not.toBe('hidden');
      if (vis === 'revealed' && !world.start.plateau.includes(s.id)) {
        // Revealed means in plain sight of the start vantage: in range, with no ridge in between.
        const xy = positions.get(s.id)!;
        expect(Math.hypot(xy[0] - start[0], xy[1] - start[1]), s.id).toBeLessThanOrEqual(sightRadius(cfg, s.p));
        expect(maxRidgeCrossed(geo, start, xy), s.id).toBe(0);
      }
    }
    expect(v.get('a-one')).toBe('revealed');
    expect(v.get('c-one')).toBe('hidden'); // behind the h=4 ridge to the north
    expect(v.get('temple-x')).not.toBe('revealed');
  });
});
