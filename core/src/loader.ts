import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { LineCounter, parseDocument, isMap, isSeq, isScalar, type Node, type YAMLMap } from 'yaml';
import {
  BIOMES, KINDS, LAYERS, REQUIRE_TAGS, SIZES,
  type Biome, type Diagnostic, type Kind, type Layer, type Region, type RequireTag, type Shrine, type Size, type Vec2, type World,
} from './types.ts';

export interface Source {
  file: string;
  text: string;
}

export interface LoadResult {
  /** Null only if the seed file could not be parsed at all. */
  world: World | null;
  diagnostics: Diagnostic[];
}

export const SEED_PATH = 'world/world-seed.yaml';
export const PROPOSED_PATH = 'world/proposed.yaml';

const REGION_KEYS = new Set(['id', 'layer', 'name', 'centroid', 'radius', 'biome']);
const SHRINE_KEYS = new Set([
  'id', 'title', 'region', 'theme', 'kind', 'p', 'size', 'requires', 'below', 'after', 'links', 'needs', 'prompt', 'done', 'xy', 'from',
]);
const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Load the world from the repo root. */
export function loadWorld(root: string): LoadResult {
  const read = (rel: string): Source | undefined => {
    const abs = join(root, rel);
    return existsSync(abs) ? { file: rel, text: readFileSync(abs, 'utf8') } : undefined;
  };
  const seed = read(SEED_PATH);
  if (!seed) {
    return { world: null, diagnostics: [{ severity: 'error', code: 'missing-file', message: 'world seed not found', file: SEED_PATH }] };
  }
  return parseWorld(seed, read(PROPOSED_PATH));
}

/** A parsed YAML file with position lookup. */
class Doc {
  readonly lc = new LineCounter();
  readonly root: Node | null;
  constructor(readonly src: Source, readonly diags: Diagnostic[]) {
    const doc = parseDocument(src.text, { lineCounter: this.lc, prettyErrors: false, uniqueKeys: true });
    for (const e of [...doc.errors, ...doc.warnings]) {
      const pos = this.lc.linePos(e.pos[0]);
      diags.push({
        severity: doc.errors.includes(e) ? 'error' : 'warning',
        code: 'yaml',
        message: e.message.split('\n')[0]!,
        file: src.file, line: pos.line, col: pos.col,
      });
    }
    this.root = doc.errors.length ? null : (doc.contents as Node | null);
  }
  report(severity: Diagnostic['severity'], code: string, message: string, node?: Node | null) {
    const d: Diagnostic = { severity, code, message, file: this.src.file };
    if (node?.range) {
      const pos = this.lc.linePos(node.range[0]);
      d.line = pos.line;
      d.col = pos.col;
    }
    this.diags.push(d);
  }
  lineOf(node?: Node | null): number | undefined {
    return node?.range ? this.lc.linePos(node.range[0]).line : undefined;
  }
}

function get(map: YAMLMap, key: string): Node | null {
  return (map.get(key, true) as Node | undefined) ?? null;
}
function keyNode(map: YAMLMap, key: string): Node | null {
  const pair = map.items.find((p) => isScalar(p.key) && p.key.value === key);
  return (pair?.key as Node | undefined) ?? null;
}
function js(node: Node | null): unknown {
  return node ? node.toJSON() : undefined;
}
function isVec2(v: unknown): v is Vec2 {
  return Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number' && Number.isFinite(n));
}
function isStringList(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((s) => typeof s === 'string');
}

interface RawShrine {
  shrine: Shrine;
  doc: Doc;
  node: YAMLMap;
}

/** Parse and validate the world. Pure given the sources, so tests can feed strings. */
export function parseWorld(seedSrc: Source, proposedSrc?: Source): LoadResult {
  const diagnostics: Diagnostic[] = [];
  const seed = new Doc(seedSrc, diagnostics);
  const proposed = proposedSrc ? new Doc(proposedSrc, diagnostics) : null;
  if (!seed.root || !isMap(seed.root)) {
    if (seed.root) seed.report('error', 'schema', 'world seed must be a mapping', seed.root);
    return { world: null, diagnostics };
  }
  const top = seed.root;

  // ---- canvas / start ----------------------------------------------------------------
  const canvasJs = js(get(top, 'canvas')) as { width?: unknown; height?: unknown } | undefined;
  const canvas = { width: 1600, height: 1000 };
  if (canvasJs !== undefined) {
    if (typeof canvasJs?.width === 'number' && typeof canvasJs?.height === 'number') {
      canvas.width = canvasJs.width;
      canvas.height = canvasJs.height;
    } else seed.report('error', 'schema', 'canvas must be { width: number, height: number }', get(top, 'canvas'));
  }

  const startNode = get(top, 'start');
  const start: World['start'] = { vantage: [canvas.width / 2, canvas.height / 2] as Vec2, plateau: [] as string[] };
  if (!isMap(startNode)) {
    seed.report('error', 'schema', 'missing `start` mapping', startNode ?? top);
  } else {
    const v = js(get(startNode, 'vantage'));
    if (isVec2(v)) start.vantage = v;
    else seed.report('error', 'schema', 'start.vantage must be [x, y]', get(startNode, 'vantage') ?? startNode);
    const pl = js(get(startNode, 'plateau'));
    if (pl === undefined) start.plateau = [];
    else if (isStringList(pl)) start.plateau = pl;
    else seed.report('error', 'schema', 'start.plateau must be a list of shrine ids', get(startNode, 'plateau'));
    const sky = js(get(startNode, 'sky'));
    if (sky === undefined) {
      // A surface start (the default).
    } else if (isStringList(sky) && sky.length) start.sky = sky;
    else seed.report('error', 'schema', 'start.sky must be a non-empty list of sky shrine ids', get(startNode, 'sky'));
  }

  // ---- regions -------------------------------------------------------------------------
  const regions: Region[] = [];
  const regionById = new Map<string, Region>();
  const regionNodes = new Map<string, Node>();
  const regionsNode = get(top, 'regions');
  if (!isSeq(regionsNode)) seed.report('error', 'schema', 'missing `regions` list', regionsNode ?? top);
  else {
    for (const item of regionsNode.items as Node[]) {
      if (!isMap(item)) { seed.report('error', 'schema', 'region must be a mapping', item); continue; }
      for (const pair of item.items) {
        const k = isScalar(pair.key) ? String(pair.key.value) : '?';
        if (!REGION_KEYS.has(k)) seed.report('warning', 'unknown-field', `region has unknown field \`${k}\``, pair.key as Node);
      }
      const id = js(get(item, 'id'));
      const layer = js(get(item, 'layer'));
      const name = js(get(item, 'name'));
      const centroid = js(get(item, 'centroid'));
      const radius = js(get(item, 'radius'));
      if (typeof id !== 'string' || !id) { seed.report('error', 'schema', 'region is missing `id`', item); continue; }
      if (regionById.has(id)) {
        seed.report('error', 'duplicate-id', `duplicate region id "${id}" (first defined at line ${seed.lineOf(regionNodes.get(id))})`, get(item, 'id'));
        continue;
      }
      if (!LAYERS.includes(layer as Layer)) {
        seed.report('error', 'schema', `region "${id}": layer must be one of ${LAYERS.join(' | ')}`, get(item, 'layer') ?? item);
        continue;
      }
      if (typeof name !== 'string') seed.report('error', 'schema', `region "${id}" is missing \`name\``, item);
      const region: Region = { id, layer: layer as Layer, name: typeof name === 'string' ? name : id };
      if (layer !== 'depths') {
        if (isVec2(centroid)) region.centroid = centroid;
        else seed.report('error', 'schema', `region "${id}": ${layer} regions need centroid: [x, y]`, get(item, 'centroid') ?? item);
      } else if (centroid !== undefined) {
        seed.report('warning', 'schema', `region "${id}": depths veins have no centroid; ignored`, get(item, 'centroid'));
      }
      if (layer === 'sky') {
        if (typeof radius === 'number' && radius > 0) region.radius = radius;
        else seed.report('error', 'schema', `region "${id}": sky islands need a positive \`radius\``, get(item, 'radius') ?? item);
      } else if (radius !== undefined) {
        seed.report('warning', 'schema', `region "${id}": \`radius\` only applies to sky islands; ignored`, get(item, 'radius'));
      }
      const biome = js(get(item, 'biome'));
      if (biome !== undefined) {
        if (layer !== 'surface') seed.report('warning', 'schema', `region "${id}": \`biome\` only applies to surface regions; ignored`, get(item, 'biome'));
        else if (!BIOMES.includes(biome as Biome)) seed.report('error', 'schema', `region "${id}": biome must be one of ${BIOMES.join(' | ')}`, get(item, 'biome'));
        else region.biome = biome as Biome;
      }
      regions.push(region);
      regionById.set(id, region);
      regionNodes.set(id, item);
    }
  }

  // ---- ridges --------------------------------------------------------------------------
  const ridges = { default: 2, overrides: [] as World['ridges']['overrides'] };
  const ridgesNode = get(top, 'ridges');
  if (isMap(ridgesNode)) {
    const def = js(get(ridgesNode, 'default'));
    if (def !== undefined) {
      if (typeof def === 'number' && def >= 0) ridges.default = def;
      else seed.report('error', 'schema', 'ridges.default must be a non-negative number', get(ridgesNode, 'default'));
    }
    const ov = get(ridgesNode, 'overrides');
    const seen = new Map<string, Node>();
    if (isSeq(ov)) {
      for (const item of ov.items as Node[]) {
        const o = js(item) as { between?: unknown; h?: unknown } | undefined;
        if (!isMap(item) || !isStringList(o?.between) || o.between.length !== 2 || typeof o.h !== 'number' || o.h < 0) {
          seed.report('error', 'schema', 'ridge override must be { between: [a, b], h: number }', item);
          continue;
        }
        const [a, b] = o.between as [string, string];
        let ok = true;
        for (const r of [a, b]) {
          const reg = regionById.get(r);
          if (!reg) { seed.report('error', 'unknown-region', `ridge override references unknown region "${r}"`, item); ok = false; }
          else if (reg.layer !== 'surface') { seed.report('error', 'schema', `ridge override region "${r}" is not a surface region`, item); ok = false; }
        }
        if (a === b) { seed.report('error', 'schema', `ridge override between "${a}" and itself`, item); ok = false; }
        const key = [a, b].sort().join('|');
        if (seen.has(key)) seed.report('warning', 'duplicate-ridge', `duplicate ridge override for ${a}/${b} (first at line ${seed.lineOf(seen.get(key))}); the last one wins`, item);
        seen.set(key, item);
        if (ok) ridges.overrides.push({ between: [a, b], h: o.h, line: seed.lineOf(item) });
      }
    } else if (ov) seed.report('error', 'schema', 'ridges.overrides must be a list', ov);
  } else if (ridgesNode) seed.report('error', 'schema', '`ridges` must be a mapping', ridgesNode);

  // ---- shrines -------------------------------------------------------------------------
  const raws: RawShrine[] = [];
  const firstSeen = new Map<string, RawShrine>();
  let order = 0;
  const readShrines = (doc: Doc, source: Shrine['source']) => {
    const root = doc.root;
    if (!root) return;
    const seq = isMap(root) ? get(root, 'shrines') : null;
    if (!isSeq(seq)) {
      if (source === 'proposed' && isMap(root) && js(seq) == null) return; // `shrines:` empty is fine
      doc.report('error', 'schema', 'missing `shrines` list', seq ?? root);
      return;
    }
    for (const item of seq.items as Node[]) {
      if (!isMap(item)) { doc.report('error', 'schema', 'shrine must be a mapping', item); continue; }
      const s = readShrine(doc, item, source, order++, regionById);
      if (!s) continue;
      const prev = firstSeen.get(s.id);
      if (prev) {
        doc.report('error', 'duplicate-id',
          `duplicate shrine id "${s.id}" (first defined at ${prev.doc.src.file}:${prev.doc.lineOf(prev.node)})`, get(item, 'id'));
        continue;
      }
      const raw = { shrine: s, doc, node: item };
      firstSeen.set(s.id, raw);
      raws.push(raw);
    }
  };
  readShrines(seed, 'seed');
  if (proposed) readShrines(proposed, 'proposed');

  const shrineById = new Map(raws.map((r) => [r.shrine.id, r.shrine]));
  for (const id of shrineById.keys()) {
    if (regionById.has(id)) {
      const r = firstSeen.get(id)!;
      r.doc.report('warning', 'id-collision', `shrine id "${id}" is also a region id`, get(r.node, 'id'));
    }
  }

  // Cross-reference checks.
  for (const { shrine: s, doc, node } of raws) {
    if (s.layer === 'depths') {
      if (!s.below) doc.report('error', 'missing-below', `depths shrine "${s.id}" needs \`below: <surface shrine id>\``, node);
      else {
        const target = shrineById.get(s.below);
        if (!target) doc.report('error', 'bad-below', `"${s.id}": below "${s.below}" is not a known shrine`, get(node, 'below'));
        else if (target.layer !== 'surface') {
          doc.report('error', 'bad-below', `"${s.id}": below "${s.below}" is a ${target.layer} shrine, not a surface shrine`, get(node, 'below'));
        }
      }
    }
    const refList = (field: 'links' | 'needs' | 'after') => {
      const listNode = get(node, field);
      s[field].forEach((ref, i) => {
        const itemNode = isSeq(listNode) ? (listNode.items[i] as Node) : listNode;
        if (ref === s.id) doc.report('warning', 'self-reference', `"${s.id}" lists itself in \`${field}\``, itemNode);
        else if (!shrineById.has(ref)) {
          const code = { links: 'unknown-link', needs: 'unknown-need', after: 'unknown-after' }[field];
          doc.report('error', code, `"${s.id}": ${field} entry "${ref}" is not a known shrine`, itemNode);
        }
      });
    };
    refList('links');
    refList('needs');
    refList('after');
    if (s.from !== undefined && !shrineById.has(s.from)) {
      doc.report('error', 'unknown-from', `"${s.id}": from "${s.from}" is not a known shrine`, get(node, 'from'));
    }
  }

  // `after` must not form cycles (placement orders predecessors first), and neither may `needs` (a lock that waits on
  // itself would never open, §5.4).
  for (const field of ['after', 'needs'] as const) {
    const color = new Map<string, 0 | 1 | 2>();
    const visit = (id: string, stack: string[]): void => {
      color.set(id, 1);
      for (const next of shrineById.get(id)?.[field] ?? []) {
        if (!shrineById.has(next)) continue;
        if (color.get(next) === 1) {
          const r = firstSeen.get(id)!;
          r.doc.report('error', `${field}-cycle`, `\`${field}\` cycle: ${[...stack.slice(stack.indexOf(next)), id, next].join(' → ')}`, get(r.node, field));
        } else if (!color.get(next)) visit(next, [...stack, id]);
      }
      color.set(id, 2);
    };
    for (const id of shrineById.keys()) if (!color.get(id)) visit(id, []);
  }

  // Plateau ids.
  const plateauNode = isMap(startNode) ? get(startNode, 'plateau') : null;
  start.plateau.forEach((id, i) => {
    const itemNode = isSeq(plateauNode) ? (plateauNode.items[i] as Node) : plateauNode;
    const s = shrineById.get(id);
    if (!s) seed.report('error', 'unknown-plateau', `start.plateau entry "${id}" is not a known shrine`, itemNode);
    else if (s.layer !== 'surface') seed.report('error', 'schema', `start.plateau entry "${id}" is not a surface shrine`, itemNode);
  });
  // Opening sky shrines (§6.6): on one island, so the map has one place to open on.
  const skyNode = isMap(startNode) ? get(startNode, 'sky') : null;
  const islands = new Set<string>();
  (start.sky ?? []).forEach((id, i) => {
    const itemNode = isSeq(skyNode) ? (skyNode.items[i] as Node) : skyNode;
    const s = shrineById.get(id);
    if (!s) seed.report('error', 'unknown-start', `start.sky entry "${id}" is not a known shrine`, itemNode);
    else if (s.layer !== 'sky') seed.report('error', 'schema', `start.sky entry "${id}" is not a sky shrine`, itemNode);
    else islands.add(s.region);
  });
  if (islands.size > 1) seed.report('error', 'schema', `start.sky shrines must share one island (found ${[...islands].join(', ')})`, skyNode);

  // Exactly one tower per surface region / sky island; none in the depths.
  for (const r of regions) {
    const towers = raws.filter((x) => x.shrine.region === r.id && x.shrine.kind === 'tower');
    if (r.layer === 'depths') {
      for (const t of towers) t.doc.report('error', 'tower-count', `depths vein "${r.id}" cannot have a tower ("${t.shrine.id}")`, t.node);
    } else if (towers.length === 0) {
      seed.report('error', 'tower-count', `region "${r.id}" has no tower`, regionNodes.get(r.id));
    } else if (towers.length > 1) {
      for (const t of towers.slice(1)) {
        t.doc.report('error', 'tower-count', `region "${r.id}" already has tower "${towers[0]!.shrine.id}"; "${t.shrine.id}" is a second one`, t.node);
      }
    }
  }

  const world: World = { canvas, start, regions, ridges, shrines: raws.map((r) => r.shrine), regionById, shrineById };
  return { world, diagnostics };
}

function readShrine(doc: Doc, node: YAMLMap, source: Shrine['source'], order: number, regionById: Map<string, Region>): Shrine | null {
  for (const pair of node.items) {
    const k = isScalar(pair.key) ? String(pair.key.value) : '?';
    if (!SHRINE_KEYS.has(k)) doc.report('warning', 'unknown-field', `shrine has unknown field \`${k}\``, pair.key as Node);
  }
  const f = (k: string) => js(get(node, k));
  const at = (k: string) => get(node, k) ?? keyNode(node, k) ?? node;

  const id = f('id');
  if (typeof id !== 'string' || !id) { doc.report('error', 'schema', 'shrine is missing `id`', node); return null; }
  if (!ID_RE.test(id)) doc.report('error', 'schema', `shrine id "${id}" must be a kebab-case slug`, at('id'));

  const str = (k: 'title' | 'prompt' | 'done' | 'region'): string => {
    const v = f(k);
    if (typeof v === 'string' && v.trim()) return v.trim();
    doc.report('error', 'schema', `"${id}": missing or empty \`${k}\``, at(k));
    return '';
  };
  const title = str('title');
  const regionId = str('region');
  const prompt = str('prompt');
  const done = str('done');

  const region = regionById.get(regionId);
  if (regionId && !region) doc.report('error', 'unknown-region', `"${id}": region "${regionId}" does not exist`, at('region'));
  const layer: Layer = region?.layer ?? 'surface';

  let kind: Kind = 'shrine';
  const kindV = f('kind');
  if (kindV !== undefined) {
    if (KINDS.includes(kindV as Kind)) kind = kindV as Kind;
    else doc.report('error', 'schema', `"${id}": kind must be one of ${KINDS.join(' | ')}`, at('kind'));
  }
  if (kind === 'temple' && layer !== 'surface') doc.report('error', 'schema', `"${id}": temples must be on the surface`, at('kind'));

  let p = 2;
  const pV = f('p');
  if (pV !== undefined) {
    if (Number.isInteger(pV) && (pV as number) >= 1 && (pV as number) <= 5) p = pV as number;
    else doc.report('error', 'schema', `"${id}": p must be an integer 1..5`, at('p'));
  }
  if (kind !== 'shrine') p = 5;

  let size: Size = 'M';
  const sizeV = f('size');
  if (sizeV !== undefined) {
    if (SIZES.includes(sizeV as Size)) size = sizeV as Size;
    else doc.report('error', 'schema', `"${id}": size must be one of ${SIZES.join(' | ')}`, at('size'));
  }

  const list = (k: 'requires' | 'links' | 'needs' | 'after'): string[] => {
    const v = f(k);
    if (v === undefined || v === null) return [];
    if (isStringList(v)) return v;
    doc.report('error', 'schema', `"${id}": \`${k}\` must be a list of strings`, at(k));
    return [];
  };
  const requires = list('requires');
  const reqNode = get(node, 'requires');
  requires.forEach((t, i) => {
    if (!REQUIRE_TAGS.includes(t as RequireTag)) {
      doc.report('error', 'schema', `"${id}": unknown requires tag "${t}" (expected ${REQUIRE_TAGS.join(', ')})`,
        isSeq(reqNode) ? (reqNode.items[i] as Node) : at('requires'));
    }
  });
  const links = list('links');
  const needs = list('needs');
  const after = list('after');

  let theme: string | undefined;
  const themeV = f('theme');
  if (themeV !== undefined && themeV !== null) {
    if (typeof themeV !== 'string' || !themeV.trim()) doc.report('error', 'schema', `"${id}": theme must be a non-empty string`, at('theme'));
    else if (layer === 'depths' || kind !== 'shrine') {
      doc.report('warning', 'schema', `"${id}": \`theme\` only applies to ordinary surface/sky shrines; ignored`, at('theme'));
    } else theme = themeV.trim();
  }
  if (needs.length && kind === 'tower') doc.report('error', 'schema', `"${id}": a tower can't have \`needs\` (towers are never locked)`, at('needs'));
  if (needs.includes(id)) doc.report('error', 'schema', `"${id}" can't need itself`, at('needs'));
  if (kind === 'temple' && !needs.length) doc.report('warning', 'schema', `temple "${id}" has no \`needs\``, node);

  let below: string | undefined;
  const belowV = f('below');
  if (belowV !== undefined) {
    if (typeof belowV !== 'string') doc.report('error', 'schema', `"${id}": below must be a shrine id`, at('below'));
    else if (region && layer !== 'depths') doc.report('error', 'bad-below', `"${id}": \`below\` is only allowed on depths shrines`, at('below'));
    else below = belowV;
  }

  let xy: Vec2 | undefined;
  const xyV = f('xy');
  if (xyV !== undefined) {
    if (isVec2(xyV)) xy = xyV;
    else doc.report('error', 'schema', `"${id}": xy must be [x, y]`, at('xy'));
  }

  let from: string | undefined;
  const fromV = f('from');
  if (source === 'seed' && fromV !== undefined) doc.report('warning', 'schema', `"${id}": \`from\` is only meaningful in proposed.yaml`, at('from'));
  if (source === 'proposed') {
    if (typeof fromV === 'string' && fromV) from = fromV;
    else doc.report('error', 'schema', `proposed shrine "${id}" needs \`from: <shrine id>\``, at('from'));
  }

  const shrine: Shrine = {
    id, title, region: regionId, layer, kind, p, size,
    requires: requires.filter((t): t is RequireTag => REQUIRE_TAGS.includes(t as RequireTag)),
    after, links, needs, prompt, done, source, order,
  };
  if (theme !== undefined) shrine.theme = theme;
  if (below !== undefined) shrine.below = below;
  if (xy) shrine.xy = xy;
  if (from !== undefined) shrine.from = from;
  return shrine;
}
