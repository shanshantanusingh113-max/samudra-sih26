import { create } from "zustand";
import type { Collocation, FieldSpec, Manifest, OceanFloat } from "./types";

export type Stage = "globe" | "diving" | "volume";

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
  paletteName: string;
  logScale: boolean;
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

  stage: Stage;
  morph: number;
  selectedFloatId: string | null;
  showFloats: boolean;
  showTracks: boolean;

  set: <K extends keyof State>(key: K, value: State[K]) => void;
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
  paletteName: "thermal",
  logScale: false,
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

  stage: "globe",
  morph: 0,
  selectedFloatId: null,
  showFloats: true,
  showTracks: true,

  set: (key, value) => setState({ [key]: value } as never),

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
