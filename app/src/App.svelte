<script lang="ts">
  import { onMount } from 'svelte';
  import type { Layer, MapData } from '@stratum/core/mapdata';
  import { apiAvailable, post, subscribe } from './lib/api.ts';
  import { atlasView } from './lib/atlas.ts';
  import AtlasTable from './lib/AtlasTable.svelte';
  import DetailPanel from './lib/DetailPanel.svelte';
  import HorizonPanel from './lib/HorizonPanel.svelte';
  import MapKey from './lib/MapKey.svelte';
  import MapView from './lib/MapView.svelte';
  import SearchBox from './lib/SearchBox.svelte';

  const LAYER_ORDER: { id: Layer; label: string; key: string }[] = [
    { id: 'sky', label: 'Sky', key: '1' },
    { id: 'surface', label: 'Surface', key: '2' },
    { id: 'depths', label: 'Depths', key: '3' },
  ];

  /** map.json as built, with the triangle rule applied. */
  let built = $state<MapData | null>(null);
  let error = $state<string | null>(null);
  const params = new URLSearchParams(location.search);
  const initialLayer = params.get('layer');
  const initialZoom = Number(params.get('zoom')) || 1;
  let layer = $state<Layer>(LAYER_ORDER.some((l) => l.id === initialLayer) ? (initialLayer as Layer) : 'surface');
  /** Atlas mode (§9.5): everything revealed. `?atlas=1` or the A key, always behind a spoiler warning. */
  let atlas = $state(false);
  let atlasAsk = $state(params.get('atlas') === '1');
  const map = $derived(built && atlas ? atlasView(built) : built);

  /** Atlas mode shows the map with everything revealed, or the table of every shrine (§9.5). */
  let atlasTable = $state(false);

  function setAtlas(on: boolean) {
    atlas = on;
    if (!on) atlasTable = false;
    atlasAsk = false;
    const url = new URL(location.href);
    if (on) url.searchParams.set('atlas', '1');
    else url.searchParams.delete('atlas');
    history.replaceState(null, '', url);
  }
  function toggleAtlas() {
    if (atlas) setAtlas(false);
    else atlasAsk = true;
  }

  /** `?select=<id>` opens the detail panel on load (handy for links and screenshots). */
  let selectedId = $state<string | null>(params.get('select'));
  const selected = $derived(map?.shrines.find((s) => s.id === selectedId && s.visibility !== 'hidden') ?? null);
  const counts = $derived({
    cleared: map?.shrines.filter((s) => s.status === 'cleared').length ?? 0,
    started: map?.shrines.filter((s) => s.status === 'in-progress').length ?? 0,
    inSight: map?.shrines.filter((s) => s.visibility !== 'hidden').length ?? 0,
  });
  /** §10.2: the global completion, in small text only. */
  const completion = $derived(built ? Math.round((1000 * counts.cleared) / built.shrines.length) / 10 : 0);

  /** Search asks the map to centre a shrine; the counter makes a repeat search for the same shrine move the map again. */
  let focus = $state<{ id: string; n: number } | null>(null);
  function find(id: string) {
    select(id);
    focus = { id, n: (focus?.n ?? 0) + 1 };
  }

  /** True under `stratum dev`: Set out and Pin call the API. Otherwise they copy the CLI command (§11). */
  let live = $state(false);
  /** The Horizon panel folds to a tab (key H). In memory only: nothing is kept in the browser. */
  let horizonCollapsed = $state(false);
  /** The map key (key K), closed by default. */
  let keyOpen = $state(false);
  let toast = $state<string | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  function say(message: string) {
    toast = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = null), 4000);
  }
  async function copyCommand(cmd: string) {
    try {
      await navigator.clipboard.writeText(cmd);
      say(`Copied: ${cmd}`);
    } catch {
      say(`Run: ${cmd}`);
    }
  }

  async function setOut(id: string) {
    if (!live) return copyCommand(`stratum start ${id}`);
    const res = await post('/api/start', { id });
    if (!res.ok) return say(`Can't set out: ${res.error}`);
    say(`Camp is at ${map?.shrines.find((s) => s.id === id)?.title ?? id} now.`);
    await load();
    selectedId = id;
  }

  async function shelve(id: string) {
    if (!live) return copyCommand(`stratum shelve ${id}`);
    const res = await post('/api/shelve', { id });
    if (!res.ok) return say(`Can't shelve: ${res.error}`);
    say('Shelved. Setting out again takes it off the shelf.');
    await load();
  }

  async function pin(id: string | null) {
    if (!live) return copyCommand(id ? `stratum pin ${id}` : 'stratum pin --clear');
    const res = await post('/api/pin', { id });
    if (!res.ok) return say(`Can't pin: ${res.error}`);
    await load();
  }

  /** Select a shrine (or close the panel). Following a chip to another layer switches layers. */
  function select(id: string | null) {
    selectedId = id;
    const s = id ? map?.shrines.find((x) => x.id === id) : null;
    if (s && s.layer !== layer) layer = s.layer;
  }

  async function load() {
    try {
      const res = await fetch('map.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(await res.text());
      built = await res.json();
      error = null;
      const s = selectedId ? built?.shrines.find((x) => x.id === selectedId) : null;
      if (s && !params.get('layer')) layer = s.layer;
    } catch (e) {
      error = (e as Error).message;
    }
  }

  function onKey(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape' && atlasAsk) {
      atlasAsk = false;
      return;
    }
    if (e.key === 'Escape' && selectedId) {
      selectedId = null;
      return;
    }
    if ((e.target as HTMLElement)?.closest('input, textarea')) return;
    if (e.key === 'a' || e.key === 'A') {
      toggleAtlas();
      return;
    }
    if ((e.key === 't' || e.key === 'T') && atlas) {
      atlasTable = !atlasTable;
      return;
    }
    if (e.key === 'h' || e.key === 'H') {
      horizonCollapsed = !horizonCollapsed;
      return;
    }
    if (e.key === 'k' || e.key === 'K') {
      keyOpen = !keyOpen;
      return;
    }
    const hit = LAYER_ORDER.find((l) => l.key === e.key);
    if (hit) layer = hit.id;
  }

  onMount(() => {
    let unsubscribe = () => {};
    load().then(async () => {
      live = await apiAvailable();
      if (live) {
        unsubscribe = subscribe((buildError) => {
          if (buildError) say(`Build failed; showing the last good map. ${buildError.split('\n')[0]}`);
          else load();
        });
      }
    });
    return () => unsubscribe();
  });
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
    {#if map}
      <SearchBox {map} onpick={find} />
    {/if}
    <div class="spacer"></div>
    {#if built}
      <span class="readout">
        {completion}% of the world<span class="long">&nbsp;· {counts.cleared} cleared · {counts.started} in progress</span> ·
        {atlas ? `atlas: all ${built.shrines.length} shown` : `${counts.inSight} of ${built.shrines.length} in sight`}
      </span>
      {#if atlas}
        <div class="layers" role="radiogroup" aria-label="Atlas view">
          <button role="radio" aria-checked={!atlasTable} class:active={!atlasTable} onclick={() => (atlasTable = false)}>Map</button>
          <button role="radio" aria-checked={atlasTable} class:active={atlasTable} onclick={() => (atlasTable = true)} title="Every shrine as a table (key T)">
            Table<kbd>T</kbd>
          </button>
        </div>
      {/if}
      <button class="atlas-toggle" class:active={atlas} aria-pressed={atlas} onclick={toggleAtlas} title="Atlas mode: reveal everything (key A)">
        Atlas<kbd>A</kbd>
      </button>
    {/if}
  </header>

  <main class="stage">
    {#if error}
      <div class="message">
        <p>Couldn't load the map.</p>
        <pre>{error}</pre>
      </div>
    {:else if map}
      <MapView {map} {layer} {initialZoom} {atlas} {focus} selected={selected?.id ?? null} onselect={select} />
      {#if !atlas}
        <HorizonPanel
          {map}
          {live}
          collapsed={horizonCollapsed}
          ontoggle={() => (horizonCollapsed = !horizonCollapsed)}
          onselect={select}
          onsetout={setOut}
          onpin={pin}
        />
      {/if}
      <MapKey open={keyOpen} ontoggle={() => (keyOpen = !keyOpen)} />
      {#if atlas && atlasTable && built}
        <AtlasTable map={built} onpick={(id) => ((atlasTable = false), find(id))} />
      {/if}
      {#if selected && !(atlas && atlasTable)}
        <DetailPanel shrine={selected} {map} {live} onselect={select} onclose={() => (selectedId = null)} onsetout={setOut} onpin={pin} onshelve={shelve} />
      {/if}
    {:else}
      <div class="message"><p>Loading map…</p></div>
    {/if}
    {#if toast}
      <div class="toast" role="status">{toast}</div>
    {/if}
    {#if atlasAsk && built}
      <div class="spoiler" role="dialog" aria-modal="true" aria-labelledby="spoiler-title">
        <div class="spoiler-card">
          <h2 id="spoiler-title">Open the atlas?</h2>
          <p>
            The atlas shows every shrine, including the ones you haven't seen yet: all the terrain, no darkness, every prompt,
            on the map or as a table (key T). It's for reviewing and editing the world. Your progress doesn't change, and pressing A again takes you back.
          </p>
          <div class="spoiler-actions">
            <button onclick={() => (atlasAsk = false)}>Keep exploring</button>
            <button class="primary" onclick={() => setAtlas(true)}>Show everything</button>
          </div>
        </div>
      </div>
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
  .toast {
    position: absolute;
    left: 50%;
    bottom: 18px;
    max-width: min(560px, 90%);
    padding: 8px 14px;
    border-radius: 8px;
    background: var(--ui-fg);
    color: var(--ui-bg);
    font-size: 13px;
    transform: translateX(-50%);
    box-shadow: 0 6px 18px rgba(20, 16, 12, 0.25);
  }
  .atlas-toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    border: 1px solid var(--ui-border);
    border-radius: 999px;
    background: transparent;
    color: var(--ui-muted);
    font: 500 13px var(--font-ui);
    cursor: pointer;
  }
  .atlas-toggle:hover {
    color: var(--ui-fg);
  }
  .atlas-toggle.active {
    border-color: var(--ui-accent);
    background: var(--ui-accent);
    color: var(--ui-bg);
  }
  .atlas-toggle:focus-visible,
  .spoiler button:focus-visible {
    outline: 2px solid var(--ui-accent);
    outline-offset: 1px;
  }
  .spoiler {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgba(20, 16, 12, 0.35);
  }
  .spoiler-card {
    max-width: 420px;
    padding: 20px 22px;
    border: 1px solid var(--ui-border);
    border-radius: 10px;
    background: var(--ui-bg);
    box-shadow: 0 12px 40px rgba(20, 16, 12, 0.25);
  }
  .spoiler-card h2 {
    margin: 0 0 8px;
    font-family: var(--font-map);
    font-size: 22px;
  }
  .spoiler-card p {
    margin: 0;
    color: var(--ui-muted);
    line-height: 1.5;
  }
  .spoiler-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
  }
  .spoiler button {
    padding: 6px 14px;
    border: 1px solid var(--ui-border);
    border-radius: 6px;
    background: transparent;
    color: var(--ui-fg);
    font: 500 13px var(--font-ui);
    cursor: pointer;
  }
  .spoiler button.primary {
    border-color: var(--ui-accent);
    background: var(--ui-accent);
    color: var(--ui-bg);
  }
  .readout {
    color: var(--ui-muted);
    font-size: 12px;
    white-space: nowrap;
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

  /* Narrow screens: the top bar wraps, with search on its own row; the long readout shrinks to the essentials. */
  @media (max-width: 640px) {
    .topbar {
      flex-wrap: wrap;
      gap: 8px 10px;
      padding: 8px 12px;
    }
    h1 {
      font-size: 20px;
    }
    .layers button {
      padding: 5px 10px;
    }
    .layers kbd,
    .atlas-toggle kbd,
    .readout .long {
      display: none;
    }
    .topbar :global(.search) {
      order: 10;
      width: 100%;
    }
  }
</style>
