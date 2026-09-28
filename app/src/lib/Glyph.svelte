<script lang="ts">
  import type { MapShrine } from '@stratum/core/mapdata';

  import { campfireBrightness } from './campfire.ts';

  /** Original SVG glyphs (§9.3), drawn around (0, 0) in screen-ish units. */
  let {
    shrine,
    scale,
    colour,
    regionName,
    selected = false,
    now,
    onselect,
  }: {
    shrine: MapShrine;
    scale: number;
    colour?: string;
    regionName: string;
    selected?: boolean;
    now: number;
    onselect?: (id: string) => void;
  } = $props();

  const state = $derived(
    shrine.status === 'cleared' ? 'cleared' : shrine.visibility === 'silhouette' ? 'silhouette' : 'revealed',
  );
  const campfire = $derived(shrine.status === 'in-progress');
  const uncommitted = $derived(shrine.status === 'cleared' && !shrine.committed);
  const flame = $derived(campfire ? campfireBrightness(shrine.campfire?.since ?? null, now) : 0);
  /** Halo radius for the selection ring and the dashed "not committed" outline. */
  const halo = $derived(shrine.kind === 'tower' ? 14 : shrine.kind === 'temple' ? 12 : 9.5);
  const tooltip = $derived(
    [shrine.title, regionName, campfire && shrine.campfire?.note ? `Campfire: ${shrine.campfire.note}` : '', uncommitted ? 'Cleared, not committed yet' : '']
      .filter(Boolean)
      .join(' · '),
  );

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onselect?.(shrine.id);
    }
  }
</script>

<g
  class="glyph {shrine.layer} {shrine.kind} {state}"
  class:campfire
  class:uncommitted
  class:selected
  transform="translate({shrine.xy[0]},{shrine.xy[1]}) scale({scale})"
  style:--c={colour}
  role="button"
  tabindex="0"
  aria-label="{shrine.title}, {regionName}, {shrine.status.replace('-', ' ')}"
  aria-pressed={selected}
  onclick={() => onselect?.(shrine.id)}
  {onkeydown}
>
  <title>{tooltip}</title>
  {#if selected}<circle class="select-ring" r={halo + 3} />{/if}
  {#if uncommitted}<circle class="pending" r={halo} />{/if}
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
  {#if campfire}
    <!-- Campfire: a small flame that fades over 14 days since it was last fed (§10.1) -->
    <g class="flame" transform="translate(7.5,-8.5) scale(0.85)" style:opacity={flame}>
      <path class="flame-outer" d="M0,-8 C3.8,-4.4 5.2,-1.6 5.2,1.4 C5.2,4.4 2.9,6.4 0,6.4 C-2.9,6.4 -5.2,4.4 -5.2,1.4 C-5.2,-1.2 -3.4,-2.8 -2.3,-5.2 C-1.7,-3.2 -0.9,-2.4 -0.2,-2.2 C0.3,-4 0.3,-6 0,-8 Z" />
      <path class="flame-inner" d="M0.2,-1.6 C2,0.2 2.7,1.6 2.7,2.9 C2.7,4.3 1.5,5.2 0,5.2 C-1.5,5.2 -2.7,4.3 -2.7,2.9 C-2.7,1.5 -1.6,0.6 -1,-0.6 C-0.6,0.4 -0.1,0.6 0.2,-1.6 Z" />
    </g>
  {/if}
</g>

<style>
  .glyph {
    cursor: pointer;
    outline: none;
  }
  .select-ring {
    fill: none;
    stroke: var(--ui-accent);
    stroke-width: 2.2;
  }
  .glyph:focus-visible .select-ring,
  .glyph:focus-visible .pending {
    stroke-width: 2.6;
  }
  /* Cleared but WRITEUP.md not committed yet (§4.4) */
  .pending {
    fill: none;
    stroke: var(--ink);
    stroke-width: 1.3;
    stroke-dasharray: 2.4 2;
  }
  .sky .pending {
    stroke: var(--sky-ink);
  }
  .depths .pending {
    stroke: rgba(255, 255, 255, 0.8);
  }
  .flame-outer {
    fill: #e2572b;
    stroke: #7a2a12;
    stroke-width: 0.6;
  }
  .flame-inner {
    fill: #ffc94a;
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
  .glyph:hover .lightroot,
  .glyph:focus-visible .body,
  .glyph:focus-visible .ring,
  .glyph:focus-visible .lightroot {
    stroke: var(--ui-accent);
    stroke-width: 2.2;
  }
</style>
