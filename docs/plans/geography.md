# Geography: a world worth uncovering (proposal)

*Asked for by Tiago on 2026-09-30, after M5. Status: built as M6. His answers: replace the oval with a generated continent, keeping themes clustered and follow-ups close; a `biome:` field; rivers as decoration only; features named later (generated). Details in docs/decisions.md, M6.*

## The problem

The fog (M4b) hides the land well, but the land itself is predictable:
- **The landmass is an ellipse.** `Geometry.landSigned` is a 760×470 oval with a few percent of coastal noise. You know its outline before you've seen it, and you've seen it whole in the Atlas.
- **Regions are warped Voronoi cells**, and the terrain inside them is contour lines over smooth noise. The ridges are the only features, and they're drawn the same way everywhere.

The region names already promise a varied world (Template Highlands, Cacheline Woods, Atomic Steppes, Tick Canyon, Activation Marsh, Kernel Jungle, Vector Coast), but the map draws them all alike.

## Proposal, in two parts

### A. A new landmass (changes positions, so it has to happen before real work starts)

Replace the ellipse with a generated continent, deterministic from `world.seed` as now:
- **Shape**: a union of several noisy lobes, with peninsulas, deep bays and fjords, a few offshore islands, and possibly an inland sea or lake that line of sight crosses as it already crosses bays.
- **Guarantees**, checked by the generator (the build fails, or tries the next derived seed, deterministically): every region centroid is on land, every region has a minimum area and is one piece, the plateau stays central, and every ridge override in world-seed.yaml still joins adjacent regions.
- **Cost**: the classifier changes, so every position, ridge line and contour changes. That means regenerating `positions.lock.json`, which is only allowed while no shrine has been started or cleared. Two consequences:
  - It should happen together with the regeneration already planned after your theme review (status, open item 3).
  - It needs the scratch folders in `work/` (constexpr-tables, contracts-26, lambdas-closures, std-expected-errors, tower-design) removed first. They're from M4 testing and untracked; I haven't touched them.

  Later, the "new world" level in [reset.md](reset.md) would use the same machinery.

### B. Geographic features (rendering, no positions move)

Drawn only on explored land, inside the existing terrain mask, so finding them is part of exploring:
- **Mountains on high ridges.** h ≥ 3 borders become chains of peaks, and h = 4 gets snow caps. The triangle rule becomes visible: you can see why you can't see past them.
- **Rivers and lakes.** Rivers start in the highlands and run downhill along the elevation field to the sea; lakes fill the low basins. Rendering only at first. Later, a river crossing could count as a low (h = 1) ridge for line of sight.
- **Biomes per region**, each with its own ground texture:

  | Biome | Look | Seed region |
  |---|---|---|
  | woods | tree stipple | Cacheline Woods |
  | jungle | dense canopy | Kernel Jungle |
  | marsh | reeds and pools | Activation Marsh |
  | steppe | grass ticks | Atomic Steppes |
  | canyon | cliff hatching and a gorge | Tick Canyon |
  | highland | crags and dense contours | Template Highlands |
  | coast | dunes and beaches | Vector Coast |
  | plateau | mesa edges | The Core Plateau |
  | workshop | quarries and terraces | Agent Workshops |
  | ridge | screes | Instrument Ridge |

- **Coasts with character**: cliffs where land is high near the sea, beaches where it's low, and reefs off the islands.

The new biome field (question 2) would be an optional `biome:` on each region in world-seed.yaml, a structural field that needs your approval. Without it, each region's biome would be inferred from its name. Sky and depths stay as they are.

## Suggested milestones

- **M6: Geography.** Part A, then part B. Accept when:
  - the landmass passes its guarantees for the seed;
  - two builds are identical;
  - adding a shrine to proposed.yaml still moves nothing;
  - a fresh repo still shows 15–25% of the world;
  - every biome renders at zoom 1 and zoom 3 on screenshots.
- **M7: Expeditions** ([reset.md](reset.md)).

## Questions for Tiago

1. Regenerate the shape (part A) now, together with the post-review lockfile regeneration? Or keep the current outline and do features only (part B)?
2. A `biome:` field per region in world-seed.yaml, or infer the biome from the names?
3. Rivers: decoration only, or should crossing one also block sight a little?
4. Any landmarks you want named on the map (a lake, a river, a mountain range), or should features stay unnamed?
