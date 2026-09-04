import { create } from "zustand";
import { positionAt } from "./floatTime";
import {
  forgetUpload,
  timestepMapping,
  uploadedVolumeUrl,
  type UploadedFile,
  type UploadProblem,
} from "./data/upload";
import { isDiverging, supportsLog, type Scale } from "./transfer";
import type {
  AnomalyFeature,
  BakedDrift,
  Collocation,
  FieldResiduals,
  FieldSpec,
  Manifest,
  NativeGrid,
  OceanFloat,
  Residuals,
  SurfaceField,
  VectorField,
} from "./types";

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
/**
 * The Field Group an uploaded file's variables land in.
 *
 * A group of their own rather than dropped among the baked Fields, because the difference
 * matters to a reader: everything else on this platform came from a named provider through an
 * adapter with a test behind it, and these came from a file somebody handed us five seconds
 * ago. Same rendering, different provenance, and the tab says so.
 */
export const UPLOAD_GROUP = "yours";

export const DEFAULT_EMPHASIS = 0.85;
export const DEFAULT_OPACITY = 0.03;

/**
 * Where a diverging Field's isosurface slider is allowed to start, as a window fraction.
 *
 * 0.52 is just past the midpoint. Below it the "contour of departure" would be a contour of
 * *negative* departure drawn as though it were positive, and at the midpoint itself it is the
 * skin around water that did not change, which is every cell in the block.
 */
const DIVERGING_ISO_FLOOR = 0.52;

/**
 * The smallest departure this platform is willing to draw a contour around, in degrees Celsius.
 *
 * `anomaly.find_anomaly_features` will not mark a body of water below 0.5 degC, for the
 * documented reason that anything less is the thermocline's ordinary seasonal breathing. That
 * threshold is a statement about **water**, not about one Field's encoding, so every diverging
 * temperature Field inherits it - including the climatological one, which the detector never
 * ran on. Read from the manifest; this is the fallback if the block is missing.
 */
const DEPARTURE_FLOOR_DEGC = 0.5;

/**
 * The value a Field's isosurface should open at.
 *
 * A continuous Field keeps whatever the reader last chose. A diverging one is lifted to its own
 * meaningful floor: for a temperature departure that is the anomaly detector's own threshold,
 * shipped in the manifest as `anomalyFeatures.valueThreshold`, so the surface and the rings
 * agree about what counts as a departure instead of the surface enclosing water the rings
 * refuse to mark.
 *
 * **That threshold is not the detector's Field's private property.** It used to be applied only
 * when the Field *was* the one the detector ran on, so Temperature vs Normal - which is the same
 * quantity against a different baseline - fell back to 0.52 of its own range, which on a
 * +/-3.365 degC encoding is 0.135 degC. Its neighbour opened at 0.5 degC and this one opened at
 * a quarter of that, drawing a skin around most of the block under a label reading "Departure of
 * at least 0.13 °C". Any Field in degrees Celsius that runs through zero gets the same floor.
 */
function isoFloorFor(spec: FieldSpec, state: { isoValue: number; manifest: Manifest | null }): number {
  if (!isDiverging(spec)) return state.isoValue;
  const [low, high] = spec.range;
  const span = Math.max(high - low, 1e-9);
  const degrees = state.manifest?.anomalyFeatures?.valueThreshold ?? DEPARTURE_FLOOR_DEGC;
  // Only where the units make the threshold mean the same thing. A departure floor in degC
  // says nothing about the spread between two analyses in PSU or a barrier layer in metres.
  const fromDetector = spec.units === "°C" || spec.units === "degC" ? (degrees - low) / span : 0;
  return Math.min(Math.max(state.isoValue, fromDetector, DIVERGING_ISO_FLOOR), 0.98);
}

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
  /**
   * Where the model most disagrees with the instruments, per Field. Null until it arrives.
   *
   * The other half of the anomaly scan. `find_anomaly_features` answers "where did the field
   * depart from its own average"; this answers "where does the model depart from the floats",
   * which is the question the whole platform exists for and the one nothing sorted until now.
   */
  residuals: Residuals | null;
  /**
   * The baked drift check: every Float's own track against the drift the currents imply.
   *
   * Null until it arrives, and null forever on a bake that could not reach Copernicus - there
   * is no current field to integrate then, and the panel says so rather than drawing nothing.
   */
  bakedDrift: BakedDrift | null;
  /**
   * A NetCDF file the reader dropped on the page, as the server read it.
   *
   * Its variables are merged into `manifest.fields` under a group of their own, so an uploaded
   * Field goes through exactly the same Variable selector, colourbar, isosurface and shader as
   * a baked one. That is the claim - "new variables with minimal code change" - demonstrated
   * rather than argued, and it is why this is not a separate viewer bolted on the side.
   */
  upload: UploadedFile | null;
  /** Why the last file was refused, in the server's own words. Cleared by the next attempt. */
  uploadProblem: UploadProblem | null;
  uploadBusy: boolean;
  /** Which of the file's own instants each Timestep shows. See `timestepMapping`. */
  uploadSteps: number[];

  /**
   * The vertical section: the two ends of the line, and the Grids it is cut from.
   *
   * `placingSection` is 0 when the line is finished, 1 when the next click sets the start and 2
   * when it sets the end. `nativeGrids` is keyed `field|timestep` and holds the float32 Grid -
   * never a Volume, because the section is a chart somebody reads metres off.
   */
  sectionFrom: { lon: number; lat: number } | null;
  sectionTo: { lon: number; lat: number } | null;
  placingSection: 0 | 1 | 2;
  /** How far off the line a cast may be and still be drawn on the section. */
  sectionCorridorKm: number;
  nativeGrids: Record<string, NativeGrid>;
  /**
   * Take a file the server has read and make its variables real Fields.
   *
   * They are merged into `manifest.fields` under a group of their own and their Volumes are
   * registered in `volumeFiles` as absolute URLs, so every control downstream - the selector,
   * the colourbar, the depth slice, the isosurface, the ray marcher - treats them exactly like
   * a baked Field and none of them needed a line of code. That is the PS's "new variables with
   * minimal code change" made checkable in front of a judge.
   */
  acceptUpload: (file: UploadedFile) => void;
  /** Drop the uploaded Fields, and tell the server to delete its copy of the file. */
  clearUpload: () => void;
  /**
   * Hazard Fields already fetched, keyed `field|timestep`.
   *
   * These are not Volumes and never go to the GPU as a texture: they are float32 on the Grid's
   * own axes, and the sheet drawn from one is built on the CPU so its depth in metres goes
   * through `geography.ts` exactly like everything else. 8 KB apiece, so they are simply kept.
   */
  surfaces: Record<string, SurfaceField>;
  /** Current components, keyed by Timestep. 387 KB apiece, so fetched only when asked for. */
  vectors: Record<number, VectorField>;
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
  /**
   * Linear or logarithmic colour scale. PS 26067 names both.
   *
   * One curve, applied to the shader and the colourbar together - see `transfer.ts`. It resets
   * to linear on every Field switch, because it is only offered where the Field's range never
   * goes below zero and carrying it onto a diverging Field would move the palette's midpoint off
   * "no departure".
   */
  scale: Scale;
  opacity: number;

  /**
   * How the Currents Field draws its direction: as moving dots, or as arrows.
   *
   * Two styles of one layer, not two layers - both read the same float32 (u, v) Grid, sit on the
   * same depth the Current arrows group already chooses, and colour themselves through the same
   * palette and the same `transfer` curve. Nothing else in the app changes.
   *
   * Dots are the default because a viewer who has never read a vector plot reads them anyway,
   * which is the audience PS 26067 names in its own words. Arrows stay one click away because
   * they are the literal thing the problem statement asks for and because a still picture - a
   * screenshot, a slide, a printed page - needs a mark that does not depend on time.
   */
  currentStyle: "particles" | "arrows";

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
   * Which groups of the control panel are open. **Independently** - opening one leaves the
   * others exactly as they were, and clicking an open one closes it.
   *
   * The panel is 1089 px of controls and a 1366x768 laptop can show 616 px of it, so 43% sat
   * below the fold with nothing on screen saying so - including the Isosurface, which PS 26067
   * names by hand. A scroll cue alone only tells a reader that something is missing; collapsing
   * the groups puts every group's *name* on screen at once, which is what makes a control
   * discoverable.
   *
   * This was briefly an accordion, one group open at a time. That was the wrong fix for the
   * height: a reader comparing the Colourbar against the Depth slice could not hold both open,
   * and no group could be closed without opening another. **The tab strip is what solved the
   * fold** - the Variable group went from about 640 px to about 190 px - so the accordion was
   * paying a real cost for height it had already stopped buying. Measured after the revert on
   * a 1366x768 laptop, where the panel starts 74 px down and so has 694 px: all groups closed
   * 264 px, Variable alone 383 px, Variable and Colourbar together 578 px, and those two plus
   * the Depth slice 675 px. Every reasonable working set fits. All nine open is 1068 px and
   * scrolls, which is the right thing for a state nobody works in.
   *
   * A group is open when its entry is `=== true`, never when it is absent. Every closed group
   * carries its readout, so the value of a control you are not touching is still on screen.
   */
  openGroups: Record<string, boolean>;
  toggleGroup: (key: string) => void;

  /**
   * Which Field Group's buttons the Variable selector is showing.
   *
   * Fourteen buttons in a two-column grid under five sub-headings is 640 px on its own, and the
   * height changed every time the reader switched group. Five short words fit one row of tabs,
   * so the selector shows 1 to 5 buttons instead of 14 and stops changing height. It follows
   * the selected Field, so arriving by deep link or by the tour lands on the right tab.
   */
  fieldGroupTab: string;

  /**
   * Cyclone mode: the five Hazard Fields, and nothing else.
   *
   * Hazard was the fourth of five tabs and "Set up a cyclone question" was a button inside the
   * Variable group - which meant it rendered under Ocean state, under Circulation and under
   * Change, where it means nothing. It was never a Field control: it changes the Field, the
   * Timestep, the render hints and the anomaly rings in one press, and a control that changes
   * four things should not sit among controls that change one.
   *
   * So it becomes a mode. Off, the selector offers the four general groups. On, it offers the
   * five Fields a cyclone forecaster asks for and the scene is already arranged for them. The
   * tab strip drops to four, which is also what stops the labels colliding.
   */
  hazardMode: boolean;
  setHazardMode: (on: boolean) => void;
  /** The Field to come back to when cyclone mode is switched off. */
  fieldBeforeHazard: string | null;

  theme: Theme;

  stage: Stage;
  morph: number;
  selectedFloatId: string | null;
  showFloats: boolean;
  showTracks: boolean;
  showAnomalies: boolean;
  /**
   * The current under the cursor, when the Currents Field is on screen in the Volume View.
   *
   * The measurement the rendered overlay this replaced could not produce. Read from the float32
   * vector file - the Grid - and not from a Volume. ADR 0013.
   */
  hoverCurrent: {
    speed: number;
    /** Where the water is going, clockwise from north. */
    heading: number;
    lon: number;
    lat: number;
    metres: number;
  } | null;
  /**
   * Which step of the guided tour is open, or null.
   *
   * The guide panel explains whatever you touched, which is right for a forecaster and useless
   * for the audience PS 26067 names by hand - schools, exhibitions, policymakers. A first-time
   * visitor does not know what to touch. Any control ending the tour is deliberate: see Tour.tsx.
   */
  tourStep: number | null;
  /**
   * The second door: the platform as a list of questions rather than a panel of controls.
   *
   * PS 26067 names three audiences the console does not serve - school and college students, the
   * general public at awareness campaigns, and policymakers - and three channels: outreach
   * events, exhibitions and e-learning. Fifteen variables in five groups is the right toolkit
   * for a forecaster and the wrong first minute for any of those three. `explore.ts` holds the
   * questions; nothing behind them is a new capability.
   */
  explore: boolean;
  /**
   * Exhibition mode: no panels, big type, the questions on a loop, and a reset when nobody is
   * standing there.
   *
   * "INCOIS can use the platform for ... exhibitions" is a clause with a real requirement behind
   * it: a screen with nobody at it all day. Without this the first visitor drags a slider and
   * every visitor after them sees a broken view. Entered with `?kiosk=1` and left with Escape,
   * so it cannot be reached by accident and cannot trap anyone.
   */
  kiosk: boolean;
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
  /**
   * Colour every instrument by how far the model sat from it, rather than by "is it selected".
   *
   * A mode on the markers, not a Field: the water underneath is still whatever Variable is
   * selected, and the dots on top stop saying "here is an instrument" and start saying "here is
   * how wrong the analysis was here". It is the project's thesis as a picture - see
   * `pipeline/samudra/residuals.py` for what is being coloured.
   */
  biasMode: boolean;

  /**
   * Drift: where a thing dropped in the water would go, according to the analysed current alone.
   *
   * `driftPin` is where the reader dropped it, `driftDays` how far forward to integrate, and
   * `placingDriftPin` is whether the next click on the water places one rather than selecting an
   * instrument. The trajectory itself is not stored: it is integrated in `drift.ts` from the
   * current files already loaded, and recomputing it is cheaper than keeping it in step.
   *
   * The caveat this ships with is not optional. A real search-and-rescue product needs surface
   * wind, Stokes drift and object-specific leeway and this carries none of them - which is why
   * INCOIS run SARAT and this is not SARAT. See `drift.ts`.
   */
  driftPin: { lon: number; lat: number } | null;
  driftDays: number;
  placingDriftPin: boolean;
  /** Draw the selected Float's predicted track beside the one it actually took. */
  showDriftCheck: boolean;

  set: <K extends keyof State>(key: K, value: State[K]) => void;
  /** One click that sets the scene up for a cyclone question. See the implementation. */
  hazardPreset: () => void;
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
   * that does not exist. Measured across the twelve steps the drawn count runs 192 to 220, so
   * `manifest.floatCount` - 237 - overstates the opening card by up to 45.
   *
   * Ordered by longitude so that stepping through them with the keyboard walks the region
   * left to right, which is the order a viewer reads the map in.
   */
  reportingFloats: () => OceanFloat[];
  reportingCount: () => number;
  /** Reporting instruments split by kind, so a sentence can name what each one is. */
  reportingByKind: () => { floats: number; moorings: number };
  /** The Fields of one group, in manifest order. Empty when nothing is in it. */
  fieldsInGroup: (group: string) => FieldSpec[];
  /**
   * The bias figures for the Field on screen, or null where that Field has no comparison.
   *
   * Only the three collocated Fields have one: a Float measures temperature and salinity and
   * both of density's ingredients, and it measures nothing that could be held against Cyclone
   * Heat Potential or Observation Coverage. Returning null rather than falling back to
   * temperature is deliberate - a temperature number under a salinity heading is the exact
   * class of mistake `describePalette` exists to prevent.
   */
  fieldResiduals: () => FieldResiduals | null;
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
  residuals: null,
  bakedDrift: null,
  upload: null,
  uploadProblem: null,
  uploadBusy: false,
  uploadSteps: [],
  sectionFrom: null,
  sectionTo: null,
  placingSection: 0,
  // 150 km is a little over one grid cell. Wider and the section shows casts from water it does
  // not cross; narrower and a section across the Bay of Bengal has nothing on it.
  sectionCorridorKm: 150,
  nativeGrids: {},
  surfaces: {},
  vectors: {},
  coastlines: [],
  loadError: null,
  notice: null,

  fieldKey: "temperature",
  timestepIndex: 0,
  playing: false,

  windowMin: 0,
  windowMax: 1,
  scale: "linear",
  opacity: DEFAULT_OPACITY,
  currentStyle: "particles",

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

  // Variable open, everything else closed. The map is complete - `surfaceLevel` used to be
  // missing, which meant its entry was `undefined` and only worked because `=== true` treats
  // absent as closed. An entry per group is what makes that test read a real boolean.
  openGroups: {
    field: true,
    palette: false,
    depthSlice: false,
    surfaceLevel: false,
    rendering: false,
    isosurface: false,
    currents: false,
    instruments: false,
    bias: false,
    drift: false,
    section: false,
    upload: false,
    anomalyFeatures: false,
  },
  // Independent: this group flips and every other keeps whatever it had. Spreading the previous
  // map rather than replacing it is the whole difference from the accordion, and it is also what
  // keeps the map complete so `=== true` reads a real boolean for every group.
  toggleGroup: (key) =>
    setState((s) => ({
      openGroups: { ...s.openGroups, [key]: !s.openGroups[key] },
    })),

  fieldGroupTab: "state",
  hazardMode: false,
  fieldBeforeHazard: null,

  theme: storedTheme(),

  stage: "globe",
  morph: 0,
  selectedFloatId: null,
  showFloats: true,
  showTracks: true,
  showAnomalies: true,
  hoverCurrent: null,
  tourStep: null,
  explore: false,
  kiosk: false,
  selectedAnomaly: null,
  isolateAnomaly: false,
  biasMode: false,

  driftPin: null,
  // Ten days is one Argo cycle, which is the span the drift check is scored over and therefore
  // the only span this platform can say anything measured about.
  driftDays: 10,
  placingDriftPin: false,
  showDriftCheck: true,

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
      // The tab follows the Field. A deep link from the requirements page, the guided tour and
      // the hazard preset all select a Field directly, and any of them landing on the tab the
      // reader last clicked would leave the selected button off screen.
      fieldGroupTab: spec.group ?? getState().fieldGroupTab,
      // And the mode follows the Field too, which makes it an invariant rather than a flag two
      // places have to remember to set. The tour selects Temperature directly; without this, a
      // reader who started the tour from inside cyclone mode got the hazard buttons with none of
      // them lit. Same for a deep link to any Field, and for the preset on the way in.
      hazardMode: spec.group === "hazard",
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
      // Same rule, applied to the scale: a log curve is meaningless on a Field that runs through
      // zero, so it goes back to linear rather than being carried onto one.
      scale: supportsLog(spec) ? getState().scale : "linear",
      // And again, applied to the isosurface. A Field that declares `isosurface: false` hides
      // the control, and for a while that was all it did: the flag stayed on and the shader
      // kept drawing slabs and columns through Observation Coverage, INCOIS Cast Count and
      // Current Speed with nothing on screen to turn them off. Same leak as the render hints
      // above, same fix. A Field that allows one keeps whatever the user last chose.
      isoEnabled: spec.isosurface === false ? false : getState().isoEnabled,
      // Where a departure contour is allowed to start.
      //
      // The slider's raw value is a fraction of the Field's own range, and on the temperature
      // anomaly the old default of 0.55 worked out at 0.27 degC - below the 0.5 degC this
      // platform's own detector demands before it will call a body an anomaly at all. So the
      // default surface enclosed water the platform refuses to call a departure, which is the
      // whole of the thermocline breathing, and it drew as a block full of blobs. On a diverging
      // Field the contour now starts at the detector's own threshold.
      isoValue: isoFloorFor(spec, getState()),
      // An uploaded surface field lives in slab 0 and nowhere else, so the Depth slice decides
      // whether it exists. Selecting one opens the slice back to the top rather than leaving a
      // Field in the selector that draws nothing and says nothing about why.
      ...(spec.surfaceOnly ? { depthFrom: 0 } : {}),
      // The Current arrows group carries one thing - the live speed under the cursor - and it is
      // the only number on the panel a reader cannot get anywhere else, so selecting Currents
      // opens it. A **merge**, not a replacement: replacing the map would close every other
      // group, which is exactly the accordion behaviour that was removed.
      openGroups:
        spec.render === "vector"
          ? { ...getState().openGroups, currents: true }
          : getState().openGroups,
      // An Anomaly Feature belongs to one Field. Isolation clipping the water to its box makes
      // no sense once a different Field is on screen.
      selectedAnomaly: null,
      isolateAnomaly: false,
      // A section line is geographic, so it deliberately survives a switch between the three
      // Fields that ship a Grid - cutting the same line through temperature and then salinity
      // is a real thing to want, and the panel heading names the Field it is showing. It cannot
      // survive onto a Field with no Grid at all: the control that would remove it is hidden on
      // those Fields, so the figure was left floating on screen, saying "switch to one of
      // those" with nothing on the panel to switch with.
      ...(getState().manifest?.gridFiles?.[key]
        ? {}
        : { sectionFrom: null, sectionTo: null, placingSection: 0 }),
    });
  },

  acceptUpload: (file) => {
    const state = getState();
    const manifest = state.manifest;
    if (!manifest) return;

    const mapping = timestepMapping(file, manifest.timesteps);
    // Any previous upload's Fields go first, so dropping a second file replaces the first
    // rather than leaving a Variable selector full of files nobody has open any more.
    const fields = manifest.fields.filter((f) => f.group !== UPLOAD_GROUP);
    const volumeFiles: Record<string, string[]> = {};
    for (const [key, paths] of Object.entries(manifest.volumeFiles)) {
      if (fields.some((f) => f.key === key)) volumeFiles[key] = paths;
    }

    for (const spec of file.fields) {
      fields.push({ ...spec, group: UPLOAD_GROUP });
      volumeFiles[spec.key] = mapping.map((index) =>
        uploadedVolumeUrl(file.token, spec.key, index),
      );
    }

    const groups = (manifest.fieldGroups ?? []).filter((g) => g.key !== UPLOAD_GROUP);
    groups.push({ key: UPLOAD_GROUP, label: "Yours" });

    setState({
      manifest: { ...manifest, fields, volumeFiles, fieldGroups: groups },
      upload: file,
      uploadProblem: null,
      uploadBusy: false,
      uploadSteps: mapping,
    });
    const first = file.fields[0];
    if (first) getState().selectField(first.key);
  },

  clearUpload: () => {
    const state = getState();
    const manifest = state.manifest;
    if (state.upload) void forgetUpload(state.upload.token);
    if (manifest) {
      const fields = manifest.fields.filter((f) => f.group !== UPLOAD_GROUP);
      const volumeFiles: Record<string, string[]> = {};
      for (const [key, paths] of Object.entries(manifest.volumeFiles)) {
        if (fields.some((f) => f.key === key)) volumeFiles[key] = paths;
      }
      setState({
        manifest: {
          ...manifest,
          fields,
          volumeFiles,
          fieldGroups: (manifest.fieldGroups ?? []).filter((g) => g.key !== UPLOAD_GROUP),
        },
      });
      // Back to a Field that still exists. Leaving the selection on a Field that has just been
      // removed leaves the shader drawing the last texture under no name at all.
      if (state.manifest?.fields.some((f) => f.key === state.fieldKey && f.group === UPLOAD_GROUP)) {
        getState().selectField(fields[0]?.key ?? "temperature");
      }
    }
    setState({ upload: null, uploadProblem: null, uploadBusy: false, uploadSteps: [] });
  },

  /**
   * Enter or leave cyclone mode.
   *
   * Entering runs the same preset it always did and remembers where the reader was. Leaving puts
   * them back on the Field they had, so the mode is a detour rather than a one-way door.
   */
  setHazardMode: (on) => {
    const state = getState();
    if (on === state.hazardMode) return;
    if (on) {
      const before = state.fieldKey;
      state.hazardPreset();
      setState({ hazardMode: true, fieldBeforeHazard: before, touched: "hazardPreset" });
      return;
    }
    const back = state.fieldBeforeHazard;
    const exists = state.manifest?.fields.some((f) => f.key === back);
    state.selectField(exists && back ? back : "temperature");
    setState({ hazardMode: false, fieldBeforeHazard: null });
  },

  /**
   * Set the scene up for a cyclone question, in one click.
   *
   * Thirteen Fields and eleven controls is the right toolkit for a forecaster and the wrong
   * first minute for everyone else. This is the shape of the question the September 2026 problem
   * statement is about: how much heat is in the water, over the whole column, at the most recent
   * analysis - and it puts the Field, the depth slice and the render hints in the one
   * configuration where that reads immediately.
   */
  hazardPreset: () => {
    const state = getState();
    const steps = state.manifest?.timesteps.length ?? 1;
    state.selectField("heat_potential");
    setState({
      timestepIndex: steps - 1,
      playing: false,
      showAnomalies: false,
      touched: "hazardPreset",
      tourStep: null,
    });
    // Deliberately does NOT touch `volumeEnabled`. The scene already hides the Volume mesh for a
    // Field that has none, so turning it off here would achieve nothing on this Field and would
    // leave it off when the user switched back to Temperature - a control they had not touched,
    // silently in the wrong position.
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

  fieldsInGroup: (group) =>
    (getState().manifest?.fields ?? []).filter((f) => (f.group ?? "state") === group),

  fieldResiduals: () => getState().residuals?.fields[getState().fieldKey] ?? null,

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
