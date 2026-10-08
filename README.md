# Stratum

A three-layer exploration map for deep study, inspired by open-world exploration games. The map shows a world of **shrines**, each a small task: a build plus a write-up you commit to this repo. Everything on the map is derived from the repo's files and git history, so fog lifts, wellsprings glow and your trail grows only as a side effect of doing the work. There's no database and no "mark as done" button.

- **Three layers.** The **sky** holds frameworks and big ideas, the **surface** concrete practice, and the **depths** the mechanisms underneath. Each depths shrine sits under the surface shrine whose machinery it explains.
- **You can't see everything.** Ridges hide what's behind them, tall landmarks call from afar, and the depths are dark until you light them. The Horizon panel offers three next steps: continue nearby, change layer, or head for a far landmark.
- **Places don't move.** A shrine's position is fixed once assigned, so the map becomes somewhere you remember.

## Quick start

Needs Node 20+ and git. **New here?** Read [docs/guide.md](docs/guide.md): set out, play privately, or make a map of your own. There's no separate tutorial: the opening area teaches the game.

```sh
npm install
npm run stratum -- setup    # once per machine: detect hardware tags
npm run dev                 # http://127.0.0.1:5173 (keys 1/2/3 switch layers)
```

Then pick a card in the Horizon panel and press **Set out**, or work from the terminal:

```sh
npm run stratum -- horizon          # the three suggested next steps
npm run stratum -- start <id>       # scaffold work/<id>/ and make camp there
# build, commit as you go, write work/<id>/WRITEUP.md
npm run stratum -- clear <id>       # check the clear, stamp the date, then commit
npm run stratum -- status           # where you are
```

`npm run stratum -- --help` lists every command. `npm run stratum -- build --static` writes a static copy of the map to `build/static/`.

## Where things live

- `world/world-seed.yaml` is the world: regions, ridges and shrines. `world/positions.lock.json` fixes where each shrine sits; commit it.
- `work/<id>/` holds your work on each shrine, and `state/pins.yaml` the map pin.
- `core/` has the game logic (pure TypeScript), `cli/` the `stratum` command, and `app/` the map (Svelte).
- `DESIGN.md` is the spec, `docs/status.md` covers progress and next steps, `docs/decisions.md` records the choices made along the way, and `CLAUDE.md` is the guide for coding agents.

## Development

```sh
npm test            # vitest
npm run typecheck   # tsc and svelte-check
npm run stratum -- lint
```

## Licence

MIT (see `LICENSE`). Third-party licences are listed in `THIRD_PARTY.md`.
