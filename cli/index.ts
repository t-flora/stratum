#!/usr/bin/env -S npx tsx
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { Command } from 'commander';
import {
  CONFIG_PATH, Geometry, LAYERS, LOCAL_CONFIG_PATH, LOCK_PATH, MAP_PATH, TEMPLATES, build, clearShrine, gitReader, hasLocalConfig,
  lintClears, lintGeometry, lintWorkFolders, loadConfig, loadWorld, readGitWork, readWorkState, startShrine, summarize, validateConfig,
  type ClearCheck, type Diagnostic, type TemplateName, type World,
} from '@stratum/core';
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
    if (world) diagnostics.push(...lintWorkFolders(dir, world));
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
  .action((opts: { replace?: string[] }) => {
    const t0 = performance.now();
    const res = build(root(), { replace: opts.replace });
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
        `${work.filter((w) => w.status === 'in-progress').length} in progress`,
    );
    console.log(`wrote ${MAP_PATH} in ${Math.round(performance.now() - t0)} ms`);
  });

program
  .command('dev')
  .description('Build, then serve the map with Vite on localhost')
  .option('--port <n>', 'port', '5173')
  .action(async (opts: { port: string }) => {
    const dir = root();
    const res = build(dir);
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
      server: { host: '127.0.0.1', port: Number(opts.port) },
    });
    await server.listen();
    server.printUrls();
  });

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
  .description('Scaffold work/<id>/ from a template and light a campfire')
  .option('--force', 'start a locked temple anyway')
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
    const work = readWorkState(dir, world, loadConfig(dir));
    const res = startShrine(dir, world, work, id, { force: opts.force, template: opts.template as TemplateName | undefined });
    if (res.outcome === 'refused') {
      console.log(`can't start ${id}: ${res.reason}`);
      process.exitCode = 1;
      return;
    }
    const shrine = world.shrineById.get(id)!;
    if (res.outcome === 'already') {
      console.log(`${id} is already ${res.status === 'cleared' ? 'cleared' : 'in progress'} (work/${id}/WRITEUP.md exists).`);
      if (res.note) console.log(`campfire: ${res.note}`);
      return;
    }
    console.log(`Set out for ${shrine.title} (${shrine.size}, ${res.template} template)\n`);
    for (const f of res.created) console.log(`  + ${f}`);
    console.log(`\nBuild:\n${indent(shrine.prompt)}\n\nDone when:\n${indent(shrine.done)}\n`);
    console.log(`Before stopping, write where you left off on the first line of work/${id}/NEXT.md.`);
    console.log(`When the write-up is done: stratum clear ${id}`);
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
        console.log(`If so, commit it (stratum never commits for you):\n  ${res.commit}`);
    }
  });

program
  .command('status')
  .description('Counts by layer and region, plus campfires')
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
    const fires = world.shrines.filter((s) => work.get(s.id)?.status === 'in-progress');
    const uncommitted = world.shrines.filter((s) => work.get(s.id)?.status === 'cleared' && !work.get(s.id)!.committed);
    if (fires.length) {
      console.log('\nCampfires:');
      for (const s of fires) console.log(`  ${s.id}: ${work.get(s.id)!.campfire?.note ?? '(no NEXT.md note)'}`);
    }
    if (uncommitted.length) console.log(`\nCleared but not committed: ${uncommitted.map((s) => s.id).join(', ')}`);
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
