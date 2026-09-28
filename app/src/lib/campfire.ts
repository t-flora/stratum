/** Campfires fade over 14 days since they were last fed (§9.3, §10.1). Visual only; never a warning. */
export const CAMPFIRE_FADE_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Flame opacity: 1 when freshly fed, easing down to a faint ember (never gone: the work is still in progress). */
export function campfireBrightness(since: number | null, now: number): number {
  if (since === null) return 1;
  const days = Math.max(0, (now - since) / DAY_MS);
  return Math.max(0.25, 1 - (0.75 * days) / CAMPFIRE_FADE_DAYS);
}
