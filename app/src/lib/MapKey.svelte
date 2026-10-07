<script lang="ts">
  /** A map key (docs/plans/camps.md): one line per glyph, so the map explains itself. Toggled with K. */
  let { open = false, ontoggle }: { open?: boolean; ontoggle: () => void } = $props();

  const INK = '#2f2819';
  const LAND = '#efe4c8';
  const GREY = '#b8b1a4';
  const GREY_EDGE = '#8f887b';
  const SKY = '#3a5f8a';
</script>

{#if open}
  <aside class="key" aria-label="Map key">
    <header>
      <h2>Map key</h2>
      <button class="close" onclick={ontoggle} aria-label="Close the map key" title="Close (key K)">×</button>
    </header>
    <dl>
      <div>
        <dt><svg viewBox="-10 -10 20 20"><rect x="-4.6" y="-4.6" width="9.2" height="9.2" transform="rotate(45)" fill={LAND} stroke={INK} stroke-width="1.5" /><circle r="1.6" fill={INK} /></svg></dt>
        <dd>Shrine in sight: its prompt is known</dd>
      </div>
      <div>
        <dt><svg viewBox="-10 -10 20 20"><rect x="-4.6" y="-4.6" width="9.2" height="9.2" transform="rotate(45)" fill={INK} stroke={INK} stroke-width="1.5" /><circle r="1.6" fill={LAND} /></svg></dt>
        <dd>Cleared</dd>
      </div>
      <div>
        <dt><svg viewBox="-12 -12 24 24"><rect x="-4.6" y="-4.6" width="9.2" height="9.2" transform="rotate(45)" fill={INK} /><circle r="9.5" fill="none" stroke={INK} stroke-width="1.3" stroke-dasharray="2.4 2" /></svg></dt>
        <dd>Cleared, write-up not committed yet</dd>
      </div>
      <div>
        <dt><svg viewBox="-10 -10 20 20"><rect x="-4.6" y="-4.6" width="9.2" height="9.2" transform="rotate(45)" fill={GREY} stroke={GREY_EDGE} stroke-width="1.5" /></svg></dt>
        <dd>Silhouette: seen from afar ("???" if too faint to name)</dd>
      </div>
      <div>
        <dt><svg viewBox="-12 -14 24 24"><polygon points="-3.4,7 -2.2,-9 0,-13 2.2,-9 3.4,7" fill="#7a4b2e" stroke={INK} stroke-width="1.2" /></svg></dt>
        <dd>Tower: clear it to survey its region</dd>
      </div>
      <div>
        <dt><svg viewBox="-11 -8 22 16"><path d="M-9,6 H9 V2.5 H6 V-1 H3 V-4.5 H-3 V-1 H-6 V2.5 H-9 Z" fill="#b98f52" stroke={INK} stroke-width="1.2" /></svg></dt>
        <dd>Temple: a capstone, sealed until its needs are cleared</dd>
      </div>
      <div>
        <dt><svg viewBox="-10 -10 20 20"><circle r="5" fill="#fbf5e6" stroke={SKY} stroke-width="2" /></svg></dt>
        <dd>Sky shrine: opens from a linked shrine below</dd>
      </div>
      <div>
        <dt class="dark"><svg viewBox="-10 -10 20 20"><polygon points="0,-8 1.8,-2.6 7,-3.2 3,0.8 5,6.4 0,3.2 -5,6.4 -3,0.8 -7,-3.2 -1.8,-2.6" fill="#3fd0c4" stroke="#fff" stroke-width="0.6" /></svg></dt>
        <dd>Wellspring (depths); a faint point is a glow under active work above</dd>
      </div>
      <div>
        <dt><svg viewBox="-8 -9 16 16"><path d="M0,-8 C3.8,-4.4 5.2,-1.6 5.2,1.4 C5.2,4.4 2.9,6.4 0,6.4 C-2.9,6.4 -5.2,4.4 -5.2,1.4 C-5.2,-1.2 -3.4,-2.8 -2.3,-5.2 C-1.7,-3.2 -0.9,-2.4 -0.2,-2.2 C0.3,-4 0.3,-6 0,-8 Z" fill="#e2572b" stroke="#7a2a12" stroke-width="0.6" /></svg></dt>
        <dd><strong>Camp</strong>: where you're working now (always exactly one). It burns down to embers after 14 untouched days.</dd>
      </div>
      <div>
        <dt><svg viewBox="-6 -6 12 12"><ellipse rx="4.2" ry="1.9" cy="3" fill="#a39c90" stroke="#4d463c" stroke-width="0.7" /><ellipse rx="3.2" ry="1.6" fill="#a39c90" stroke="#4d463c" stroke-width="0.7" /><ellipse rx="2.1" ry="1.3" cy="-2.6" fill="#a39c90" stroke="#4d463c" stroke-width="0.7" /></svg></dt>
        <dd><strong>Cairn</strong>: started work you stepped away from. Shelve it to set it aside.</dd>
      </div>
      <div>
        <dt><svg viewBox="-5 -5 10 10"><path d="M-1.9,0 v-1.6 a1.9,1.9 0 0 1 3.8,0 v1.6" fill="none" stroke="#2b2216" stroke-width="0.9" /><rect x="-2.8" y="0" width="5.6" height="4.2" rx="0.8" fill="#efe6d2" stroke="#2b2216" stroke-width="0.9" /></svg></dt>
        <dd><strong>Lock</strong>: it works on something you build elsewhere. Come back once you have it; it opens by itself.</dd>
      </div>
      <div>
        <dt><svg viewBox="-9 -6 12 12"><path d="M-8,2 C-6,0.1 -3,-0.1 -1,1.7 C-3.1,3.1 -5.9,3.3 -8,2 Z" fill="#2b2216" opacity="0.7" /></svg></dt>
        <dd>Chasm: a wellspring glows below this shrine</dd>
      </div>
      <div>
        <dt><svg viewBox="-6 -8 12 12"><path d="M-2.2,0 l2.2,-2.4 l2.2,2.4 M-2.2,-4 l2.2,-2.4 l2.2,2.4" fill="none" stroke={SKY} stroke-width="1.2" stroke-linecap="round" /></svg></dt>
        <dd>Updraft: a launch point to a sky shrine</dd>
      </div>
      <div>
        <dt><svg viewBox="-8 -9 16 12"><path d="M-7,2 L0.5,-7 L1.5,2 Z" fill="#efe2c6" stroke="#5b4631" stroke-width="0.7" /><path d="M1.5,2 L0.5,-7 L7,2 Z" fill="#a8916d" stroke="#5b4631" stroke-width="0.7" /></svg></dt>
        <dd>Mountains: a high ridge (h ≥ 3) that hides what's behind it</dd>
      </div>
      <div>
        <dt><svg viewBox="-8 -6 16 12"><path d="M-7,3 Q-3,-4 0,0 T7,-3" fill="none" stroke="#6f95ab" stroke-width="1.6" stroke-linecap="round" /></svg></dt>
        <dd>River or lake: scenery only; it doesn't block sight</dd>
      </div>
      <div>
        <dt><svg viewBox="-8 -10 16 20"><path d="M0,2 L0,9" stroke="#8c2f1f" stroke-width="1.6" /><rect x="-6" y="-8" width="12" height="10" rx="2.5" transform="rotate(-8)" fill="#c2412b" stroke="#6e2215" stroke-width="1.2" /></svg></dt>
        <dd>Your pin: the Horizon routes toward it</dd>
      </div>
    </dl>
    <p class="fog">Blank paper: land nobody has looked at yet. Everywhere you camp or clear, you see out to the nearest high ridge; a climbed tower charts its whole region.</p>
  </aside>
{:else}
  <button class="key-tab" onclick={ontoggle} title="What do the symbols mean? (key K)" aria-expanded="false">Key<kbd>K</kbd></button>
{/if}

<style>
  .key,
  .key-tab {
    position: absolute;
    left: 12px;
    bottom: 12px;
    border: 1px solid var(--ui-border);
    background: var(--ui-panel);
    box-shadow: 0 4px 12px rgba(40, 30, 20, 0.08);
    color: var(--ui-fg);
  }
  .key {
    width: 300px;
    max-height: calc(100% - 24px);
    overflow-y: auto;
    padding: 10px 12px;
    border-radius: 10px;
    backdrop-filter: blur(6px);
    font-size: 12px;
  }
  .key-tab {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 999px;
    font: 600 13px var(--font-map);
    cursor: pointer;
  }
  kbd {
    font: 11px var(--font-mono);
    opacity: 0.6;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  h2 {
    margin: 0 0 6px;
    font-family: var(--font-map);
    font-size: 17px;
  }
  .close {
    border: 0;
    background: none;
    color: var(--ui-muted);
    font-size: 18px;
    cursor: pointer;
  }
  dl {
    margin: 0;
  }
  dl div {
    display: grid;
    grid-template-columns: 26px 1fr;
    align-items: center;
    gap: 8px;
    padding: 3px 0;
  }
  dt svg {
    display: block;
    width: 22px;
    height: 22px;
  }
  dt.dark svg {
    border-radius: 4px;
    background: #07080a;
  }
  dd {
    margin: 0;
    line-height: 1.35;
  }
  .fog {
    margin: 8px 0 0;
    color: var(--ui-muted);
  }
  button:focus-visible {
    outline: 2px solid var(--ui-accent);
    outline-offset: 1px;
  }

  /* Narrow screens: the bottom edge belongs to the Horizon sheet, so the key lives top left. */
  @media (max-width: 640px) {
    .key,
    .key-tab {
      top: 12px;
      bottom: auto;
    }
    .key {
      width: min(300px, calc(100% - 70px));
      max-height: calc(100% - 80px);
    }
  }
</style>
