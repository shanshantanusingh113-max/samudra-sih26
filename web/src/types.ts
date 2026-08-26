/** Shapes the bake pipeline writes into `public/data`. Kept in step with `pipeline/samudra/bake.py`. */

export interface FieldSpec {
  key: string;
  label: string;
  units: string;
  palette: string;
  display_min: number;
  display_max: number;
  /** The encoded byte range: byte 0 means `range[0]`, byte 255 means `range[1]`. */
  range: [number, number];
  /** Optional render hints. A Field can say how it wants to be drawn; see bake.py. */
  emphasis?: number | null;
  opacity?: number | null;
  description?: string | null;
  /** False when an isosurface is not a meaningful operation on this Field. */
  isosurface?: boolean;
}

/** Band thresholds and labels for the derived Observation Coverage Field. */
export interface CoverageSpec {
  bands: number[];
  labels: string[];
  /** Half-window either side of the analysis date. The Float markers use it too; see floatTime.ts. */
  windowDays: number;
  radiusKm: number;
}

export interface VolumeSpec {
  width: number;
  height: number;
  depth: number;
  /** Real depth in metres of each of the `depth` evenly spaced slabs. The Depth Warp, inverted. */
  depthAxisMetres: number[];
  surfaceMetres: number;
  floorMetres: number;
  west: number;
  east: number;
  south: number;
  north: number;
}

/**
 * One connected body of water that departed from its own average, and what is known about it.
 *
 * Written by `_build_anomaly_features` in bake.py. Everything here is measured: the frontend
 * words it, but no field is an interpretation.
 */
export interface AnomalyFeature {
  /** +1 warmer than its own average, -1 cooler. */
  sign: number;
  peakValue: number;
  /** How unusual the peak is for its own cell, in standard deviations across the series. */
  peakZ: number;
  /** The middle of the body, where the ring is drawn and where every fact below is read. */
  lat: number;
  lon: number;
  depth: number;
  topMetres: number;
  bottomMetres: number;
  south: number;
  north: number;
  west: number;
  east: number;
  cells: number;
  /** Horizontal area covered, each column counted once however deep it runs. */
  footprintKm2: number;
  /** Depth of the isotherm at this cell now, and against its own average over the series. */
  isothermDepth: number | null;
  isothermDeparture: number | null;
  /** Whether the isotherm actually swept through this water. Only then is it the cause. */
  isothermExplains: boolean;
  salinityDeparture: number | null;
  densityDeparture: number | null;
  /** Argo casts standing behind this water. Zero means the model is interpolating here. */
  casts: number | null;
}

export interface AnomalyFeatureSpec {
  field: string;
  zThreshold: number;
  valueThreshold: number;
  minCells: number;
  isothermValue: number;
}

export interface SourceSpec {
  name: string;
  attribution: string;
}

export interface Manifest {
  generated: string;
  region: { south: number; north: number; west: number; east: number };
  sources: SourceSpec[];
  fields: FieldSpec[];
  timesteps: string[];
  volume: VolumeSpec;
  volumeFiles: Record<string, string[]>;
  palettes: Record<string, number[][]>;
  floatCount: number;
  coverage?: CoverageSpec;
  anomalyFeatures?: AnomalyFeatureSpec;
}

export interface FloatFix {
  lat: number;
  lon: number;
  time: string;
  /** How deep this cast went. Per Fix, so the panel can describe the moment on screen. */
  depthMax: number;
}

export interface OceanFloat {
  id: string;
  track: FloatFix[];
  latest: FloatFix;
  profileCount: number;
}

export interface CollocationSeries {
  depths: number[];
  observed: (number | null)[];
  modelled: (number | null)[];
  residual: (number | null)[];
  matched: number;
  /** Observations shallower than the model's top Level, which have nothing to compare against. */
  aboveModel: number;
  meanResidual: number | null;
  rmsResidual: number | null;
}

export interface Collocation {
  timestepIndex: number;
  time: string;
  fields: Record<string, CollocationSeries>;
}
