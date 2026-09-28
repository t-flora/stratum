<script lang="ts">
  import { onMount } from 'svelte';
  import { select } from 'd3-selection';
  import { zoom, type D3ZoomEvent } from 'd3-zoom';
  import type { Layer, MapData } from '@stratum/core/mapdata';
  import Glyph from './Glyph.svelte';
  import { islandPath, linePath, multiPolygonPath } from './paths.ts';
  import { surfaceTint, veinColour } from './palette.ts';

  let { map, layer }: { map: MapData; layer: Layer } = $props();

  let svg: SVGSVGElement;
  let t = $state({ k: 1, x: 0, y: 0 });

  const W = $derived(map.canvas.width);
  const H = $derived(map.canvas.height);

  // Static geometry → path strings, computed once per map.
  const surfaceRegions = $derived(map.regions.filter((r) => r.layer === 'surface'));
  const skyRegions = $derived(map.regions.filter((r) => r.layer === 'sky'));
  const veins = $derived(map.regions.filter((r) => r.layer === 'depths'));
  const coast = $derived(multiPolygonPath(map.geometry.coast));
  const regionFills = $derived(
    surfaceRegions.map((r, i) => ({ id: r.id, d: multiPolygonPath(map.geometry.regions[r.id] ?? []), fill: surfaceTint(i) })),
  );
  const contours = $derived(map.geometry.contours.map((c) => multiPolygonPath(c.polygons)));
  const ridges = $derived(map.geometry.ridges.map((r) => ({ h: r.h, d: r.lines.map(linePath).join('') })));
  const islands = $derived(
    skyRegions.map((r) => {
      const ring = map.geometry.islands[r.id] ?? [];
      const top = ring.reduce((m, p) => Math.min(m, p[1]), r.centroid![1] - r.radius!);
      return { region: r, d: islandPath(ring), labelY: top - 10 };
    }),
  );
  const regionName = $derived(new Map(map.regions.map((r) => [r.id, r.name])));
  /** Region labels sit above the centroid, and above the tower if it's close by. */
  const regionLabels = $derived(
    surfaceRegions.map((r) => {
      const [cx, cy] = r.centroid!;
      const tower = map.shrines.find((s) => s.region === r.id && s.kind === 'tower');
      const near = tower && Math.abs(tower.xy[0] - cx) < 90 && Math.abs(tower.xy[1] - cy) < 60;
      return { id: r.id, name: r.name, x: cx, y: near ? Math.min(cy - 22, tower.xy[1] - 24) : cy - 22 };
    }),
  );

  const shrinesOn = (l: Layer) => map.shrines.filter((s) => s.layer === l && s.visibility !== 'hidden');
  const surfaceShrines = $derived(shrinesOn('surface'));
  const skyShrines = $derived(shrinesOn('sky'));
  const depthsShrines = $derived(shrinesOn('depths'));

  // Glyphs shrink less than the map grows, so they stay legible without swamping the terrain.
  const glyphScale = $derived(1 / Math.pow(t.k, 0.75));
  const showTitles = $derived(t.k >= 2.4);
  const labelSize = (px: number) => px / Math.pow(t.k, 0.85);

  onMount(() => {
    const z = zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 10])
      .translateExtent([
        [-W * 0.1, -H * 0.1],
        [W * 1.1, H * 1.1],
      ])
      .on('zoom', (e: D3ZoomEvent<SVGSVGElement, unknown>) => {
        t = { k: e.transform.k, x: e.transform.x, y: e.transform.y };
      });
    select(svg).call(z).on('dblclick.zoom', null);
  });
</script>

<svg
  bind:this={svg}
  class="map layer-{layer}"
  viewBox="0 0 {W} {H}"
  preserveAspectRatio="xMidYMid meet"
  role="img"
  aria-label="Stratum map, {layer} layer"
>
  <defs>
    <pattern id="waves" width="64" height="36" patternUnits="userSpaceOnUse">
      <path d="M6,10 q5,-4 10,0 t10,0" fill="none" stroke="var(--sea-wave)" stroke-width="1" />
      <path d="M38,28 q5,-4 10,0 t10,0" fill="none" stroke="var(--sea-wave)" stroke-width="1" />
    </pattern>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" stitchTiles="stitch" />
      <feColorMatrix type="saturate" values="0" />
      <feComponentTransfer><feFuncA type="table" tableValues="0 0.09" /></feComponentTransfer>
      <feComposite in2="SourceGraphic" operator="in" />
    </filter>
    <filter id="soft-shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="9" />
    </filter>
    <clipPath id="land-clip"><path d={coast} /></clipPath>
    {#each veins as v (v.id)}
      <radialGradient id="glow-{v.id}">
        <stop offset="0" stop-color={veinColour(v.id)} stop-opacity="0.55" />
        <stop offset="0.45" stop-color={veinColour(v.id)} stop-opacity="0.18" />
        <stop offset="1" stop-color={veinColour(v.id)} stop-opacity="0" />
      </radialGradient>
    {/each}
  </defs>

  <!-- Oversized so the letterbox around the viewBox matches the layer -->
  <rect class="backdrop" x={-W} y={-H} width={W * 3} height={H * 3} />

  <g transform="translate({t.x},{t.y}) scale({t.k})">
    <!-- SURFACE: full on the surface layer, a faint ground far below on the sky layer (§9.3) -->
    <g class="surface-layer">
      <rect x={-W} y={-H} width={W * 3} height={H * 3} fill="var(--sea)" />
      <rect x={-W} y={-H} width={W * 3} height={H * 3} fill="url(#waves)" />
      {#each regionFills as r (r.id)}
        <path d={r.d} fill={r.fill} />
      {/each}
      <rect width={W} height={H} fill="#fff" filter="url(#grain)" clip-path="url(#land-clip)" />
      {#each contours as d, i (i)}
        <path class="contour" {d} />
      {/each}
      {#each ridges as r, i (i)}
        <path class="ridge-line" d={r.d} />
        <path class="ridge-hatch" d={r.d} style:stroke-width={2.5 + 1.8 * r.h} />
      {/each}
      <path class="coast" d={coast} />

      {#if layer === 'surface'}
        <!-- Sky islands cast faint shadows on the ground (§6.3) -->
        {#each islands as isl (isl.region.id)}
          <path class="island-ground-shadow" d={isl.d} />
        {/each}
        {#if !showTitles}
          {#each regionLabels as r (r.id)}
            <text class="region-label" x={r.x} y={r.y} font-size={labelSize(22)}>{r.name}</text>
          {/each}
        {/if}
        {#each surfaceShrines as s (s.id)}
          <Glyph shrine={s} scale={glyphScale} regionName={regionName.get(s.region) ?? s.region} />
        {/each}
        {#if showTitles}
          {#each surfaceShrines as s (s.id)}
            <text class="shrine-label" x={s.xy[0]} y={s.xy[1] + 16 * glyphScale} font-size={labelSize(12)}>{s.title}</text>
          {/each}
        {/if}
      {/if}
    </g>

    {#if layer === 'sky'}
      <g class="sky-layer">
        {#each islands as isl (isl.region.id)}
          <path class="island-shadow" d={isl.d} transform="translate(22,34)" filter="url(#soft-shadow)" />
        {/each}
        {#each islands as isl (isl.region.id)}
          <path class="island" d={isl.d} />
          <text
            class="island-label"
            x={isl.region.centroid![0]}
            y={isl.labelY}
            font-size={labelSize(20)}>{isl.region.name}</text
          >
        {/each}
        {#each skyShrines as s (s.id)}
          <Glyph shrine={s} scale={glyphScale} regionName={regionName.get(s.region) ?? s.region} />
        {/each}
        {#if showTitles}
          {#each skyShrines as s (s.id)}
            <text class="shrine-label sky" x={s.xy[0]} y={s.xy[1] + 16 * glyphScale} font-size={labelSize(12)}>{s.title}</text>
          {/each}
        {/if}
      </g>
    {/if}

    {#if layer === 'depths'}
      <g class="depths-layer">
        {#each depthsShrines as s (s.id)}
          <circle cx={s.xy[0]} cy={s.xy[1]} r="70" fill="url(#glow-{s.region})" />
        {/each}
        {#each depthsShrines as s (s.id)}
          <Glyph shrine={s} scale={glyphScale} colour={veinColour(s.region)} regionName={regionName.get(s.region) ?? s.region} />
        {/each}
        {#if showTitles}
          {#each depthsShrines as s (s.id)}
            <text class="shrine-label depths" x={s.xy[0]} y={s.xy[1] + 16 * glyphScale} font-size={labelSize(12)}>{s.title}</text>
          {/each}
        {/if}
      </g>
    {/if}
  </g>
</svg>

{#if layer === 'depths'}
  <ul class="vein-legend" aria-label="Depths veins">
    {#each veins as v (v.id)}
      <li><span style:background={veinColour(v.id)}></span>{v.name}</li>
    {/each}
  </ul>
{/if}

<style>
  .map {
    display: block;
    width: 100%;
    height: 100%;
    cursor: grab;
    touch-action: none;
  }
  .map:active {
    cursor: grabbing;
  }
  .backdrop {
    transition: fill 300ms ease;
  }
  .layer-surface .backdrop {
    fill: var(--sea);
  }
  .layer-sky .backdrop {
    fill: var(--sky);
  }
  .layer-depths .backdrop {
    fill: var(--depths);
  }

  .surface-layer {
    transition: opacity 300ms ease;
  }
  .layer-sky .surface-layer {
    opacity: 0.15;
  }
  .layer-depths .surface-layer {
    opacity: 0;
    pointer-events: none;
  }

  .contour {
    fill: none;
    stroke: var(--contour);
    stroke-opacity: 0.32;
    stroke-width: 0.7;
    vector-effect: non-scaling-stroke;
  }
  .coast {
    fill: none;
    stroke: var(--coast);
    stroke-width: 1.4;
    vector-effect: non-scaling-stroke;
  }
  .ridge-line {
    fill: none;
    stroke: var(--ridge);
    stroke-width: 1;
    stroke-opacity: 0.8;
    vector-effect: non-scaling-stroke;
  }
  .ridge-hatch {
    fill: none;
    stroke: var(--ridge);
    stroke-opacity: 0.55;
    stroke-dasharray: 0.9 2.6;
    stroke-linecap: butt;
  }
  .island-ground-shadow {
    fill: var(--island-shadow);
    opacity: 0.12;
    transform: translate(18px, 28px);
    pointer-events: none;
  }

  .island-shadow {
    fill: var(--island-shadow);
  }
  .island {
    fill: var(--island);
    stroke: var(--island-edge);
    stroke-width: 1.2;
    vector-effect: non-scaling-stroke;
  }

  text {
    pointer-events: none;
    text-anchor: middle;
    user-select: none;
  }
  .region-label,
  .island-label {
    font-family: var(--font-map);
    font-style: italic;
    font-weight: 600;
    letter-spacing: 0.04em;
    fill: var(--label);
    paint-order: stroke;
    stroke: rgba(255, 250, 238, 0.7);
    stroke-width: 3px;
  }
  .island-label {
    fill: var(--sky-ink);
  }
  .shrine-label {
    font-family: var(--font-map);
    font-weight: 600;
    fill: var(--ink);
    paint-order: stroke;
    stroke: rgba(255, 250, 238, 0.85);
    stroke-width: 2.5px;
  }
  .shrine-label.sky {
    fill: var(--sky-ink);
  }
  .shrine-label.depths {
    fill: var(--depths-label);
    stroke: rgba(0, 0, 0, 0.8);
  }

  .vein-legend {
    position: absolute;
    right: 16px;
    bottom: 16px;
    margin: 0;
    padding: 10px 14px;
    list-style: none;
    background: rgba(12, 13, 16, 0.85);
    border: 1px solid #262a30;
    border-radius: 8px;
    color: var(--depths-label);
    font-size: 12px;
    line-height: 1.8;
  }
  .vein-legend span {
    display: inline-block;
    width: 9px;
    height: 9px;
    margin-right: 8px;
    border-radius: 50%;
  }
</style>
