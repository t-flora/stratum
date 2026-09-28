import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadWorld, parseWorld, PROPOSED_PATH, SEED_PATH, summarize, type Diagnostic } from '../src/index.ts';

const ROOT = join(import.meta.dirname, '..', '..');
const seedText = readFileSync(join(ROOT, SEED_PATH), 'utf8');
const seed = (text = seedText) => ({ file: SEED_PATH, text });
const proposed = (text: string) => ({ file: PROPOSED_PATH, text });

const errors = (ds: Diagnostic[]) => ds.filter((d) => d.severity === 'error');
/** 1-based line number of the first line containing `needle`. */
const lineOf = (text: string, needle: string, from = 0) => text.slice(0, text.indexOf(needle, from)).split('\n').length;

describe('seed world', () => {
  it('lints clean with 217 entries and 22 regions', () => {
    const { world, diagnostics } = loadWorld(ROOT);
    expect(diagnostics).toEqual([]);
    const s = summarize(world!);
    expect(s.entries).toBe(217);
    expect(s.regions).toBe(22);
    expect(s.byLayer.surface.towers).toBe(10);
    expect(s.byLayer.sky.towers).toBe(5);
    expect(s.byLayer.surface.temples).toBe(6);
    expect(s.byLayer.depths.shrines).toBe(60);
  });

  it('applies defaults and forces towers/temples to p=5', () => {
    const { world } = parseWorld(seed());
    const byId = world!.shrineById;
    expect(byId.get('raii-handles')).toMatchObject({ kind: 'shrine', p: 2, size: 'S', layer: 'surface', requires: [], links: [] });
    expect(byId.get('tower-cpp-core')!.p).toBe(5);
    expect(byId.get('temple-sae-engine')!.p).toBe(5);
    expect(byId.get('asm-calling-convention')).toMatchObject({ layer: 'depths', below: 'godbolt-reading', size: 'M' });
  });

  it('keeps file order, seed before proposed', () => {
    const { world } = parseWorld(seed(), proposed(
      'shrines:\n  - { id: new-one, title: N, region: cpp-core, prompt: p, done: d, from: tower-cpp-core }\n',
    ));
    const last = world!.shrines.at(-1)!;
    expect(last).toMatchObject({ id: 'new-one', source: 'proposed', order: 217, from: 'tower-cpp-core' });
  });
});

describe('planted errors carry file/line context', () => {
  it('duplicate id across seed and proposed', () => {
    const p = 'shrines:\n  - id: raii-handles\n    title: dup\n    region: cpp-core\n    prompt: p\n    done: d\n    from: tower-cpp-core\n';
    const errs = errors(parseWorld(seed(), proposed(p)).diagnostics);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({ code: 'duplicate-id', file: PROPOSED_PATH, line: 2 });
    expect(errs[0]!.message).toContain(`${SEED_PATH}:${lineOf(seedText, '- id: raii-handles')}`);
  });

  it('duplicate id within the seed', () => {
    const text = seedText.replace('- id: raii-handles', '- id: value-categories');
    const errs = errors(parseWorld(seed(text)).diagnostics);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({ code: 'duplicate-id', file: SEED_PATH, line: lineOf(text, '- id: value-categories', text.indexOf('id: move-semantics-vector')) });
  });

  it('bad below (unknown id)', () => {
    const text = seedText.replace('below: godbolt-reading', 'below: godbolt-readin');
    const errs = errors(parseWorld(seed(text)).diagnostics);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({ code: 'bad-below', file: SEED_PATH, line: lineOf(text, 'below: godbolt-readin') });
  });

  it('bad below (points at a sky shrine)', () => {
    const text = seedText.replace('below: godbolt-reading', 'below: theory-roofline');
    const errs = errors(parseWorld(seed(text)).diagnostics);
    expect(errs[0]).toMatchObject({ code: 'bad-below', line: lineOf(text, 'below: theory-roofline') });
    expect(errs[0]!.message).toContain('sky shrine');
  });

  it('missing below on a depths shrine', () => {
    const text = seedText.replace('  below: godbolt-reading\n', '');
    const errs = errors(parseWorld(seed(text)).diagnostics);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({ code: 'missing-below', line: lineOf(text, '- id: asm-calling-convention') });
  });

  it('below on a non-depths shrine', () => {
    const text = seedText.replace('  size: S\n  prompt: >-\n    Write a generic', '  size: S\n  below: cmake-modern\n  prompt: >-\n    Write a generic');
    const errs = errors(parseWorld(seed(text)).diagnostics);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({ code: 'bad-below', line: lineOf(text, 'below: cmake-modern') });
  });

  it('unknown link points at the offending list item', () => {
    const text = seedText.replace('links: [theory-superposition]', 'links: [theory-superpositon]');
    const errs = errors(parseWorld(seed(text)).diagnostics);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({ code: 'unknown-link', line: lineOf(text, 'theory-superpositon') });
    expect(errs[0]!.col).toBe(text.split('\n')[errs[0]!.line! - 1]!.indexOf('theory-superpositon') + 1);
  });

  it('unknown need on a temple', () => {
    const text = seedText.replace('needs: [activation-store, topk-sae', 'needs: [activation-stor, topk-sae');
    const errs = errors(parseWorld(seed(text)).diagnostics);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({ code: 'unknown-need', line: lineOf(text, 'activation-stor,') });
  });

  it('unknown region', () => {
    const text = seedText.replace('region: cpp-core\n  kind: tower', 'region: cpp-cor\n  kind: tower');
    const codes = errors(parseWorld(seed(text)).diagnostics).map((d) => d.code);
    expect(codes).toContain('unknown-region');
    expect(codes).toContain('tower-count'); // cpp-core lost its tower
  });

  it('a second tower in a region', () => {
    const text = seedText.replace('- id: value-categories\n  title: Value categories, witnessed\n  region: cpp-core\n',
      '- id: value-categories\n  title: Value categories, witnessed\n  region: cpp-core\n  kind: tower\n');
    const errs = errors(parseWorld(seed(text)).diagnostics);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({ code: 'tower-count', line: lineOf(text, '- id: value-categories') });
  });

  it('YAML syntax errors', () => {
    const text = seedText.replace('  title: RAII for everything', '  title: RAII: for: everything');
    const errs = errors(parseWorld(seed(text)).diagnostics);
    expect(errs.length).toBeGreaterThan(0);
    expect(errs[0]).toMatchObject({ code: 'yaml', line: lineOf(text, 'RAII: for: everything') });
  });

  it('schema problems: bad p, size, requires tag, unknown field', () => {
    const text = seedText
      .replace('- id: move-semantics-vector\n  title: A vector that moves correctly\n  region: cpp-core\n  p: 3',
        '- id: move-semantics-vector\n  title: A vector that moves correctly\n  region: cpp-core\n  p: 7\n  size: XL\n  requires: [cuda]\n  colour: red');
    const ds = parseWorld(seed(text)).diagnostics;
    expect(errors(ds).map((d) => d.message)).toEqual([
      '"move-semantics-vector": p must be an integer 1..5',
      '"move-semantics-vector": size must be one of S | M | L',
      '"move-semantics-vector": unknown requires tag "cuda" (expected gpu, arm, x86, avx512, linux, llm-api)',
    ]);
    expect(ds.find((d) => d.code === 'unknown-field')).toMatchObject({ severity: 'warning', line: lineOf(text, 'colour: red') });
  });

  it('proposed shrines need a resolvable `from`', () => {
    const p = 'shrines:\n  - { id: x-one, title: X, region: cpp-core, prompt: p, done: d }\n  - { id: x-two, title: X, region: cpp-core, prompt: p, done: d, from: nope }\n';
    const errs = errors(parseWorld(seed(), proposed(p)).diagnostics);
    expect(errs.map((e) => [e.code, e.line])).toEqual([['schema', 2], ['unknown-from', 3]]);
  });

  it('ridge override referencing an unknown region', () => {
    const text = seedText.replace('between: [cpp-core, metaprogramming]', 'between: [cpp-core, metaprogrammin]');
    const errs = errors(parseWorld(seed(text)).diagnostics);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({ code: 'unknown-region', line: lineOf(text, 'metaprogrammin]') });
  });
});

describe('fixtures', () => {
  it('tiny world lints clean', () => {
    expect(loadWorld(join(ROOT, 'fixtures/tiny')).diagnostics).toEqual([]);
  });
  it('planted-errors world reports each planted error', () => {
    const codes = errors(loadWorld(join(ROOT, 'fixtures/planted-errors')).diagnostics).map((d) => d.code).sort();
    expect(codes).toEqual(['bad-below', 'bad-below', 'bad-below', 'duplicate-id', 'unknown-link']);
  });
});
