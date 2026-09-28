<script lang="ts">
  import type { HorizonCard, Layer, MapData } from '@stratum/core/mapdata';

  let {
    map,
    live,
    onselect,
    onsetout,
    onpin,
    collapsed = false,
    ontoggle,
  }: {
    map: MapData;
    live: boolean;
    /** Folded to a small tab so the map underneath is reachable (key H). */
    collapsed?: boolean;
    ontoggle: () => void;
    onselect: (id: string) => void;
    onsetout: (id: string) => void;
    onpin: (id: string | null) => void;
  } = $props();

  const SLOT = {
    thread: { name: 'The Thread', hint: 'continue nearby' },
    vertical: { name: 'The Vertical', hint: 'up or down a layer' },
    far: { name: 'The Far Landmark', hint: 'on the horizon' },
  } as const;
  const LAYER_NAME: Record<Layer, string> = { sky: 'Sky', surface: 'Surface', depths: 'Depths' };
  const WHY: Record<HorizonCard['rule'], string> = {
    campfire: 'your campfire',
    pin: 'on the way to your pin',
    nearest: 'nearest in sight',
    glow: 'glowing beneath a recent clear',
    sky: 'opened by a recent clear',
    above: 'directly above',
    'other-layer': 'nearest on another layer',
    landmark: 'a landmark far away',
    tower: 'an unclimbed tower',
    temple: 'a temple, now open',
  };

  const byId = $derived(new Map(map.shrines.map((s) => [s.id, s])));
  const regionName = $derived(new Map(map.regions.map((r) => [r.id, r.name])));
  const cards = $derived(map.horizon.map((c) => ({ card: c, shrine: byId.get(c.id)! })));
  const pinned = $derived(map.pin ? byId.get(map.pin) : undefined);
</script>

{#if collapsed}
  <button class="horizon-tab" onclick={ontoggle} title="Show the Horizon (key H)" aria-expanded="false">
    Horizon <span class="count">{cards.length}</span><kbd>H</kbd>
  </button>
{:else}
<aside class="horizon" aria-label="Horizon">
  <h2>
    Horizon <span class="week">{map.week}</span>
    <button class="fold" onclick={ontoggle} title="Fold away (key H)" aria-label="Fold the Horizon away" aria-expanded="true">‹</button>
  </h2>
  {#if !cards.length}
    <p class="empty">Nothing in sight to set out for.</p>
  {/if}
  {#each cards as { card, shrine } (card.slot)}
    {@const title = shrine.titleKnown ? shrine.title : '???'}
    <article class="card slot-{card.slot}" class:campfire={card.rule === 'campfire'}>
      <header>
        <span class="slot">{SLOT[card.slot].name}</span>
        <span class="why">{WHY[card.rule]}</span>
      </header>
      <button class="title" onclick={() => onselect(shrine.id)} title="Show details">{title}</button>
      <div class="meta">
        {LAYER_NAME[shrine.layer]} · {regionName.get(shrine.region) ?? shrine.region} · {shrine.size}
        {#each shrine.requires as r (r)}<span class="req">{r}</span>{/each}
      </div>
      {#if card.rule === 'campfire'}
        <p class="note">{shrine.campfire?.note ?? 'No NEXT.md note yet.'}</p>
      {:else if card.teaser}
        <p class="teaser">{card.teaser}</p>
      {/if}
      {#if card.bearing !== undefined}
        <div class="direction">
          <svg viewBox="-10 -10 20 20" width="18" height="18" aria-hidden="true">
            <g transform="rotate({card.bearing})"><path d="M0,-8 L4.5,5 L0,2.5 L-4.5,5 Z" /></g>
          </svg>
          {card.distance} away
        </div>
      {/if}
      <div class="actions">
        {#if shrine.status === 'in-progress'}
          <button class="primary" onclick={() => onselect(shrine.id)}>Continue</button>
        {:else}
          <button class="primary" onclick={() => onsetout(shrine.id)} title={live ? 'Run stratum start' : 'Copy the stratum start command'}>
            Set out
          </button>
        {/if}
        <button onclick={() => onpin(map.pin === shrine.id ? null : shrine.id)} aria-pressed={map.pin === shrine.id}>
          {map.pin === shrine.id ? 'Unpin' : 'Pin'}
        </button>
      </div>
    </article>
  {/each}
  {#if pinned}
    <div class="pinline">
      <span>Pinned: {pinned.titleKnown ? pinned.title : '???'}</span>
      <button onclick={() => onpin(null)}>Remove</button>
    </div>
  {/if}
  {#if !live}
    <p class="static-note">Static map: buttons copy the CLI command.</p>
  {/if}
</aside>
{/if}

<style>
  .horizon {
    position: absolute;
    top: 12px;
    left: 12px;
    max-height: calc(100% - 24px);
    width: 290px;
    overflow-y: auto;
    padding: 12px;
    border: 1px solid var(--ui-border);
    border-radius: 10px;
    background: var(--ui-panel);
    box-shadow: 0 6px 20px rgba(40, 30, 20, 0.08);
    backdrop-filter: blur(6px);
    color: var(--ui-fg);
  }
  .horizon-tab {
    position: absolute;
    top: 12px;
    left: 12px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 7px 12px;
    border: 1px solid var(--ui-border);
    border-radius: 999px;
    background: var(--ui-panel);
    box-shadow: 0 4px 12px rgba(40, 30, 20, 0.08);
    color: var(--ui-fg);
    font: 600 14px var(--font-map);
    cursor: pointer;
  }
  .horizon-tab .count {
    min-width: 18px;
    padding: 0 5px;
    border-radius: 999px;
    background: var(--ui-accent);
    color: var(--ui-bg);
    font: 600 11px var(--font-ui);
    text-align: center;
  }
  .horizon-tab kbd {
    font: 11px var(--font-mono);
    opacity: 0.6;
  }
  .fold {
    margin-left: auto;
    padding: 0 6px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--ui-muted);
    font: 20px var(--font-ui);
    line-height: 1;
    cursor: pointer;
  }
  .fold:hover {
    background: var(--ui-border);
    color: var(--ui-fg);
  }
  h2 {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin: 0 0 10px;
    font-family: var(--font-map);
    font-size: 20px;
    font-weight: 600;
  }
  .week {
    color: var(--ui-muted);
    font: 11px var(--font-mono);
  }
  .empty,
  .static-note {
    margin: 8px 0 0;
    color: var(--ui-muted);
    font-size: 12px;
  }
  .card {
    padding: 10px 12px;
    border: 1px solid var(--ui-border);
    border-radius: 8px;
    background: var(--ui-bg);
  }
  .card + .card {
    margin-top: 8px;
  }
  .card.campfire {
    border-color: #e2572b;
  }
  .card header {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    font-size: 11px;
  }
  .slot {
    color: var(--ui-accent);
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .why {
    color: var(--ui-muted);
    text-align: right;
  }
  .title {
    display: block;
    margin: 4px 0 2px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--ui-fg);
    font-family: var(--font-map);
    font-size: 18px;
    font-weight: 600;
    line-height: 1.2;
    text-align: left;
    cursor: pointer;
  }
  .title:hover {
    color: var(--ui-accent);
  }
  .meta {
    color: var(--ui-muted);
    font-size: 12px;
  }
  .req {
    margin-left: 6px;
    padding: 0 6px;
    border: 1px dashed var(--ui-border);
    border-radius: 999px;
    font-size: 11px;
  }
  .teaser,
  .note {
    margin: 6px 0 0;
    font-size: 13px;
    line-height: 1.4;
  }
  .note {
    font-style: italic;
  }
  .direction {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 6px;
    color: var(--ui-muted);
    font-size: 12px;
  }
  .direction path {
    fill: var(--ui-accent);
  }
  .actions {
    display: flex;
    gap: 6px;
    margin-top: 10px;
  }
  .actions button,
  .pinline button {
    padding: 4px 12px;
    border: 1px solid var(--ui-border);
    border-radius: 6px;
    background: transparent;
    color: var(--ui-fg);
    font: 500 12px var(--font-ui);
    cursor: pointer;
  }
  .actions button.primary {
    border-color: var(--ui-accent);
    background: var(--ui-accent);
    color: var(--ui-bg);
  }
  .actions button[aria-pressed='true'] {
    border-color: var(--ui-accent);
    color: var(--ui-accent);
  }
  button:focus-visible {
    outline: 2px solid var(--ui-accent);
    outline-offset: 1px;
  }
  .pinline {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-top: 10px;
    color: var(--ui-muted);
    font-size: 12px;
  }
</style>
