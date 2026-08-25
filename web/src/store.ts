import { create } from "zustand";
import type { Collocation, FieldSpec, Manifest, OceanFloat } from "./types";

export type Stage = "globe" | "diving" | "volume";
export type Theme = "dark" | "light";

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

  theme: Theme;

  stage: Stage;
  morph: number;
  selectedFloatId: string | null;
  showFloats: boolean;
  showTracks: boolean;

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
  /** Turn a window fraction back into the physical value a user should read. */
  toValue: (fraction: number) => number;
  fromValue: (value: number) => number;
}

export const useStore = create<State>((setState, getState) => ({
  manifest: null,
  floats: [],
  collocations: {},
  coastlines: [],
  loadError: null,
  notice: null,

  fieldKey: "temperature",
  timestepIndex: 0,
  playing: false,

  windowMin: 0,
  windowMax: 1,
  opacity: 0.05,

  depthFrom: 0,
  depthTo: 1,
  surfaceLevel: 0,

  isoEnabled: false,
  isoValue: 0.55,
  volumeEnabled: true,
  emphasis: 0.85,

  exaggeration: 1800,
  quality: 128,

  touched: null,

  theme: storedTheme(),

  stage: "globe",
  morph: 0,
  selectedFloatId: null,
  showFloats: true,
  showTracks: true,

  set: (key, value) => setState({ [key]: value } as never),

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
      ...(spec.emphasis != null ? { emphasis: spec.emphasis } : {}),
      ...(spec.opacity != null ? { opacity: spec.opacity } : {}),
    });
  },

  field: () => getState().manifest?.fields.find((f) => f.key === getState().fieldKey),

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
