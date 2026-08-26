import type { AnomalyFeature } from "../types";
import { useStore } from "../store";

/**
 * What one Anomaly Feature is, in words.
 *
 * The anomaly Field shows *that* water departed. It cannot show what the blob is, how big it
 * is, why it is there, or whether to believe it - and a coloured patch with no answer to those
 * is decoration. This panel answers them, and every sentence in it is driven by a number the
 * bake measured. Nothing here is an interpretation dressed as a finding: where the platform
 * does not know, it says so, and the loudest line on the panel is the one about water with no
 * observation behind it.
 */
export function AnomalyPanel() {
  const { manifest, selectedAnomaly, features, set } = useStore();
  const spec = manifest?.anomalyFeatures;
  const feature = selectedAnomaly === null ? undefined : features()[selectedAnomaly];
  if (!feature || !spec) return null;

  const warm = feature.sign > 0;
  const rank = (selectedAnomaly ?? 0) + 1;

  return (
    <aside className="panel panel-right guide">
      <div className="guide-head">
        <span className={`guide-kind ${warm ? "warm-feature" : "cool-feature"}`}>
          {warm ? "Warmer than usual" : "Cooler than usual"}
        </span>
        <button
          className="ghost"
          onClick={() => set("selectedAnomaly", null)}
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <h2 className="guide-title">
        {feature.peakValue > 0 ? "+" : ""}
        {feature.peakValue.toFixed(2)} °C at its strongest
      </h2>

      <dl className="guide-body">
        <dt>Where it is</dt>
        <dd>{whereIs(feature)}</dd>

        <dt>How unusual</dt>
        <dd>{howUnusual(feature, spec.zThreshold, rank)}</dd>

        <dt>Why it is there</dt>
        <dd>{whyThere(feature, spec.isothermValue)}</dd>

        <dt>What kind of water</dt>
        <dd>{whatKind(feature)}</dd>
      </dl>

      <p className={`verdict ${evidenceTone(feature)}`}>
        <b>{feature.casts === 0 ? "Nothing measured this." : "Evidence behind it."}</b>{" "}
        {evidence(feature)}
      </p>

      <p className="analysis-note">
        departure from the mean of the {manifest.timesteps.length} steps in this bake, not a
        climatological normal
      </p>
      <p className="note">
        Not every coloured patch gets a ring. Water that swings this much every step is doing
        what it always does, so only departures past {spec.zThreshold.toFixed(1)} times a cell's
        own usual swing are marked. Most of the vivid band at 50-100 m is the thermocline
        breathing, and it is not unusual there.
      </p>
    </aside>
  );
}

function whereIs(f: AnomalyFeature): string {
  const depth =
    f.topMetres === f.bottomMetres
      ? `at ${f.topMetres.toFixed(0)} m`
      : `between ${f.topMetres.toFixed(0)} and ${f.bottomMetres.toFixed(0)} m`;
  return (
    `${depth}, centred on ${place(f.lat, f.lon)}. It covers about` +
    ` ${Math.round(f.footprintKm2 / 1000).toLocaleString()} thousand square kilometres of sea,` +
    ` across ${f.cells} cells of the analysis grid.`
  );
}

function place(lat: number, lon: number): string {
  return `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? "N" : "S"} ${Math.abs(lon).toFixed(1)}°${
    lon >= 0 ? "E" : "W"
  }`;
}

function howUnusual(f: AnomalyFeature, threshold: number, rank: number): string {
  return (
    `${Math.abs(f.peakValue).toFixed(2)} °C ${f.sign > 0 ? "above" : "below"} what this water` +
    ` normally sits at, which is ${Math.abs(f.peakZ).toFixed(1)} times its usual swing.` +
    ` Anything past ${threshold.toFixed(1)} counts, and this is the` +
    ` ${ordinal(rank)} strongest departure in this step.`
  );
}

function whyThere(f: AnomalyFeature, isotherm: number): string {
  const move = f.isothermDeparture;
  if (move === null || f.isothermDepth === null) {
    return (
      `The ${isotherm} °C line does not exist in this column - the water here never passes` +
      ` through that temperature - so there is no thermocline movement to explain it.`
    );
  }
  if (!f.isothermExplains) {
    return (
      `Not the thermocline. The ${isotherm} °C line sits at ${f.isothermDepth.toFixed(0)} m` +
      ` here, ${describeMove(move)}, and it did not pass through this water. Whatever changed` +
      ` this body, it was not the warm layer moving over it.`
    );
  }
  return (
    `The ${isotherm} °C line - the bottom of the warm surface layer - sits at` +
    ` ${f.isothermDepth.toFixed(0)} m here, ${describeMove(move)}. It swept through this water,` +
    ` so ${f.sign > 0 ? "warm water reaches deeper here than it usually does" :
      "the warm layer has pulled up and left cooler water where it used to be"}.`
  );
}

function describeMove(metres: number): string {
  if (Math.abs(metres) < 3) return "within a few metres of its own average";
  return `${Math.abs(metres).toFixed(0)} m ${metres > 0 ? "deeper" : "shallower"} than its own average`;
}

/** How far salinity has to move before it is worth a sentence. Below this it is analysis noise. */
const SALINITY_NOTICEABLE = 0.05;

function whatKind(f: AnomalyFeature): string {
  const salinity = f.salinityDeparture;
  const density = f.densityDeparture;
  if (salinity === null || density === null) return "Salinity and density are missing here.";

  const facts =
    `Salinity is ${Math.abs(salinity).toFixed(2)} PSU ${salinity > 0 ? "saltier" : "fresher"}` +
    ` than usual and density ${Math.abs(density).toFixed(2)} kg/m³` +
    ` ${density > 0 ? "higher" : "lower"}.`;

  // Only the unambiguous pairings get a reading. The rest get the numbers and no story.
  if (f.sign < 0 && density > 0.2) {
    return `${facts} Cooler and denser together is water that came up from below rather than water that cooled where it is.`;
  }
  if (f.sign > 0 && density < -0.2 && salinity < -SALINITY_NOTICEABLE) {
    return `${facts} Warmer, fresher and lighter is a buoyant lid - river outflow or rain sitting on top of saltier water.`;
  }
  if (f.sign > 0 && density < -0.2) {
    return `${facts} Warmer and lighter, so this water will sit on top of what is around it rather than mixing down into it.`;
  }
  return `${facts} The combination does not point to one clear origin, so this panel does not guess at one.`;
}

function evidence(f: AnomalyFeature): string {
  if (f.casts === null) return "Coverage is not defined here.";
  if (f.casts === 0) {
    return (
      "No Argo cast reached this water in the ten days around this step. The analysis here is" +
      " interpolated between distant floats, so this departure is the model's, and no" +
      " instrument has confirmed it. Switch to Observation Coverage to see how far the gap runs."
    );
  }
  const n = Math.round(f.casts);
  return (
    `${n} Argo cast${n === 1 ? "" : "s"} reached this water in the ten days around this step,` +
    ` so the analysis here had something real to work from.`
  );
}

function evidenceTone(f: AnomalyFeature): string {
  if (f.casts === null || f.casts === 0) return "poor";
  return f.casts >= 2 ? "good" : "fair";
}

function ordinal(n: number): string {
  const suffix = ["th", "st", "nd", "rd"][(n % 100 - 20) % 10] ?? ["th", "st", "nd", "rd"][n % 100] ?? "th";
  return `${n}${suffix}`;
}
