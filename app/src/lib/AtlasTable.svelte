<script lang="ts">
  import type { MapData, MapShrine } from '@stratum/core/mapdata';

  /**
   * Atlas mode's table (§9.5): every shrine, hidden ones included, for reviewing and editing the world. `map` is the real
   * map.json (not the atlas view), so the Seen column shows what the map shows today.
   */
  let { map, onpick }: { map: MapData; onpick: (id: string) => void } = $props();

  type Key = 'title' | 'layer' | 'region' | 'theme' | 'kind' | 'p' | 'size' | 'status' | 'visibility' | 'requires';
  const COLUMNS: { key: Key; label: string; numeric?: boolean }[] = [
    { key: 'title', label: 'Shrine' },
    { key: 'layer', label: 'Layer' },
    { key: 'region', label: 'Region' },
    { key: 'theme', label: 'Theme' },
    { key: 'kind', label: 'Kind' },
    { key: 'p', label: 'p', numeric: true },
    { key: 'size', label: 'Size' },
    { key: 'requires', label: 'Requires' },
    { key: 'status', label: 'Status' },
    { key: 'visibility', label: 'Seen' },
  ];
  const LAYER_RANK = { sky: 0, surface: 1, depths: 2 };
  const SIZE_RANK = { S: 0, M: 1, L: 2 };

  let sortKey = $state<Key>('layer');
  let ascending = $state(true);
  let filter = $state('');

  const regionName = $derived(new Map(map.regions.map((r) => [r.id, r.name])));
  const cell = (s: MapShrine, k: Key): string =>
    k === 'region' ? (regionName.get(s.region) ?? s.region) : k === 'requires' ? s.requires.join(', ') : k === 'theme' ? (s.theme ?? '') : String(s[k]);
  const rank = (s: MapShrine, k: Key): number | string =>
    k === 'p' ? s.p : k === 'layer' ? LAYER_RANK[s.layer] : k === 'size' ? SIZE_RANK[s.size] : cell(s, k).toLowerCase();

  const rows = $derived.by(() => {
    const q = filter.trim().toLowerCase();
    const list = q ? map.shrines.filter((s) => [s.id, s.title, cell(s, 'region'), s.theme ?? '', s.prompt].join(' ').toLowerCase().includes(q)) : map.shrines;
    const dir = ascending ? 1 : -1;
    // Ties fall back to layer, region and file order, so the table reads like the world file.
    return [...list].sort((a, b) => {
      const x = rank(a, sortKey);
      const y = rank(b, sortKey);
      if (x !== y) return (x < y ? -1 : 1) * dir;
      return LAYER_RANK[a.layer] - LAYER_RANK[b.layer] || cell(a, 'region').localeCompare(cell(b, 'region'));
    });
  });

  function sortBy(k: Key) {
    if (sortKey === k) ascending = !ascending;
    else {
      sortKey = k;
      ascending = k !== 'p';
    }
  }
</script>

<section class="atlas-table" aria-label="Atlas: every shrine">
  <div class="bar">
    <input type="search" bind:value={filter} placeholder="Filter by id, title, region, theme or prompt" aria-label="Filter the atlas" />
    <span class="count">{rows.length} of {map.shrines.length}</span>
  </div>
  <div class="scroll">
    <table>
      <thead>
        <tr>
          {#each COLUMNS as c (c.key)}
            <th scope="col" aria-sort={sortKey === c.key ? (ascending ? 'ascending' : 'descending') : 'none'} class:numeric={c.numeric}>
              <button onclick={() => sortBy(c.key)}>
                {c.label}{#if sortKey === c.key}<span aria-hidden="true">{ascending ? ' ▲' : ' ▼'}</span>{/if}
              </button>
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each rows as s (s.id)}
          <tr class="{s.status} seen-{s.visibility}">
            <td>
              <button class="name" onclick={() => onpick(s.id)} title="Show on the map">{s.title}</button>
              <code>{s.id}</code>
            </td>
            {#each COLUMNS.slice(1) as c (c.key)}
              <td class:numeric={c.numeric}>{cell(s, c.key)}</td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</section>

<style>
  .atlas-table {
    position: absolute;
    inset: 0;
    display: grid;
    grid-template-rows: auto 1fr;
    background: var(--ui-bg);
    color: var(--ui-fg);
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    border-bottom: 1px solid var(--ui-border);
  }
  .bar input {
    flex: 1;
    max-width: 420px;
    padding: 6px 12px;
    border: 1px solid var(--ui-border);
    border-radius: 999px;
    background: transparent;
    color: var(--ui-fg);
    font: 13px var(--font-ui);
  }
  .count {
    color: var(--ui-muted);
    font-size: 12px;
  }
  .scroll {
    overflow: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  th {
    position: sticky;
    top: 0;
    padding: 0;
    background: var(--ui-bg);
    border-bottom: 1px solid var(--ui-border);
    text-align: left;
    white-space: nowrap;
  }
  th button {
    width: 100%;
    padding: 8px 10px;
    border: 0;
    background: transparent;
    color: var(--ui-muted);
    font: 600 12px var(--font-ui);
    text-align: inherit;
    cursor: pointer;
  }
  th button:hover,
  th[aria-sort='ascending'] button,
  th[aria-sort='descending'] button {
    color: var(--ui-fg);
  }
  td {
    padding: 6px 10px;
    border-bottom: 1px solid color-mix(in srgb, var(--ui-border) 60%, transparent);
    vertical-align: top;
  }
  .numeric {
    text-align: right;
  }
  .name {
    display: block;
    padding: 0;
    border: 0;
    background: none;
    color: var(--ui-fg);
    font: 500 15px var(--font-map);
    text-align: left;
    cursor: pointer;
  }
  .name:hover {
    color: var(--ui-accent);
    text-decoration: underline;
  }
  code {
    color: var(--ui-muted);
    font: 11px var(--font-mono);
  }
  tr.seen-hidden td {
    color: var(--ui-muted);
  }
  tr.cleared .name::before {
    content: '◆ ';
    color: var(--ui-accent);
  }
  button:focus-visible,
  input:focus-visible {
    outline: 2px solid var(--ui-accent);
    outline-offset: -2px;
  }
</style>
