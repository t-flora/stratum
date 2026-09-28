import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import type { Diagnostic, World } from './types.ts';

export const WRITEUP_STATUSES = ['in-progress', 'cleared'] as const;
export type WriteupStatus = (typeof WRITEUP_STATUSES)[number];

export interface WriteupFrontmatter {
  shrine: string;
  status: WriteupStatus;
  started?: string;
  cleared?: string;
  hours?: number;
  code?: string;
  remnote: string[];
}

export interface ParsedWriteup {
  frontmatter: WriteupFrontmatter | null;
  body: string;
  problems: string[];
}

/** YAML dates come back from gray-matter as Date objects; normalise to YYYY-MM-DD. */
function toDate(v: unknown): string | undefined | null {
  if (v === undefined || v === null || v === '') return undefined;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  return null;
}

export function parseWriteup(text: string, expectedId?: string): ParsedWriteup {
  const problems: string[] = [];
  let parsed: matter.GrayMatterFile<string>;
  try {
    // Pass an options object so gray-matter doesn't serve a cached result for identical input.
    parsed = matter(text, {});
  } catch (e) {
    return { frontmatter: null, body: text, problems: [`frontmatter is not valid YAML: ${(e as Error).message.split('\n')[0]}`] };
  }
  const d = parsed.data as Record<string, unknown>;
  if (!Object.keys(d).length) return { frontmatter: null, body: parsed.content, problems: ['missing frontmatter'] };

  if (typeof d.shrine !== 'string' || !d.shrine) problems.push('frontmatter `shrine` is missing');
  else if (expectedId && d.shrine !== expectedId) problems.push(`frontmatter shrine "${d.shrine}" does not match folder "${expectedId}"`);
  if (!WRITEUP_STATUSES.includes(d.status as WriteupStatus)) problems.push(`frontmatter \`status\` must be ${WRITEUP_STATUSES.join(' | ')}`);
  const started = toDate(d.started);
  const cleared = toDate(d.cleared);
  if (started === null) problems.push('frontmatter `started` must be a YYYY-MM-DD date');
  if (cleared === null) problems.push('frontmatter `cleared` must be a YYYY-MM-DD date');
  if (d.status === 'cleared' && !cleared) problems.push('status is cleared but `cleared` has no date');
  if (d.hours != null && (typeof d.hours !== 'number' || d.hours < 0)) problems.push('frontmatter `hours` must be a non-negative number');
  if (d.code != null && typeof d.code !== 'string') problems.push('frontmatter `code` must be a string');
  const remnote = d.remnote ?? [];
  if (!Array.isArray(remnote)) problems.push('frontmatter `remnote` must be a list');

  const fm: WriteupFrontmatter = {
    shrine: typeof d.shrine === 'string' ? d.shrine : (expectedId ?? ''),
    status: d.status === 'cleared' ? 'cleared' : 'in-progress',
    remnote: Array.isArray(remnote) ? remnote.map(String) : [],
  };
  if (started) fm.started = started;
  if (cleared) fm.cleared = cleared;
  if (typeof d.hours === 'number') fm.hours = d.hours;
  if (typeof d.code === 'string' && d.code.trim()) fm.code = d.code.trim();
  return { frontmatter: fm, body: parsed.content, problems };
}

/** Lint every work/<id>/ folder: the id must be a shrine, and a WRITEUP.md (if present) must parse. */
export function lintWorkFolders(root: string, world: World): Diagnostic[] {
  const out: Diagnostic[] = [];
  const workDir = join(root, 'work');
  if (!existsSync(workDir)) return out;
  for (const id of readdirSync(workDir).sort()) {
    const dir = join(workDir, id);
    if (id.startsWith('.') || !statSync(dir).isDirectory()) continue;
    const rel = `work/${id}`;
    if (!world.shrineById.has(id)) {
      out.push({ severity: 'error', code: 'unknown-work', message: `work folder "${id}" does not match any shrine id`, file: rel });
      continue;
    }
    const wfile = join(dir, 'WRITEUP.md');
    if (!existsSync(wfile)) {
      out.push({ severity: 'warning', code: 'no-writeup', message: 'work folder has no WRITEUP.md', file: rel });
      continue;
    }
    for (const p of parseWriteup(readFileSync(wfile, 'utf8'), id).problems) {
      out.push({ severity: 'error', code: 'writeup', message: p, file: `${rel}/WRITEUP.md`, line: 1 });
    }
  }
  return out;
}
