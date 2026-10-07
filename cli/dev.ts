// `stratum dev` (§11): Vite plus a localhost-only API, a file watcher that rebuilds, and SSE live updates.
import { mkdirSync, watch, type FSWatcher } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join, sep } from 'node:path';
import { build, loadWorld, setPin, shelveShrine, startShrine, type BuildCache, type MapData } from '@stratum/core';
import type { Plugin } from 'vite';

/** Paths under these are noise (virtualenvs, build output, caches) or written by the build itself. */
const IGNORE = [/(^|[\\/])(\.venv|node_modules|__pycache__|build|\.pytest_cache|\.git)([\\/]|$)/, /positions\.lock\.json$/, /~$|\.swp$/];

async function readJson(req: IncomingMessage): Promise<unknown> {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 64 * 1024) throw new Error('body too large');
  }
  return body ? JSON.parse(body) : {};
}

function send(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(data));
}

/**
 * Only same-origin JSON writes: a page on another site can't send `application/json` without a CORS preflight
 * (which we never answer), and a mismatched Origin is refused outright.
 */
function writeAllowed(req: IncomingMessage): boolean {
  if (!(req.headers['content-type'] ?? '').startsWith('application/json')) return false;
  const origin = req.headers.origin;
  return !origin || origin === `http://${req.headers.host}`;
}

export function stratumApi(root: string, log: (msg: string) => void): Plugin {
  const cache: BuildCache = {};
  const clients = new Set<ServerResponse>();
  let map: MapData | null = null;
  let lastError: string | null = null;

  const rebuild = () => {
    const t0 = performance.now();
    const res = build(root, { cache });
    const errors = res.diagnostics.filter((d) => d.severity === 'error');
    if (res.map && !errors.length) {
      map = res.map;
      lastError = null;
      log(`rebuilt in ${Math.round(performance.now() - t0)} ms`);
    } else {
      lastError = errors.map((d) => `${d.file}${d.line ? `:${d.line}` : ''} ${d.message}`).join('\n') || 'build failed';
      log(`build failed:\n${lastError}`);
    }
    const payload = `event: map\ndata: ${JSON.stringify({ builtAt: map?.builtAt ?? null, error: lastError })}\n\n`;
    for (const c of clients) c.write(payload);
    return res;
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(rebuild, 150);
  };
  const watchers: FSWatcher[] = [];

  return {
    name: 'stratum-api',
    configureServer(server) {
      rebuild();
      for (const dir of ['world', 'work', 'state']) {
        // A fresh world has no work/ yet: create it (an empty folder isn't tracked) so the first set out and clear
        // show up live instead of waiting for a restart.
        if (dir !== 'world') mkdirSync(join(root, dir), { recursive: true });
        try {
          const w = watch(join(root, dir), { recursive: true }, (_event, file) => {
            const rel = `${dir}${sep}${file ?? ''}`;
            if (!IGNORE.some((re) => re.test(rel))) schedule();
          });
          watchers.push(w);
        } catch {
          // Watching can still fail (e.g. no recursive watch on this filesystem); the next world change rebuilds.
        }
      }
      server.httpServer?.on('close', () => {
        for (const w of watchers) w.close();
        for (const c of clients) c.end();
      });

      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        try {
          if (req.method === 'GET' && url.pathname === '/map.json') {
            if (!map) return send(res, 500, { error: lastError ?? 'no map yet' });
            return send(res, 200, map);
          }
          if (!url.pathname.startsWith('/api/')) return next();

          if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { ok: true });
          if (req.method === 'GET' && url.pathname === '/api/map') {
            return map ? send(res, 200, map) : send(res, 500, { error: lastError ?? 'no map yet' });
          }
          if (req.method === 'GET' && url.pathname === '/api/events') {
            res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
            res.write(`event: hello\ndata: ${JSON.stringify({ builtAt: map?.builtAt ?? null })}\n\n`);
            clients.add(res);
            req.on('close', () => clients.delete(res));
            return;
          }
          if (req.method === 'POST' && (['/api/start', '/api/pin', '/api/shelve'].includes(url.pathname))) {
            if (!writeAllowed(req)) return send(res, 403, { error: 'same-origin JSON requests only' });
            const body = (await readJson(req)) as { id?: unknown };
            const { world } = loadWorld(root);
            if (!world || !map) return send(res, 500, { error: lastError ?? 'the world has errors' });
            const visibility = new Map(map.shrines.map((s) => [s.id, s.visibility]));
            const status = new Map(map.shrines.map((s) => [s.id, s.status]));

            if (url.pathname === '/api/pin') {
              const id = body.id === null ? null : typeof body.id === 'string' ? body.id : undefined;
              if (id === undefined) return send(res, 400, { error: 'expected {"id": "<shrine>" | null}' });
              const out = setPin(root, world, visibility, (x) => status.get(x) === 'cleared', id);
              if (!out.ok) return send(res, 409, { error: out.reason });
              rebuild();
              return send(res, 200, out);
            }

            if (typeof body.id !== 'string') return send(res, 400, { error: 'expected {"id": "<shrine>"}' });
            const built = rebuild(); // fresh work state, so a just-cleared temple need counts
            if (!built.work) return send(res, 500, { error: lastError ?? 'build failed' });

            if (url.pathname === '/api/shelve') {
              const out = shelveShrine(root, world, built.work, body.id);
              if (out.outcome === 'refused') return send(res, 409, { error: out.reason });
              rebuild();
              return send(res, 200, out);
            }

            // Never forced from the UI: hidden shrines and locked temples need the CLI's --force.
            const out = startShrine(root, world, built.work, body.id, { visibility });
            if (out.outcome === 'refused') return send(res, 409, { error: out.reason });
            rebuild();
            return send(res, 200, out);
          }
          return send(res, 404, { error: 'not found' });
        } catch (e) {
          return send(res, 500, { error: (e as Error).message });
        }
      });
    },
  };
}
