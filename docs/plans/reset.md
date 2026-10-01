# Resetting progress: expeditions (proposal)

*Asked for by Tiago on 2026-09-30, after M5. Status: proposal, awaiting his answers below.*

## What's wanted

A deliberate way to start the map over (fog back, no camps, no path) that is hard to trigger by accident, and separate from destroying the work itself, especially write-ups and code submitted for shrines.

## Constraints it has to respect

- **The repo is the only source of truth** (§0.1). A reset has to be a change to files, not a flag in a browser or a database.
- **Positions never change** (§0.4). Starting the map over must not move a single shrine. A *new world* (a new shape, new positions) is a different operation, and it's only safe when nothing in that world has been started (CLAUDE.md, lockfile rule).
- **Clearing requires artefacts** (§0.2). An old write-up must not silently re-clear a shrine in the new run.

## Proposal: three levels, from gentle to drastic

### 1. New expedition: the map starts over, the work is kept (recommended default)

`stratum expedition new` moves `work/*` to `archive/expedition-<n>/` with `git mv`, clears the pin, and records the run in `state/expeditions.yaml` (number, start date, and what was archived).

- The map is already a pure function of `work/`. With `work/` empty, it is exactly a fresh repo: fog, start vantage, nothing cleared. No core change is needed for the reset itself.
- **Everything is kept**: the write-ups, code and history are still in the repo under `archive/`, and in git. `stratum status --expeditions` lists past runs with counts and hours.
- **Starting a shrine you did before** scaffolds a fresh `work/<id>/`. The old folder stays in the archive; `start` says so and prints its path. Clearing needs a new write-up, so the old artefacts can't re-clear it (§0.2).
- Optional, see question 2: **memories**. Once a shrine is revealed again in the new run, a faint mark could say "you cleared this in expedition 1". It would never reveal anything on its own.

### 2. Erase: delete the work

`stratum erase` runs `git rm -r work archive state/expeditions.yaml` and clears the pin. It's for "I want none of this in the tree". It's still recoverable from git history, which the command says.

### 3. New world: a new map

Only possible when `work/` is empty, so after 1 or 2. It sets a new `world.seed` and regenerates `positions.lock.json`. With the new landmass generator in [geography.md](geography.md), that means a new shape you don't know yet. It's the one level that touches the lockfile, and it's why the lockfile rule says "never once any shrine has been started".

## Hard to hit by accident

- **CLI only.** No button in the app; the map key just mentions the command.
- **Dry run by default.** Without a confirmation, each command prints exactly what it would move or delete and changes nothing.
- **A confirmation you can't type by reflex.** `--confirm <n>`, where n is the number of shrines the command would archive or erase (printed by the dry run). For a new world, `--confirm <new seed>`.
- **Refuses with uncommitted changes**, so every reset is one revertible commit. Like `stratum clear`, it never commits itself; it suggests the commit message.

## Questions for Tiago

1. Is the archive model right for "reset the map, keep the submissions", rather than a date cut-off that hides older work in place?
2. Memories: should past clears leave a faint "you were here before" mark once a shrine is revealed again, or should a new expedition be a completely clean slate?
3. Should `expedition new` offer the new-world step in the same command (behind its own confirmation), or keep them separate?
4. Do archived hours count anywhere, for example a lifetime total in `stratum status`?
