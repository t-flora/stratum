export const LAYERS = ['sky', 'surface', 'depths'] as const;
export type Layer = (typeof LAYERS)[number];

export const KINDS = ['shrine', 'tower', 'temple'] as const;
export type Kind = (typeof KINDS)[number];

export const SIZES = ['S', 'M', 'L'] as const;
export type Size = (typeof SIZES)[number];

export const REQUIRE_TAGS = ['gpu', 'arm', 'x86', 'avx512', 'linux', 'llm-api'] as const;
export type RequireTag = (typeof REQUIRE_TAGS)[number];

export type Vec2 = [number, number];

export interface Region {
  id: string;
  layer: Layer;
  name: string;
  centroid?: Vec2;
  radius?: number;
}

export interface Shrine {
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
  xy?: Vec2;
  from?: string;
  /** Which file the shrine came from. */
  source: 'seed' | 'proposed';
  /** Position in file order (seed first, then proposed). Placement depends on it (§8.3). */
  order: number;
}

export interface RidgeOverride {
  between: [string, string];
  h: number;
  /** Line in world-seed.yaml, for diagnostics. */
  line?: number;
}

export interface World {
  canvas: { width: number; height: number };
  start: { vantage: Vec2; plateau: string[] };
  regions: Region[];
  ridges: { default: number; overrides: RidgeOverride[] };
  shrines: Shrine[];
  regionById: Map<string, Region>;
  shrineById: Map<string, Shrine>;
}

export interface Diagnostic {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  file: string;
  line?: number;
  col?: number;
}
