<script lang="ts">
  import type { Layer, MapData, MapShrine } from '@stratum/core/mapdata';
  import { renderInline, renderMarkdown } from './markdown.ts';

  let {
    shrine,
    map,
    onselect,
    onclose,
  }: { shrine: MapShrine; map: MapData; onselect: (id: string) => void; onclose: () => void } = $props();

  const LAYER_NAME: Record<Layer, string> = { sky: 'Sky', surface: 'Surface', depths: 'Depths' };
  const LAYER_RANK: Record<Layer, number> = { sky: 0, surface: 1, depths: 2 };
  const TIMEBOX = { S: '2–3h', M: '4–6h', L: '8–12h' } as const;

  const byId = $derived(new Map(map.shrines.map((s) => [s.id, s])));
  const regionName = $derived(new Map(map.regions.map((r) => [r.id, r.name])));

  /** Clickable relations (§9.1): above/below, launch points, links, needs, follow-ups, proposer. */
  const relations = $derived.by(() => {
    const id = shrine.id;
    const others = (ids: Iterable<string>) => [...new Set(ids)].filter((x) => x !== id && byId.has(x)).map((x) => byId.get(x)!);
    // Links are undirected for visibility, so show both directions.
    const linked = others([...shrine.links, ...map.shrines.filter((s) => s.links.includes(id)).map((s) => s.id)]);
    const up = linked.filter((s) => LAYER_RANK[s.layer] < LAYER_RANK[shrine.layer]);
    const down = linked.filter((s) => LAYER_RANK[s.layer] > LAYER_RANK[shrine.layer]);
    const groups: { label: string; items: MapShrine[] }[] = [
      { label: 'Above', items: others(shrine.below ? [shrine.below] : []) },
      { label: 'Below', items: others(map.shrines.filter((s) => s.below === id).map((s) => s.id)) },
      { label: shrine.layer === 'sky' ? 'Launch points' : 'Up to the sky', items: up },
      { label: shrine.layer === 'surface' ? 'Down to the depths' : 'Down', items: down },
      { label: 'Links', items: linked.filter((s) => s.layer === shrine.layer) },
      { label: 'Needs', items: others(shrine.needs) },
      { label: 'Needed by', items: others(map.shrines.filter((s) => s.needs.includes(id)).map((s) => s.id)) },
      { label: 'Follows', items: others(shrine.after) },
      { label: 'Followed by', items: others(map.shrines.filter((s) => s.after.includes(id)).map((s) => s.id)) },
      { label: 'Proposed by', items: others(shrine.from ? [shrine.from] : []) },
    ];
    return groups.filter((g) => g.items.length);
  });

  const statusText = $derived(
    shrine.status === 'cleared'
      ? `Cleared${shrine.clearedAt ? ` ${shrine.clearedAt}` : ''}`
      : shrine.status === 'in-progress'
        ? `In progress${shrine.startedAt ? ` since ${shrine.startedAt}` : ''}`
        : 'Untouched',
  );
  const command = $derived(
    shrine.status === 'untouched' ? `stratum start ${shrine.id}` : shrine.status === 'in-progress' ? `stratum clear ${shrine.id}` : null,
  );
  const workPath = $derived(`work/${shrine.id}/`);
  const writeupHtml = $derived(shrine.status === 'cleared' && shrine.writeup ? renderMarkdown(shrine.writeup) : null);

  let copied = $state<string | null>(null);
  let copyTimer: ReturnType<typeof setTimeout> | undefined;
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      copied = text;
    } catch {
      copied = null;
    }
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => (copied = null), 1500);
  }

  /** A silhouette shows its glyph, size and region, not its prompt; its title only if p is high enough (§6.2). */
  const seen = $derived(shrine.visibility === 'revealed');
  /** From afar you learn nothing about connections, except a sealed temple's trail (its constellation, §5.2). */
  const shownRelations = $derived(seen ? relations : shrine.kind === 'temple' ? relations.filter((g) => g.label === 'Needs') : []);
  const chipLabel = (s: MapShrine) => (s.visibility !== 'hidden' && s.titleKnown ? s.title : '???');
</script>

<aside class="panel" aria-label="Shrine details">
  <header>
    <div class="eyebrow">
      {LAYER_NAME[shrine.layer]} · {regionName.get(shrine.region) ?? shrine.region}{shrine.theme ? ` · ${shrine.theme}` : ''}
    </div>
    <h2>{shrine.titleKnown ? shrine.title : '???'}</h2>
    <button class="close" onclick={onclose} aria-label="Close details" title="Close (Esc)">×</button>
    <div class="tags">
      {#if shrine.kind !== 'shrine'}<span class="tag kind">{shrine.kind}</span>{/if}
      <span class="tag" title="Timebox">{shrine.size} · {TIMEBOX[shrine.size]}</span>
      <span class="tag" title="Prominence">p{shrine.p}</span>
      {#each shrine.requires as r (r)}<span class="tag req">needs {r}</span>{/each}
    </div>
  </header>

  <section class="status status-{shrine.status}">
    <div class="status-line">
      <span class="dot"></span>
      <strong>{statusText}</strong>
      {#if shrine.status === 'cleared' && !shrine.committed}<span class="uncommitted">not committed yet</span>{/if}
    </div>
    {#if shrine.status === 'in-progress'}
      <p class="campfire-note">{shrine.campfire?.note ?? 'No NEXT.md note yet.'}</p>
    {/if}
    {#if shrine.hours !== undefined || shrine.touches.length || shrine.remnote}
    <ul class="facts">
      {#if shrine.hours !== undefined}<li>{shrine.hours}h</li>{/if}
      {#if shrine.touches.length}<li>{shrine.touches.length} commit{shrine.touches.length === 1 ? '' : 's'}</li>{/if}
      {#if shrine.remnote}<li>{shrine.remnote} flashcard link{shrine.remnote === 1 ? '' : 's'}</li>{/if}
    </ul>
    {/if}
  </section>

  {#if seen}
    <section>
      <h3>Build</h3>
      <p class="prose">{@html renderInline(shrine.prompt)}</p>
    </section>

    <section class="done">
      <h3>Done when</h3>
      <p class="prose">{@html renderInline(shrine.done)}</p>
    </section>
  {:else}
    <section class="afar">
      <p>
        {shrine.layer === 'depths' ? 'A faint glow in the dark.' : 'Seen from afar.'}
        {shrine.kind === 'temple' && shrine.needs.some((n) => byId.get(n)?.status !== 'cleared')
          ? 'The temple is sealed until its trail is cleared.'
          : 'Set out to find out what it asks.'}
      </p>
    </section>
  {/if}

  {#if shownRelations.length}
    <section>
      {#each shownRelations as g (g.label)}
        <div class="rel">
          <h4>{g.label}</h4>
          <div class="chips">
            {#each g.items as s (s.id)}
              <button
                class="chip {s.layer} {s.status}"
                disabled={s.visibility === 'hidden'}
                onclick={() => onselect(s.id)}
                title="{LAYER_NAME[s.layer]} · {regionName.get(s.region) ?? s.region}"
              >
                <span class="chip-dot"></span>{chipLabel(s)}
              </button>
            {/each}
          </div>
        </div>
      {/each}
    </section>
  {/if}

  <section class="work">
    <button class="copy" onclick={() => copy(workPath)} title="Copy the work folder path">
      <code>{workPath}</code><span>{copied === workPath ? 'Copied' : 'Copy path'}</span>
    </button>
    {#if command}
      <button class="copy" onclick={() => copy(command)} title="Copy the command">
        <code>{command}</code><span>{copied === command ? 'Copied' : 'Copy'}</span>
      </button>
    {/if}
  </section>

  {#if writeupHtml}
    <section class="writeup">
      <h3>Write-up</h3>
      <div class="markdown">{@html writeupHtml}</div>
    </section>
  {/if}
</aside>

<style>
  .panel {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(420px, 100%);
    overflow-y: auto;
    padding: 18px 20px 28px;
    background: var(--ui-panel);
    border-left: 1px solid var(--ui-border);
    box-shadow: -8px 0 24px rgba(40, 30, 20, 0.08);
    backdrop-filter: blur(6px);
    color: var(--ui-fg);
    line-height: 1.5;
  }
  header {
    position: relative;
    padding-right: 28px;
  }
  .eyebrow {
    color: var(--ui-muted);
    font-size: 12px;
    letter-spacing: 0.02em;
  }
  h2 {
    margin: 2px 0 8px;
    font-family: var(--font-map);
    font-size: 26px;
    font-weight: 600;
    line-height: 1.15;
  }
  .close {
    position: absolute;
    top: -4px;
    right: -6px;
    width: 30px;
    height: 30px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--ui-muted);
    font-size: 22px;
    line-height: 1;
    cursor: pointer;
  }
  .close:hover {
    color: var(--ui-fg);
    background: var(--ui-border);
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .tag {
    padding: 1px 8px;
    border: 1px solid var(--ui-border);
    border-radius: 999px;
    color: var(--ui-muted);
    font-size: 12px;
  }
  .tag.kind {
    color: var(--ui-fg);
    text-transform: capitalize;
  }
  .tag.req {
    border-style: dashed;
  }

  section {
    margin-top: 18px;
  }
  h3 {
    margin: 0 0 4px;
    color: var(--ui-muted);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  h4 {
    margin: 0 0 4px;
    color: var(--ui-muted);
    font-size: 12px;
    font-weight: 500;
  }
  .prose {
    margin: 0;
  }
  .done {
    padding: 10px 12px;
    border-left: 3px solid var(--ui-accent);
    border-radius: 0 6px 6px 0;
    background: color-mix(in srgb, var(--ui-accent) 8%, transparent);
  }
  .done .prose {
    font-weight: 500;
  }
  .afar p {
    margin: 0;
    color: var(--ui-muted);
    font-style: italic;
  }

  .status {
    padding: 10px 12px;
    border: 1px solid var(--ui-border);
    border-radius: 8px;
  }
  .status-line {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .status .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--ui-muted);
  }
  .status-in-progress .dot {
    background: #e2572b;
    box-shadow: 0 0 0 3px rgba(226, 87, 43, 0.2);
  }
  .status-cleared .dot {
    background: var(--ui-fg);
  }
  .uncommitted {
    padding: 0 7px;
    border: 1px dashed var(--ui-muted);
    border-radius: 999px;
    color: var(--ui-muted);
    font-size: 11px;
  }
  .campfire-note {
    margin: 6px 0 0;
    font-style: italic;
  }
  .facts {
    display: flex;
    gap: 12px;
    margin: 4px 0 0;
    padding: 0;
    list-style: none;
    color: var(--ui-muted);
    font-size: 12px;
  }

  .rel + .rel {
    margin-top: 10px;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 100%;
    padding: 3px 10px;
    border: 1px solid var(--ui-border);
    border-radius: 999px;
    background: transparent;
    color: var(--ui-fg);
    font: 13px var(--font-ui);
    text-align: left;
    cursor: pointer;
  }
  .chip:hover:not(:disabled) {
    border-color: var(--ui-accent);
  }
  .chip:disabled {
    color: var(--ui-muted);
    cursor: default;
  }
  .chip-dot {
    flex: none;
    width: 8px;
    height: 8px;
    border: 1.5px solid currentColor;
    border-radius: 2px;
    transform: rotate(45deg);
  }
  .chip.sky .chip-dot {
    border-radius: 50%;
    transform: none;
    color: var(--sky-ink);
  }
  .chip.depths .chip-dot {
    border-radius: 50%;
    transform: none;
    color: #3fd0c4;
  }
  .chip.cleared .chip-dot {
    background: currentColor;
  }
  .chip.in-progress .chip-dot {
    color: #e2572b;
  }

  .work {
    display: grid;
    gap: 6px;
  }
  .copy {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 6px 10px;
    border: 1px solid var(--ui-border);
    border-radius: 6px;
    background: transparent;
    color: var(--ui-fg);
    font: 12px var(--font-ui);
    cursor: pointer;
  }
  .copy:hover {
    border-color: var(--ui-accent);
  }
  .copy code {
    overflow: hidden;
    font-family: var(--font-mono);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .copy span {
    flex: none;
    color: var(--ui-muted);
  }
  button:focus-visible {
    outline: 2px solid var(--ui-accent);
    outline-offset: 1px;
  }

  .writeup {
    padding-top: 14px;
    border-top: 1px solid var(--ui-border);
  }
  .markdown :global(h1),
  .markdown :global(h2),
  .markdown :global(h3) {
    margin: 1.2em 0 0.4em;
    font-family: var(--font-map);
    font-weight: 600;
    line-height: 1.2;
  }
  .markdown :global(h1) {
    font-size: 22px;
  }
  .markdown :global(h2) {
    font-size: 19px;
  }
  .markdown :global(h3) {
    font-size: 16px;
  }
  .markdown :global(p),
  .markdown :global(ul),
  .markdown :global(ol) {
    margin: 0.5em 0;
  }
  .markdown :global(code),
  .prose :global(code) {
    padding: 0 3px;
    border-radius: 3px;
    background: color-mix(in srgb, var(--ui-fg) 7%, transparent);
    font: 0.92em var(--font-mono);
  }
  .markdown :global(pre) {
    overflow-x: auto;
    padding: 10px 12px;
    border-radius: 6px;
    background: #22201c;
    color: #ece6da;
    font-size: 12px;
    line-height: 1.45;
  }
  .markdown :global(pre code) {
    padding: 0;
    background: none;
  }
  .markdown :global(blockquote) {
    margin: 0.5em 0;
    padding-left: 10px;
    border-left: 3px solid var(--ui-border);
    color: var(--ui-muted);
  }
  .markdown :global(table) {
    border-collapse: collapse;
    font-size: 13px;
  }
  .markdown :global(th),
  .markdown :global(td) {
    padding: 3px 8px;
    border: 1px solid var(--ui-border);
  }
  .markdown :global(a) {
    color: var(--ui-accent);
  }
  /* Code highlighting (original palette) */
  .markdown :global(.hljs-comment),
  .markdown :global(.hljs-quote) {
    color: #8f8778;
    font-style: italic;
  }
  .markdown :global(.hljs-keyword),
  .markdown :global(.hljs-selector-tag),
  .markdown :global(.hljs-meta .hljs-keyword) {
    color: #e0a36b;
  }
  .markdown :global(.hljs-string),
  .markdown :global(.hljs-regexp) {
    color: #a9c98a;
  }
  .markdown :global(.hljs-number),
  .markdown :global(.hljs-literal) {
    color: #d7a0d0;
  }
  .markdown :global(.hljs-title),
  .markdown :global(.hljs-title.function_) {
    color: #8fc3e6;
  }
  .markdown :global(.hljs-type),
  .markdown :global(.hljs-built_in) {
    color: #e6cf8f;
  }
  .markdown :global(.hljs-meta) {
    color: #b3a88f;
  }
</style>
