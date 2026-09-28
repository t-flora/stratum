import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { REQUIRE_TAGS, type RequireTag } from './types.ts';

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

export const CONFIG_PATH = 'stratum.config.yaml';
/** Per-machine overrides, gitignored. Written by `stratum setup`. */
export const LOCAL_CONFIG_PATH = 'stratum.local.yaml';

/** Later layers override earlier ones key by key within each section; arrays are replaced, not merged. */
export function mergeConfig(...layers: (DeepPartial<Config> | null | undefined)[]): Config {
  const out = structuredClone(DEFAULT_CONFIG) as unknown as Record<string, Record<string, unknown>>;
  for (const partial of layers) {
    for (const [section, values] of Object.entries(partial ?? {})) {
      if (values && typeof values === 'object' && section in out) Object.assign(out[section]!, values);
    }
  }
  return out as unknown as Config;
}

export function loadConfig(root: string): Config {
  const read = (rel: string) => {
    const file = join(root, rel);
    return existsSync(file) ? parse(readFileSync(file, 'utf8')) : null;
  };
  return mergeConfig(read(CONFIG_PATH), read(LOCAL_CONFIG_PATH));
}

export function hasLocalConfig(root: string): boolean {
  return existsSync(join(root, LOCAL_CONFIG_PATH));
}

/** Problems with the effective config (unknown hardware tags, etc.). */
export function validateConfig(config: Config): string[] {
  const problems: string[] = [];
  const available: unknown = config.hardware.available;
  if (!Array.isArray(available)) problems.push('hardware.available must be a list');
  else {
    for (const t of available) {
      if (!REQUIRE_TAGS.includes(t as RequireTag)) problems.push(`hardware.available: unknown tag "${t}" (expected ${REQUIRE_TAGS.join(', ')})`);
    }
  }
  if (!(config.writeup.minWords >= 0)) problems.push('writeup.minWords must be a non-negative number');
  return problems;
}
