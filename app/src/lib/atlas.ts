import type { MapData } from '@stratum/core/mapdata';

/**
 * Atlas mode (§9.5): the authoring view, with every shrine revealed and named. A presentation override only.
 * The real visibility in map.json is untouched, and MapView drops the fog and the depths darkness when `atlas` is set.
 */
export function atlasView(map: MapData): MapData {
  return { ...map, shrines: map.shrines.map((s) => ({ ...s, visibility: 'revealed', titleKnown: true })) };
}
