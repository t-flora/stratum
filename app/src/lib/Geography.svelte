<script lang="ts">
  import type { Biome, MapData, Vec2 } from '@stratum/core/mapdata';
  import { linePath, multiPolygonPath } from './paths.ts';

  /**
   * M6 geography (docs/plans/geography.md), drawn inside MapView's terrain group so it only shows on explored land.
   * `ground`: biome textures over each region's tint. `overlay`: rivers, the coast's cliffs and beaches, mountain ranges.
   * All marks are original, simple ink strokes in the map's palette.
   */
  let { map, part }: { map: MapData; part: 'ground' | 'overlay' } = $props();

  const textured = $derived(
    map.regions
      .filter((r) => r.layer === 'surface' && r.biome)
      .map((r) => ({ id: r.id, biome: r.biome as Biome, d: multiPolygonPath(map.geometry.regions[r.id] ?? []) })),
  );

  /** A river as a few segments of growing width (SVG strokes can't taper). */
  const rivers = $derived(
    map.geometry.features.rivers.flatMap((r) => {
      const pieces = Math.max(1, Math.min(6, Math.floor(r.line.length / 12)));
      const per = Math.ceil(r.line.length / pieces);
      return Array.from({ length: pieces }, (_, i) => {
        const pts = r.line.slice(i * per, Math.min(r.line.length, (i + 1) * per + 1));
        const w = r.width[0] + ((r.width[1] - r.width[0]) * (i + 0.5)) / pieces;
        return { key: `${r.id}:${i}`, d: linePath(pts), w };
      });
    }),
  );
  const cliffs = $derived(map.geometry.features.shore.cliffs.map(linePath).join(''));
  const beaches = $derived(map.geometry.features.shore.beaches.map(linePath).join(''));

  /** A peak: a lit west face and a shaded east face, with an optional snow cap. Drawn back to front (north first). */
  const peaks = $derived(
    map.geometry.features.ranges
      .flatMap((r) => r.peaks)
      .sort((a, b) => a.xy[1] - b.xy[1])
      .map((p) => {
        const [x, y] = p.xy;
        const w = 8 * p.size;
        const h = 11 * p.size;
        const apex: Vec2 = [x + 0.6 * p.size, y - h];
        return {
          key: `${x},${y}`,
          lit: `M${x - w},${y} L${apex[0]},${apex[1]} L${x + 0.2 * w},${y} Z`,
          shade: `M${x + 0.2 * w},${y} L${apex[0]},${apex[1]} L${x + w},${y} Z`,
          snow: p.snow ? `M${apex[0] - 0.38 * w},${apex[1] + 0.36 * h} L${apex[0]},${apex[1]} L${apex[0] + 0.36 * w},${apex[1] + 0.34 * h} L${apex[0] + 0.1 * w},${apex[1] + 0.26 * h} Z` : '',
        };
      }),
  );
</script>

{#if part === 'ground'}
  <defs>
    <!-- One small tile per biome, in world units, so the textures scale with the map like the terrain does. -->
    <pattern id="biome-woods" width="22" height="20" patternUnits="userSpaceOnUse">
      <g class="mark">
        <circle cx="5" cy="5" r="2.6" class="leaf" /><path d="M5,7.6 V10" />
        <circle cx="16" cy="14" r="2.9" class="leaf" /><path d="M16,16.9 V19.4" />
      </g>
    </pattern>
    <pattern id="biome-jungle" width="15" height="15" patternUnits="userSpaceOnUse">
      <g class="canopy">
        <circle cx="4" cy="4" r="3.4" /><circle cx="10.5" cy="6" r="2.8" /><circle cx="6.5" cy="11.5" r="3.1" /><circle cx="13" cy="13" r="2.2" />
      </g>
    </pattern>
    <pattern id="biome-marsh" width="28" height="20" patternUnits="userSpaceOnUse">
      <g class="mark">
        <path d="M5,9 L3.6,4.5 M6,9 V3.6 M7,9 L8.6,4.8 M3.4,9 H8.8" />
        <path d="M15,16 H23 M18,18.4 H25" class="pool" />
      </g>
    </pattern>
    <pattern id="biome-steppe" width="20" height="14" patternUnits="userSpaceOnUse">
      <g class="mark faint"><path d="M3,9 L2.4,6 M4.4,9 V5.6 M5.8,9 L6.6,6.2 M13,13 L12.4,10.2 M14.3,13 V9.8 M15.6,13 L16.3,10.4" /></g>
    </pattern>
    <pattern id="biome-highland" width="32" height="26" patternUnits="userSpaceOnUse">
      <g class="mark"><path d="M3,11 L7,5.5 L9.5,8.5 L12,6 L15,11" /><path d="M19,23 L22.5,18.5 L26,23" /></g>
    </pattern>
    <pattern id="biome-ridge" width="18" height="18" patternUnits="userSpaceOnUse">
      <g class="scree"><circle cx="3" cy="4" r="0.9" /><circle cx="7" cy="3" r="0.6" /><circle cx="12" cy="11" r="1" /><circle cx="15" cy="9" r="0.6" /><circle cx="6" cy="14" r="0.7" /></g>
    </pattern>
    <pattern id="biome-canyon" width="12" height="12" patternUnits="userSpaceOnUse">
      <g class="mark faint"><path d="M-1,7 L5,1 M5,13 L13,5" /></g>
    </pattern>
    <pattern id="biome-coast" width="30" height="16" patternUnits="userSpaceOnUse">
      <g class="mark faint"><path d="M2,8 Q7,4 12,8" /><path d="M17,14 Q22,10 27,14" /></g>
    </pattern>
    <pattern id="biome-plateau" width="26" height="26" patternUnits="userSpaceOnUse">
      <g class="scree"><circle cx="6" cy="7" r="0.7" /><circle cx="19" cy="18" r="0.7" /></g>
    </pattern>
    <pattern id="biome-workshop" width="24" height="24" patternUnits="userSpaceOnUse">
      <g class="mark faint"><rect x="3" y="3" width="6" height="4.5" /><path d="M14,15 H22 M14,18 H20" /></g>
    </pattern>
  </defs>
  {#each textured as r (r.id)}
    <path class="biome {r.biome}" d={r.d} fill="url(#biome-{r.biome})" />
  {/each}
{:else}
  {#if beaches}<path class="beach" d={beaches} />{/if}
  {#each rivers as r (r.key)}
    <path class="river" d={r.d} style:stroke-width={r.w} />
  {/each}
  {#if cliffs}<path class="cliff" d={cliffs} />{/if}
  <g class="peaks">
    {#each peaks as p (p.key)}
      <path class="lit" d={p.lit} />
      <path class="shade" d={p.shade} />
      {#if p.snow}<path class="snow" d={p.snow} />{/if}
    {/each}
  </g>
{/if}

<style>
  .biome {
    pointer-events: none;
  }
  .biome.jungle {
    opacity: 0.5;
  }
  .mark {
    fill: none;
    stroke: var(--ink);
    stroke-opacity: 0.32;
    stroke-width: 0.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .mark.faint {
    stroke-opacity: 0.22;
  }
  .mark .leaf {
    fill: var(--ink);
    fill-opacity: 0.1;
  }
  .mark .pool {
    stroke: var(--river);
    stroke-opacity: 0.6;
    stroke-width: 1.2;
  }
  .canopy circle {
    fill: #5f7a45;
    fill-opacity: 0.22;
    stroke: #4a6136;
    stroke-opacity: 0.25;
    stroke-width: 0.5;
  }
  .scree circle {
    fill: var(--ink);
    fill-opacity: 0.3;
  }
  .river {
    fill: none;
    stroke: var(--river);
    stroke-linecap: round;
    stroke-linejoin: round;
    pointer-events: none;
  }
  .beach {
    fill: none;
    stroke: var(--sand);
    stroke-width: 5;
    stroke-opacity: 0.85;
    stroke-linejoin: round;
    pointer-events: none;
  }
  .cliff {
    fill: none;
    stroke: var(--ridge);
    stroke-width: 4.5;
    stroke-dasharray: 0.9 2.2;
    stroke-opacity: 0.7;
    pointer-events: none;
  }
  .peaks {
    pointer-events: none;
  }
  .peaks .lit {
    fill: #efe2c6;
    stroke: var(--ridge);
    stroke-width: 0.7;
    stroke-linejoin: round;
  }
  .peaks .shade {
    fill: #a8916d;
    stroke: var(--ridge);
    stroke-width: 0.7;
    stroke-linejoin: round;
  }
  .peaks .snow {
    fill: #fbfaf6;
  }
</style>
