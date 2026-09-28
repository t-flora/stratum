// The build/map.json contract between core (producer) and app (pure renderer). Types only: safe to import from the browser.
import type { Kind, Layer, RequireTag, Size, Vec2 } from './types.ts';

export type { Kind, Layer, RequireTag, Size, Vec2 };

export type Ring = Vec2[];
export type Polygon = Ring[];
export type MultiPolygon = Polygon[];

export type ShrineStatus = 'untouched' | 'in-progress' | 'cleared';
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
  /** Surface markers: `chasm` beside a shrine whose lightroot glows; `draft` on a launch point to the sky (§6.3, §6.4). */
  marks: { chasm?: boolean; draft?: boolean };
  /** Derived work state (§4.4), from work/<id>/ and git. Dates are YYYY-MM-DD. */
  startedAt?: string;
  clearedAt?: string;
  /** False for a cleared shrine whose WRITEUP.md isn't committed yet (rendered dashed). */
  committed: boolean;
  /** Commit timestamps (unix seconds) touching work/<id>/. */
  touches: number[];
  /** In-progress shrines: the first line of NEXT.md, and when the fire was last fed (ms since epoch). */
  campfire?: { note: string | null; since: number | null };
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
  /** Surface regions whose tower is cleared: no fog wash (§5.3). */
  surveyed?: boolean;
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

/** What the fog and the depths darkness are cut from (§6, §9.3). */
export interface MapSight {
  /** Surface vantages; the fog lifts within `fogRadius` of each (`towerFogRadius` for cleared towers). */
  vantages: { xy: Vec2; tower: boolean }[];
  fogRadius: number;
  towerFogRadius: number;
  /** Depths: light circles around cleared lightroots, and small glows under active surface shrines. */
  lights: { xy: Vec2; region: string; kind: 'light' | 'glow' }[];
  lightRadius: number;
  glowRadius: number;
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
  geometry: MapGeometry;
}
