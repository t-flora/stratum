<script lang="ts">
  import type { MapShrine } from '@stratum/core/mapdata';

  /** Original SVG glyphs (§9.3), drawn around (0, 0) in screen-ish units. */
  let { shrine, scale, colour, regionName }: { shrine: MapShrine; scale: number; colour?: string; regionName: string } = $props();

  const state = $derived(
    shrine.status === 'cleared' ? 'cleared' : shrine.visibility === 'silhouette' ? 'silhouette' : 'revealed',
  );
</script>

<g
  class="glyph {shrine.layer} {shrine.kind} {state}"
  transform="translate({shrine.xy[0]},{shrine.xy[1]}) scale({scale})"
  style:--c={colour}
>
  <title>{shrine.title} · {regionName}</title>
  {#if shrine.layer === 'depths'}
    <!-- Lightroot: starburst -->
    <polygon
      class="lightroot"
      points="0,-8 1.8,-2.6 7,-3.2 3,0.8 5,6.4 0,3.2 -5,6.4 -3,0.8 -7,-3.2 -1.8,-2.6"
    />
  {:else if shrine.kind === 'tower'}
    <!-- Tower: tall narrow obelisk -->
    <polygon class="body" points="-3.4,7 -2.2,-9 0,-13 2.2,-9 3.4,7" />
    <line class="base" x1="-6" y1="7" x2="6" y2="7" />
  {:else if shrine.kind === 'temple'}
    <!-- Temple: stepped pyramid -->
    <path class="body" d="M-9,6 H9 V2.5 H6 V-1 H3 V-4.5 H-3 V-1 H-6 V2.5 H-9 Z" />
  {:else if shrine.layer === 'sky'}
    <!-- Sky shrine: ring -->
    <circle class="ring" r="5" />
    {#if state === 'cleared'}<circle class="dot" r="2" />{/if}
  {:else}
    <!-- Shrine: rotated square with an inner dot -->
    <rect class="body" x="-4.6" y="-4.6" width="9.2" height="9.2" transform="rotate(45)" />
    <circle class="dot" r="1.6" />
  {/if}
</g>

<style>
  .glyph {
    cursor: pointer;
  }
  .body,
  .ring {
    stroke-width: 1.5;
    stroke-linejoin: round;
  }

  /* Surface */
  .surface .body {
    fill: var(--land);
    stroke: var(--ink);
  }
  .surface .dot {
    fill: var(--ink);
  }
  .surface.cleared .body {
    fill: var(--ink);
  }
  .surface.cleared .dot {
    fill: var(--land);
  }
  .surface.tower .body {
    fill: #7a4b2e;
    stroke: var(--ink);
  }
  .surface.temple .body {
    fill: #b98f52;
    stroke: var(--ink);
  }
  .tower .base {
    stroke: var(--ink);
    stroke-width: 1.6;
  }
  .silhouette .body,
  .silhouette .ring {
    fill: #b8b1a4;
    stroke: #8f887b;
  }
  .silhouette .dot {
    fill: #8f887b;
  }

  /* Sky */
  .sky .ring {
    fill: var(--island);
    stroke: var(--sky-ink);
    stroke-width: 2;
  }
  .sky .dot {
    fill: var(--sky-ink);
  }
  .sky.tower .body {
    fill: #dfe8f3;
    stroke: var(--sky-ink);
  }
  .sky.tower .base {
    stroke: var(--sky-ink);
  }

  /* Depths */
  .lightroot {
    fill: var(--c, #fff);
    stroke: rgba(255, 255, 255, 0.7);
    stroke-width: 0.6;
  }

  .glyph:hover .body,
  .glyph:hover .ring,
  .glyph:hover .lightroot {
    stroke: var(--ui-accent);
    stroke-width: 2.2;
  }
</style>
