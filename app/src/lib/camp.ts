/** The camp's fire fades over 14 days since it was last touched (§9.3, docs/plans/camps.md). Visual only; never a warning. */
export const CAMP_FADE_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Days since the camp was last touched (0 if unknown). */
export function campAge(since: number | null, now: number): number {
  return since === null ? 0 : Math.max(0, (now - since) / DAY_MS);
}

/** Flame opacity: 1 when freshly touched, easing toward 0.45 as it burns down. */
export function campBrightness(since: number | null, now: number): number {
  return Math.max(0.45, 1 - (0.55 * campAge(since, now)) / CAMP_FADE_DAYS);
}

/** Past the fade window the fire is embers: still your camp, just burnt low. */
export function isEmbers(since: number | null, now: number): boolean {
  return campAge(since, now) > CAMP_FADE_DAYS;
}
