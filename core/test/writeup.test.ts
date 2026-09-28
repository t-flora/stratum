import { describe, expect, it } from 'vitest';
import { parseWriteup } from '../src/index.ts';

const fm = (lines: string) => `---\n${lines}\n---\n\n## What I built\n`;

describe('parseWriteup', () => {
  it('parses a valid in-progress write-up', () => {
    const w = parseWriteup(fm('shrine: spsc-ring-buffer\nstatus: in-progress\nstarted: 2026-10-02\ncleared:\nhours:\ncode:\nremnote: []'), 'spsc-ring-buffer');
    expect(w.problems).toEqual([]);
    expect(w.frontmatter).toEqual({ shrine: 'spsc-ring-buffer', status: 'in-progress', started: '2026-10-02', remnote: [] });
  });

  it('flags a folder mismatch, bad status and a cleared write-up without a date', () => {
    expect(parseWriteup(fm('shrine: other\nstatus: done'), 'spsc-ring-buffer').problems).toEqual([
      'frontmatter shrine "other" does not match folder "spsc-ring-buffer"',
      'frontmatter `status` must be in-progress | cleared',
    ]);
    expect(parseWriteup(fm('shrine: a\nstatus: cleared'), 'a').problems).toEqual(['status is cleared but `cleared` has no date']);
  });

  it('reports missing frontmatter', () => {
    expect(parseWriteup('# just text').problems).toEqual(['missing frontmatter']);
  });
});
