<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { select } from 'd3-selection';
  import { zoom, zoomIdentity, type D3ZoomEvent, type ZoomBehavior } from 'd3-zoom';
  import type { Layer, MapData, MapShrine } from '@stratum/core/mapdata';
  import Glyph from './Glyph.svelte';
  import { regionOf } from './names.ts';
  import { linePath, multiPolygonPath, ringPath } from './paths.ts';
  import { surfaceTint, veinColour } from './palette.ts';

  let {
    map,
    layer,
    initialZoom = 1,
    atlas = false,
    selected = null,
    focus = null,
    onselect,
  }: {
    map: MapData;
    layer: Layer;
    initialZoom?: number;
    /** Atlas mode (§9.5): all the terrain, no depths darkness. */
    atlas?: boolean;
    selected?: string | null;
    /** Pan to this shrine (search results); `n` changes on every request so the same shrine can be found twice. */
    focus?: { id: string; n: number } | null;
    onselect?: (id: string | null) => void;
  } = $props();

  /** Reference time for the camp fire fading; refreshed whenever a new map arrives. */
  const now = $derived.by(() => {
    void map.builtAt;
    return Date.now();
  });

  /** A click on open ground (not a glyph) closes the detail panel. d3-zoom swallows the click that ends a drag. */
  function onMapClick(e: MouseEvent) {
    if (!(e.target as Element).closest('.glyph')) onselect?.(null);
  }

  /**
   * Layer transitions (§9.2), under 400 ms: the depths "dive" (darken, then settle from slightly larger) and the sky islands
   * rise into place. Reduced motion (the OS setting) skips them; app.css does the same for CSS transitions.
   */
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dive = (_node: Element) => ({ duration: reduced ? 0 : 320, css: (u: number) => `opacity: ${u}; transform: scale(${1.05 - 0.05 * u})` });
  const rise = (_node: Element) => ({ duration: reduced ? 0 : 340, css: (u: number) => `opacity: ${u}; transform: translateY(${(1 - u) * 16}px)` });

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
      const mp = map.geometry.islands[r.id] ?? [];
      const top = mp.flat(2).reduce((m, p) => Math.min(m, p[1]), r.centroid![1] - r.radius!);
      return { region: r, d: multiPolygonPath(mp), labelY: top - 12 };
    }),
  );
  const regionName = $derived(new Map(map.regions.map((r) => [r.id, r.name])));
  /** Region labels: the spot near the centroid that keeps the label box farthest from any glyph. */
  const regionLabels = $derived(
    surfaceRegions.map((r) => {
      // A partly explored region is named over the part you've seen, not out in the blank.
      const partial = !atlas && !r.surveyed && r.explored?.centre && r.explored.share < 0.9;
      const [cx, cy] = partial ? r.explored!.centre! : r.centroid!;
      const halfW = r.name.length * 5.2;
      const halfH = 11;
      const glyphs = map.shrines.filter((s) => s.layer === 'surface' && Math.abs(s.xy[0] - cx) < 260 && Math.abs(s.xy[1] - cy) < 200);
      let best = { x: cx, y: cy - 22, score: -Infinity };
      for (let dy = -90; dy <= 70; dy += 10) {
        for (let dx = -70; dx <= 70; dx += 14) {
          const x = cx + dx;
          const y = cy - 22 + dy; // text baseline; box spans y-18..y+4
          let clearance = Infinity;
          for (const g of glyphs) {
            const ox = Math.max(0, Math.abs(g.xy[0] - x) - halfW);
            const oy = Math.max(0, Math.abs(g.xy[1] - (y - 7)) - halfH);
            clearance = Math.min(clearance, Math.hypot(ox, oy));
          }
          const score = Math.min(clearance, 30) - 0.04 * Math.hypot(dx, dy);
          if (score > best.score) best = { x, y, score };
        }
      }
      return { id: r.id, name: r.name, x: best.x, y: best.y };
    }),
  );

  /** Theme labels: above the cluster on the surface, below the islet in the sky. */
  const byId = $derived(new Map(map.shrines.map((s) => [s.id, s])));
  /** Theme names show only once one of their shrines is revealed, placed over the members you can see. */
  const themeLabels = $derived(
    map.themes
      .filter((th) => th.members.some((id) => byId.get(id)?.visibility === 'revealed'))
      .map((th) => {
        const pts = th.members.filter((id) => byId.get(id)!.visibility !== 'hidden').map((id) => byId.get(id)!.xy);
        const x = pts.reduce((a, p) => a + p[0], 0) / pts.length;
        const y = th.layer === 'sky' ? Math.max(...pts.map((p) => p[1])) + 30 : Math.min(...pts.map((p) => p[1])) - 16;
        return { key: `${th.region}/${th.name}`, layer: th.layer, name: th.name, x, y };
      }),
  );
  const veinFills = $derived(
    Object.entries(map.geometry.depths.veins).map(([id, mp]) => ({ id, d: multiPolygonPath(mp), fill: veinColour(id) })),
  );
  const strata = $derived(map.geometry.depths.strata.map(multiPolygonPath));
  /** Surveyed regions (cleared tower) are explored in full (§5.3). */
  const surveyedFills = $derived(regionFills.filter((r) => map.regions.find((x) => x.id === r.id)?.surveyed).map((r) => r.d));
  /** Explored land (docs/plans/unknown.md): one ray-traced shape per place you've stood. Everything else is blank paper. */
  const exploredShapes = $derived(map.sight.explored.map(ringPath));
  /** A region's name shows once you've seen a fair share of it. */
  const named = $derived(new Set(map.regions.filter((r) => atlas || r.surveyed || (r.explored?.share ?? 0) >= 0.15).map((r) => r.id)));
  const lights = $derived(
    atlas
      ? // The atlas lights every lightroot dimly, so the depths read as a whole.
        map.shrines.filter((s) => s.layer === 'depths').map((s) => ({ xy: s.xy, region: s.region, kind: 'light' as const, r: 70 }))
      : map.sight.lights.map((l) => ({ ...l, r: l.kind === 'light' ? map.sight.lightRadius : map.sight.glowRadius })),
  );
  /** Shrine titles on the map: silhouettes too faint to name stay anonymous (§6.2). */
  const labelled = (list: MapShrine[]) => list.filter((s) => s.titleKnown);
  /** The pin (§7): a stamp above the pinned shrine, on its own layer, if it's in sight. */
  const pinned = $derived(map.pin ? map.shrines.find((s) => s.id === map.pin && s.visibility !== 'hidden') : undefined);

  /** §9.4 Hero's Path on this layer: one dotted segment per step, dated on hover. */
  const pathSegments = $derived(
    map.path[layer].slice(1).map((to, i) => {
      const from = map.path[layer][i]!;
      return { key: `${from.id}>${to.id}`, a: byId.get(from.id)!.xy, b: byId.get(to.id)!.xy, from: from.date, to: to.date };
    }),
  );

  /** §10.2: the region under the pointer, if its name is known (hovering blank paper tells you nothing). */
  let hovered = $state<string | null>(null);
  const readout = $derived.by(() => {
    const r = hovered ? map.regions.find((x) => x.id === hovered) : undefined;
    if (!r?.stats || (r.layer === 'surface' && !named.has(r.id))) return null;
    return { name: r.name, layer: r.layer, surveyed: r.surveyed ?? false, ...r.stats };
  });

  const shrinesOn = (l: Layer) => map.shrines.filter((s) => s.layer === l && s.visibility !== 'hidden');
  const surfaceShrines = $derived(shrinesOn('surface'));
  const skyShrines = $derived(shrinesOn('sky'));
  const depthsShrines = $derived(shrinesOn('depths'));

  // Glyphs shrink less than the map grows, so they stay legible without swamping the terrain.
  const glyphScale = $derived(1 / Math.pow(t.k, 0.75));
  const showTitles = $derived(t.k >= 2.4);
  const showThemes = $derived(t.k >= 1.5 && t.k < 2.4);
  const labelSize = (px: number) => px / Math.pow(t.k, 0.85);

  let z: ZoomBehavior<SVGSVGElement, unknown> | undefined;
  /** Zoom buttons (trackpads, keyboards): scale around the view centre, or reset to the whole map. */
  function zoomBy(factor: number) {
    if (z) select(svg).call(z.scaleBy, factor);
  }
  function zoomReset() {
    if (z) select(svg).call(z.transform, zoomIdentity);
  }

  // Search (§6.5) asks to see a shrine: centre it, zooming in to at least 2× so it's findable among its neighbours.
  $effect(() => {
    const s = focus ? byId.get(focus.id) : undefined;
    if (!s || !z) return;
    const sel = select(svg);
    sel.call(z.scaleTo, Math.max(2, untrack(() => t.k)));
    sel.call(z.translateTo, s.xy[0], s.xy[1]);
  });

  onMount(() => {
    // Zoom out below 1 and pan well past the edges, so anything under the side panels can be dragged into view.
    z = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.6, 10])
      .translateExtent([
        [-W * 0.6, -H * 0.4],
        [W * 1.6, H * 1.4],
      ])
      .on('zoom', (e: D3ZoomEvent<SVGSVGElement, unknown>) => {
        t = { k: e.transform.k, x: e.transform.x, y: e.transform.y };
      });
    select(svg).call(z).on('dblclick.zoom', null);
    if (initialZoom !== 1) select(svg).call(z.scaleTo, initialZoom);
    else if (svg.clientWidth < 640) {
      // A phone sees the whole canvas at a quarter scale: open on the start instead, close enough to read (§13 M5).
      select(svg).call(z.scaleTo, 2.4).call(z.translateTo, map.start.vantage[0], map.start.vantage[1]);
    }
  });
</script>

<!-- Keyboard users select glyphs with Tab/Enter and close the panel with Escape (App), so the ground click needs no key handler. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<svg
  bind:this={svg}
  class="map layer-{layer}"
  viewBox="0 0 {W} {H}"
  preserveAspectRatio="xMidYMid meet"
  role="group"
  aria-label="Stratum map, {layer} layer"
  onclick={onMapClick}
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
    <!-- The unknown (docs/plans/unknown.md): terrain is drawn only on explored land, with a feathered edge. -->
    <filter id="feather" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="5" />
    </filter>
    <filter id="edge-wash" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="14" />
    </filter>
    <mask id="explored-mask" maskUnits="userSpaceOnUse" x={-W} y={-H} width={W * 3} height={H * 3}>
      <g filter="url(#feather)">
        {#each surveyedFills as d, i (i)}
          <path {d} fill="#fff" />
        {/each}
        {#each exploredShapes as d, i (i)}
          <path {d} fill="#fff" />
        {/each}
      </g>
    </mask>
    <!-- Depths (§6.4): black except inside light circles and glows. -->
    <radialGradient id="light-hole">
      <stop offset="0" stop-color="#fff" stop-opacity="1" />
      <stop offset="0.6" stop-color="#fff" stop-opacity="0.85" />
      <stop offset="1" stop-color="#fff" stop-opacity="0" />
    </radialGradient>
    <mask id="light-mask" maskUnits="userSpaceOnUse" x={-W} y={-H} width={W * 3} height={H * 3}>
      <rect x={-W} y={-H} width={W * 3} height={H * 3} fill="#000" />
      {#each lights as l, i (i)}
        <circle cx={l.xy[0]} cy={l.xy[1]} r={l.r} fill="url(#light-hole)" />
      {/each}
    </mask>
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
      {#if !atlas}
        <!-- Blank paper where nobody has looked yet, darkening a little towards the edge of the known world -->
        <rect x={-W} y={-H} width={W * 3} height={H * 3} fill="var(--unknown)" />
        <rect x={-W} y={-H} width={W * 3} height={H * 3} fill="#fff" filter="url(#grain)" />
        <g class="edge-wash" filter="url(#edge-wash)">
          {#each surveyedFills as d, i (i)}
            <path {d} />
          {/each}
          {#each exploredShapes as d, i (i)}
            <path {d} />
          {/each}
        </g>
      {/if}
      <g class="terrain" mask={atlas ? undefined : 'url(#explored-mask)'}>
        <rect x={-W} y={-H} width={W * 3} height={H * 3} fill="var(--sea)" />
        <rect x={-W} y={-H} width={W * 3} height={H * 3} fill="url(#waves)" />
        {#each regionFills as r (r.id)}
          <path
            d={r.d}
            fill={r.fill}
            role="presentation"
            onpointerenter={() => (hovered = r.id)}
            onpointerleave={() => hovered === r.id && (hovered = null)}
          />
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
      </g>

      {#if layer === 'surface'}
        <!-- Sky islands cast faint shadows on the ground (§6.3) -->
        {#each islands as isl (isl.region.id)}
          <!-- Islands are always visible (§6.3), so are their shadows; on unexplored paper only faintly -->
          <path class="island-ground-shadow" class:unknown={!atlas} d={isl.d} />
          {#if !atlas}
            <path class="island-ground-shadow" d={isl.d} mask="url(#explored-mask)" />
          {/if}
        {/each}
        {#if showThemes}
          {#each themeLabels.filter((l) => l.layer === 'surface') as l (l.key)}
            <text class="theme-label" x={l.x} y={l.y} font-size={labelSize(14)}>{l.name}</text>
          {/each}
        {/if}
        {#if t.k < 1.5}
          {#each regionLabels.filter((r) => named.has(r.id)) as r (r.id)}
            <text class="region-label" x={r.x} y={r.y} font-size={labelSize(22)}>{r.name}</text>
          {/each}
        {/if}
        {#each surfaceShrines as s (s.id)}
          <Glyph
            shrine={s}
            scale={glyphScale}
            regionName={regionOf(regionName, s)}
            selected={selected === s.id}
            {now}
            {onselect}
          />
        {/each}
        {#if showTitles}
          {#each labelled(surfaceShrines) as s (s.id)}
            <text class="shrine-label" x={s.xy[0]} y={s.xy[1] + 16 * glyphScale} font-size={labelSize(12)}>{s.title}</text>
          {/each}
        {/if}
      {/if}
    </g>

    {#if layer === 'sky'}
      <g class="sky-layer" in:rise>
        {#each islands as isl (isl.region.id)}
          <path class="island-shadow" d={isl.d} transform="translate(22,34)" filter="url(#soft-shadow)" />
        {/each}
        {#each islands as isl (isl.region.id)}
          <path
            class="island"
            d={isl.d}
            role="presentation"
            onpointerenter={() => (hovered = isl.region.id)}
            onpointerleave={() => hovered === isl.region.id && (hovered = null)}
          />
          <text
            class="island-label"
            x={isl.region.centroid![0]}
            y={isl.labelY}
            font-size={labelSize(20)}>{isl.region.name}</text
          >
        {/each}
        {#if !showTitles}
          {#each themeLabels.filter((l) => l.layer === 'sky') as l (l.key)}
            <text class="theme-label sky" x={l.x} y={l.y} font-size={labelSize(12)}>{l.name}</text>
          {/each}
        {/if}
        {#each skyShrines as s (s.id)}
          <Glyph
            shrine={s}
            scale={glyphScale}
            regionName={regionOf(regionName, s)}
            selected={selected === s.id}
            {now}
            {onselect}
          />
        {/each}
        {#if showTitles}
          {#each labelled(skyShrines) as s (s.id)}
            <text class="shrine-label sky" x={s.xy[0]} y={s.xy[1] + 16 * glyphScale} font-size={labelSize(12)}>{s.title}</text>
          {/each}
        {/if}
      </g>
    {/if}

    {#if layer === 'depths'}
      <g class="depths-layer" in:dive>
        <!-- Depths terrain: vein territories and rock strata, seen only where there is light -->
        <g mask={atlas ? undefined : 'url(#light-mask)'} class:atlas-dim={atlas}>
          {#each veinFills as v (v.id)}
            <path class="vein" d={v.d} fill={v.fill} />
          {/each}
          {#each strata as d, i (i)}
            <path class="strata" {d} />
          {/each}
        </g>
        {#each lights as l, i (i)}
          <circle class="light {l.kind}" cx={l.xy[0]} cy={l.xy[1]} r={l.kind === 'light' ? l.r : l.r * 1.4} fill="url(#glow-{l.region})" />
        {/each}
        {#each depthsShrines as s (s.id)}
          <Glyph
            shrine={s}
            scale={glyphScale}
            colour={veinColour(s.region)}
            regionName={regionOf(regionName, s)}
            selected={selected === s.id}
            {now}
            {onselect}
          />
        {/each}
        {#if showTitles}
          {#each labelled(depthsShrines) as s (s.id)}
            <text class="shrine-label depths" x={s.xy[0]} y={s.xy[1] + 16 * glyphScale} font-size={labelSize(12)}>{s.title}</text>
          {/each}
        {/if}
      </g>
    {/if}
    {#if pathSegments.length}
      <!-- Hero's Path (§9.4): drawn over the glyphs but thin, so it never hides them -->
      <g class="hero-path {layer}">
        {#each pathSegments as seg (seg.key)}
          <g class="step">
            <title>{seg.from === seg.to ? seg.to : `${seg.from} → ${seg.to}`}</title>
            <line class="step-hit" x1={seg.a[0]} y1={seg.a[1]} x2={seg.b[0]} y2={seg.b[1]} />
            <line class="step-line" x1={seg.a[0]} y1={seg.a[1]} x2={seg.b[0]} y2={seg.b[1]} />
          </g>
        {/each}
      </g>
    {/if}
    {#if pinned && pinned.layer === layer}
      <g class="pin-stamp" transform="translate({pinned.xy[0]},{pinned.xy[1] - 18 * glyphScale}) scale({glyphScale})">
        <title>Pinned: {pinned.titleKnown ? pinned.title : '???'}</title>
        <path class="stamp-stem" d="M0,2 L0,9" />
        <rect class="stamp-face" x="-6" y="-8" width="12" height="10" rx="2.5" transform="rotate(-8)" />
        <circle class="stamp-dot" cy="-3" r="2.2" transform="rotate(-8)" />
      </g>
    {/if}
  </g>
</svg>

{#if readout}
  <div class="region-readout" role="status">
    <strong>{readout.name}</strong>
    <span>{readout.cleared} cleared · {readout.revealed} revealed · {readout.total} shrines</span>
    <span>
      {#if readout.layer === 'surface'}{readout.surveyed ? 'Surveyed' : 'Not surveyed'}{/if}{#if readout.hours > 0}{readout.layer === 'surface' ? ' · ' : ''}{readout.estimated ? '≈ ' : ''}{readout.hours} h{/if}
    </span>
  </div>
{/if}

<div class="zoom-controls" role="group" aria-label="Zoom">
  <button onclick={() => zoomBy(1.4)} title="Zoom in (or scroll / pinch)" aria-label="Zoom in">+</button>
  <button onclick={() => zoomBy(1 / 1.4)} title="Zoom out" aria-label="Zoom out">−</button>
  <button onclick={zoomReset} title="Show the whole map" aria-label="Reset zoom">⤢</button>
</div>

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
  .hero-path .step-line {
    stroke: var(--path);
    stroke-width: 1.6;
    stroke-dasharray: 1.5 4;
    stroke-linecap: round;
    vector-effect: non-scaling-stroke;
    pointer-events: none;
  }
  .hero-path.sky .step-line {
    stroke: var(--sky-ink);
  }
  .hero-path.depths .step-line {
    stroke: var(--depths-label);
  }
  .hero-path .step-hit {
    stroke: transparent;
    stroke-width: 10;
    vector-effect: non-scaling-stroke;
  }
  .hero-path .step:hover .step-line {
    stroke-width: 2.6;
  }
  .region-readout {
    position: absolute;
    right: 14px;
    bottom: 14px;
    display: grid;
    gap: 2px;
    padding: 8px 12px;
    border: 1px solid var(--ui-border);
    border-radius: 8px;
    background: var(--ui-panel);
    color: var(--ui-fg);
    font-size: 12px;
    pointer-events: none;
  }
  .region-readout strong {
    font-family: var(--font-map);
    font-size: 16px;
  }
  .region-readout span {
    color: var(--ui-muted);
  }
  .sky-layer,
  .depths-layer {
    transform-box: view-box;
    transform-origin: 50% 50%;
  }
  .island-ground-shadow.unknown {
    opacity: 0.05;
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
  .theme-label {
    font-family: var(--font-map);
    font-style: italic;
    font-weight: 500;
    letter-spacing: 0.03em;
    fill: #6b5a41;
    paint-order: stroke;
    stroke: rgba(255, 250, 238, 0.75);
    stroke-width: 2.5px;
  }
  .theme-label.sky {
    fill: #5b7697;
  }
  .pin-stamp {
    pointer-events: none;
  }
  .stamp-stem {
    stroke: #8c2f1f;
    stroke-width: 1.6;
    stroke-linecap: round;
  }
  .stamp-face {
    fill: #c2412b;
    stroke: #6e2215;
    stroke-width: 1.2;
  }
  .stamp-dot {
    fill: #f6e7d0;
  }
  .atlas-dim {
    opacity: 0.6;
  }
  .edge-wash {
    fill: var(--unknown-edge);
    opacity: 0.35;
    pointer-events: none;
  }
  .light {
    pointer-events: none;
  }
  .light.glow {
    animation: pulse 2.8s ease-in-out infinite;
    transform-box: fill-box;
    transform-origin: center;
  }
  @keyframes pulse {
    0%,
    100% {
      opacity: 0.55;
      transform: scale(0.9);
    }
    50% {
      opacity: 1;
      transform: scale(1.1);
    }
  }
  .vein {
    fill-opacity: 0.22;
    stroke: none;
  }
  .strata {
    fill: none;
    stroke: #c9d2dc;
    stroke-opacity: 0.18;
    stroke-width: 0.8;
    vector-effect: non-scaling-stroke;
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

  .zoom-controls {
    position: absolute;
    top: 12px;
    right: 12px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--ui-border);
    border-radius: 8px;
    background: var(--ui-panel);
    box-shadow: 0 4px 12px rgba(40, 30, 20, 0.08);
  }
  .zoom-controls button {
    width: 32px;
    height: 32px;
    border: 0;
    background: transparent;
    color: var(--ui-fg);
    font: 500 17px var(--font-ui);
    cursor: pointer;
  }
  .zoom-controls button + button {
    border-top: 1px solid var(--ui-border);
  }
  .zoom-controls button:hover {
    background: var(--ui-border);
  }
  .zoom-controls button:focus-visible {
    outline: 2px solid var(--ui-accent);
    outline-offset: -2px;
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

  @media (max-width: 640px) {
    .region-readout {
      top: 56px;
      right: auto;
      bottom: auto;
      left: 12px;
    }
    .vein-legend {
      top: 56px;
      right: auto;
      bottom: auto;
      left: 12px;
    }
  }
</style>
