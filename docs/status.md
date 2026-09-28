# Status

*Last updated: 2026-09-28. Keep this current at the end of every work session and milestone.*

## Milestones (DESIGN.md §13)

| Milestone | State | Commit |
|---|---|---|
| M0: skeleton, loader, `stratum lint` | ✅ done, reviewed | `7788328` |
| (extra) `x86` tag, `stratum setup`, `stratum.local.yaml` | ✅ done | `91bf5e9` |
| M1: geometry, placement, lockfile, static 3-layer map | ✅ done, reviewed | `56d05fa` |
| (M1 revision) themes, follow-ups, archipelagos, depths territory | ✅ done, **awaiting review of drafted content** | `564188b` |
| M2: work state (`start`, `clear`, WRITEUP, git touches, campfires, detail panel) | 🟡 implemented, **unverified: needs `npm install`, tests, typecheck and a visual check** (see below), then review | this branch |
| M3: visibility (triangle rule) | not started, waits for M2 review | |
| M4: Horizon, pins, dev API, SSE | not started | |
| M5: Hero's Path, hours, polish, Atlas mode, static build | not started | |

**Acceptance evidence:**
- M0 and M1 criteria are covered by tests in `core/test/` (44 tests). M2 adds 20 in `core/test/work.test.ts`.
- `stratum lint` on the seed reports 217 entries and 22 regions, with 0 errors and 0 warnings.
- Placement needs no spacing relaxation.

## Open items waiting on Tiago

1. **Review the drafted `theme` and `after` content** in `world/world-seed.yaml` (see `git show 564188b -- world/world-seed.yaml`). There are 136 themed shrines (3–4 themes per region) and 42 follow-up edges. He may rename, regroup or relink freely.
2. **Regenerating the lockfile after his edits.** Once he's edited themes, offer to regenerate it so the layout follows his edits. That's safe only while no shrine has been started or cleared. Otherwise, new or changed themes get new anchors and locked shrines stay put.

## M2: what was built and what still needs checking

Built in the cloud session on branch `claude/eager-sagan-rj0gm3`. That environment's network policy blocked the npm registry, so **no dependency could be installed**. `npm test`, `npm run typecheck`, `stratum` itself and the app were never run there.

**What was verified.** `core/test/work.test.ts` (20 tests) ran under Node's built-in TypeScript support with small scratch shims for `vitest` and `gray-matter` and a JSON copy of `fixtures/tiny`. All 20 passed. That covers the clear checks, frontmatter stamping, start/clear against a temp world, temples, and committed/touches against a real temp git repo. Not exercised: `build()` and map.json (the test's `mapShrine` helper), the real `yaml`/`gray-matter` packages, the CLI, and all Svelte code.

**To do on the Mac before review:**
1. `npm install`. `app/package.json` gained `markdown-it`, `highlight.js` and `@types/markdown-it`, so this updates `package-lock.json` (commit it).
2. `npm test` and `npm run typecheck`. Fix anything that surfaces.
3. Walk the acceptance criteria by hand on a scratch shrine, then remove it:
   - `npm run stratum -- start spsc-ring-buffer`: this should scaffold `work/spsc-ring-buffer/` (cpp).
   - `npm run dev`: a flame shows on the Atomic Steppes (`?select=spsc-ring-buffer` opens the panel).
   - `npm run stratum -- clear spsc-ring-buffer` should fail with a checklist. Fill in the write-up and add a file, and it should clear.
   - After a rebuild the glyph is filled with a dashed halo (not committed yet). After committing and rebuilding, the halo goes.
   - Don't commit the scratch shrine unless Tiago wants to keep it.

**What M2 added:**
- `templates/`: WRITEUP.md, NEXT.md, and the cpp and python stubs.
- `core/src/clear.ts` (pure): sections, word count, `validateClear`, `setFrontmatter`, template choice.
- `core/src/git.ts`: a `GitReader` interface, a real reader, and the log parser.
- `core/src/work.ts`: scanning `work/`, `deriveWorkState`, `startShrine`, `clearShrine`, `lintClears`.
- CLI: `start`, `clear` and `status`. `build` prints clear and campfire counts, and `lint` warns on invalid clears.
- App: campfire flames with a 14-day fade, dashed halos for uncommitted clears, a selection ring, `DetailPanel.svelte` (with markdown-it and highlight.js), and `?select=<id>`.
- Choices are recorded in `docs/decisions.md` under M2.

## Next: M3 (after M2 review)

DESIGN.md §6 in full, as pure functions in core: fog, silhouettes, sky launch points, depths light and glows, and towers. Wire `visibility` into map.json, make `stratum start` refuse hidden shrines without `--force` (a TODO in `work.ts`), and mask the depths terrain to the light circles.

## Known limitations and TODOs

- **Relative images in write-ups** don't render in the detail panel yet, because nothing serves `work/`.
- **No live reload yet.** `stratum dev` builds once and has no file watcher, API or SSE (M4 work). Re-run `stratum build` and reload the page.
- **Towers ignore spacing** (they take the highest point near the centroid). This is fine for the seed. A proposed tower added later could land near a locked shrine.
- **Cross-region `after` edges don't affect placement.** They're intended as a Horizon signal in M4.
- **Stale lockfile entries** (removed ids) are kept on purpose; see decisions.
- **Island ground shadows** on the surface are drawn from the archipelago outlines and look blotchy. This is cosmetic, to polish in M5.
- **Atlas view for now.** Everything renders revealed (M1 atlas view) until M3 lands. The depths terrain is drawn dimly everywhere; M3 must mask it to light circles.
