// Clear validation (§5) and write-up helpers. Pure functions: the IO lives in work.ts.
import type { Shrine } from './types.ts';
import { unmetNeeds } from './visibility.ts';
import { parseWriteup, type ParsedWriteup } from './writeup.ts';

/** The three sections §5.1 requires, in template order. Matched case-insensitively, ignoring spacing. */
export const REQUIRED_SECTIONS = ['What I built', 'How it works', 'What I measured / what surprised me'] as const;

/** Towers need this many `proposed.yaml` entries with `from: <tower-id>` (§5.3). */
export const TOWER_MIN_PROPOSALS = 3;

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').replace(/\s*\/\s*/g, ' / ').trim();

/** Strip HTML comments (template hints) so they count neither as content nor as words, nor show in the panel. */
export function stripComments(s: string): string {
  return s.replace(/<!--[\s\S]*?-->/g, '');
}

/** Split a Markdown body into `## ` sections: heading text → content (up to the next `#`/`##` heading). */
export function writeupSections(body: string): Map<string, string> {
  const out = new Map<string, string>();
  let current: string | null = null;
  let buf: string[] = [];
  let fence: string | null = null;
  const flush = () => {
    if (current !== null && !out.has(current)) out.set(current, buf.join('\n'));
  };
  for (const line of body.split(/\r?\n/)) {
    const f = /^\s*(```+|~~~+)/.exec(line);
    if (f) {
      if (!fence) fence = f[1]![0]!;
      else if (f[1]![0] === fence) fence = null;
    }
    const h = fence ? null : /^(#{1,2})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) {
      flush();
      current = h[1] === '##' ? norm(h[2]!) : null;
      buf = [];
    } else if (current !== null) buf.push(line);
  }
  flush();
  return out;
}

/** Prose words: whitespace-separated tokens, excluding HTML comments and fenced code blocks. */
export function countWords(text: string): number {
  const prose = stripComments(text).replace(/^\s*(```+|~~~+)[^\n]*\n[\s\S]*?^\s*\1[^\n]*$/gm, '');
  return prose.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

export interface WorkFile {
  /** Path relative to `work/<id>/`, with forward slashes. */
  path: string;
  /** True if the file is byte-identical to the template file at the same path (a scaffold, not an artefact). */
  templateCopy: boolean;
}

export interface ClearInput {
  shrine: Shrine;
  /** Contents of `work/<id>/WRITEUP.md`, or null if it doesn't exist. */
  writeup: string | null;
  files: WorkFile[];
  minWords: number;
  /** Whether another shrine is cleared (for `needs`, §5.4). */
  isCleared: (id: string) => boolean;
  /** Number of `proposed.yaml` entries with `from: <shrine id>` (for towers). */
  proposals: number;
}

export interface ClearCheck {
  ok: boolean;
  label: string;
  /** What's missing, when not ok. */
  detail?: string;
}

export interface ClearResult {
  ok: boolean;
  checks: ClearCheck[];
  parsed: ParsedWriteup | null;
  words: number;
}

/** A file counts as an artefact if it isn't Markdown, isn't hidden, and isn't an untouched template copy (§5.1 rule 4). */
export function isArtefact(f: WorkFile): boolean {
  if (f.templateCopy) return false;
  if (f.path.split('/').some((part) => part.startsWith('.'))) return false;
  return !/\.(md|markdown)$/i.test(f.path);
}

/** §5.1 (shrines and temples) and §5.3 (towers). Every check is reported, so a failure prints a full checklist. */
export function validateClear(input: ClearInput): ClearResult {
  const { shrine } = input;
  const checks: ClearCheck[] = [];
  const parsed = input.writeup === null ? null : parseWriteup(input.writeup, shrine.id);

  if (!parsed) checks.push({ ok: false, label: 'WRITEUP.md exists with valid frontmatter', detail: `work/${shrine.id}/WRITEUP.md not found` });
  else if (!parsed.frontmatter || parsed.problems.length) {
    checks.push({ ok: false, label: 'WRITEUP.md exists with valid frontmatter', detail: parsed.problems.join('; ') });
  } else checks.push({ ok: true, label: 'WRITEUP.md exists with valid frontmatter' });

  const sections = parsed ? writeupSections(parsed.body) : new Map<string, string>();
  let words = 0;
  for (const name of REQUIRED_SECTIONS) {
    const content = sections.get(norm(name));
    const label = `"${name}" is filled in`;
    if (content === undefined) checks.push({ ok: false, label, detail: 'section heading not found' });
    else if (!stripComments(content).trim()) checks.push({ ok: false, label, detail: 'section is empty' });
    else checks.push({ ok: true, label });
    if (content) words += countWords(content);
  }
  const wordsLabel = `at least ${input.minWords} words across those sections`;
  checks.push(words >= input.minWords ? { ok: true, label: wordsLabel } : { ok: false, label: wordsLabel, detail: `${words} so far` });

  if (shrine.kind === 'tower') {
    const label = `at least ${TOWER_MIN_PROPOSALS} proposals in world/proposed.yaml with \`from: ${shrine.id}\``;
    checks.push(input.proposals >= TOWER_MIN_PROPOSALS ? { ok: true, label } : { ok: false, label, detail: `${input.proposals} so far` });
  } else {
    const label = 'an artefact: a non-Markdown file in the work folder, or a `code:` field';
    const ok = input.files.some(isArtefact) || !!parsed?.frontmatter?.code;
    checks.push(ok ? { ok, label } : { ok, label, detail: 'only Markdown or untouched template files so far' });
  }

  if (shrine.needs.length) {
    const missing = unmetNeeds(shrine, input.isCleared);
    const label = 'every shrine in `needs` is cleared';
    checks.push(missing.length ? { ok: false, label, detail: `not yet: ${missing.join(', ')}` } : { ok: true, label });
  }

  return { ok: checks.every((c) => c.ok), checks, parsed, words };
}

/**
 * Set frontmatter fields in place, preserving everything else (comments, ordering, the body).
 * An existing `key:` line keeps its trailing `# comment`; a missing key is appended before the closing `---`.
 */
export function setFrontmatter(text: string, fields: Record<string, string>): string {
  const m = /^(---\r?\n)([\s\S]*?)(\r?\n---[ \t]*(?:\r?\n|$))/.exec(text);
  if (!m) {
    const block = Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join('\n');
    return `---\n${block}\n---\n\n${text}`;
  }
  const lines = m[2]!.split(/\r?\n/);
  for (const [key, value] of Object.entries(fields)) {
    const re = new RegExp(`^${key}:([^#\\n]*)(#.*)?$`);
    const i = lines.findIndex((l) => re.test(l));
    if (i < 0) {
      lines.push(`${key}: ${value}`);
      continue;
    }
    const [, oldValue, comment] = re.exec(lines[i]!)!;
    if (comment) {
      // Keep the comment column where the template put it.
      const width = Math.max(value.length + 1, oldValue!.length - 1);
      lines[i] = `${key}: ${value.padEnd(width)}${comment}`;
    } else lines[i] = `${key}: ${value}`;
  }
  return m[1] + lines.join('\n') + m[3] + text.slice(m[0].length);
}

export const TEMPLATES = ['cpp', 'python'] as const;
export type TemplateName = (typeof TEMPLATES)[number];

/** Regions whose work is naturally Python (interpretability tooling); see docs/decisions.md. */
const PYTHON_REGIONS = new Set(['interp-engineering', 'interp-theory']);

/** Default scaffold for `stratum start` (§11: "cpp or python, based on region"). */
export function defaultTemplate(shrine: Shrine): TemplateName {
  return PYTHON_REGIONS.has(shrine.region) || shrine.requires.includes('llm-api') ? 'python' : 'cpp';
}

/** Fill `{{key}}` placeholders in a template file. Unknown keys are left as they are. */
export function fillTemplate(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (all, k: string) => values[k] ?? all);
}

/** Today's date as YYYY-MM-DD in local time (clears are stamped with the user's calendar day). */
export function localDate(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
