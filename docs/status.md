# Status

*Last updated: 2026-09-30. Keep this current at the end of every work session and milestone.*

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
| M4b: the unknown (docs/plans/unknown.md): peek margin, hideable sky shrines, explored land | ✅ done; Tiago continued to M5 without changes | `1873880` |
| M5: Hero's Path, hours, polish, Atlas mode, static build | 🟡 implemented and verified on the Mac, **awaiting review** | on `main` |

**Acceptance evidence:**
- M0 and M1 criteria are covered by tests in `core/test/` (44 tests). M2 adds 21 in `core/test/work.test.ts`, M3 adds 17 in `core/test/visibility.test.ts`, M4 adds 17 in `core/test/horizon.test.ts`.
- `stratum lint` on the seed reports 217 entries and 22 regions, with 0 errors and 0 warnings.
- Placement needs no spacing relaxation.

## Open items waiting on Tiago

1. **Review M5** (below).
2. **Review the drafted `theme` and `after` content** in `world/world-seed.yaml` (see `git show 564188b -- world/world-seed.yaml`). There are 136 themed shrines (3–4 themes per region) and 42 follow-up edges. He may rename, regroup or relink freely.
3. **Regenerating the lockfile after his edits.** Once he's edited themes, offer to regenerate it so the layout follows his edits. That's safe only while no shrine has been started or cleared. Otherwise, new or changed themes get new anchors and locked shrines stay put.

## M5: what was built and how it was checked

Checked on the Mac: `npm test` (126 tests; new: `progress.test.ts`, `propose.test.ts`), `npm run typecheck`, and screenshots of a scratch copy of the world with three clears in a throwaway git history (`build/fresh-root/`, gitignored; `npm run stratum -- --root build/fresh-root dev` shows it). Lighthouse accessibility scored 100 (mobile emulation) and 100 (desktop, detail panel open).

**Built:**
- **Hero's Path** (§9.4): a dotted line through the clears on each layer, with the dates on hover.
- **Hours** (§10.3): "≈ 2.5 h" in the detail panel and the region readout. Self-reported `hours` wins.
- **Region readout** (§10.2): hover a charted region or a sky island to see cleared / revealed / total, surveyed, and hours. Completion % is in the top bar.
- **Search** (§6.5): the top-bar box (`/` focuses it). It finds only what you've seen, and silhouettes by title only.
- **Layer transitions** (§9.2): the depths dive, the sky islands rise, both under 400 ms; reduced motion turns them off. Light and dark chrome follow the OS.
- **Phones (390 px)**: the Horizon and the detail panel become bottom sheets, the top bar wraps, and the map opens zoomed on the start.
- **Atlas table** (§9.5): after the spoiler warning, Map / Table (key T). You can sort and filter; clicking a title shows that shrine on the map.
- **`stratum build --static`** writes `build/static/`; serve it with any static server. Buttons copy CLI commands there.
- **`stratum propose --from <id>`**: lists the write-up's loose threads; `--thread <n>` or `--text "…"` appends a stub to `world/proposed.yaml`.
- **Fixes**: write-ups no longer show the template's HTML comments as text; static hosts no longer fool the app into thinking the dev API is there. Island shadows are fainter on unexplored paper (the open M4b question).

**To review:**
1. `npm run dev`. Then try `/` to search, hover a region, open the Atlas (A, then T), and resize the window to phone width.
2. `npm run stratum -- --root build/fresh-root dev --port 5180` for the world with a Hero's Path.
3. `npm run stratum -- propose --from <id>` on a write-up with loose threads (it writes to `world/proposed.yaml`, so revert it if you're just trying it).

**Not built:** the Hero's Path week-density toggle (optional in §9.4), and Playwright screenshots (optional in §14).

**Noticed along the way (not changed):**
- `stratum dev` only watches `work/` if it existed at startup.
- `scripts/screenshot.sh` hangs: headless Chrome on the Mac writes the PNG but never exits, and it enforces a minimum window width, so it can't do 390 px. For this milestone I drove Chrome over the DevTools protocol with device emulation (a scratch script, `build/cdp-shot.mjs`). It could replace screenshot.sh if you want.
- Running `npm i` in a subfolder installs into the root workspace. I hit this installing Lighthouse, restored `package.json` and `package-lock.json`, and pruned `node_modules`.

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

## Next (after the M5 review)

M5 is the last milestone in DESIGN.md §13. After it: Tiago's review of the drafted themes and follow-ups (open item 2), the world-editing proposal below, and setting out on the first real shrine.

## Planned after M5 (proposals, awaiting Tiago)

- **[World editing](plans/world-editing.md).** Region `weight` to shrink or grow regions (Vector Coast), papers on write-ups and proposals, a core edit module with dry-run diffs, then CLI commands and a browser Edit mode. The YAML plus a JSON Schema is the contract, and the interfaces are clients. There are five questions for Tiago.

## Known limitations and TODOs

- **Relative images in write-ups** don't render in the detail panel yet, because nothing serves `work/`.
- **Towers ignore spacing** (they take the highest point near the centroid). This is fine for the seed. A proposed tower added later could land near a locked shrine.
- **Cross-region `after` edges don't affect placement.** They're intended as a Horizon signal in M4.
- **Stale lockfile entries** (removed ids) are kept on purpose; see decisions.
- **Island ground shadows** on the surface are drawn from the archipelago outlines and look blotchy, more so on the blank paper of the unknown. This is cosmetic, to polish in M5.
- **map.json still carries the full geometry** (Atlas needs it). The M5 static build might strip unexplored terrain.
