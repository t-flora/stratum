// Git access for derived state (§4.4). Injected behind an interface so tests can fake it.
import { execFileSync } from 'node:child_process';

export interface GitReader {
  /** Raw `git log --format=%H%x09%ct --name-only -- work/` output (paths relative to the world root), or null outside a repo. */
  logWork(): string | null;
  /**
   * Paths under work/ (relative to the world root) whose working-tree content isn't what HEAD has:
   * modified, staged, or untracked. Null outside a repo.
   */
  dirtyWork(): Set<string> | null;
}

export interface GitWorkInfo {
  /** Commit timestamps (unix seconds, ascending, one per commit) per shrine id. */
  touches: Map<string, number[]>;
  /** Paths that differ from HEAD; null means "not a git repo", so nothing counts as committed. */
  dirty: Set<string> | null;
}

/** Parse `--format=%H%x09%ct --name-only` output into commit timestamps per `work/<id>/` folder. */
export function parseWorkLog(raw: string): Map<string, number[]> {
  const out = new Map<string, number[]>();
  let ts: number | null = null;
  let seen = new Set<string>();
  for (const line of raw.split('\n')) {
    const header = /^[0-9a-f]{7,64}\t(\d+)$/.exec(line);
    if (header) {
      ts = Number(header[1]);
      seen = new Set();
      continue;
    }
    const m = /^work\/([^/]+)\//.exec(line);
    if (!m || ts === null || seen.has(m[1]!)) continue;
    seen.add(m[1]!);
    out.set(m[1]!, [...(out.get(m[1]!) ?? []), ts]);
  }
  for (const list of out.values()) list.sort((a, b) => a - b);
  return out;
}

export function readGitWork(git: GitReader): GitWorkInfo {
  const log = git.logWork();
  return { touches: log ? parseWorkLog(log) : new Map(), dirty: git.dirtyWork() };
}

/** The real reader: shells out to git with the world root as cwd, asking for root-relative paths. */
export function gitReader(root: string): GitReader {
  const run = (args: string[]): string | null => {
    try {
      return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 });
    } catch {
      return null;
    }
  };
  const lines = (s: string) => s.split('\n').filter(Boolean);
  return {
    logWork: () => run(['log', '--format=%H%x09%ct', '--name-only', '--relative', '--', 'work/']),
    dirtyWork: () => {
      if (run(['rev-parse', '--is-inside-work-tree'])?.trim() !== 'true') return null;
      const untracked = run(['ls-files', '--others', '--exclude-standard', '--', 'work/']) ?? '';
      // Staged and unstaged changes against HEAD. Without a HEAD (no commits yet) nothing is committed.
      const changed = run(['diff', 'HEAD', '--name-only', '--relative', '--', 'work/']);
      if (changed === null) {
        const tracked = run(['ls-files', '--', 'work/']) ?? '';
        return new Set([...lines(untracked), ...lines(tracked)]);
      }
      return new Set([...lines(untracked), ...lines(changed)]);
    },
  };
}

/** A reader for worlds outside git: no touches, nothing committed. */
export const NO_GIT: GitReader = { logWork: () => null, dirtyWork: () => null };
