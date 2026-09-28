<script lang="ts">
  import { onMount } from 'svelte';
  import type { Layer, MapData } from '@stratum/core/mapdata';
  import DetailPanel from './lib/DetailPanel.svelte';
  import MapView from './lib/MapView.svelte';

  const LAYER_ORDER: { id: Layer; label: string; key: string }[] = [
    { id: 'sky', label: 'Sky', key: '1' },
    { id: 'surface', label: 'Surface', key: '2' },
    { id: 'depths', label: 'Depths', key: '3' },
  ];

  let map = $state<MapData | null>(null);
  let error = $state<string | null>(null);
  const params = new URLSearchParams(location.search);
  const initialLayer = params.get('layer');
  const initialZoom = Number(params.get('zoom')) || 1;
  let layer = $state<Layer>(LAYER_ORDER.some((l) => l.id === initialLayer) ? (initialLayer as Layer) : 'surface');
  /** `?select=<id>` opens the detail panel on load (handy for links and screenshots). */
  let selectedId = $state<string | null>(params.get('select'));
  const selected = $derived(map?.shrines.find((s) => s.id === selectedId && s.visibility !== 'hidden') ?? null);
  const counts = $derived({
    cleared: map?.shrines.filter((s) => s.status === 'cleared').length ?? 0,
    campfires: map?.shrines.filter((s) => s.status === 'in-progress').length ?? 0,
    inSight: map?.shrines.filter((s) => s.visibility !== 'hidden').length ?? 0,
  });

  /** Select a shrine (or close the panel). Following a chip to another layer switches layers. */
  function select(id: string | null) {
    selectedId = id;
    const s = id ? map?.shrines.find((x) => x.id === id) : null;
    if (s && s.layer !== layer) layer = s.layer;
  }

  async function load() {
    try {
      const res = await fetch('/map.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(await res.text());
      map = await res.json();
      error = null;
      const s = selectedId ? map?.shrines.find((x) => x.id === selectedId) : null;
      if (s && !params.get('layer')) layer = s.layer;
    } catch (e) {
      error = (e as Error).message;
    }
  }

  function onKey(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape' && selectedId) {
      selectedId = null;
      return;
    }
    if ((e.target as HTMLElement)?.closest('input, textarea')) return;
    const hit = LAYER_ORDER.find((l) => l.key === e.key);
    if (hit) layer = hit.id;
  }

  onMount(load);
</script>

<svelte:window onkeydown={onKey} />

<div class="shell">
  <header class="topbar">
    <h1>Stratum</h1>
    <div class="layers" role="radiogroup" aria-label="Map layer">
      {#each LAYER_ORDER as l (l.id)}
        <button
          role="radio"
          aria-checked={layer === l.id}
          class:active={layer === l.id}
          onclick={() => (layer = l.id)}
          title="{l.label} (key {l.key})"
        >
          {l.label}<kbd>{l.key}</kbd>
        </button>
      {/each}
    </div>
    <div class="spacer"></div>
    {#if map}
      <span class="readout">
        {counts.cleared} cleared · {counts.campfires} campfire{counts.campfires === 1 ? '' : 's'} ·
        {counts.inSight} of {map.shrines.length} in sight
      </span>
    {/if}
  </header>

  <main class="stage">
    {#if error}
      <div class="message">
        <p>Couldn't load the map.</p>
        <pre>{error}</pre>
      </div>
    {:else if map}
      <MapView {map} {layer} {initialZoom} selected={selected?.id ?? null} onselect={select} />
      {#if selected}
        <DetailPanel shrine={selected} {map} onselect={select} onclose={() => (selectedId = null)} />
      {/if}
    {:else}
      <div class="message"><p>Loading map…</p></div>
    {/if}
  </main>
</div>

<style>
  .shell {
    display: grid;
    grid-template-rows: auto 1fr;
    height: 100%;
  }
  .topbar {
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 10px 18px;
    border-bottom: 1px solid var(--ui-border);
    background: var(--ui-bg);
  }
  h1 {
    margin: 0;
    font-family: var(--font-map);
    font-size: 24px;
    font-weight: 600;
    letter-spacing: 0.06em;
  }
  .layers {
    display: inline-flex;
    padding: 3px;
    border: 1px solid var(--ui-border);
    border-radius: 999px;
    gap: 2px;
  }
  .layers button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 14px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--ui-muted);
    font: 500 13px var(--font-ui);
    cursor: pointer;
  }
  .layers button:hover {
    color: var(--ui-fg);
  }
  .layers button.active {
    background: var(--ui-fg);
    color: var(--ui-bg);
  }
  .layers button:focus-visible {
    outline: 2px solid var(--ui-accent);
    outline-offset: 1px;
  }
  kbd {
    font: 11px var(--font-mono);
    opacity: 0.6;
  }
  .spacer {
    flex: 1;
  }
  .readout {
    color: var(--ui-muted);
    font-size: 12px;
  }
  .stage {
    position: relative;
    overflow: hidden;
    min-height: 0;
  }
  .message {
    padding: 40px;
    color: var(--ui-muted);
  }
  pre {
    font-family: var(--font-mono);
    white-space: pre-wrap;
  }
</style>
