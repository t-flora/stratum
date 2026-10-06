# Plan: treasure, secrets and total completion (M11)

*Asked for by Tiago on 2026-10-02, after M6. Status: proposal with his answers folded in (2026-10-05). Four smaller questions are open at the end.*

## What's wanted

Rare things on the map that are around to be looked for: extra tasks, readings, hidden concepts. Tiago's answers:
- **Hidden concepts are found through write-ups.** A concept unlocks when a write-up mentions it.
- **He wants to be surprised by the treasure too.** A model writes the contents and seals them; nobody, the owner included, reads them before they're found.
- **Found tasks count.** A side task from a chest is a real clear.
- **Total completion is a reward of its own,** in two steps. Once 75% of every region is cleared, a tracker shows the *percentage* of all content completed (shrines, chests, secrets), but never where anything is. Once 75% of all content is done, an *optional* view can mark the locations of what's left.

## Constraints it has to respect

- **The repo is the record (§0.1).** Placement, contents, found and opened state are all files. Nothing lives in the browser.
- **Clearing requires artefacts (§0.2).** Opening a chest is just reading it, so a click is fine. A side task found in one clears like any shrine: `start`, a write-up, an artefact, `clear`.
- **The triangle rule (§0.3).** Treasure never shows before it's found: no silhouettes, no "12 remaining" counter. Atlas mode is still the escape hatch, but it shows chests *sealed*.
- **Stable placement (§0.4).** Chest spots are locked like shrines. Adding treasure later moves nothing, so this is safe after the first `stratum start`.
- **No guilt mechanics (§1.1, §15).** Feats are triggers for content, never badges or scores.

## Two families

### Chests: found by exploring a place

- **Spots** are chosen by the engine from the geometry:
  - **Sky:** the bare rocks of each archipelago (about 20 exist already).
  - **Surface:** offshore islets, river sources and mouths, lake shores, cliff tops, and the far side of h ≥ 3 ridges.
  - **Depths:** dark pockets between veins, far from any wellspring.
  
  Spots are picked deterministically (`mulberry32(hash32(...))`) at a density of about 7% of all locations, which is about 15 chests for 217 shrines (config `treasure.density`). They're kept apart (minimum spacing, at most one per theme area) and written to `positions.lock.json` under `!chest/<id>` keys.
- **Found** when the spot is explored (surface), lit (depths), or in view of a revealed launch point (sky). Derived at build time, like visibility, with no state.
- **Opened** with `stratum open <chest>`, or the button in the detail panel through the dev API. It's recorded in `state/treasure.yaml`.
- **Contents come from a loot list,** `world/treasure.yaml`, not from the spot. Each item may carry an affinity (`near: <shrine | theme | region>`). The build matches items to spots, nearest fitting affinity first, and locks the match. That keeps the same modularity as shrines and terrain: you can change the loot without moving the map, and change the map without rewriting the loot.

### Secrets: found by doing

- **Echoes.** A hidden concept is attached to a shrine, theme or region, as a few accepted phrasings: `concept: ["Little's law", "L = λW"]`. It unlocks when a write-up *in its scope* mentions any of them. The match is case-insensitive and on word boundaries, so it's checkable without judgement and needs no LLM (§15).
- **Feats.** These unlock on repo facts:
  - clearing a shrine and the wellspring beneath it;
  - clearing every shrine in a theme;
  - finishing a follow-up chain;
  - clearing a temple.
  
  None of them are time-based (no streaks, no deadlines).

### What can be inside

| Kind | What it is | Counts toward completion |
|---|---|---|
| `task` | A side task with its own `prompt` and `done`. It becomes a startable shrine at the chest's spot, with id `<chest-id>`. | Yes, as a clear |
| `variant` | A hard-mode version of a nearby shrine ("the same, at 2× the scale, measured on the server"). Also clearable. | Yes, as a clear |
| `reading` | A paper or chapter, with why it matters here | Yes, once opened |
| `concept` | A hidden idea to look into, often leading toward an echo elsewhere | Yes, once opened |
| `cards` | A small set of Q/A flashcards (Markdown, exportable once M13 lands) | Yes, once opened |
| `note` | A short piece of lore or a historical aside | Yes, once opened |

## Sealing

Contents are stored encoded, so a casual glance at `world/treasure.yaml` can't spoil them:
- Each item's text is AES-GCM encrypted with a key derived from the world seed and the item id (`HKDF(seed ‖ id)`).
- Only `stratum` decodes it, and only for found items.
- `map.json` carries contents for opened items only. Unfound ones are absent; in the Atlas they're "sealed".

This is a seal, not security: anyone determined can run the decoder. It exists only so you don't spoil it by accident, and that's the stated intent.

**Authoring.** For Tiago's world, a Claude session writes the loot without showing it to him. It works from the world, the themes, and his write-ups so far, then runs `stratum treasure seal` and commits. Later sessions can top it up the same way. The same flow is the treasure step of the M13 generator.

## Total completion

Clarified by Tiago on 2026-10-05: **show how much, never where.** There are two unlocks, at two different thresholds.

**1. The tracker: a percentage, no locations.** It unlocks when every region reaches 75% cleared.
- **Which regions:** all 22 (the surface regions, sky islands and depths veins). Each region counts its own shrines plus any chest tasks inside it.
- **What it shows:** a "Total completion" readout with one percentage: completed content out of *all* the content the map contains. That covers cleared shrines and chest tasks, opened chests, and unlocked secrets.
- **Optionally, a percentage per kind** (shrines, chests, secrets). These are percentages, not counts, so the number of chests stays a mystery.
- **What it never shows:** no markers, no lists of what's left, and no hints of where.
- **Until it unlocks,** nothing anywhere says how much treasure exists.
- **The unlock is a moment:** a one-time toast, and a line in `stratum status`.
- **The existing readout stays.** "x% of the world" in the top bar counts cleared shrines, as specified in §10.2.

**2. The remaining-locations view: an option, off by default.** It unlocks when 75% of *all* content is complete. That's the overall percentage from the tracker, not per region.
- **What it does:** a toggle (a key, a top-bar button, and `?remaining=1`) that marks *where* every incomplete item is:
  - uncleared shrines, as their glyphs;
  - unopened chests, as a closed-chest outline;
  - echoes, as a faint shimmer over their scope (shrine, theme or region).
  
  Feats have no place, so they appear only as part of the percentage.
- **How it differs from the Atlas:**
  - it reveals *locations, not contents*;
  - prose follows the normal silhouette rules (titles only at p ≥ 3, otherwise "???");
  - chest contents stay sealed;
  - it doesn't reveal terrain.
  
  The Atlas remains the all-spoilers authoring view.
- **It's a view, not progress.** It's off by default and turned off again with the same toggle. Like the Atlas, it's kept in the URL, never in the repo or browser storage. Below the threshold the toggle doesn't exist; it isn't just greyed out.
- **The threshold** gets its own one-time toast: "The rest of the map can now be marked: press R."

## Phases

| Phase | What | Size |
|---|---|---|
| Tr1 | Spot finder (geometry → candidate hiding spots per layer), locked chest slots, found/opened state, glyphs and the detail panel | medium |
| Tr2 | `world/treasure.yaml` schema, affinity matching, sealing and `stratum treasure seal/open`, chest tasks as startable shrines | medium |
| Tr3 | Echoes and feats (write-up scan, repo-fact triggers), secret glyphs and toasts | small–medium |
| Tr4 | Total completion: the percentage tracker (every region ≥ 75%) and the remaining-locations view (all content ≥ 75%) | small–medium |
| Tr5 | A Claude session authors and seals the loot for Tiago's world (unseen by him) | small |

**Accept when:**
- Chests are invisible until found, and stable across builds.
- Adding loot or spots moves no shrine.
- Sealed text never appears in `map.json` before it's opened.
- A chest task clears like a shrine.
- An echo unlocks from a write-up mention.
- The tracker appears exactly when every region crosses 75%, and shows a percentage with no locations.
- The remaining-locations view exists only once all content crosses 75%, is off by default, and never reveals contents or prose beyond the silhouette rules.

## Questions for Tiago

1. **Hardware-gated content vs. the 75% rule.** 32 shrines need a GPU, and on the Mac, Kernel Jungle and the Silicon Vein are entirely GPU. Recommended: a config list `completion.exclude: [gpu]` of tags you never expect to have, which are left out of the 75% rule (but still shown in the totals). The default is empty, so everything counts.
2. **Density.** Is about 7% (≈15 chests, plus roughly 10 secrets) the right rarity?
3. **Echo scope.** Should a concept unlock only from write-ups in its own region or theme (recommended: it rewards connecting nearby ideas), or from any write-up?
4. **Opened readings and cards:** should they count as soon as they're opened (recommended), or only once a write-up references them?
