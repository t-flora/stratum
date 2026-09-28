#!/usr/bin/env -S npx tsx
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { Command } from 'commander';
import {
  CONFIG_PATH, LAYERS, LOCAL_CONFIG_PATH, hasLocalConfig, lintWorkFolders, loadConfig, loadWorld, summarize, validateConfig,
  type Diagnostic,
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

const root = () => (program.opts().root as string | undefined) ?? findRoot();

program
  .command('lint')
  .description('Validate the world and every WRITEUP.md')
  .action(() => {
    const dir = root();
    const { world, diagnostics } = loadWorld(dir);
    if (world) diagnostics.push(...lintWorkFolders(dir, world));
    const configFile = hasLocalConfig(dir) ? LOCAL_CONFIG_PATH : CONFIG_PATH;
    for (const message of validateConfig(loadConfig(dir))) {
      diagnostics.push({ severity: 'error', code: 'config', message, file: configFile });
    }
    const errors = diagnostics.filter((d) => d.severity === 'error');
    const warnings = diagnostics.filter((d) => d.severity === 'warning');
    const byLocation = (a: Diagnostic, b: Diagnostic) => a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0);
    for (const d of [...errors.sort(byLocation), ...warnings.sort(byLocation)]) console.log(formatDiagnostic(d));
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
