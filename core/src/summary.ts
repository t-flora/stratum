import { LAYERS, type Layer, type World } from './types.ts';

export interface WorldSummary {
  entries: number;
  regions: number;
  byLayer: Record<Layer, { regions: number; shrines: number; towers: number; temples: number }>;
}

export function summarize(world: World): WorldSummary {
  const byLayer = Object.fromEntries(
    LAYERS.map((l) => [l, { regions: 0, shrines: 0, towers: 0, temples: 0 }]),
  ) as WorldSummary['byLayer'];
  for (const r of world.regions) byLayer[r.layer].regions++;
  for (const s of world.shrines) {
    const b = byLayer[s.layer];
    b.shrines++;
    if (s.kind === 'tower') b.towers++;
    if (s.kind === 'temple') b.temples++;
  }
  return { entries: world.shrines.length, regions: world.regions.length, byLayer };
}
