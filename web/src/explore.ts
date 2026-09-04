/**
 * The platform as a list of questions, for the people PS 26067 names and the console does not.
 *
 * > *"Beyond operational use, the platform will serve as a powerful science communication tool
 * > ... valuable for educating school and college students about ocean dynamics, engaging the
 * > general public during awareness campaigns, and supporting policymakers in understanding
 * > marine environmental conditions. INCOIS can use the platform for outreach events,
 * > exhibitions, and e-learning initiatives."*
 *
 * Three audiences and three channels, named in the problem statement's own words. Fifteen
 * variables in five groups is the right toolkit for a forecaster and the wrong first minute for
 * everybody else: it asks a visitor to know what an isosurface is before it will show them
 * anything. So the same platform gets a second door, and behind it are **questions** rather than
 * controls. Nothing here is a new capability. Every one of these is a thing a user could set up
 * themselves out of controls that already exist, done for them in one press - which is exactly
 * what `hazardPreset` already proved works.
 *
 * **Every question keeps its caveat.** "Where could a cyclone get stronger" is a map of
 * conditions and not a forecast, and a policymaker will not make that distinction unprompted. So
 * each one carries a `caution` that is shown with it rather than hidden behind it. Simplified
 * framing that drifts into being wrong is worse than no framing.
 *
 * These are also the entire content of kiosk mode, which plays them on a loop. See `Explore.tsx`.
 */

import { useStore } from "./store";

export interface Question {
  id: string;
  /** What a visitor would actually ask, in their words. */
  question: string;
  /** One line on why the answer is worth looking at. */
  why: string;
  /** The honest limit, shown beside the answer and never after it. */
  caution?: string;
  /** Whether the answer is inside the block or on the globe. */
  needsVolume: boolean;
  /** Set the whole scene up. Runs against the store; the camera is the caller's job. */
  run: (helpers: ExploreHelpers) => void;
}

export interface ExploreHelpers {
  /** Swing the camera onto a point. */
  focusOn: (lon: number, lat: number) => void;
  /** Re-centre without changing the distance. Right for a body of water, wrong for a point. */
  panTo: (lon: number, lat: number) => void;
}

const store = useStore;

/** Every question starts from the same clean scene, so none of them inherits the last one's. */
function calm(): void {
  store.setState({
    selectedFloatId: null,
    selectedAnomaly: null,
    isolateAnomaly: false,
    biasMode: false,
    driftPin: null,
    placingDriftPin: false,
    placingSection: 0,
    sectionFrom: null,
    sectionTo: null,
    showDriftCheck: false,
    playing: false,
    isoEnabled: false,
    volumeEnabled: true,
    windowMin: 0,
    windowMax: 1,
    depthFrom: 0,
    depthTo: 1,
    touched: null,
    tourStep: null,
  });
}

/** The last analysis in the bake. Most questions want the most recent picture. */
function lastStep(): number {
  return (store.getState().manifest?.timesteps.length ?? 1) - 1;
}

export const QUESTIONS: Question[] = [
  {
    id: "cyclone",
    question: "Where could a cyclone get stronger?",
    why:
      "A storm runs on the heat stored down the whole water column, not on a warm skin at the" +
      " surface. Deep red is where there is fuel.",
    caution: "A map of conditions, not a forecast. Nothing here predicts a storm.",
    needsVolume: true,
    run: () => {
      calm();
      store.getState().hazardPreset();
    },
  },
  {
    id: "guessing",
    question: "Where is the model guessing?",
    why:
      "A model has a value everywhere whether or not anyone measured. This counts the float" +
      " casts near each point, so grey is water no instrument went near.",
    caution: "Grey does not mean wrong. It means nothing checked it.",
    needsVolume: true,
    run: () => {
      calm();
      store.getState().selectField("coverage");
      store.setState({ timestepIndex: lastStep() });
    },
  },
  {
    id: "disagree",
    question: "How far is the model from the instruments?",
    why:
      "Every dot becomes how wrong the analysis was at that instrument. This is the whole point" +
      " of the platform in one picture.",
    caution:
      "INCOIS assimilate Argo, so a float largely shows the model agreeing with itself. The" +
      " nine moored buoys are the independent check, and they disagree far more.",
    needsVolume: true,
    run: () => {
      calm();
      store.getState().selectField("temperature");
      store.setState({ biasMode: true, timestepIndex: lastStep() });
    },
  },
  {
    id: "changed",
    question: "Has this ocean changed?",
    why:
      "How far the water sits from NOAA's 1991-2020 average for the same month. Red is warmer" +
      " than the thirty-year normal, and the strongest departures are not at the surface.",
    caution: "One season against a climatology. Four months is not a trend.",
    needsVolume: true,
    run: () => {
      calm();
      store.getState().selectField("temperature_normal_anomaly");
      store.setState({ timestepIndex: lastStep() });
    },
  },
  {
    id: "adrift",
    question: "Where would something adrift go?",
    why:
      "Dropped off the Somali coast and carried by the analysed current for ten days. The same" +
      " integrator was run from 195 real floats, so its error is published rather than assumed.",
    caution:
      "The current alone. A real search needs wind, waves and the object's own drift, which is" +
      " why INCOIS run SARAT and this is not SARAT.",
    needsVolume: true,
    run: ({ panTo }) => {
      calm();
      store.getState().selectField("current_speed");
      store.setState({
        currentStyle: "particles",
        driftPin: { lon: 51.5, lat: 9.5 },
        driftDays: 10,
        timestepIndex: lastStep(),
      });
      panTo(58, 8);
    },
  },
  {
    id: "twoseas",
    question: "Why are India's two seas so different?",
    why:
      "The Bay of Bengal is 0.8 °C warmer than the Arabian Sea and still 3.0 kg/m³ lighter," +
      " because the Ganges and Brahmaputra make it 3.6 PSU fresher. No temperature map shows it.",
    needsVolume: true,
    run: ({ panTo }) => {
      calm();
      store.getState().selectField("density");
      store.setState({ timestepIndex: lastStep() });
      panTo(75, 12);
    },
  },
  {
    id: "float",
    question: "What does one robot float actually do?",
    why:
      "About 4,000 of them are drifting worldwide. Each sinks to two kilometres, drifts for ten" +
      " days and rises measuring on the way up. This is one of them, and what it found.",
    needsVolume: true,
    run: ({ focusOn }) => {
      calm();
      store.getState().selectField("temperature");
      const state = store.getState();
      // The float compared over the most of its column, so the chart is a full profile rather
      // than a smudge in the top of a 2000 m axis - the same filter `capture.mjs` learned to use.
      let chosen: string | null = null;
      let best = -1;
      for (const [id, entry] of Object.entries(state.collocations)) {
        const matched = entry.fields?.temperature?.matched ?? 0;
        const drifting = state.floats.find((f) => f.id === id && f.kind !== "mooring");
        if (drifting && matched > best) {
          best = matched;
          chosen = id;
        }
      }
      store.setState({ selectedFloatId: chosen, showTracks: true, timestepIndex: lastStep() });
      const at = state.floats.find((f) => f.id === chosen);
      if (at) focusOn(at.latest.lon, at.latest.lat);
    },
  },
  {
    id: "truescale",
    question: "How deep is the ocean, really?",
    why:
      "The block you have been flying through is stretched 1800 times. This flattens it to true" +
      " scale and back: the region is about 4,000 times wider than it is deep.",
    needsVolume: true,
    run: () => {
      calm();
      store.getState().selectField("temperature");
      store.setState({ timestepIndex: lastStep() });
      trueScale();
    },
  },
];

/**
 * Flatten the block to true scale, hold, and come back.
 *
 * The single hardest thing to convey about the ocean is that it is a film. Every reader is told
 * "4,000 times wider than it is deep" and nobody feels it; watching the block they have been
 * flying inside collapse into a sheet is the whole lesson, and the control it drives already
 * exists. There is no new rendering here at all - it is the exaggeration slider, moved.
 *
 * Eased rather than linear, because a linear run from 1800 to 1 spends most of its time in the
 * last hundredth of the journey where nothing more is happening.
 */
export function trueScale(seconds = 9): void {
  const from = 1800;
  const settle = 1;
  const start = performance.now();
  store.setState({ exaggeration: from });

  const tick = () => {
    const t = Math.min((performance.now() - start) / (seconds * 1000), 1);
    // Down for the first half, back up for the second, with a hold in the middle.
    const phase = t < 0.42 ? t / 0.42 : t < 0.58 ? 1 : (1 - t) / 0.42;
    const eased = 1 - Math.pow(1 - Math.min(Math.max(phase, 0), 1), 3);
    store.setState({ exaggeration: from + (settle - from) * eased });
    if (t < 1) requestAnimationFrame(tick);
    else store.setState({ exaggeration: from });
  };
  requestAnimationFrame(tick);
}

/**
 * Depth landmarks for the ruler, in metres.
 *
 * "1000 m" means nothing to a school student or a policymaker. "As deep as a sperm whale hunts"
 * means something to both, and it is the same number. Shown on the exhibition screen only: the
 * console's ruler labels are 44 px wide and its reader wants the figure, not the story.
 *
 * Each depth here is one `depthTicks` actually produces, so every landmark lands on a real tick
 * rather than quietly never appearing. 40 m is the recreational diving limit and would have been
 * the better fact; there is no 40 m tick, so the 50 m one says "past a recreational diver"
 * instead. A landmark on a depth the ruler does not draw is a landmark nobody ever sees.
 *
 * They are short for a reason that is also measured: the label column is 240 px, and a landmark
 * that wraps to two lines runs into the tick below it. "the shelf edge, and the last of the
 * sunlight" did exactly that, over the 300 m figure.
 *
 * Every one of these is a fact about the world rather than about this dataset, which is why they
 * are here and not in the manifest.
 */
export const DEPTH_LANDMARKS: { metres: number; label: string }[] = [
  { metres: 5, label: "snorkelling" },
  { metres: 50, label: "past a recreational diver" },
  { metres: 200, label: "the edge of the shelf" },
  { metres: 1000, label: "a sperm whale hunting" },
  { metres: 2000, label: "where Argo floats park" },
];
