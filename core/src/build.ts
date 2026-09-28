import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, type Config } from './config.ts';
import { buildMapData } from './export.ts';
import { Geometry } from './geometry.ts';
import { gitReader, readGitWork, type GitReader } from './git.ts';
import { loadWorld, SEED_PATH } from './loader.ts';
import type { MapData } from './mapdata.ts';
import { placeShrines, readLock, serializeLock, writeLock, type PlacementResult } from './placement.ts';
import type { Diagnostic, World } from './types.ts';
import { computeVisibility } from './visibility.ts';
import { readWorkState, type ShrineWork } from './work.ts';

export const MAP_PATH = 'build/map.json';

/** Geometry-dependent checks: ridge overrides must be between adjacent regions (§4.2), regions must have land. */
export function lintGeometry(world: World, geo: Geometry): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const o of world.ridges.overrides) {
    if (!geo.isAdjacent(o.between[0], o.between[1])) {
      const d: Diagnostic = {
        severity: 'warning', code: 'ridge-not-adjacent',
        message: `ridge override between ${o.between[0]} and ${o.between[1]}, which don't share a border; it has no effect`,
        file: SEED_PATH,
      };
      if (o.line) d.line = o.line;
      out.push(d);
    }
  }
  geo.surface.forEach((r, i) => {
    if (!Number.isFinite(geo.bbox[i]!.minX)) {
      out.push({ severity: 'error', code: 'empty-region', message: `region "${r.id}" has no land (centroid at sea or swallowed by neighbours)`, file: SEED_PATH });
    }
  });
  return out;
}

export interface BuildResult {
  map: MapData | null;
  diagnostics: Diagnostic[];
  placement: PlacementResult | null;
  lockChanged: boolean;
  work: Map<string, ShrineWork> | null;
}

/** Load, validate, place, and assemble map.json. Writes the lockfile and map unless `write` is false. */
export function build(root: string, opts: { replace?: string[]; write?: boolean; config?: Config; git?: GitReader; now?: number } = {}): BuildResult {
  const config = opts.config ?? loadConfig(root);
  const { world, diagnostics } = loadWorld(root);
  if (!world || diagnostics.some((d) => d.severity === 'error')) return { map: null, diagnostics, placement: null, lockChanged: false, work: null };

  for (const id of opts.replace ?? []) {
    if (!world.shrineById.has(id)) diagnostics.push({ severity: 'error', code: 'unknown-id', message: `--replace: unknown shrine "${id}"`, file: SEED_PATH });
  }
  const geo = new Geometry(world, config.world.seed);
  diagnostics.push(...lintGeometry(world, geo));
  if (diagnostics.some((d) => d.severity === 'error')) return { map: null, diagnostics, placement: null, lockChanged: false, work: null };

  const before = readLock(root);
  const placement = placeShrines(world, geo, before, opts.replace);
  const lockChanged = serializeLock(before) !== serializeLock(placement.lock);
  const work = readWorkState(root, world, config, readGitWork(opts.git ?? gitReader(root)));
  const sight = computeVisibility(world, placement.positions, (id) => work.get(id)?.status ?? 'untouched', geo, config.visibility);
  const map = buildMapData(world, geo, placement.positions, placement.anchors, { work, sight, config: config.visibility }, opts.now);
  if (opts.write !== false) {
    if (lockChanged) writeLock(root, placement.lock);
    mkdirSync(join(root, 'build'), { recursive: true });
    writeFileSync(join(root, MAP_PATH), JSON.stringify(map));
  }
  return { map, diagnostics, placement, lockChanged, work };
}
