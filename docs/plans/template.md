# Plan: Stratum as a template for any topic (M10, M12–M16)

*Asked for by Tiago on 2026-10-02. Status: proposal with his answers folded in (2026-10-05). Four questions are open at the end.*

## What's wanted

Anyone should be able to generate a Stratum world for whatever they want to learn, with little tasks, notes, papers and flashcards, and get the same pull Tiago's world has. His answers:
- **Audience, for now:** people comfortable with git and a terminal. A fork-and-go repo, no hosted app.
- **A model creates the content, for the learner's discovery.** The learner shouldn't have to read, or be able to casually read, what's ahead. So the application's real job is to be **the best scaffold on which a model designs a world**.
- **Why this matters:** Tiago's world worked partly because his intent was clear from the start. A second user won't arrive with a 31 KB design doc, so the scaffold has to draw that intent out and turn it into good design.

## Constraints it has to respect

- **All of §0 still holds:** the repo is the record, clears need artefacts, the triangle rule, and stable placement.
- **No LLM inside the app (§15).** The model works *outside* the app, as a Claude Code skill and its subagents, writing files the engine validates. The engine stays deterministic and testable.
- **Content and map stay independent** (the modularity report, 2026-10-02). A world pack can be regenerated, extended or re-themed without engine changes, and vice versa.

## What a "world" becomes: a pack

```
world/
  pack.yaml           # vocabulary and rules for this world (new, M12)
  brief.md            # the learning brief: who, what, why, how far (new, M15)
  world-seed.yaml     # regions, ridges, shrines (as today)
  proposed.yaml       # as today
  treasure.yaml       # sealed loot (M11)
  positions.lock.json # as today
templates/            # starter files for `stratum start`, per task kind (moves under the pack)
```

`pack.yaml` holds everything that's hard-coded to Tiago's topic today:
- **`requires` vocabulary,** with an optional probe command per tag. Today the list is fixed in `types.ts`, with `nvidia-smi` and `ANTHROPIC_API_KEY` checks in `hardware.ts`.
- **Templates, and when each is the default.** Today `clear.ts` picks Python for two region ids by name.
- **Task kinds and what counts as an artefact for each.** Today any non-Markdown file counts, which assumes coding.
- **Vein colours.** Today `palette.ts` keys them by Tiago's region ids.

## Milestones

### M10: Ready to share (small, can go first) — done 2026-10-05
- **Renames.** Two terms were coinages of a specific game: the depths node and the line through your clears. They're now *wellspring* and *trail* (Tiago kept them; the old names are in git history before M10). Every other term (shrine, tower, depths, sky island, campfire, chest) is generic.
- **Neutral docs.** DESIGN.md and CLAUDE.md say "inspired by open-world exploration games" and drop the game names, and the README is written for a stranger.
- **Personal details.** For a public repo, move Tiago's email, programme and personal context out of DESIGN.md and CLAUDE.md, into a gitignored or private note.
- **Licence:** a `LICENSE` file (MIT recommended), plus a third-party notice (dependencies are MIT, ISC, BSD and MPL-2.0, all permissive; the fonts are OFL). Done: `LICENSE` and `THIRD_PARTY.md`.
- **Accept when:** a grep for the game names and coined terms finds nothing outside a single "inspiration" sentence; `npm test` passes; the map and CLI read the same apart from the renamed terms.

### M12: World packs (the engine/world split)
- **`pack.yaml`** with:
  - a `requires` vocabulary (tag, description, optional probe command);
  - `templates` (folder, default for which regions, kinds or tags);
  - `kinds` (task kinds and their artefact rule);
  - `palette` (region and vein colours).
- **A `kind` field on shrines** (default `build`), giving each shrine one of these artefact rules:

  | Kind | Artefact rule |
  |---|---|
  | `build` | a non-Markdown file, as today |
  | `essay` | the write-up alone, with a higher word minimum |
  | `reading` | a summary plus a citation |
  | `practice` | a log file |
  | `cards` | at least N Q/A cards |

  Tiago's world keeps today's behaviour as `build`.
- **Probes run shell commands from the pack**, so `stratum setup` shows each command before it runs and asks once.
- **Safe content edits** (from the 2026-10-02 modularity report): a drift check in `lint` (a locked shrine that contradicts its region, theme or `below`, with `build --replace --drifted` for untouched ones), and `stratum rename <old> <new>` (moves the lock entry, the `work/` folder and every reference). Generated worlds get edited and topped up, so this has to be safe.
- **Accept when:** the five drift cases from the modularity report are each reported, and a rename keeps position and work; Tiago's world runs unchanged from its own `pack.yaml`; the tiny fixture runs with a different vocabulary (e.g. a language-learning pack with `kinds: [practice, cards, essay]` and no hardware tags); no region id appears in engine code.

### M13: Learning materials
- **Notes, papers and flashcards as first-class files** in a work folder: `notes/`, `papers:` in the write-up frontmatter (M8 E1 defines it; whichever lands first owns it), and `cards.md` as Q/A pairs.
- **Counted and shown** in the detail panel; `stratum cards export` writes Anki CSV (and plain TSV).
- **Treasure `cards` and `reading` items** (M11) use the same formats.
- **Still no spaced-repetition engine** (§15). Export instead.
- **Accept when:** a `cards`-kind shrine clears on its cards alone; the export round-trips into Anki; RemNote links keep working.

### M14: The world-design scaffold (the core of the template)

What a model needs to design a *good* world, not just a valid one.

1. **JSON Schemas** for `pack.yaml`, `world-seed.yaml`, `treasure.yaml` and the write-up frontmatter, generated from the loader's types and published under `schema/`. The loader stays the authority; the schemas are its contract for tools.
2. **`docs/world-design.md`, the craft, written for models.** *(First version written 2026-10-08 from the first world's audits and playtests: engagement forces, shrine and world rules, the opening area as the tutorial, audit passes and worked examples. Extend it as M14 adds the design lint and simulator.)* It distils what made Tiago's world work, so a second world doesn't depend on its author's clarity:
   - **Layers:** sky = frameworks and big ideas; surface = practice; depths = the mechanisms underneath. Each wellspring explains the machinery under the practice shrine above it.
   - **Shape:** 6–12 surface regions, 8–14 shrines each. One tower per region, with a survey prompt that generates proposals. 0–2 temples, each needing 3–4 shrines from different themes.
   - **Pacing with ridges and prominence:**
     - Low ridges join regions that belong together, and high ridges make the learner go around.
     - A few p ≥ 4 landmarks per region pull from afar.
     - A fresh map shows 15–25% of the world.
   - **Themes and follow-ups:** 2–5 shrines per theme, each with a small entry point. `after` only where one shrine's artefact or idea is real preparation for another.
   - **Good tasks:** an S/M/L timebox; a `done` that can be checked without judging "understanding"; a mix of task kinds; hardware tags honest.
   - **Treasure:** which kinds suit which places, and how to write echoes that reward connecting ideas.
   - **Worked examples:** excerpts from Tiago's world, annotated.
3. **`stratum lint --design`.** *(Built 2026-10-08, `core/src/design.ts`; see decisions.md. It also flags §5's A and B phrasings and "your X" with no `after`, and checks the lock budget, chains and key distance.)* Warnings, not errors; each is a measurable property of good design:
   - a theme with no S/M entry point;
   - a shrine with no links, follow-ups or depths (an island of content);
   - a `done` that looks unverifiable (heuristics such as "understand", "learn", "be familiar");
   - prominence budget per region;
   - a layer imbalance;
   - a region over capacity (spacing would relax);
   - a hardware-gated share above 50% in any region;
   - a fresh-map discovery share outside 15–25%;
   - a temple whose needs sit in a single theme;
   - an opening area that doesn't teach by sight (added 2026-10-08; docs/guide.md §3): after landing, no revealed tower, no revealed lock with its key seen, fewer than two start shrines with depths below, fewer than three p ≥ 4 landmarks beyond the start, or no temple in sight. There's no separate tutorial, so the opening area is the tutorial.
4. **`stratum simulate`.** A synthetic learner plays the world: it takes Horizon cards (thread, vertical or far, in a seeded mix), starts and clears them, and opens what it finds. It reports:
   - the discovery curve (share of the world seen after n clears);
   - when each region is first seen;
   - whether everything is reachable;
   - how often the Horizon offers a real choice;
   - when chests and secrets turn up;
   - when the 75% tracker unlocks (M11).
   
   This gives the model feedback on pacing that it can't get by reading YAML. It's deterministic and fast (no rendering).
- **Accept when:** Tiago's world passes `lint --design` with only explained warnings; `simulate` on his world gives a sensible curve (recorded as a baseline); deliberately bad fixtures (a wall of ridges, a missing entry point, an orphan shrine) are each caught.

### M15: The world generator (a Claude Code skill)
- **Interview.** The goal and why, current level, time per week, end state, preferred artefacts, available tools and hardware, and topics to avoid. This becomes `world/brief.md`: the design rationale every later session reads before extending, topping up treasure, or reviewing.
- **Draft in stages, with subagents:**
  1. skeleton: layers, regions, ridges, the plateau;
  2. shrines region by region, in parallel subagents, each given the brief, the design guide and its neighbours;
  3. the cross-links, follow-ups, depths and sky launch points;
  4. the sealed treasure.
- **Revise against the tools:** `lint`, `lint --design` and `simulate`, until the warnings are explained and the curve sits in range.
- **Spoiler-safe handoff.** The skill tells the learner only the region names and what's on the plateau. Everything else is for the map to reveal.
- **Sealed worlds.** With the pack setting `seal: shrines` (recommended default for generated worlds), shrine prose is stored sealed like treasure and decoded only at build. `map.json` carries prose only for revealed shrines, and the Atlas shows structure without prose.
- **Accept when:**
  - the skill produces lint-clean worlds for three unlike topics (for example, conversational Spanish to B2, music theory for a guitarist, and an MSFM-style quantitative finance world);
  - each passes `lint --design` and has a simulate curve in range;
  - a reviewer who hasn't seen the brief judges the tasks concrete and checkable.

### M16: Template release
- **A GitHub template repo:** engine, an empty starter pack, the generator skill, docs, and one or two example packs (possibly Tiago's).
- **Commands:** `stratum new` scaffolds an empty pack; `stratum doctor` checks Node, git and the dev server.
- **A short "your first hour" guide:** fork, run `/generate-world`, `npm run dev`, set out.
- **Upgrading.** Engine updates land in forks via `git pull upstream`, with the engine kept apart from `world/` so merges stay clean. A published engine package can come later if people actually use it.
- **Accept when:** a fresh fork on a clean machine goes from clone to a generated world on the map in under 30 minutes, following only the README.

## Order and timing

1. **M10 first.** It's small and safe at any time (no data changes).
2. **M11 next.** It improves Tiago's own world now, and it's safe after the first start.
3. **Then M12 → M14 → M15 → M16.** M13 can slot anywhere after M12.
4. **Side milestones.** M7 (expeditions) and M9 (feature names) are independent. M8's region weights (E1) are only cheap before the first `stratum start`.

| Milestone | Size |
|---|---|
| M10 | ~1 session |
| M11 | ~3–4 sessions |
| M12 | ~2–3 sessions |
| M13 | ~2 sessions |
| M14 | ~3–4 sessions |
| M15 | ~3–5 sessions, plus quality tuning |
| M16 | ~1–2 sessions |

## Questions for Tiago

1. ~~**Names for the two coined terms.**~~ **Answered:** *wellspring* and *trail*, kept at the M10 review.
2. **Licence and your world:** MIT (answered, kept). His world is public (answered 2026-10-07: the repo and its Pages site are public; the site shows the fresh, spoiler-free view and his playthrough lives in a private copy). The original question: should your world ship publicly as the example pack, or stay private with the generator's example packs shown instead?
3. **Sealed shrine prose** (`seal: shrines`) as the default for generated worlds? Your own world would stay unsealed, since you've already read it.
4. **Distribution:** a template repo with `git pull upstream` for updates (recommended for now), or an engine package from the start?
