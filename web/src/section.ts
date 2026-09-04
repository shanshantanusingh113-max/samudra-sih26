/**
 * The vertical section: depth against distance along a line you draw on the water.
 *
 * The hydrographic section is *the* figure of physical oceanography - it is what a crossing of
 * the Bay of Bengal looks like in every textbook and every INCOIS report. What no web tool
 * offers is cutting one **live, from a line you drew, against a 3D block you can also fly
 * through**, and that is what this is.
 *
 * **It reads the Grid and never a Volume.** A section is a chart with metres down one axis and
 * a value read off the colour. A Volume is quantised to a byte, depth-warped and back-filled
 * across land for the GPU's benefit, so a section cut from one would put the thermocline at the
 * wrong depth on a figure that looks exactly right. The three collocated Fields therefore ship
 * as float32 on the model's own 24 Levels - `web/public/data/grids/` - which is why the section
 * works with the network unplugged and on the static deployment, where there is no API at all.
 *
 * `pipeline/samudra/section.py` is the same cut, is the one under test, and is served at
 * `/api/section`. `web/probe-section.mjs` runs this module against that endpoint and fails if
 * they disagree - the same arrangement `drift.ts` is held to, and for the same reason.
 */

import type { NativeGrid, OceanFloat, VolumeSpec } from "./types";

/** Kilometres per degree of latitude, from the same constant as the pipeline's. */
export const EARTH_RADIUS_KM = (111.32 * 180) / Math.PI;

export interface SectionCut {
  /** Distance from the start of the line, in kilometres, one per sample point. */
  distancesKm: number[];
  lons: number[];
  lats: number[];
  /** The model's own Levels in metres. Unwarped: this is a chart, not a texture. */
  levels: number[];
  /** `values[level][point]`, NaN where the model has no ocean. */
  values: Float32Array[];
}

export interface NearbyCast {
  id: string;
  kind: "float" | "mooring";
  time: string;
  lon: number;
  lat: number;
  distanceKm: number;
  /** How far off the line it really was. A section implies a cast was *on* it. */
  offsetKm: number;
  depthMax: number;
}

export function haversineKm(lonA: number, latA: number, lonB: number, latB: number): number {
  const phi1 = (latA * Math.PI) / 180;
  const phi2 = (latB * Math.PI) / 180;
  const dPhi = phi2 - phi1;
  const dLambda = ((lonB - lonA) * Math.PI) / 180;
  const h =
    Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Evenly spaced points along the great circle from A to B, both ends included.
 *
 * Internal. It was exported for `probe-section.mjs`, which reaches this module through
 * `window.__section` and only ever calls `sectionAlong`.
 */
function greatCirclePoints(
  lonA: number,
  latA: number,
  lonB: number,
  latB: number,
  count: number,
): { lons: number[]; lats: number[] } {
  if (count < 2) return { lons: [lonA], lats: [latA] };
  const toRad = Math.PI / 180;
  const unit = (lat: number, lon: number) => [
    Math.cos(lat * toRad) * Math.cos(lon * toRad),
    Math.cos(lat * toRad) * Math.sin(lon * toRad),
    Math.sin(lat * toRad),
  ];
  const [x1, y1, z1] = unit(latA, lonA) as [number, number, number];
  const [x2, y2, z2] = unit(latB, lonB) as [number, number, number];
  const angle = Math.acos(Math.min(1, Math.max(-1, x1 * x2 + y1 * y2 + z1 * z2)));

  const lons: number[] = [];
  const lats: number[] = [];
  for (let i = 0; i < count; i++) {
    const f = i / (count - 1);
    if (angle < 1e-9) {
      // The two ends are the same place. Interpolating would divide by sin(0).
      lons.push(lonA);
      lats.push(latA);
      continue;
    }
    const a = Math.sin((1 - f) * angle) / Math.sin(angle);
    const b = Math.sin(f * angle) / Math.sin(angle);
    const x = a * x1 + b * x2;
    const y = a * y1 + b * y2;
    const z = a * z1 + b * z2;
    lats.push((Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI);
    lons.push((Math.atan2(y, x) * 180) / Math.PI);
  }
  return { lons, lats };
}

/**
 * One water column out of the native Grid, bilinear, or null off the Grid entirely.
 *
 * **Masked corners are refused per Level, not per column**, exactly as `Grid.column_at` does in
 * the pipeline. That distinction is the whole shape of a section near a coast: a column where
 * the sea floor cuts in at 200 m has real water above it and rock below, and refusing the whole
 * column would blank the part that exists. Measured before it was fixed, 142 of 1,464 cells in
 * a Bay of Bengal section disagreed with the pipeline about whether there was ocean there - all
 * of them water the model has and this drew as nothing.
 *
 * Within a Level, any Masked corner still makes the answer Masked rather than falling back to
 * the corners that do have data: near a coast those corners are the open ocean, and blending
 * them in manufactures a sea temperature for a point on land.
 */
function columnAt(
  grid: NativeGrid,
  volume: VolumeSpec,
  lon: number,
  lat: number,
): Float32Array | null {
  const { west, east, south, north } = volume;
  if (lon < west || lon > east || lat < south || lat > north) return null;

  const dx = (east - west) / (grid.width - 1);
  const dy = (north - south) / (grid.height - 1);
  const col = Math.min(Math.max(Math.floor((lon - west) / dx), 0), grid.width - 2);
  const row = Math.min(Math.max(Math.floor((lat - south) / dy), 0), grid.height - 2);
  const fx = (lon - (west + col * dx)) / dx;
  const fy = (lat - (south + row * dy)) / dy;

  const out = new Float32Array(grid.levels);
  const plane = grid.width * grid.height;
  for (let level = 0; level < grid.levels; level++) {
    let sum = 0;
    let masked = false;
    for (let j = 0; j < 2 && !masked; j++) {
      for (let i = 0; i < 2; i++) {
        const value = grid.values[level * plane + (row + j) * grid.width + (col + i)];
        if (value === undefined || !Number.isFinite(value)) {
          masked = true;
          break;
        }
        sum += value * (i ? fx : 1 - fx) * (j ? fy : 1 - fy);
      }
    }
    out[level] = masked ? Number.NaN : sum;
  }
  return out;
}

/**
 * Cut the Grid along a line.
 *
 * A point off the Grid or over land comes back missing. **Half a section is a real answer**:
 * refusing the whole line because one end left the model would throw away the half inside it.
 */
export function sectionAlong(
  grid: NativeGrid,
  volume: VolumeSpec,
  from: { lon: number; lat: number },
  to: { lon: number; lat: number },
  points = 121,
): SectionCut {
  const { lons, lats } = greatCirclePoints(from.lon, from.lat, to.lon, to.lat, points);
  const levels = volume.levelMetres ?? [];
  const values: Float32Array[] = [];
  for (let level = 0; level < grid.levels; level++) values.push(new Float32Array(lons.length));

  const distancesKm: number[] = [];
  for (let index = 0; index < lons.length; index++) {
    const lon = lons[index]!;
    const lat = lats[index]!;
    distancesKm.push(haversineKm(from.lon, from.lat, lon, lat));
    const column = columnAt(grid, volume, lon, lat);
    for (let level = 0; level < grid.levels; level++) {
      values[level]![index] = column ? column[level]! : Number.NaN;
    }
  }

  return { distancesKm, lons, lats, levels: levels.slice(0, grid.levels), values };
}

/**
 * Every instrument fix within `corridorKm` of the line, ordered from its start to its end.
 *
 * "Near the line" is not "near the line's direction": a cast 200 km past an end is within a
 * corridor's width of the line extended and is not part of this section, so the projection is
 * clamped to the segment and anything outside it is dropped. Drawing it anyway would put an
 * observation somewhere nobody observed.
 */
export function castsNearLine(
  floats: OceanFloat[],
  from: { lon: number; lat: number },
  to: { lon: number; lat: number },
  corridorKm = 150,
  /** The Timestep the section is cut at, in ms. Omit to take every fix, which is rarely right. */
  whenMs?: number,
  /** The bake's coverage window. The same gate `positionAt` puts on a Float marker. */
  windowDays?: number,
): NearbyCast[] {
  // Near in time as well as in space. A section is cut at one Timestep, and a reader takes the
  // casts drawn on it as observations of the water it goes through. Measured with no filter at
  // all: 131 casts on one Bay of Bengal line, 101 of them from March to June under a caption
  // saying "casts within 150 km of the line". Same refusal `positionAt` makes for the markers.
  const limitMs =
    whenMs === undefined || windowDays === undefined ? null : windowDays * 86_400_000;

  // The corridor is measured against the **great circle** `sectionAlong` samples, not against a
  // straight line in cosine-scaled degrees. The old flat version was wrong twice at once: its
  // single cosine is right at the middle of the line and wrong at both ends, and a straight
  // line in scaled degrees is a rhumb line rather than the great circle drawn. Measured against
  // a numeric minimisation over 20,001 points of the drawn line, on 45 E 10 S to 100 E 25 N,
  // the reported offset was out by up to 179 km against a corridor 150 km wide.
  const lengthKm = haversineKm(from.lon, from.lat, to.lon, to.lat);
  const course = initialBearing(from.lon, from.lat, to.lon, to.lat);

  const out: NearbyCast[] = [];
  for (const item of floats) {
    for (const fix of item.track) {
      if (limitMs !== null && Math.abs(new Date(fix.time).getTime() - whenMs!) > limitMs) continue;

      let distanceKm: number;
      let offsetKm: number;
      if (lengthKm <= 0) {
        distanceKm = 0;
        offsetKm = haversineKm(fix.lon, fix.lat, from.lon, from.lat);
      } else {
        const angle = haversineKm(from.lon, from.lat, fix.lon, fix.lat) / EARTH_RADIUS_KM;
        const turn = initialBearing(from.lon, from.lat, fix.lon, fix.lat) - course;
        const cross = Math.asin(clamp(Math.sin(angle) * Math.sin(turn)));
        offsetKm = Math.abs(cross) * EARTH_RADIUS_KM;
        if (offsetKm > corridorKm) continue;
        let along = Math.acos(clamp(Math.cos(angle) / Math.cos(cross)));
        if (Math.cos(turn) < 0) along = -along;
        distanceKm = along * EARTH_RADIUS_KM;
        if (distanceKm < 0 || distanceKm > lengthKm) continue;
      }
      if (offsetKm > corridorKm) continue;

      out.push({
        id: item.id,
        kind: item.kind ?? "float",
        time: fix.time,
        lon: fix.lon,
        lat: fix.lat,
        distanceKm,
        offsetKm,
        depthMax: fix.depthMax,
      });
    }
  }
  out.sort((a, b) => a.distanceKm - b.distanceKm);
  return out;
}

function clamp(value: number): number {
  return Math.min(Math.max(value, -1), 1);
}

/** The course from A to B where it leaves A, in radians. A great circle does not hold one. */
function initialBearing(lonA: number, latA: number, lonB: number, latB: number): number {
  const phi1 = (latA * Math.PI) / 180;
  const phi2 = (latB * Math.PI) / 180;
  const dLambda = ((lonB - lonA) * Math.PI) / 180;
  return Math.atan2(
    Math.sin(dLambda) * Math.cos(phi2),
    Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda),
  );
}
