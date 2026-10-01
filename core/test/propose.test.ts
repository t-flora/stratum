import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { appendProposal, loadWorld, looseThreads, parseWorld, proposalId, proposalStub, PROPOSED_PATH, SEED_PATH } from '../src/index.ts';

const root = join(import.meta.dirname, '..', '..');
const world = loadWorld(root).world!;

describe('loose threads', () => {
  it('lists the items under ## Loose threads, skipping comments, fences and later sections', () => {
    const body = [
      '## What I measured / what surprised me', '- not this', '',
      '## Loose threads', '<!-- Ideas that could become new shrines. -->',
      '- Try a seqlock instead: readers never block.', '* Measure with', '  huge pages', '1. NUMA-aware placement',
      '```', '- not a thread', '```', 'A plain paragraph thread.', '',
      '## Appendix', '- not this either',
    ].join('\n');
    expect(looseThreads(body)).toEqual([
      'Try a seqlock instead: readers never block.', 'Measure with huge pages', 'NUMA-aware placement', 'A plain paragraph thread.',
    ]);
    expect(looseThreads('## What I built\n- x')).toEqual([]);
  });
});

describe('proposal stubs', () => {
  it('ids are kebab-case slugs, unique in the world', () => {
    expect(proposalId(world, 'Try a Seqlock!')).toBe('try-a-seqlock');
    const taken = world.shrines[0]!.id;
    expect(proposalId(world, taken)).toBe(`${taken}-2`);
  });

  it('land in the proposer’s region, follow it, and carry `from`', () => {
    const from = world.shrines.find((s) => s.layer === 'surface' && s.kind === 'shrine' && s.theme)!;
    const stub = proposalStub(world, from.id, 'Try a seqlock instead: readers never block.');
    expect(stub.id).toBe('try-a-seqlock-instead');
    expect(stub.yaml).toContain(`region: ${from.region}`);
    expect(stub.yaml).toContain(`from: ${from.id}`);
    expect(stub.yaml).toContain(`- ${from.id}`); // after
    expect(stub.yaml).toContain('prompt: "Try a seqlock instead: readers never block."');
  });

  it('a depths proposal sits under the same surface shrine', () => {
    const root2 = world.shrines.find((s) => s.layer === 'depths')!;
    expect(proposalStub(world, root2.id, 'Look at the TLB').yaml).toContain(`below: ${root2.below}`);
  });

  it('appended to proposed.yaml, it loads cleanly and nothing else changes', () => {
    const seed = { file: SEED_PATH, text: readFileSync(join(root, SEED_PATH), 'utf8') };
    let proposed = readFileSync(join(root, PROPOSED_PATH), 'utf8');
    const tower = world.shrines.find((s) => s.kind === 'tower' && s.layer === 'surface')!;
    const a = proposalStub(world, tower.id, 'Survey the benchmarks nobody trusts');
    proposed = appendProposal(proposed, a.yaml);
    expect(proposed).toMatch(/^# Shrines proposed/); // comments kept
    expect(proposed.endsWith('\n')).toBe(true);
    const once = parseWorld(seed, { file: PROPOSED_PATH, text: proposed });
    expect(once.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const b = proposalStub(once.world!, tower.id, undefined);
    proposed = appendProposal(proposed, b.yaml);
    const twice = parseWorld(seed, { file: PROPOSED_PATH, text: proposed });
    expect(twice.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const ids = twice.world!.shrines.filter((s) => s.source === 'proposed').map((s) => s.id);
    expect(ids).toEqual([a.id, b.id]);
    expect(twice.world!.shrineById.get(b.id)!.from).toBe(tower.id);
  });
});
