# Stratum: a three-layer exploration map for deep technical study

*Design document, v1. Author: Tiago (with Claude). Status: ready for implementation.*

Stratum is a personal study world inspired by the exploration design of *Breath of the Wild* and *Tears of the Kingdom*. The world is a map in three layers (**sky**, **surface**, **depths**) covering C++, software design, performance engineering for AI interpretability, and HPC hardware. You explore it by clearing **shrines**. A shrine is a small implementation plus a written explanation of it, committed to this git repo. The map is rendered *from the repo*: fog lifts, lightroots glow and paths appear only as a side effect of doing the work.

---

## 0. Notes for the implementing agent

- Read this whole document before writing code. §13 lists the milestones in order, each with acceptance criteria. Build them in that order and stop for review at the end of each one.
- `world/world-seed.yaml` is the content. It has 217 entries across 22 regions. **Do not rewrite its content.** You may fix YAML errors and must report any schema mismatches you find.
- The design has a few hard constraints. Don't trade them away for convenience:
  1. **The repo is the source of truth.** No database and no browser storage for progress. Everything the map shows is derived from files in the repo and from git history.
  2. **Clearing requires artefacts.** Nothing in the UI marks a shrine cleared by a click.
  3. **The triangle rule (§6, §7) is the core feature.** The map must never show everything at once, except in the explicit authoring view (Atlas mode).
  4. **Placement is stable.** A shrine's position never changes once assigned (§8.4). Spatial memory is part of how the map motivates.
- Visual design must be **original**. No Nintendo assets, logos, fonts, sounds, character names or the Sheikah eye motif. The game-inspired *vocabulary* used here (shrine, tower, lightroot, sky island, depths, chasm, campfire) is generic and fine.
- Where this document is silent, choose the simplest thing that preserves the constraints above, and record the decision in `docs/decisions.md`.

---

## 1. Purpose

Tiago is in the final quarter of an MS in Financial Mathematics and wants to spend many more hours on consequential technical concepts. The obstacle isn't interest. It's the *pull*: nothing in ordinary study produces the "I can see that mountain, I have to go there" feeling that the games do. Stratum tries to reproduce that feeling with four mechanisms borrowed from the games:

| Game mechanism | What it does in the game | Stratum equivalent |
|---|---|---|
| Towers | Reveal the terrain of a region, not its secrets | A region survey. It reveals the region's shrines as silhouettes and forces you to propose new shrines (§5.3) |
| Shrines | Small, finishable challenges with a clear reward | A bounded build plus a write-up, sized S/M/L (§5) |
| Depths mirror the surface | Each lightroot lies under a surface shrine | Each depths shrine sits under a surface shrine and covers the mechanism beneath it (§6.4) |
| The triangle rule | Terrain hides most landmarks, so only a few call to you at once | Line of sight with ridges and prominence (§6), plus a 3-slot Horizon (§7) |
| Hero's Path, map pins | Your own history and intentions written on the map | A path drawn from git history, campfires for work in progress, and pins (§10) |

### 1.1 Design principles

1. **The work generates the map.** Maintaining the map must never feel like a task of its own. The only curation is proposing shrines, and that is itself a shrine output (tower clears, loose threads).
2. **A few choices, not a menu.** At any moment the interface foregrounds at most three next steps. Everything else is either visible terrain you *could* walk to, or hidden.
3. **Finishable units.** Every shrine has a "done" condition that can be checked without judgement calls about "understanding".
4. **Vertical meaning.** Moving between layers means moving between levels of abstraction. It isn't a separate topic list.
5. **No guilt mechanics.** No streaks, XP, levels or nagging. Old campfires fade visually; they never generate warnings.
6. **Stable space.** Positions and region shapes are deterministic and locked.

---

## 2. The three layers

| Layer | Content | Build flavour | Visibility rule |
|---|---|---|---|
| **Sky** | High-level frameworks: agentic LLM coding for HPC, software design, interpretability theory, performance theory, numerics | Design and argument. A small prototype, with the write-up doing most of the work | Islands are always visible. Their shrines open through *launch points*, which are linked surface clears (§6.3) |
| **Surface** | Concrete features, implementations, algorithms and tools | Implementation. Build it, test it, benchmark it | Line of sight with ridges: the triangle rule (§6.2) |
| **Depths** | ISA, microarchitecture, memory hierarchy, compilers, GPU hardware, OS, bit-level numerics | Measurement. Counters, disassembly, profilers | Darkness. Only light from cleared lightroots, and glows under cleared surface shrines (§6.4) |

A **chasm** is any `links` edge that crosses layers. It is drawn as an opening on the surface (downward) or a launch point (upward).

### 2.1 Seed world summary

| Layer | Regions | Shrines | Towers | Temples |
|---|---|---|---|---|
| Surface | 10 | 103 | 10 | 6 |
| Sky | 5 islands | 33 | 5 | 0 |
| Depths | 7 veins | 60 | none (depths are explored by light) | 0 |

The world is deliberately larger than one quarter can cover. A partly explored map is the intended state.

---

## 3. The core loop, as experienced

1. Open the map (`stratum dev`). The **Horizon** panel shows three cards: *the thread* (continue nearby), *the vertical* (go up or down a layer), and *the far landmark* (a tall silhouette in unexplored territory).
2. Pick one and press **Set out**. That runs `stratum start <id>`, which scaffolds `work/<id>/` from a template and makes the shrine a *campfire* on the map.
3. Build. Commit as you go. Before stopping, write one line in `NEXT.md` ("where I left off"). The campfire card shows it next time.
4. Write `WRITEUP.md`. Run `stratum clear <id>`, which validates the clear (§5) and stamps the date. Commit.
5. The map updates live. The fog recedes from the new vantage point, the lightroot below starts to glow, a sky shrine linked to this one opens, and the Hero's Path extends. The Horizon recomputes.

Flashcards are optional. Tiago writes RemNote cards on his own and can list links in the write-up's frontmatter. They are displayed as a count but never required.

---

## 4. Data model

### 4.1 Repository layout

```
stratum/
  DESIGN.md
  stratum.config.yaml          # tunables (§6, §7 constants; word minimum)
  world/
    world-seed.yaml            # hand-authored world (regions, ridges, shrines)
    proposed.yaml              # shrines proposed via towers / loose threads (same schema)
    positions.lock.json        # assigned coordinates, committed (§8.4)
  work/
    <shrine-id>/
      WRITEUP.md               # required to clear
      NEXT.md                  # optional campfire note
      ...code, CMakeLists.txt, pyproject.toml, results/
  templates/
    cpp/                       # produced by the `cmake-modern` shrine; a minimal stub until then
    python/                    # uv/pyproject + pytest stub
    WRITEUP.md
    NEXT.md
  state/
    pins.yaml                  # map pins (written by CLI/dev server)
  app/                         # web map (Svelte + TS + Vite)
  cli/                         # stratum CLI (TS, run with tsx)
  build/                       # generated map.json (gitignored)
  docs/decisions.md
```

### 4.2 World schema

The world schema is documented in the header comment of `world/world-seed.yaml`. Summary:

**Region**
- `id`: string
- `layer`: `sky | surface | depths`
- `name`: string
- `centroid`: `[x, y]`, required for surface and sky
- `radius`: number, sky islands only

**Shrine**
- `id`: unique kebab slug, also the work folder name
- `title`: string
- `region`: region id. The region determines the layer.
- `kind`: `shrine` (default) | `tower` | `temple`
- `p`: prominence, 1..5. Default 2. Towers and temples are forced to 5.
- `size`: `S | M | L`. Default M. The timebox is roughly S = 2–3h, M = 4–6h, L = 8–12h.
- `requires`: optional list of tags: `gpu | arm | avx512 | linux | llm-api`
- `below`: depths only, required. The id of a surface shrine.
- `links`: optional list of shrine ids, treated as undirected for visibility purposes
- `needs`: temples only. Shrine ids that must be cleared before the temple opens.
- `prompt`: what to build
- `done`: the shrine-specific clear condition
- `xy`: optional manual placement `[x, y]`
- `from`: in `proposed.yaml` only. The id of the shrine or tower that proposed it.

**Ridges.** A `default` height, plus `overrides: [{between: [a, b], h}]`.

**Start.** `vantage: [x, y]` and `plateau: [ids]`. Plateau shrines are always revealed.

**Loader validation** (`stratum lint`, and on every build):
- Ids are unique across `world-seed.yaml` and `proposed.yaml`.
- Every `region` exists.
- Every depths shrine has a `below` that points to a surface shrine.
- `links` and `needs` resolve.
- `below` does not appear on non-depths shrines.
- An override for regions that aren't adjacent produces a warning.
- Every region except the depths veins has exactly one tower.

### 4.3 WRITEUP.md

```markdown
---
shrine: spsc-ring-buffer
status: in-progress        # in-progress | cleared
started: 2026-10-02
cleared:                   # set by `stratum clear`
hours:                     # optional, self-reported
code:                      # optional: path/URL if code lives elsewhere
remnote: []                # optional flashcard links
---

## What I built

## How it works

## What I measured / what surprised me

## Loose threads
<!-- Ideas that could become new shrines. `stratum propose --from <id>` turns a line here into a proposal. -->
```

### 4.4 Derived state (computed at build)

For every shrine:

| Field | Type | Source |
|---|---|---|
| `status` | `untouched \| in-progress \| cleared` | `in-progress` if `work/<id>/` exists without a valid clear |
| `clearedAt` | date | frontmatter |
| `startedAt` | date | frontmatter |
| `committed` | bool | Whether the WRITEUP.md shown as cleared is committed. Uncommitted clears render with a dashed outline. |
| `touches` | list of timestamps | Commit timestamps from `git log` for paths under `work/<id>/` |
| `campfireNote` | string | First line of `NEXT.md`, plus its mtime |
| `visibility` | `hidden \| silhouette \| revealed` | §6 |
| `xy` | position | §8 |
| `hoursEstimate` | number | §10.3 |

`build/map.json` contains the world (with positions), the regions (with generated geometry), the derived state, the Hero's Path, the pins and the Horizon. The front end is a pure renderer of this JSON. **All game logic lives in a shared TS module (`core/`) that both the CLI and the app import.** This keeps it unit-testable.

---

## 5. Clearing

### 5.1 Shrines

`stratum clear <id>` passes only if all of the following hold:
1. `work/<id>/WRITEUP.md` exists with valid frontmatter.
2. The three sections *What I built*, *How it works* and *What I measured / what surprised me* are each non-empty.
3. Together they contain at least `writeup.minWords` words. The default is 250 and it is configurable.
4. There is at least one artefact: a non-Markdown file in `work/<id>/` (excluding NEXT.md), or a non-empty `code:` field.
5. For a temple, every id in `needs` is cleared.

On success it sets `status: cleared` and `cleared: <today>`, then prints the shrine's `done` text as a final self-check ("Did you: …?") and a suggested `git commit` command. It doesn't commit automatically. On failure it prints a checklist of what's missing.

The CLI can't check the shrine-specific `done` condition. It shows that text prominently at start, in the detail panel and at clear time, so the write-up gets written against it.

### 5.2 Temples

Temples are capstones. Until their `needs` are met they render as locked silhouettes, with the needs listed as a small constellation of shrine glyphs. Once the needs are met they become revealed and startable.

### 5.3 Towers

A tower clears like a shrine, except that it has no artefact requirement. In addition, `proposed.yaml` must contain at least 3 entries with `from: <tower-id>`. Clearing a tower:
- makes every shrine in its region at least a silhouette,
- turns the tower into a strong vantage point (§6.2), and
- counts as the region "surveyed". Its terrain renders fully, with no fog wash.

---

## 6. Visibility: the triangle rule

In BotW the designers use terrain (large and small "triangles") to control how many landmarks are visible at once. Large rises hide what lies behind them, which forces a choice: go around or climb. Small rises let you peek over them. Tall landmarks (towers, peaks) stay visible from far away and pull you toward them. Stratum implements this literally, as 2D line of sight across ridges.

Constants live in `stratum.config.yaml`. Coordinates are in world units on a 1600×1000 canvas shared by all three layers, so vertical alignment is meaningful.

### 6.1 Vantage points

The set `V` of vantage points contains:
- the start vantage,
- every cleared surface shrine,
- every in-progress surface shrine (you're camped there), and
- every cleared tower, with the tower bonus.

Sky and depths clears are vantages only on their own layers (see §6.3 and §6.4).

### 6.2 Surface rule

Definitions:
- `R(p) = 150 + 90·p`. That gives p=1 → 240, p=2 → 330, p=3 → 420, p=4 → 510, p=5 → 600.
- `H(v, s)` is the maximum ridge height crossed by the straight segment from vantage `v` to shrine `s`. Compute it by sampling the segment every 5 units and classifying each sample's region (§8.1). Every change of region A→B crosses the ridge `h(A,B)`. The value is 0 if the whole segment stays in one region.
- For tower vantages, use `R(p) + 300` and `H − 2` (floored at 0).

A shrine `s` with prominence `p` is:
- **revealed** if some `v ∈ V` has `d(v,s) ≤ R(p)` and `p > H(v,s)`,
- else **silhouette** if some `v` has `d(v,s) ≤ 1.6·R(p)` and `p ≥ H(v,s)`,
- else **hidden**.

Overrides are applied in this order:
1. Plateau shrines are revealed.
2. Cleared and in-progress shrines are revealed.
3. Shrines in a region whose tower is cleared are at least silhouette.
4. Towers are at least silhouette everywhere on the surface. Their prominence of 5 makes this mostly automatic, but guarantee it.
5. Temples with unmet needs are at most silhouette.

The effect: ordinary (p=2) shrines in the next region are hidden behind a default ridge of height 2. Only landmarks (p≥3) peek over it, as silhouettes. That is the intended "a few things call to you" behaviour. High ridges (h=4, e.g. Tick Canyon ↔ Agent Workshops) hide almost everything, so you have to walk around through a neighbouring region.

**Silhouette presentation.** A silhouette shows its glyph, size and region, but not its prompt. Its title shows on hover only if p ≥ 3 (landmarks are recognisable from afar); otherwise it shows "???". Setting out to a silhouette is allowed and reveals it.

### 6.3 Sky rule

- Island outlines and names are always visible, both on the sky layer and as faint shadows on the surface.
- A sky tower is always revealed.
- A sky shrine is **revealed** if its island's tower is cleared, or if any shrine in its `links` (in either direction) is cleared or in progress. That linked shrine is its *launch point*.
- Otherwise the sky shrine is a **silhouette**. Sky shrines are never hidden: you can always see the islands overhead.
- On the surface, a launch point (a shrine linked to a sky shrine) gets a small upward-draft marker.

### 6.4 Depths rule

The depths are dark.
- Each depths shrine sits at the exact position of its `below` surface shrine (§8.3).
- A depths shrine **glows**, which is its silhouette state, if its `below` shrine is cleared or in progress. On the surface layer this shows as a faint chasm mark beside that shrine.
- A depths shrine is **revealed** if it lies within `lightRadius = 220` of any cleared depths shrine, or if it is in progress or cleared.
- Anything else in the depths is **hidden**, and so is the terrain. The depths layer renders black except inside light circles (radius 220 around cleared lightroots) and small glows (radius 40).
- Depths "veins" (regions) are thematic. They colour the light (e.g. the Cache vein is teal and the Silicon vein is green) but have no borders.

### 6.5 Search

The search box only matches revealed shrines, and silhouettes with p ≥ 3 by title. Search never uncovers hidden shrines. Atlas mode (§9.5) is the escape hatch.

---

## 7. The Horizon: three calls to adventure

The Horizon panel always shows **at most three** cards. It is the main way the triangle rule reaches daily decisions. It is recomputed only when the state changes (a start, a clear or a pin) and is otherwise stable within an ISO week. There is **no reroll button**. Option-shopping is the failure mode this feature exists to prevent.

Definitions:
- `L` is the most recently cleared shrine. If there is none, it is the start vantage.
- `Recent` is the last 3 cleared shrines.
- Candidates are uncleared shrines and exclude temples with unmet needs.
- Distances are measured in xy on the shared canvas, even across layers.

**Slot 1: the Thread** (continue)
1. If any shrines are in progress, use the most recently touched one, shown as a campfire card with its `NEXT.md` line.
2. Otherwise, if a pin exists, choose the revealed candidate on L's layer that minimises `d(L,s) + d(s,pin)` subject to `d(L,s) ≤ 450`. This means "on the way".
3. Otherwise, use the nearest revealed candidate to L on L's layer. Break ties by p descending, then id.

**Slot 2: the Vertical** (go up or down). Take the first that exists:
1. A glowing depths shrine whose `below` is in `Recent`.
2. A revealed sky shrine linked to a shrine in `Recent`.
3. If L is a depths shrine, the uncleared surface shrine directly above it, or a surface neighbour of it.
4. The revealed candidate on a different layer from Slot 1 that is nearest to L's xy.

**Slot 3: the Far Landmark** (the horizon pull)
1. Consider silhouette candidates with p ≥ 3 and `d(L,s) ≥ 450`.
2. Prefer the region with the lowest cleared fraction, then higher p.
3. Break ties by `hash(isoWeek + id)`.
4. If there are none, use an uncleared tower. If there is none of those either, use a temple whose needs are met.
5. The card shows the silhouette treatment (§6.2) and a direction arrow from L.

The slots never duplicate. Each card shows the title (or "???"), layer, region, size, `requires` tags and, for revealed shrines, the first sentence of the prompt. It has two buttons: **Set out** and **Pin**.

**Pins.** A pin (one active pin at a time, stored in `state/pins.yaml`) marks a destination. While it's set, Slot 1 routes toward it. Clearing the pinned shrine removes the pin.

**Hardware filter.** A toggle in `stratum.config.yaml` (`available: [linux, gpu, ...]`) excludes shrines whose `requires` aren't available from Horizon candidates. They stay on the map, marked with a small padlock-free "needs GPU" badge.

---

## 8. Geometry and placement

### 8.1 Surface regions

- The landmass is an ellipse (cx 800, cy 500, rx 760, ry 470) with its boundary perturbed by 2D simplex noise (seeded). Everything outside it is sea.
- A point belongs to the region whose centroid is nearest to the point after domain warping: `pt' = pt + warp(pt)`, where warp is low-frequency simplex noise with an amplitude of about 40 units. This produces organic borders.
- The **same function** is used for rendering, placement and line of sight. It must be deterministic and fast (a precomputed grid lookup at 2-unit resolution is fine).
- Ridges are drawn along region borders, with visual weight proportional to `h`.

### 8.2 Sky islands

Each island is a noise-perturbed blob (the island's `radius`, with about 15% perturbation) centred on its centroid. It floats over the surface regions it abstracts.

### 8.3 Shrine placement

Placement is deterministic and incremental:
- **Surface and sky.** Process shrines in file order (seed, then proposed).
  - Towers go to the highest-elevation point within 60 units of their region centroid.
  - Temples go to a point at 60–85% of the distance from the centroid to the region border.
  - Other shrines rejection-sample points inside their region (or island) using a PRNG (mulberry32) seeded by `hash(id)`. Points must be on land and at least 38 units (26 on sky islands) from already-placed shrines.
  - If a region fills up, relax the spacing by 10% and retry.
- **Depths.** A depths shrine takes the `xy` of its `below` shrine. When k > 1 depths shrines share the same `below`, offset them on a ring of radius 22, at angles `2π·i/k`, ordered by id.
- An explicit `xy` always wins.

### 8.4 The positions lockfile

After placement, write `world/positions.lock.json` (`{id: [x, y]}`) and commit it. On later builds, locked ids keep their positions even if the algorithm, noise or spacing changes. Only new ids are placed. `stratum build --replace <id>` re-places a single shrine deliberately. Region geometry is likewise derived from a committed seed (`world.seed` in config).

### 8.5 Elevation (rendering only)

`elevation(pt) = base noise + 0.35·(prominence field) + ridge term`. The ridge term raises the terrain near borders in proportion to `h`. Contours are drawn with d3-contour on a coarse grid. Elevation doesn't affect game logic, except for tower placement.

---

## 9. The interface

### 9.1 Layout

- **Top bar:** the layer switch (Sky · Surface · Depths; keys 1/2/3), search, and a small region-completion readout.
- **Left:** the Horizon (3 cards). On narrow screens it collapses into a bottom sheet.
- **Centre:** the map, with pan and zoom (d3-zoom) and zoom-dependent labels. Region names show at low zoom and shrine titles at high zoom.
- **Right (on selection):** the detail panel:
  - title, layer, region, size, `requires`
  - prompt and **Done when**
  - links as clickable chips (above/below/launch points)
  - status and dates, an hours estimate, and the remnote count
  - for cleared shrines, the rendered WRITEUP.md (markdown-it, with code highlighting)
  - a button to open the work folder path, which copies the path

### 9.2 Layer transitions

- **Surface → Depths:** a quick "dive". The map darkens and scales slightly, and the light circles fade in.
- **Surface → Sky:** the surface fades to a faint ground far below, and the islands rise in with soft shadows cast onto that ground.

Transitions should take under 400 ms and respect `prefers-reduced-motion`.

### 9.3 Visual language (original)

**Surface**
- Warm parchment ground with thin contour lines.
- Ridges drawn as hatched strokes along borders.
- Fog is a desaturated wash with a subtle paper-grain texture over areas outside every vantage's R(2) radius. The coastline and silhouettes stay faintly visible.
- The sea is a flat blue-grey with sparse wave strokes.

**Sky**
- A pale, luminous blue-white.
- Islands are cream blobs with drop shadows.
- The surface is visible below at 15% opacity.

**Depths**
- Near-black.
- Light circles are radial gradients tinted by vein colour.
- Glows are small pulsing points (static if reduced motion is on).
- Cleared lightroots are bright nodes.

**Glyphs** (simple, original SVG)

| Element | Glyph |
|---|---|
| Shrine | Small rotated square with an inner dot. Filled when cleared, outlined when revealed, grey when a silhouette. |
| Tower | Tall narrow obelisk |
| Temple | Stepped pyramid |
| Sky shrine | Ring |
| Lightroot | Starburst |
| Campfire | Small flame, with brightness decaying over 14 days since the NEXT.md mtime (visual only) |
| Pin | Stamp |

**Typography.** A serif for map labels (e.g. Cormorant Garamond via Google Fonts), a clean sans for UI and a monospace for code. Colours are defined as CSS tokens. The UI chrome supports light and dark modes. The map layers keep their own palettes in both.

### 9.4 Hero's Path

A thin dotted line connects cleared shrines in `clearedAt` order, per layer. Hovering over a segment shows its dates. There's an optional toggle to show path density by week.

### 9.5 Atlas mode (authoring)

`?atlas=1` shows a spoiler warning, then a sortable table of every shrine, including hidden ones, plus a "reveal all" map toggle. It exists for reviewing and editing the world, not for everyday use.

---

## 10. Progress signals

### 10.1 Campfires

In-progress shrines render as campfires, showing the `NEXT.md` first line on hover and on their Horizon card.

### 10.2 Region readout

On hover over a region: cleared / revealed / total, plus surveyed yes/no. The global completion % appears only in the top bar, in small text.

### 10.3 Hours

- If `hours` is present in the frontmatter, use it.
- Otherwise estimate from commit timestamps in `touches`. Cluster commits with gaps under 2h into sessions; each session counts as its span + 30 minutes.
- Estimates show with a "≈" prefix.
- A per-region hours total is shown in the region readout.

No charts are needed in v1.

---

## 11. CLI and local server

Run the CLI with `npx tsx cli/index.ts`, aliased as `stratum`.

| Command | Behaviour |
|---|---|
| `stratum lint` | Validate the world (§4.2) and every WRITEUP.md |
| `stratum build [--replace <id>]` | Compute positions (respecting the lockfile), derived state, visibility and Horizon, and write `build/map.json` |
| `stratum dev` | Vite dev server plus a local API (localhost only), with a file watcher that rebuilds on changes under `world/`, `work/` and `state/` and pushes updates over SSE |
| `stratum start <id> [--force]` | Scaffold `work/<id>/` from a template (cpp or python, based on `region`, with a flag to override) and set `status: in-progress` and `started`. Refuses to start a hidden shrine or a locked temple without `--force`. |
| `stratum clear <id>` | Validate (§5), stamp the date, and print the checklist and suggested commit |
| `stratum status` | Counts by layer and region, plus campfires |
| `stratum horizon` | Print the three Horizon cards in the terminal |
| `stratum pin <id> \| --clear` | Set or remove the pin |
| `stratum propose --from <id>` | Append a proposal stub to `proposed.yaml` with `from`, opening `$EDITOR` if set |

**Dev API.** `GET /api/map`, `POST /api/start {id}`, `POST /api/pin {id|null}`, and `GET /api/events` (SSE). **Set out** and **Pin** in the UI call these. In a static build (`stratum build --static`), those buttons copy the equivalent CLI command instead.

---

## 12. Tech stack

- Node 20+, TypeScript (strict), npm workspaces: `core/`, `cli/`, `app/`.
- **core:** `yaml`, `gray-matter`, `simplex-noise`, and a hand-written mulberry32 PRNG and hash. No DOM.
- **cli:** `tsx`, `commander`, `chokidar`, git through `child_process` (`git log --format=%H%x09%ct --name-only -- work/`).
- **app:** Svelte 5 + Vite, rendering as SVG layers, with `d3-zoom`, `d3-contour` and `markdown-it`. Switch the fog and light masks to a canvas only if SVG performance is inadequate. At around 220 shrines it should be fine.
- **tests:** `vitest`. The visibility and Horizon logic must be pure functions of `(world, state, config)`.

---

## 13. Milestones

Stop for review after each milestone.

### M0: Skeleton and world loading
- Workspaces, config, the loader and `stratum lint`.
- **Accept when:**
  - lint passes on `world-seed.yaml` and reports 217 entries and 22 regions;
  - planted errors (a duplicate id, a bad `below`, an unknown link) are each reported with file/line context.

### M1: Geometry and a static map (everything revealed)
- Region classification, the landmass, placement and the lockfile.
- Render all three layers with a layer switch, pan and zoom.
- **Accept when:**
  - positions are identical across two builds;
  - adding a shrine to `proposed.yaml` doesn't move any existing shrine;
  - depths shrines sit under their `below` shrines, with ring offsets where shared.

### M2: Work state
- `start`, `clear`, WRITEUP parsing, git touches, campfires, and the detail panel with the rendered write-up.
- **Accept when:**
  - starting a shrine creates a campfire;
  - an invalid write-up fails with a checklist;
  - a valid one clears and the map shows it after the rebuild;
  - uncommitted clears render dashed.

### M3: Visibility (the triangle rule)
- §6 in full: fog, silhouettes, sky launch points, depths light and glows, towers.
- **Accept when** these unit tests pass:
  - p=2 shrines across a default ridge are hidden and p=3 ones are silhouettes;
  - an h=4 ridge hides p=3;
  - the tower bonus reveals across an h=2 ridge;
  - the depths are dark until a lightroot is cleared;
  - glows appear under cleared surface shrines;
  - a fresh repo shows only the plateau, the silhouettes visible from the start vantage, the towers and the sky islands.

### M4: The Horizon and pins
- §7 in full, the CLI `horizon`, the Horizon panel, the dev API and SSE live updates.
- **Accept when:**
  - the Horizon is deterministic for a given state and week;
  - no slot ever shows a hidden shrine;
  - pin routing picks "on the way" shrines;
  - a fixture test covers each fallback branch.

### M5: Hero's Path, hours and polish
- The Hero's Path, the hours estimate, layer transitions, reduced motion, dark UI chrome, mobile layout, Atlas mode and the static build.
- **Accept when** Lighthouse accessibility is at least 90, and the map is usable at 390 px width with the Horizon as a bottom sheet.

---

## 14. Test fixtures

Keep a `fixtures/` folder with small synthetic worlds (3 regions, about 12 shrines) and scripted states (a sequence of starts and clears with dates). Snapshot-test `map.json` visibility and Horizon output for each. Visual regression testing is optional; Playwright screenshots of each layer at M5 are enough.

---

## 15. Non-goals for v1

- Accounts, sync, a hosted backend, and multiple users.
- XP, levels, streaks, badges, notifications.
- LLM features inside the app, such as generating shrines or grading write-ups. The write-up stays a human judgement against the `done` text. A Claude Code skill could be added later as a shrine of its own (`claude-code-skill`).
- Flashcard integration beyond storing and counting links.
- Editing the world from the UI. Editing happens in YAML via the CLI or an editor.

---

## 16. Defaults Tiago can change later

| Decision | Default | Where |
|---|---|---|
| Word minimum for a write-up | 250 | `stratum.config.yaml` |
| Hardware available | `[linux, llm-api]` (add `gpu` once a GPU is available, e.g. a university cluster or a cloud instance) | `stratum.config.yaml` |
| Silhouette titles shown from | p ≥ 3 | config |
| Visibility constants | R(p) = 150 + 90p, 1.6× silhouette band, tower +300/−2, light 220 | config |
| Horizon far distance | 450 | config |
| Project name | "Stratum" | everywhere; rename freely |
