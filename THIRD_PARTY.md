# Third-party notices

Stratum's own code is MIT-licensed (see `LICENSE`). It depends on the packages below, all under permissive licences. None of them is committed to this repo: `npm install` fetches them, and each keeps its licence file in `node_modules/<package>/`.

## Bundled into the static build

`stratum build --static` bundles these into `build/static/`, so a published copy of that folder redistributes them.

| Package | Licence |
|---|---|
| svelte | MIT |
| markdown-it, linkify-it, mdurl, uc.micro, punycode.js | MIT |
| entities | BSD-2-Clause |
| highlight.js | BSD-3-Clause |
| d3-selection, d3-zoom, d3-dispatch, d3-drag, d3-interpolate, d3-color, d3-timer, d3-transition | ISC |
| d3-ease | BSD-3-Clause |

## Used at build time and by the CLI (not redistributed)

- **MIT:** commander, gray-matter (with js-yaml, kind-of, section-matter, strip-bom-string), simplex-noise, vite, rolldown, esbuild, tsx, postcss.
- **ISC:** yaml, d3-contour, d3-array, internmap.
- **Others:** lightningcss (MPL-2.0), source-map-js (BSD-3-Clause), esprima (BSD-2-Clause), argparse (MIT and Python-2.0).
- **Development only:** TypeScript (Apache-2.0), vitest and svelte-check (MIT).

`package-lock.json` has the full list with each package's licence.

## Fonts

The app loads Cormorant Garamond, Inter and JetBrains Mono from Google Fonts at runtime. All three are under the SIL Open Font License 1.1. No font files are included in this repo.

## Artwork

The favicon and every map glyph are original SVG drawn for Stratum.
