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
- **Depths joining a locked ring.** Existing lightroots are locked. When a new depths shrine joins a group whose members are locked, it takes the ring slot (for the new group size k) farthest from the locked members, rather than reshuffling the ring.
- **The lockfile keeps stale ids.** Entries for removed shrines stay, so re-adding an id restores its position. Coordinates are rounded to 0.1 and keys sorted, one per line.
- **Geometry export.** Region outlines come from marching squares (d3-contour, 4-unit grid) on the soft field `min(d_nearest_other − d_own, land)`, which is positive exactly inside the region, so borders are smooth and agree with `classify`. Ridges are the zero set of `d_b − d_a`, clipped to where a and b are the two nearest regions on land. Contours use an 8-unit grid.
- **App ↔ core.** The app imports only types, from `@stratum/core/mapdata`, never the Node-side code. `stratum dev` builds, then starts Vite with a middleware serving `build/map.json`. The watcher, API and SSE are M4. Until then, re-run `stratum build` and reload.
- **`?layer=sky|surface|depths`** sets the initial layer (handy for links and screenshots).
- **M1 is an atlas view.** Every shrine renders revealed and untouched. Depths show small vein-tinted glows around every lightroot; the real darkness and light rules are M3.

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
- **Depths territory.** Rendering only. Beneath the landmass, each point belongs to the vein of its nearest lightroot (domain-warped), which draws vein territories, plus rock-strata level lines. M3 will show it only inside light circles, per §6.4. The M1 atlas view shows it dimly everywhere.
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
- **map.json** gains `sight` (surface vantages and fog radii; depths lights and glows with their radii), `surveyed` on regions, and per shrine `titleKnown` and `marks` (`chasm` beside an active shrine with lightroots below it, `draft` on a launch point to a sky shrine). The app still receives every shrine, including hidden ones, and filters; Atlas mode (M5) needs them.
- **Fog** is a soft-edged mask: land outside every vantage's R(2) (R(2) + 300 for cleared towers) and outside surveyed regions gets a grey paper wash at 74% opacity. The coastline draws over it; silhouettes draw over it.
- **Depths.** Terrain (vein territories, strata) is masked to light circles (220 around cleared lightroots) and glows (40 under active surface shrines). Glowing lightroots render as small points with a pulsing halo, revealed ones as dim starbursts, cleared ones bright.
- **Silhouettes in the UI.** "???" for titles when p < 3, in tooltips, labels, chips and the panel. The panel hides the prompt, `done` and relations for silhouettes, except that a sealed temple shows its `needs` (the constellation of §5.2, in the panel rather than on the map). Theme labels appear once a member is revealed.
- **`stratum start`** now refuses hidden shrines without `--force`; silhouettes may be started (§6.2). It runs the build pipeline without writing to get visibility.
- **Search (§6.5)** isn't built yet; there's no search box. It belongs with the top-bar work in M5.

## Atlas toggle (pulled forward from M5)

- **Map half of §9.5, now.** Asked for after M3, to check the full world. Press **A** or the top-bar **Atlas** button, or open `?atlas=1`. A spoiler warning comes first every time, and A or the button again returns to the real view. The URL keeps `?atlas=1` while it's on.
- **Presentation only.** `atlasView` marks every shrine revealed and named in the app's copy of map.json. MapView drops the fog and draws the depths terrain dimly everywhere, with a small glow at each lightroot, as the M1 atlas view did. Work state is unchanged, and nothing is stored in the browser.
- **Still M5:** the sortable table of every shrine.
