<script lang="ts">
  import type { MapData } from '@stratum/core/mapdata';
  import { regionOf } from './names.ts';

  let { map, onpick }: { map: MapData; onpick: (id: string) => void } = $props();

  const LAYER_NAME = { sky: 'Sky', surface: 'Surface', depths: 'Depths' } as const;
  const MAX = 8;

  let query = $state('');
  let open = $state(false);
  let active = $state(0);
  let input: HTMLInputElement;

  const regionName = $derived(new Map(map.regions.map((r) => [r.id, r.name])));
  /** §6.5: core decides what's searchable (`search` is empty for anything search must not find). Titles first. */
  const results = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return map.shrines
      .filter((s) => s.search.includes(q))
      .sort((a, b) => Number(!a.title.toLowerCase().includes(q)) - Number(!b.title.toLowerCase().includes(q)) || a.title.localeCompare(b.title))
      .slice(0, MAX);
  });

  function pick(id: string) {
    onpick(id);
    query = '';
    open = false;
    input.blur();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      active = Math.min(active + 1, results.length - 1);
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      active = Math.max(active - 1, 0);
      e.preventDefault();
    } else if (e.key === 'Enter') {
      const hit = results[active];
      if (hit) pick(hit.id);
    } else if (e.key === 'Escape') {
      query = '';
      open = false;
      input.blur();
      e.stopPropagation();
    }
  }

  /** `/` jumps to the search box from anywhere on the map. */
  function onWindowKey(e: KeyboardEvent) {
    if (e.key !== '/' || e.metaKey || e.ctrlKey || (e.target as HTMLElement)?.closest('input, textarea')) return;
    e.preventDefault();
    input.focus();
  }
</script>

<svelte:window onkeydown={onWindowKey} />

<div class="search">
  <input
    bind:this={input}
    bind:value={query}
    type="search"
    placeholder="Search what you've seen  /"
    aria-label="Search shrines you've seen"
    role="combobox"
    aria-expanded={open && results.length > 0}
    aria-controls="search-results"
    aria-autocomplete="list"
    aria-activedescendant={open && results[active] ? `result-${results[active]!.id}` : undefined}
    oninput={() => ((open = true), (active = 0))}
    onfocus={() => (open = true)}
    onblur={() => setTimeout(() => (open = false), 120)}
    onkeydown={onKey}
  />
  {#if open && query.trim().length >= 2}
    <ul id="search-results" role="listbox" aria-label="Search results">
      {#each results as s, i (s.id)}
        <li
          id="result-{s.id}"
          role="option"
          aria-selected={i === active}
          class:active={i === active}
          onpointerdown={(e) => (e.preventDefault(), pick(s.id))}
          onpointerenter={() => (active = i)}
        >
          <span class="title">{s.title}</span>
          <span class="where">{LAYER_NAME[s.layer]} · {regionOf(regionName, s)}{s.visibility === 'silhouette' ? ' · seen from afar' : ''}</span>
        </li>
      {:else}
        <li class="empty" role="presentation">Nothing you've seen matches.</li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .search {
    position: relative;
    width: min(280px, 100%);
  }
  input {
    width: 100%;
    padding: 6px 12px;
    border: 1px solid var(--ui-border);
    border-radius: 999px;
    background: transparent;
    color: var(--ui-fg);
    font: 13px var(--font-ui);
  }
  input::placeholder {
    color: var(--ui-muted);
  }
  input:focus-visible {
    outline: 2px solid var(--ui-accent);
    outline-offset: 1px;
  }
  ul {
    position: absolute;
    z-index: 20;
    top: calc(100% + 6px);
    left: 0;
    right: 0;
    margin: 0;
    padding: 4px;
    list-style: none;
    border: 1px solid var(--ui-border);
    border-radius: 10px;
    background: var(--ui-bg);
    box-shadow: 0 10px 30px rgba(20, 16, 12, 0.25);
  }
  li {
    display: grid;
    gap: 1px;
    padding: 6px 10px;
    border-radius: 6px;
    cursor: pointer;
  }
  li.active {
    background: color-mix(in srgb, var(--ui-accent) 18%, transparent);
  }
  .title {
    font-family: var(--font-map);
    font-size: 16px;
  }
  .where,
  .empty {
    color: var(--ui-muted);
    font-size: 12px;
  }
  .empty {
    cursor: default;
  }
</style>
