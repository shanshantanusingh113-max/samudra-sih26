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
 *
 * **Bullets, to the same rule the guide panel follows.** This was four prose paragraphs and
 * three notes - 243 words, longest block 40, in a 348 px column, so a single answer ran seven
 * lines. `guide.ts` was cut from 170 words an entry to 66.5 of bullets a round earlier and this
 * panel was simply missed. The rewrite is in the five functions at the bottom of this file and
 * touches no markup: **every measured number survives and only the connective prose goes.**
 * Measured across all nine Features in this bake, in the 348 px column it renders in: **the four
 * blocks are a median 86 words**, longest 100, always eight bullets, longest bullet 22 words.
 * The whole panel including its notes is a median 151 against the 243 it was.
 *
 * Two sentences were deleted rather than shortened, both of them defensive. "Whatever changed
 * this body, it was not the warm layer moving over it" restates "Not the thermocline", and "so
 * this panel does not guess at one" is a promise about our own conduct - the finding is that no
 * origin fits, and the promise belongs in the ADR. The closing note about the detector's
 * threshold went too: `howUnusual` already prints the threshold beside the value it is judging.
 */
/**
 * Isolating a Feature pans onto it; it does not zoom to it.
 *
 * Zooming was tried first, with `focusOn`, which swings to a fixed 18-unit radius. That is right
 * for a Float - a point you want to get close to - and wrong for a body of water five degrees
 * across: the block frame collapsed to a single diagonal and the isolated water went off the top
 * of the screen. Panning keeps the distance and angle the user already chose and only
 * re-centres, which is what a Feature at the western edge needs - otherwise half of it sits
 * behind the control panel and the button reads as having done nothing.
 */
export function AnomalyPanel({ onPan }: { onPan?: (lon: number, lat: number) => void }) {
  const store = useStore();
  const { manifest, selectedAnomaly, features, isolateAnomaly, set } = store;
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
        <dd>
          <Points points={whereIs(feature)} />
        </dd>

        <dt>How unusual</dt>
        <dd>
          <Points points={howUnusual(feature, spec.zThreshold, rank)} />
        </dd>

        <dt>Why it is there</dt>
        <dd>
          <Points points={whyThere(feature, spec.isothermValue)} />
        </dd>

        <dt>What kind of water</dt>
        <dd>
          <Points points={whatKind(feature)} />
        </dd>
      </dl>

      {/*
        * The control this panel most needed.
        *
        * Every sentence above is measured over one box of water, and until you can see that box
        * on its own you are reading numbers about a blob you cannot pick out of a solid block.
        * Turning the rest of the water off is the difference between being told a body of water
        * departed and looking at it.
        */}
      <button
        type="button"
        className={`isolate${isolateAnomaly ? " on" : ""}`}
        onClick={() => {
          const next = !isolateAnomaly;
          set("isolateAnomaly", next);
          if (next) onPan?.(feature.lon, feature.lat);
        }}
      >
        {isolateAnomaly ? "Show the whole block again" : "Show only this body of water"}
      </button>
      {isolateAnomaly && (
        <p className="note">
          {feature.cells} cells, {feature.topMetres.toFixed(0)} to{" "}
          {feature.bottomMetres.toFixed(0)} m - the water every figure above is measured over.
          The box frame stays, so you can see where in the block it sits.
        </p>
      )}

      <p className={`verdict ${evidenceTone(feature)}`}>
        <b>{feature.casts === 0 ? "Nothing measured this." : "Evidence behind it."}</b>{" "}
        {evidence(feature)}
      </p>

      {/* The caveat is unchanged and now has somewhere to send the reader: the climatological
          Field exists, so "not a normal" can name the Field that is one instead of just
          apologising. */}
      <p className="analysis-note">
        departure from the mean of the {manifest.timesteps.length} steps in this bake, not a
        climatological normal
        {store.manifest?.fields.some((f) => f.key === "temperature_normal_anomaly") && (
          <>
            {" - "}
            <button
              type="button"
              className="link"
              onClick={() => store.selectField("temperature_normal_anomaly")}
            >
              Temperature vs Normal
            </button>{" "}
            is the one against 1991-2020
          </>
        )}
      </p>
    </aside>
  );
}

/** The same bullets the guide panel draws, inside a definition list's value. */
function Points({ points }: { points: string[] }) {
  return (
    <ul className="guide-points">
      {points.map((point) => (
        <li key={point}>{point}</li>
      ))}
    </ul>
  );
}

function whereIs(f: AnomalyFeature): string[] {
  const depth =
    f.topMetres === f.bottomMetres
      ? `At ${f.topMetres.toFixed(0)} m`
      : `${f.topMetres.toFixed(0)} to ${f.bottomMetres.toFixed(0)} m down`;
  return [
    `${depth}, centred on ${place(f.lat, f.lon)}.`,
    `About ${Math.round(f.footprintKm2 / 1000).toLocaleString()} thousand km²,` +
      ` ${f.cells} grid cells.`,
  ];
}

function place(lat: number, lon: number): string {
  return `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? "N" : "S"} ${Math.abs(lon).toFixed(1)}°${
    lon >= 0 ? "E" : "W"
  }`;
}

function howUnusual(f: AnomalyFeature, threshold: number, rank: number): string[] {
  return [
    `${Math.abs(f.peakValue).toFixed(2)} °C ${f.sign > 0 ? "above" : "below"} this water's own` +
      ` average, ${Math.abs(f.peakZ).toFixed(1)}x its usual swing.`,
    `Past ${threshold.toFixed(1)} counts. ${ordinal(rank)} strongest this step.`,
  ];
}

function whyThere(f: AnomalyFeature, isotherm: number): string[] {
  const move = f.isothermDeparture;
  if (move === null || f.isothermDepth === null) {
    return [
      `No ${isotherm} °C line in this column - the water never passes through that temperature.`,
      "So no thermocline movement explains it.",
    ];
  }
  const where = `The ${isotherm} °C line sits at ${f.isothermDepth.toFixed(0)} m, ${describeMove(move)}.`;
  if (!f.isothermExplains) {
    return ["Not the thermocline.", `${where} It did not cross this water.`];
  }
  return [
    `${where} That line is the bottom of the warm layer.`,
    `It swept through this water, so ${
      f.sign > 0 ? "warm water reaches deeper here than usual" : "cooler water is left behind"
    }.`,
  ];
}

function describeMove(metres: number): string {
  if (Math.abs(metres) < 3) return "within a few metres of its own average";
  return `${Math.abs(metres).toFixed(0)} m ${metres > 0 ? "deeper" : "shallower"} than average`;
}

/** How far salinity has to move before it is worth a sentence. Below this it is analysis noise. */
const SALINITY_NOTICEABLE = 0.05;

function whatKind(f: AnomalyFeature): string[] {
  const salinity = f.salinityDeparture;
  const density = f.densityDeparture;
  if (salinity === null || density === null) return ["Salinity and density are missing here."];

  const facts =
    `${Math.abs(salinity).toFixed(2)} PSU ${salinity > 0 ? "saltier" : "fresher"},` +
    ` ${Math.abs(density).toFixed(2)} kg/m³ ${density > 0 ? "denser" : "lighter"}.`;

  // Only the unambiguous pairings get a reading. The rest get the numbers and no story.
  if (f.sign < 0 && density > 0.2) {
    return [facts, "Cooler and denser: water that came up, not water that cooled."];
  }
  if (f.sign > 0 && density < -0.2 && salinity < -SALINITY_NOTICEABLE) {
    return [facts, "Warmer, fresher, lighter: a buoyant lid of river outflow or rain."];
  }
  if (f.sign > 0 && density < -0.2) {
    return [facts, "Warmer and lighter, so it sits on top rather than mixing down."];
  }
  return [facts, "No single origin fits that combination."];
}

function evidence(f: AnomalyFeature): string {
  if (f.casts === null) return "Coverage is not defined here.";
  if (f.casts === 0) {
    return (
      "No Argo cast reached this water in the ten days around this step, so this departure is" +
      " the model's alone. Observation Coverage shows how far the gap runs."
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
