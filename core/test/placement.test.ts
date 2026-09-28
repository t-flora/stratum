import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  Geometry, PLACEMENT, PROPOSED_PATH, SEED_PATH, buildMapData, lintGeometry, loadWorld, parseWorld, placeShrines, serializeLock,
  type Vec2, type World,
} from '../src/index.ts';

const ROOT = join(import.meta.dirname, '..', '..');
const SEED = 20261002;
const seedText = readFileSync(join(ROOT, SEED_PATH), 'utf8');
const dist = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const worldOf = (seed = seedText, proposed?: string) =>
  parseWorld({ file: SEED_PATH, text: seed }, proposed ? { file: PROPOSED_PATH, text: proposed } : undefined).world!;

let world: World;
let geo: Geometry;
let first: ReturnType<typeof placeShrines>;

beforeAll(() => {
  world = worldOf();
  geo = new Geometry(world, SEED);
  first = placeShrines(world, geo);
});

describe('geometry', () => {
  it('is deterministic for a seed and changes with the seed', () => {
    const again = new Geometry(world, SEED);
    expect(Buffer.from(again.cells.buffer).equals(Buffer.from(geo.cells.buffer))).toBe(true);
    const other = new Geometry(world, SEED + 1);
    expect(Buffer.from(other.cells.buffer).equals(Buffer.from(geo.cells.buffer))).toBe(false);
  });

  it('gives every surface region land, and every ridge override a shared border', () => {
    expect(lintGeometry(world, geo)).toEqual([]);
    for (const o of world.ridges.overrides) expect(geo.isAdjacent(o.between[0], o.between[1])).toBe(true);
  });

  it('warns about a ridge override between regions that do not touch, with its line', () => {
    const text = seedText.replace('- { between: [cpp-core, metaprogramming], h: 1 }', '- { between: [low-latency, gpu-programming], h: 1 }');
    const w = worldOf(text);
    const warnings = lintGeometry(w, new Geometry(w, SEED));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ severity: 'warning', code: 'ridge-not-adjacent', line: text.split('\n').findIndex((l) => l.includes('[low-latency, gpu-programming]')) + 1 });
  });
});

describe('placement (M1 acceptance)', () => {
  it('produces identical positions across two builds, with or without the lockfile', () => {
    const again = placeShrines(world, new Geometry(world, SEED));
    expect(serializeLock(again.lock)).toBe(serializeLock(first.lock));
    const locked = placeShrines(world, geo, first.lock);
    expect(locked.placed).toEqual([]);
    expect(serializeLock(locked.lock)).toBe(serializeLock(first.lock));
  });

  it('adding shrines to proposed.yaml does not move any existing shrine', () => {
    const proposed = [
      'shrines:',
      '  - { id: new-surface, title: N, region: cpp-core, prompt: p, done: d, from: tower-cpp-core }',
      '  - { id: new-sky, title: N, region: design-archipelago, prompt: p, done: d, from: tower-design }',
      '  - { id: new-depth, title: N, region: compilers, below: godbolt-reading, prompt: p, done: d, from: godbolt-reading }',
    ].join('\n');
    const w2 = worldOf(seedText, proposed);
    const res = placeShrines(w2, new Geometry(w2, SEED), first.lock);
    for (const s of world.shrines) expect(res.positions.get(s.id), s.id).toEqual(first.positions.get(s.id));
    expect(res.placed.sort()).toEqual(['new-depth', 'new-sky', 'new-surface']);
    // The new lightroot joins godbolt-reading's ring without landing on a locked one.
    const anchor = res.positions.get('godbolt-reading')!;
    const newDepth = res.positions.get('new-depth')!;
    expect(dist(newDepth, anchor)).toBeCloseTo(PLACEMENT.depthsRing, 0);
    for (const id of ['asm-calling-convention', 'cc-write-a-pass']) expect(dist(newDepth, res.positions.get(id)!)).toBeGreaterThan(10);
  });

  it('places depths shrines under their `below`, ring-offset by id when shared', () => {
    const groups = new Map<string, string[]>();
    for (const s of world.shrines) if (s.below) groups.set(s.below, [...(groups.get(s.below) ?? []), s.id]);
    let shared = 0;
    for (const [below, ids] of groups) {
      const anchor = first.positions.get(below)!;
      ids.sort();
      ids.forEach((id, i) => {
        const p = first.positions.get(id)!;
        if (ids.length === 1) expect(p).toEqual(anchor);
        else {
          const a = (2 * Math.PI * i) / ids.length;
          expect(p[0]).toBeCloseTo(anchor[0] + PLACEMENT.depthsRing * Math.cos(a), 0);
          expect(p[1]).toBeCloseTo(anchor[1] + PLACEMENT.depthsRing * Math.sin(a), 0);
        }
      });
      if (ids.length > 1) shared++;
    }
    expect(shared).toBeGreaterThan(5); // the seed really exercises the ring
  });

  it('keeps surface and sky shrines inside their region, on land, and spaced out', () => {
    expect(first.relaxed).toEqual([]);
    for (const layer of ['surface', 'sky'] as const) {
      const shrines = world.shrines.filter((s) => s.layer === layer);
      for (const s of shrines) {
        const p = first.positions.get(s.id)!;
        if (layer === 'surface') expect(geo.regionAt(p[0], p[1]), s.id).toBe(s.region);
        else expect(geo.islandSigned(world.regionById.get(s.region)!, p[0], p[1]), s.id).toBeGreaterThan(0);
      }
      for (let i = 0; i < shrines.length; i++) {
        for (let j = i + 1; j < shrines.length; j++) {
          const d = dist(first.positions.get(shrines[i]!.id)!, first.positions.get(shrines[j]!.id)!);
          expect(d, `${shrines[i]!.id} / ${shrines[j]!.id}`).toBeGreaterThanOrEqual(PLACEMENT.spacing[layer] - 0.2);
        }
      }
    }
  });

  it('puts towers near the centroid and temples between the centroid and the border', () => {
    for (const s of world.shrines.filter((x) => x.kind === 'tower')) {
      expect(dist(first.positions.get(s.id)!, world.regionById.get(s.region)!.centroid!), s.id).toBeLessThanOrEqual(PLACEMENT.towerRadius);
    }
    for (const s of world.shrines.filter((x) => x.kind === 'temple')) {
      const c = world.regionById.get(s.region)!.centroid!;
      const p = first.positions.get(s.id)!;
      const dir: Vec2 = [(p[0] - c[0]) / dist(p, c), (p[1] - c[1]) / dist(p, c)];
      let border = 0;
      while (geo.regionAt(c[0] + dir[0] * border, c[1] + dir[1] * border) === s.region) border += 1;
      const ratio = dist(p, c) / border;
      expect(ratio, s.id).toBeGreaterThanOrEqual(0.58);
      expect(ratio, s.id).toBeLessThanOrEqual(0.87);
    }
  });

  it('--replace re-places only the named shrine; explicit xy always wins', () => {
    const res = placeShrines(world, geo, first.lock, ['raii-handles']);
    expect(res.placed).toEqual(['raii-handles']);
    for (const s of world.shrines) if (s.id !== 'raii-handles') expect(res.positions.get(s.id)).toEqual(first.positions.get(s.id));

    const pinned = worldOf(seedText.replace('- id: raii-handles\n', '- id: raii-handles\n  xy: [812.5, 480]\n'));
    const r2 = placeShrines(pinned, geo, first.lock);
    expect(r2.positions.get('raii-handles')).toEqual([812.5, 480]);
    expect(r2.lock['raii-handles']).toEqual([812.5, 480]);
  });
});

describe('map data', () => {
  it('has outlines for every region and island, and ridges for every override', () => {
    const map = buildMapData(world, geo, first.positions);
    for (const r of world.regions.filter((x) => x.layer === 'surface')) expect(map.geometry.regions[r.id]!.length, r.id).toBeGreaterThan(0);
    for (const r of world.regions.filter((x) => x.layer === 'sky')) expect(map.geometry.islands[r.id]!.length).toBe(128);
    for (const o of world.ridges.overrides) {
      const ridge = map.geometry.ridges.find((x) => x.between.includes(o.between[0]) && x.between.includes(o.between[1]));
      expect(ridge?.h).toBe(o.h);
      expect(ridge!.lines.length).toBeGreaterThan(0);
    }
    expect(map.shrines.every((s) => s.visibility === 'revealed' && s.status === 'untouched')).toBe(true);
  });

  it('the tiny fixture places every shrine', () => {
    const w = loadWorld(join(ROOT, 'fixtures/tiny')).world!;
    const res = placeShrines(w, new Geometry(w, SEED));
    expect(res.positions.size).toBe(w.shrines.length);
  });
});
