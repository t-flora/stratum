# Plan: rethinking campfires (after M5, or sooner)

*Status: agreed (camp/cairn, shelving, before M5) and implemented; see docs/decisions.md.*

## The problem

Today every in-progress shrine (a `work/<id>/` folder without a valid clear) is a **campfire**: a flame on the map, fading over 14 days since NEXT.md last changed. Nothing limits how many burn at once, and the UI never says what a fire is for. In practice:

- Five fires look like five equal obligations, which works against §1.1 principle 2 ("a few choices, not a menu") and principle 5 (no guilt).
- The fires do real work that isn't visible:
  - each one is a **vantage** (§6.1), so fog lifts around it;
  - it lights the **glow** of the lightroot below (§6.4);
  - it can open a **sky launch point** (§6.3);
  - and the most recently touched one becomes the **Thread** card (§7).
  None of this is explained on the map.
- "Campfire" names both a status (in progress) and a place to resume, and the two don't match once there are several.

## What the mechanic is actually for

1. **Resume:** "where was I?" That's NEXT.md's first line, shown on the Thread card.
2. **Presence:** you're on the ground there, so the terrain around it opens up.
3. **Honesty:** started but unfinished work is visible, not hidden.

Only (1) needs to be singular. (2) and (3) apply to every started shrine.

## Proposal: one camp, the rest cairns (all derived, no new commands)

| Term | What it is | Map glyph | Derived from |
|---|---|---|---|
| **Camp** | The one place you're working now | Flame (fades over 14 days, as today) | The most recently touched in-progress shrine: the latest of NEXT.md mtime, last commit, start date. The same rule the Thread already uses. |
| **Cairn** | Work you started and stepped away from | A small stack of stones, no animation | Every other in-progress shrine |
| **Embers** | A camp untouched for over 14 days | The flame burnt down to a glow | Same as camp, visual only |

- **There's always exactly one fire.** Starting or touching another shrine moves the camp there automatically, and the old camp becomes a cairn. No command, no state file: it's a function of the repo, like everything else.
- Both camps and cairns remain **vantages** and still light the glow below. Stepping away doesn't re-fog the land you walked.
- **Hover texts say what they are.** Camp: "Your camp · where you left off: *NEXT.md line*". Cairn: "A cairn you left · *NEXT.md line*".
- `stratum status` prints `Camp: <id> (note)` and then `Cairns: …`.
- **The Horizon's Thread card is the camp**, so it reads "Return to camp". It already picks the same shrine, so this is a wording change.

### Shelving (optional)

A way to say "I'm not coming back to this soon" without deleting work: `status: shelved` in WRITEUP.md frontmatter, set by `stratum shelve <id>` and undone by `stratum start <id>`. A shelved shrine keeps its folder and history, shows no marker, and stops being a vantage. It's removed from the map's sense of "you are here" but not from git. This needs a new frontmatter value, so it's Tiago's call.

### Making the map legible generally

A small collapsible **map key** (bottom corner, key `K`) that explains every glyph in a line each: shrine states, silhouette, camp, cairn, embers, chasm, updraft, pin, the dashed "not committed" halo. It fixes this confusion for campfires and for the glyphs M3 added.

## Alternatives considered

- **Hard limit of one in-progress shrine** (`start` refuses while another is open unless `--force`). Simple, but it punishes the normal case of waiting on a long benchmark or a server run while starting something else. Derived camps give the same "one fire" clarity without friction.
- **Keep several fires, just explain them.** A legend helps, but five equal flames still read as five obligations.
- **Rename only** (fires → "expeditions"). It's cheap, but it leaves the "which one is current?" ambiguity.

## Implementation sketch (small)

- **core:** `deriveWorkState` already computes `campfire.since`. Add `camp: boolean`, true for the single most recently touched in-progress shrine, with ties broken by id. Everything else in progress is a cairn. Rename the `campfire` field to `camp` in map.json (`{ note, since, current }`) and move the tie-breaking rule into core, so the Horizon and the map can't disagree.
- **app:** a cairn glyph (original design: three stacked rounded stones), embers styling past 14 days, the new hover texts and the map key.
- **CLI:** `status` wording, `start`'s closing line ("Camp moved to …"), and `shelve` if approved.
- **Docs:** DESIGN.md §10.1 and the §9.3 glyph table say "campfire". Update them once Tiago agrees, and record the decision.

## Questions for Tiago

1. Is **camp / cairn** the right vocabulary, or would you prefer something else (for example "camp / waypoint")?
2. Should cairns **stay vantages**? (Recommended: yes, walked land stays walked.)
3. Do you want **shelving**, and should a shelved shrine stop being a vantage?
4. Should this come **before M5** as a small milestone? It's small: mostly core wording, one glyph and the map key.
