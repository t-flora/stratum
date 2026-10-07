# Status

*Last updated: 2026-10-07 (where the map opens, the public site, the tutorial). Keep this current at the end of every work session and milestone.*

## Milestones (DESIGN.md §13)

| Milestone | State | Commit |
|---|---|---|
| M0: skeleton, loader, `stratum lint` | ✅ done, reviewed | `7788328` |
| (extra) `x86` tag, `stratum setup`, `stratum.local.yaml` | ✅ done | `91bf5e9` |
| M1: geometry, placement, lockfile, static 3-layer map | ✅ done, reviewed | `56d05fa` |
| (M1 revision) themes, follow-ups, archipelagos, depths territory | ✅ done; content reviewed by Claude at Tiago's request (2026-10-01, below) | `564188b` |
| M2: work state (`start`, `clear`, WRITEUP, git touches, campfires, detail panel) | ✅ done, verified by Tiago | `6d2ef39` |
| M3: visibility (triangle rule) | ✅ done, verified by Tiago | `4085f22` |
| (extra) Atlas toggle (map half of §9.5, pulled forward) | ✅ done, unverified here | on `main` |
| M4: Horizon, pins, dev API, SSE | 🟡 implemented, **unverified here** (see below), awaiting review | on `main` |
| (extra) Camps, cairns, shelving, map key (docs/plans/camps.md) | 🟡 implemented, unverified here, awaiting review | on `main` |
| M4b: the unknown (docs/plans/unknown.md): peek margin, hideable sky shrines, explored land | ✅ done; Tiago continued to M5 without changes | `1873880` |
| M5: the trail, hours, polish, Atlas mode, static build | ✅ done; Tiago moved on to M6 | `275e0d7` |
| M6: geography (docs/plans/geography.md): a generated continent, biomes, ranges, rivers, lakes | ✅ done, committed with Tiago's OK | `22a99f0` |
| (extra) Theme/follow-up review, learning-path placement, favicon | ✅ done | on `main` |
| M7: expeditions (docs/plans/reset.md) | planned, optional; 4 questions open | |
| M8: world editing (docs/plans/world-editing.md) | planned, optional; 4 questions open. **E1 (region weights) only before the first start** | |
| M9: feature names (geography: generated) | planned, optional | |
| M10: ready to share (renames, neutral docs, licence) | ✅ done, approved by Tiago (names and MIT kept) | `4d609d0` |
| (extra) The sky start: begin on an island, descend to the plateau (DESIGN.md §6.6) | ✅ done; Tiago chose *Zero-cost, verified* as the opening and kept "earned by the first clear" | `6de3836` |
| (extra) Self-contained shrines: locks, starter kits, rewordings, lockfile regenerated (docs/plans/self-contained.md) | ✅ done; Tiago skimmed the prose and kept the 12 locks; the Agent Workshops task was hardened after review | `561c4d3` and later |
| (extra) Where the map opens, a spoiler-free public site, the tutorial world and the newcomer track (docs/guide.md) | ✅ built, **awaiting review** | on `main` |
| M11: treasure, secrets, total completion (docs/plans/treasure.md) | planned; 4 questions | |
| M12: world packs (engine/world split, drift check, rename) | planned | |
| M13: learning materials (notes, papers, cards, Anki export) | planned | |
| M14: world-design scaffold (schemas, design guide, design lint, simulate) | planned | |
| M15: world generator (Claude Code skill) | planned | |
| M16: template release | planned; 2 questions in template.md | |

**Acceptance evidence:**
- M0 and M1 criteria are covered by tests in `core/test/` (44 tests). M2 adds 21 in `core/test/work.test.ts`, M3 adds 17 in `core/test/visibility.test.ts`, M4 adds 17 in `core/test/horizon.test.ts`.
- `stratum lint` on the seed reports 217 entries and 22 regions, with 0 errors and 0 warnings.
- Placement needs no spacing relaxation.

## Open items waiting on Tiago

1. **Play the tutorial** (`npm run tutorial`) as the first playthrough, and say what's rough. Then **set up the private journey repo** (docs/guide.md, "Play this world, privately") before the first real `stratum start`, so `work/` never lands in the public repo.
2. **Pushing `main` deploys the public site,** now the fresh, spoiler-free view (`build --static --public`).
3. **Questions in the new plans.**
   - `docs/plans/treasure.md`: GPU-gated content vs. the 75% rule, chest density, echo scope, when readings count.
   - `docs/plans/template.md`: sealed shrine prose for generated worlds, distribution. (Names, licence and fresh M16 docs were settled at the M10 review.)
   
   Each has a recommended default, so a session can proceed on those if he says so.
4. **Optional:** is seed `20261005` a keeper, and are the drafted region `biome:` values right? He was happy to commit M6 as is. Changing either needs a lockfile regeneration, so do it before the first `stratum start`.
5. **M8's region weights** (e.g. shrinking Vector Coast), if wanted, must happen **before setting out** on the first shrine.
6. **Then: set out on the first real shrine.** After the first `stratum start`, the lockfile is frozen for good (CLAUDE.md).

## Direction (2026-10-05)

Tiago wants Stratum to become a template anyone comfortable with git and a terminal can use for any topic. The key principle, in his words: assume **a model creates the content for the learner's discovery**. So the application's real job is to be the best scaffold on which a model designs a world. His world benefited from clear intent from the start; a second user's may not, which is why M14 (design guide, design lint, simulator) and M15 (an interviewing generator that writes a brief) carry most of the weight. He wants to be surprised by treasure too, so loot is model-written and sealed. Found side tasks count as clears. Total completion is "how much, never where": a percentage of all content once every region is 75% cleared, and an opt-in view of remaining locations once 75% of all content is done.

**Plans:** `docs/plans/treasure.md` (M11) and `docs/plans/template.md` (M10, M12–M16). `CLAUDE.md`'s plans list was brought up to date in M10.

## Theme and follow-up review (2026-10-01)

Tiago chose to be surprised by the themes and asked Claude to review them for the learning experience. Since the Horizon's Thread card picks the nearest revealed shrine to the last clear, placement *is* the learning path, so the review covered both content and placement:
- **Four themes renamed** for accuracy: "Abstraction & dispatch" → "What it compiles to", "The field" → "The evidence", "Error" → "Error & stability", "Precision" → "Low precision".
- **21 follow-up edges added** (now 63) where one shrine prepares another, e.g. `spsc-ring-buffer` after `memory-order-litmus`, `sae-training` after `toy-superposition`, `theory-arith-intensity` after `theory-roofline`, `udp-multicast-feed` after `binary-serialization`.
- **Placement now follows paths across boundaries:** each region's themes are ordered around the ring so linked themes are neighbours, and a follow-up whose predecessor is in another theme or region leans toward it. See docs/decisions.md.
- **The lockfile was regenerated** (approved; nothing started). A fresh repo still shows 53 of 217.

## Self-contained shrines: what was done and how it was checked (2026-10-07)

Tiago answered the plan's questions: dependencies are welcome as a metroidvania element if they aren't common; yes to drafting the rewordings; yes to tags, edges and the regeneration; a CUDA GPU is in reach. Details are in docs/decisions.md ("Self-contained shrines…") and DESIGN.md §5.4–5.5.

**Built:**
- **Locks** (`needs` on ordinary shrines). You can see and read a locked shrine, it shows a padlock, Set out says "Locked", the Horizon skips it, and it opens by itself with a toast. There are 12 in the seed, plus the 6 temples.
- **Starter kits** in `world/kits/` for *Regular types*, *Data-oriented design* and *A minimal agent loop*, copied by `stratum start` in place of the code template.
- **World edits:** 56 prompts and 9 `done`s reworded so the input is concrete; 16 tag changes; 21 `after` edges; and the lockfile regenerated (19 of 267 entries moved, one far).

**Checked:** `npm test` (157 passed; new tests for locks in loader, Horizon, start and clear, and for kits), `npm run typecheck` (0 errors), `stratum lint` (0/0), and `stratum build` against the new lockfile (0 placed, unchanged). In the Atlas with *A cache-friendly LRU* selected (`build/debug/locked.png`, `locked-map.png` in the worktree), the panel shows "Locked … A flat hash map" with a disabled Locked button, and 12 padlocks are drawn. The fresh map is still 6 revealed and 46 silhouettes from the island. The three kits were built and run by the agent that wrote them.

**Reviewed 2026-10-07:** Tiago skimmed the prose (good), found the judgement calls reasonable, kept the 12 locks, and asked for the Agent Workshops task to be hardened against an agent that knows the textbook answer (decisions.md, "Agent Workshops…"). The original review list:
1. **The prose.** Every change is in the commit diff for `world/world-seed.yaml`, and the voice is meant to be yours. Look especially at the reviewers' judgement calls (decisions.md): LevelDB as the "real codebase" for *Ownership architecture*, the Monte Carlo pricer fallback for *Amdahl*, part of speech only for *Linear probes*, and the rolling median as the Agent Workshops task.
2. **The 12 locks:** too many, too few, or the wrong ones?
3. **The kits:** `world/kits/*/`. They're content, so treat them like prose.

## The sky start: what was built and how it was checked (2026-10-06)

Tiago asked, at the M10 review, for the map to begin on a sky island with a high-level design principle and then come down to the surface. It didn't need a rearchitecture: it's one visibility rule, the Horizon's starting point and some app wiring (DESIGN.md §6.6, docs/decisions.md "The sky start").

Checked in the worktree: `npm test` (152 passed; new tests in visibility, horizon and loader, and the M4b acceptance test now checks both the island and the landing), `npm run typecheck` (0 errors), `stratum lint` (0/0), `stratum build` (lockfile unchanged). Screenshots under `build/debug/` in the worktree:
- `sky-start.png`: the default URL opens on the sky. The Horizon says "You're on Design Archipelago, looking down. Clear *Regular types* to glide down…", with Regular types as the Thread and the Vector Coast tower as the Far Landmark. 52 of 217 in sight.
- `sky-start-surface.png`: the surface before landing. The land around the plateau is explored, and every shrine is a grey silhouette.
- `descent.png`: a scratch world (`build/sky-root/`, a copy of the world) with Regular types cleared *while the page was open*. The app switched itself to the surface with the toast "You glide down from the island: the ground is in plain sight now", and the plateau is revealed. After landing, the Horizon is the old fresh-map one: Tower: the Core Plateau, the Design tower, the Tick Canyon tower.

**To review:**
**Reviewed 2026-10-06:** Tiago swapped the opening shrine to *Zero-cost, verified* (done) and kept the glider earned by the first clear. The screenshots above predate the swap and show *Regular types*.
1. Optional: `size: S` on `design-zero-cost` (it carries the default M).
2. Try it: in the worktree, `npm run dev`, or `npm run stratum -- --root build/sky-root dev --port 5183` for the landed scratch world.

## M10: what was built and how it was checked (2026-10-05)

Built on the plan's defaults for names and licence. **Reviewed 2026-10-05:** Tiago kept *wellspring*, *trail* and MIT, and agreed that M16's template starts with fresh docs. Details are in docs/decisions.md ("M10").

Checked in the worktree: `npm test` (140 passed), `npm run typecheck` (0 errors) and `stratum lint` (0 errors, 0 warnings). A screenshot of the depths with the map key open (`build/debug/m10-key.png` in the worktree) shows the wellspring glyph still styled, the renamed key text, and 53 of 217 in sight, as before. The acceptance grep (the game titles, studio, motif and both old terms, plus the email and programme) finds nothing outside the git history.

**What changed:**
- **The depths node is now the *wellspring*,** and the line through your clears is the *trail*. This covers code, tests, UI text, the favicon comment, DESIGN.md, CLAUDE.md, the README, the logs and three schema comments in world-seed.yaml (no shrine prose). map.json is unchanged: the field was already `path`.
- **A temple is now "sealed until its needs are cleared"** (it said "trail" before, which would have clashed).
- **Neutral docs.** DESIGN.md and CLAUDE.md name no game; one sentence says "inspired by open-world exploration games". DESIGN.md says "the owner" instead of Tiago.
- **`docs/private.md`** (gitignored) now holds his name and email, programme, RemNote and the Mac/Linux machines. CLAUDE.md keeps all the working agreements and points to the file.
- **`LICENSE`** (MIT, © 2026 Tiago Flora) and **`THIRD_PARTY.md`**. The bundle includes BSD-licensed highlight.js, d3-ease and entities, so it isn't only MIT/ISC as the plan said; all are permissive.
- **README** rewritten for a stranger.

**Follow-ups:**
1. `docs/private.md` is gitignored, so it isn't in git. **Copy it into the main checkout** (`cp .claude/worktrees/m10-ready-to-share/docs/private.md docs/`) before the worktree is removed.
2. The logs (status, decisions, plans) still use his name, as history. M16's template starts with fresh docs (agreed).

## M6: what was built and how it was checked

Checked on the Mac: `npm test` (138 tests; new: `core/test/landmass.test.ts`, which covers the guarantees, determinism, biomes and features), `npm run typecheck` and `stratum lint` (0 errors, 0 warnings). Screenshots were taken of the Atlas and of the fresh view on desktop, zoomed and at 390 px.

**What changed:**
- **The land is a generated continent:** bays, fjords, a horned peninsula in the northwest, a sound in the east, inland lakes and offshore islets. It's checked for guarantees on every build. The seed is now `20261005`.
- **Each region has a `biome`** (drafted from the names; edit freely in world-seed.yaml). It sets the ground texture (trees, reeds, grass ticks, crags, dunes, cliff hatching, terraces) and the elevation profile.
- **Features, drawn only on explored land:** mountain ranges on the four high ridges (snow on Tick Canyon | Agent Workshops), 16 rivers that always reach water, two lakes, and cliffs and beaches. They're scenery only, with ids and room for names later.
- **The lockfile was regenerated** (approved with the continent). Themes still cluster and follow-ups still sit by their predecessors; the placement rules are unchanged. A fresh repo shows 53 of 217 (24.4%), as before.

**Things to know:**
- The M4 scratch folders and the pre-M6 lockfile backup were deleted on 2026-10-01.
- **Regenerating the lockfile while `npm run dev` runs:** never delete the file first, since the watcher will refill it. Compute the new lock and swap it in atomically (temp file + rename). That's how the 2026-10-01 regeneration was done.
- A full build now takes about 1.4 s (it was 0.6 s), mostly the river flood. The dev server caches geometry, so live rebuilds are unaffected.

**To review:**
1. Restart `npm run dev`, then press A for the Atlas to see the whole continent, and A again for the fresh view.
2. The biome values in world-seed.yaml (a structural field you approved; values are drafts).
3. Is the seed a keeper? Another seed is one line in stratum.config.yaml plus a lockfile regeneration, and only possible while nothing is started.

## M5: what was built and how it was checked

Checked on the Mac: `npm test` (126 tests; new: `progress.test.ts`, `propose.test.ts`), `npm run typecheck`, and screenshots of a scratch copy of the world with three clears in a throwaway git history (`build/fresh-root/`, gitignored; `npm run stratum -- --root build/fresh-root dev` shows it). Lighthouse accessibility scored 100 (mobile emulation) and 100 (desktop, detail panel open).

**Built:**
- **The trail** (§9.4): a dotted line through the clears on each layer, with the dates on hover.
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
2. `npm run stratum -- --root build/fresh-root dev --port 5180` for the world with a trail.
3. `npm run stratum -- propose --from <id>` on a write-up with loose threads (it writes to `world/proposed.yaml`, so revert it if you're just trying it).

**Not built:** the trail's week-density toggle (optional in §9.4), and Playwright screenshots (optional in §14).

**Noticed along the way (not changed):**
- `stratum dev` only watched `work/` if it existed at startup. *(Fixed 2026-10-07: it now creates `work/` and `state/` first.)*
- `scripts/screenshot.sh` used to hang: headless Chrome on the Mac writes the PNG but never exits, and it enforces a minimum window width, so it couldn't do 390 px. **Fixed after M5:** it now drives Chrome over the DevTools protocol (`scripts/shot.mjs`). Same arguments as before, plus `MOBILE=1` (phone emulation), `QUERY='&select=…'` and `SCHEME=light|dark`.
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

## Next: picking up a milestone (for a new session)

All of DESIGN.md §13's original milestones (M0–M6) are done. What follows is planned. A session picking one up should:

1. **Read in this order:** this file, the milestone's entry in DESIGN.md §13, its plan in `docs/plans/`, and the decisions log.
2. **Check the open questions** in the plan. If Tiago hasn't answered one, use the recommended default below and say so in the milestone report. Don't stall on it.
3. **Build the milestone,** keeping core logic pure with vitest tests, and the app a renderer of `map.json` (CLAUDE.md).
4. **Verify:** `npm test`, `npm run typecheck` and `npm run stratum -- lint`, plus screenshots for UI work (`scripts/screenshot.sh`).
5. **Stop for Tiago's review** (CLAUDE.md). Update this file and `docs/decisions.md`. Commit only when asked.

**Recommended order:**
1. ~~M10~~ (done 2026-10-05).
2. M11 (improves Tiago's world now; safe after the first start).
3. M12 → M14 → M15 → M16, with M13 anywhere after M12.

M7 and M9 are independent. M8 E1 only before the first start.

**Defaults where Tiago hasn't answered yet:**

| Plan | Question | Default |
|---|---|---|
| treasure.md | GPU-gated content vs. the 75% rule | `completion.exclude: []` in config (everything counts); offer `[gpu]` for this Mac in the review |
| treasure.md | Density | about 7% chests (≈15), about 10 secrets |
| treasure.md | Echo scope | own region or theme only |
| treasure.md | When readings and cards count | as soon as they're opened |
| template.md | Names for the depths node / the clear history | *wellspring* / *trail* (**answered**: kept) |
| template.md | Licence; his world public? | MIT (**answered**: kept); his world stays private until he says otherwise (example packs come from the generator) |
| template.md | Sealed shrine prose | on for generated worlds, off for Tiago's |
| template.md | Distribution | a template repo, with `git pull upstream` for updates |

**Milestone briefs:**
- **M10, ready to share.** Done 2026-10-05; see "M10: what was built" above.
- **M11, treasure.**
  - Follow treasure.md phases Tr1–Tr5. Spots and found state go in core (`treasure.ts`), sealing in core with `node:crypto`, the decoder CLI-only, and `map.json` carries opened contents only.
  - **Tr5 (writing the loot) must be done without showing it to Tiago:** don't print contents in the chat, the commit message or the review.
- **M12, world packs.** Hard-coded spots to remove:
  - `REQUIRE_TAGS` (`types.ts`) and the probes (`hardware.ts`);
  - `PYTHON_REGIONS` and `TEMPLATES` (`clear.ts`);
  - `VEIN_COLOURS` (`palette.ts`);
  - the artefact rule (`clear.ts`).
  
  Add the drift check and `stratum rename` (the modularity report's five cases make good tests). The scratch harness that found them was in `build/modularity.ts` (gitignored; recreate it if it's gone).
- **M13, learning materials.** Coordinate `papers:` with M8 E1, whichever lands first. Export to Anki CSV only; no spaced repetition.
- **M14, the world-design scaffold.** Generate JSON Schemas from the loader's types; write `docs/world-design.md` from Tiago's world; `lint --design`; `simulate`. Record his world's metrics as the baseline before changing anything.
- **M15, the generator.** A Claude Code skill (`.claude/skills/generate-world/`) driving subagents. Test on three unlike topics in scratch roots (`--root`), never on Tiago's world.
- **M16, release.** A template repo, `stratum new` and `stratum doctor`, and a first-hour guide, timed on a clean clone.

## Known limitations and TODOs

- **Relative images in write-ups** don't render in the detail panel yet, because nothing serves `work/`.
- **Towers ignore spacing** (they take the highest point near the centroid). This is fine for the seed. A proposed tower added later could land near a locked shrine.
- **Cross-region `after` edges don't affect placement.** They're intended as a Horizon signal in M4.
- **Stale lockfile entries** (removed ids) are kept on purpose; see decisions.
- **Island ground shadows** on the surface are drawn from the archipelago outlines and look blotchy (fainter on unexplored paper since M5). Cosmetic.
- **map.json still carries the full geometry** (Atlas needs it). The M5 static build might strip unexplored terrain.
