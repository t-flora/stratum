import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG, Geometry, lintDesign, loadConfig, loadWorld, parseWorld, placeShrines, readLock, SEED_PATH, type DesignCheck,
} from '../src/index.ts';

const ROOT = join(import.meta.dirname, '..', '..');
const tiny = readFileSync(join(ROOT, 'fixtures', 'tiny', SEED_PATH), 'utf8');

/** Design checks for a world given as seed text (the tiny fixture, edited). */
function design(text: string): Map<string, DesignCheck> {
  const { world, diagnostics } = parseWorld({ file: SEED_PATH, text });
  expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const geo = new Geometry(world!, DEFAULT_CONFIG.world.seed);
  const { positions, relaxed } = placeShrines(world!, geo);
  return new Map(lintDesign({ world: world!, geo, positions, relaxed, config: DEFAULT_CONFIG }).map((c) => [c.code, c]));
}
const ids = (c: DesignCheck | undefined) => c!.items.map((i) => i.id);
const shrine = (yaml: string) => `\n  - ${yaml}`;
/** Edit the tiny world's one-line entry for `id`. */
const edit = (text: string, id: string, fn: (line: string) => string) =>
  text.split('\n').map((l) => (l.includes(`{ id: ${id},`) ? fn(l) : l)).join('\n');

describe('stratum lint --design (M14)', () => {
  const base = design(tiny);

  it('a wall of ridges hides the world: discovery drops out of range', () => {
    expect(base.get('discovery')!.ok).toBe(false); // the tiny world shows more than half
    const walled = design(tiny.replace('default: 2', 'default: 4').replace('h: 4 }', 'h: 4 }\n    - { between: [west, east], h: 4 }'));
    const share = (c: DesignCheck) => Number(c.summary.replace('%', ''));
    expect(share(walled.get('discovery')!)).toBeLessThan(share(base.get('discovery')!));
  });

  it('catches a theme with no small entry point, and passes one that has it', () => {
    const themed = design(tiny
      + shrine('{ id: e-one, title: E1, region: east, theme: Heavy, size: L, after: [b-one], prompt: p, done: d }')
      + shrine('{ id: e-two, title: E2, region: east, theme: Heavy, after: [e-one], prompt: p, done: d }')
      + shrine('{ id: e-three, title: E3, region: east, theme: Light, size: S, after: [b-one], prompt: p, done: d }')
      + shrine('{ id: e-four, title: E4, region: east, theme: Light, after: [e-three], prompt: p, done: d }'));
    expect(ids(themed.get('theme-entry'))).toEqual(['e-one']);
    expect(themed.get('theme-entry')!.items[0]!.text).toBe('east / Heavy (L M)');
    expect(themed.get('theme-size')!.ok).toBe(true);
  });

  it('catches an orphan shrine, with its line, and counts every kind of tie', () => {
    expect(ids(base.get('connected'))).toEqual(['a-two', 'c-one']);
    expect(base.get('connected')!.items[0]!.line).toBe(tiny.split('\n').findIndex((l) => l.includes('id: a-two')) + 1);
    const tied = design(tiny.replace('{ id: c-one,', '{ id: c-one, after: [a-two],'));
    expect(tied.get('connected')!.ok).toBe(true);
  });

  it('checks locks: the budget, chains longer than two, and a key far from its lock', () => {
    let text = edit(tiny, 'a-two', (l) => l.replace('{ id: a-two,', '{ id: a-two, needs: [a-one],'));
    text = edit(text, 'b-one', (l) => l.replace('{ id: b-one,', '{ id: b-one, needs: [a-two],'));
    text = edit(text, 'c-one', (l) => l.replace('{ id: c-one,', '{ id: c-one, needs: [b-one],'));
    text = edit(text, 'b-two', (l) => l.replace('{ id: b-two,', '{ id: b-two, needs: [sky-one],'));
    const locked = design(text);
    expect(locked.get('lock-budget')!.ok).toBe(false); // 4 of 13
    expect(ids(locked.get('lock-chain'))).toEqual(['c-one']);
    // Keys in the same or a bordering region are in reach; one up on a sky island isn't.
    expect(ids(locked.get('lock-key'))).toEqual(['b-two']);
  });

  it('checks temples for size and spread over themes', () => {
    expect(base.get('temples')!.items.map((i) => i.text)).toEqual(['temple-x: needs 2 (want 3–4)']);
    const oneTheme = design(tiny
      .replace('{ id: b-one,', '{ id: b-one, theme: T,').replace('{ id: b-two,', '{ id: b-two, theme: T,')
      .replace('needs: [b-one, b-two]', 'needs: [b-one, b-two, b-three]')
      + shrine('{ id: b-three, title: B3, region: east, theme: T, prompt: p, done: d }'));
    expect(oneTheme.get('temples')!.items.map((i) => i.text)).toEqual(['temple-x: every need is in one theme (T)']);
  });

  it('flags prose for review: vague dones, posed problems, outside material, commands and an unbuilt "your X"', () => {
    let text = edit(tiny, 'a-two', (l) => l.replace('prompt: p, done: d', 'prompt: "Pick a data structure of your choice.", done: "Understand it."'));
    text = edit(text, 'c-one', (l) => l.replace('prompt: p,', 'prompt: "Profile your order book on your machine, then run stratum clear c-one.",'));
    const prose = design(text);
    expect(ids(prose.get('done-check'))).toEqual(['a-two']);
    expect(ids(prose.get('prose-posing'))).toEqual(['a-two']);
    expect(ids(prose.get('prose-material'))).toEqual(['a-two']);
    expect(ids(prose.get('prose-commands'))).toEqual(['c-one']);
    expect(prose.get('your-x')!.items.map((i) => i.text)).toEqual(['c-one: Profile your order book on your machine, then ru…']);
    for (const code of ['prose-posing', 'prose-material', 'prose-commands', 'your-x']) expect(prose.get(code)!.kind).toBe('review');
  });

  it('flags regions mostly gated behind hardware this machine lacks', () => {
    const gated = design(tiny.replace('{ id: c-one,', '{ id: c-one, requires: [gpu],'));
    expect(gated.get('hardware')!.items.map((i) => i.text)).toEqual(['north: 1 of 1 need hardware this machine lacks']);
  });
});

describe('lint --design on the seed world (the baseline)', () => {
  const world = loadWorld(ROOT).world!;
  const config = loadConfig(ROOT);
  const geo = new Geometry(world, config.world.seed);
  const { positions, relaxed } = placeShrines(world, geo, readLock(ROOT));
  const checks = new Map(lintDesign({ world, geo, positions, relaxed, config: { ...config, hardware: { available: [] } } }).map((c) => [c.code, c]));

  it('is in range on the fresh map, capacity, locks, temples and dones', () => {
    for (const code of ['discovery', 'layers', 'capacity', 'theme-size', 'lock-budget', 'lock-chain', 'temples', 'done-check', 'prose-commands']) {
      expect(checks.get(code)!.ok, `${code}: ${checks.get(code)!.summary}`).toBe(true);
    }
  });

  it('teaches every mechanic in the opening area; only the opening shrine\'s size is open', () => {
    expect(checks.get('opening')!.items.map((i) => i.id)).toEqual(world.shrineById.get('design-zero-cost')!.size === 'S' ? [] : ['design-zero-cost']);
  });
});
