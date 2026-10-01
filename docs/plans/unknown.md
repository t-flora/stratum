# The unknown (M4b)

*Agreed with Tiago on 2026-09-29, between M4 and M5. Status: implemented, awaiting review.*

## The problem

On a fresh repo the start vantage showed 119 of 217 shrines (55%): 19 revealed, 100 silhouettes. The terrain was fully drawn everywhere under a grey wash, so the shape of the whole world was known from day one. The goal is about 20% of the world in sight at the start, sky included: the core plus a few shrines in neighbouring regions. The land itself should be unknown until you have looked at it.

Three things caused the 55%:
1. All 33 sky shrines were always silhouettes (15% of the world on their own).
2. The plateau's three h=1 borders (Template Highlands, Cacheline Woods, Instrument Ridge) let every p=2 shrine peek over, which showed nearly all of those regions.
3. The silhouette band is wide: 1.6·R(5) = 960 units, from the centre of a 1600×1000 map, so p≥3 landmarks behind default ridges showed almost everywhere.

## What changed

**Peek margin (§6.2).** A silhouette needs `p > H + peekMargin`, with a default margin of 1. Revealing is unchanged: in range with an unobstructed line. So p=3 peeks over h=1, only p≥4 over a default h=2 ridge, and nothing over h=4 unless a cleared tower's bonus lowers it. This tightens the whole game, not just the start. That's the "a few things call to you" intent. `peekMargin: 0` restores the M3 rule.

**Sky shrines can be hidden (§6.3).** Islands (outlines, names, ground shadows) stay visible. Tower: revealed. Other sky shrines are revealed via the island's tower or an active launch point, as before. They are *silhouettes* once a launch point on another layer is revealed ("you can see the updraft"), and *hidden* otherwise. Links between two sky shrines don't count.

**Explored land (§9.3).** The surface is blank paper except where you've looked:
- *Explorers* are the start vantage and every surface shrine you've worked on (in progress, shelved or cleared). Shelved work stops being a sight vantage but stays an explorer: you've been there, so explored land never shrinks.
- From each explorer, 360 rays march out to R(2) = 330 (R(2) + 300 from a cleared tower). A ray stops 10 units past the first ridge with h ≥ `exploreRidge` (2), so the ridge itself shows at the edge of the known world. A cleared tower counts ridges `towerRidgeBonus` (2) lower. Sea samples are skipped, as in line of sight.
- A cleared tower also charts its whole region (§1: towers "reveal the terrain of a region, not its secrets").
- The renderer masks all terrain (sea, region fills, contours, ridges, coast) to the union of the ray polygons and surveyed regions, with a feathered edge and a faint wash around it. Region names show once 15% of the region is explored, placed over the explored part. Atlas mode draws everything.
- Surface shrines carry `charted` (on explored land). An uncharted silhouette's region reads "Uncharted" everywhere in the UI.

Terrain isn't shrines: explored land across a low border can hold p=2 shrines that stay hidden until you walk over. A surveyed (tower-cleared) region was already like that (§6.2 override 3).

## Result on the seed (fresh repo)

52 of 217 shrines in sight (24%):
- The Core Plateau: all 12 revealed.
- 24 non-tower shrines in nine other regions, mostly the plateau's neighbours: Template Highlands 5, Activation Marsh 4, 2–3 each in Cacheline Woods, Instrument Ridge, Atomic Steppes, Kernel Jungle and Agent Workshops, and a lone landmark in Tick Canyon and in Vector Coast.
- The 9 other surface towers, the 5 sky towers and 2 sky shrines.

Explored land: the whole plateau and about 40% of each of its three low-ridged neighbours. Nothing else.

Raising the plateau's h=1 ridges to 2 would reach exactly 20%, but it's a world-content change and it thins the neighbours to one shrine each. We decided against it.

## map.json

- `sight.explored`: one ring per explorer, through the ray tips. `sight.fogRadius` and `towerFogRadius` are gone.
- `regions[].explored`: `{ share, centre }` for surface regions.
- `shrines[].charted`.

The full geometry is still in map.json, since the app needs it for Atlas mode. Whether the M5 static build should strip unexplored geometry is an open question.

## Config

```yaml
visibility:
  peekMargin: 1     # a silhouette peeks over a ridge H only if p > H + peekMargin
  exploreRidge: 2   # terrain is explored up to the first ridge this high
```
