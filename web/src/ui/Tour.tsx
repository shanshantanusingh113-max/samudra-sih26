import { useEffect } from "react";
import { GUIDE } from "../guide";
import { useStore } from "../store";

/**
 * A guided path through **every** control on the platform.
 *
 * The guide panel is the best thing in this console and it is entirely *reactive*: it explains
 * whatever you touched. That is exactly right for a forecaster who knows what they are looking
 * for, and useless for the audience PS 26067 names in its own words - schools, exhibitions,
 * policymakers, e-learning. A first-time visitor does not know what to touch.
 *
 * It used to be five steps. Five is a demo, not a tour: it showed the thesis and left 38 of the
 * 43 explained controls undiscovered, including the ones a teammate presenting this has to be
 * able to find. So it is now **chapters** - six of them - and every step does three things at
 * once:
 *
 *   1. **Drives the scene**, so the control is doing something visible.
 *   2. **Opens the group it lives in**, so you can see where it is on the left.
 *   3. **Opens its guide entry**, so the panel on the right carries the full explanation while
 *      the card at the bottom carries the one-line reason to care.
 *
 * The third is what keeps this honest and short at the same time: nothing is explained twice.
 * The tour says *why you would go here*; `guide.ts` says what the control does, in the same
 * words it would use if you had found it yourself.
 *
 * **Every entry in `GUIDE` is named by some step's `covers`, and `probe-tour.mjs` fails if one
 * is not.** That is what makes "it covers every control" a measurement rather than a claim -
 * add a control tomorrow, give it a guide entry as the rules require, and the probe tells you
 * the tour has stopped being complete.
 *
 * Two rules it keeps from the five-step version.
 *
 * **It never fights the user.** Touching any control ends the tour, because a panel that keeps
 * moving the camera while somebody is trying to drag a slider is worse than no tour at all.
 * That is enforced in `store.set`, which is why every step here drives `setState` directly.
 *
 * **It never says anything the guide panel would not.** If a caption here ever disagrees with
 * `GUIDE`, `GUIDE` is right.
 */

export interface TourStep {
  /** Which chapter this step belongs to. Consecutive steps share one. */
  chapter: string;
  title: string;
  body: string;
  /**
   * The `GUIDE` keys this step puts on screen and explains.
   *
   * Not decoration: `probe-tour.mjs` reads these and fails if any entry in `GUIDE` is missing
   * from the union of them. A control nobody can find is a control that does not exist.
   */
  covers: string[];
  /** Applied when the step opens. Runs against the store, never against the scene directly. */
  enter: () => void;
}

const store = useStore;

/** Open one or more control groups without closing anything the user had open. */
function open(...groups: string[]): void {
  const previous = store.getState().openGroups;
  const next = { ...previous };
  for (const group of groups) next[group] = true;
  store.setState({ openGroups: next });
}

/**
 * The state every step starts from, so no step inherits a panel the last one opened.
 *
 * Without this the tour accumulates: by the end the left panel is fully expanded, the guide is
 * explaining something from four steps ago, and a float from chapter five is still selected
 * behind the water.
 */
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
    playing: false,
    touched: null,
  });
}

export function buildTour(dive: (into: boolean) => void): TourStep[] {
  const inVolume = () => store.getState().morph > 0.5;
  const steps = () => store.getState().manifest?.timesteps.length ?? 1;

  return [
    // ---- 1. The ocean, from above ------------------------------------------------------
    {
      chapter: "The ocean, from above",
      title: "India's ocean, on a globe",
      body:
        "The colour on the sea is INCOIS's own analysis at 75 metres - the depth where this" +
        " ocean has the most structure. Sea surface level moves that depth, and everything you" +
        " are about to see is the same data seen a different way.",
      covers: ["surfaceLevel", "temperature"],
      enter: () => {
        calm();
        store.getState().selectField("temperature");
        store.setState({ touched: "surfaceLevel" });
        open("field", "surfaceLevel");
        if (inVolume()) dive(false);
      },
    },
    {
      chapter: "The ocean, from above",
      title: "The instruments that were there",
      body:
        "Dots are robot floats that were in this water on the date shown. Squares are buoys" +
        " anchored to the sea floor. The lines behind them are where each float has drifted" +
        " since April - measured positions, not a model.",
      covers: ["instruments", "floats", "moorings", "tracks", "chlorophyll"],
      enter: () => {
        calm();
        store.setState({
          showFloats: true,
          showTracks: true,
          showAnomalies: false,
          touched: "instruments",
        });
        open("instruments");
      },
    },
    {
      chapter: "The ocean, from above",
      title: "Four months, ten days at a time",
      body:
        "Twelve analyses run from April to July 2026. Press play and the water, the floats and" +
        " everything derived from them move together. Nothing on screen is ever a blend of two" +
        " dates.",
      covers: ["timestep"],
      enter: () => {
        calm();
        store.setState({ timestepIndex: 0, playing: true, touched: "timestep" });
      },
    },

    // ---- 2. Inside the water -----------------------------------------------------------
    {
      chapter: "Inside the water",
      title: "Now go under it",
      body:
        "The globe unrolls and the sea opens into a block you are looking inside, from 5 metres" +
        " down to 2000. The orange band part way down is the thermocline - the boundary between" +
        " the warm surface and the cold deep, and the most important structure in the picture.",
      covers: ["exaggeration"],
      enter: () => {
        calm();
        store.setState({ playing: false, timestepIndex: steps() - 1, touched: "exaggeration" });
        open("rendering");
        if (!inVolume()) dive(true);
      },
    },
    {
      chapter: "Inside the water",
      title: "Cut the block to a layer",
      body:
        "The depth slice hides everything outside a band, so you can look at one layer of the" +
        " ocean on its own. Drag it down and the warm lid comes off.",
      covers: ["depthSlice"],
      enter: () => {
        calm();
        store.setState({ depthFrom: 0.18, depthTo: 0.62, touched: "depthSlice" });
        open("depthSlice");
      },
    },
    {
      chapter: "Inside the water",
      title: "What the colours mean, and which water is drawn",
      body:
        "The colourbar is the legend and a control at once. Narrowing its range does not just" +
        " recolour: water outside the range stops being drawn, so you can isolate one body of" +
        " water. The log scale bends the colours where a linear one wastes them.",
      covers: ["palette", "window", "scale"],
      enter: () => {
        calm();
        store.getState().selectField("temperature");
        store.setState({ windowMin: 0.55, windowMax: 0.8, touched: "window" });
        open("palette");
      },
    },
    {
      chapter: "Inside the water",
      title: "How solid the water looks",
      body:
        "Rendering changes only the picture, never the numbers. Opacity is how much water you" +
        " see through, feature emphasis makes still water vanish so the thermocline stands out," +
        " ray steps trade smoothness for speed, and the water can be turned off entirely.",
      covers: ["rendering", "opacity", "emphasis", "quality", "volumeEnabled"],
      enter: () => {
        calm();
        store.setState({ windowMin: 0, windowMax: 1, volumeEnabled: true, touched: "emphasis" });
        open("rendering");
      },
    },
    {
      chapter: "Inside the water",
      title: "A surface of one value",
      body:
        "An isosurface is every point in the block at one temperature, drawn as a solid skin -" +
        " here the 20 °C line, the conventional marker for the thermocline. Watch it dome up" +
        " and collapse across the season.",
      covers: ["isosurface"],
      enter: () => {
        calm();
        store.getState().selectField("temperature");
        store.setState({
          isoEnabled: true,
          isoValue: 0.62,
          volumeEnabled: false,
          touched: "isosurface",
        });
        open("isosurface");
      },
    },

    // ---- 3. Every variable -------------------------------------------------------------
    {
      chapter: "Every variable",
      title: "Fifteen variables, in five groups",
      body:
        "Ocean state is what INCOIS publish plus what can be worked out exactly from it -" +
        " density here is computed from temperature and salinity, not downloaded. Salinity is" +
        " why the Bay of Bengal is warmer than the Arabian Sea and still lighter.",
      covers: ["field", "salinity", "density"],
      enter: () => {
        calm();
        store.setState({ isoEnabled: false, volumeEnabled: true });
        store.getState().selectField("density");
        store.setState({ touched: "field" });
        open("field");
      },
    },
    {
      chapter: "Every variable",
      title: "Where the water is moving",
      body:
        "Currents are a variable with a real speed under the cursor, drawn either as moving dots" +
        " carried by the flow or as arrows. Both sit at the depth you have sliced to, and both" +
        " read the same file the drift model runs on.",
      covers: ["current_speed", "currents", "currentStyle"],
      enter: () => {
        calm();
        store.getState().selectField("current_speed");
        store.setState({ currentStyle: "particles", touched: "currentStyle" });
        open("currents");
      },
    },
    {
      chapter: "Every variable",
      title: "How much of this was actually measured",
      body:
        "Now the model disappears and the evidence takes its place. Observation coverage counts" +
        " the float casts near each point; beside it sit INCOIS's own cast count and their own" +
        " error estimate, so our method can be checked against the provider's.",
      covers: ["coverage", "incois_casts", "incois_rmse", "analysis_spread"],
      enter: () => {
        calm();
        store.getState().selectField("coverage");
        store.setState({ touched: "coverage" });
        open("field");
      },
    },
    {
      chapter: "Every variable",
      title: "What changed, and against what",
      body:
        "Two different questions. Temperature anomaly is departure from this bake's own four" +
        " months - a seasonal swing. Temperature vs normal is departure from NOAA's 1991-2020" +
        " average for the same month, which is the climate one.",
      covers: ["temperature_anomaly", "temperature_normal_anomaly"],
      enter: () => {
        calm();
        store.getState().selectField("temperature_normal_anomaly");
        store.setState({ touched: "temperature_normal_anomaly" });
        open("field");
      },
    },
    {
      chapter: "Every variable",
      title: "Every departure gets a ring",
      body:
        "A blob of colour says water departed and nothing about where it starts or how deep it" +
        " runs. Click a ring and the panel says where it is, how unusual, why it is there, and" +
        " how many instruments checked it - then isolate it and look at the body on its own.",
      covers: ["anomalyFeatures", "isolateAnomaly"],
      enter: () => {
        calm();
        store.getState().selectField("temperature_anomaly");
        store.setState({ showAnomalies: true, touched: null });
        open("anomalyFeatures");
        // The features belong to the Timestep, so pick after the Field has switched.
        setTimeout(() => {
          const state = store.getState();
          if (state.tourStep !== null && state.features().length > 0) {
            store.setState({ selectedAnomaly: 0 });
          }
        }, 350);
      },
    },

    // ---- 4. Cyclone mode ---------------------------------------------------------------
    {
      chapter: "Cyclone mode",
      title: "One press sets up a cyclone question",
      body:
        "This is not a variable button. It changes the variable, the date, the way the water is" +
        " drawn and the rings, all at once, and swaps the list for the five things a cyclone" +
        " forecaster asks for. A cyclone runs on stored heat, not on surface warmth.",
      covers: ["hazardPreset", "heat_potential"],
      enter: () => {
        calm();
        // This ends the tour by design when a user presses it - the effect below puts it back.
        store.getState().hazardPreset();
        open("field");
      },
    },
    {
      chapter: "Cyclone mode",
      title: "Four more, and three of them are a depth",
      body:
        "The 26 °C isotherm, the mixed layer and the isothermal layer are depths, so they are" +
        " drawn as a sheet hanging inside the block at the depth they report. The barrier layer" +
        " is the gap between two of them, and it is what keeps a storm's own stirring from" +
        " cooling the water under it.",
      covers: ["d26", "mixed_layer_depth", "isothermal_layer_depth", "barrier_layer"],
      enter: () => {
        calm();
        store.getState().selectField("d26");
        store.setState({ touched: "d26" });
        open("field");
      },
    },

    // ---- 5. Model against instruments --------------------------------------------------
    {
      chapter: "Model against instruments",
      title: "What the model said, against what was measured",
      body:
        "This is the comparison that does not exist in any other tool. One line is what the" +
        " float measured on its way up; the other is what INCOIS predicted at that exact spot" +
        " and date. The shaded gap is the disagreement, and the number under it sizes it.",
      covers: [],
      enter: () => {
        calm();
        store.setState({ hazardMode: false });
        store.getState().selectField("temperature");
        // The largest disagreement, because a tour that opened on a perfect match would be
        // showing the least informative case it has.
        const state = store.getState();
        let worst: string | null = null;
        let worstRms = -1;
        for (const [id, entry] of Object.entries(state.collocations)) {
          const rms = entry.fields?.temperature?.rmsResidual;
          const matched = entry.fields?.temperature?.matched ?? 0;
          if (rms != null && matched > 40 && rms > worstRms) {
            worstRms = rms;
            worst = id;
          }
        }
        store.setState({ selectedFloatId: worst, touched: null });
      },
    },
    {
      chapter: "Model against instruments",
      title: "Every instrument at once",
      body:
        "The bias map stops the dots meaning 'here is an instrument' and starts them meaning" +
        " 'here is how wrong the analysis was here'. The key changes with them, because a" +
        " marker whose meaning moved under an unchanged legend is the worst thing on a display.",
      covers: ["bias"],
      enter: () => {
        calm();
        store.setState({ biasMode: true, touched: "bias" });
        open("bias");
      },
    },
    {
      chapter: "Model against instruments",
      title: "Cut a section through the water",
      body:
        "Draw a line on the map and the platform cuts the model open along it, from the surface" +
        " to 2000 metres, with every float cast within 150 km of the line drawn on top. This is" +
        " the figure an oceanographer recognises before reading the label.",
      covers: ["section"],
      enter: () => {
        calm();
        store.setState({
          sectionFrom: { lon: 80, lat: 5 },
          sectionTo: { lon: 90, lat: 20 },
          placingSection: 0,
          touched: "section",
        });
        open("section");
      },
    },
    {
      chapter: "Model against instruments",
      title: "Where would something adrift go",
      body:
        "Drop a pin and the analysed current carries it forward. What makes it worth having is" +
        " the second half: the same integrator was run from 195 real floats' own positions, and" +
        " the error published. It is not a search-and-rescue product, and the panel says so.",
      covers: ["drift"],
      enter: () => {
        calm();
        store.setState({
          driftPin: { lon: 51.5, lat: 9.5 },
          driftDays: 10,
          touched: "drift",
        });
        open("drift");
      },
    },

    // ---- 6. Yours to drive -------------------------------------------------------------
    {
      chapter: "Yours to drive",
      title: "Bring your own file",
      body:
        "Drop a CF-conventions NetCDF file on the panel and its variables appear in the list" +
        " under a tab of their own, going through the same colourbar, depth slice, isosurface" +
        " and renderer as everything else. A file it cannot read is refused by name.",
      covers: ["upload"],
      enter: () => {
        calm();
        store.setState({ touched: "upload" });
        open("upload");
      },
    },
    {
      chapter: "Yours to drive",
      title: "That is the whole console",
      body:
        "Every control has an explanation on the right the moment you touch it. Copy this view" +
        " puts whatever is on screen into a link you can send to somebody. Explore is the same" +
        " platform with the questions asked for you.",
      covers: [],
      enter: () => {
        calm();
        store.setState({ touched: null });
      },
    },
  ];
}

export function Tour({ onDive }: { onDive: (into: boolean) => void }) {
  const { tourStep, manifest, set } = useStore();
  const steps = buildTour(onDive);
  const step = tourStep === null ? undefined : steps[tourStep];

  // Apply the step when it opens, not on every render.
  useEffect(() => {
    if (tourStep === null) return;
    steps[tourStep]?.enter();
    // Some store actions end the tour on purpose - `hazardPreset` is one - because a user
    // pressing them means "stop showing me things". A step that presses one on the user's
    // behalf has to put the tour back, and this is the one place that knows the difference.
    if (useStore.getState().tourStep !== tourStep) useStore.setState({ tourStep });
    // `steps` is rebuilt each render and `enter` closes over the store, so the index is the
    // only real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourStep]);

  if (!manifest || tourStep === null || !step) return null;

  const last = tourStep === steps.length - 1;
  const chapters = [...new Set(steps.map((s) => s.chapter))];
  const chapter = chapters.indexOf(step.chapter) + 1;

  return (
    <aside className="tour" role="dialog" aria-label="Guided tour">
      <div className="tour-head">
        <span className="tour-count">
          {chapter}/{chapters.length} &middot; {step.chapter}
        </span>
        <button className="ghost" onClick={() => set("tourStep", null)} aria-label="End the tour">
          ✕
        </button>
      </div>
      <h2 className="tour-title">{step.title}</h2>
      <p className="tour-body">{step.body}</p>
      {/*
        * A bar rather than a number.
        *
        * "14 of 21" on a tour somebody started out of curiosity reads as a commitment. The bar
        * says the same thing without asking anyone to do arithmetic, and the chapter name above
        * it is what actually tells a reader where they are.
        */}
      <div className="tour-progress" aria-hidden="true">
        <span style={{ width: `${((tourStep + 1) / steps.length) * 100}%` }} />
      </div>
      <div className="tour-actions">
        <button
          className="ghost"
          onClick={() => set("tourStep", Math.max(0, tourStep - 1))}
          disabled={tourStep === 0}
        >
          Back
        </button>
        <button
          className="primary"
          onClick={() => set("tourStep", last ? null : tourStep + 1)}
        >
          {last ? "Explore on your own" : "Next"}
        </button>
      </div>
    </aside>
  );
}

/**
 * Every `GUIDE` key the tour puts on screen.
 *
 * Exported for `probe-tour.mjs`, which asks whether that set covers `GUIDE` completely. Written
 * here rather than in the probe so the answer comes from the shipped module and not from a
 * second list somebody would forget to update - the same arrangement `probe-guide.mjs` uses.
 */
export function tourCoverage(): { covered: string[]; missing: string[] } {
  const covered = new Set<string>();
  for (const step of buildTour(() => {})) {
    for (const key of step.covers) covered.add(key);
  }
  return {
    covered: [...covered].sort(),
    missing: Object.keys(GUIDE).filter((key) => !covered.has(key)).sort(),
  };
}
