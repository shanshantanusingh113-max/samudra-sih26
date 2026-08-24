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
}

/** Band thresholds and labels for the derived Observation Coverage Field. */
export interface CoverageSpec {
  bands: number[];
  labels: string[];
  windowDays: number;
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
}

export interface FloatFix {
  lat: number;
  lon: number;
  time: string;
}

export interface OceanFloat {
  id: string;
  track: FloatFix[];
  latest: FloatFix & { depthMax: number };
  profileCount: number;
}

export interface CollocationSeries {
  depths: number[];
  observed: (number | null)[];
  modelled: (number | null)[];
  residual: (number | null)[];
  matched: number;
  meanResidual: number | null;
  rmsResidual: number | null;
}

export interface Collocation {
  timestepIndex: number;
  time: string;
  fields: Record<string, CollocationSeries>;
}
