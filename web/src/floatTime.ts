import type { OceanFloat } from "./types";

/**
 * Where a Float actually was at a given moment.
 *
 * Every Float used to be drawn at its most recent position, permanently, whatever Timestep was
 * being shown. So the ocean animated and the instruments sat frozen on top of it, which is both
 * wrong and confusing - and it threw away the best thing about the animation. Argo floats drift
 * with the current, so watching them move *is* a measurement of that current.
 *
 * A Float surfaces about every ten days. If its nearest report is further away in time than the
 * window this Timestep collects casts over, it had not surfaced anywhere near then, and drawing
 * it would be inventing an observation.
 *
 * That window is the pipeline's, not ours. `COVERAGE_WINDOW_DAYS` in `bake.py` decides which
 * casts an Observation Coverage Timestep counts, and this module used to carry its own,
 * different number - 12 against the bake's 5. The result was 2% of the markers on screen being
 * instruments that no coverage window had counted, which is exactly the contradiction the
 * coverage field exists to rule out. One number now, shipped in the manifest.
 */

const DAY_MS = 86_400_000;

/** Matches `COVERAGE_WINDOW_DAYS` in bake.py; replaced by the manifest's value on load. */
let reportWindowDays = 5;

/** Adopt the bake's coverage window, so a marker is drawn exactly when its cast was counted. */
export function useCoverageWindow(days: number): void {
  if (Number.isFinite(days) && days > 0) reportWindowDays = days;
}

export interface FloatFix {
  lon: number;
  lat: number;
  /** When this report was made, and how deep that cast went. */
  time: string;
  depthMax: number;
  /** How far the nearest report is from the requested moment, in days. */
  ageDays: number;
}

/** The Float's position at `whenMs`, or null if it was not reporting anywhere near then. */
export function positionAt(item: OceanFloat, whenMs: number): FloatFix | null {
  let best: FloatFix | null = null;

  for (const fix of item.track) {
    const gapDays = Math.abs(new Date(fix.time).getTime() - whenMs) / DAY_MS;
    if (!best || gapDays < best.ageDays) {
      best = {
        lon: fix.lon,
        lat: fix.lat,
        time: fix.time,
        depthMax: fix.depthMax,
        ageDays: gapDays,
      };
    }
  }

  if (!best || best.ageDays > reportWindowDays) return null;
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
  return 1 - 0.55 * Math.min(ageDays / reportWindowDays, 1);
}
