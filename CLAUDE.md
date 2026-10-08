# Stratum: agent onboarding

Stratum is a personal study map: a three-layer world (sky, surface, depths) of "shrines", each a small implementation plus a write-up, rendered *from this repo's files and git history*. It's inspired by open-world exploration games, but the design and vocabulary are its own.

## Read first, in this order

1. **`docs/status.md`**, starting with its **"Start here"** handoff: where the project is, what the last session changed and why, what's waiting on the owner, what to do next, and the working lessons.
2. **`DESIGN.md`** is the spec. §0 (constraints) and §13 (milestones) are mandatory reading. Treat it as authoritative except where `docs/decisions.md` extends it.
3. **`docs/decisions.md`** records every choice made where DESIGN.md is silent, plus agreed extensions (`theme`, `after`, archipelagos, the `x86` tag). Add a bullet there for any new choice.
4. **`docs/world-design.md`** before writing or reviewing any world content: shrines, proposals, kits, a new world. It's the craft (what keeps a learner engaged, the rules for a shrine and for a world) and the audit passes to rerun after edits.
5. **`docs/private.md`**, if it exists. It's gitignored and holds the owner's personal context: who they are, their background and their machines. Fresh clones, worktrees and cloud sessions won't have it, and the agreements below still apply.

## Working agreements (from the owner)

- **Stop for review at the end of every milestone** (DESIGN.md §13). The owner explicitly wants these reviews. Don't roll into the next milestone without one.
- **Hard constraints (DESIGN.md §0).** Never trade these away:
  - The repo is the only source of truth: no database, no browser storage.
  - Clearing requires artefacts: nothing in the UI clears a shrine by click.
  - The triangle rule: the map never shows everything, except in Atlas mode.
  - Positions never change once assigned.
- **The world content is the owner's.** Don't rewrite `world/world-seed.yaml` prose without being asked, and when asked, follow `docs/world-design.md`. Adding structural fields (tags, `theme`, `after`, `biome`) requires the owner's approval (see status for what's pending).
- **`world/positions.lock.json` is committed and sacred.** Only regenerate it (delete and rebuild) with explicit approval, and never once any shrine has been started or cleared. Use `stratum build --replace <id>` for single moves.
- **Commits:** only when asked. End commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Work on `main` unless told otherwise.
- **Visual design must be original.** No assets, names, fonts or motifs from existing games.
- **Hardware:** each machine runs `npm run stratum -- setup` once, which writes a gitignored `stratum.local.yaml` with the hardware tags it detected. The owner's machines are listed in `docs/private.md`.

## Commands

```sh
npm install                      # workspaces: core, cli, app
npm test                         # vitest (all core tests; pure functions of world/state/config)
npm run typecheck                # tsc (core+cli) and svelte-check (app)
npm run stratum -- lint          # validate world + write-ups + config
npm run stratum -- build         # place shrines (respects lockfile) → build/map.json; --static also bundles the app → build/static/
npm run stratum -- build --static --public  # the public site (Pages): a fresh, spoiler-free map; no work/, pin or Atlas
npm run stratum -- setup         # one-time per machine: detect hardware tags
npm run stratum -- start <id>    # scaffold work/<id>/ and make camp there (resumes shelved work); --template, --force
npm run stratum -- clear <id>    # validate §5, stamp the date, suggest a commit (never commits)
npm run stratum -- status        # counts, the camp, cairns, shelved work, uncommitted clears
npm run stratum -- shelve <id>   # set in-progress work aside (start resumes it)
npm run stratum -- horizon       # the three Horizon cards
npm run stratum -- pin <id>      # set the pin (--clear removes it)
npm run stratum -- propose --from <id>  # list the write-up's loose threads; --thread <n> / --text appends a stub to world/proposed.yaml
npm run dev                      # Vite + dev API at http://127.0.0.1:5173; rebuilds live on world/work/state changes
npm run sandbox                  # this world from a fresh start in a throwaway copy, build/sandbox/, on :5174; -- --reset starts over
scripts/screenshot.sh sky 1      # headless screenshot of the running dev server → build/debug/sky-1.png (MOBILE=1 … 390x844 for a phone)
```

With no URL params the map opens at `map.focus` (your camp, your latest clear, or on a fresh sky start the opening shrine, selected). URL params: `?layer=sky|surface|depths`, `?zoom=<k>`, `?select=<id>` (opens the detail panel), `?atlas=1` (reveal everything, behind a spoiler warning; key A toggles). Keys: 1/2/3 layers, H folds the Horizon, K map key, / search, T the Atlas table (in Atlas mode). The CLI takes `--root <dir>` to point at another world, for example `fixtures/tiny`.

To check UI work visually, run `npm run dev` in the background, run `scripts/screenshot.sh <layer> <zoom>`, and read the PNG. It lands under `build/` on purpose, since reads outside the repo may be blocked.

## Repo map

```
core/src/          all game logic; pure TS, no DOM. Imported by cli and (types only) by app
  types.ts         World/Shrine/Region/Diagnostic types, tag enums
  loader.ts        YAML → World with file:line:col diagnostics (all §4.2 validation)
  config.ts        stratum.config.yaml + stratum.local.yaml layering
  hardware.ts      hardware-tag detection (probe injected for tests)
  writeup.ts       WRITEUP.md frontmatter parsing and work/ folder lint
  clear.ts         §5 clear validation, write-up sections/word count, frontmatter stamping, template choice (pure)
  git.ts           GitReader interface (injected; tests fake it or use a temp repo) and git log parsing
  work.ts          scan work/, derive status/committed/touches/camp (one camp, the rest cairns), `start`, `clear`, `shelve`
  horizon.ts       §7 Horizon: three slots and their fallbacks, ISO week, pin routing (pure)
  progress.ts      §9.4 the trail, §10.3 hours, §10.2 region stats, §6.5 search text (pure)
  propose.ts       `stratum propose`: loose threads → proposal stub → proposed.yaml text (pure)
  pins.ts          state/pins.yaml read/write/validate
  visibility.ts    §6 triangle rule: line of sight over ridges (peek margin), vantages, sky launch points, depths light, the sky start (§6.6, hasLanded) (pure; Terrain injected)
  explore.ts       explored land (docs/plans/unknown.md): ray-traced from every place you've stood, stopped by high ridges (pure)
  geometry.ts      warped region classifier (2-unit grid), adjacency, biome elevation, noise
  landmass.ts      the generated continent (M6): lobes, coast noise, islets, lakes (pure)
  features.ts      M6 ranges, rivers (priority flood), lakes, cliffs and beaches (rendering only)
  placement.ts     §8.3 placement + theme anchors + follow-ups + lockfile I/O
  export.ts        map.json geometry: region outlines, ridges, contours, archipelagos, depths territory
  mapdata.ts       the map.json contract (types only; the app imports this via @stratum/core/mapdata)
  build.ts         load → validate → place → export pipeline; lintGeometry
cli/index.ts       commander CLI: lint, build, dev, start, clear, shelve, status, horizon, pin, propose, setup (setup.ts: hardware probe)
cli/dev.ts         dev API Vite plugin: /api/{health,map,events,start,pin,shelve}, fs.watch rebuilds, SSE
app/src/           Svelte 5 + Vite renderer of build/map.json (MapView, Glyph, DetailPanel, HorizonPanel, MapKey, SearchBox, AtlasTable, Geography; api.ts, camp.ts, markdown.ts)
templates/         WRITEUP.md, NEXT.md, cpp/ and python/ scaffolds for `stratum start`
world/             world-seed.yaml (content), proposed.yaml, positions.lock.json (committed), kits/<id>/ (starter kits, content)
fixtures/          tiny/ (clean 3-region world), planted-errors/ (lint test)
state/pins.yaml    the map pin (`pin: <id>` or null)
docs/              guide.md (the newcomer track), world-design.md (the craft of a world, for agents), status.md, decisions.md, private.md (gitignored), plans/ (self-contained, template, treasure, world editing, reset: proposals; camps, unknown, geography: done)
```

## Architecture rules

- **The app is a pure renderer of `build/map.json`.** Game logic (visibility, Horizon, clear validation) goes in `core/` as pure functions with vitest tests.
- **The app must only `import type` from `@stratum/core/mapdata`.** The core index pulls in `node:fs`.
- **Geometry and placement are deterministic** from `(world, config.world.seed, lockfile)`. Don't use `Math.random`; use `mulberry32(hash32(key))` from `prng.ts`.
- **One classifier.** Rendering, placement and line-of-sight must all use the same `Geometry` instance methods (`regionAt`, `classify`).

## Gotchas

- **Two TypeScripts.** Root TypeScript is 7.x (`tsc`). The app pins TS 6 because svelte-check needs the JS API. Both are intended.
- **d3-contour** puts value `i` at coordinate `i + 0.5`. `export.ts` maps back with `(c − 0.5)·step`.
- **npm may warn about esbuild/fsevents install scripts.** Vite works regardless.
- **If a workspace dependency install silently doesn't land,** rerun `npm i -w <workspace> <pkg>` and check that workspace's package.json.
