#!/usr/bin/env -S npx tsx
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { Command } from 'commander';
import {
  CONFIG_PATH, Geometry, LAYERS, PROPOSED_PATH, appendProposal, looseThreads, parseWriteup, proposalStub, LOCAL_CONFIG_PATH, LOCK_PATH, MAP_PATH, PINS_PATH, TEMPLATES, build, clearShrine, gitReader,
  hasLocalConfig, lintClears, lintGeometry, lintPin, lintWorkFolders, loadConfig, loadWorld, readGitWork, readWorkState, setPin,
  publicView, shelveShrine, startShrine, summarize, terminalFor, validateConfig,
  type BuildResult, type ClearCheck, type Diagnostic, type MapData, type TemplateName, type World,
} from '@stratum/core';
import { stratumApi } from './dev.ts';
import { TERMINAL } from './engine.ts';
import { setup } from './setup.ts';

/** Walk up from cwd to the directory containing world/world-seed.yaml. */
function findRoot(start = process.cwd()): string {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, 'world', 'world-seed.yaml'))) return dir;
    const up = dirname(dir);
    if (up === dir) return resolve(start);
    dir = up;
  }
}

function formatDiagnostic(d: Diagnostic): string {
  const loc = d.line ? `${d.file}:${d.line}${d.col ? `:${d.col}` : ''}` : d.file;
  return `${loc}  ${d.severity}  [${d.code}] ${d.message}`;
}

const program = new Command()
  .name('stratum')
  .description('A three-layer exploration map for deep technical study')
  .option('--root <dir>', 'repo root (default: nearest ancestor containing world/world-seed.yaml)');

function printDiagnostics(diagnostics: Diagnostic[]) {
  const byLocation = (a: Diagnostic, b: Diagnostic) => a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0);
  const errors = diagnostics.filter((d) => d.severity === 'error').sort(byLocation);
  const warnings = diagnostics.filter((d) => d.severity === 'warning').sort(byLocation);
  for (const d of [...errors, ...warnings]) console.log(formatDiagnostic(d));
  return { errors, warnings };
}

const root = () => (program.opts().root as string | undefined) ?? findRoot();

program
  .command('lint')
  .description('Validate the world and every WRITEUP.md')
  .action(() => {
    const dir = root();
    const { world, diagnostics } = loadWorld(dir);
    const config = loadConfig(dir);
    if (world) diagnostics.push(...lintWorkFolders(dir, world), ...lintPin(dir, world));
    if (world && !diagnostics.some((d) => d.severity === 'error')) diagnostics.push(...lintClears(readWorkState(dir, world, config)));
    if (world && !diagnostics.some((d) => d.severity === 'error')) diagnostics.push(...lintGeometry(world, new Geometry(world, config.world.seed)));
    const configFile = hasLocalConfig(dir) ? LOCAL_CONFIG_PATH : CONFIG_PATH;
    for (const message of validateConfig(config)) {
      diagnostics.push({ severity: 'error', code: 'config', message, file: configFile });
    }
    const { errors, warnings } = printDiagnostics(diagnostics);
    if (world) {
      const s = summarize(world);
      if (diagnostics.length) console.log('');
      console.log(`${s.entries} entries, ${s.regions} regions`);
      for (const l of LAYERS) {
        const b = s.byLayer[l];
        console.log(`  ${l.padEnd(8)} ${String(b.regions).padStart(2)} regions  ${String(b.shrines).padStart(3)} shrines  ${b.towers} towers  ${b.temples} temples`);
      }
    }
    console.log(`${errors.length} error(s), ${warnings.length} warning(s)`);
    if (!hasLocalConfig(dir)) console.log(`note: no ${LOCAL_CONFIG_PATH} on this machine; run \`stratum setup\` to detect available hardware`);
    process.exitCode = errors.length ? 1 : 0;
  });

program
  .command('build')
  .description(`Place shrines (respecting ${LOCK_PATH}) and write ${MAP_PATH}`)
  .option('--replace <ids...>', 'deliberately re-place these shrines')
  .option('--static', 'also bundle the app with map.json into build/static/ (no dev API: buttons copy CLI commands)')
  .option('--public', 'with --static: the public site\'s map, a fresh start with no spoilers (your work/ and pin are left out)')
  .option('--link <url>', 'with --public: where visitors can get Stratum for themselves (e.g. the GitHub repo)')
  .action(async (opts: { replace?: string[]; static?: boolean; public?: boolean; link?: string }) => {
    if (opts.public && !opts.static) {
      console.log('--public only applies to --static');
      process.exitCode = 1;
      return;
    }
    const t0 = performance.now();
    const res = build(root(), { replace: opts.replace, terminal: TERMINAL });
    const { errors } = printDiagnostics(res.diagnostics);
    if (!res.map || errors.length) {
      console.log(`build failed: ${errors.length} error(s)`);
      process.exitCode = 1;
      return;
    }
    const p = res.placement!;
    for (const r of p.relaxed) console.log(`note: ${r.id} placed with relaxed spacing ${r.spacing}`);
    console.log(`placed ${p.placed.length} new shrine(s); ${res.lockChanged ? `updated ${LOCK_PATH}` : 'lockfile unchanged'}`);
    const work = [...res.work!.values()];
    const uncommitted = work.filter((w) => w.status === 'cleared' && !w.committed).length;
    console.log(
      `${work.filter((w) => w.status === 'cleared').length} cleared${uncommitted ? ` (${uncommitted} not committed)` : ''}, ` +
        `${work.filter((w) => w.status === 'in-progress').length} in progress` +
        (work.some((w) => w.status === 'shelved') ? `, ${work.filter((w) => w.status === 'shelved').length} shelved` : ''),
    );
    const vis = res.map.shrines.map((s) => s.visibility);
    console.log(`${vis.filter((v) => v === 'revealed').length} revealed, ${vis.filter((v) => v === 'silhouette').length} silhouettes, ${vis.filter((v) => v === 'hidden').length} hidden`);
    console.log(`wrote ${MAP_PATH} in ${Math.round(performance.now() - t0)} ms`);
    if (!opts.static) return;
    if (!opts.public) return void (await buildStatic(root(), res.map));
    // The public site: the map a newcomer sees, whatever this repo's own progress is.
    const fresh = build(root(), { fresh: true, write: false });
    if (!fresh.map) return void (process.exitCode = 1);
    const view = publicView(fresh.map, opts.link);
    await buildStatic(root(), view);
    console.log(`public view: ${view.shrines.length} of ${view.public!.total} shrines in sight; no work, no pin, no Atlas`);
  });

/**
 * `stratum build --static` (§11): the app plus a copy of map.json, servable from any folder (relative base).
 * Without the dev API the app notices and makes Set out / Pin / Shelve copy the CLI command instead.
 */
async function buildStatic(dir: string, map: MapData) {
  const { build: viteBuild } = await import('vite');
  const appDir = join(dirname(new URL(import.meta.url).pathname), '..', 'app');
  const outDir = resolve(dir, 'build', 'static');
  await viteBuild({
    configFile: join(appDir, 'vite.config.ts'),
    base: './',
    logLevel: 'warn',
    build: { outDir, emptyOutDir: true },
  });
  writeFileSync(join(outDir, 'map.json'), JSON.stringify(map));
  console.log(`wrote build/static/ (serve it, e.g. \`npx vite preview --outDir build/static\`; file:// can't fetch map.json)`);
}

program
  .command('dev')
  .description('Serve the map on localhost with the dev API; rebuilds and pushes updates when world/, work/ or state/ change')
  .option('--port <n>', 'port', '5173')
  .action(async (opts: { port: string }) => serve(root(), Number(opts.port)));

program
  .command('sandbox')
  .description('Play this world from a fresh start in a throwaway copy under build/sandbox/: try things without touching your progress')
  .option('--reset', 'throw the sandbox away and start fresh')
  .option('--port <n>', 'port', '5174')
  .action(async (opts: { reset?: boolean; port: string }) => {
    const repo = root();
    const dest = join(repo, 'build', 'sandbox');
    if (opts.reset) rmSync(dest, { recursive: true, force: true });
    if (!existsSync(dest)) {
      // The world as a newcomer gets it: world/, the templates and config, but no work/ and an empty pin.
      for (const p of ['world', 'templates', 'stratum.config.yaml', LOCAL_CONFIG_PATH]) {
        if (existsSync(join(repo, p))) cpSync(join(repo, p), join(dest, p), { recursive: true });
      }
      mkdirSync(join(dest, 'state'), { recursive: true });
      writeFileSync(join(dest, PINS_PATH), 'pin: null\n');
      // Its own repository, so commits, hours and "not committed yet" behave as they do for real.
      const vcs = (...args: string[]) => spawnSync('git', ['-C', dest, ...args], { encoding: 'utf8' });
      vcs('init', '-q');
      vcs('add', '-A');
      if (vcs('commit', '-q', '-m', 'Sandbox: a fresh start').status !== 0) {
        vcs('-c', 'user.name=Stratum', '-c', 'user.email=sandbox@example.invalid', 'commit', '-q', '-m', 'Sandbox: a fresh start');
      }
      const t = terminalFor(dest, TERMINAL.cwd, TERMINAL.cli);
      console.log(`A fresh copy of this world is in ${t.root}, with its own history. Your progress is untouched.`);
      console.log(`Commands for it, from ${t.cwd}: ${t.cli} <command>   (the map's panels show the exact ones)`);
      console.log('Throw it away and start over: npm run sandbox -- --reset\n');
    } else console.log('Back in the sandbox (npm run sandbox -- --reset starts over)\n');
    await serve(dest, Number(opts.port));
  });

/** Build, then serve the map with the dev API (localhost only) and live rebuilds. */
async function serve(dir: string, port: number) {
  const res = build(dir, { terminal: TERMINAL });
  const { errors } = printDiagnostics(res.diagnostics);
  if (errors.length) {
    console.log(`build failed: ${errors.length} error(s)`);
    process.exitCode = 1;
    return;
  }
  process.env.STRATUM_ROOT = dir;
  const { createServer } = await import('vite');
  const appDir = join(dirname(new URL(import.meta.url).pathname), '..', 'app');
  const server = await createServer({
    configFile: join(appDir, 'vite.config.ts'),
    // Localhost only (§11): the API can scaffold folders and write state/pins.yaml.
    server: { host: '127.0.0.1', port },
    plugins: [stratumApi(dir, (msg) => console.log(`[stratum] ${msg}`))],
  });
  await server.listen();
  server.printUrls();
}

/** Load the world or print its diagnostics and fail. */
function loadOrFail(dir: string): World | null {
  const { world, diagnostics } = loadWorld(dir);
  if (!world || diagnostics.some((d) => d.severity === 'error')) {
    printDiagnostics(diagnostics);
    console.log('the world has errors; run `stratum lint`');
    process.exitCode = 1;
    return null;
  }
  return world;
}

/** Indent a block of shrine text (prompt / done) for the terminal. */
const indent = (text: string) => text.trim().split('\n').map((l) => `    ${l}`).join('\n');

function printChecklist(checks: ClearCheck[]) {
  for (const c of checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.label}${c.ok || !c.detail ? '' : `: ${c.detail}`}`);
}

program
  .command('start <id>')
  .description('Scaffold work/<id>/ from a template and make camp there (also takes a shelved shrine off the shelf)')
  .option('--force', 'start a hidden shrine or a locked temple anyway')
  .option('--template <name>', `template to scaffold: ${TEMPLATES.join(' | ')} (default: by region)`)
  .action((id: string, opts: { force?: boolean; template?: string }) => {
    const dir = root();
    const world = loadOrFail(dir);
    if (!world) return;
    if (opts.template && !TEMPLATES.includes(opts.template as TemplateName)) {
      console.log(`unknown template "${opts.template}" (expected ${TEMPLATES.join(' | ')})`);
      process.exitCode = 1;
      return;
    }
    // Visibility needs positions and geometry, so run the build pipeline without writing anything.
    const built = build(dir, { write: false });
    if (!built.map || !built.work) {
      printDiagnostics(built.diagnostics);
      console.log('build failed; run `stratum build`');
      process.exitCode = 1;
      return;
    }
    const visibility = new Map(built.map.shrines.map((s) => [s.id, s.visibility]));
    const res = startShrine(dir, world, built.work, id, {
      force: opts.force, template: opts.template as TemplateName | undefined, visibility,
    });
    if (res.outcome === 'refused') {
      console.log(`can't start ${id}: ${res.reason}`);
      process.exitCode = 1;
      return;
    }
    const shrine = world.shrineById.get(id)!;
    if (res.outcome === 'resumed') {
      console.log(`Took ${shrine.title} off the shelf. Camp is here now.`);
      return;
    }
    if (res.outcome === 'already') {
      console.log(`${id} is already ${res.status === 'cleared' ? 'cleared' : 'in progress'} (work/${id}/WRITEUP.md exists).`);
      if (res.note) console.log(`where you left off: ${res.note}`);
      return;
    }
    console.log(`Set out for ${shrine.title} (${shrine.size}, ${res.kit ? 'with its starter kit' : `${res.template} template`})\n`);
    for (const f of res.created) console.log(`  + ${f}`);
    console.log(`\nBuild:\n${indent(shrine.prompt)}\n\nDone when:\n${indent(shrine.done)}\n`);
    const t = terminalFor(dir, TERMINAL.cwd, TERMINAL.cli);
    console.log(`Your work goes in ${join(t.root, 'work', id)}/ (WRITEUP.md, NEXT.md and your own files).`);
    console.log(`Camp is here now. Before stopping, write where you left off on the first line of NEXT.md.`);
    console.log(`When the write-up is done, clear it from a terminal (in ${t.cwd}):\n  ${t.cli} clear ${id}`);
  });

program
  .command('clear <id>')
  .description('Validate a clear (§5), stamp the date, and suggest a commit')
  .action((id: string) => {
    const dir = root();
    const world = loadOrFail(dir);
    if (!world) return;
    const res = clearShrine(dir, world, loadConfig(dir), id);
    switch (res.outcome) {
      case 'unknown':
        console.log(res.reason);
        process.exitCode = 1;
        return;
      case 'already':
        console.log(`${id} is already cleared${res.date ? ` (${res.date})` : ''}.`);
        return;
      case 'failed':
        console.log(`${res.shrine.title} isn't clear yet:\n`);
        printChecklist(res.checks);
        process.exitCode = 1;
        return;
      case 'cleared':
        printChecklist(res.checks);
        console.log(`\nCleared ${res.shrine.title} on ${res.date}.\n`);
        console.log(`Did you:\n${indent(res.shrine.done)}\n`);
        if (res.unpinned) console.log(`The pin was on ${id}; it's removed.\n`);
        console.log(`If so, commit it (stratum never commits for you), in ${resolve(dir)}:\n  ${res.commit}`);
    }
  });

program
  .command('status')
  .description('Counts by layer and region, plus your camp, cairns and shelved work')
  .action(() => {
    const dir = root();
    const world = loadOrFail(dir);
    if (!world) return;
    const work = readWorkState(dir, world, loadConfig(dir), readGitWork(gitReader(dir)));
    const count = (ids: string[]) => ({
      cleared: ids.filter((i) => work.get(i)?.status === 'cleared').length,
      active: ids.filter((i) => work.get(i)?.status === 'in-progress').length,
      total: ids.length,
    });
    const line = (label: string, c: ReturnType<typeof count>) =>
      `${label.padEnd(28)} ${String(c.cleared).padStart(3)} cleared  ${String(c.active).padStart(2)} in progress  / ${c.total}`;
    for (const l of LAYERS) {
      console.log(line(l, count(world.shrines.filter((s) => s.layer === l).map((s) => s.id))));
      for (const r of world.regions.filter((x) => x.layer === l)) {
        const c = count(world.shrines.filter((s) => s.region === r.id).map((s) => s.id));
        if (c.cleared || c.active) console.log(line(`  ${r.name}`, c));
      }
    }
    const note = (id: string) => work.get(id)!.camp?.note ?? '(no NEXT.md note)';
    const camp = world.shrines.find((s) => work.get(s.id)?.camp?.current);
    const cairns = world.shrines.filter((s) => work.get(s.id)?.camp && !work.get(s.id)!.camp!.current);
    const shelved = world.shrines.filter((s) => work.get(s.id)?.status === 'shelved');
    const uncommitted = world.shrines.filter((s) => work.get(s.id)?.status === 'cleared' && !work.get(s.id)!.committed);
    if (camp) console.log(`\nCamp: ${camp.id}: ${note(camp.id)}`);
    if (cairns.length) {
      console.log('Cairns (started, stepped away from):');
      for (const s of cairns) console.log(`  ${s.id}: ${note(s.id)}`);
    }
    if (shelved.length) console.log(`Shelved: ${shelved.map((s) => s.id).join(', ')}`);
    if (uncommitted.length) console.log(`\nCleared but not committed: ${uncommitted.map((s) => s.id).join(', ')}`);
  });

/** The build pipeline without writing: current visibility, work state and Horizon. */
function currentMap(dir: string): (BuildResult & { map: MapData }) | null {
  const built = build(dir, { write: false });
  if (!built.map || !built.work) {
    printDiagnostics(built.diagnostics);
    console.log('build failed; run `stratum build`');
    process.exitCode = 1;
    return null;
  }
  return built as BuildResult & { map: MapData };
}

const SLOT_NAME = { thread: 'The Thread', vertical: 'The Vertical', far: 'The Far Landmark' } as const;
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

program
  .command('horizon')
  .description('Print the three Horizon cards (§7)')
  .action(() => {
    const built = currentMap(root());
    if (!built) return;
    const { map } = built;
    const byId = new Map(map.shrines.map((s) => [s.id, s]));
    const regionName = new Map(map.regions.map((r) => [r.id, r.name]));
    if (!map.horizon.length) console.log('The horizon is empty: nothing in sight to set out for.');
    for (const c of map.horizon) {
      const s = byId.get(c.id)!;
      const title = s.titleKnown ? s.title : '???';
      const where = `${s.layer} · ${regionName.get(s.region) ?? s.region} · ${s.size}${s.requires.length ? ` · needs ${s.requires.join(', ')}` : ''}`;
      console.log(`${SLOT_NAME[c.slot]}\n  ${title}  (${where})`);
      if (c.rule === 'camp' && s.camp?.note) console.log(`  where you left off: ${s.camp.note}`);
      if (c.teaser) console.log(`  ${c.teaser}`);
      if (c.bearing !== undefined) console.log(`  ${c.distance} away, ${COMPASS[Math.round(c.bearing / 45) % 8]}`);
      console.log(`  → stratum start ${c.id}${map.pin === c.id ? '   (pinned)' : ''}\n`);
    }
    if (map.pin) console.log(`Pin: ${byId.get(map.pin)?.title ?? map.pin}`);
  });

program
  .command('pin [id]')
  .description(`Set the map pin (one at a time, in ${PINS_PATH}), or remove it with --clear`)
  .option('--clear', 'remove the pin')
  .action((id: string | undefined, opts: { clear?: boolean }) => {
    const dir = root();
    if (!opts.clear && !id) {
      console.log('give a shrine id, or --clear');
      process.exitCode = 1;
      return;
    }
    const world = loadOrFail(dir);
    if (!world) return;
    const built = currentMap(dir);
    if (!built) return;
    const visibility = new Map(built.map.shrines.map((s) => [s.id, s.visibility]));
    const out = setPin(dir, world, visibility, (x) => built.work!.get(x)?.status === 'cleared', opts.clear ? null : id!);
    if (!out.ok) {
      console.log(`can't pin: ${out.reason}`);
      process.exitCode = 1;
      return;
    }
    console.log(out.pin ? `Pinned ${out.pin}. The Thread now routes toward it.` : 'Pin removed.');
  });

program
  .command('shelve <id>')
  .description('Set in-progress work aside: kept in git, but no longer a camp, a vantage or on the Horizon (start resumes it)')
  .action((id: string) => {
    const dir = root();
    const world = loadOrFail(dir);
    if (!world) return;
    const out = shelveShrine(dir, world, readWorkState(dir, world, loadConfig(dir)), id);
    if (out.outcome === 'refused') {
      console.log(`can't shelve: ${out.reason}`);
      process.exitCode = 1;
      return;
    }
    console.log(`Shelved ${id}. Its folder and history stay; \`stratum start ${id}\` takes it off the shelf.`);
  });

program
  .command('propose')
  .description(`Append a proposal stub to ${PROPOSED_PATH} (§4.3, §5.3); a loose thread from the write-up becomes its prompt`)
  .requiredOption('--from <id>', 'the proposing shrine (a tower clear, or a write-up with loose threads)')
  .option('--thread <n>', 'which loose thread (1-based; see the list with no --thread)')
  .option('--text <text>', 'the proposal text, instead of a loose thread')
  .option('--no-edit', "don't open $EDITOR afterwards")
  .action((opts: { from: string; thread?: string; text?: string; edit: boolean }) => {
    const dir = root();
    const world = loadOrFail(dir);
    if (!world) return;
    if (!world.shrineById.has(opts.from)) {
      console.log(`unknown shrine "${opts.from}"`);
      process.exitCode = 1;
      return;
    }
    const writeup = join(dir, 'work', opts.from, 'WRITEUP.md');
    const threads = existsSync(writeup) ? looseThreads(parseWriteup(readFileSync(writeup, 'utf8')).body) : [];
    let text = opts.text;
    if (!text && opts.thread !== undefined) {
      text = threads[Number(opts.thread) - 1];
      if (!text) {
        console.log(`no loose thread ${opts.thread} in work/${opts.from}/WRITEUP.md (it has ${threads.length})`);
        process.exitCode = 1;
        return;
      }
    }
    if (!text && threads.length) {
      console.log(`Loose threads in work/${opts.from}/WRITEUP.md:`);
      threads.forEach((t, i) => console.log(`  ${i + 1}. ${t}`));
      console.log(`Pick one: stratum propose --from ${opts.from} --thread <n>   (or --text "…")`);
      return;
    }
    const stub = proposalStub(world, opts.from, text);
    const file = join(dir, PROPOSED_PATH);
    const before = existsSync(file) ? readFileSync(file, 'utf8') : 'shrines: []\n';
    writeFileSync(file, appendProposal(before, stub.yaml));
    console.log(`added "${stub.id}" to ${PROPOSED_PATH}:\n${indent(stub.yaml)}`);
    const { diagnostics } = loadWorld(dir);
    const { errors } = printDiagnostics(diagnostics.filter((d) => d.file === PROPOSED_PATH));
    console.log('Fill in `done` (and adjust anything else), then run `stratum build`: existing shrines keep their places.');
    if (errors.length) process.exitCode = 1;
    const editor = process.env.VISUAL || process.env.EDITOR;
    if (opts.edit && editor && process.stdout.isTTY) spawnSync(`${editor} ${JSON.stringify(file)}`, { stdio: 'inherit', shell: true });
  });

program
  .command('setup')
  .description(`Detect this machine's hardware tags and write ${LOCAL_CONFIG_PATH} (one-time, per machine)`)
  .option('--with <tags...>', 'force tags on (e.g. llm-api when the key lives elsewhere)')
  .option('--without <tags...>', 'force tags off')
  .option('--dry-run', 'print the result without writing')
  .action((opts: { with?: string[]; without?: string[]; dryRun?: boolean }) => {
    try {
      setup(root(), opts);
    } catch (e) {
      console.error((e as Error).message);
      process.exitCode = 1;
    }
  });

program.parse();
