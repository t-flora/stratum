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
  xy: Vec2;
  status: ShrineStatus;
  visibility: Visibility;
}

export interface MapRegion {
  id: string;
  layer: Layer;
  name: string;
  centroid?: Vec2;
  radius?: number;
}

export interface MapRidge {
  between: [string, string];
  h: number;
  lines: Vec2[][];
}

export interface MapGeometry {
  coast: MultiPolygon;
  regions: Record<string, MultiPolygon>;
  ridges: MapRidge[];
  contours: { value: number; polygons: MultiPolygon }[];
  islands: Record<string, Ring>;
}

export interface MapData {
  version: 1;
  canvas: { width: number; height: number };
  start: { vantage: Vec2; plateau: string[] };
  regions: MapRegion[];
  shrines: MapShrine[];
  geometry: MapGeometry;
}
