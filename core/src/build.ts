import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, type Config } from './config.ts';
import { computeExplored, exploredShare } from './explore.ts';
import { buildGeometry, buildMapData } from './export.ts';
import { computeHorizon, isoWeek } from './horizon.ts';
import type { MapGeometry } from './mapdata.ts';
import { readPin } from './pins.ts';
import { hash32 } from './prng.ts';
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

/**
 * Reuse geometry across rebuilds (the dev server's watcher). Geometry depends only on the world's regions,
 * ridges, the seed and the placed positions, so work, pins and write-ups rebuild without recomputing it.
 */
export interface BuildCache {
  key?: number;
  geo?: Geometry;
  posKey?: number;
  geometry?: MapGeometry;
}

export interface BuildOptions {
  replace?: string[];
  write?: boolean;
  config?: Config;
  git?: GitReader;
  /** Build time (ms): stamps map.json and picks the ISO week for the Horizon. */
  now?: number;
  cache?: BuildCache;
}

/** Load, validate, place, and assemble map.json. Writes the lockfile and map unless `write` is false. */
export function build(root: string, opts: BuildOptions = {}): BuildResult {
  const config = opts.config ?? loadConfig(root);
  const { world, diagnostics } = loadWorld(root);
  if (!world || diagnostics.some((d) => d.severity === 'error')) return { map: null, diagnostics, placement: null, lockChanged: false, work: null };

  for (const id of opts.replace ?? []) {
    if (!world.shrineById.has(id)) diagnostics.push({ severity: 'error', code: 'unknown-id', message: `--replace: unknown shrine "${id}"`, file: SEED_PATH });
  }
  const geoKey = hash32(JSON.stringify([config.world.seed, world.canvas, world.regions, world.ridges]));
  const cache = opts.cache;
  const geo = cache?.geo && cache.key === geoKey ? cache.geo : new Geometry(world, config.world.seed);
  if (cache && cache.geo !== geo) Object.assign(cache, { key: geoKey, geo, geometry: undefined });
  diagnostics.push(...lintGeometry(world, geo));
  if (diagnostics.some((d) => d.severity === 'error')) return { map: null, diagnostics, placement: null, lockChanged: false, work: null };

  const before = readLock(root);
  const placement = placeShrines(world, geo, before, opts.replace);
  const lockChanged = serializeLock(before) !== serializeLock(placement.lock);
  const work = readWorkState(root, world, config, readGitWork(opts.git ?? gitReader(root)));
  const status = (id: string) => work.get(id)?.status ?? 'untouched';
  const sight = computeVisibility(world, placement.positions, status, geo, config.visibility);
  const explored = computeExplored(world, placement.positions, status, geo, config.visibility);
  const now = opts.now ?? Date.now();
  const week = isoWeek(new Date(now));
  const pin = readPin(root);
  const horizon = computeHorizon({
    world, positions: placement.positions, pin, available: config.hardware.available, config, week,
    state: (id) => {
      const w = work.get(id);
      return {
        status: w?.status ?? 'untouched', visibility: sight.visibility.get(id)!, clearedAt: w?.clearedAt,
        lastTouched: w?.camp?.since ?? undefined, camp: w?.camp?.current ?? false,
      };
    },
  });
  // Geometry also depends on positions (islets and vein territories grow around placed shrines).
  const posKey = hash32(JSON.stringify([[...placement.positions].sort(), world.shrines.map((s) => [s.id, s.region, s.theme, s.kind, s.p])]));
  let geometry = cache?.geometry && cache.posKey === posKey ? cache.geometry : undefined;
  if (!geometry) {
    geometry = buildGeometry(world, geo, placement.positions);
    if (cache) Object.assign(cache, { geometry, posKey });
  }
  const map = buildMapData(
    world, geo, placement.positions, placement.anchors,
    { work, sight, explored, exploredShare: exploredShare(world, geo, explored), config: config.visibility, available: config.hardware.available, horizon, pin, week }, now, geometry,
  );
  if (opts.write !== false) {
    if (lockChanged) writeLock(root, placement.lock);
    mkdirSync(join(root, 'build'), { recursive: true });
    writeFileSync(join(root, MAP_PATH), JSON.stringify(map));
  }
  return { map, diagnostics, placement, lockChanged, work };
}
