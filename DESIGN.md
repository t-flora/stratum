# Stratum: a three-layer exploration map for deep technical study

*Design document, v1, written with Claude. Status: ready for implementation.*

Stratum is a personal study world inspired by open-world exploration games. The world is a map in three layers (**sky**, **surface**, **depths**) covering C++, software design, performance engineering for AI interpretability, and HPC hardware. You explore it by clearing **shrines**. A shrine is a small implementation plus a written explanation of it, committed to this git repo. The map is rendered *from the repo*: fog lifts, wellsprings glow and paths appear only as a side effect of doing the work.

---

## 0. Notes for the implementing agent

- Read this whole document before writing code. §13 lists the milestones in order, each with acceptance criteria. Build them in that order and stop for review at the end of each one.
- `world/world-seed.yaml` is the content. It has 217 entries across 22 regions. **Do not rewrite its content.** You may fix YAML errors and must report any schema mismatches you find.
- The design has a few hard constraints. Don't trade them away for convenience:
  1. **The repo is the source of truth.** No database and no browser storage for progress. Everything the map shows is derived from files in the repo and from git history.
  2. **Clearing requires artefacts.** Nothing in the UI marks a shrine cleared by a click.
  3. **The triangle rule (§6, §7) is the core feature.** The map must never show everything at once, except in the explicit authoring view (Atlas mode).
  4. **Placement is stable.** A shrine's position never changes once assigned (§8.4). Spatial memory is part of how the map motivates.
- Visual design must be **original**. No assets, logos, fonts, sounds, character names or motifs from any existing game. The *vocabulary* used here (shrine, tower, wellspring, sky island, depths, chasm, camp, cairn, trail) is generic and fine.
- Where this document is silent, choose the simplest thing that preserves the constraints above, and record the decision in `docs/decisions.md`.

---

## 1. Purpose

The owner wants to spend many more hours on consequential technical concepts. The obstacle isn't interest. It's the *pull*: nothing in ordinary study produces the "I can see that mountain, I have to go there" feeling that the games do. Stratum tries to reproduce that feeling with four mechanisms borrowed from the games:

| Game mechanism | What it does in the game | Stratum equivalent |
|---|---|---|
| Towers | Reveal the terrain of a region, not its secrets | A region survey. It reveals the region's shrines as silhouettes and forces you to propose new shrines (§5.3) |
| Shrines | Small, finishable challenges with a clear reward | A bounded build plus a write-up, sized S/M/L (§5) |
| Depths mirror the surface | The underworld mirrors the land above it, point for point | Each depths shrine sits under a surface shrine and covers the mechanism beneath it (§6.4) |
| The triangle rule | Terrain hides most landmarks, so only a few call to you at once | Line of sight with ridges and prominence (§6), plus a 3-slot Horizon (§7) |
| A recorded path, map pins | Your own history and intentions written on the map | A path drawn from git history, a camp (and cairns) for work in progress, and pins (§10) |

### 1.1 Design principles

1. **The work generates the map.** Maintaining the map must never feel like a task of its own. The only curation is proposing shrines, and that is itself a shrine output (tower clears, loose threads).
2. **A few choices, not a menu.** At any moment the interface foregrounds at most three next steps. Everything else is either visible terrain you *could* walk to, or hidden.
3. **Finishable units.** Every shrine has a "done" condition that can be checked without judgement calls about "understanding".
4. **Vertical meaning.** Moving between layers means moving between levels of abstraction. It isn't a separate topic list.
5. **No guilt mechanics.** No streaks, XP, levels or nagging. An old camp burns down to embers visually; it never generates warnings.
6. **Stable space.** Positions and region shapes are deterministic and locked.

---

## 2. The three layers

| Layer | Content | Build flavour | Visibility rule |
|---|---|---|---|
| **Sky** | High-level frameworks: agentic LLM coding for HPC, software design, interpretability theory, performance theory, numerics | Design and argument. A small prototype, with the write-up doing most of the work | Islands are always visible. Their shrines open through *launch points*, which are linked surface clears (§6.3) |
| **Surface** | Concrete features, implementations, algorithms and tools | Implementation. Build it, test it, benchmark it | Line of sight with ridges: the triangle rule (§6.2) |
| **Depths** | ISA, microarchitecture, memory hierarchy, compilers, GPU hardware, OS, bit-level numerics | Measurement. Counters, disassembly, profilers | Darkness. Only light from cleared wellsprings, and glows under cleared surface shrines (§6.4) |

A **chasm** is any `links` edge that crosses layers. It is drawn as an opening on the surface (downward) or a launch point (upward).

### 2.1 Seed world summary

| Layer | Regions | Shrines | Towers | Temples |
|---|---|---|---|---|
| Surface | 10 | 103 | 10 | 6 |
| Sky | 5 islands | 33 | 5 | 0 |
| Depths | 7 veins | 60 | none (depths are explored by light) | 0 |

The world is deliberately larger than one term of study can cover. A partly explored map is the intended state.

---

## 3. The core loop, as experienced

1. Open the map (`stratum dev`). A fresh map begins on a sky island, looking down at the land you'll explore (§6.6). The **Horizon** panel shows three cards: *the thread* (continue nearby), *the vertical* (go up or down a layer), and *the far landmark* (a tall silhouette in unexplored territory).
2. Pick one and press **Set out**. That runs `stratum start <id>`, which scaffolds `work/<id>/` from a template and makes camp there on the map.
3. Build. Commit as you go. Before stopping, write one line in `NEXT.md` ("where I left off"). The Horizon's camp card shows it next time.
4. Write `WRITEUP.md`. Run `stratum clear <id>`, which validates the clear (§5) and stamps the date. Commit.
5. The map updates live. The fog recedes from the new vantage point, the wellspring below starts to glow, a sky shrine linked to this one opens, and the trail extends. The Horizon recomputes.

Flashcards are optional. The learner can keep cards in their own tool (e.g. RemNote) and list links in the write-up's frontmatter. They are displayed as a count but never required.

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
      NEXT.md                  # optional "where I left off" line (the camp note)
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
- `biome`: optional, surface regions only (M6): one of `plateau | highland | ridge | steppe | coast | jungle | marsh | woods | canyon | workshop`. It sets the region's ground texture and elevation profile.

**Shrine**
- `id`: unique kebab slug, also the work folder name
- `title`: string
- `region`: region id. The region determines the layer.
- `kind`: `shrine` (default) | `tower` | `temple`
- `p`: prominence, 1..5. Default 2. Towers and temples are forced to 5.
- `size`: `S | M | L`. Default M. The timebox is roughly S = 2–3h, M = 4–6h, L = 8–12h.
- `requires`: optional list of tags: `gpu | arm | x86 | avx512 | linux | llm-api`
- `below`: depths only, required. The id of a surface shrine.
- `theme`: optional, surface and sky shrines only. A named sub-area of the region; shrines sharing a theme cluster together, and on the sky each theme is its own islet (see docs/decisions.md).
- `after`: optional list of shrine ids this shrine follows up on. A same-region, same-theme follow-up is placed next to its predecessor.
- `links`: optional list of shrine ids, treated as undirected for visibility purposes
- `needs`: shrine ids that must be cleared first. A temple is sealed until then (§5.2); an ordinary shrine is *locked* (§5.4). Not allowed on towers, and never in a cycle.
- `prompt`: what to build
- `done`: the shrine-specific clear condition
- `xy`: optional manual placement `[x, y]`
- `from`: in `proposed.yaml` only. The id of the shrine or tower that proposed it.

**Ridges.** A `default` height, plus `overrides: [{between: [a, b], h}]`.

**Start.** `vantage: [x, y]` and `plateau: [ids]`. Plateau shrines are always revealed once you've landed. Optional `sky: [ids]`: opening sky shrines, all on one island, where a fresh map begins (§6.6).

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
status: in-progress        # in-progress | shelved | cleared
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
| `camp` | `{note, since, current}` | In-progress shrines: first line of `NEXT.md`, when last touched, and whether it's *the* camp (§10.1) |
| `visibility` | `hidden \| silhouette \| revealed` | §6 |
| `xy` | position | §8 |
| `hoursEstimate` | number | §10.3 |

`build/map.json` contains the world (with positions), the regions (with generated geometry), the derived state, the trail, the pins and the Horizon. The front end is a pure renderer of this JSON. **All game logic lives in a shared TS module (`core/`) that both the CLI and the app import.** This keeps it unit-testable.

---

## 5. Clearing

### 5.1 Shrines

`stratum clear <id>` passes only if all of the following hold:
1. `work/<id>/WRITEUP.md` exists with valid frontmatter.
2. The three sections *What I built*, *How it works* and *What I measured / what surprised me* are each non-empty.
3. Together they contain at least `writeup.minWords` words. The default is 250 and it is configurable.
4. There is at least one artefact: a non-Markdown file in `work/<id>/` (excluding NEXT.md), or a non-empty `code:` field.
5. Every id in `needs` is cleared (temples, and locked shrines, §5.4).

On success it sets `status: cleared` and `cleared: <today>`, then prints the shrine's `done` text as a final self-check ("Did you: …?") and a suggested `git commit` command. It doesn't commit automatically. On failure it prints a checklist of what's missing.

The CLI can't check the shrine-specific `done` condition. It shows that text prominently at start, in the detail panel and at clear time, so the write-up gets written against it.

### 5.2 Temples

Temples are capstones. Until their `needs` are met they render as locked silhouettes, with the needs listed as a small constellation of shrine glyphs. Once the needs are met they become revealed and startable.

### 5.3 Towers

A tower clears like a shrine, except that it has no artefact requirement. In addition, `proposed.yaml` must contain at least 3 entries with `from: <tower-id>`. Clearing a tower:
- makes every shrine in its region at least a silhouette,
- turns the tower into a strong vantage point (§6.2), and
- counts as the region "surveyed". Its terrain renders fully, with no fog wash.

### 5.4 Locks: come back when you can

*(Added 2026-10-07 at the owner's request: dependencies as a metroidvania element, as long as they aren't common.)* An ordinary shrine may have `needs` when its task works on something you build in another shrine: your hash map, your SAE, your agent loop. Until those are cleared it is **locked**:
- It is **seen like any other shrine**: revealed by the usual rules, with its prompt and `done` readable. You can find it, see what it asks, and notice you don't have what it takes yet.
- The map draws a small **padlock** beside it, and the detail panel says what it needs. **Set out is disabled** (the CLI refuses without `--force`), the **Horizon leaves it out**, and `stratum clear` refuses while a need is uncleared. **Pinning it is allowed**, since that's what a place to come back to is for.
- When the last need is cleared it **opens by itself**, and a live map says so ("Unlocked: …").
- **Keep them rare.** In the seed, 12 shrines (about 5%) are locked, beyond the 6 temples, each one directly on its predecessor's artefact. A dependency that a quick stand-in could satisfy is an `after` with the stand-in named in the prompt, not a lock.

### 5.5 Starter kits

When a shrine needs material to work on and no earlier shrine provides it, the world ships a **starter kit**: `world/kits/<id>/`. `stratum start` copies it into `work/<id>/` byte for byte, in place of the code template (a kit brings its own build files). An untouched kit file is scaffold, not an artefact: the clear still needs something of your own. `stratum lint` errors on a kit folder that matches no shrine. The seed ships three: a reference-heavy order-book API (*Regular types*), an OOP particle simulation (*Data-oriented design*) and a slow rolling median with tests and a benchmark (*A minimal agent loop*, the task the whole Agent Workshops region reuses). See docs/plans/self-contained.md.

---

## 6. Visibility: the triangle rule

Open-world games use terrain (large and small "triangles") to control how many landmarks are visible at once. Large rises hide what lies behind them, which forces a choice: go around or climb. Small rises let you peek over them. Tall landmarks (towers, peaks) stay visible from far away and pull you toward them. Stratum implements this literally, as 2D line of sight across ridges.

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
- **revealed** if some `v ∈ V` has `d(v,s) ≤ R(p)` and `H(v,s) = 0` (after the tower bonus),
- else **silhouette** if some `v` has `d(v,s) ≤ 1.6·R(p)` and `p > H(v,s) + m`, where the peek margin is `m = 1`,
- else **hidden**.

*(Revised in M4b; see docs/plans/unknown.md. The v1 formulas were `p > H` and `p ≥ H`, which showed over half the world from the start vantage.)*

Overrides are applied in this order:
0. Before a sky start has landed (§6.6), every surface shrine is at most a silhouette.
1. Plateau shrines are revealed (silhouettes before landing).
2. Cleared and in-progress shrines are revealed.
3. Shrines in a region whose tower is cleared are at least silhouette.
4. Towers are at least silhouette everywhere on the surface. Their prominence of 5 makes this mostly automatic, but guarantee it.
5. Temples with unmet needs are at most silhouette.

The effect: across the plateau's low (h=1) borders, p≥3 shrines peek over as silhouettes. Behind a default ridge (h=2) only the tall landmarks (p≥4) do. That is the intended "a few things call to you" behaviour: a fresh repo shows about a fifth of the world. High ridges (h=4, e.g. Tick Canyon ↔ Agent Workshops) hide everything, so you have to walk around through a neighbouring region, or climb a tower (whose bonus lets p≥4 peek over them).

**Silhouette presentation.** A silhouette shows its glyph, size and region, but not its prompt. Its title shows on hover only if p ≥ 3 (landmarks are recognisable from afar); otherwise it shows "???". Setting out to a silhouette is allowed and reveals it.

### 6.3 Sky rule

- Island outlines and names are always visible, both on the sky layer and as faint shadows on the surface.
- A sky tower is always revealed, and so are the opening shrines of a sky start (§6.6).
- A sky shrine is **revealed** if its island's tower is cleared, or if any shrine in its `links` (in either direction) is cleared or in progress. That linked shrine is its *launch point*.
- Otherwise it is a **silhouette** if a launch point on another layer is revealed (you can see the updraft from the ground), and **hidden** if not. *(Revised in M4b: in v1 sky shrines were never hidden.)*
- On the surface, a launch point (a shrine linked to a sky shrine) gets a small upward-draft marker.

### 6.4 Depths rule

The depths are dark.
- Each depths shrine sits at the exact position of its `below` surface shrine (§8.3).
- A depths shrine **glows**, which is its silhouette state, if its `below` shrine is cleared or in progress. On the surface layer this shows as a faint chasm mark beside that shrine.
- A depths shrine is **revealed** if it lies within `lightRadius = 220` of any cleared depths shrine, or if it is in progress or cleared.
- Anything else in the depths is **hidden**, and so is the terrain. The depths layer renders black except inside light circles (radius 220 around cleared wellsprings) and small glows (radius 40).
- Depths "veins" (regions) are thematic. They colour the light (e.g. the Cache vein is teal and the Silicon vein is green) but have no borders.

### 6.5 Search

The search box only matches revealed shrines, and silhouettes with p ≥ 3 by title. Search never uncovers hidden shrines. Atlas mode (§9.5) is the escape hatch.

### 6.6 The sky start: the descent

*(Added 2026-10-06 at the owner's request.)* A world may begin on a sky island instead of the plateau, so the first shrine is a big idea and the practice comes after. `start.sky` lists the opening shrines; the seed opens on *Zero-cost, verified* on the Design Archipelago: one self-contained principle (an abstraction proved free with asm and benchmarks), linking down to the Template Highlands next to the plateau.
- **On the island.** The opening shrines are revealed. You look down: the start vantage still sees and explores the land (the fog lifts as usual), but nothing on the surface is more than a silhouette, the plateau included. The depths are dark as always. The app opens on the sky layer, and the Horizon starts from the first opening shrine.
- **The descent.** You've **landed** once an opening shrine is cleared: the glider is earned by a clear, not a start. From then on the map is exactly the plateau start (§6.2), and the Horizon's L is the start vantage, since that's where you came down. If the map is open, it switches to the surface with a short note.
- **Never a lock.** Starting or clearing any surface shrine also counts as landing (you climbed down yourself), and silhouettes may be set out for as usual (§6.2).
- A world without `start.sky` starts landed, as in v1.

---

## 7. The Horizon: three calls to adventure

The Horizon panel always shows **at most three** cards. It is the main way the triangle rule reaches daily decisions. It is recomputed only when the state changes (a start, a clear or a pin) and is otherwise stable within an ISO week. There is **no reroll button**. Option-shopping is the failure mode this feature exists to prevent.

Definitions:
- `L` is the most recently cleared shrine. If there is none, it is the start vantage, or the first opening shrine while a sky start hasn't landed. A cleared opening shrine counts as the start vantage (§6.6).
- `Recent` is the last 3 cleared shrines.
- Candidates are uncleared shrines and exclude any shrine with unmet needs (sealed temples and locked shrines, §5.4).
- Distances are measured in xy on the shared canvas, even across layers.

**Slot 1: the Thread** (continue)
1. If any shrines are in progress, use the camp (the most recently touched one, §10.1), shown as a "return to camp" card with its `NEXT.md` line.
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

- The landmass is a generated continent (*M6*, `core/src/landmass.ts`; it replaced the v1 ellipse). It's a smooth union of noisy lobes, one around each region's centroid, with a warped, multi-scale coast (bays, fjords, headlands), a few offshore islets and one or two inland lakes. Everything else is sea. It is deterministic from (surface regions, `world.seed`).
- **Guarantees** (build errors, code `landmass`):
  - every centroid lies in its own region's land;
  - each region keeps at least 3% of the land, and its main piece holds at least 85% of it;
  - all regions are one continent;
  - ridge overrides join regions that share a border (the existing warning).

  A failing seed is fixed by choosing another `world.seed`, which is only allowed while nothing has been started.
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

`elevation(pt) = biome profile(base noise) + 0.35·(prominence field) + ridge term`. The ridge term raises the terrain near borders in proportion to `h`. Each region's `biome` reshapes the base noise (M6): highlands and ridges rise and turn rugged, the plateau is a gently rolling mesa, marsh and coast lie low, the canyon is a tableland with a gorge, and the workshops are terraced. Profiles blend across borders over about 80 units. Contours are drawn with d3-contour on a coarse grid. Elevation doesn't affect game logic, except for tower placement.

**Features (M6, rendering only).** These are derived from the geometry, drawn only on explored land, and have no effect on sight, exploration or placement. Each has a stable id and an optional `name` (none yet):
- mountain ranges along h ≥ 3 ridges, with snow on h = 4;
- rivers from a priority flood over the elevation field, so they always reach the sea, a lake or another river, with gentle meanders;
- the lakes;
- cliffs where the ground inland is high, and beaches where it's low.

---

## 9. The interface

### 9.1 Layout

- **Top bar:** the layer switch (Sky · Surface · Depths; keys 1/2/3), search, and a small region-completion readout.
- **Left:** the Horizon (3 cards). On narrow screens it collapses into a bottom sheet.
- **Centre:** the map, with pan and zoom (d3-zoom) and zoom-dependent labels. Region names show at low zoom and shrine titles at high zoom.
- **Where it opens** (`map.focus`, derived from the repo, so no browser storage): your camp; else your latest clear (a cleared opening shrine means the landing); else, on a fresh sky start, the opening shrine, selected so the start is explicit; else the start vantage. The map opens on that layer, zoomed in on it.
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
- **The unknown** (M4b, docs/plans/unknown.md). The shape of the land is hidden until you have looked at it. From the start vantage and every surface shrine you've worked on, rays run out to R(2) (R(2) + 300 from a cleared tower) and stop just past the first ridge of h ≥ 2 (a cleared tower counts ridges 2 lower). A cleared tower also charts its whole region. Outside that explored land the surface is blank paper, with no coastline, borders, ridges, contours or region names. Silhouettes float on it, and their region reads "Uncharted". Explored land never shrinks.
- The sea is a flat blue-grey with sparse wave strokes.

**Sky**
- A pale, luminous blue-white.
- Islands are cream blobs with drop shadows.
- The surface is visible below at 15% opacity.

**Depths**
- Near-black.
- Light circles are radial gradients tinted by vein colour.
- Glows are small pulsing points (static if reduced motion is on).
- Cleared wellsprings are bright nodes.

**Glyphs** (simple, original SVG)

| Element | Glyph |
|---|---|
| Shrine | Small rotated square with an inner dot. Filled when cleared, outlined when revealed, grey when a silhouette. |
| Tower | Tall narrow obelisk |
| Temple | Stepped pyramid |
| Sky shrine | Ring |
| Wellspring | Starburst |
| Camp | Small flame, fading over 14 days since last touched, then embers (visual only) |
| Cairn | Three stacked stones |
| Pin | Stamp |

**Typography.** A serif for map labels (e.g. Cormorant Garamond via Google Fonts), a clean sans for UI and a monospace for code. Colours are defined as CSS tokens. The UI chrome supports light and dark modes. The map layers keep their own palettes in both.

### 9.4 The trail

A thin dotted line connects cleared shrines in `clearedAt` order, per layer. Hovering over a segment shows its dates. There's an optional toggle to show path density by week.

### 9.5 Atlas mode (authoring)

`?atlas=1` shows a spoiler warning, then a sortable table of every shrine, including hidden ones, plus a "reveal all" map toggle. It exists for reviewing and editing the world, not for everyday use.

---

## 10. Progress signals

### 10.1 Camp and cairns

*Revised after M4 (docs/plans/camps.md).* Exactly one in-progress shrine is the **camp**: the most recently touched (the latest of NEXT.md's mtime, WRITEUP.md's mtime, the last commit and the start date). It renders as a flame, burning down to embers after 14 untouched days, and it is the Horizon's Thread. Every other in-progress shrine is a **cairn**, work you stepped away from. Both show the `NEXT.md` first line on hover and are vantages. `stratum shelve <id>` sets `status: shelved`: the work stays in git and the shrine stays revealed, but it has no marker, is no vantage, and never appears on the Horizon. `stratum start <id>` takes it off the shelf. A map key (key K) explains every glyph.

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
| `stratum build [--replace <id>] [--static [--public [--link <url>]]]` | Compute positions (respecting the lockfile), derived state, visibility and Horizon, and write `build/map.json`. `--static` bundles the app into `build/static/`. `--public` makes that the public site's map: built fresh (no `work/`, no pin), with hidden shrines dropped and unrevealed prompts blanked, no Atlas, and a note linking to `--link` |
| `stratum sandbox [--reset]` | Copy this world (no `work/`, empty pin) into `build/sandbox/` with its own git history, and serve it like `dev` (port 5174): a fresh start to playtest without touching your progress |
| `stratum dev` | Vite dev server plus a local API (localhost only), with a file watcher that rebuilds on changes under `world/`, `work/` and `state/` and pushes updates over SSE |
| `stratum start <id> [--force]` | Scaffold `work/<id>/` from a template (cpp or python, based on `region`, with a flag to override) and set `status: in-progress` and `started`. Copies `world/kits/<id>/` instead of the code template when a kit exists (§5.5). Refuses to start a hidden shrine or a locked one (§5.4) without `--force`. |
| `stratum clear <id>` | Validate (§5), stamp the date, and print the checklist and suggested commit |
| `stratum status` | Counts by layer and region, plus the camp, cairns and shelved work |
| `stratum shelve <id>` | Set in-progress work aside (`status: shelved`); `start` resumes it |
| `stratum horizon` | Print the three Horizon cards in the terminal |
| `stratum pin <id> \| --clear` | Set or remove the pin |
| `stratum propose --from <id> [--thread <n> \| --text <t>]` | Append a proposal stub to `proposed.yaml` with `from`, opening `$EDITOR` if set. Without `--thread` it lists the write-up's loose threads to choose from |

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
  - p=2 shrines across a default ridge are hidden and p=3 ones are silhouettes *(p=3 hidden and p=4 silhouettes since M4b)*;
  - an h=4 ridge hides p=3;
  - the tower bonus reveals across an h=2 ridge;
  - the depths are dark until a wellspring is cleared;
  - glows appear under cleared surface shrines;
  - a fresh repo shows only the plateau, the silhouettes visible from the start vantage, the towers and the sky islands.

### M4: The Horizon and pins
- §7 in full, the CLI `horizon`, the Horizon panel, the dev API and SSE live updates.
- **Accept when:**
  - the Horizon is deterministic for a given state and week;
  - no slot ever shows a hidden shrine;
  - pin routing picks "on the way" shrines;
  - a fixture test covers each fallback branch.

### M4b: The unknown
- Added after M4 (docs/plans/unknown.md): the peek margin, hideable sky shrines, and explored land (§9.3), with blank paper outside it.
- **Accept when:**
  - a fresh repo on the seed shows 15–25% of all shrines (sky included), with the whole start region revealed and non-tower shrines in at least three other regions;
  - no coastline, border, ridge or contour is drawn outside explored land (Atlas mode excepted);
  - clearing a tower charts its region; shelving never un-explores land;
  - explored land is a pure, deterministic function of the repo.

### M5: The trail, hours and polish
- The trail, the hours estimate, layer transitions, reduced motion, dark UI chrome, mobile layout, Atlas mode and the static build.
- **Accept when** Lighthouse accessibility is at least 90, and the map is usable at 390 px width with the Horizon as a bottom sheet.

### M6: Geography
- Added after M5 (docs/plans/geography.md): the generated continent (§8.1), a `biome` field per surface region, and rendering-only features (§8.5).
- **Accept when:**
  - the landmass passes its guarantees for the configured seed;
  - two builds are identical;
  - adding a shrine to proposed.yaml still moves nothing;
  - a fresh repo still shows 15–25% of the world;
  - the biomes, ranges, rivers and lakes render, on explored land only.

### Future milestones (planned, optional)

These are proposals, each with open questions for the owner in its plan. They're numbered for reference, not strict order; the recommended order is in docs/plans/template.md (M10, then M11, then M12 → M14 → M15 → M16, with M13 anywhere after M12). Anything that reshapes the world is only cheap before the first `stratum start` (see M8).

### M7: Expeditions (docs/plans/reset.md)
- Reset the map without losing the work: `stratum expedition new` archives `work/` into `archive/expedition-<n>/`. Also `stratum erase` (delete the work), and a new-world step (a new seed) that's only allowed with `work/` empty. All CLI only, a dry run by default, confirmed by typing a count.
- **Accept when:** a new expedition returns the map to its fresh state with every write-up preserved in the archive and no position moved; erase and new-world refuse without confirmation; the four questions in the plan are answered.

### M8: World editing (docs/plans/world-editing.md)
- E1: JSON Schemas, a region `weight` (shrink or grow regions, e.g. Vector Coast), `papers:` in WRITEUP.md, `source:` on proposals.
- E2: a core edit module with dry-run diffs, plus `stratum add` and `stratum region`.
- E3: a browser Edit mode (region handles with preview, add/edit forms, an uncommitted-changes banner). The YAML is the contract and the interfaces are clients.
- E4 (optional): a shared paper library, split world files, a papers layer.
- **Timing:** E1's `weight` changes region shapes, so it needs a lockfile regeneration. Do it before the first shrine is started.
- **Accept when:** every edit goes through the core module with a dry-run diff; the YAML validates against the schemas; no edit moves a locked shrine except by an explicit `--replace`.

### M9: Feature names (docs/plans/geography.md)
- Generated names for the M6 rivers, lakes and ranges (the owner chose generated), filling the features' optional `name`, shown once explored. Deterministic from the seed and feature id, overridable in world-seed.yaml.
- **Accept when:** names are stable across builds, never collide within a layer, and appear only on explored land.

### M10: Ready to share (docs/plans/template.md)
- Rename the two coined game terms (to *wellspring* and *trail*), make the docs neutral ("inspired by open-world exploration games"), move personal details out of shared docs, and add a `LICENSE` plus a third-party notice.
- **Accept when:** no game names or coined terms remain outside one inspiration sentence; tests pass; behaviour is unchanged.

### M11: Treasure, secrets and total completion (docs/plans/treasure.md)
- **Chests:** about 7% of locations, at geometry-chosen hiding spots, locked like shrines and found by exploring. Their contents come from a sealed `world/treasure.yaml`, matched to spots by affinity.
- **Secrets:** echoes (a hidden concept unlocks when a write-up mentions it) and feats (repo facts such as a shrine plus its depths).
- **Found side tasks clear like shrines.** Contents are written and sealed by a model, unseen by the owner.
- **Total completion: how much, never where.**
  - When every region reaches 75% cleared, a tracker shows the *percentage* of all content completed (shrines, chests, secrets), with no locations.
  - When 75% of all content is complete, an *optional* remaining-locations view (off by default; it shows locations, never contents) can mark where everything still incomplete is.
- **Accept when:** treasure is invisible until found and stable across builds; sealed text never reaches `map.json` before it's opened; a chest task clears like a shrine; an echo unlocks from a write-up; the tracker appears exactly at the per-region threshold and shows no locations; the remaining-locations view unlocks only at 75% of all content and is opt-in.

### M12: World packs (docs/plans/template.md)
- Move every topic-specific assumption into `world/pack.yaml`: the `requires` vocabulary and its probes, templates and when they're the default, task kinds and their artefact rules, and colours. Shrines get a `kind`. Content edits become safe: a lint drift check and `stratum rename`.
- **Accept when:** the owner's world runs unchanged from its own pack; a fixture runs with a different vocabulary; no region id appears in engine code.

### M13: Learning materials (docs/plans/template.md)
- Notes, papers and Q/A flashcards as first-class work files, counted and shown, with an Anki export. Still no spaced repetition (§15).
- **Accept when:** a `cards`-kind shrine clears on its cards; the export round-trips into Anki.

### M14: The world-design scaffold (docs/plans/template.md)
- JSON Schemas; `docs/world-design.md` (the craft of a good world, written for models); `stratum lint --design` (measurable design properties); `stratum simulate` (a synthetic learner reports the discovery curve and reachability).
- **Accept when:** the owner's world passes with explained warnings and gives a baseline curve; deliberately bad fixtures are each caught.

### M15: The world generator (docs/plans/template.md)
- A Claude Code skill: interview → `world/brief.md` → staged drafting with subagents → revision against lint, design lint and simulate → sealed treasure → a spoiler-safe handoff. Generated worlds seal shrine prose by default.
- **Accept when:** lint-clean, in-range worlds for three unlike topics, with tasks a fresh reviewer finds concrete and checkable.

### M16: Template release (docs/plans/template.md)
- A GitHub template repo with an empty starter pack, the generator, example packs, `stratum new` and `stratum doctor`, and a first-hour guide.
- **Accept when:** a clean machine goes from clone to a generated world on the map in under 30 minutes using only the README.

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

## 16. Defaults the owner can change later

| Decision | Default | Where |
|---|---|---|
| Word minimum for a write-up | 250 | `stratum.config.yaml` |
| Hardware available | `[linux, llm-api]` (add `gpu` once a GPU is available, e.g. a university cluster or a cloud instance) | `stratum.config.yaml` |
| Silhouette titles shown from | p ≥ 3 | config |
| Visibility constants | R(p) = 150 + 90p, 1.6× silhouette band, peek margin 1, tower +300/−2, explore rays stop at h ≥ 2, light 220 | config |
| Horizon far distance | 450 | config |
| Project name | "Stratum" | everywhere; rename freely |
