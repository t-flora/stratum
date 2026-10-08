// Where the Stratum engine lives, and how a person runs its CLI from a terminal (map.json's `terminal`).
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The repo holding the engine: `npm run stratum` works from here. */
export const ENGINE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Passed to `build()` so map.json (and printed hints) show the exact command to paste, and where to run it. */
export const TERMINAL = { cwd: ENGINE_DIR, cli: 'npm run stratum --' };
