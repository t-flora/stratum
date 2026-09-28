import type { MultiPolygon, Ring } from '@stratum/core/mapdata';

type Pt = readonly [number, number];

const f = (v: number) => (Math.round(v * 10) / 10).toString();

export function ringPath(ring: readonly Pt[]): string {
  if (!ring.length) return '';
  return 'M' + ring.map((p) => `${f(p[0])},${f(p[1])}`).join('L') + 'Z';
}

export function multiPolygonPath(mp: MultiPolygon): string {
  return mp.map((poly) => poly.map(ringPath).join('')).join('');
}

export function linePath(line: readonly Pt[]): string {
  return 'M' + line.map((p) => `${f(p[0])},${f(p[1])}`).join('L');
}

export function islandPath(ring: Ring): string {
  return ringPath(ring);
}
