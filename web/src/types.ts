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
  /**
   * How this Field is drawn, because not every quantity is a body of water.
   *
   * - `volume` - a value at every depth. Ray-marched, as everything used to be.
   * - `depth` - the value *is* a depth, so it is drawn as a sheet inside the block sitting at
   *   that depth. You watch the 26 °C isotherm dome up and collapse across four months with the
   *   Floats sitting on it; no flat map can do that.
   * - `column` - one number for the whole water column, draped on the sea surface.
   * - `vector` - a direction and a speed, drawn as arrows on the chosen depth.
   *
   * A `depth` or `column` Field has no Volume at all: it arrives as float32 on the Grid's own
   * horizontal axes, because a reader reads metres straight off it.
   */
  render?: "volume" | "depth" | "column" | "vector";
  /** Which group of the Variable selector this belongs in. */
  group?: string;
  /**
   * True for an uploaded variable whose file has no usable vertical axis.
   *
   * `api/upload.py` puts a surface field in slab 0 and Masks the other 47, which is the honest
   * choice - ADR 0014 - and it means the Field is invisible unless the Depth slice includes the
   * surface. Uploaded after somebody has sliced to 200 m, it rendered as nothing at all with a
   * name in the selector and no explanation. `selectField` resets the slice for one of these.
   *
   * Set only by the upload endpoint. No baked Field carries it: a baked Field that is not a
   * body of water declares `render` instead, and is drawn as a Sheet or a Drape.
   */
  surfaceOnly?: boolean;
}

/** One heading in the Variable selector, in the order the panel shows them. */
export interface FieldGroup {
  key: string;
  label: string;
}

/**
 * One hazard Field at one Timestep: float32 on the Grid's own horizontal axes.
 *
 * Row 0 is the southernmost latitude and column 0 the westernmost longitude, the same way round
 * as the Volume texture's v axis. NaN is Mask and must draw as absent, never as zero.
 */
export interface SurfaceField {
  width: number;
  height: number;
  values: Float32Array;
}

/**
 * Current components at one Timestep, on the model's own Levels and horizontal axes.
 *
 * Interleaved (u, v) per cell, indexed `[level][lat][lon][component]`. This is the Grid, not a
 * Volume: the speed under the cursor and the length of every arrow are read off it, and both are
 * measurements.
 */
export interface VectorField {
  levels: number;
  width: number;
  height: number;
  values: Float32Array;
}

/** Band thresholds and labels for the derived Observation Coverage Field. */
export interface CoverageSpec {
  bands: number[];
  labels: string[];
  /** Half-window either side of the analysis date. The Float markers use it too; see floatTime.ts. */
  windowDays: number;
  radiusKm: number;
  /**
   * How much of the block has no cast behind it at all, pooled over every Timestep.
   *
   * Measured by the bake. The guide panel used to carry this figure as a hand-typed "9.9%",
   * which a re-bake turns into a false sentence with nothing to catch it.
   */
  emptyFraction?: number;
}

/** What the climatological Field is, measured. Absent when the bake could not reach NOAA. */
export interface NormalAnomalySpec {
  /** Monthly normals used. Three ten-day steps inside a month share one baseline. */
  months: number;
  cells: number;
  meanDegC: number;
  p95AbsDegC: number;
}

export interface VolumeSpec {
  width: number;
  height: number;
  depth: number;
  /** Real depth in metres of each of the `depth` evenly spaced slabs. The Depth Warp, inverted. */
  depthAxisMetres: number[];
  /** The model's own Levels, unwarped. What the current vectors are indexed on. */
  levelMetres?: number[];
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
  /** What this source contributed, and where from. Read by the provenance page. */
  role?: string;
  endpoint?: string;
}

export interface Manifest {
  generated: string;
  region: { south: number; north: number; west: number; east: number };
  sources: SourceSpec[];
  fields: FieldSpec[];
  /** Headings for the Variable selector. Thirteen Fields cannot be a flat list of buttons. */
  fieldGroups?: FieldGroup[];
  timesteps: string[];
  volume: VolumeSpec;
  volumeFiles: Record<string, string[]>;
  /** One file per hazard Field per Timestep. These Fields have no Volume at all. */
  surfaceFiles?: Record<string, string[]>;
  palettes: Record<string, number[][]>;
  floatCount: number;
  coverage?: CoverageSpec;
  /** Absent when the bake could not reach NOAA for the World Ocean Atlas. */
  normalAnomaly?: NormalAnomalySpec;
  anomalyFeatures?: AnomalyFeatureSpec;
  /** How many of each kind are on the water, so the panel and the key can name them. */
  instruments?: { floats: number; moorings: number; withChlorophyll: number };
  /** Quantities measured but not modelled, so the panel knows what to expect. */
  observedOnly?: { key: string; label: string; units: string }[];
  /** Absent entirely when the bake could not reach Copernicus. */
  currents?: CurrentsSpec;
  /** What reading the glider archive the PS names actually found. */
  gliders?: GliderFinding;
  /** Where the model most disagrees with the instruments. Absent on an older bake. */
  residuals?: ResidualsSpec;
  /** The drift check. Absent when the bake could not reach Copernicus for currents. */
  drift?: DriftSpec;
  /**
   * The **native Grid** as float32, per Field per Timestep, for the vertical section.
   *
   * Not a Volume. A section is a chart somebody reads metres and degrees off, and the first
   * rule here is that a scientific question is never answered from a Volume. Only the three
   * collocated Fields have one, because those are what an instrument measures.
   */
  gridFiles?: Record<string, string[]>;
}

/**
 * One Field at one Timestep on the model's own 24 Levels: float32, [level][lat][lon].
 *
 * Row 0 is the southernmost latitude and column 0 the westernmost longitude, the same way round
 * as the current vectors and the hazard surfaces. NaN is Mask and must read as absent.
 */
export interface NativeGrid {
  levels: number;
  width: number;
  height: number;
  values: Float32Array;
}

/**
 * What the baked drift check found, summarised in the manifest so a panel can quote it without
 * fetching the whole file.
 */
export interface DriftSpec {
  file: string;
  parkingDepthMetres: number;
  stepHours: number;
  /** Floats with a drift check behind them. */
  floats: number;
  horizons: DriftHorizon[];
  /** From a position known one Argo cycle ago, which is the question a search actually asks. */
  cycle: { count: number; medianKm: number; p90Km: number } | null;
}

export interface DriftHorizon {
  days: number;
  /** The median day actually used. An Argo cycle is 9.9985 days, so this is never exactly
   *  `days`, and a figure labelled "10 days" that is a median of 18 is a wrong figure. */
  medianDaysUsed: number;
  floats: number;
  medianSeparationKm: number;
  /** How far the floats themselves went over the same span. A separation means nothing alone. */
  medianTravelledKm: number;
}

/** One Float's own track against the drift the analysed currents imply from its first Fix. */
export interface FloatDrift {
  /**
   * When and where the comparison starts, as an ISO stamp.
   *
   * Not the float's first Fix. A Fix outside the analysed period is refused, because
   * `_bracket_time` holds the first analysis rather than extrapolating and a score measured
   * there is measured against a current field that was not measured then.
   */
  startTime: string;
  days: number[];
  observed: [number, number][];
  predicted: [number, number][];
  observedKm: number[];
  predictedKm: number[];
  separationKm: number[];
  /** The predicted trajectory as a daily polyline, for drawing. */
  path: [number, number][];
  ended: string;
}

export interface BakedDrift {
  parkingDepthMetres: number;
  stepHours: number;
  sampleHours: number;
  floats: Record<string, FloatDrift>;
  summary: {
    floats: number;
    horizons: DriftHorizon[];
    cycle: { count: number; medianKm: number; p90Km: number } | null;
  };
}

/** Where `residuals.json` is, and the two choices the bias map was binned with. */
export interface ResidualsSpec {
  file: string;
  cellDegrees: number;
  minCount: number;
}

/**
 * One instrument against the model, for one Field, at the cast that was actually compared.
 *
 * `bias` is observed minus modelled averaged over the depths that matched, so a positive bias
 * means the instrument measured MORE than the model did. `scaledRms` is the same RMS as a
 * fraction of the Field's own encoded range, which is what the ranking is on - 0.9 PSU and
 * 0.9 degC are the same number and nothing like the same finding.
 */
export interface ResidualInstrument {
  id: string;
  kind: "float" | "mooring";
  lon: number;
  lat: number;
  step: number;
  time: string;
  bias: number | null;
  rms: number | null;
  matched: number;
  scaledBias: number | null;
  scaledRms: number | null;
}

/** One box of the bias map. Only emitted where at least `minCount` instruments stand behind it. */
export interface BiasCell {
  south: number;
  west: number;
  count: number;
  meanBias: number | null;
  /** The mean of the magnitudes: a cell where two large disagreements cancelled is not a cell
   *  where nothing disagreed, and the two would read identically from `meanBias` alone. */
  meanAbsBias: number | null;
  rms: number | null;
}

/** One kind of instrument against the model, across the whole region. */
export interface KindBias {
  count: number;
  meanBias: number | null;
  meanAbsBias: number | null;
  rms: number | null;
}

export interface FieldResiduals {
  summary: {
    count: number;
    meanBias: number | null;
    meanAbsBias: number | null;
    rms: number | null;
    /** Where the map's colour scale saturates, as a fraction of the Field's own range. */
    p90ScaledAbs?: number | null;
  };
  /**
   * The same summary split by kind of instrument, which is the difference between a measurement
   * and a tautology.
   *
   * INCOIS's analysis **assimilates Argo**, so a float's residual is largely the model agreeing
   * with an observation it was fed; the moored buoys are not assimilated. Measured over this
   * bake the moorings disagree several times as much, and pooled into one basin-wide figure the
   * nine of them disappear into 224 floats. Absent on a bake made before the split existed.
   */
  byKind?: Record<string, KindBias>;
  /** Worst first, by mean absolute bias. */
  cells: BiasCell[];
  /** Worst first, by RMS as a fraction of the Field's range. */
  instruments: ResidualInstrument[];
}

export interface Residuals {
  cellDegrees: number;
  minCount: number;
  fields: Record<string, FieldResiduals>;
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
  /**
   * What kind of instrument this is.
   *
   * `CONTEXT.md` says a mooring is a Float where it does not matter that it moves differently,
   * and there are exactly two places where it does: an anchored buoy has no drift track to
   * draw, and because it never moves it can be compared against the model at every Timestep
   * rather than only the one nearest its cast.
   */
  kind?: "float" | "mooring";
  /** Who operates it, where the provider says. The GTS feed does; Argo does not. */
  country?: string | null;
  /** True when this float carries a fluorometer, so its panel has a chlorophyll profile. */
  bgc?: boolean;
  track: FloatFix[];
  latest: FloatFix;
  profileCount: number;
}

/** A quantity an instrument measured that the model has no counterpart for. */
export interface ObservedOnlySeries {
  label: string;
  units: string;
  depths: number[];
  observed: (number | null)[];
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
  kind?: "float" | "mooring";
  timestepIndex: number;
  time: string;
  fields: Record<string, CollocationSeries>;
  /**
   * A mooring's comparison at every Timestep, keyed by index.
   *
   * The thing an Argo float cannot give you: the same water column against every analysis in
   * the bake, from an instrument that never moved. A float has drifted somewhere else by the
   * next step, so its chart is pinned to one date and says so.
   */
  steps?: Record<string, { time: string; fields: Record<string, CollocationSeries> }>;
  /** Chlorophyll, where this float carries a fluorometer. No model side exists for it. */
  observedOnly?: Record<string, ObservedOnlySeries>;
  observedOnlyTime?: string;
  /** False when it came from this float's neighbouring dive rather than the charted one. */
  observedOnlySameDive?: boolean;
}

/**
 * Copernicus Marine's current vectors, as numbers.
 *
 * This replaced a rendered image. The old overlay carried arrows nobody could read a value off,
 * for the good reason that Copernicus's values were behind an account we did not have; a free
 * account now exists and the credential lives in the bake, never in the browser. ADR 0013.
 *
 * The files are the Grid - float32 (u, v) on the model's own Levels - so the speed under the
 * cursor and the length of every arrow are measurements rather than a picture of one.
 */
export interface CurrentsSpec {
  files: string[];
  /** The Field key the speed Volume is registered under. */
  field: string | null;
  attribution: string;
  dataset: string;
  levels: number;
  width: number;
  height: number;
}

/**
 * What the EGO glider archive holds for India's waters, and it is the finding that matters.
 *
 * PS 26067 names gliders three times, so the archive it names is read. Scanned against the
 * complete 824,641-line global index: one glider, two deployments, 2,876 casts, newest
 * 2022-10-14, nothing at all since. The gap is India's glider programme, not the adapter.
 */
export interface GliderFinding {
  archive: string;
  castsInRegion: number;
  castsInWindow: number;
  gliders: number;
  newestCast: string | null;
  deployments: {
    name: string;
    wmo: string;
    casts: number;
    from: string;
    to: string;
    maxPressureDbar: number;
    channels: string[];
  }[];
}

