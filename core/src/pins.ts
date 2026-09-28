// Map pins (§7): one destination at a time, in state/pins.yaml.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parse } from 'yaml';
import type { Visibility } from './mapdata.ts';
import type { Diagnostic, World } from './types.ts';

export const PINS_PATH = 'state/pins.yaml';

/** The pinned shrine id, or null. A malformed file reads as no pin (and `lintPin` reports it). */
export function readPin(root: string): string | null {
  const file = join(root, PINS_PATH);
  if (!existsSync(file)) return null;
  try {
    const pin = (parse(readFileSync(file, 'utf8')) as { pin?: unknown } | null)?.pin;
    return typeof pin === 'string' && pin ? pin : null;
  } catch {
    return null;
  }
}

export function writePin(root: string, id: string | null): void {
  const file = join(root, PINS_PATH);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `# Map pin (DESIGN.md §7): one destination at a time. Written by \`stratum pin\` and the dev server.\npin: ${id ?? 'null'}\n`);
}

export type PinResult = { ok: true; pin: string | null } | { ok: false; reason: string };

/** Validate and set (or clear, with null) the pin. Hidden and cleared shrines can't be pinned. */
export function setPin(root: string, world: World, visibility: Map<string, Visibility>, cleared: (id: string) => boolean, id: string | null): PinResult {
  if (id !== null) {
    if (!world.shrineById.has(id)) return { ok: false, reason: `unknown shrine "${id}"` };
    if (visibility.get(id) === 'hidden') return { ok: false, reason: `${id} is hidden: you can only pin something you've seen` };
    if (cleared(id)) return { ok: false, reason: `${id} is already cleared` };
  }
  writePin(root, id);
  return { ok: true, pin: id };
}

/** A pin that points at nothing is a warning; the Horizon ignores it. */
export function lintPin(root: string, world: World): Diagnostic[] {
  const pin = readPin(root);
  if (pin && !world.shrineById.has(pin)) {
    return [{ severity: 'warning', code: 'unknown-pin', message: `pin "${pin}" does not match any shrine; it is ignored`, file: PINS_PATH }];
  }
  return [];
}
