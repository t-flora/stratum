import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG, bearing, computeHorizon, firstSentence, isoWeek,
  type HorizonInput, type HorizonShrineState, type Region, type RequireTag, type Shrine, type Vec2, type World,
} from '../src/index.ts';

const REGIONS: Region[] = [
  { id: 'west', layer: 'surface', name: 'West', centroid: [300, 500] },
  { id: 'east', layer: 'surface', name: 'East', centroid: [1200, 500] },
  { id: 'north', layer: 'surface', name: 'North', centroid: [800, 150] },
  { id: 'isle', layer: 'sky', name: 'Isle', centroid: [300, 300], radius: 150 },
  { id: 'vein', layer: 'depths', name: 'Vein' },
];

type Spec = Partial<Shrine> & { id: string; region: string; xy: Vec2; st?: Partial<HorizonShrineState> };

/** A hand-built world with explicit positions and per-shrine state (default: untouched and revealed). */
function horizon(specs: Spec[], opts: { pin?: string; available?: RequireTag[]; week?: string } = {}) {
  const regionById = new Map(REGIONS.map((r) => [r.id, r]));
  const shrines: Shrine[] = specs.map((s, order) => ({
    title: s.id, kind: 'shrine', p: 2, size: 'M', requires: [], after: [], links: [], needs: [], prompt: `Build ${s.id}. Then measure it.`,
    done: 'd', source: 'seed', order, ...s, layer: regionById.get(s.region)!.layer,
  }));
  const world: World = {
    canvas: { width: 1600, height: 1000 }, start: { vantage: [100, 500], plateau: [] }, regions: REGIONS,
    ridges: { default: 2, overrides: [] }, shrines, regionById, shrineById: new Map(shrines.map((s) => [s.id, s])),
  };
  const states = new Map(specs.map((s) => [s.id, { status: 'untouched', visibility: 'revealed', ...s.st } as HorizonShrineState]));
  const input: HorizonInput = {
    world, positions: new Map(specs.map((s) => [s.id, s.xy] as [string, Vec2])), state: (id) => states.get(id)!,
    pin: opts.pin ?? null, available: opts.available ?? ['linux', 'llm-api'], config: DEFAULT_CONFIG, week: opts.week ?? '2026-W40',
  };
  const cards = computeHorizon(input);
  return { cards, input, slot: (slot: string) => cards.find((c) => c.slot === slot) };
}

const cleared = (clearedAt: string): Partial<HorizonShrineState> => ({ status: 'cleared', clearedAt });
const silhouette: Partial<HorizonShrineState> = { visibility: 'silhouette' };
const hidden: Partial<HorizonShrineState> = { visibility: 'hidden' };

/** A fresh start at (100, 500): nothing cleared, a few things in sight. */
const FRESH: Spec[] = [
  { id: 'near', region: 'west', xy: [200, 500] },
  { id: 'mid', region: 'west', xy: [400, 500] },
  { id: 'lurker', region: 'west', xy: [150, 520], p: 4, st: hidden },
  { id: 'sky-a', region: 'isle', xy: [250, 300] },
  { id: 'peak', region: 'east', xy: [900, 500], p: 3, st: silhouette },
  { id: 'tower-east', region: 'east', kind: 'tower', p: 5, xy: [500, 300], st: silhouette }, // within 450: not a far landmark
];

describe('helpers', () => {
  it('computes ISO weeks, including year boundaries', () => {
    expect(isoWeek(new Date('2026-09-28T12:00:00Z'))).toBe('2026-W40');
    expect(isoWeek(new Date('2027-01-01T12:00:00Z'))).toBe('2026-W53');
    expect(isoWeek(new Date('2021-01-03T12:00:00Z'))).toBe('2020-W53');
    expect(isoWeek(new Date('2026-01-01T12:00:00Z'))).toBe('2026-W01');
  });

  it('takes the first sentence and a compass bearing', () => {
    expect(firstSentence('Build a queue with\n  acquire/release. Then optimise it.')).toBe('Build a queue with acquire/release.');
    expect(firstSentence('No full stop')).toBe('No full stop');
    expect([bearing([0, 0], [0, -10]), bearing([0, 0], [10, 0]), bearing([0, 0], [0, 10]), bearing([0, 0], [-10, 0])]).toEqual([0, 90, 180, 270]);
  });
});

describe('the Horizon (§7, §13 M4)', () => {
  it('fills three distinct slots from a fresh start: nearest, other layer, far landmark', () => {
    const h = horizon(FRESH);
    expect(h.cards.map((c) => [c.slot, c.id, c.rule])).toEqual([
      ['thread', 'near', 'nearest'],
      ['vertical', 'sky-a', 'other-layer'],
      ['far', 'peak', 'landmark'],
    ]);
    expect(h.slot('thread')!.teaser).toBe('Build near.');
    expect(h.slot('far')!.teaser).toBeUndefined(); // a silhouette shows no prompt
    expect(h.slot('far')!.bearing).toBe(90);
    expect(h.slot('far')!.distance).toBe(800);
  });

  it('is deterministic for a given state and week', () => {
    expect(horizon(FRESH).cards).toEqual(horizon(FRESH).cards);
  });

  it('breaks Far Landmark ties by hash(week + id), so the pick is stable within a week and varies across weeks', () => {
    const twins: Spec[] = [
      { id: 'twin-a', region: 'east', xy: [1000, 400], p: 3, st: silhouette },
      { id: 'twin-b', region: 'east', xy: [1000, 600], p: 3, st: silhouette },
    ];
    const picks = new Set<string>();
    for (let w = 1; w <= 20; w++) {
      const week = `2026-W${String(w).padStart(2, '0')}`;
      const pick = horizon(twins, { week }).slot('far')!.id;
      expect(horizon(twins, { week }).slot('far')!.id).toBe(pick);
      picks.add(pick);
    }
    expect(picks).toEqual(new Set(['twin-a', 'twin-b']));
  });

  it('never shows a hidden shrine, in any slot', () => {
    const allHidden: Spec[] = FRESH.map((s) => ({ ...s, st: hidden }));
    expect(horizon(allHidden).cards).toEqual([]);
    for (const c of horizon(FRESH).cards) expect(c.id).not.toBe('lurker');
  });

  it('leaves out sealed temples and shrines this machine cannot run', () => {
    const h = horizon([
      { id: 'gpu-only', region: 'west', xy: [150, 500], requires: ['gpu'] },
      { id: 'sealed', region: 'west', kind: 'temple', p: 5, needs: ['mid'], xy: [160, 500], st: silhouette },
      { id: 'mid', region: 'west', xy: [400, 500] },
    ]);
    expect(h.slot('thread')!.id).toBe('mid');
    expect(horizon([{ id: 'gpu-only', region: 'west', xy: [150, 500], requires: ['gpu'] }], { available: ['gpu'] }).slot('thread')!.id).toBe('gpu-only');
  });

  describe('Slot 1: the Thread', () => {
    it('continues the most recently touched campfire', () => {
      const h = horizon([
        ...FRESH,
        { id: 'old-fire', region: 'east', xy: [1100, 600], st: { status: 'in-progress', lastTouched: 1000 } },
        { id: 'new-fire', region: 'east', xy: [1150, 600], st: { status: 'in-progress', lastTouched: 2000 } },
      ]);
      expect(h.slot('thread')).toMatchObject({ id: 'new-fire', rule: 'campfire' });
    });

    it('with a pin, picks the shrine "on the way" within the far distance', () => {
      const specs: Spec[] = [
        { id: 'behind', region: 'west', xy: [100, 600] }, // nearest (100) but away from the pin
        { id: 'on-the-way', region: 'west', xy: [400, 500] }, // 300 + 500
        { id: 'too-far', region: 'east', xy: [620, 500] }, // 520 + 280, but beyond 450 from L
        { id: 'goal', region: 'east', xy: [900, 500], p: 3, st: silhouette },
      ];
      expect(horizon(specs).slot('thread')).toMatchObject({ id: 'behind', rule: 'nearest' });
      expect(horizon(specs, { pin: 'goal' }).slot('thread')).toMatchObject({ id: 'on-the-way', rule: 'pin' });
    });

    it('ignores a pin on a cleared shrine, and falls back to nearest when nothing is on the way', () => {
      const specs: Spec[] = [
        { id: 'near', region: 'west', xy: [200, 500] },
        { id: 'done', region: 'east', xy: [900, 500], st: cleared('2026-09-01') },
      ];
      // L is now `done`, the latest clear; `near` is 700 away, beyond 450, so the pin rule finds nothing.
      expect(horizon(specs, { pin: 'done' }).slot('thread')).toMatchObject({ id: 'near', rule: 'nearest' });
    });
  });

  describe('Slot 2: the Vertical', () => {
    it('1: a glowing lightroot under a recent clear', () => {
      const h = horizon([
        { id: 'c1', region: 'west', xy: [300, 500], st: cleared('2026-09-20') },
        { id: 'root', region: 'vein', below: 'c1', xy: [300, 500], st: silhouette },
        { id: 'next', region: 'west', xy: [350, 520] },
        { id: 'sky-link', region: 'isle', xy: [300, 300], links: ['c1'] },
      ]);
      expect(h.slot('vertical')).toMatchObject({ id: 'root', rule: 'glow' });
    });

    it('2: a revealed sky shrine linked to a recent clear (either direction)', () => {
      const h = horizon([
        { id: 'c1', region: 'west', xy: [300, 500], st: cleared('2026-09-20'), links: [] },
        { id: 'next', region: 'west', xy: [350, 520] },
        { id: 'sky-link', region: 'isle', xy: [300, 300], links: ['c1'] },
        { id: 'sky-other', region: 'isle', xy: [320, 480] },
      ]);
      expect(h.slot('vertical')).toMatchObject({ id: 'sky-link', rule: 'sky' });
    });

    it('3: from the depths, the surface shrine above L', () => {
      const h = horizon([
        { id: 'up', region: 'west', xy: [300, 500] },
        { id: 'other', region: 'west', xy: [310, 510] },
        { id: 'deep', region: 'vein', below: 'up', xy: [300, 500], st: cleared('2026-09-20') },
      ]);
      expect(h.cards.map((c) => [c.slot, c.id, c.rule])).toContainEqual(['vertical', 'up', 'above']);
    });

    it('4: otherwise the nearest revealed candidate on another layer (covered by the fresh start)', () => {
      expect(horizon(FRESH).slot('vertical')).toMatchObject({ id: 'sky-a', rule: 'other-layer' });
    });
  });

  describe('Slot 3: the Far Landmark', () => {
    it('prefers the least-cleared region over prominence', () => {
      const h = horizon([
        { id: 'east-done', region: 'east', xy: [1400, 800], st: cleared('2026-09-01') },
        { id: 'l', region: 'west', xy: [100, 500], st: cleared('2026-09-10') },
        { id: 'east-p5', region: 'east', xy: [1200, 500], p: 5, st: silhouette },
        { id: 'north-p3', region: 'north', xy: [800, 150], p: 3, st: silhouette },
      ]);
      expect(h.slot('far')).toMatchObject({ id: 'north-p3', rule: 'landmark' });
    });

    it('falls back to an uncleared tower, then to a temple whose needs are met', () => {
      const base: Spec[] = [
        { id: 'near', region: 'west', xy: [200, 500] },
        { id: 'tower-east', region: 'east', kind: 'tower', p: 5, xy: [300, 450], st: silhouette },
      ];
      expect(horizon(base).slot('far')).toMatchObject({ id: 'tower-east', rule: 'tower' });
      const temple: Spec[] = [
        { id: 'near', region: 'west', xy: [200, 500] },
        { id: 'need', region: 'west', xy: [250, 600], st: cleared('2026-09-01') },
        { id: 'temple', region: 'west', kind: 'temple', p: 5, needs: ['need'], xy: [300, 450] },
      ];
      expect(horizon(temple).slot('far')).toMatchObject({ id: 'temple', rule: 'temple' });
    });
  });

  it('never repeats a shrine across slots', () => {
    const h = horizon([{ id: 'only', region: 'west', xy: [200, 500], p: 5, kind: 'tower', st: silhouette }]);
    expect(new Set(h.cards.map((c) => c.id)).size).toBe(h.cards.length);
    expect(h.cards).toHaveLength(1);
  });
});
