// The build/map.json contract between core (producer) and app (pure renderer). Types only: safe to import from the browser.
import type { Kind, Layer, RequireTag, Size, Vec2 } from './types.ts';

export type { Kind, Layer, RequireTag, Size, Vec2 };

export type Ring = Vec2[];
export type Polygon = Ring[];
export type MultiPolygon = Polygon[];

/** `shelved`: started, then set aside on purpose. Stays revealed; no marker, not a vantage, not on the Horizon. */
export type ShrineStatus = 'untouched' | 'in-progress' | 'shelved' | 'cleared';
export type Visibility = 'hidden' | 'silhouette' | 'revealed';

export interface MapShrine {
  id: string;
  title: string;
  region: string;
  layer: Layer;
  kind: Kind;
  p: number;
  size: Size;
  requires: RequireTag[];
  below?: string;
  links: string[];
  needs: string[];
  prompt: string;
  done: string;
  from?: string;
  theme?: string;
  after: string[];
  xy: Vec2;
  status: ShrineStatus;
  visibility: Visibility;
  /** False for silhouettes too faint to name (p below silhouetteTitleMinP): show "???" (§6.2). */
  titleKnown: boolean;
  /** Surface shrines on explored land (sky and depths: always true). Uncharted silhouettes float on blank paper, region unknown. */
  charted: boolean;
  /** Surface markers: `chasm` beside a shrine whose lightroot glows; `draft` on a launch point to the sky (§6.3, §6.4). */
  marks: { chasm?: boolean; draft?: boolean };
  /** `requires` tags this machine lacks (§7 hardware filter): kept on the map, left out of the Horizon. */
  unavailable: RequireTag[];
  /** Derived work state (§4.4), from work/<id>/ and git. Dates are YYYY-MM-DD. */
  startedAt?: string;
  clearedAt?: string;
  /** False for a cleared shrine whose WRITEUP.md isn't committed yet (rendered dashed). */
  committed: boolean;
  /** Commit timestamps (unix seconds) touching work/<id>/. */
  touches: number[];
  /** In-progress shrines: the first line of NEXT.md, and when the fire was last fed (ms since epoch). */
  /**
   * In-progress shrines (docs/plans/camps.md). `current` marks the single camp (the most recently touched one);
   * every other in-progress shrine is a cairn. `since` (ms) is when it was last touched: it drives the embers.
   */
  camp?: { note: string | null; since: number | null; current: boolean };
  hours?: number;
  remnote: number;
  /** Markdown body of a cleared write-up. */
  writeup?: string;
}

export interface MapRegion {
  id: string;
  layer: Layer;
  name: string;
  centroid?: Vec2;
  radius?: number;
  /** Surface regions whose tower is cleared: explored in full (§5.3). */
  surveyed?: boolean;
  /** Surface regions: how much of the land is explored (share 0–1), and the middle of that part, where the name goes. */
  explored?: { share: number; centre: Vec2 | null };
}

export interface MapRidge {
  between: [string, string];
  h: number;
  lines: Vec2[][];
}

export interface MapTheme {
  region: string;
  layer: Layer;
  name: string;
  anchor: Vec2;
  members: string[];
}

export interface MapGeometry {
  coast: MultiPolygon;
  regions: Record<string, MultiPolygon>;
  ridges: MapRidge[];
  contours: { value: number; polygons: MultiPolygon }[];
  /** Each sky region is an archipelago: one islet per theme, a rock for the tower, and a few bare rocks. */
  islands: Record<string, MultiPolygon>;
  depths: {
    /** Vein territories: each point belongs to the vein of its nearest lightroot. */
    veins: Record<string, MultiPolygon>;
    strata: MultiPolygon[];
  };
}

/** What the unknown and the depths darkness are cut from (§6, §9.3, docs/plans/unknown.md). */
export interface MapSight {
  /** Surface vantages (§6.1). */
  vantages: { xy: Vec2; tower: boolean }[];
  /**
   * Explored land: one ring per explorer (the start and every surface shrine worked on), through the tips of rays that stop
   * at high ridges. Surveyed regions are explored in full on top of these. Everything else on the surface is unknown.
   */
  explored: Ring[];
  /** Depths: light circles around cleared lightroots, and small glows under active surface shrines. */
  lights: { xy: Vec2; region: string; kind: 'light' | 'glow' }[];
  lightRadius: number;
  glowRadius: number;
}

export type HorizonSlot = 'thread' | 'vertical' | 'far';
/** Which §7 rule filled the slot. */
export type HorizonRule = 'camp' | 'pin' | 'nearest' | 'glow' | 'sky' | 'above' | 'other-layer' | 'landmark' | 'tower' | 'temple';

export interface HorizonCard {
  slot: HorizonSlot;
  id: string;
  rule: HorizonRule;
  /** Distance from L (the latest clear, or the start vantage) on the shared canvas. */
  distance: number;
  /** First sentence of the prompt, for revealed shrines only. */
  teaser?: string;
  /** Far Landmark only: direction from L, degrees clockwise from north. */
  bearing?: number;
}

export interface MapData {
  version: 1;
  /** When map.json was built (ms since epoch). */
  builtAt: number;
  canvas: { width: number; height: number };
  start: { vantage: Vec2; plateau: string[] };
  regions: MapRegion[];
  shrines: MapShrine[];
  themes: MapTheme[];
  sight: MapSight;
  /** At most three cards (§7). */
  horizon: HorizonCard[];
  /** The active pin (state/pins.yaml), or null. */
  pin: string | null;
  /** ISO week the Horizon was computed for. */
  week: string;
  geometry: MapGeometry;
}
