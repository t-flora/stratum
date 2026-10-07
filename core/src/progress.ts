// Progress signals (§9.4, §10.2, §10.3, §6.5): hours, the trail, region readouts and search text. Pure.
import type { Layer, MapFocus, Visibility } from './mapdata.ts';
import type { Shrine, Vec2, World } from './types.ts';

/** Commits closer together than this belong to one session (§10.3). */
export const SESSION_GAP_S = 2 * 3600;
/** Each session counts as its span plus this much (§10.3). */
export const SESSION_PAD_H = 0.5;

/**
 * §10.3: cluster commit timestamps (unix seconds) into sessions with gaps under 2 h; each session is its span + 30 min.
 * No commits, no estimate. Rounded to a tenth of an hour.
 */
export function estimateHours(touches: number[]): number | undefined {
  if (!touches.length) return undefined;
  const t = [...touches].sort((a, b) => a - b);
  let hours = 0;
  let start = t[0]!;
  let prev = t[0]!;
  for (const x of t.slice(1)) {
    if (x - prev >= SESSION_GAP_S) {
      hours += (prev - start) / 3600 + SESSION_PAD_H;
      start = x;
    }
    prev = x;
  }
  hours += (prev - start) / 3600 + SESSION_PAD_H;
  return Math.round(hours * 10) / 10;
}

export interface Hours {
  hours: number;
  /** True when derived from commits ("≈" in the UI); false when self-reported in the frontmatter. */
  estimated: boolean;
}

/** Self-reported `hours` wins; otherwise the commit estimate (§10.3). */
export function shrineHours(reported: number | undefined, touches: number[]): Hours | undefined {
  if (reported !== undefined) return { hours: reported, estimated: false };
  const est = estimateHours(touches);
  return est === undefined ? undefined : { hours: est, estimated: true };
}

export interface PathStop {
  id: string;
  date: string;
}

/**
 * §9.4 The trail: cleared shrines in `clearedAt` order, per layer. Same-day clears keep file order, so the path is
 * deterministic for a given repo.
 */
export function trail(world: World, clearedAt: (id: string) => string | undefined): Record<Layer, PathStop[]> {
  const out: Record<Layer, PathStop[]> = { sky: [], surface: [], depths: [] };
  for (const s of trailOrder(world, clearedAt)) out[s.layer].push({ id: s.id, date: clearedAt(s.id)! });
  return out;
}

/**
 * Where the map opens (§9.1): where you are, derived from the repo so it needs no browser storage. Your camp if you
 * have one; else your latest clear (a cleared opening shrine means you've landed, so the landing); else, on a fresh
 * sky start, the first opening shrine; else the start vantage.
 */
export function mapFocus(
  world: World, positions: Map<string, Vec2>,
  work: (id: string) => { status: string; clearedAt?: string; camp?: { current: boolean } } | undefined, landed: boolean,
): MapFocus {
  const at = (s: Shrine, reason: MapFocus['reason']): MapFocus => ({ id: s.id, layer: s.layer, xy: positions.get(s.id)!, reason });
  const landing: MapFocus = { layer: 'surface', xy: world.start.vantage, reason: 'start' };
  const camp = world.shrines.find((s) => work(s.id)?.status === 'in-progress' && work(s.id)?.camp?.current);
  if (camp) return at(camp, 'camp');
  const last = trailOrder(world, (id) => (work(id)?.status === 'cleared' ? work(id)?.clearedAt : undefined)).at(-1);
  if (last) return world.start.sky?.includes(last.id) ? { ...landing, reason: 'landed' } : at(last, 'last-clear');
  const opening = world.start.sky?.[0];
  if (opening && !landed) return at(world.shrineById.get(opening)!, 'opening');
  return landing;
}

/** Cleared shrines in trail order (`clearedAt`, then file order). */
function trailOrder(world: World, clearedAt: (id: string) => string | undefined): Shrine[] {
  return world.shrines
    .map((s, i) => ({ s, i, date: clearedAt(s.id) }))
    .filter((x): x is { s: Shrine; i: number; date: string } => x.date !== undefined)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.i - b.i))
    .map((x) => x.s);
}

export interface RegionStats {
  cleared: number;
  revealed: number;
  total: number;
  /** Sum over the region's worked shrines; `estimated` if any part of it is a commit estimate. */
  hours: number;
  estimated: boolean;
}

/** §10.2 readout for every region: cleared / revealed / total, plus the hours total. */
export function regionStats(
  world: World, cleared: (id: string) => boolean, visibility: (id: string) => Visibility, hours: (id: string) => Hours | undefined,
): Map<string, RegionStats> {
  const out = new Map<string, RegionStats>(world.regions.map((r) => [r.id, { cleared: 0, revealed: 0, total: 0, hours: 0, estimated: false }]));
  for (const s of world.shrines) {
    const r = out.get(s.region)!;
    r.total++;
    if (cleared(s.id)) r.cleared++;
    if (visibility(s.id) === 'revealed') r.revealed++;
    const h = hours(s.id);
    if (h) {
      r.hours = Math.round((r.hours + h.hours) * 10) / 10;
      r.estimated ||= h.estimated;
    }
  }
  return out;
}

/**
 * §6.5: what search may match, lower-cased. Revealed shrines match by title, theme and prompt; silhouettes whose title is
 * known (landmarks, p ≥ 3) by title only; everything else not at all. Search never uncovers hidden shrines.
 */
export function searchText(s: Shrine, visibility: Visibility, titleKnown: boolean): string {
  if (visibility === 'revealed') return [s.title, s.id, s.theme ?? '', s.prompt].join(' ').toLowerCase();
  if (visibility === 'silhouette' && titleKnown) return s.title.toLowerCase();
  return '';
}
