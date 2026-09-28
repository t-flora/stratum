/** Per-region colours. Visual only; the game logic never reads these. */

const SURFACE_TINTS = ['#efe2c2', '#e4e6c3', '#eed8bd', '#dfe3cc', '#ecdcc6', '#e2dfbd', '#ead6bf', '#e3e4c8', '#f0e0c0', '#e2d6bd'];

/** Depths veins colour the light (§6.4): Cache is teal, Silicon is green. */
const VEIN_COLOURS: Record<string, string> = {
  'isa-assembly': '#f2b155',
  microarchitecture: '#e46aa8',
  'memory-hierarchy': '#3fd0c4',
  compilers: '#a58cf5',
  'gpu-metal': '#6cdb6a',
  'os-kernel': '#f0795a',
  'numerics-bits': '#63a6f2',
};

export function surfaceTint(index: number): string {
  return SURFACE_TINTS[index % SURFACE_TINTS.length]!;
}

export function veinColour(regionId: string): string {
  if (VEIN_COLOURS[regionId]) return VEIN_COLOURS[regionId];
  let h = 0;
  for (const c of regionId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} 70% 65%)`;
}
