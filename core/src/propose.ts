// `stratum propose --from <id>` (§4.3, §5.3, §11): turn a loose thread into a proposal stub in world/proposed.yaml. Pure.
import { stringify } from 'yaml';
import type { World } from './types.ts';

/**
 * The list items under a write-up's `## Loose threads` heading (HTML comments and code fences skipped), in order.
 * Plain paragraphs count as one thread each, so a write-up without bullets still offers something.
 */
export function looseThreads(body: string): string[] {
  const lines = body.replace(/<!--[\s\S]*?-->/g, '').split('\n');
  const start = lines.findIndex((l) => /^##\s+loose threads\s*$/i.test(l.trim()));
  if (start < 0) return [];
  const out: string[] = [];
  let fence = false;
  for (const raw of lines.slice(start + 1)) {
    const line = raw.trim();
    if (line.startsWith('```')) fence = !fence;
    if (fence || line.startsWith('```')) continue;
    if (/^#{1,2}\s/.test(line)) break;
    const item = line.match(/^(?:[-*+]|\d+[.)])\s+(.*)$/);
    if (item) out.push(item[1]!.trim());
    else if (line && out.length && /^\s{2,}/.test(raw)) out[out.length - 1] += ` ${line}`; // a wrapped bullet
    else if (line) out.push(line);
  }
  return out.filter(Boolean);
}

/** A kebab-case id from a title, unique in the world (`-2`, `-3`, … if taken). */
export function proposalId(world: World, title: string): string {
  const base = title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/, '') || 'proposal';
  let id = base;
  for (let n = 2; world.shrineById.has(id); n++) id = `${base}-${n}`;
  return id;
}

export interface ProposalStub {
  id: string;
  /** The YAML list item to append under `shrines:`. */
  yaml: string;
}

/**
 * A stub in the proposing shrine's region, with `from` set. A thread becomes the prompt, and its first clause the title.
 * Depths proposals sit under the same surface shrine as their proposer (`below` is required there).
 * `done` is left for Tiago to write: it's the clear condition, and a guess would be worse than a TODO.
 */
export function proposalStub(world: World, fromId: string, thread: string | undefined): ProposalStub {
  const from = world.shrineById.get(fromId);
  if (!from) throw new Error(`unknown shrine "${fromId}"`);
  const text = thread?.trim() || 'TODO: what to build';
  const title = thread ? firstClause(text) : `Follow-up to ${from.title}`;
  const id = proposalId(world, title);
  const entry: Record<string, unknown> = { id, title, region: from.region };
  if (from.layer === 'depths' && from.below) entry.below = from.below;
  if (from.theme && from.kind === 'shrine') entry.theme = from.theme;
  entry.size = 'M';
  if (from.layer !== 'depths' && from.kind === 'shrine') entry.after = [from.id];
  entry.prompt = text;
  entry.done = 'TODO: the clear condition, beyond the standard write-up';
  entry.from = from.id;
  const yaml = stringify([entry], { lineWidth: 0 }).trimEnd();
  return { id, yaml };
}

function firstClause(text: string): string {
  const clause = text.split(/(?<=[.!?])\s|[;:—]\s|\s[–-]\s/)[0]!.replace(/[.!?]+$/, '').trim();
  const t = clause.length > 70 ? `${clause.slice(0, 67).replace(/\s+\S*$/, '')}…` : clause;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Append a stub to proposed.yaml's text, keeping its comments. `shrines: []` (the empty seed state) becomes a block list.
 */
export function appendProposal(src: string, stubYaml: string): string {
  // Match the indentation of the items already there (the seed style is two spaces).
  const after = src.slice(src.search(/^shrines:/m) + 1);
  const indent = /^shrines:\s*$/m.test(src) ? (after.match(/^( *)- /m)?.[1] ?? '  ') : '  ';
  const block = stubYaml.split('\n').map((l) => `${indent}${l}`).join('\n');
  if (/^shrines:\s*\[\s*\]\s*$/m.test(src)) return `${src.replace(/^shrines:\s*\[\s*\]\s*$/m, `shrines:\n${block}`).trimEnd()}\n`;
  if (!/^shrines:/m.test(src)) return `${src.trimEnd()}\nshrines:\n${block}\n`;
  return `${src.trimEnd()}\n\n${block}\n`;
}
