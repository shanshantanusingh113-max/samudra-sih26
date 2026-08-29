import { useEffect } from "react";
import { useStore } from "../store";

/**
 * A short guided path through the platform.
 *
 * The guide panel is the best thing in this console and it is entirely *reactive*: it explains
 * whatever you touched. That is exactly right for a forecaster who knows what they are looking
 * for, and useless for the audience PS 26067 names in its own words - schools, exhibitions,
 * policymakers, e-learning. A first-time visitor does not know what to touch, and the README
 * claimed that clause as Met on the strength of "it opens in a browser with no install", which
 * is necessary and nowhere near sufficient.
 *
 * So: five steps, each one a sentence and a store change. Nothing here is new science and
 * nothing is a new control - every step is something a user could have done themselves, done
 * for them once so they know it is there.
 *
 * Two rules it must obey.
 *
 * **It never fights the user.** Touching any control ends the tour, because a panel that keeps
 * moving the camera while somebody is trying to drag a slider is worse than no tour at all.
 *
 * **It never says anything the guide panel would not.** The captions here are the same claims,
 * shortened. If one of them ever disagrees with `GUIDE`, `GUIDE` is right.
 */

export interface TourStep {
  title: string;
  body: string;
  /** Applied when the step opens. Runs against the store, never against the scene directly. */
  enter: () => void;
}

/** Whether a step needs the Volume View, so the tour can dive before it runs. */
export const TOUR_LENGTH = 5;

export function buildTour(dive: (into: boolean) => void): TourStep[] {
  const store = useStore;

  return [
    {
      title: "India's ocean, from above",
      body:
        "The colour on the sea is INCOIS's own analysis at 75 metres - the depth where the" +
        " ocean has the most structure. The dots are robot floats that were in this water on" +
        " the date shown. Squares are buoys anchored to the sea floor.",
      enter: () => {
        store.setState({
          selectedFloatId: null,
          selectedAnomaly: null,
          touched: null,
          currentsOpacity: 0,
        });
        store.getState().selectField("temperature");
        if (store.getState().morph > 0.5) dive(false);
      },
    },
    {
      title: "Now go under it",
      body:
        "The globe unrolls and the sea opens into a block of water you are looking inside," +
        " from 5 metres down to 2000. The orange band part way down is the thermocline: the" +
        " boundary between the warm surface and the cold deep, and the single most important" +
        " structure in the picture.",
      enter: () => {
        store.setState({ selectedFloatId: null, selectedAnomaly: null, touched: null });
        if (store.getState().morph < 0.5) dive(true);
      },
    },
    {
      title: "What the model said, against what was measured",
      body:
        "This is the comparison that does not exist in any other tool. One line is what the" +
        " float measured on its way up; the other is what INCOIS predicted at that exact spot" +
        " and date. The shaded gap between them is the disagreement, and the number under it" +
        " says how big it is.",
      enter: () => {
        const state = store.getState();
        // The largest disagreement, because that is the interesting one and because a tour
        // that opened a perfect match would be showing the least informative case it has.
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
        store.setState({ selectedFloatId: worst, selectedAnomaly: null, touched: null });
      },
    },
    {
      title: "How much of this was actually measured",
      body:
        "Now the model disappears and the evidence takes its place: how many float casts were" +
        " taken near each point. Grey is water nobody measured, where the analysis is filling" +
        " in between distant instruments. Every model has a value everywhere; this says which" +
        " of those values anything stands behind.",
      enter: () => {
        store.setState({ selectedFloatId: null, selectedAnomaly: null, touched: null });
        store.getState().selectField("coverage");
      },
    },
    {
      title: "What departed, and whether to believe it",
      body:
        "Every body of water that departed from its own average gets a ring. Click one and the" +
        " panel says where it is, why it is there, what kind of water it is - and how many" +
        " instruments checked it. Three of the ones in this build have none at all.",
      enter: () => {
        store.setState({ selectedFloatId: null, touched: null });
        store.getState().selectField("temperature_anomaly");
        // The features belong to the Timestep, so pick after the Field has switched.
        setTimeout(() => {
          if (store.getState().tourStep === 4 && store.getState().features().length > 0) {
            store.setState({ selectedAnomaly: 0 });
          }
        }, 350);
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
    // `steps` is rebuilt each render and `enter` closes over the store, so the index is the
    // only real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourStep]);

  if (!manifest || tourStep === null || !step) return null;

  const last = tourStep === steps.length - 1;

  return (
    <aside className="tour" role="dialog" aria-label="Guided tour">
      <div className="tour-head">
        <span className="tour-count">
          {tourStep + 1} of {steps.length}
        </span>
        <button className="ghost" onClick={() => set("tourStep", null)} aria-label="End the tour">
          ✕
        </button>
      </div>
      <h2 className="tour-title">{step.title}</h2>
      <p className="tour-body">{step.body}</p>
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
