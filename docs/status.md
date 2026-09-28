# Status

*Last updated: 2026-09-28. Keep this current at the end of every work session and milestone.*

## Milestones (DESIGN.md §13)

| Milestone | State | Commit |
|---|---|---|
| M0: skeleton, loader, `stratum lint` | ✅ done, reviewed | `7788328` |
| (extra) `x86` tag, `stratum setup`, `stratum.local.yaml` | ✅ done | `91bf5e9` |
| M1: geometry, placement, lockfile, static 3-layer map | ✅ done, reviewed | `56d05fa` |
| (M1 revision) themes, follow-ups, archipelagos, depths territory | ✅ done, **awaiting review of drafted content** | `564188b` |
| M2: work state (`start`, `clear`, WRITEUP, git touches, campfires, detail panel) | ⏭ next, not started | |
| M3: visibility (triangle rule) | not started | |
| M4: Horizon, pins, dev API, SSE | not started | |
| M5: Hero's Path, hours, polish, Atlas mode, static build | not started | |

**Acceptance evidence:**
- M0 and M1 criteria are covered by tests in `core/test/` (44 tests).
- `stratum lint` on the seed reports 217 entries and 22 regions, with 0 errors and 0 warnings.
- Placement needs no spacing relaxation.

## Open items waiting on Tiago

1. **Review the drafted `theme` and `after` content** in `world/world-seed.yaml` (see `git show 564188b -- world/world-seed.yaml`). There are 136 themed shrines (3–4 themes per region) and 42 follow-up edges. He may rename, regroup or relink freely.
2. **Regenerating the lockfile after his edits.** Once he's edited themes, offer to regenerate it so the layout follows his edits. That's safe only while no shrine has been started or cleared. Otherwise, new or changed themes get new anchors and locked shrines stay put.

## Next: M2 plan

DESIGN.md §5, §4.3, §4.4, §10.1, §11. Suggested order:

1. **Templates and `stratum start`.**
   - Create `templates/` (WRITEUP.md, NEXT.md, a python/ stub, and a minimal cpp/ stub until the `cmake-modern` shrine produces the real one).
   - Implement `stratum start <id> [--force] [--template cpp|python]`, which scaffolds `work/<id>/` and sets frontmatter `status: in-progress` and `started`.
   - Default template choice is still undecided. Suggestion: python for `interp-engineering`/`interp-theory` and anything with `llm-api`, cpp otherwise. Record the choice in `docs/decisions.md`.
   - Refusing hidden shrines or locked temples needs M3 visibility. For M2, refuse locked temples (unmet `needs`) and leave a TODO for the visibility check, or stub visibility as "all revealed".
2. **Clear validation.**
   - Implement `stratum clear <id>` per §5.1: the three sections are non-empty, there are at least `minWords` words, there is an artefact (a non-Markdown file other than NEXT.md, or a `code:` field), and temple `needs` are cleared.
   - Towers: no artefact required, but at least 3 `proposed.yaml` entries with `from: <tower-id>`.
   - On success, stamp `status: cleared` and `cleared: <today>`, print the `done` text as a self-check plus a suggested `git commit`. Never auto-commit. On failure, print a checklist.
   - Keep the validator a pure function in core (`writeup.ts` already parses frontmatter).
3. **Derived state in core.**
   - `status`, `startedAt`, `clearedAt`, and `committed` (is the cleared WRITEUP.md committed? Uncommitted clears render dashed).
   - `touches`: from `git log --format=%H%x09%ct --name-only -- work/`.
   - `campfireNote`: the first line of NEXT.md, plus its mtime.
   - Put the git access behind an injected interface so tests can fake it.
4. **map.json and the app.**
   - Add the derived fields to `MapShrine`.
   - Render campfires (a flame glyph, brightness decaying over 14 days) and dashed uncommitted clears.
   - Add a right-hand detail panel (§9.1): the prompt, **Done when**, link chips, status and dates, and the rendered WRITEUP.md via markdown-it with highlighting. It needs a selection click handler in `MapView`/`Glyph`.
5. **Acceptance tests (§13 M2):**
   - Starting a shrine creates a campfire.
   - An invalid write-up fails with a checklist.
   - A valid one clears and shows after a rebuild.
   - Uncommitted clears render dashed.
   - Use a temp git repo fixture for the git parts.

## Known limitations and TODOs

- **No live reload yet.** `stratum dev` builds once and has no file watcher, API or SSE (M4 work). Re-run `stratum build` and reload the page.
- **Towers ignore spacing** (they take the highest point near the centroid). This is fine for the seed. A proposed tower added later could land near a locked shrine.
- **Cross-region `after` edges don't affect placement.** They're intended as a Horizon signal in M4.
- **Stale lockfile entries** (removed ids) are kept on purpose; see decisions.
- **Island ground shadows** on the surface are drawn from the archipelago outlines and look blotchy. This is cosmetic, to polish in M5.
- **Atlas view for now.** Everything renders revealed (M1 atlas view) until M3 lands. The depths terrain is drawn dimly everywhere; M3 must mask it to light circles.
