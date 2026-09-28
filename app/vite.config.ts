import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig, type Plugin } from 'vite';

const appDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.STRATUM_ROOT ?? resolve(appDir, '..');

/** Serve build/map.json at /map.json. The app is a pure renderer of that file (§4.4). */
function mapJson(): Plugin {
  return {
    name: 'stratum-map-json',
    configureServer(server) {
      server.middlewares.use('/map.json', (_req, res) => {
        const file = join(repoRoot, 'build', 'map.json');
        if (!existsSync(file)) {
          res.statusCode = 404;
          res.end('build/map.json not found: run `stratum build`');
          return;
        }
        res.setHeader('content-type', 'application/json');
        res.setHeader('cache-control', 'no-store');
        res.end(readFileSync(file));
      });
    },
  };
}

export default defineConfig({
  root: appDir,
  plugins: [svelte(), mapJson()],
  server: { host: '127.0.0.1', port: 5173 },
});
