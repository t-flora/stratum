import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { RequireTag } from './types.ts';

export interface Config {
  world: { seed: number };
  writeup: { minWords: number };
  hardware: { available: RequireTag[] };
  visibility: {
    radiusBase: number;
    radiusPerP: number;
    silhouetteFactor: number;
    towerRadiusBonus: number;
    towerRidgeBonus: number;
    lightRadius: number;
    glowRadius: number;
    silhouetteTitleMinP: number;
  };
  horizon: { farDistance: number };
}

export const DEFAULT_CONFIG: Config = {
  world: { seed: 20261002 },
  writeup: { minWords: 250 },
  hardware: { available: ['linux', 'llm-api'] },
  visibility: {
    radiusBase: 150,
    radiusPerP: 90,
    silhouetteFactor: 1.6,
    towerRadiusBonus: 300,
    towerRidgeBonus: 2,
    lightRadius: 220,
    glowRadius: 40,
    silhouetteTitleMinP: 3,
  },
  horizon: { farDistance: 450 },
};

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? (T[K] extends unknown[] ? T[K] : DeepPartial<T[K]>) : T[K] };

export function mergeConfig(partial: DeepPartial<Config> | null | undefined): Config {
  const out = structuredClone(DEFAULT_CONFIG) as unknown as Record<string, Record<string, unknown>>;
  for (const [section, values] of Object.entries(partial ?? {})) {
    if (values && typeof values === 'object' && section in out) Object.assign(out[section]!, values);
  }
  return out as unknown as Config;
}

export function loadConfig(root: string): Config {
  const file = join(root, 'stratum.config.yaml');
  if (!existsSync(file)) return structuredClone(DEFAULT_CONFIG);
  return mergeConfig(parse(readFileSync(file, 'utf8')));
}
