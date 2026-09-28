// The Horizon (§7): at most three calls to adventure. A pure function of (world, state, config, ISO week).
import type { Config } from './config.ts';
import type { HorizonCard, HorizonRule, ShrineStatus, Visibility } from './mapdata.ts';
import { hash32 } from './prng.ts';
import type { Layer, RequireTag, Shrine, Vec2, World } from './types.ts';

/** What the Horizon needs to know about each shrine's state. */
export interface HorizonShrineState {
  status: ShrineStatus;
  visibility: Visibility;
  clearedAt?: string;
  /** Most recent activity (ms since epoch). In-progress shrines only. */
  lastTouched?: number;
  /** The single camp (derived in work.ts). When set, the Thread uses it, so the map and the Horizon agree. */
  camp?: boolean;
}

export interface HorizonInput {
  world: World;
  positions: Map<string, Vec2>;
  state: (id: string) => HorizonShrineState;
  /** The active pin (a shrine id), if any. A pin on a cleared shrine is ignored. */
  pin: string | null;
  /** Hardware available on this machine (§7 hardware filter). */
  available: RequireTag[];
  config: Pick<Config, 'horizon'>;
  /** ISO week, e.g. "2026-W40": the only source of variety (§7: stable within a week, no reroll). */
  week: string;
}

/** ISO 8601 week of a date, as "YYYY-Www" (UTC). */
export function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day); // the Thursday of this week decides the year
  const year = t.getUTCFullYear();
  const week = Math.ceil(((t.getTime() - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** First sentence of a prompt, for revealed cards (§7). */
export function firstSentence(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const m = /^(.+?[.!?])(\s|$)/.exec(flat);
  return m ? m[1]! : flat;
}

const dist = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Bearing from a to b in degrees, clockwise from north (screen coordinates: y grows downward). */
export function bearing(a: Vec2, b: Vec2): number {
  const deg = (Math.atan2(b[0] - a[0], -(b[1] - a[1])) * 180) / Math.PI;
  return Math.round(((deg % 360) + 360) % 360);
}

export function computeHorizon(input: HorizonInput): HorizonCard[] {
  const { world, positions, state, available } = input;
  const far = input.config.horizon.farDistance;
  const pos = (id: string) => positions.get(id)!;
  const cleared = (id: string) => state(id).status === 'cleared';

  // L: the most recently cleared shrine (ties: later in file order), else the start vantage on the surface.
  const clears = world.shrines
    .filter((s) => cleared(s.id) && state(s.id).clearedAt)
    .sort((a, b) => state(a.id).clearedAt!.localeCompare(state(b.id).clearedAt!) || a.order - b.order);
  const last = clears.at(-1);
  const L: { xy: Vec2; layer: Layer; shrine?: Shrine } = last
    ? { xy: pos(last.id), layer: last.layer, shrine: last }
    : { xy: world.start.vantage, layer: 'surface' };
  const recent = new Set(clears.slice(-3).map((s) => s.id));

  // Candidates: uncleared, visible, not a sealed temple, and runnable on this machine.
  const hardwareOk = (s: Shrine) => s.requires.every((t) => available.includes(t));
  const candidates = world.shrines.filter((s) => {
    const st = state(s.id);
    if (st.status === 'cleared' || st.status === 'shelved' || st.visibility === 'hidden') return false;
    if (s.kind === 'temple' && !s.needs.every(cleared)) return false;
    return hardwareOk(s);
  });
  const revealed = (s: Shrine) => state(s.id).visibility === 'revealed';
  const taken = new Set<string>();
  const free = (s: Shrine) => !taken.has(s.id);
  const dL = (s: Shrine) => dist(L.xy, pos(s.id));
  /** Nearest to L; ties by prominence (descending), then id. */
  const nearest = (list: Shrine[]) =>
    [...list].sort((a, b) => dL(a) - dL(b) || b.p - a.p || a.id.localeCompare(b.id))[0];

  const cards: HorizonCard[] = [];
  const add = (slot: HorizonCard['slot'], s: Shrine | undefined, rule: HorizonRule) => {
    if (!s) return false;
    taken.add(s.id);
    const card: HorizonCard = { slot, id: s.id, rule, distance: Math.round(dL(s)) };
    if (revealed(s)) card.teaser = firstSentence(s.prompt);
    if (slot === 'far') card.bearing = bearing(L.xy, pos(s.id));
    cards.push(card);
    return true;
  };

  // Slot 1: the Thread.
  const inProgress = world.shrines.filter((s) => state(s.id).status === 'in-progress');
  const pin = input.pin && world.shrineById.has(input.pin) && !cleared(input.pin) ? input.pin : null;
  if (inProgress.length) {
    // Return to camp: the flagged camp, else (hand-built states) the most recently touched, ties by id.
    const byTouch = [...inProgress].sort((a, b) => (state(b.id).lastTouched ?? 0) - (state(a.id).lastTouched ?? 0) || a.id.localeCompare(b.id));
    add('thread', inProgress.find((s) => state(s.id).camp) ?? byTouch[0], 'camp');
  } else {
    const onLayer = candidates.filter((s) => s.layer === L.layer && revealed(s));
    let picked = false;
    if (pin) {
      const p = pos(pin);
      const onTheWay = onLayer
        .filter((s) => dL(s) <= far)
        .sort((a, b) => dL(a) + dist(pos(a.id), p) - (dL(b) + dist(pos(b.id), p)) || a.id.localeCompare(b.id))[0];
      picked = add('thread', onTheWay, 'pin');
    }
    if (!picked) add('thread', nearest(onLayer), 'nearest');
  }
  const threadLayer = cards[0] ? world.shrineById.get(cards[0].id)!.layer : L.layer;

  // Slot 2: the Vertical. The first rule with any match wins.
  const open = candidates.filter(free);
  const glows = open.filter((s) => s.layer === 'depths' && s.below && recent.has(s.below));
  const linkedToRecent = (s: Shrine) =>
    s.links.some((l) => recent.has(l)) || [...recent].some((r) => world.shrineById.get(r)!.links.includes(s.id));
  const skyLinked = open.filter((s) => s.layer === 'sky' && revealed(s) && linkedToRecent(s));
  const aboveL =
    L.shrine?.layer === 'depths' && L.shrine.below
      ? open.filter((s) => s.id === L.shrine!.below || (s.layer === 'surface' && revealed(s)))
      : [];
  const otherLayer = open.filter((s) => s.layer !== threadLayer && revealed(s));
  if (!add('vertical', nearest(glows), 'glow')
    && !add('vertical', nearest(skyLinked), 'sky')
    && !add('vertical', aboveL.find((s) => s.id === L.shrine!.below) ?? nearest(aboveL), 'above')) {
    add('vertical', nearest(otherLayer), 'other-layer');
  }

  // Slot 3: the Far Landmark.
  const fraction = new Map<string, number>();
  for (const r of world.regions) {
    const members = world.shrines.filter((s) => s.region === r.id);
    fraction.set(r.id, members.length ? members.filter((s) => cleared(s.id)).length / members.length : 0);
  }
  const pull = (list: Shrine[]) =>
    [...list].sort(
      (a, b) =>
        fraction.get(a.region)! - fraction.get(b.region)!
        || b.p - a.p
        || hash32(input.week + a.id) - hash32(input.week + b.id),
    )[0];
  const rest = candidates.filter(free);
  const landmarks = rest.filter((s) => state(s.id).visibility === 'silhouette' && s.p >= 3 && dL(s) >= far);
  if (!add('far', pull(landmarks), 'landmark')
    && !add('far', pull(rest.filter((s) => s.kind === 'tower')), 'tower')) {
    add('far', pull(rest.filter((s) => s.kind === 'temple')), 'temple');
  }

  return cards;
}
