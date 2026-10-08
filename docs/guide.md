# Using Stratum: a track for newcomers

Stratum turns a study plan into a map you explore by doing the work. This guide is the track from "what is this?" to a map of your own. You need Node 20+, git and a terminal.

1. **Set out.** There's no separate tutorial: the opening area *is* the tutorial. Everything you need to know shows up on the map before you need it.
2. **Get your own copy:** play this repo's world privately, or write a world for what you want to learn.
3. **Design a good opening** when you write your own: what makes a starting area teach without words.

## 1. Set out

```sh
git clone <this repo> stratum && cd stratum
npm install
npm run stratum -- setup    # once per machine: which hardware this machine has (GPU, x86, Linux, an API key)
npm run dev                 # opens the map at http://127.0.0.1:5173
```

You wake on a sky island, looking down at the land. One shrine is open: a big idea with a small build. Its panel says where your work goes and gives the exact terminal command. **Set out** runs that command for you.

Then:
- **Build it** in that folder, and fill in `WRITEUP.md` (three sections).
- **Clear it from the terminal.** Clearing only happens there: it checks your write-up and your files, and the map never clears anything by click.
- **Commit.** The repo is the record. There's no database, and the map is rebuilt from your files and their git history.

Clearing that first shrine is the descent: you glide down, and the ground comes into plain sight.

Nothing on the map explains itself in words. Instead, near where you land you'll find:
- a **tower** you can see from almost anywhere;
- a **padlock** on a shrine whose key is visible across the next ridge;
- shrines that **glow below** once you start them;
- **tall landmarks** peeking over the ridges;
- **sealed temples** on the horizon.

If you'd like a reference anyway, press **K** for the map key. The other keys:
- 1/2/3 switch layers;
- H folds the Horizon (the three suggested next steps);
- / searches what you've seen;
- A opens the Atlas, which shows everything (behind a spoiler warning, meant for authors).

**To try it without making progress,** use `npm run sandbox`. It's a fresh copy of the world in `build/sandbox/`, with its own history, and `npm run sandbox -- --reset` throws it away. Every panel there shows the right folder and commands.

## 2. Your own copy

### Play this world, privately

Your progress lives in `work/` and is committed. If this repo is public, play in **a private copy**, so your write-ups stay yours. Engine updates still arrive with a pull:

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

### Write your own world

1. Make your own copy (as above, or GitHub's "Use this template").
2. Rewrite `world/world-seed.yaml`. Its header documents every field, and `DESIGN.md` §4–§8 has the rules. Then delete `world/positions.lock.json`, empty `world/kits/`, and reset `world/proposed.yaml` to `shrines: []`. All three belong to the old world.
3. Run `npm run stratum -- lint` until it's clean, then `npm run stratum -- build` and `npm run dev`. Use `npm run sandbox` to playtest the opening as a newcomer.
4. Set out. **Change placement only before your first start:** after that, positions are fixed for good, so the map you learn never moves.

**What makes a good shrine** (from building this repo's world):
- **A concrete input.** Never "a real program" or "an API". Name the thing, have the prompt build its own input, or reuse an earlier shrine's artefact by title. If none of those fits, ship a starter kit in `world/kits/<id>/`.
- **A `done` you can check without judging "understanding":** a table, a benchmark, passing tests, a write-up that answers a question.
- **A timebox:** S is 2–3 h, M is 4–6 h, L is 8–12 h.
- **Rare locks.** About 5% of shrines, only where a task works directly on something built earlier. Use `after` for everything softer.
- **Layers mean levels.** The sky holds frameworks and big ideas, the surface practice, and the depths the mechanism under each practice shrine.

## 3. Design a good opening

The opening area is the tutorial, so design it the way good games do: show, don't tell. A tower that can be seen from everywhere needs no arrow pointing at it, and a tool left lying beside a demonstration of what it does needs no instructions. Within reach of where the learner lands, make sure they can *see* every mechanic before they need it:

| Mechanic | What to place near the start |
|---|---|
| Towers | The start region's tower, revealed and close (it's a natural first Thread). Towers elsewhere show as silhouettes from afar. |
| The descent | One self-contained opening shrine on a sky island above the plateau, small enough to clear in a sitting or two (`start.sky`). |
| Locks | One shrine in plain sight with `needs`, whose key is *seen* (even as a silhouette) a ridge or so away. The padlock primes the rule; walking to the key and back teaches it. |
| Glows | A few start shrines with a depths shrine `below`, so an early set out lights something underneath. |
| The triangle rule | Low ridges round the start, and a few p ≥ 4 landmarks just beyond them, so some things call from afar and the rest is hidden. |
| Temples | One sealed capstone on the horizon, whose panel lists what opens it. |

This repo's world is checked against that table by a test (`core/test/explore.test.ts`, "the opening area shows each mechanic"). Playtest your opening in `npm run sandbox`. A generator that interviews you and drafts a world is planned (`docs/plans/template.md`, M15); until then, a model like Claude does a good first draft if you give it this guide and `DESIGN.md`.

## Publishing your map

`.github/workflows/pages.yml` publishes a **fresh, spoiler-free** copy to GitHub Pages on every push to `main` (`stratum build --static --public`). Visitors start on the island as a newcomer would. Your `work/` progress, your pin and anything not yet seen are all left out. Enable Pages under Settings → Pages → Source: GitHub Actions.
