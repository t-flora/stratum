# Status

*Last updated: 2026-09-28. Keep this current at the end of every work session and milestone.*

## Milestones (DESIGN.md §13)

| Milestone | State | Commit |
|---|---|---|
| M0: skeleton, loader, `stratum lint` | ✅ done, reviewed | `7788328` |
| (extra) `x86` tag, `stratum setup`, `stratum.local.yaml` | ✅ done | `91bf5e9` |
| M1: geometry, placement, lockfile, static 3-layer map | ✅ done, reviewed | `56d05fa` |
| (M1 revision) themes, follow-ups, archipelagos, depths territory | ✅ done, **awaiting review of drafted content** | `564188b` |
| M2: work state (`start`, `clear`, WRITEUP, git touches, campfires, detail panel) | ✅ done, verified by Tiago | `6d2ef39` |
| M3: visibility (triangle rule) | ✅ done, verified by Tiago | `4085f22` |
| (extra) Atlas toggle (map half of §9.5, pulled forward) | ✅ done, unverified here | on `main` |
| M4: Horizon, pins, dev API, SSE | 🟡 implemented, **unverified here** (see below), awaiting review | on `main` |
| (extra) Camps, cairns, shelving, map key (docs/plans/camps.md) | 🟡 implemented, unverified here, awaiting review | on `main` |
| M5: Hero's Path, hours, polish, Atlas mode, static build | not started | |

**Acceptance evidence:**
- M0 and M1 criteria are covered by tests in `core/test/` (44 tests). M2 adds 21 in `core/test/work.test.ts`, M3 adds 17 in `core/test/visibility.test.ts`, M4 adds 17 in `core/test/horizon.test.ts`.
- `stratum lint` on the seed reports 217 entries and 22 regions, with 0 errors and 0 warnings.
- Placement needs no spacing relaxation.

## Open items waiting on Tiago

1. **The §6.2 visibility rule**: implemented to match the narrative and acceptance tests rather than the formulas (see `docs/decisions.md` under M3). Tiago may still want the `p > H + 1` variant.
2. **Review the drafted `theme` and `after` content** in `world/world-seed.yaml` (see `git show 564188b -- world/world-seed.yaml`). There are 136 themed shrines (3–4 themes per region) and 42 follow-up edges. He may rename, regroup or relink freely.
3. **Regenerating the lockfile after his edits.** Once he's edited themes, offer to regenerate it so the layout follows his edits. That's safe only while no shrine has been started or cleared. Otherwise, new or changed themes get new anchors and locked shrines stay put.

## M4: what was built and what still needs checking

Built in a cloud session whose network policy blocks the npm registry, so `npm test`, `npm run typecheck`, the CLI and the app weren't run there. What did run, under Node's built-in TypeScript support with scratch shims: all 17 tests in `core/test/horizon.test.ts`, all 21 in `work.test.ts`, and 16 of 17 in `visibility.test.ts` (the fresh-repo test needs the real `yaml`/`simplex-noise`). The CLI module loads and links.

**To do on the Mac:**
1. `npm test` and `npm run typecheck`.
2. `npm run stratum -- horizon`: three cards (Thread, Vertical, Far Landmark).
3. `npm run dev`:
   - The Horizon panel shows on the left.
   - **Pin** on a card: a red stamp appears on the map and `state/pins.yaml` changes. The Thread card may re-route.
   - **Set out**: `work/<id>/` appears, a campfire lights and the Thread becomes that campfire, with no reload.
   - Edit `work/<id>/NEXT.md`: the campfire note updates live.
   - Afterwards, delete the scratch `work/<id>/` and run `npm run stratum -- pin --clear`, unless you want to keep them.
4. `npm run stratum -- pin <hidden id>` should refuse.

**What M4 added:**
- `core/src/horizon.ts` (`computeHorizon`, `isoWeek`, `firstSentence`, `bearing`) and `core/src/pins.ts`.
- `build()` computes the Horizon and pin, takes a `BuildCache` for fast rebuilds, and map.json gains `horizon`, `pin`, `week` and per-shrine `unavailable`.
- CLI: `stratum horizon`, `stratum pin <id> | --clear`, and `stratum dev` with the API, watcher and SSE (`cli/dev.ts`). `clear` removes the pin on the pinned shrine.
- App: `HorizonPanel.svelte`, Set out / Pin in both panels (copying the CLI command without the API), the pin stamp, live reload and toasts.

## Camps (before M5): what to check

Harness results: work 23/23, visibility 17/18 (the real-geometry test is skipped here), horizon 19/19. On the Mac:
1. `npm test` and `npm run typecheck`.
2. Start two scratch shrines. One flame (the camp, on the latest) and one cairn should show. Touch the cairn's NEXT.md and the camp moves.
3. Try **Shelve** in the panel, or `npm run stratum -- shelve <id>`: its marker disappears and it leaves the Horizon. **Take off the shelf** brings it back as the camp.
4. Press K for the map key.
5. Clean up the scratch folders afterwards.

## Next: M5 (after the camps review)

DESIGN.md §9.4, §10.3, §9.2, §9.5 and §13 M5: the Hero's Path, the hours estimate (and per-region readout, §10.2), layer transitions with reduced motion, dark UI chrome, the mobile layout (Horizon as a bottom sheet at 390 px), the Atlas table, search (§6.5), `stratum build --static`, `stratum propose`, and Lighthouse accessibility ≥ 90.

## Planned after M5 (proposals, awaiting Tiago)

- **[World editing](plans/world-editing.md).** Region `weight` to shrink or grow regions (Vector Coast), papers on write-ups and proposals, a core edit module with dry-run diffs, then CLI commands and a browser Edit mode. The YAML plus a JSON Schema is the contract, and the interfaces are clients. There are five questions for Tiago.

## Known limitations and TODOs

- **Relative images in write-ups** don't render in the detail panel yet, because nothing serves `work/`.
- **Towers ignore spacing** (they take the highest point near the centroid). This is fine for the seed. A proposed tower added later could land near a locked shrine.
- **Cross-region `after` edges don't affect placement.** They're intended as a Horizon signal in M4.
- **Stale lockfile entries** (removed ids) are kept on purpose; see decisions.
- **Island ground shadows** on the surface are drawn from the archipelago outlines and look blotchy. This is cosmetic, to polish in M5.
- **Atlas is map-only.** A / `?atlas=1` reveals everything on the map; the sortable table (§9.5) is M5.
