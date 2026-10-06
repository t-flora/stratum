<script lang="ts">
  import type { MapShrine } from '@stratum/core/mapdata';

  import { campBrightness, isEmbers } from './camp.ts';

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
  /** One camp (a flame, or embers once it's old); every other in-progress shrine is a cairn (docs/plans/camps.md). */
  const camp = $derived(shrine.status === 'in-progress' && !!shrine.camp?.current);
  const cairn = $derived(shrine.status === 'in-progress' && !shrine.camp?.current);
  const embers = $derived(camp && isEmbers(shrine.camp?.since ?? null, now));
  const uncommitted = $derived(shrine.status === 'cleared' && !shrine.committed);
  const flame = $derived(camp ? campBrightness(shrine.camp?.since ?? null, now) : 0);
  /** Halo radius for the selection ring and the dashed "not committed" outline. */
  const halo = $derived(shrine.kind === 'tower' ? 14 : shrine.kind === 'temple' ? 12 : 9.5);
  /** Silhouettes too faint to name show "???" (§6.2). */
  const name = $derived(shrine.titleKnown ? shrine.title : '???');
  const tooltip = $derived(
    [
      name,
      regionName,
      camp ? `Your camp${embers ? ' (burnt down to embers)' : ''} · where you left off: ${shrine.camp?.note ?? 'no NEXT.md note'}` : '',
      cairn ? `A cairn you left · ${shrine.camp?.note ?? 'no NEXT.md note'}` : '',
      shrine.status === 'shelved' ? 'Shelved' : '',
      uncommitted ? 'Cleared, not committed yet' : '',
    ]
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
  class:camp
  class:cairn
  class:uncommitted
  class:selected
  transform="translate({shrine.xy[0]},{shrine.xy[1]}) scale({scale})"
  style:--c={colour}
  role="button"
  tabindex="0"
  aria-label="{name}, {regionName}, {shrine.visibility === 'revealed' ? shrine.status.replace('-', ' ') : 'seen from afar'}"
  aria-pressed={selected}
  onclick={() => onselect?.(shrine.id)}
  {onkeydown}
>
  <title>{tooltip}</title>
  {#if selected}<circle class="select-ring" r={halo + 3} />{/if}
  {#if uncommitted}<circle class="pending" r={halo} />{/if}
  {#if shrine.layer === 'depths' && state === 'silhouette'}
    <!-- A glow: something down here, lit faintly from above (§6.4) -->
    <circle class="glow-point" r="2.6" />
  {:else if shrine.layer === 'depths'}
    <!-- Wellspring: starburst -->
    <polygon
      class="wellspring"
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
  {#if shrine.marks.chasm}
    <!-- Chasm: an opening beside a shrine whose wellspring glows below (§6.4) -->
    <path class="chasm" d="M-13.5,6.5 C-11.5,4.6 -8.5,4.4 -6.5,6.2 C-8.6,7.6 -11.4,7.8 -13.5,6.5 Z" />
  {/if}
  {#if shrine.marks.draft && state !== 'silhouette'}
    <!-- Updraft: a launch point to a sky shrine (§6.3) -->
    <path class="draft" d="M-13,-6 l2.2,-2.4 l2.2,2.4 M-13,-10 l2.2,-2.4 l2.2,2.4" />
  {/if}
  {#if camp && embers}
    <!-- Embers: the camp's fire burnt low after 14 untouched days -->
    <g class="embers" transform="translate(7.5,-6)">
      <ellipse class="ember-bed" rx="4.6" ry="1.8" cy="1.6" />
      <circle class="ember" cx="-2" cy="0.4" r="1.3" />
      <circle class="ember" cx="1.2" cy="-0.2" r="1.5" />
      <circle class="ember" cx="3" cy="1" r="1" />
    </g>
  {:else if camp}
    <!-- Camp: a small flame that fades over 14 days since it was last touched -->
    <g class="flame" transform="translate(7.5,-8.5) scale(0.85)" style:opacity={flame}>
      <path class="flame-outer" d="M0,-8 C3.8,-4.4 5.2,-1.6 5.2,1.4 C5.2,4.4 2.9,6.4 0,6.4 C-2.9,6.4 -5.2,4.4 -5.2,1.4 C-5.2,-1.2 -3.4,-2.8 -2.3,-5.2 C-1.7,-3.2 -0.9,-2.4 -0.2,-2.2 C0.3,-4 0.3,-6 0,-8 Z" />
      <path class="flame-inner" d="M0.2,-1.6 C2,0.2 2.7,1.6 2.7,2.9 C2.7,4.3 1.5,5.2 0,5.2 C-1.5,5.2 -2.7,4.3 -2.7,2.9 C-2.7,1.5 -1.6,0.6 -1,-0.6 C-0.6,0.4 -0.1,0.6 0.2,-1.6 Z" />
    </g>
  {:else if cairn}
    <!-- Cairn: started work you stepped away from (three stacked stones) -->
    <g class="cairn-stones" transform="translate(8,-6)">
      <ellipse rx="4.2" ry="1.9" cy="3" />
      <ellipse rx="3.2" ry="1.6" cy="0" />
      <ellipse rx="2.1" ry="1.3" cy="-2.6" />
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
  .ember-bed {
    fill: #3a2a1c;
    opacity: 0.6;
  }
  .ember {
    fill: #e2572b;
    stroke: #ffb347;
    stroke-width: 0.4;
  }
  .cairn-stones ellipse {
    fill: #a39c90;
    stroke: #4d463c;
    stroke-width: 0.7;
  }
  .sky .cairn-stones ellipse {
    stroke: var(--sky-ink);
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

  /* Depths: glows are faint points; revealed wellsprings are dim until cleared, then bright nodes (§9.3) */
  .wellspring {
    fill: var(--c, #fff);
    stroke: rgba(255, 255, 255, 0.7);
    stroke-width: 0.6;
  }
  .depths.revealed .wellspring {
    fill-opacity: 0.45;
  }
  .depths.cleared .wellspring {
    stroke: #fff;
    stroke-width: 1;
    filter: drop-shadow(0 0 3px var(--c, #fff));
  }
  .glow-point {
    fill: var(--c, #fff);
    opacity: 0.85;
  }

  /* Surface markers */
  .chasm {
    fill: #2b2216;
    opacity: 0.55;
  }
  .draft {
    fill: none;
    stroke: var(--sky-ink);
    stroke-width: 1.2;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: 0.8;
  }

  .glyph:hover .body,
  .glyph:hover .ring,
  .glyph:hover .wellspring,
  .glyph:focus-visible .body,
  .glyph:focus-visible .ring,
  .glyph:focus-visible .wellspring {
    stroke: var(--ui-accent);
    stroke-width: 2.2;
  }
</style>
