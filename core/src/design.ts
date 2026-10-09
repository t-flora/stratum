import type { Config } from './config.ts';
import type { Geometry } from './geometry.ts';
import { PROPOSED_PATH, SEED_PATH } from './loader.ts';
import type { ShrineStatus } from './mapdata.ts';
import type { RequireTag, Shrine, Vec2, World } from './types.ts';
import { computeVisibility } from './visibility.ts';

/**
 * `stratum lint --design` (M14, docs/plans/template.md): measurable properties of a well-designed world, from
 * docs/world-design.md. Advisory, never errors: a world can have good reasons to break a rule, and the report is where
 * the author explains them. Measured checks have a threshold; review checks are phrasing heuristics (§5 passes A and B)
 * that list prompts worth a second look.
 */
export interface DesignItem {
  text: string;
  id?: string;
  file?: string;
  line?: number;
}

export interface DesignCheck {
  code: string;
  /** What's measured, and the guide section it comes from. */
  title: string;
  rule: string;
  kind: 'measure' | 'review';
  ok: boolean;
  /** The measurement, e.g. "23.5% on the island, 24.0% after landing". */
  summary: string;
  items: DesignItem[];
}

export interface DesignInput {
  world: World;
  geo: Geometry;
  positions: Map<string, Vec2>;
  /** Shrines whose spacing placement had to relax (PlacementResult.relaxed). */
  relaxed: { id: string }[];
  config: Pick<Config, 'visibility' | 'hardware'>;
}

/** The ranges docs/world-design.md asks for. */
export const DESIGN_RULES = {
  discovery: [0.15, 0.25],
  surfaceRegions: [6, 12],
  regionShrines: [8, 14],
  themeSize: [2, 5],
  /** p ≥ 4 landmarks per surface region (the start region needs none: you're already there). */
  landmarks: [1, 3],
  /** At least this share of a region's shrines at p ≤ 2. */
  quietShare: 0.5,
  /** Each of sky and depths should hold at least this share of the world, and the surface at least `surface`. */
  layerShare: { sky: 0.1, depths: 0.1, surface: 0.4 },
  lockShare: 0.06,
  lockChain: 2,
  templeNeeds: [3, 4],
  templesPerRegion: 2,
  gatedShare: 0.5,
  openingLandmarks: 3,
  openingGlows: 2,
} as const;

const fileOf = (s: Shrine) => (s.source === 'proposed' ? PROPOSED_PATH : SEED_PATH);
const at = (s: Shrine, text: string): DesignItem => {
  const item: DesignItem = { id: s.id, text, file: fileOf(s) };
  if (s.line) item.line = s.line;
  return item;
};
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const within = (x: number, [lo, hi]: readonly [number, number]) => x >= lo && x <= hi;

/** "a done that looks unverifiable" (§2.4). */
const VAGUE_DONE = /\b(understand(?:ing)?|learn(?:ed|t)?|be familiar|familiari[sz]e|get a feel|appreciate|grasp|know how)\b/i;

/** §5 pass A, outside material: a subject the prompt doesn't name. */
const OUTSIDE = [
  /\ba (?:real|small|toy|simple) (?:model|codebase|code base|program|project|system|dataset|corpus|api|service|app)\b/i,
  /\ba (?:codebase|dataset)\b/i,
  /\ban API\b/,
  /\ba realistic (?:workload|dataset|program|input)\b/i,
  /\bof your choice\b/i,
  /\bany (?:model|codebase|dataset|program|project)\b/i,
];
/** §5 pass B, problem-posing: the learner chooses the problem. */
const POSING = [
  /\bdesign an? /i,
  /\(e\.g\./i,
  /\b(?:pick|choose)\b/i,
  /\bone of your\b/i,
  /\b(?:explore|investigate)\b/i,
];
/** §2.5: paths and commands belong to the panel, which knows the learner's setup. */
const COMMANDS = [/\bstratum (?:start|clear|lint|build|shelve|pin|propose)\b/, /\bwork\/[\w-]+/];
/** "your X" that refers to the learner's setup rather than an artefact. */
const YOUR_SETUP = /^(?:own|machine|laptop|computer|mac|server|compiler|toolchain|cpu|gpu|terminal|editor|shell|os|code|answer|results?|measurements?|numbers?|write-?up|choice|hypothesis|prediction)\b/i;

function snippet(text: string, index: number, length: number): string {
  const flat = (s: string) => s.replace(/\s+/g, ' ');
  const a = Math.max(0, index - 30);
  const b = Math.min(text.length, index + length + 30);
  return `${a > 0 ? '…' : ''}${flat(text.slice(a, b))}${b < text.length ? '…' : ''}`;
}

export function lintDesign(input: DesignInput): DesignCheck[] {
  const { world, geo, positions, config } = input;
  const all = world.shrines;
  const ordinary = all.filter((s) => s.kind === 'shrine');
  const surfaceRegions = world.regions.filter((r) => r.layer === 'surface');
  const inRegion = (id: string) => all.filter((s) => s.region === id);
  const checks: DesignCheck[] = [];
  const add = (c: Omit<DesignCheck, 'ok'> & { ok?: boolean }) => checks.push({ ...c, ok: c.ok ?? c.items.length === 0 });

  // --- The fresh map and the opening area (§1.1, §3.2) ---------------------------------------------------------------
  const opening = world.start.sky?.[0];
  const sight = (status: (id: string) => ShrineStatus) =>
    computeVisibility(world, positions, status, geo, config.visibility).visibility;
  const fresh = sight(() => 'untouched');
  const landed = opening ? sight((id) => (id === opening ? 'cleared' : 'untouched')) : fresh;
  const seen = (v: Map<string, string>) => all.filter((s) => v.get(s.id) !== 'hidden');
  const shares = (opening ? [fresh, landed] : [fresh]).map((v) => seen(v).length / all.length);
  add({
    code: 'discovery', title: 'share of the world seen on a fresh map', rule: '§1.1: 15–25%', kind: 'measure',
    ok: shares.every((x) => within(x, DESIGN_RULES.discovery)),
    summary: opening ? `${pct(shares[0]!)} on the island, ${pct(shares[1]!)} after landing` : pct(shares[0]!),
    items: [],
  });

  const core = world.start.plateau.map((id) => world.shrineById.get(id)?.region).find(Boolean)
    ?? geo.regionAt(...world.start.vantage);
  if (core) {
    const missing: DesignItem[] = [];
    const tower = all.find((s) => s.region === core && s.kind === 'tower');
    if (!tower || landed.get(tower.id) !== 'revealed') missing.push({ text: 'the start region\'s tower isn\'t revealed after landing' });
    const locks = ordinary.filter((s) => s.needs.length && landed.get(s.id) === 'revealed');
    if (!locks.length) missing.push({ text: 'no lock (a shrine with `needs`) in plain sight' });
    else if (!locks.some((l) => l.needs.every((n) => landed.get(n) !== 'hidden'))) missing.push({ text: 'no visible lock has its key in sight' });
    const glows = all.filter((s) => s.region === core && all.some((d) => d.below === s.id));
    if (glows.length < DESIGN_RULES.openingGlows) missing.push({ text: `${glows.length} start shrine(s) with a depths shrine below (want ${DESIGN_RULES.openingGlows})` });
    const marks = seen(landed).filter((s) => s.p >= 4 && s.layer === 'surface' && s.region !== core);
    if (marks.length < DESIGN_RULES.openingLandmarks) missing.push({ text: `${marks.length} p ≥ 4 landmark(s) in sight beyond the start region (want ${DESIGN_RULES.openingLandmarks})` });
    if (!seen(landed).some((s) => s.kind === 'temple')) missing.push({ text: 'no temple in sight' });
    const first = opening ? world.shrineById.get(opening) : undefined;
    if (first && first.size !== 'S') missing.push(at(first, `the opening shrine "${first.title}" is size ${first.size}; a small one is cleared in a sitting`));
    add({
      code: 'opening', title: 'the opening area teaches each mechanic by sight', rule: '§3.2', kind: 'measure',
      summary: `start region ${core}: ${(first ? 6 : 5) - missing.length} of ${first ? 6 : 5} in place`, items: missing,
    });
  }

  // --- Shape and pacing (§3.3) --------------------------------------------------------------------------------------
  const shapeItems: DesignItem[] = [];
  if (!within(surfaceRegions.length, DESIGN_RULES.surfaceRegions)) shapeItems.push({ text: `${surfaceRegions.length} surface regions (want 6–12)` });
  for (const r of surfaceRegions) {
    const n = inRegion(r.id).filter((s) => s.kind !== 'tower').length;
    if (!within(n, DESIGN_RULES.regionShrines)) shapeItems.push({ text: `${r.id}: ${n} shrine(s) besides its tower (want 8–14)` });
  }
  add({
    code: 'shape', title: 'surface regions and their size', rule: '§3.3: 6–12 regions of 8–14', kind: 'measure',
    summary: `${surfaceRegions.length} surface regions`, items: shapeItems,
  });

  const layerCount = { sky: 0, surface: 0, depths: 0 };
  for (const s of all) layerCount[s.layer]++;
  const layerItems = (['sky', 'surface', 'depths'] as const)
    .filter((l) => layerCount[l] / all.length < DESIGN_RULES.layerShare[l])
    .map((l) => ({ text: `${l}: ${pct(layerCount[l] / all.length)} (want ≥ ${pct(DESIGN_RULES.layerShare[l])})` }));
  add({
    code: 'layers', title: 'balance between the layers', rule: '§3.1', kind: 'measure',
    summary: `sky ${layerCount.sky}, surface ${layerCount.surface}, depths ${layerCount.depths}`, items: layerItems,
  });

  const promItems: DesignItem[] = [];
  for (const r of surfaceRegions) {
    const ss = inRegion(r.id).filter((s) => s.kind === 'shrine');
    if (!ss.length) continue;
    const marks = ss.filter((s) => s.p >= 4).length;
    const quiet = ss.filter((s) => s.p <= 2).length / ss.length;
    const [lo, hi] = DESIGN_RULES.landmarks;
    if (marks > hi || (marks < lo && r.id !== core)) promItems.push({ text: `${r.id}: ${marks} p ≥ 4 landmark(s) (want ${lo}–${hi})` });
    if (quiet < DESIGN_RULES.quietShare) promItems.push({ text: `${r.id}: only ${pct(quiet)} of shrines at p ≤ 2 (want most)` });
  }
  add({
    code: 'prominence', title: 'landmarks per surface region', rule: '§3.3: a few p ≥ 4, most at p = 2', kind: 'measure',
    summary: `${surfaceRegions.length - new Set(promItems.map((i) => i.text.split(':')[0])).size} of ${surfaceRegions.length} regions in range`,
    items: promItems,
  });

  const relaxedRegions = new Map<string, number>();
  for (const { id } of input.relaxed) {
    const r = world.shrineById.get(id)?.region;
    if (r) relaxedRegions.set(r, (relaxedRegions.get(r) ?? 0) + 1);
  }
  add({
    code: 'capacity', title: 'regions with room for their shrines', rule: '§3.3 (placement spacing)', kind: 'measure',
    summary: relaxedRegions.size ? `${input.relaxed.length} shrine(s) placed with relaxed spacing` : 'no spacing relaxed',
    items: [...relaxedRegions].map(([r, n]) => ({ text: `${r}: ${n} shrine(s) squeezed; the region is over capacity` })),
  });

  // --- Themes (§3.3) ------------------------------------------------------------------------------------------------
  const themes = new Map<string, Shrine[]>();
  for (const s of all) {
    if (!s.theme || s.kind !== 'shrine') continue;
    const key = `${s.region} / ${s.theme}`;
    themes.set(key, [...(themes.get(key) ?? []), s]);
  }
  const sizes = (ss: Shrine[]) => ss.map((s) => s.size).join(' ');
  add({
    code: 'theme-size', title: 'shrines per theme', rule: '§3.3: 2–5', kind: 'measure',
    summary: `${themes.size} themes`,
    items: [...themes].filter(([, ss]) => !within(ss.length, DESIGN_RULES.themeSize))
      .map(([k, ss]) => at(ss[0]!, `${k}: ${ss.length} shrine(s)`)),
  });
  const noEntry = [...themes].filter(([, ss]) => !ss.some((s) => s.size === 'S'));
  add({
    code: 'theme-entry', title: 'themes with a small (S) entry point', rule: '§2.5, §3.3', kind: 'measure',
    summary: `${themes.size - noEntry.length} of ${themes.size}`,
    items: noEntry.map(([k, ss]) => at(ss[0]!, `${k} (${sizes(ss)})`)),
  });

  // --- Connections (§1.5) -------------------------------------------------------------------------------------------
  const connected = new Set<string>();
  for (const s of all) {
    const refs = [...s.after, ...s.links, ...s.needs, ...(s.below ? [s.below] : []), ...(s.from ? [s.from] : [])];
    for (const r of refs) connected.add(r);
    if (refs.length) connected.add(s.id);
  }
  const orphans = ordinary.filter((s) => !connected.has(s.id));
  add({
    code: 'connected', title: 'shrines tied to the rest (after, links, needs, below, from)', rule: '§1.5, §5 E', kind: 'measure',
    summary: `${ordinary.length - orphans.length} of ${ordinary.length}`,
    items: orphans.map((s) => at(s, `${s.id} (${s.region}${s.theme ? ` / ${s.theme}` : ''})`)),
  });

  // --- Locks (§3.4) -------------------------------------------------------------------------------------------------
  const locks = ordinary.filter((s) => s.needs.length);
  const lockShare = locks.length / all.length;
  add({
    code: 'lock-budget', title: 'locked shrines', rule: '§3.4: about 5%', kind: 'measure',
    ok: lockShare <= DESIGN_RULES.lockShare + 1e-9,
    summary: `${locks.length} of ${all.length} (${pct(lockShare)})`, items: [],
  });
  const isLock = (id: string) => { const s = world.shrineById.get(id); return !!s && s.kind === 'shrine' && s.needs.length > 0; };
  const depth = new Map<string, number>();
  const chain = (id: string): number => {
    if (depth.has(id)) return depth.get(id)!;
    depth.set(id, 0); // the loader rejects cycles; this only guards recursion
    const d = isLock(id) ? 1 + Math.max(0, ...world.shrineById.get(id)!.needs.map(chain)) : 0;
    depth.set(id, d);
    return d;
  };
  add({
    code: 'lock-chain', title: 'chains of locks', rule: `§3.4: no more than ${DESIGN_RULES.lockChain} in a row`, kind: 'measure',
    summary: `longest ${Math.max(0, ...locks.map((l) => chain(l.id)))}`,
    items: locks.filter((l) => chain(l.id) > DESIGN_RULES.lockChain).map((l) => at(l, `${l.id}: ${chain(l.id)} locks deep`)),
  });
  const near = (a: Shrine, b: Shrine) => a.region === b.region || (a.layer === 'surface' && b.layer === 'surface' && geo.isAdjacent(a.region, b.region));
  const farKeys = locks.flatMap((l) => l.needs.map((n) => world.shrineById.get(n)!).filter((k) => !near(l, k)).map((k) => at(l, `${l.id} (${l.region}) needs ${k.id} (${k.region})`)));
  add({
    code: 'lock-key', title: 'locks whose key is nearby (same or bordering region)', rule: '§3.4: keep the key findable', kind: 'measure',
    summary: `${locks.length - new Set(farKeys.map((i) => i.id)).size} of ${locks.length}`, items: farKeys,
  });

  // --- Temples (§3.3) -----------------------------------------------------------------------------------------------
  const templeItems: DesignItem[] = [];
  const temples = all.filter((s) => s.kind === 'temple');
  for (const t of temples) {
    if (!within(t.needs.length, DESIGN_RULES.templeNeeds)) templeItems.push(at(t, `${t.id}: needs ${t.needs.length} (want 3–4)`));
    const ts = new Set(t.needs.map((n) => world.shrineById.get(n)?.theme ?? `(${n})`));
    if (t.needs.length > 1 && ts.size < 2) templeItems.push(at(t, `${t.id}: every need is in one theme (${[...ts][0]})`));
  }
  for (const r of world.regions) {
    const n = temples.filter((t) => t.region === r.id).length;
    if (n > DESIGN_RULES.templesPerRegion) templeItems.push({ text: `${r.id}: ${n} temples (want 0–2)` });
  }
  add({
    code: 'temples', title: 'temples need 3–4 shrines from more than one theme', rule: '§3.3', kind: 'measure',
    summary: `${temples.length} temples`, items: templeItems,
  });

  // --- Hardware (§2.5, §5 C) ----------------------------------------------------------------------------------------
  const available = new Set<RequireTag>(config.hardware.available);
  const gated = (s: Shrine) => s.requires.some((t) => !available.has(t));
  const gatedItems: DesignItem[] = [];
  for (const r of world.regions) {
    const ss = inRegion(r.id).filter((s) => s.kind === 'shrine');
    const g = ss.filter(gated).length;
    if (ss.length && g / ss.length > DESIGN_RULES.gatedShare) gatedItems.push({ text: `${r.id}: ${g} of ${ss.length} need hardware this machine lacks` });
  }
  add({
    code: 'hardware', title: 'regions mostly startable on this machine', rule: '§5 E: no region over 50% gated', kind: 'measure',
    summary: `available: ${[...available].join(', ') || 'none'}`, items: gatedItems,
  });

  // --- Prose heuristics (§2, §5 A–B): worth a second look, not necessarily wrong -------------------------------------
  add({
    code: 'done-check', title: '`done`s that judge understanding', rule: '§2.4', kind: 'measure',
    summary: `${all.filter((s) => VAGUE_DONE.test(s.done)).length} found`,
    items: all.filter((s) => VAGUE_DONE.test(s.done)).map((s) => {
      const m = s.done.match(VAGUE_DONE)!;
      return at(s, `${s.id}: ${snippet(s.done, m.index!, m[0].length)}`);
    }),
  });
  const phrase = (code: string, title: string, rule: string, patterns: RegExp[]) => {
    const items: DesignItem[] = [];
    for (const s of all) {
      for (const re of patterns) {
        const m = s.prompt.match(re);
        if (m) { items.push(at(s, `${s.id}: ${snippet(s.prompt, m.index!, m[0].length)}`)); break; }
      }
    }
    add({ code, title, rule, kind: 'review', summary: `${items.length} to review`, items });
  };
  phrase('prose-material', 'prompts that may need outside material', '§2.2, §5 A', OUTSIDE);
  phrase('prose-posing', 'prompts that may leave the problem to the learner', '§2.1, §5 B', POSING);
  phrase('prose-commands', 'paths or CLI commands in prose', '§2.5', COMMANDS);

  const yourItems: DesignItem[] = [];
  for (const s of all) {
    if (s.after.length || s.needs.length || s.below || s.from) continue;
    const ref = [...s.prompt.matchAll(/\byour\s+[*_("']*(\S+)/gi)].find((m) => !YOUR_SETUP.test(m[1]!));
    if (ref) yourItems.push(at(s, `${s.id}: ${snippet(s.prompt, ref.index!, ref[0].length)}`));
  }
  add({
    code: 'your-x', title: '"your X" without an `after` or `needs` to the shrine that builds it', rule: '§2.2, §5 A', kind: 'review',
    summary: `${yourItems.length} to review`, items: yourItems,
  });

  return checks;
}
