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
- **Spacing is per layer.** Surface shrines keep 38 from other surface shrines, sky 26 from other sky shrines. Placement also keeps 10 units from the coast and 12 from island edges so glyphs don't hang off. The seed places with no relaxation.
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
