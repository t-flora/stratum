import { describe, expect, it } from 'vitest';
import { estimateHours, heroPath, regionStats, searchText, shrineHours, type Region, type Shrine, type World } from '../src/index.ts';

const H = 3600;

describe('hours (§10.3)', () => {
  it('clusters commits with gaps under 2 h into sessions of span + 30 min', () => {
    expect(estimateHours([])).toBeUndefined();
    expect(estimateHours([1000])).toBe(0.5);
    // One session 09:00–10:30 (1.5 h + 0.5), then a gap of 3 h, then a lone commit (0.5).
    expect(estimateHours([0, H, 1.5 * H, 4.5 * H])).toBe(2.5);
    // A gap of exactly 2 h splits; just under joins.
    expect(estimateHours([0, 2 * H])).toBe(1);
    expect(estimateHours([0, 2 * H - 60])).toBe(2.5);
  });

  it('ignores commit order', () => {
    expect(estimateHours([4.5 * H, 0, 1.5 * H, H])).toBe(2.5);
  });

  it('prefers self-reported hours, and marks estimates', () => {
    expect(shrineHours(6, [0, H])).toEqual({ hours: 6, estimated: false });
    expect(shrineHours(undefined, [0, H])).toEqual({ hours: 1.5, estimated: true });
    expect(shrineHours(undefined, [])).toBeUndefined();
  });
});

const REGIONS: Region[] = [
  { id: 'west', layer: 'surface', name: 'West', centroid: [300, 500] },
  { id: 'isle', layer: 'sky', name: 'Isle', centroid: [800, 300], radius: 150 },
];
function world(specs: (Partial<Shrine> & { id: string; region: string })[]): World {
  const regionById = new Map(REGIONS.map((r) => [r.id, r]));
  const shrines: Shrine[] = specs.map((s, order) => ({
    title: s.id, kind: 'shrine', p: 2, size: 'M', requires: [], after: [], links: [], needs: [], prompt: `Build ${s.id}.`, done: 'd',
    source: 'seed', order, layer: regionById.get(s.region)!.layer, ...s,
  }));
  return {
    canvas: { width: 1600, height: 1000 }, start: { vantage: [300, 500], plateau: [] }, regions: REGIONS,
    ridges: { default: 2, overrides: [] }, shrines, regionById, shrineById: new Map(shrines.map((s) => [s.id, s])),
  };
}

describe("Hero's Path (§9.4)", () => {
  it('orders clears by date per layer, same-day clears in file order', () => {
    const w = world([
      { id: 'a', region: 'west' }, { id: 'b', region: 'west' }, { id: 'c', region: 'west' },
      { id: 'd', region: 'west' }, { id: 's', region: 'isle' },
    ]);
    const dates: Record<string, string> = { a: '2026-10-05', b: '2026-10-02', c: '2026-10-05', s: '2026-10-03' };
    const path = heroPath(w, (id) => dates[id]);
    expect(path.surface.map((x) => x.id)).toEqual(['b', 'a', 'c']);
    expect(path.sky).toEqual([{ id: 's', date: '2026-10-03' }]);
    expect(path.depths).toEqual([]);
  });
});

describe('region readout (§10.2)', () => {
  it('counts cleared, revealed and total, and sums hours', () => {
    const w = world([{ id: 'a', region: 'west' }, { id: 'b', region: 'west' }, { id: 'c', region: 'west' }]);
    const stats = regionStats(
      w, (id) => id === 'a', (id) => (id === 'c' ? 'hidden' : 'revealed'),
      (id) => ({ a: { hours: 4, estimated: false }, b: { hours: 1.5, estimated: true } })[id as 'a' | 'b'],
    );
    expect(stats.get('west')).toEqual({ cleared: 1, revealed: 2, total: 3, hours: 5.5, estimated: true });
    expect(stats.get('isle')).toEqual({ cleared: 0, revealed: 0, total: 0, hours: 0, estimated: false });
  });
});

describe('search text (§6.5)', () => {
  const [s] = world([{ id: 'spsc-ring-buffer', region: 'west', title: 'SPSC ring buffer', theme: 'Queues' }]).shrines;
  it('matches revealed shrines by title, theme and prompt', () => {
    const t = searchText(s!, 'revealed', true);
    expect(t).toContain('spsc ring buffer');
    expect(t).toContain('queues');
    expect(t).toContain('build spsc-ring-buffer');
  });
  it('matches named silhouettes by title only, and never hidden or unnamed shrines', () => {
    expect(searchText(s!, 'silhouette', true)).toBe('spsc ring buffer');
    expect(searchText(s!, 'silhouette', false)).toBe('');
    expect(searchText(s!, 'hidden', true)).toBe('');
  });
});
