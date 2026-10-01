import type { MapShrine } from '@stratum/core/mapdata';

/** A silhouette over unexplored land gives away nothing about where it stands (docs/plans/unknown.md). */
export const UNCHARTED = 'Uncharted';

export const regionOf = (names: Map<string, string>, s: MapShrine) => (s.charted ? (names.get(s.region) ?? s.region) : UNCHARTED);
