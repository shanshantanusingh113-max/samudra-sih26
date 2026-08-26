/**
 * The one place that decides where a latitude, a longitude or a depth ends up in world space.
 *
 * World axes: +x is east, +z is *south*, +y is up. So depth runs down from y = 0 at the surface.
 *
 * The vertical axis is linear in the Depth Warp's coordinate, not in metres. That is not an
 * oversight - it is what lets 48 evenly spaced texture slabs resolve a thermocline that lives
 * in the top 200 m of a 2000 m column, and a stretched depth axis is ordinary practice in
 * oceanography. Because it is not linear in metres, the UI draws a depth ruler with real
 * figures at their warped positions rather than leaving the viewer to assume proportionality.
 */

import type { VolumeSpec } from "../types";

/** Metres per degree of latitude. Used only to express Vertical Exaggeration honestly. */
export const METRES_PER_DEGREE = 111_320;

/**
 * One world unit is one degree of longitude, and the origin is the intersection of the
 * equator and the prime meridian - *not* the centre of the study region. Everything shares
 * one frame so the world map, the coastlines, the Float markers and the Volume box all land
 * in the same place without anybody applying a correction.
 */
export interface Frame {
  centreLon: number;
  centreLat: number;
  boxHeight: number;
  volume: VolumeSpec;
}

export function makeFrame(volume: VolumeSpec, exaggeration: number): Frame {
  const trueHeightInDegrees = (volume.floorMetres - volume.surfaceMetres) / METRES_PER_DEGREE;
  return {
    centreLon: (volume.west + volume.east) / 2,
    centreLat: (volume.south + volume.north) / 2,
    boxHeight: trueHeightInDegrees * exaggeration,
    volume,
  };
}

export const lonToX = (lon: number) => lon;
export const latToZ = (lat: number) => -lat;
export const xToLon = (x: number) => x;
export const zToLat = (z: number) => -z;

/**
 * Depth in metres -> fraction along the warped axis, by inverting the sampled axis the bake
 * shipped. Reading the real axis back beats re-deriving the warp formula in a second language,
 * where it could silently drift out of step with the pipeline.
 */
export function depthToAxis(volume: VolumeSpec, metres: number): number {
  const axis = volume.depthAxisMetres;
  const last = axis.length - 1;
  if (metres <= (axis[0] ?? 0)) return 0;
  if (metres >= (axis[last] ?? 1)) return 1;

  let low = 0;
  let high = last;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if ((axis[mid] ?? 0) <= metres) low = mid;
    else high = mid;
  }
  const a = axis[low] ?? 0;
  const b = axis[high] ?? 1;
  return (low + (metres - a) / (b - a)) / last;
}

export function axisToDepth(volume: VolumeSpec, fraction: number): number {
  const axis = volume.depthAxisMetres;
  const last = axis.length - 1;
  const position = Math.min(Math.max(fraction, 0), 1) * last;
  const low = Math.min(Math.floor(position), last - 1);
  const a = axis[low] ?? 0;
  const b = axis[low + 1] ?? a;
  return a + (b - a) * (position - low);
}

export const depthToY = (frame: Frame, metres: number) =>
  -depthToAxis(frame.volume, metres) * frame.boxHeight;

export function boxBounds(frame: Frame) {
  const { volume } = frame;
  return {
    min: [lonToX(volume.west), -frame.boxHeight, latToZ(volume.north)] as const,
    max: [lonToX(volume.east), 0, latToZ(volume.south)] as const,
  };
}

/** Depth figures worth putting on the ruler, skipping any the current slice has hidden. */
export function depthTicks(volume: VolumeSpec): number[] {
  // The first figure is the model's own shallowest Level, not zero. The axis had a "0 m" label
  // because the filter allowed anything within 5 m of the surface, and the top of this box is
  // 5 m - there is no data above it, and a ruler is a measurement claim.
  const round = [50, 100, 200, 300, 500, 750, 1000, 1500, 2000].filter(
    (d) => d > volume.surfaceMetres && d <= volume.floorMetres,
  );
  return [volume.surfaceMetres, ...round];
}
