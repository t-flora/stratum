# Using Stratum: a track for newcomers

Stratum turns a study plan into a map you explore by doing the work. This guide is the track from "what is this?" to a map of your own. You need Node 20+, git and a terminal.

1. **Play the tutorial** (about an hour). It teaches every mechanic on a tiny practice world.
2. **Read the tutorial world**, a worked example of the format a world is written in.
3. **Get your own map:** play this repo's world in a copy of your own, or write a world for what you want to learn.

## 1. Play the tutorial

```sh
git clone <this repo> stratum && cd stratum
npm install
npm run tutorial          # sets up build/tutorial/ and opens the map at http://127.0.0.1:5174
```

The tutorial is a copy of `examples/tutorial/` under `build/tutorial/`, with its own git history. Nothing you do there touches the real world. `npm run tutorial -- --reset` starts over.

The tasks are tiny and work in any language. Each shrine teaches one thing:

| Shrine | What it teaches |
|---|---|
| *First steps* (on the Lookout, a sky island) | The loop: **Set out** scaffolds a folder; you build something, write `WRITEUP.md` (three sections) and run `stratum clear`. It's also **the descent**: you start on the island and land once you clear it. |
| *Time it* | Your **camp**. The first line of `NEXT.md` shows on the map, and the Horizon brings you back there. |
| *Make a tool* → *Use your tool* | **Locks.** *Use your tool* is visible from the start, but it needs your tool, so you come back once you've built it. |
| *Tower: the Trailhead* | **Towers and proposals.** A survey, plus three new shrines you propose for the world (`stratum propose`). |
| *The far landmark* | **The triangle rule.** A high ridge hides the Far Field, and only this tall landmark peeks over it. Walk around or climb a tower. |
| *What it turns into* | **The depths.** It glows once you start *Time it*, and clearing it lights the dark around it. |
| *Temple: the Trailhead* | **Temples:** a capstone that opens once its needs are cleared. |

**The CLI** takes `--root` to point at the tutorial. Run it from the repo root:

```sh
npm run stratum -- --root build/tutorial start tut-time-it      # or press Set out on the map
npm run stratum -- --root build/tutorial clear tut-time-it
npm run stratum -- --root build/tutorial status
```

**Commit as you go,** inside `build/tutorial/` (`cd build/tutorial && git add -A && git commit -m "..."`). A clear that isn't committed yet is drawn dashed. The repo is the record: there's no database, and the map is rebuilt from the files and their history.

**Keys:** 1/2/3 switch layers, H folds the Horizon, K shows the map key, / searches what you've seen. A opens the Atlas (everything, behind a spoiler warning), which is meant for authors.

## 2. Read the tutorial world

Open `examples/tutorial/world/world-seed.yaml`. It's about a hundred lines, and it's the whole format:
- **`start`:** the opening sky shrine (`sky`), where you land (`vantage`), and what's revealed there (`plateau`).
- **`regions`:**
  - surface regions with a centroid and an optional `biome`;
  - sky islands with a radius;
  - depths "veins".
- **`ridges`:** heights between neighbouring regions. Low ridges let landmarks peek over, high ones make you go around.
- **`shrines`:** `title`, `region`, `prompt` (what to build) and `done` (the clear condition), plus:
  - `size` (S/M/L) and `p` (prominence: how far away it can be seen);
  - `kind` (tower or temple);
  - `after` (builds on), `needs` (locked until those are cleared), `links` (across layers);
  - `below` (depths shrines sit under the surface shrine whose mechanism they measure).

Check a world with `npm run stratum -- --root examples/tutorial lint`. Placement is automatic and then fixed for good: `world/positions.lock.json` records where each shrine went, so the map you learn never moves. `DESIGN.md` §4–§8 has the full rules.

## 3. Your own map

### Play this world, privately

Your progress lives in `work/` and is committed, because the repo is the record. If this repo is public, play in **a private copy** of it, so your write-ups stay yours. Engine updates still arrive with a pull:

```sh
# Create an empty private repo first, e.g. <you>/stratum-journey (GitHub: New repository, Private).
git clone <this repo's URL> stratum-journey && cd stratum-journey
git remote rename origin upstream
git remote add origin git@github.com:<you>/stratum-journey.git
git rm .github/workflows/pages.yml && git commit -m "No public site for the journey"
git push -u origin main
npm install && npm run stratum -- setup && npm run dev
# Later, to pick up new versions: git pull upstream main
```

Run `npm run stratum -- setup` once per machine. It records which hardware tags this machine has (GPU, x86, Linux, an API key), so the Horizon only offers shrines you can actually run there.

### Write your own world

1. Make your own copy (as above, or GitHub's "Use this template").
2. Replace `world/world-seed.yaml`, starting from the tutorial's as a skeleton. Delete `world/positions.lock.json`, empty `world/kits/`, and reset `world/proposed.yaml` to `shrines: []`; all three belong to the old world.
3. Run `npm run stratum -- lint` until it's clean, then `npm run stratum -- build` and `npm run dev`.
4. Set out. **Change placement only before your first start:** after that, positions are fixed for good.

**What makes a good shrine** (from building this repo's world):
- **A concrete input.** Never "a real program" or "an API". Name the thing, have the prompt build its own input, or reuse an earlier shrine's artefact by title. If none of those fits, ship a starter kit in `world/kits/<id>/`.
- **A `done` you can check without judging "understanding":** a table, a benchmark, passing tests, a write-up that answers a question.
- **A timebox:** S is 2–3 h, M is 4–6 h, L is 8–12 h.
- **Rare locks.** About 5% of shrines, only where a task works directly on something built earlier. Use `after` for everything softer.
- **Layers mean levels.** The sky holds frameworks and big ideas, the surface practice, and the depths the mechanism under each practice shrine.

A generator that interviews you and drafts a world is planned (`docs/plans/template.md`, M15). Until then, a model like Claude does a good first draft if you give it this guide, `DESIGN.md` and the tutorial world.

### Publishing your map

`.github/workflows/pages.yml` publishes a **fresh, spoiler-free** copy to GitHub Pages on every push to `main` (`stratum build --static --public`). Visitors start on the island as a newcomer would. Your `work/` progress, your pin and anything you haven't seen yet are all left out. Enable Pages under Settings → Pages → Source: GitHub Actions.
