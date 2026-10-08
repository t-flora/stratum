import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG, NO_GIT, build, clearShrine, countWords, defaultTemplate, deriveWorkState, gitReader, isArtefact, loadWorld,
  lintWorkFolders, parseWorkLog, publicView, readGitWork, terminalFor, readWorkFolder, readWorkState, setFrontmatter, shelveShrine, startShrine, validateClear, writeupSections,
  type ClearInput, type Shrine, type World,
} from '../src/index.ts';

const ROOT = join(import.meta.dirname, '..', '..');
const TINY = join(ROOT, 'fixtures', 'tiny');
const config = { ...DEFAULT_CONFIG, writeup: { minWords: 250 } };

const words = (n: number, w = 'measured') => Array.from({ length: n }, () => w).join(' ');

/** A write-up with the given frontmatter extras and roughly `n` words per section. */
function writeup(id: string, n = 90, extra = ''): string {
  return [
    '---', `shrine: ${id}`, 'status: in-progress        # in-progress | cleared', 'started: 2026-10-02',
    'cleared:                   # set by `stratum clear`', extra, 'remnote: [a, b]', '---', '',
    '## What I built', words(n), '', '## How it works', words(n), '', '## What I measured / what surprised me', words(n), '',
    '## Loose threads', '<!-- ideas -->', '',
  ].join('\n');
}

function tinyWorld(): World {
  return loadWorld(TINY).world!;
}

function shrine(world: World, id: string): Shrine {
  return world.shrineById.get(id)!;
}

describe('write-up parsing helpers', () => {
  it('splits ## sections, ignoring headings inside code fences', () => {
    const s = writeupSections('# Title\nintro\n## What I built\nthing\n```\n## not a heading\n```\n## How  It Works\n\n');
    expect([...s.keys()]).toEqual(['what i built', 'how it works']);
    expect(s.get('what i built')).toContain('## not a heading');
    expect(s.get('how it works')!.trim()).toBe('');
  });

  it('counts prose words, not comments or fenced code', () => {
    expect(countWords('one two <!-- three four --> five\n```cpp\nint x = 1;\n```\nsix — 7')).toBe(5);
  });

  it('sets frontmatter fields in place, keeping comments and the body', () => {
    const text = writeup('a-one');
    const out = setFrontmatter(text, { status: 'cleared', cleared: '2026-10-09' });
    expect(out).toContain('status: cleared            # in-progress | cleared');
    expect(out).toContain('cleared: 2026-10-09        # set by `stratum clear`');
    expect(out.split('---\n')[2]).toBe(text.split('---\n')[2]);
    expect(setFrontmatter('---\nshrine: x\n---\nbody', { status: 'cleared' })).toBe('---\nshrine: x\nstatus: cleared\n---\nbody');
  });

  it('picks python for interpretability and llm-api shrines, cpp otherwise', () => {
    const s = (region: string, requires: Shrine['requires'] = []) => ({ region, requires }) as Shrine;
    expect(defaultTemplate(s('interp-engineering'))).toBe('python');
    expect(defaultTemplate(s('agent-harness', ['llm-api']))).toBe('python');
    expect(defaultTemplate(s('concurrency', ['x86']))).toBe('cpp');
  });

  it('parses git log output into per-shrine commit timestamps', () => {
    const raw = 'abc1234\t200\n\nwork/a-one/WRITEUP.md\nwork/a-one/main.cpp\nwork/b-one/x.py\n\ndef5678\t100\n\nwork/a-one/NEXT.md\n';
    expect(parseWorkLog(raw)).toEqual(new Map([['a-one', [100, 200]], ['b-one', [200]]]));
  });
});

describe('validateClear (§5)', () => {
  const world = tinyWorld();
  const base = (id: string, over: Partial<ClearInput> = {}): ClearInput => ({
    shrine: shrine(world, id), writeup: writeup(id), files: [{ path: 'main.cpp', templateCopy: false }],
    minWords: 250, isCleared: () => false, proposals: 0, ...over,
  });

  it('passes a complete write-up with an artefact', () => {
    const res = validateClear(base('a-one'));
    expect(res.checks.filter((c) => !c.ok)).toEqual([]);
    expect(res.ok).toBe(true);
    expect(res.words).toBe(270);
  });

  it('fails an incomplete write-up with a full checklist', () => {
    const text = '---\nshrine: a-one\nstatus: in-progress\n---\n## What I built\nshort\n## How it works\n<!-- todo -->\n';
    const res = validateClear(base('a-one', { writeup: text, files: [{ path: 'NEXT.md', templateCopy: false }] }));
    expect(res.ok).toBe(false);
    expect(res.checks.map((c) => [c.ok, c.detail ?? ''])).toEqual([
      [true, ''],
      [true, ''],
      [false, 'section is empty'],
      [false, 'section heading not found'],
      [false, '1 so far'],
      [false, 'only Markdown or untouched template files so far'],
    ]);
  });

  it('reports a missing WRITEUP.md', () => {
    const res = validateClear(base('a-one', { writeup: null }));
    expect(res.checks[0]).toMatchObject({ ok: false, detail: 'work/a-one/WRITEUP.md not found' });
  });

  it('accepts a `code:` field instead of a local artefact', () => {
    expect(validateClear(base('a-one', { files: [] })).ok).toBe(false);
    expect(validateClear(base('a-one', { files: [], writeup: writeup('a-one', 90, 'code: https://example.com/repo') })).ok).toBe(true);
  });

  it('does not count Markdown, hidden files or untouched template copies as artefacts', () => {
    expect(isArtefact({ path: 'notes.md', templateCopy: false })).toBe(false);
    expect(isArtefact({ path: '.gitignore', templateCopy: false })).toBe(false);
    expect(isArtefact({ path: 'src/main.cpp', templateCopy: true })).toBe(false);
    expect(isArtefact({ path: 'results/bench.csv', templateCopy: false })).toBe(true);
  });

  it('towers need three proposals instead of an artefact', () => {
    expect(validateClear(base('tower-west', { files: [], proposals: 2 })).ok).toBe(false);
    expect(validateClear(base('tower-west', { files: [], proposals: 3 })).ok).toBe(true);
  });

  it('terminal hints: the exact command to paste, from the engine folder', () => {
    expect(terminalFor('/eng', '/eng', 'npm run stratum --')).toEqual({ root: '/eng', cwd: '/eng', cli: 'npm run stratum --' });
    expect(terminalFor('/eng/build/sandbox', '/eng', 'npm run stratum --').cli).toBe('npm run stratum -- --root build/sandbox');
    expect(terminalFor('/home/me/journey', '/eng', 'npm run stratum --').cli).toBe('npm run stratum -- --root /home/me/journey');
    expect(terminalFor('/home/me/my map', '/eng', 'npm run stratum --').cli).toBe("npm run stratum -- --root '/home/me/my map'");
  });

  it('§5.4 an ordinary shrine with needs clears only once they are cleared', () => {
    const locked = { ...shrine(tinyWorld(), 'a-two'), needs: ['a-one'] };
    const input = (cleared: boolean) => ({ ...base('a-two', { isCleared: () => cleared }), shrine: locked });
    expect(validateClear(input(false)).checks.at(-1)).toMatchObject({ ok: false, detail: 'not yet: a-one' });
    expect(validateClear(input(true)).ok).toBe(true);
  });

  it('temples need their needs cleared', () => {
    const res = validateClear(base('temple-x', { isCleared: (id) => id === 'b-one' }));
    expect(res.ok).toBe(false);
    expect(res.checks.at(-1)).toMatchObject({ ok: false, detail: 'not yet: b-two' });
    expect(validateClear(base('temple-x', { isCleared: () => true })).ok).toBe(true);
  });
});

/** A throwaway copy of the tiny world plus the real templates. */
function tempWorld(): string {
  const dir = mkdtempSync(join(tmpdir(), 'stratum-'));
  cpSync(join(TINY, 'world'), join(dir, 'world'), { recursive: true });
  cpSync(join(ROOT, 'templates'), join(dir, 'templates'), { recursive: true });
  return dir;
}

describe('start and clear (§13 M2)', () => {
  let dir: string;
  let world: World;
  beforeEach(() => {
    dir = tempWorld();
    world = tinyWorld();
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const work = () => readWorkState(dir, world, config);
  const mapShrine = (id: string) => build(dir, { git: NO_GIT, now: 0 }).map!.shrines.find((s) => s.id === id)!;

  it('starting a shrine scaffolds the folder and makes it the camp', () => {
    const res = startShrine(dir, world, work(), 'a-one', { today: '2026-10-02' });
    expect(res).toMatchObject({ outcome: 'started', template: 'cpp' });
    if (res.outcome !== 'started') return;
    expect(res.created).toEqual(expect.arrayContaining(['work/a-one/CMakeLists.txt', 'work/a-one/src/main.cpp', 'work/a-one/WRITEUP.md', 'work/a-one/NEXT.md']));
    const text = readFileSync(join(dir, 'work/a-one/WRITEUP.md'), 'utf8');
    expect(text).toContain('shrine: a-one\nstatus: in-progress');
    expect(text).toContain('started: 2026-10-02');
    expect(readFileSync(join(dir, 'work/a-one/CMakeLists.txt'), 'utf8')).toContain('project(a_one');

    const s = mapShrine('a-one');
    expect(s.status).toBe('in-progress');
    expect(s.startedAt).toBe('2026-10-02');
    expect(s.camp?.note).toBe('Just set out. Replace this line with where you left off.');
    expect(s.camp?.since).toBeGreaterThan(0);
    expect(s.camp?.current).toBe(true);
    expect(mapShrine('a-two').status).toBe('untouched');
    // Starting again changes nothing.
    expect(startShrine(dir, world, work(), 'a-one')).toMatchObject({ outcome: 'already', status: 'in-progress' });
  });

  it('refuses a hidden shrine unless forced; a silhouette may be started', () => {
    const visibility = new Map([['c-one', 'hidden' as const], ['b-two', 'silhouette' as const]]);
    expect(startShrine(dir, world, work(), 'c-one', { visibility })).toMatchObject({ outcome: 'refused' });
    expect(startShrine(dir, world, work(), 'b-two', { visibility })).toMatchObject({ outcome: 'started' });
    expect(startShrine(dir, world, work(), 'c-one', { visibility, force: true })).toMatchObject({ outcome: 'started' });
  });

  it('refuses a locked temple unless forced', () => {
    expect(startShrine(dir, world, work(), 'temple-x')).toMatchObject({ outcome: 'refused' });
    expect(startShrine(dir, world, work(), 'temple-x', { force: true })).toMatchObject({ outcome: 'started' });
  });

  it('the public view: a fresh build ignores your work, and map.json carries nothing you have not seen', () => {
    startShrine(dir, world, work(), 'a-one');
    expect(mapShrine('a-one').status).toBe('in-progress');
    const fresh = build(dir, { git: NO_GIT, now: 0, fresh: true, write: false }).map!;
    expect(fresh.shrines.find((s) => s.id === 'a-one')!.status).toBe('untouched');
    const view = publicView(fresh, 'https://example.invalid/guide');
    expect(view.public).toEqual({ total: fresh.shrines.length, link: 'https://example.invalid/guide' });
    const hidden = fresh.shrines.filter((s) => s.visibility === 'hidden').map((s) => s.id);
    expect(hidden.length).toBeGreaterThan(0);
    const kept = new Set(view.shrines.map((s) => s.id));
    for (const id of hidden) expect(kept.has(id)).toBe(false);
    for (const s of view.shrines) {
      for (const ref of [...s.links, ...s.after, ...s.needs, ...(s.locked ?? [])]) expect(kept.has(ref), `${s.id} → ${ref}`).toBe(true);
      if (s.visibility !== 'revealed') expect([s.prompt, s.done]).toEqual(['', '']);
    }
    expect(JSON.stringify(view)).not.toContain(`"${hidden[0]}"`);
  });

  it('a starter kit replaces the code template; untouched kit files are scaffold, not artefacts', () => {
    mkdirSync(join(dir, 'world', 'kits', 'a-one'), { recursive: true });
    writeFileSync(join(dir, 'world', 'kits', 'a-one', 'api.hpp'), '// the API to redesign {{title}}\n');
    const res = startShrine(dir, world, work(), 'a-one');
    expect(res).toMatchObject({ outcome: 'started', kit: true });
    if (res.outcome !== 'started') return;
    expect(res.created).toEqual(expect.arrayContaining(['work/a-one/api.hpp', 'work/a-one/WRITEUP.md', 'work/a-one/NEXT.md']));
    expect(res.created).not.toContain('work/a-one/src/main.cpp');
    // Copied byte for byte: kits are content, not templates.
    expect(readFileSync(join(dir, 'work/a-one/api.hpp'), 'utf8')).toBe('// the API to redesign {{title}}\n');
    const files = () => readWorkFolder(dir, shrine(world, 'a-one')).files;
    expect(files().find((f) => f.path === 'api.hpp')).toMatchObject({ templateCopy: true });
    writeFileSync(join(dir, 'work/a-one/api.hpp'), '// redesigned around values\n');
    expect(files().find((f) => f.path === 'api.hpp')).toMatchObject({ templateCopy: false });
    // A kit must belong to a shrine.
    mkdirSync(join(dir, 'world', 'kits', 'nope'), { recursive: true });
    expect(lintWorkFolders(dir, world).map((d) => d.code)).toContain('unknown-kit');
  });

  it('§5.4 a shrine with unmet needs is locked: visible on the map, refused by start unless forced', () => {
    const seed = join(dir, 'world', 'world-seed.yaml');
    const text = readFileSync(seed, 'utf8');
    writeFileSync(seed, text.replace('{ id: a-two,   title: "A2", region: west,  p: 3, prompt: p, done: d }', '{ id: a-two,   title: "A2", region: west,  p: 3, needs: [a-one], prompt: p, done: d }'));
    world = loadWorld(dir).world!;
    expect(mapShrine('a-two')).toMatchObject({ locked: ['a-one'], visibility: 'revealed' });
    expect(mapShrine('a-one').locked).toBeUndefined();
    expect(startShrine(dir, world, work(), 'a-two')).toMatchObject({ outcome: 'refused', reason: expect.stringContaining("it's locked") });
    expect(startShrine(dir, world, work(), 'a-two', { force: true })).toMatchObject({ outcome: 'started' });
  });

  it('an invalid write-up fails with a checklist; the untouched scaffold is not an artefact', () => {
    startShrine(dir, world, work(), 'a-one');
    const res = clearShrine(dir, world, config, 'a-one');
    expect(res.outcome).toBe('failed');
    if (res.outcome !== 'failed') return;
    expect(res.checks.filter((c) => !c.ok).map((c) => c.label)).toEqual([
      '"What I built" is filled in',
      '"How it works" is filled in',
      '"What I measured / what surprised me" is filled in',
      'at least 250 words across those sections',
      'an artefact: a non-Markdown file in the work folder, or a `code:` field',
    ]);
    expect(mapShrine('a-one').status).toBe('in-progress');
  });

  it('a valid write-up clears, stamps the date, and shows as cleared after a rebuild', () => {
    startShrine(dir, world, work(), 'a-one', { today: '2026-10-02' });
    writeFileSync(join(dir, 'work/a-one/WRITEUP.md'), writeup('a-one'));
    writeFileSync(join(dir, 'work/a-one/src/main.cpp'), 'int main() { return 42; }\n');
    const res = clearShrine(dir, world, config, 'a-one', { today: '2026-10-09' });
    expect(res).toMatchObject({ outcome: 'cleared', date: '2026-10-09' });
    if (res.outcome !== 'cleared') return;
    expect(res.commit).toBe(`git add work/a-one && git commit -m 'Clear a-one: A1'`);
    const text = readFileSync(join(dir, 'work/a-one/WRITEUP.md'), 'utf8');
    expect(text).toMatch(/^status: cleared +# in-progress \| cleared$/m);
    expect(text).toMatch(/^cleared: 2026-10-09 /m);

    const s = mapShrine('a-one');
    expect(s).toMatchObject({ status: 'cleared', clearedAt: '2026-10-09', remnote: 2, committed: false });
    expect(s.camp).toBeUndefined();
    expect(s.writeup).toContain('## How it works');
    expect(s.writeup).not.toContain('<!--'); // template hints don't reach the panel
    expect(clearShrine(dir, world, config, 'a-one')).toMatchObject({ outcome: 'already', date: '2026-10-09' });
  });

  it('a hand-edited `status: cleared` without a valid clear stays in progress', () => {
    startShrine(dir, world, work(), 'a-one');
    writeFileSync(join(dir, 'work/a-one/WRITEUP.md'), '---\nshrine: a-one\nstatus: cleared\ncleared: 2026-10-09\n---\n## What I built\nx\n');
    const w = work().get('a-one')!;
    expect(w.status).toBe('in-progress');
    expect(w.clearProblems?.length).toBeGreaterThan(0);
  });

  it('temples clear once their needs are cleared, whatever the folder order', () => {
    const folders = new Map(['b-one', 'b-two', 'temple-x'].map((id) => [
      id, { writeup: setFrontmatter(writeup(id), { status: 'cleared', cleared: '2026-10-09' }), files: [{ path: 'a.py', templateCopy: false }], next: null },
    ]));
    // Map order puts the temple last here; reverse it so the temple is validated first.
    const reversed = new Map([...folders].reverse());
    expect(deriveWorkState(world, reversed, config).get('temple-x')!.status).toBe('cleared');
    folders.delete('b-two');
    expect(deriveWorkState(world, folders, config).get('temple-x')!.status).toBe('in-progress');
  });
});

describe('camps, cairns and shelving (docs/plans/camps.md)', () => {
  let dir: string;
  let world: World;
  beforeEach(() => {
    dir = tempWorld();
    world = tinyWorld();
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const work = () => readWorkState(dir, world, config);
  const touch = (id: string, secondsAgo: number) => {
    const t = new Date(Date.now() - secondsAgo * 1000);
    utimesSync(join(dir, `work/${id}/NEXT.md`), t, t);
    utimesSync(join(dir, `work/${id}/WRITEUP.md`), t, t);
  };

  it('keeps exactly one camp, the most recently touched; the rest are cairns', () => {
    for (const id of ['a-one', 'a-two', 'b-one']) startShrine(dir, world, work(), id, { today: '2026-01-01' });
    touch('a-one', 300);
    touch('a-two', 100);
    touch('b-one', 200);
    const w = work();
    expect(['a-one', 'a-two', 'b-one'].map((id) => w.get(id)!.camp?.current)).toEqual([false, true, false]);
    // Touching another shrine moves the camp there.
    touch('a-one', 0);
    expect(work().get('a-one')!.camp?.current).toBe(true);
    expect(work().get('a-two')!.camp?.current).toBe(false);
  });

  it('shelving sets work aside; start takes it off the shelf', () => {
    startShrine(dir, world, work(), 'a-one');
    expect(shelveShrine(dir, world, work(), 'a-one')).toEqual({ outcome: 'shelved' });
    expect(readFileSync(join(dir, 'work/a-one/WRITEUP.md'), 'utf8')).toMatch(/^status: shelved /m);
    const shelved = work().get('a-one')!;
    expect(shelved.status).toBe('shelved');
    expect(shelved.camp).toBeUndefined();
    expect(shelveShrine(dir, world, work(), 'a-one')).toMatchObject({ outcome: 'refused' });
    expect(shelveShrine(dir, world, work(), 'a-two')).toMatchObject({ outcome: 'refused' });

    expect(startShrine(dir, world, work(), 'a-one')).toEqual({ outcome: 'resumed' });
    expect(work().get('a-one')!).toMatchObject({ status: 'in-progress', camp: { current: true } });
  });
});

describe('git-derived state', () => {
  let dir: string;
  let world: World;
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, stdio: 'pipe' });

  beforeEach(() => {
    dir = tempWorld();
    world = tinyWorld();
    git('init', '-q');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const state = () => readWorkState(dir, world, config, readGitWork(gitReader(dir)));

  it('records touches and renders uncommitted clears as uncommitted', () => {
    startShrine(dir, world, state(), 'a-one');
    writeFileSync(join(dir, 'work/a-one/WRITEUP.md'), writeup('a-one'));
    writeFileSync(join(dir, 'work/a-one/bench.csv'), 'n,ns\n1,2\n');
    expect(clearShrine(dir, world, config, 'a-one').outcome).toBe('cleared');

    // Cleared but never committed (no HEAD yet).
    expect(state().get('a-one')).toMatchObject({ status: 'cleared', committed: false, touches: [] });

    git('add', '-A');
    git('commit', '-q', '-m', 'clear a-one', '--date', '@1790000000');
    const committed = state().get('a-one')!;
    expect(committed.committed).toBe(true);
    expect(committed.touches).toHaveLength(1);

    // Editing the cleared write-up after committing makes it uncommitted again.
    writeFileSync(join(dir, 'work/a-one/WRITEUP.md'), readFileSync(join(dir, 'work/a-one/WRITEUP.md'), 'utf8') + '\nmore\n');
    expect(state().get('a-one')!.committed).toBe(false);
    git('add', '-A');
    expect(state().get('a-one')!.committed).toBe(false);
    git('commit', '-q', '-m', 'more');
    expect(state().get('a-one')!).toMatchObject({ committed: true });
    expect(state().get('a-one')!.touches).toHaveLength(2);
  });

  it('outside git nothing is committed and there are no touches', () => {
    rmSync(join(dir, '.git'), { recursive: true, force: true });
    expect(readGitWork(gitReader(dir))).toEqual({ touches: new Map(), dirty: null });
  });
});
