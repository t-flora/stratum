# Decisions

Choices made where DESIGN.md is silent (§0: "choose the simplest thing that preserves the constraints").

## M0

- **Seed location.** `world-seed.yaml` was at the repo root; moved to `world/world-seed.yaml` per §4.1. Content unchanged.
- **`proposed.yaml` shape.** A top-level `shrines:` list, same shrine schema as the seed plus a required `from`. An empty or null `shrines:` is valid.
- **Severity.** Unknown fields, `from` in the seed file, a temple without `needs`, self-links and duplicate ridge overrides are *warnings*. All §4.2 rules and type errors are *errors*; `stratum lint` exits 1 on any error.
- **Extra checks beyond §4.2.** Ids must be kebab-case; `p` is an integer 1..5; `size`, `kind`, `requires` tags are enumerated; `needs` only on temples; temples only on the surface; `below` must point at a *surface* shrine; plateau ids must resolve to surface shrines; depths veins may not have towers; surface/sky regions need a centroid and sky islands a radius.
- **Ridge adjacency warning deferred to M1.** "Override between non-adjacent regions" needs the region classifier (§8.1), which is M1 work. M0 validates that both regions exist and are on the surface.
- **Diagnostic format.** `file:line:col  severity  [code] message`, sorted by location. Lines point at the offending value (e.g. the specific `links` item), not just the shrine.
- **Workspaces.** `core/` and `cli/` exist now; `app/` is added in M1. Packages are consumed as TypeScript source via tsx/vitest, no build step.
- **Running the CLI.** `npm run stratum -- <cmd>` or `alias stratum='npx tsx cli/index.ts'`. `--root <dir>` points at another world (used by fixtures).
- **§2.1 counts.** Lint reports 119 surface / 38 sky / 60 depths entries. §2.1's 103 / 33 excludes towers and temples (119 − 10 − 6, 38 − 5), so there is no mismatch.
