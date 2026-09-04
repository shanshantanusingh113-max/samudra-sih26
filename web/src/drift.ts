/**
 * Drift, in the browser: where the analysed current alone says a thing in the water would go.
 *
 * PS 26067 names **search-and-rescue support** among the mandates a missing 3D platform impedes.
 * This is the interactive half of the answer - drop a pin, get a trajectory - and it runs here
 * rather than on the server so it survives the demo's zero-network rule and works on the static
 * deployment, where there is no API at all.
 *
 * **The caveat is the feature, and it ships in the first sentence on the panel.** A real
 * search-and-rescue drift product needs surface wind, Stokes drift from the wave field and a
 * leeway coefficient for the specific object - a life raft, a hull and a person in the water all
 * drift differently in the same current. This carries none of them, which is why INCOIS run
 * SARAT and this is not SARAT. What this shows is the drift the ocean analysis alone implies.
 *
 * **This is the project's one deliberate second implementation, and it is the checked kind.**
 * `pipeline/samudra/drift.py` is the same integrator, is the one under test, and is what bakes
 * the validated float comparisons. The rule this project keeps - one curve in one file - exists
 * because a second copy of the Scale silently disagreed with the first. So this copy is not
 * trusted: `web/probe-drift.mjs` runs it from the same start points as the baked trajectories
 * and fails if the two disagree by more than a stated tolerance. A second implementation that is
 * measured against the first is a different thing from one that is merely assumed to match.
 *
 * Everything here reads the **Grid** - float32 (u, v) on the model's own Levels - and never a
 * Volume. Every step of an integration is a measurement.
 */

import type { VectorField, VolumeSpec } from "./types";

/** One degree of latitude in metres. The same constant the pipeline uses, in one place here. */
export const METRES_PER_DEGREE = 111320;

/** Six hours against a ten-day analysis. Matches `drift.py`'s DEFAULT_STEP_HOURS. */
export const DEFAULT_STEP_HOURS = 6;

export interface DriftStep {
  /** Epoch milliseconds. */
  timeMs: number;
  lon: number;
  lat: number;
}

export interface DriftPath {
  steps: DriftStep[];
  /** "finished", or why it stopped early. A line that simply ends looks like one that finished. */
  ended: "finished" | "left the area with current data";
}

/**
 * The current field as the integrator needs it: the Timesteps that are loaded, in order.
 *
 * A Timestep whose file has not been fetched is simply absent, and the integrator interpolates
 * between whichever ones it has. That is the honest behaviour for a lazily-loaded field: the
 * alternative is to stall the trajectory at a boundary the user cannot see.
 */
export interface LoadedCurrents {
  volume: VolumeSpec;
  /** Epoch milliseconds per entry, ascending, aligned with `fields`. */
  timesMs: number[];
  fields: VectorField[];
}

/** The nearest published Level to a depth. Nearest, never a blend - see the module note. */
export function levelIndexFor(volume: VolumeSpec, metres: number): number {
  const levels = volume.levelMetres ?? [];
  let best = 0;
  for (let i = 1; i < levels.length; i++) {
    if (Math.abs((levels[i] ?? 0) - metres) < Math.abs((levels[best] ?? 0) - metres)) best = i;
  }
  return best;
}

/**
 * Bilinear (u, v) at one position in one Timestep's field, or null over land or off the grid.
 *
 * Any masked corner refuses the whole lookup, exactly as `Grid.column_at` does in the pipeline:
 * near a coast the corners that do carry data are the open ocean, and blending them in
 * manufactures a current for a point that is on land.
 */
export function sample(
  field: VectorField,
  volume: VolumeSpec,
  level: number,
  lon: number,
  lat: number,
): [number, number] | null {
  const { west, east, south, north } = volume;
  if (lon < west || lon > east || lat < south || lat > north) return null;

  const dx = (east - west) / (field.width - 1);
  const dy = (north - south) / (field.height - 1);
  const col = Math.min(Math.max(Math.floor((lon - west) / dx), 0), field.width - 2);
  const row = Math.min(Math.max(Math.floor((lat - south) / dy), 0), field.height - 2);
  const fx = (lon - (west + col * dx)) / dx;
  const fy = (lat - (south + row * dy)) / dy;

  const plane = level * field.height * field.width * 2;
  let east_ = 0;
  let north_ = 0;
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < 2; i++) {
      const at = plane + ((row + j) * field.width + (col + i)) * 2;
      const u = field.values[at];
      const v = field.values[at + 1];
      if (u === undefined || v === undefined || !Number.isFinite(u) || !Number.isFinite(v)) {
        return null;
      }
      const weight = (i ? fx : 1 - fx) * (j ? fy : 1 - fy);
      east_ += u * weight;
      north_ += v * weight;
    }
  }
  return [east_, north_];
}

/**
 * Velocity in m/s at a position and an instant, linear in time between the two analyses either
 * side of it. Before the first and after the last the end is held rather than extrapolated: a
 * current extrapolated past the data is a forecast, and this platform does not make forecasts.
 */
export function velocityAt(
  currents: LoadedCurrents,
  timeMs: number,
  metres: number,
  lon: number,
  lat: number,
): [number, number] | null {
  const { timesMs, fields, volume } = currents;
  if (fields.length === 0) return null;
  const level = levelIndexFor(volume, metres);

  let before = 0;
  let after = 0;
  let weight = 0;
  if (timeMs > (timesMs[0] ?? 0) && timeMs < (timesMs[timesMs.length - 1] ?? 0)) {
    for (let i = 0; i < timesMs.length - 1; i++) {
      const a = timesMs[i] ?? 0;
      const b = timesMs[i + 1] ?? 0;
      if (timeMs >= a && timeMs <= b) {
        before = i;
        after = i + 1;
        weight = b > a ? (timeMs - a) / (b - a) : 0;
        break;
      }
    }
  } else if (timeMs >= (timesMs[timesMs.length - 1] ?? 0)) {
    before = after = timesMs.length - 1;
  }

  const first = sample(fields[before]!, volume, level, lon, lat);
  if (!first) return null;
  if (after === before || weight === 0) return first;
  const second = sample(fields[after]!, volume, level, lon, lat);
  if (!second) return null;
  return [
    first[0] + weight * (second[0] - first[0]),
    first[1] + weight * (second[1] - first[1]),
  ];
}

/** One step, in degrees. The cosine on the longitude axis is the constant that matters. */
function advance(
  lon: number,
  lat: number,
  velocity: [number, number],
  seconds: number,
): [number, number] {
  const nextLat = lat + (velocity[1] * seconds) / METRES_PER_DEGREE;
  const scale = Math.max(Math.cos((lat * Math.PI) / 180), 1e-6);
  const nextLon = lon + (velocity[0] * seconds) / (METRES_PER_DEGREE * scale);
  return [nextLon, nextLat];
}

/** Where the water is, and when. Time is ignored by anything reading one frozen analysis. */
export type VelocityLookup = (lon: number, lat: number, timeMs: number) => [number, number] | null;

/**
 * One midpoint step, and the only place the step rule is written.
 *
 * Two things integrate the current field and they must not disagree: `integrateDrift` below,
 * which follows a dropped pin forward through time and is held against `pipeline/samudra/
 * drift.py` by `web/probe-drift.mjs`; and `particles.ts`, which moves a few thousand dots
 * through one frozen analysis to draw the flow. The second is a picture and the first is a
 * measurement, so the temptation is to let the picture use a cheaper rule - which is exactly how
 * this project got two copies of the Scale that quietly disagreed. They share the step instead,
 * and `web/probe-particles.mjs` runs a particle from a pin's start point and fails if it does
 * not land where `integrateDrift` puts it.
 *
 * Null whenever any of the three lookups misses - off the grid, or over land. A step that
 * silently skipped a missing sample would walk a dot across Gujarat.
 */
export function midpointStep(
  velocity: VelocityLookup,
  lon: number,
  lat: number,
  timeMs: number,
  seconds: number,
): { lon: number; lat: number } | null {
  const here = velocity(lon, lat, timeMs);
  if (!here) return null;
  const [midLon, midLat] = advance(lon, lat, here, seconds / 2);
  const middle = velocity(midLon, midLat, timeMs + (seconds / 2) * 1000);
  if (!middle) return null;
  const [nextLon, nextLat] = advance(lon, lat, middle, seconds);
  if (!velocity(nextLon, nextLat, timeMs + seconds * 1000)) return null;
  return { lon: nextLon, lat: nextLat };
}

/**
 * Follow the analysed current forward from one point.
 *
 * Midpoint rule, and the new position is checked before it is appended - a trajectory is a line
 * somebody reads a position off, and a line whose last vertex sits outside the data is claiming
 * a drift the analysis never carried.
 */
export function integrateDrift(
  currents: LoadedCurrents,
  lon: number,
  lat: number,
  startMs: number,
  metres: number,
  hours: number,
  stepHours = DEFAULT_STEP_HOURS,
): DriftPath {
  const steps: DriftStep[] = [{ timeMs: startMs, lon, lat }];
  const dt = stepHours * 3600;
  const count = Math.max(Math.round(hours / stepHours), 0);
  const outside = "left the area with current data" as const;

  const velocity: VelocityLookup = (atLon, atLat, atMs) =>
    velocityAt(currents, atMs, metres, atLon, atLat);

  // Checked before the loop as well as inside it, so a pin dropped on land reports that it left
  // the area even when nothing was asked of it. Zero hours is still an answer.
  if (!velocity(lon, lat, startMs)) return { steps, ended: outside };

  let hereLon = lon;
  let hereLat = lat;
  let now = startMs;

  for (let i = 0; i < count; i++) {
    const next = midpointStep(velocity, hereLon, hereLat, now, dt);
    if (!next) return { steps, ended: outside };
    hereLon = next.lon;
    hereLat = next.lat;
    now += dt * 1000;
    steps.push({ timeMs: now, lon: hereLon, lat: hereLat });
  }
  return { steps, ended: "finished" };
}

/** Great-circle distance between two positions, in kilometres. */
export function separationKm(a: DriftStep, b: DriftStep): number {
  const radiusKm = (METRES_PER_DEGREE * 180) / Math.PI / 1000;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLat = lat2 - lat1;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radiusKm * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Where the trajectory ended up, and which way it went, for the panel to read out. */
export function describePath(path: DriftPath): {
  km: number;
  bearing: number;
  days: number;
  end: DriftStep;
} | null {
  const first = path.steps[0];
  const last = path.steps[path.steps.length - 1];
  if (!first || !last || path.steps.length < 2) return null;
  const dLon =
    (last.lon - first.lon) * Math.cos(((first.lat + last.lat) / 2) * (Math.PI / 180));
  const dLat = last.lat - first.lat;
  // Clockwise from north, which is how a bearing is read and not how atan2 returns one.
  const bearing = (((Math.atan2(dLon, dLat) * 180) / Math.PI) + 360) % 360;
  return {
    km: separationKm(first, last),
    bearing,
    days: (last.timeMs - first.timeMs) / 86400000,
    end: last,
  };
}
