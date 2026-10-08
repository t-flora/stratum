import { mkdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { CONFIG_PATH, loadConfig, type Config } from './config.ts';
import { computeExplored, exploredShare } from './explore.ts';
import { buildGeometry, buildMapData } from './export.ts';
import { computeHorizon, isoWeek } from './horizon.ts';
import type { MapGeometry } from './mapdata.ts';
import { readPin } from './pins.ts';
import { hash32 } from './prng.ts';
import { GRID_STEP, Geometry } from './geometry.ts';
import { gitReader, readGitWork, type GitReader } from './git.ts';
import { loadWorld, SEED_PATH } from './loader.ts';
import type { MapData } from './mapdata.ts';
import { placeShrines, readLock, serializeLock, writeLock, type PlacementResult } from './placement.ts';
import type { Diagnostic, Vec2, World } from './types.ts';
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
  out.push(...landmassProblems(geo));
  return out;
}

/** A region must keep at least this share of the land, and its main piece this share of the region. */
const MIN_REGION_SHARE = 0.03;
const MIN_MAIN_PIECE = 0.85;

/**
 * The continent's guarantees (docs/plans/geography.md). The generator is deterministic, so a failure is a property of
 * (regions, seed): the fix is a different `world.seed`, which is only safe while nothing has been started.
 */
export function landmassProblems(geo: Geometry): Diagnostic[] {
  const out: Diagnostic[] = [];
  const fail = (message: string) =>
    out.push({ severity: 'error', code: 'landmass', message: `${message}; try another world.seed (only while nothing is started)`, file: CONFIG_PATH });
  const { gw, gh, cells } = geo;
  const cellOf = ([x, y]: Vec2) => Math.round(y / GRID_STEP) * gw + Math.round(x / GRID_STEP);
  /** 4-connected flood fill from `start` over cells accepted by `ok`. */
  const fill = (start: number, ok: (c: number) => boolean) => {
    const seen = new Uint8Array(gw * gh);
    const stack = [start];
    seen[start] = 1;
    let n = 0;
    while (stack.length) {
      const c = stack.pop()!;
      n++;
      const x = c % gw;
      for (const d of [x > 0 ? c - 1 : -1, x < gw - 1 ? c + 1 : -1, c - gw, c + gw]) {
        if (d >= 0 && d < gw * gh && !seen[d] && ok(d)) {
          seen[d] = 1;
          stack.push(d);
        }
      }
    }
    return { seen, n };
  };

  let landCells = 0;
  const regionCells = new Array<number>(geo.surface.length).fill(0);
  for (const c of cells) if (c >= 0) (landCells++, regionCells[c]!++);

  geo.surface.forEach((r, i) => {
    const c = cellOf(r.centroid!);
    if (cells[c] !== i) return fail(`region "${r.id}": its centroid isn't in its own land`);
    if (regionCells[i]! < MIN_REGION_SHARE * landCells) fail(`region "${r.id}" has only ${Math.round((100 * regionCells[i]!) / landCells)}% of the land`);
    const main = fill(c, (d) => cells[d] === i).n;
    if (main < MIN_MAIN_PIECE * regionCells[i]!) fail(`region "${r.id}" is split: its main piece holds ${Math.round((100 * main) / regionCells[i]!)}% of it`);
  });
  if (out.length) return out;

  // One continent: every region's centroid is reachable over land from the first region's.
  const { seen } = fill(cellOf(geo.surface[0]!.centroid!), (d) => cells[d]! >= 0);
  const cut = geo.surface.filter((r) => !seen[cellOf(r.centroid!)]).map((r) => r.id);
  if (cut.length) fail(`the land is in pieces: ${cut.join(', ')} ${cut.length === 1 ? 'is' : 'are'} cut off from ${geo.surface[0]!.id} by water`);
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
  /** Ignore work/ and the pin: the map a newcomer sees (the public site, `build --static --public`). */
  fresh?: boolean;
  /** Where the CLI runs from and its command prefix (e.g. `npm run stratum --`), for map.json's `terminal`. */
  terminal?: { cwd: string; cli: string };
}

/**
 * How to reach a world from a terminal: its absolute folder, and the command to run from `cwd`. A world elsewhere
 * gets `--root` (relative when it's inside `cwd`, so commands stay short), so a copied command works as pasted.
 */
export function terminalFor(root: string, cwd: string, cli: string): NonNullable<MapData['terminal']> {
  const abs = resolve(root);
  const here = resolve(cwd);
  const rel = relative(here, abs);
  const where = rel === '' ? '' : !rel.startsWith('..') && !isAbsolute(rel) ? rel : abs;
  const quoted = /^[\w./-]+$/.test(where) ? where : `'${where.replace(/'/g, `'\\''`)}'`;
  return { root: abs, cwd: here, cli: where ? `${cli} --root ${quoted}` : cli };
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
  const work = opts.fresh ? new Map<string, ShrineWork>() : readWorkState(root, world, config, readGitWork(opts.git ?? gitReader(root)));
  const status = (id: string) => work.get(id)?.status ?? 'untouched';
  const sight = computeVisibility(world, placement.positions, status, geo, config.visibility);
  const explored = computeExplored(world, placement.positions, status, geo, config.visibility);
  const now = opts.now ?? Date.now();
  const week = isoWeek(new Date(now));
  const pin = opts.fresh ? null : readPin(root);
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
  if (opts.terminal) map.terminal = terminalFor(root, opts.terminal.cwd, opts.terminal.cli);
  if (opts.write !== false) {
    if (lockChanged) writeLock(root, placement.lock);
    mkdirSync(join(root, 'build'), { recursive: true });
    writeFileSync(join(root, MAP_PATH), JSON.stringify(map));
  }
  return { map, diagnostics, placement, lockChanged, work };
}
