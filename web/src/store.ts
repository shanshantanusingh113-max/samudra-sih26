import { create } from "zustand";
import { positionAt } from "./floatTime";
import type { AnomalyFeature, Collocation, FieldSpec, Manifest, OceanFloat } from "./types";

export type Stage = "globe" | "diving" | "volume";
export type Theme = "dark" | "light";

/**
 * How a Field is drawn when it does not ask for anything else.
 *
 * These are constants rather than "whatever the last Field left behind". A FieldSpec carries
 * `emphasis` and `opacity` only when it wants something other than these, and `selectField`
 * used to apply a hint when there was one and change nothing when there was not - so a Field
 * with no hints silently inherited the previous Field's. Selecting Observation Coverage
 * (emphasis 0) and going back to Temperature left the gradient weighting switched off, which
 * turns the thermocline - the single most important structure in the picture, and the thing the
 * guide panel tells the reader to look for - into an invisible band under an opaque warm lid.
 *
 * DEFAULT_OPACITY is 0.03 rather than 0.05. Measured inside the Volume, the pixel difference
 * between emphasis 0% and 85% is 2.10 at 0.05 and 4.07 at 0.03, and the share of pixels visibly
 * changed goes from 17.4% to 35.6%: the shader stops accumulating once alpha passes 0.995, so a
 * dense first slab saturates the ray and the emphasis weighting stops mattering. The water still
 * reads as a body at 0.03.
 */
export const DEFAULT_EMPHASIS = 0.85;
export const DEFAULT_OPACITY = 0.03;

/**
 * The console defaults to dark because that is what the ray-marched water is calibrated
 * against, but a forecaster in a bright room needs the other one. Remembered per browser so a
 * choice survives a reload; a private window that refuses storage simply falls back to dark.
 */
const THEME_KEY = "samudra.theme";

export function storedTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // A browser that blocks storage still gets the theme, just not the memory of it.
  }
}

interface State {
  manifest: Manifest | null;
  floats: OceanFloat[];
  collocations: Record<string, Collocation>;
  /**
   * Whether `collocations.json` has finished arriving.
   *
   * It is fetched after first paint rather than before, so for the first second or two of a
   * session `collocations` is legitimately empty. Without this flag the Collocation panel could
   * not tell "still downloading" from "this Float has nothing to compare", and it would show the
   * second while the first was true.
   */
  collocationsReady: boolean;
  /** Anomaly Features, one list per Timestep. */
  anomalies: AnomalyFeature[][];
  coastlines: number[][][];
  /** Fatal: the app cannot start at all. */
  loadError: string | null;
  /** Transient: something failed but what is on screen is still valid. */
  notice: string | null;

  fieldKey: string;
  timestepIndex: number;
  playing: boolean;

  /** Transfer Function window, as a fraction of the Field's encoded range. */
  windowMin: number;
  windowMax: number;
  opacity: number;

  depthFrom: number;
  depthTo: number;
  surfaceLevel: number;

  isoEnabled: boolean;
  isoValue: number;
  volumeEnabled: boolean;
  /** 0 = plain density, 1 = fully favour where the field is changing. */
  emphasis: number;

  exaggeration: number;
  quality: number;

  /** Which control the user last touched, so the guide can explain it. Null = describe the view. */
  touched: string | null;

  /**
   * Which groups of the control panel are open.
   *
   * The panel is 1089 px of controls and a 1366x768 laptop can show 616 px of it, so 43% sat
   * below the fold with nothing on screen saying so - including the Isosurface, which PS 26067
   * names by hand. A scroll cue alone only tells a reader that something is missing; collapsing
   * the groups puts every group's *name* on screen at once, which is what makes a control
   * discoverable. The two that decide the opening picture stay open.
   */
  openGroups: Record<string, boolean>;
  toggleGroup: (key: string) => void;

  theme: Theme;

  stage: Stage;
  morph: number;
  selectedFloatId: string | null;
  showFloats: boolean;
  showTracks: boolean;
  showAnomalies: boolean;
  /**
   * How strongly to draw the Copernicus surface-current overlay. 0 is off.
   *
   * A rendered image, never a Field: it has no Volume, no isosurface, no collocation and no
   * number anybody can read off it. See `pipeline/samudra/currents.py` for why a picture is the
   * honest way to carry a field this platform cannot verify itself.
   */
  currentsOpacity: number;
  /**
   * Which step of the guided tour is open, or null.
   *
   * The guide panel explains whatever you touched, which is right for a forecaster and useless
   * for the audience PS 26067 names by hand - schools, exhibitions, policymakers. A first-time
   * visitor does not know what to touch. Any control ending the tour is deliberate: see Tour.tsx.
   */
  tourStep: number | null;
  /** Index into this Timestep's features. Cleared whenever the Timestep changes. */
  selectedAnomaly: number | null;
  /**
   * Clear the rest of the water away and leave only the selected Anomaly Feature.
   *
   * A coloured blob inside a solid block says *that* water departed and almost nothing about
   * its shape. This is how you actually look at the body the ring is pointing at - and it is
   * exactly the box every number on the Feature panel is measured over.
   */
  isolateAnomaly: boolean;

  set: <K extends keyof State>(key: K, value: State[K]) => void;
  /**
   * Switch Variable, and apply everything that switching implies.
   *
   * One place, because there are three: the button in the panel, the capture harness, and the
   * console. This used to live in the button's onClick, so a Field selected any other way kept
   * the previous Field's Transfer Function window and render hints and drew something subtly
   * wrong that nobody would question.
   */
  selectField: (key: string) => void;
  field: () => FieldSpec | undefined;
  /** The Anomaly Features of the Timestep on screen. */
  features: () => AnomalyFeature[];
  /**
   * The Floats actually drawn at the Timestep on screen, west to east.
   *
   * Not every Float in the bake. A Float is not drawn when its nearest cast is further than the
   * coverage window from the moment on screen, because drawing it would imply an observation
   * that does not exist. Measured across the twelve steps the drawn count runs 184 to 210, so
   * `manifest.floatCount` - 221 - overstated the opening card by 37.
   *
   * Ordered by longitude so that stepping through them with the keyboard walks the region
   * left to right, which is the order a viewer reads the map in.
   */
  reportingFloats: () => OceanFloat[];
  reportingCount: () => number;
  /** Reporting instruments split by kind, so a sentence can name what each one is. */
  reportingByKind: () => { floats: number; moorings: number };
  /** Turn a window fraction back into the physical value a user should read. */
  toValue: (fraction: number) => number;
  fromValue: (value: number) => number;
}

export const useStore = create<State>((setState, getState) => ({
  manifest: null,
  floats: [],
  collocations: {},
  collocationsReady: false,
  anomalies: [],
  coastlines: [],
  loadError: null,
  notice: null,

  fieldKey: "temperature",
  timestepIndex: 0,
  playing: false,

  windowMin: 0,
  windowMax: 1,
  opacity: DEFAULT_OPACITY,

  depthFrom: 0,
  depthTo: 1,
  // The Globe opens at 75 m, not at the surface.
  //
  // At 5 m the whole region sits between 25.7 and 32.9 degC on a colourbar running 2.61 to
  // 30.02, so it lands in the top quarter of the palette and the study area reads as a flat
  // yellow cut-out with no structure in it - the least informative picture in the app, shown
  // first. 75 m is the most structured Level in the column: measured on the last Timestep the
  // standard deviation is 2.18 degC against 0.92 at 5 m, and the spread covers 46% of the
  // colourbar against 26%. It is also the thermocline, which is what the Drill-down is about to
  // show, so the opening frame previews the point instead of hiding it.
  surfaceLevel: 0.227,

  isoEnabled: false,
  isoValue: 0.55,
  volumeEnabled: true,
  emphasis: DEFAULT_EMPHASIS,

  exaggeration: 1800,
  quality: 128,

  touched: null,

  openGroups: {
    field: true,
    palette: true,
    depthSlice: false,
    rendering: false,
    isosurface: false,
    instruments: false,
    anomalyFeatures: false,
  },
  toggleGroup: (key) =>
    setState((s) => ({ openGroups: { ...s.openGroups, [key]: !s.openGroups[key] } })),

  theme: storedTheme(),

  stage: "globe",
  morph: 0,
  selectedFloatId: null,
  showFloats: true,
  showTracks: true,
  showAnomalies: true,
  currentsOpacity: 0,
  tourStep: null,
  selectedAnomaly: null,
  isolateAnomaly: false,

  set: (key, value) =>
    setState(
      // Touching a control ends the tour. A panel that keeps moving the camera while somebody
      // is trying to drag a slider is worse than no tour at all, and `touched` is set by every
      // control in the panel, so this is the one place that has to know.
      key === "touched" && value !== null
        ? ({ [key]: value, tourStep: null } as never)
        : ({ [key]: value } as never),
    ),

  selectField: (key) => {
    const spec = getState().manifest?.fields.find((f) => f.key === key);
    if (!spec) return;
    setState({
      fieldKey: key,
      // The window is a fraction of the Field's own encoded range, so carrying it across a
      // switch would silently mean a different span of a different quantity.
      windowMin: 0,
      windowMax: 1,
      // A Field may ask to be drawn differently. Coverage does, because gradient-weighted
      // opacity would fade out exactly the flat regions it exists to show; the anomaly asks for
      // part of it, to clear the flat abyss without losing a uniform warm patch.
      //
      // A Field that asks for nothing gets the DEFAULT, not whatever the last one left behind.
      // This was `...(spec.emphasis != null ? {...} : {})`, which changed nothing when a Field
      // had no hint, so the hints leaked forwards. See DEFAULT_EMPHASIS.
      emphasis: spec.emphasis ?? DEFAULT_EMPHASIS,
      opacity: spec.opacity ?? DEFAULT_OPACITY,
    });
  },

  field: () => getState().manifest?.fields.find((f) => f.key === getState().fieldKey),

  features: () => getState().anomalies[getState().timestepIndex] ?? [],

  reportingFloats: () => {
    const { floats, manifest, timestepIndex } = getState();
    const stamp = manifest?.timesteps[timestepIndex];
    if (!stamp) return [];
    const whenMs = new Date(stamp).getTime();
    return floats
      .map((item) => ({ item, at: positionAt(item, whenMs) }))
      .filter((entry): entry is { item: OceanFloat; at: NonNullable<typeof entry.at> } =>
        entry.at !== null,
      )
      .sort((a, b) => a.at.lon - b.at.lon)
      .map((entry) => entry.item);
  },

  reportingCount: () => getState().reportingFloats().length,

  reportingByKind: () => {
    const reporting = getState().reportingFloats();
    const moorings = reporting.filter((f) => f.kind === "mooring").length;
    return { floats: reporting.length - moorings, moorings };
  },

  toValue: (fraction) => {
    const field = getState().field();
    if (!field) return fraction;
    const [low, high] = field.range;
    return low + fraction * (high - low);
  },

  fromValue: (value) => {
    const field = getState().field();
    if (!field) return value;
    const [low, high] = field.range;
    return (value - low) / (high - low);
  },
}));
