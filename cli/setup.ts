import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import {
  LOCAL_CONFIG_PATH, REQUIRE_TAGS, detectHardware, resolveAvailable,
  type HardwareProbe, type RequireTag,
} from '@stratum/core';

function run(cmd: string, args: string[]): string | null {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 });
  } catch {
    return null;
  }
}

export const realProbe: HardwareProbe = {
  platform: process.platform,
  arch: process.arch,
  cpuFlags() {
    if (process.platform === 'linux' && existsSync('/proc/cpuinfo')) {
      const line = readFileSync('/proc/cpuinfo', 'utf8').split('\n').find((l) => /^(flags|Features)\s*:/.test(l));
      return line ? line.split(':')[1]!.trim().toLowerCase().split(/\s+/) : [];
    }
    if (process.platform === 'darwin') {
      const out = [run('sysctl', ['-n', 'machdep.cpu.features']), run('sysctl', ['-n', 'machdep.cpu.leaf7_features'])];
      return out.filter(Boolean).join(' ').toLowerCase().split(/\s+/).filter(Boolean);
    }
    return [];
  },
  nvidiaGpus() {
    const out = run('nvidia-smi', ['--query-gpu=name', '--format=csv,noheader']);
    return out ? out.split('\n').map((s) => s.trim()).filter(Boolean) : [];
  },
  env: process.env,
};

function parseTags(list: string[] | undefined, flag: string): RequireTag[] {
  for (const t of list ?? []) {
    if (!REQUIRE_TAGS.includes(t as RequireTag)) throw new Error(`${flag}: unknown tag "${t}" (expected ${REQUIRE_TAGS.join(', ')})`);
  }
  return (list ?? []) as RequireTag[];
}

export function setup(root: string, opts: { with?: string[]; without?: string[]; dryRun?: boolean }, probe = realProbe) {
  const detected = detectHardware(probe);
  const available = resolveAvailable(detected, parseTags(opts.with, '--with'), parseTags(opts.without, '--without'));

  console.log('Detected on this machine:');
  for (const d of detected) {
    const final = available.includes(d.tag);
    const note = final !== d.available ? (final ? '  (added by --with)' : '  (removed by --without)') : '';
    console.log(`  ${final ? '✓' : '·'} ${d.tag.padEnd(8)} ${d.reason}${note}`);
  }

  const file = join(root, LOCAL_CONFIG_PATH);
  const existing = existsSync(file) ? (parse(readFileSync(file, 'utf8')) ?? {}) : {};
  const next = { ...existing, hardware: { ...(existing.hardware ?? {}), available } };
  const header = `# Per-machine overrides of stratum.config.yaml (gitignored).\n` +
    `# Written by \`stratum setup\` on ${hostname()}, ${new Date().toISOString().slice(0, 10)}. Edit freely or re-run setup.\n`;
  const text = header + stringify(next, { flow: false });

  console.log(`\nhardware.available: [${available.join(', ')}]`);
  if (opts.dryRun) {
    console.log(`(dry run: ${LOCAL_CONFIG_PATH} not written)`);
    return;
  }
  writeFileSync(file, text);
  console.log(`Wrote ${LOCAL_CONFIG_PATH}. Override detection with --with <tags...> / --without <tags...>.`);
}
