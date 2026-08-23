import type { OceanFloat } from "./types";

/**
 * Where a Float actually was at a given moment.
 *
 * Every Float used to be drawn at its most recent position, permanently, whatever Timestep was
 * being shown. So the ocean animated and the instruments sat frozen on top of it, which is both
 * wrong and confusing - and it threw away the best thing about the animation. Argo floats drift
 * with the current, so watching them move *is* a measurement of that current.
 *
 * A Float surfaces about every ten days. If its nearest report is further away in time than
 * that, it had not yet been deployed or had stopped reporting, and drawing it would be
 * inventing an observation.
 */

/** Beyond this, a Float's nearest report is too far away in time to stand for "now". */
const MAX_REPORT_GAP_DAYS = 12;

const DAY_MS = 86_400_000;

export interface FloatFix {
  lon: number;
  lat: number;
  /** How far the nearest report is from the requested moment, in days. */
  ageDays: number;
}

/** The Float's position at `whenMs`, or null if it was not reporting anywhere near then. */
export function positionAt(item: OceanFloat, whenMs: number): FloatFix | null {
  let best: FloatFix | null = null;

  for (const fix of item.track) {
    const gapDays = Math.abs(new Date(fix.time).getTime() - whenMs) / DAY_MS;
    if (!best || gapDays < best.ageDays) {
      best = { lon: fix.lon, lat: fix.lat, ageDays: gapDays };
    }
  }

  if (!best || best.ageDays > MAX_REPORT_GAP_DAYS) return null;
  return best;
}

/** The part of a Float's track it had already travelled by `whenMs`. */
export function trackUpTo(item: OceanFloat, whenMs: number): { lon: number; lat: number }[] {
  return item.track.filter((fix) => new Date(fix.time).getTime() <= whenMs);
}

/**
 * Fades a marker as its report ages, so a Float shown between surfacings reads as slightly
 * stale rather than as a fresh measurement.
 */
export function freshness(ageDays: number): number {
  return 1 - 0.55 * Math.min(ageDays / MAX_REPORT_GAP_DAYS, 1);
}
