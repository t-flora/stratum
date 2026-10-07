# Decisions

Choices made where DESIGN.md is silent (§0: "choose the simplest thing that preserves the constraints").

## M0

- **Seed location.** `world-seed.yaml` was at the repo root; moved to `world/world-seed.yaml` per §4.1. Content unchanged.
- **`proposed.yaml` shape.** A top-level `shrines:` list, same shrine schema as the seed plus a required `from`. An empty or null `shrines:` is valid.
- **Severity.** Unknown fields, `from` in the seed file, a temple without `needs`, self-links and duplicate ridge overrides are *warnings*. All §4.2 rules and type errors are *errors*; `stratum lint` exits 1 on any error.
- **Extra checks beyond §4.2.** Ids must be kebab-case; `p` is an integer 1..5; `size`, `kind`, `requires` tags are enumerated; `needs` only on temples; temples only on the surface; `below` must point at a *surface* shrine; plateau ids must resolve to surface shrines; depths veins may not have towers; surface/sky regions need a centroid and sky islands a radius.
- **Ridge adjacency warning deferred to M1.** "Override between non-adjacent regions" needs the region classifier (§8.1), which is M1 work. M0 validates that both regions exist and are on the surface.
- **Diagnostic format.** `file:line:col  severity  [code] message`, sorted by location. Lines point at the offending value (e.g. the specific `links` item), not just the shrine.
- **Workspaces.** `core/` and `cli/` exist now; `app/` is added in M1. Packages are consumed as TypeScript source via tsx/vitest, no build step.
- **Running the CLI.** `npm run stratum -- <cmd>` or `alias stratum='npx tsx cli/index.ts'`. `--root <dir>` points at another world (used by fixtures).
- **§2.1 counts.** Lint reports 119 surface / 38 sky / 60 depths entries. §2.1's 103 / 33 excludes towers and temples (119 − 10 − 6, 38 − 5), so there is no mismatch.

## Hardware tags and per-machine config (after M0)

- **`x86` tag added** to the `requires` vocabulary (DESIGN.md §4.2 and the seed header updated). Tagged only where the prompt names x86 ISA/hardware explicitly: `memory-order-litmus`, `swiss-table-probe` (SSE2), `simd-intrinsics-dot`, `simd-stream-compaction`, `cpu-gemm-tiling`, `latency-measurement` (rdtsc), `asm-calling-convention`, `asm-avx512-masks` (alongside `avx512`), `uarch-frontend-alignment` (DSB), `temple-cpu-gemm`. Left untagged because they work on either ISA: `std-simd`, `simd-parsing`, `asm-atomics-codegen`, `bits-integer-tricks`.
- **`stratum.local.yaml`** (gitignored) overrides `stratum.config.yaml` section by section; arrays are replaced. `stratum setup` detects `linux`/`x86`/`arm` from Node's platform/arch, `avx512` from `/proc/cpuinfo` or `sysctl`, `gpu` from `nvidia-smi`, and `llm-api` from `ANTHROPIC_API_KEY`, with `--with`/`--without` overrides. `stratum lint` validates the effective config and notes when no local file exists.

## M1

- **Landmass.** The §8.1 ellipse with its *radius* perturbed by angular simplex noise (three octaves, about ±9%), so the coast is star-shaped: no offshore islets or inland lakes to confuse classification. Land also stops 12 units short of the canvas edge.
- **Domain warp.** Two octaves: amplitude 40 at wavelength ~320, plus 12 at ~110. Classification is nearest-centroid on the warped point, stored on a 2-unit grid; `classify` uses the nearest grid sample.
- **Adjacency** requires at least 5 shared grid edges (10 units of border), so noise slivers don't count. This drives the deferred §4.2 warning, which now runs in `stratum lint` and `stratum build`.
- **Elevation.** Base noise plus a ridge term `0.12·h·exp(−(d₂−d₁)/25)`, tapered to the coast. Tower placement uses this *without* the prominence field, since shrine positions aren't known yet when towers are placed. Rendered contours include the prominence field (Gaussians, σ = 45, weight p/5).
- **Spacing is per layer.** Surface shrines keep 38 from other surface shrines, sky 26 from other sky shrines. Surface placement also keeps 10 units from the coast so glyphs don't hang off. Sky shrines stay within 0.95 × the archipelago radius; see the M1 revision below. The seed places with no relaxation.
- **Already-fixed positions are placed first.** Every locked or `xy` shrine is fixed before new shrines are placed, so a new shrine keeps clear of locked shrines later in file order too.
- **Temples** are rejection-sampled along random rays at 60–85% of the centroid-to-border distance. Tests verify the ratio.
- **Depths joining a locked ring.** Existing wellsprings are locked. When a new depths shrine joins a group whose members are locked, it takes the ring slot (for the new group size k) farthest from the locked members, rather than reshuffling the ring.
- **The lockfile keeps stale ids.** Entries for removed shrines stay, so re-adding an id restores its position. Coordinates are rounded to 0.1 and keys sorted, one per line.
- **Geometry export.** Region outlines come from marching squares (d3-contour, 4-unit grid) on the soft field `min(d_nearest_other − d_own, land)`, which is positive exactly inside the region, so borders are smooth and agree with `classify`. Ridges are the zero set of `d_b − d_a`, clipped to where a and b are the two nearest regions on land. Contours use an 8-unit grid.
- **App ↔ core.** The app imports only types, from `@stratum/core/mapdata`, never the Node-side code. `stratum dev` builds, then starts Vite with a middleware serving `build/map.json`. The watcher, API and SSE are M4. Until then, re-run `stratum build` and reload.
- **`?layer=sky|surface|depths`** sets the initial layer (handy for links and screenshots).
- **M1 is an atlas view.** Every shrine renders revealed and untouched. Depths show small vein-tinted glows around every wellspring; the real darkness and light rules are M3.

## M1 revision: thematic clusters, archipelagos, depths territory

Added after the M1 review, at Tiago's request. These extend DESIGN.md §4.2 and §8.2–8.3.

- **`theme` (new field).** A free-text sub-area name per surface/sky shrine, grouped by exact string within a region. Towers and temples take no theme (a warning if given). Themes in the seed were drafted for review: 3–4 per region, 2–5 shrines each.
- **`after` (new field).** A directed "follows up on" edge. It's validated (it must resolve and has no cycles). Placement puts predecessors first and lands a same-region, same-theme follow-up 1–1.5× spacing from its predecessor. Cross-region `after` edges are recorded but don't affect placement; the Horizon may use them later. 42 edges were drafted, mostly where a prompt says "your X".
- **Theme anchors are locked** in `positions.lock.json` under `@<region>/<theme>` keys.
  - On the first build, anchors are spread by angle around the centroid (in theme order, so consecutive themes are neighbours) and then Lloyd-relaxed over the region.
  - A theme added later gets the free spot farthest from the existing anchors and the centre, so nothing moves.
  - Each themed shrine is sampled around its anchor (Gaussian, σ ≈ 0.28 × half the distance to the nearest sibling anchor, clamped to 28–50) and must stay nearer its own anchor than any other.
- **Temples** aim their 60–85% ray at the mean position of their same-region `needs` (a depths need counts at its `below` shrine), so the capstone sits at the end of its trail.
- **Archipelagos replace the single sky blob (§8.2).**
  - Theme anchors sit on a ring at 0.6 × radius. The sky tower stands on its own rock at the centre.
  - Each themed sky shrine must be at least 60 units closer to its own anchor than to any other anchor or the centre, so islets never merge.
  - Islet outlines are metaballs (σ ≈ 17, with noise) drawn *around placed shrines*: adding a shrine grows its islet and moves nothing. 3–5 seeded bare rocks per archipelago add texture.
- **Depths territory.** Rendering only. Beneath the landmass, each point belongs to the vein of its nearest wellspring (domain-warped), which draws vein territories, plus rock-strata level lines. M3 will show it only inside light circles, per §6.4. The M1 atlas view shows it dimly everywhere.
- **Labels.** Region names show at zoom < 1.5, placed by a small search around the centroid for the spot with the most clearance from glyphs. Theme names show at 1.5–2.4 on the surface (above the cluster) and always on the sky (below each islet). Shrine titles show at ≥ 2.4. `?zoom=<k>` sets the initial zoom.
- The lockfile was regenerated for this change (no clears existed yet).

## M2

- **What counts as cleared.** A shrine is cleared only if its WRITEUP.md says `status: cleared` *and* the §5 checks still pass at build time. Hand-editing the status therefore clears nothing (§0.2). The shrine stays in progress, and `stratum lint` warns (`invalid-clear`). Temples are resolved to a fixed point, since their validity depends on other clears.
- **Section matching.** The three required sections are `## ` headings matched case-insensitively, ignoring spacing around `/`. Headings inside code fences don't count. HTML comments (the template's hints) are neither content nor words.
- **Word count.** Whitespace-separated tokens containing a letter or digit, across the three required sections only. Fenced code blocks don't count, since the minimum is about explanation. *Loose threads* doesn't count either.
- **Artefacts.** A file is an artefact if it's not Markdown, not hidden (no path part starting with `.`), and not an untouched copy of the template file at the same path (compared after filling placeholders). Otherwise the scaffold from `stratum start` would satisfy rule 4 on its own. `build/`, `__pycache__/`, `node_modules/` and dot-directories are skipped entirely.
- **Default template.** `python` for the `interp-engineering` and `interp-theory` regions and for any shrine that `requires: llm-api`; `cpp` otherwise. `--template` overrides it.
- **Templates.** `templates/WRITEUP.md` and `NEXT.md` take `{{id}}`, `{{title}}`, `{{started}}`, `{{done}}` and `{{prompt}}`. Code templates (`templates/cpp/`, `templates/python/`) only take shrine-derived values (`{{id}}`, `{{title}}`, `{{module}}`: the id with `_` for `-`), so untouched scaffolds can be recognised. The WRITEUP puts the `done` text in an HTML comment at the top, to write against. The cpp stub is CMake + C++20 (`cmake-modern` replaces it); the python stub is a uv `pyproject.toml` with pytest.
- **`stratum start` on an existing folder** never overwrites. If WRITEUP.md exists it reports "already started". If the folder exists without one, only WRITEUP.md and NEXT.md are added, not the code scaffold.
- **Locked temples.** `start` refuses a temple with uncleared `needs` unless `--force`. Refusing hidden shrines waits for M3; until then every shrine counts as revealed.
- **Clear stamping** edits the `status:` and `cleared:` lines in place, keeping the template's comments aligned, rather than re-serialising the YAML. Dates are the local calendar day.
- **`committed`.** A cleared WRITEUP.md is committed if it's tracked and matches HEAD: not listed by `git diff HEAD --name-only` (staged or unstaged) or `git ls-files --others`. Outside git, or before the first commit, nothing is committed.
- **Touches.** One timestamp per commit per `work/<id>/` (committer time, `%ct`), via `git log --relative` from the world root, so `--root fixtures/...` inside this repo works too.
- **Campfires.** In-progress shrines carry `campfire: { note, since }`. `note` is the first non-blank line of NEXT.md without a heading or list marker. `since` is NEXT.md's mtime, else the last touch, else `started`. The flame's opacity eases from 1 to 0.25 over 14 days and never goes out, since the work is still open.
- **Uncommitted clears** get a dashed halo around the (filled) glyph instead of a dashed body outline. A dashed stroke on a filled glyph is hard to see.
- **map.json** gains `builtAt` and, per shrine, `startedAt`, `clearedAt`, `committed`, `touches`, `campfire`, `hours`, `remnote` and `writeup` (the Markdown body, cleared shrines only).
- **Detail panel.** Opens on click (or Tab + Enter), closes on Escape or a click on open ground. `?select=<id>` opens it on load. Relation chips cover above/below, launch points, links (both directions), needs, follow-ups and the proposer; following one switches layer. Chips to hidden shrines will show "???" once M3 hides things. The panel also has copy buttons for the work path and the next command (`stratum start` / `stratum clear`). Set out and Pin are M4.
- **Markdown.** markdown-it with `html: false`, and highlight.js `common` (cpp, c, python, bash, json, yaml, …) plus x86asm and armasm, with `cuda` aliased to cpp. Prompt and `done` text render as inline Markdown. Relative images in write-ups don't load yet (nothing serves `work/`).
- **`stratum status`** (§11) is included, since it only needs derived state: counts per layer, regions with activity, campfires and uncommitted clears.

## M3

- **The §6.2 formulas vs. its narrative and tests (needs Tiago's review).** As written, "revealed if `p > H`, silhouette if `p ≥ H`" makes a p=2 shrine behind a default ridge (h=2) a *silhouette*, and a p=3 shrine *revealed* within R(3). The narrative ("ordinary p=2 shrines in the next region are hidden… only landmarks (p≥3) peek over it, as silhouettes") and the §13 M3 acceptance tests say hidden and silhouette. Implemented, to match the narrative and tests:
  - **revealed** if `d ≤ R(p)` and the line is unobstructed (effective `H = 0`);
  - **silhouette** if `d ≤ 1.6·R(p)` and `p > H`;
  - a cleared tower still uses `R(p) + 300` and `H − 2`, so it reveals across an h=2 ridge and lets p≥3 peek over an h=4 one.
  
  Consequence: nothing across a ridge is ever revealed by ordinary sight, however prominent; you walk over, or climb a tower. If Tiago prefers "revealed if `p > H + 1`" (so p≥4 landmarks reveal across a default ridge), it's a one-line change in `surfaceSight`.
- **Sea on a sight line** is skipped: H compares the regions on either shore, so looking across a bay still crosses their ridge.
- **Vantages.** Start vantage, active (cleared or in-progress) surface shrines, and cleared towers with the bonus. An in-progress tower is an ordinary vantage. Plateau shrines are revealed but aren't vantages.
- **Overrides** apply in the §6.2 order, so a `--force`-started temple with unmet needs stays a silhouette.
- **Terrain is injected.** `computeVisibility` takes a `Terrain` (`regionAt`, `ridgeHeight`). `Geometry` satisfies it, so rendering, placement and line of sight share one classifier; tests use synthetic bands.
- **map.json** gains `sight` (surface vantages and fog radii; depths lights and glows with their radii), `surveyed` on regions, and per shrine `titleKnown` and `marks` (`chasm` beside an active shrine with wellsprings below it, `draft` on a launch point to a sky shrine). The app still receives every shrine, including hidden ones, and filters; Atlas mode (M5) needs them.
- **Fog** is a soft-edged mask: land outside every vantage's R(2) (R(2) + 300 for cleared towers) and outside surveyed regions gets a grey paper wash at 74% opacity. The coastline draws over it; silhouettes draw over it.
- **Depths.** Terrain (vein territories, strata) is masked to light circles (220 around cleared wellsprings) and glows (40 under active surface shrines). Glowing wellsprings render as small points with a pulsing halo, revealed ones as dim starbursts, cleared ones bright.
- **Silhouettes in the UI.** "???" for titles when p < 3, in tooltips, labels, chips and the panel. The panel hides the prompt, `done` and relations for silhouettes, except that a sealed temple shows its `needs` (the constellation of §5.2, in the panel rather than on the map). Theme labels appear once a member is revealed.
- **`stratum start`** now refuses hidden shrines without `--force`; silhouettes may be started (§6.2). It runs the build pipeline without writing to get visibility.
- **Search (§6.5)** isn't built yet; there's no search box. It belongs with the top-bar work in M5.

## Atlas toggle (pulled forward from M5)

- **Map half of §9.5, now.** Asked for after M3, to check the full world. Press **A** or the top-bar **Atlas** button, or open `?atlas=1`. A spoiler warning comes first every time, and A or the button again returns to the real view. The URL keeps `?atlas=1` while it's on.
- **Presentation only.** `atlasView` marks every shrine revealed and named in the app's copy of map.json. MapView drops the fog and draws the depths terrain dimly everywhere, with a small glow at each wellspring, as the M1 atlas view did. Work state is unchanged, and nothing is stored in the browser.
- **Still M5:** the sortable table of every shrine.

## M4

- **The Horizon is a pure function** of (world, positions, per-shrine state, pin, available hardware, ISO week): `computeHorizon` in `core/src/horizon.ts`. "Recomputed only on state changes, stable within a week" follows from that. The same inputs give the same cards, and the week only enters through the Far Landmark tie-break, `hash32(week + id)`. There's no reroll.
- **Candidates** (all slots): uncleared, not hidden, not a temple with unmet needs, and every `requires` tag in `hardware.available`. So no slot can show a hidden shrine. Campfires skip the hardware filter: work already started stays on the Horizon.
- **L** is the latest `clearedAt` (ties: later in file order), else the start vantage on the surface. **Recent** is the last three clears in that order.
- **Slot 1.** The most recently touched campfire. "Touched" means the latest of NEXT.md's mtime, the last commit, and the start date. Otherwise, with a pin, the revealed candidate on L's layer within `farDistance` minimising `d(L,s) + d(s,pin)`, ties by id. If none is that close, it falls back to the nearest revealed candidate (ties: p descending, then id). A pin on a cleared or unknown shrine is ignored.
- **Slot 2** takes the first rule with a match, each resolved by nearest-to-L:
  1. a glowing wellspring under a Recent shrine;
  2. a revealed sky shrine linked either way to a Recent shrine;
  3. if L is a depths shrine, the surface shrine above it, else the nearest revealed surface candidate;
  4. the nearest revealed candidate on a layer other than Slot 1's.
- **Slot 3.** Silhouettes with p ≥ 3 at least `farDistance` from L, sorted by the region's cleared fraction (ascending), then p (descending), then `hash32(week + id)`. If none qualify, an uncleared tower, then an open temple, by the same order. The card carries a compass bearing from L (degrees clockwise from north) and the distance.
- **Cards** carry `slot`, `id`, `rule` (which §7 branch fired, shown as a short "why" line), `distance`, `teaser` (the first sentence of the prompt, revealed shrines only) and `bearing` (Far Landmark only). The app looks up the rest from `shrines`, and uses "???" when the title isn't known.
- **Pins.** `state/pins.yaml` holds `pin: <id>` or `pin: null`. `stratum pin <id>` and `POST /api/pin` refuse unknown, hidden and cleared shrines. `stratum clear` removes the pin when it clears the pinned shrine and adds `state/pins.yaml` to the suggested `git add`. `stratum lint` warns about a pin that matches no shrine. On the map, the pin is a red stamp above the shrine on its own layer, shown only if the shrine is in sight.
- **Hardware badge.** Each map shrine carries `unavailable` (its `requires` tags missing on this machine). The panel shows `requires` tags as dashed "needs X" pills.
- **The dev API** is a Vite plugin (`cli/dev.ts`) that `stratum dev` passes to `createServer`. It isn't in `vite.config.ts`, so core stays out of the Vite config bundle.
  - Routes: `GET /api/health`, `GET /api/map`, `GET /api/events` (SSE, `event: map` after every rebuild, including failed ones, with the error), `POST /api/start {id}` and `POST /api/pin {id|null}`.
  - Writes must be `application/json` from the same origin, so another site can't drive them (it would need a CORS preflight we never answer). The server binds 127.0.0.1.
  - `/api/start` never forces: hidden shrines and locked temples need the CLI's `--force`.
- **The watcher** uses Node's built-in recursive `fs.watch` on `world/`, `work/` and `state/`, not chokidar. That avoids a new dependency, and recursive watching works on macOS and Linux in Node 20+. It debounces 150 ms and ignores `.venv`, `node_modules`, `__pycache__`, `build`, `.git`, editor swap files and `positions.lock.json`, which the build writes itself.
  - Rebuilds reuse cached geometry (`BuildCache`): `Geometry` is keyed on seed, canvas, regions and ridges; exported map geometry on positions plus each shrine's region, theme, kind and p. Work, pin and write-up changes rebuild without recomputing terrain.
  - A failed rebuild keeps serving the last good map and shows the error as a toast.
- **In the app**, the Horizon panel sits on the left (the §9.1 bottom sheet on narrow screens is M5). Set out and Pin call the API when `/api/health` answers. Otherwise, as in a static build or plain `vite`, they copy the CLI command. A campfire card shows "Continue", which opens the panel, instead of Set out. The detail panel has the same Set out / Pin buttons. The Horizon panel hides in Atlas mode.

## M4 review fixes

- **The Horizon panel no longer pins down the left of the map.** It shrinks to its content and folds to a small tab (the ‹ button, or key H). The state is in memory only.
- **More room to move.** Zoom goes down to 0.6× and panning reaches well past the canvas edges (0.6 W, 0.4 H), so anything under a side panel can be dragged into view. Zoom buttons (+, −, reset) sit top right for trackpads.

## Camps and shelving (after M4, before M5)

Agreed with Tiago: camp/cairn vocabulary, shelving, before M5 (see `docs/plans/camps.md`). DESIGN.md §10.1, §9.3, §4.3, §4.4, §7 and §11 have been updated.

- **Exactly one camp, derived.** `deriveWorkState` marks the most recently touched in-progress shrine `camp.current` (ties by id). "Touched" is the latest of NEXT.md's mtime, WRITEUP.md's mtime, the last commit and the start date, taken at the *start* of that day so any real edit that day wins. Every other in-progress shrine is a cairn. The Horizon's Thread uses the same flag, so the map and the Horizon can't disagree. The rule is renamed `campfire` → `camp`, and map.json's `campfire` → `camp: {note, since, current}`.
- **Cairns stay vantages** and still light the glow below (Tiago didn't object to the recommendation). Walked land stays walked.
- **Embers.** Past 14 days untouched, the camp's flame becomes embers. The flame fades from opacity 1 to 0.45 over those 14 days.
- **Shelving.** `status: shelved` is a new WRITEUP.md value, set by `stratum shelve <id>` or `POST /api/shelve`.
  - A shelved shrine keeps its own reveal (like any worked shrine) but is not a vantage, glow source or sky launch point, and is never a Horizon candidate. It has no marker.
  - `stratum start <id>` on a shelved shrine sets it back to in-progress, and it becomes the camp because WRITEUP.md was just touched.
  - `stratum clear` works on shelved work directly.
- **Map key.** Key K, or the "Key" tab bottom left, opens a short legend: every glyph, the camp and cairn meanings, and what fog is.
- **The world-editing plan's answer.** When a region shrinks, the land goes to its neighbours (region weights).

## M4b: the unknown (after the camps, before M5)

Agreed with Tiago: about 20% in sight on a fresh repo, sky included; the peek margin rather than raising the plateau ridges; ray-traced explored land; sky islands stay visible. The full plan and the measurements are in `docs/plans/unknown.md`. DESIGN.md §6.2, §6.3, §9.3, §13 (M3 note, new M4b) and §16 have been updated.

- **Peek margin.** A silhouette needs `p > H + peekMargin` (config, default 1). This replaces the M3 rule `p > H`. Revealing is unchanged. The M3 bullet above about the `p > H + 1` variant is superseded: that variant was for *revealing*, whereas this one is for silhouettes.
- **Sky shrines can be hidden.** They're silhouettes only once a launch point on another layer is *revealed*, and links between sky shrines don't count. Sky is computed after the surface and depths, so it can look at them.
- **Explored land** is computed in core (`explore.ts`) from the same `Terrain` as line of sight. The explorers are the start vantage and every worked surface shrine, shelved included: shelving stops sight, not memory. It uses 360 rays per explorer with a 4-unit march, each stopping 10 units past the first ridge of h ≥ `exploreRidge` (config, default 2) after the tower bonus. Surveyed regions are explored in full.
- **The renderer** masks all surface terrain to explored land, with a 5-unit feather and a faint wash outside the edge, over blank paper (`--unknown`). The masked terrain includes the sky layer's faint ground. Island ground shadows stay, since the islands are always visible. Atlas draws everything.
- **Region names** show once 15% of the region's land is explored (or it's surveyed). A partly explored region (< 90%) is labelled around the centre of its explored part (`regions[].explored.centre`, sampled every 10 units).
- **Uncharted silhouettes** (`charted: false`: a surface shrine off explored land) read "Uncharted" for their region, and their theme is hidden, in the tooltip, the panel, the chips and the Horizon.
- **Explored-but-hidden.** Land can be explored while p=2 shrines on it stay hidden (across an h=1 border, or in a surveyed region). Terrain and shrines are separate reveals, as with towers in §6.2.

## M5

- **M4b sign-off.** Tiago asked to continue to M5 on 2026-09-30 without changes to M4b, so it stands as built. The island ground shadows (an open M4b question) now draw at 0.12 on explored land and 0.05 on blank paper. The islands are always visible (§6.3), but their shadows shouldn't sketch terrain you haven't seen.
- **Hours (§10.3)** live in `core/src/progress.ts`. Commits are sorted, and a gap of 2 h or more starts a new session, so exactly 2 h splits. Each session counts its span + 0.5 h, rounded to 0.1 h. Self-reported `hours` wins. map.json gains `hoursEstimate: {hours, estimated}` on worked shrines; `estimated` shows as "≈".
- **The trail (§9.4).** `map.path[layer]` lists the valid clears in `clearedAt` order, with same-day ties in file order. The app draws one dotted segment per step, with the dates on hover. The optional week-density toggle is not built.
- **Region readout (§10.2).** `regions[].stats` has cleared / revealed / total (revealed counts cleared shrines too) and an hours total, `estimated` if any part of it is an estimate. It appears on hover over a surface region whose name is shown (≥ 15% explored, or surveyed), and over sky islands. It doesn't cover depths veins, which have no borders. The global completion (cleared / all shrines) is the first item of the top-bar readout.
- **Search (§6.5).** Core decides what may be found. `shrines[].search` is the lower-cased text search may match: revealed shrines by title, id, theme and prompt; named silhouettes (p ≥ 3) by title; everything else "". The app only does substring matching, with title matches first and at most 8 results. `/` focuses the box. Picking a result selects the shrine, switches layer and centres it at zoom ≥ 2. In Atlas mode the box still follows the real rules; the Atlas table has its own filter.
- **Layer transitions (§9.2).** The depths "dive" (opacity, then scale from 1.05) in 320 ms, and the sky islands rise 16 px in 340 ms. The surface and backdrop already cross-fade in 300 ms. With `prefers-reduced-motion` the Svelte transitions take 0 ms, and app.css already zeroes CSS transitions and animations.
- **Chrome.** Light and dark already followed `prefers-color-scheme`. The light `--ui-muted` was 4.38:1 on the background, so it was darkened to #6b6256 (5.4:1) to pass WCAG AA.
- **Narrow screens (≤ 640 px).**
  - The top bar wraps, with search on its own row and only the completion and the in-sight count in the readout.
  - The Horizon is a bottom sheet (max 42% of the height) that folds to a tab at the bottom centre. The detail panel is a sheet over it (max 72%).
  - The key, the region readout and the vein legend move to the top left.
  - Without `?zoom`, a phone opens at 2.4× centred on the start vantage, since the whole canvas at 390 px is about a quarter scale.
- **Atlas table (§9.5).** After the spoiler warning, the top bar gets Map / Table (key T). The table lists every shrine from the real map.json, so its Seen column shows today's visibility. You can sort by any column, filter by id, title, region, theme or prompt, and clicking a title shows that shrine on the atlas map.
- **`stratum build --static`** writes `build/map.json`, then Vite-builds the app with `base: './'` into `build/static/` and copies map.json next to it. The app now fetches `map.json` relatively. It detects the dev API by `/api/health` replying `{ok: true}`, not just a 200, because static hosts answer unknown paths with index.html. Nothing is stripped: the static map.json still holds the full world, which Atlas needs.
- **`stratum propose --from <id>`** (core `propose.ts`, pure):
  - Without `--thread` or `--text`, it lists the write-up's loose threads: the items under `## Loose threads`, with comments and code fences skipped and wrapped bullets joined.
  - The stub gets a slug id (unique, `-2`…), the thread's first clause as title, the whole thread as prompt, and the proposer's region. It also gets its theme (ordinary shrines only), `after: [from]` (surface and sky), `below` (depths: the proposer's `below`), size M, a TODO `done`, and `from`.
  - The stub is appended to proposed.yaml as text, so comments survive, matching the existing item indentation. Then lint runs on proposed.yaml, and `$VISUAL`/`$EDITOR` opens if stdout is a terminal (`--no-edit` skips it).
- **Write-ups in the panel** no longer show the template's HTML comments as text. The body is stripped of `<!-- -->` before it goes into map.json, the same rule the word count uses. This was a bug from M2.
- **Lighthouse accessibility**: 100 with the default mobile emulation and 100 with the desktop preset (detail panel open), run against the dev server. Lighthouse isn't a project dependency; it was installed temporarily for the run.

## After M5

- **Screenshots** (`scripts/screenshot.sh`) now go through `scripts/shot.mjs`, which drives headless Chrome over the DevTools protocol: device emulation (`--mobile`, any size), a forced colour scheme, an optional `--eval` before the shot, and page errors printed. The old `chrome --screenshot` path hung on the Mac and couldn't render narrower than about 500 px. The script's arguments are unchanged; the size takes `1600x1050` (the old `1600,1050` still works).
- **Plans** for geography (a generated continent, then features) and for expeditions (resetting the map without losing work) are in `docs/plans/geography.md` and `docs/plans/reset.md`, awaiting Tiago's answers.

## M6: Geography

Agreed with Tiago on 2026-09-30: a generated continent instead of the ellipse, keeping themes clustered and follow-ups next to their predecessors (the placement rules are unchanged); a `biome:` field per region; rivers as decoration only; features named later. The plan is `docs/plans/geography.md`; DESIGN.md §4.2, §8.1, §8.5 and §13 have been updated.

- **The continent** (`core/src/landmass.ts`):
  - It's a log-sum-exp smooth union (blend 26) of one lobe per surface centroid. A lobe's radius is 0.62 × the distance to the nearest other centroid, clamped to 120–215 and jittered ±16% per region by hash, so the outline doesn't follow the centroid grid. Its edge is noisy by direction, which makes peninsulas.
  - The coast gets a domain warp (55 units at 1/300) and three octaves of noise (34/16/6 units at 1/210, 1/85, 1/32). Within 120 units of the canvas edge the land is pushed down, so coasts curve away from the frame.
  - There are 5–8 islets just offshore and 1–2 lakes, each more than 110 + r from every centroid and deep inland.
  - It's sampled every 4 units, interpolated to the 2-unit classification grid, and read back bilinearly by `landSigned`. That's exact at grid points and about 230 ms for the seed world.
- **Guarantees, not a seed search.** A failing (regions, seed) pair is a build error that suggests another `world.seed`. An automatic search was rejected: adding a region later could pick a different variant and move the land under locked shrines.
- **The seed** is now 20261005, in both `stratum.config.yaml` and the code default. The old 20261002 split two regions joined by an h=1 ridge. Of the passing date-style seeds, 20261005 had the most character: a horned peninsula with a fjord (Tick Canyon), a sound into Atomic Steppes, an inland lake, and a southern bay with islets.
- **Biomes.** Each surface region has an optional `biome` (the drafted values follow the region names). It's validated in the loader (unknown: error; on sky or depths: warning, ignored), shapes elevation (DESIGN §8.5), and is exported on `regions[]`. The profiles of the two nearest regions blend over about 80 units, so borders have no cliffs.
- **Features** (`core/src/features.ts`, map.json `geometry.features`), all rendering only:
  - **Ranges:** peaks every 20 units along h ≥ 3 ridge lines, jittered ±5 units across the line, and at least 16 units from any shrine glyph. Snow on h = 4.
  - **Rivers:** a priority flood (binary heap; ties by cell index) on a 6-unit elevation grid seeded from shore water cells gives every land cell a pit-free route to water. Cells draining at least 260 cells are river. Polylines are traced longest first, and a tributary stops where it meets one already drawn; rivers under 8 points are dropped without claiming cells. Each gets a ±0.6-cell double-sine meander, faded to zero at both ends, then 3 rounds of Chaikin smoothing. Ids are `river-N` by mouth position.
  - **Lakes:** `lake-N` from the generator.
  - **Shore:** cliff where the ground 45 units inland is above 0.6, beach below 0.3.
  - Every feature has an optional `name`; none is set yet.
- **Rendering** (`app/src/lib/Geography.svelte`) sits inside the terrain mask, so it shows on explored land only:
  - biome textures as small SVG patterns in world units, over each region's tint;
  - rivers in up to six segments of increasing width;
  - beaches as a sand stroke, cliffs as a dashed ink stroke, peaks as a lit and a shaded face.

  The map key gained mountains and rivers.
- **Lockfile regeneration** (approved with the continent). The five untracked scratch folders from M4 testing were moved from `work/` to `build/scratch-work/`, not deleted, and the old lockfile was saved as `build/positions.lock.before-m6.json`. A dev server started at 22:08 (not one of the agent's) rewrote the lockfile the moment it went missing, possibly with older code. So the new lockfile was generated in an unwatched scratch copy and moved in with one rename, then checked byte for byte against a from-scratch placement with the current code.
- **Tests that assumed the old seed** now read the repo's configured seed: the placement tests and the M4b acceptance test.

## Learning-path review and favicon (2026-10-01)

Tiago delegated the theme/follow-up review ("I'll trust your judgment").
- **What `after` is for.** A follow-up edge means "this builds on that one's artefact or idea". It drives placement, and through placement the Horizon's Thread (the nearest revealed shrine to the last clear). So edges were added only where the earlier shrine is real preparation, and themes were kept to 2–5 shrines with a small entry point. Changes are listed in docs/status.md.
- **Theme ring order (`themeRingOrder`).** On a first build, a region's themes go around the ring of anchors in the order that puts the most cross-theme `after` edges between neighbouring slots (brute force: at most 5 themes, at most 24 orders). The first theme stays in slot 0 and ties keep file order. Locked anchors are never reordered.
- **Leaning follow-ups.** A follow-up with no placed same-theme predecessor, but a placed predecessor elsewhere on its layer (another theme or region), is sampled around a point between its anchor and that predecessor: up to half the distance, at most 0.8 × the theme radius (24 units on the sky). It must still stay in its own theme's share. Sky islets keep their 60-unit margin, so sky shrines lean less.
- **Predecessors first, everywhere.** Placement now places any same-layer predecessor first, including one in another region, so the lean has something to lean toward. This is deterministic, and file order still breaks ties.
- **Favicon.** `app/public/favicon.svg` is original art showing the three strata: a sky band with a floating islet, a parchment surface with the shrine glyph, and the depths with a teal wellspring directly beneath it. There are PNG fallbacks: `favicon-32.png`, and a full-bleed `apple-touch-icon.png` (180 px, because iOS rounds the corners itself). Both were rendered from the SVG with `scripts/shot.mjs` through an `<img>` page (Chrome blocks `fetch` on `file://`). `theme-color` follows light/dark. Vite rewrites the links for the static build's relative base.

## Direction: a template for any topic, and treasure (2026-10-05)

Tiago's answers to the template and treasure questions, recorded so future sessions build on them:
- **Write-ups are the "responses"** in which hidden concepts are mentioned, so echoes scan write-ups.
- **Audience:** people comfortable with git and a terminal. A fork-and-go template repo, no hosted app (consistent with §15).
- **A model authors the world for the learner's discovery.** That covers treasure (sealed, unseen even by the owner) and, by default, generated worlds' shrine prose. The application's job is to be the scaffold that makes a model's world well designed. This is why M14 (design guide, `lint --design`, `simulate`) comes before the generator (M15). The LLM still works outside the app (§15).
- **Found side tasks count** as clears.
- **Total completion** over all content (shrines, chests, secrets) unlocks once every region (all 22, including sky islands and depths veins) is 75% cleared. The top bar's existing "x% of the world" (cleared shrines, §10.2) stays as it is.
- **Feats are triggers for content, never badges or scores,** which keeps §15's "no XP, levels, streaks, badges".
- Plans: docs/plans/treasure.md (M11) and docs/plans/template.md (M10, M12–M16). The modularity report's drift check and `stratum rename` were scheduled into M12.
- **Total completion, clarified (2026-10-05): "how much, never where."** The tracker unlocked by every region reaching 75% shows a *percentage* of all content (shrines, chests, secrets), never locations or lists. A separate *remaining-locations view*, which marks where incomplete items are, unlocks at 75% of all content (overall, not per region). It's opt-in and off by default, and like the Atlas it lives in the URL (`?remaining=1`), not in progress files. Unlike the Atlas, it reveals locations only: contents stay sealed and prose follows the silhouette rules.

## M10: ready to share (2026-10-05)

Built on the plan's defaults, since Tiago hadn't answered template.md's questions 1 and 2 yet (status.md says to proceed on them and say so).
- **Two terms renamed.** The depths node is now the **wellspring**, and the dotted line through your clears is the **trail**. Both were coinages of a specific game; every other term was already generic. The old names survive only in git history before M10. In code, the progress function is now `trail()` and the CSS classes are `.trail` and `.wellspring`. The map.json field stays `path`, which was already neutral, so the app/core contract is unchanged.
- **The temple's "trail" became its "needs".** The map key and detail panel used to say a temple is "sealed until its trail is cleared", which would now read as the clear history. They say "needs", matching DESIGN.md §5.2. This is the only UI wording changed beyond the two renames.
- **One inspiration sentence.** DESIGN.md §0 opens with "inspired by open-world exploration games", and CLAUDE.md and the README say the same. No game title, studio or motif is named anywhere else. The visual-originality constraint now forbids assets and motifs "from any existing game" rather than naming one.
- **Personal details** (the owner's name and email, programme, flashcard tool and machines) moved from DESIGN.md and CLAUDE.md into `docs/private.md`, which is gitignored. CLAUDE.md tells agents to read it if present, and keeps every working agreement itself (in terms of "the owner"), because worktrees, fresh clones and cloud sessions won't have the private file. The status, decisions and plan logs still name Tiago. They're project history, and M16's template will start with fresh docs rather than ship these.
- **World seed:** only three schema comments changed (to say wellspring). No shrine prose was touched. The one MSFM reference in a shrine prompt is world content and stays.
- **Licence:** MIT, copyright Tiago Flora, 2026. `THIRD_PARTY.md` lists what the static build redistributes (MIT, ISC, BSD-2/3), what's only used at build time, and the three Google Fonts (OFL, loaded at runtime, not bundled). The plan's "MIT/ISC" was slightly off: highlight.js and d3-ease are BSD-3-Clause, entities is BSD-2-Clause, and lightningcss (build only) is MPL-2.0.
- **README** rewritten for a stranger: what it is, the loop, a quick start, where things live and the licence. M16's first-hour guide will go further.
- **Reviewed (2026-10-05).** Tiago kept *wellspring*, *trail* and MIT, and agreed that M16's template starts with fresh docs rather than shipping these logs.

## The sky start: the descent (2026-10-06)

Asked for by Tiago after M10: begin on a sky island with a high-level design principle, then come down to the surface, as some open-world games open on a floating island before you can glide down. Spec in DESIGN.md §6.6.
- **The opening shrine is *Zero-cost, verified*** (`design-zero-cost`, Design Archipelago), chosen by Tiago at review (2026-10-06) as lighter than the first pick, *Regular types*. It's self-contained (strong typedefs for prices and quantities, proved with asm and benchmarks, nothing to fetch), its island sits right above the plateau, and it links down to `crtp-static-poly` and `policy-based-design` in the Template Highlands next door. It carries the default size M; an explicit `size: S` would be a structural edit for Tiago to approve. *Regular types* was set aside partly because its prompt needs an unspecified "reference-heavy API" (see the external-work audit). `start.sky` is a list if he wants more than one.
- **Reviewed (2026-10-06):** the glider is earned by the first clear, as built.
- **From the sky you see the ground but can't read it.** Before landing, the start vantage still explores and sees, but every surface shrine is capped at a silhouette, the plateau included. That keeps the fresh map's share where it was: 52 of 217 in sight (24%) on the island, 53 after landing (the plateau start, as before).
- **The glider is earned by a clear** of an opening shrine, not by starting it. **Never a lock:** working on any surface shrine (start or clear) also lands you, so setting out for a silhouette below is a way down.
- **The Horizon after the descent starts from the landing.** A cleared opening shrine counts as the start vantage for L, so the first post-landing Horizon is exactly the plateau start's (Tower: the Core Plateau, then the Design tower and a far tower) instead of keeping you on the island.
- **No placement change.** Positions, the lockfile and the plateau are untouched; `start.sky` only changes visibility, the Horizon's L and the app's opening layer.
- **App:** it opens on the sky while `start.landed` is false (map.json), the Horizon panel says how to get down, a phone centres on the opening shrine, and a live rebuild that lands you switches to the surface with a toast.
- **Validation:** `start.sky` entries must be known sky shrines on a single island; an empty list is an error.

## Self-contained shrines, locks and starter kits (2026-10-07)

Tiago's answers to docs/plans/self-contained.md:
1. Dependencies are fine if they aren't common: "a metroidvania element where you can go somewhere, notice you don't have the ability necessary to progress, and come back later".
2. Yes, draft the rewordings.
3. Yes, apply the tags and edges with a lockfile regeneration.
4. A CUDA GPU is in reach.

What was done:
- **Locks (DESIGN.md §5.4).** `needs` now works on ordinary shrines, not just temples, but never on towers and never in a cycle. A locked shrine is seen and read as usual, carries a padlock, is left out of the Horizon, and can't be started (without `--force`) or cleared until its needs are. It opens by itself, with a toast on a live map. Temples keep their extra rule (sealed, at most a silhouette). One helper, `unmetNeeds`, drives the Horizon, `start`, `clear` and the map's `locked` field.
- **Which shrines are locked (12, about 5%).** Only where the task *is* the earlier artefact:
  - swiss-table-probe and lru-cache: the hash map;
  - shared-memory-ipc: the SPSC ring;
  - std-simd: the dot product;
  - sae-training: the activation store;
  - topk-sae and feature-dashboard: the SAE;
  - attribution-patching: the patching harness;
  - llm-kernel-optimization: the agent loop and the oracle;
  - reward-hacking-guards: the oracle;
  - context-packing: the agent loop;
  - autotuner: the GEMM.
  
  Everything else that reuses work is an `after` with a stand-in named in the prompt. Steering vectors stays open, because its ActAdd half needs no SAE.
- **No `after` into temples.** The drafts proposed sky shrines following the tick-to-trade or SAE-engine temples. They name a stand-in instead, so a sky shrine stays doable soon after it's seen. The one sky chain is *Ports and adapters for trading*, which now follows *The order book*, with the temple as the richer option.
- **Starter kits (DESIGN.md §5.5)** in `world/kits/<id>/`, copied byte for byte by `start` in place of the code template. An untouched kit file isn't an artefact, and lint checks kit ids. There are three: *Regular types* (a ~100-line reference-heavy order-book API), *Data-oriented design* (a ~110-line OOP particle sim with a checksum) and *A minimal agent loop* (a rolling median over price ticks, sort-per-window slow, with an exact test against a different reference algorithm and a median-time benchmark). All three build warning-free with `-Wall -Wextra -Wpedantic -Wshadow -Wconversion`.
- **Rewordings: 56 prompts and 9 `done`s**, drafted by two reviewer agents to the plan's rules (smallest change, Tiago's voice, make the input concrete) and applied as text edits, so formatting and comments are kept. The canonical choices are GPT-2 small with `NeelNanda/pile-10k` (named in *The activation store*), WikiText-2 perplexity, and Compiler Explorer for P2900/P2996. A Homebrew preset (LLVM, GCC, TBB, libomp) was added to *cmake-modern* for Apple's toolchain gaps. Prompts that reuse your work name the earlier shrine by title, e.g. "your order book (The order book shrine)".
- **Tags (16 changes):**
  - `linux`: futex, ELF/PLT, glibc malloc, the tick-to-trade temple;
  - `x86`: SMT, NUMA, store forwarding, non-temporal stores, pdep, std-simd (it compares against AVX2), the autotuner;
  - `llm-api`: the agentic-forge shrines that run an agent, claude-code-skill, the autotuner;
  - `gpu`: the SAE-engine temple.
  
  MSan and perf c2c steps say "on the Linux server" rather than tagging whole shrines that otherwise run on the M2.
- **`after` edges: 21 added.** Then the lockfile was regenerated (approved; nothing started), computed in a scratch root and swapped in with a rename. 19 of 267 entries moved (follow-ups leaning toward their new predecessors), only one by more than 80 units. The fresh map is unchanged: 6 revealed and 46 silhouettes from the island.
- **GPU:** Tiago has a CUDA GPU in reach. The 15 `gpu` shrines stay as they are and open on whichever machine's `stratum setup` detects it.
