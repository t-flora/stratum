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
| M4: Horizon, pins, dev API, SSE | not started | |
| M5: Hero's Path, hours, polish, Atlas mode, static build | not started | |

**Acceptance evidence:**
- M0 and M1 criteria are covered by tests in `core/test/` (44 tests). M2 adds 21 in `core/test/work.test.ts`, M3 adds 17 in `core/test/visibility.test.ts`.
- `stratum lint` on the seed reports 217 entries and 22 regions, with 0 errors and 0 warnings.
- Placement needs no spacing relaxation.

## Open items waiting on Tiago

1. **The §6.2 visibility rule**: implemented to match the narrative and acceptance tests rather than the formulas (see `docs/decisions.md` under M3). Tiago may still want the `p > H + 1` variant.
2. **Review the drafted `theme` and `after` content** in `world/world-seed.yaml` (see `git show 564188b -- world/world-seed.yaml`). There are 136 themed shrines (3–4 themes per region) and 42 follow-up edges. He may rename, regroup or relink freely.
3. **Regenerating the lockfile after his edits.** Once he's edited themes, offer to regenerate it so the layout follows his edits. That's safe only while no shrine has been started or cleared. Otherwise, new or changed themes get new anchors and locked shrines stay put.

## M3: what was built and what still needs checking

Built in a cloud session whose network policy blocks the npm registry, so `npm test`, `npm run typecheck`, the CLI and the app weren't run there. What did run, under Node's built-in TypeScript support with scratch shims: 16 of 17 tests in `core/test/visibility.test.ts` and all 21 in `core/test/work.test.ts`. The one skipped visibility test (a fresh repo on the tiny fixture with real geometry) needs the real `yaml` and `simplex-noise`.

**Review first: a spec conflict.** The §6.2 formulas contradict §6.2's own narrative and the M3 acceptance tests. I followed the tests: only an unobstructed line reveals, and peeking over a ridge needs `p > H`. Details and a one-line alternative are in `docs/decisions.md` under M3.

**To do on the Mac:**
1. `npm test` and `npm run typecheck`.
2. `npm run dev` and look at each layer: fog over most of the surface, the plateau clear around the start vantage, towers as silhouettes, sky shrines as grey rings, the depths black. (`?select=<id>` on a silhouette shows the "seen from afar" panel.)
3. `npm run stratum -- start <some hidden id>` should refuse; `--force` overrides.

**What M3 added:**
- `core/src/visibility.ts`: `maxRidgeCrossed`, `computeVisibility` (§6.1–6.4 with the overrides), `titleKnown`.
- map.json: `sight` (vantages, fog radii, depths lights), `surveyed`, `titleKnown`, `marks`.
- App: the fog mask, depths masked to light, glow points, chasm and updraft markers, and "???" for faint silhouettes; the panel hides what you can't know yet.
- `stratum start` refuses hidden shrines; `stratum build` prints revealed/silhouette/hidden counts.

## Next: M4 (after M3 review)

DESIGN.md §7 and §11: the Horizon (three slots with their fallbacks, ISO-week stability, hardware filter), pins (`state/pins.yaml`, `stratum pin`), `stratum horizon`, the Horizon panel, the dev API (`/api/map`, `/api/start`, `/api/pin`) and SSE live reload with a file watcher.

## Known limitations and TODOs

- **Relative images in write-ups** don't render in the detail panel yet, because nothing serves `work/`.
- **No live reload yet.** `stratum dev` builds once and has no file watcher, API or SSE (M4 work). Re-run `stratum build` and reload the page.
- **Towers ignore spacing** (they take the highest point near the centroid). This is fine for the seed. A proposed tower added later could land near a locked shrine.
- **Cross-region `after` edges don't affect placement.** They're intended as a Horizon signal in M4.
- **Stale lockfile entries** (removed ids) are kept on purpose; see decisions.
- **Island ground shadows** on the surface are drawn from the archipelago outlines and look blotchy. This is cosmetic, to polish in M5.
- **Atlas is map-only.** A / `?atlas=1` reveals everything on the map; the sortable table (§9.5) is M5.
