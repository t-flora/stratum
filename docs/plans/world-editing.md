# Plan: editing the world (after M5)

*Status: proposal for Tiago's review. Nothing here is built yet.*

## What Tiago asked for

- Reshape regions. Example: Vector Coast (`parallel-simd`) is large but sparse, so shrink it and fill it.
- Add content as reading suggests it, and link papers to shrines after clearing them.
- Possibly edit in the browser, **with the shrine data decoupled from the interface**: a standard format that any tool can read and write.

## Why Vector Coast is big

It holds 10 shrines, about the same as its neighbours (10–16). The size comes from geometry. Regions are nearest-centroid cells (domain-warped, §8.1), and Vector Coast's centroid `[1310, 520]` is alone at the east edge, so it gets everything out to the coast. Nothing in the data says "this region should be smaller". The only lever today is moving the centroid, which also moves every border it touches.

## Principles

1. **The files are the product; interfaces are clients.** The world stays in plain YAML in the repo, described by a published JSON Schema. The CLI, the browser editor, a text editor or an LLM session all edit the same files through the same validation. No editor-only state, no database (§0.1).
2. **Edits are data.** One core module turns edit operations (`add shrine`, `set region weight`, …) into YAML changes that keep comments and formatting, validated by the existing loader. Every interface goes through it.
3. **Preview before write.** Every edit can run dry, reporting what would change: region outlines, which shrines would leave their region, new adjacencies and ridges. The browser draws this preview; the CLI prints it.
4. **Git is the undo.** The editor shows uncommitted world changes and can discard them (`git checkout -- world/`). It never commits.
5. **Placement stays stable (§0.4).** Reshaping never moves a shrine. If an edit would leave a *started or cleared* shrine outside its region, it's refused. If it would strand an *untouched* one, the preview says so and offers an explicit re-place (`--replace`), as today.

## The data format

### Shrine and region records (standardised, not moved)

The schema in DESIGN.md §4.2 is already the standard. What's missing is a machine-readable contract:

- `schema/world.schema.json`, generated from the TypeScript types in `core/src/types.ts` (one source of truth), plus `schema/writeup.schema.json` for WRITEUP.md frontmatter. `stratum lint` keeps doing the richer checks (links resolve, no cycles, geometry).
- **Optional file split (Tiago's call).** Today everything is in one 217-entry `world-seed.yaml`. The loader could also accept `world/regions/<region-id>.yaml`, each holding a region and its shrines, so edits and diffs stay local. Both layouts would load into the same `World`, and a one-off `stratum split` would do the move. Only worth it if the single file starts to hurt; the edit module works either way.

### Region shape: a `weight` per region

Add an optional `weight` (world units, default 0) to surface regions. The classifier becomes nearest *weighted* centroid: `argmin_i d(warp(p), c_i) − weight_i`.

- `weight < 0` shrinks a region, and its neighbours take the land.
- `weight > 0` grows it.
- It's the same classifier function (§8.1 "one classifier"), just an additively weighted Voronoi, so rendering, placement and line of sight follow automatically.
- Moving the centroid stays available too. Weight is the lever that doesn't also slide the region sideways.

**Alternative, to discuss:** shrink toward the *sea* (a bay) instead of toward neighbours, by letting a region inset the coastline locally. That's more code (the landmass is currently one noisy ellipse). Recommend weights first.

### Papers

Two relationships, kept separate:

1. **Papers read for a shrine.** These go in WRITEUP.md frontmatter, because they're part of the clear's artefact:
   ```yaml
   papers:
     - { title: "Toy Models of Superposition", url: https://arxiv.org/abs/2209.10652 }
     - arxiv:2209.10652          # shorthand, expanded for display
   ```
   The detail panel lists them; lint checks the shape.
2. **Papers that suggest new shrines.** A proposal in `proposed.yaml` gets an optional `source:` (URL or `arxiv:` id) next to `from:`. The panel shows "suggested by *paper*".

**Later, if papers start linking many shrines:** a `world/papers.yaml` library (id, title, authors, year, url) referenced by id from both places. The map could then show "papers read here" as a layer. Not needed on day one.

## The edit module (core)

`core/src/edit.ts` would be pure apart from the YAML round-trip:

```ts
type EditOp =
  | { op: 'add-shrine'; shrine: ShrineInput; file?: 'seed' | 'proposed' }
  | { op: 'update-shrine'; id: string; fields: Partial<ShrineInput> }   // prose, p, size, theme, links, after, requires
  | { op: 'remove-shrine'; id: string }                                   // refused if work/<id>/ exists
  | { op: 'set-region'; id: string; centroid?: Vec2; weight?: number; name?: string }
  | { op: 'rename-theme'; region: string; from: string; to: string }
  | { op: 'link'; a: string; b: string } | { op: 'unlink'; a: string; b: string };

function planEdits(root, ops): { diff: WorldDiff; problems: Diagnostic[]; files: Map<string, string> };
function applyEdits(root, ops): WorldDiff;   // planEdits + write the files
```

- YAML changes go through the `yaml` package's `Document` API, which keeps comments and key order.
- `WorldDiff` lists changed records, shrines whose region would change, region area deltas, new or lost adjacencies, and the lockfile entries to add.
- `stratum lint` gains a **density** note: area per shrine per region, to flag spots like Vector Coast.

## Interfaces

**CLI (first).** Scriptable, and friendly to Claude Code sessions:

```sh
stratum add --region parallel-simd --theme "SIMD parsing" --title "…"   # opens $EDITOR on a filled stub
stratum propose --from <id> [--source arxiv:…]                          # already in §11, still unbuilt
stratum region parallel-simd --weight -60 --dry-run                     # prints the diff; drop --dry-run to write
```

**Browser editor (then).** An **Edit** mode that builds on Atlas, since editing needs to see everything:

- **Region handles:** drag a centroid, or scrub a weight slider, and see the new borders live. The server recomputes, reusing the cached geometry; a weight change reclassifies in well under a second. Shrines that would change region are highlighted, and started or cleared ones block the edit.
- **Add a shrine** by clicking empty ground. A form covers title, prompt, done, size, p, theme, links and `requires`. The click can become an explicit `xy`, or placement can pick the spot.
- **Edit fields** in the detail panel. Prose uses a plain textarea, and the YAML stays the source.
- **Density overlay:** shrines per area, to spot empty land.
- **Save and discard:** Save writes the YAML through `POST /api/edit {ops, dryRun}`. A banner lists uncommitted world changes, with Discard (`git checkout`) and a suggested `git commit`. It never commits.
- **Guardrails:** everything goes through `planEdits`, so the browser can't do anything the CLI couldn't.

## Phases

| Phase | What | Size |
|---|---|---|
| E1 | JSON Schemas; region `weight`; `papers:` in WRITEUP.md and `source:` on proposals; density note in lint | small |
| E2 | `core/src/edit.ts` with dry-run diffs; `stratum add`, `stratum propose`, `stratum region` | medium |
| E3 | Browser Edit mode: region handles and preview, add/edit shrine forms, uncommitted-changes banner | large |
| E4 (optional) | `world/papers.yaml` library, split world files, a papers layer on the map | medium |

**Quick win before any of this:** E1's `weight` alone lets Tiago shrink Vector Coast by editing one number and running `stratum build`. It's safe today because nothing has been started or cleared yet.

## Questions for Tiago

1. When a region shrinks, should the land go to its **neighbours** (weights, recommended) or to the **sea** (a bay)?
2. For papers, are **URLs or `arxiv:` ids** in WRITEUP.md enough, or do you want a shared paper library from the start?
3. Keep **one `world-seed.yaml`**, or split into per-region files?
4. How much should the browser edit? **Structure only** (regions, placement, links, themes), with prose in your editor, or **prose too**?
5. Is adding structural fields (`weight`, `papers`, `source`) approved? CLAUDE.md requires your OK for schema additions.
