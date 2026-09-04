import { useRef, useState } from "react";
import { AGREEMENT_LABEL, agreementOf } from "../agreement";
import { timelineMoves, uploadNetcdf, type UploadProblem } from "../data/upload";
import { describePath, type DriftPath } from "../drift";
import { haversineKm } from "../section";
import { GUIDE, ISOSURFACES, PALETTES, RANGE_NOTE } from "../guide";
import { biasColour, liftedPalette, paletteGradient } from "../palette";
import { axisToDepth } from "../scene/geography";
import { useStore } from "../store";
import { inverseTransfer, isDiverging, supportsLog } from "../transfer";
import type { FieldSpec, Manifest } from "../types";

/** The Field the Anomaly Features were found in. They mean nothing drawn over any other. */
const ANOMALY_FIELD = "temperature_anomaly";

/**
 * The colour the banded palette uses for one band, as the scene will actually draw it.
 *
 * Read out of the shipped table rather than restated here, so the key and the water can never
 * disagree - the same rule ADR 0007 applies to the colourbar. The display lift has to be applied
 * too, for the same reason: on the dark console the "no casts" band is drawn at (102, 111, 116)
 * and the raw table says (58, 68, 74), so a key built from the raw table was quietly showing a
 * darker swatch than the water beside it.
 */
function bandColour(table: number[][], index: number): string {
  const distinct: number[][] = [];
  for (const entry of table) {
    const last = distinct[distinct.length - 1];
    if (!last || last[0] !== entry[0] || last[1] !== entry[1] || last[2] !== entry[2]) {
      distinct.push(entry);
    }
  }
  const [r, g, b] = distinct[index] ?? [128, 128, 128];
  return `rgb(${r},${g},${b})`;
}

/**
 * One collapsible group of the control panel.
 *
 * The panel carries 1089 px of controls and a 1366x768 laptop can show 616 px of it, so 43% of
 * it sat below the fold - the whole Rendering group, the Isosurface, and the Instruments
 * toggles - with nothing on screen saying there was more. A scroll cue tells a reader that
 * something is missing; it does not tell them *what*. Collapsing puts every group's name on
 * screen at once, which is what actually makes a control discoverable, and lets a user keep
 * open only what they are working with.
 *
 * **Groups are independent.** Opening one leaves the rest alone; clicking an open one closes it.
 * It was an accordion for one round and that traded away comparing two groups side by side for
 * height the tab strip had already bought back. Measured on a 1366x768 laptop, which leaves the
 * panel 694 px: all closed 264 px, Variable alone 383 px, Variable and Colourbar 578 px. The
 * fold is still respected without the accordion.
 *
 * `id` doubles as the guide key, so opening a group also explains it.
 */
function Group({
  id,
  title,
  readout,
  readoutMuted,
  children,
}: {
  id: string;
  title: string;
  readout?: string;
  readoutMuted?: boolean;
  children: React.ReactNode;
}) {
  const { openGroups, toggleGroup, set } = useStore();
  // Explicitly true, never "absent means open".
  //
  // `openGroups` started as a full map of booleans, so `?? true` never fired. When the panel was
  // briefly an accordion the whole map was replaced with a single key, every other group's entry
  // became `undefined`, and the first time a reader opened anything every untouched group sprang
  // open behind it. The groups are independent again and the map is complete again, so the
  // fallback would never fire either way - but the strict test is the correct one and costs
  // nothing, and it is what makes a group added later default to closed rather than to open.
  const open = openGroups[id] === true;

  return (
    <section className={`control-group${open ? " open" : ""}`}>
      <button
        type="button"
        className="control-head"
        aria-expanded={open}
        onClick={() => {
          toggleGroup(id);
          if (GUIDE[id]) set("touched", id);
        }}
      >
        <span className="disclosure" aria-hidden="true" />
        <label>{title}</label>
        {readout !== undefined && (
          <span className={readoutMuted ? "readout muted" : "readout"}>{readout}</span>
        )}
      </button>
      {open && <div className="control-body">{children}</div>}
    </section>
  );
}

/**
 * The colourbar: what the colours mean, and the range the user narrows.
 *
 * There is no palette chooser here any more. It offered nine cmocean scales, seven of which
 * named quantities the platform does not carry, so picking "dense - Density" recoloured
 * temperature in the colours of density and printed a warning saying the colours meant nothing.
 * A presentation control was reading as a data control. The derivable ones became Variables and
 * the rest were deleted; see pipeline/samudra/palettes.py. Each Field now carries its own
 * palette in its FieldSpec, so a Field and its colours cannot be separated and the warning has
 * nothing left to warn about.
 */
function Colourbar() {
  const { manifest, windowMin, windowMax, toValue, set, field, theme, scale } = useStore();
  const spec = field();
  if (!manifest || !spec) return null;

  const stops = paletteGradient(manifest.palettes[spec.palette] ?? [], theme, scale);
  // The value sitting at the visual middle of the bar. On a linear scale it is the arithmetic
  // midpoint and says nothing; on a log scale it is the number that proves the bar is bent, and
  // it is read back through the same curve the water is drawn with.
  const middle = toValue(windowMin + inverseTransfer(0.5, scale) * (windowMax - windowMin));
  // Only a banded Field gets a band key; every other Field gets the usual two-ended scale.
  const bands = spec.palette === "coverage" ? manifest.coverage : undefined;
  const note = PALETTES[spec.palette];
  const short = spec.label.replace("Sea Water ", "");
  const explain = () => set("touched", "palette");

  return (
    <Group id="palette" title="Colourbar" readout={spec.palette} readoutMuted>
      {/*
        * A banded Field gets no gradient bar.
        *
        * The bar is drawn across the encoded range, and Observation Coverage's bands sit at 0.5,
        * 1.5 and 3.5 casts out of a range running to 14 - so three quarters of the swatch was a
        * single flat green, and the palette read as "mostly green" when the block plainly is
        * not. The proportions are honest about the *range* and dishonest about the *bands*, and
        * the bands are what a reader is looking for. The key underneath does that job properly,
        * so it becomes the control.
        */}
      {!bands && (
        <button
          type="button"
          className="colourbar"
          style={{ background: `linear-gradient(90deg, ${stops})` }}
          onPointerDown={explain}
          onFocus={explain}
          aria-label={`${note?.designedFor ?? short} colour scale - explain`}
        />
      )}
      {bands ? (
        <>
          <button type="button" className="band-key" onPointerDown={explain} onFocus={explain}>
            {bands.labels.map((label, index) => (
              <span className="band" key={label}>
                <span
                  className="band-swatch"
                  style={{
                    background: bandColour(
                      liftedPalette(manifest.palettes.coverage ?? [], theme),
                      index,
                    ),
                  }}
                />
                {label}
              </span>
            ))}
          </button>
          {/* The figures, and nothing else. Why a float can sit on a one-cast patch is in the
              guide entry for this Field, one click away on the bar above. */}
          <p className="note">
            Casts within {bands.radiusKm} km, over {bands.windowDays * 2} days.
          </p>
        </>
      ) : (
        <div className="colourbar-scale">
          <span>{toValue(windowMin).toFixed(1)}</span>
          <span className="units">
            {scale === "log" ? `${middle.toFixed(1)} ${spec.units}` : spec.units}
          </span>
          <span>{toValue(windowMax).toFixed(1)}</span>
        </div>
      )}

      {/*
        * Log or linear, which PS 26067 names by hand.
        *
        * Offered only where the Field never goes below zero: there is no logarithm of a negative
        * number, and bending one half of a diverging scale would move its midpoint off the value
        * that means "no departure". Hidden rather than disabled, because a control that cannot
        * do anything is worse than no control.
        */}
      {supportsLog(spec) && (
        <div className="scale-toggle" role="group" aria-label="Colour scale">
          {(["linear", "log"] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={scale === option ? "on" : ""}
              aria-pressed={scale === option}
              onClick={() => {
                set("touched", "scale");
                set("scale", option);
              }}
            >
              {option === "linear" ? "Linear" : "Log"}
            </button>
          ))}
        </div>
      )}

      <Slider
        guide="window"
        label="Range min"
        value={windowMin}
        min={0}
        max={Math.max(windowMax - 0.02, 0.02)}
        step={0.005}
        format={() => `${toValue(windowMin).toFixed(2)} ${spec.units}`}
        onChange={(v) => set("windowMin", v)}
      />
      <Slider
        guide="window"
        label="Range max"
        value={windowMax}
        min={Math.min(windowMin + 0.02, 0.98)}
        max={1}
        step={0.005}
        format={() => `${toValue(windowMax).toFixed(2)} ${spec.units}`}
        onChange={(v) => set("windowMax", v)}
      />

      {/* Per Field. There is no water mass in a count of casts, and none in a departure. */}
      <p className="note">
        {RANGE_NOTE[spec.key] ?? "Narrowing the range hides water outside it."}
      </p>
    </Group>
  );
}

/**
 * The value beside an isosurface control, in the words that Field uses.
 *
 * On a diverging Field the surface is drawn on both sides of zero, so the honest label is a
 * magnitude with a plus-or-minus rather than the signed number the slider happens to sit on.
 */
function isoLabel(value: number, spec: FieldSpec, places: number): string {
  const magnitude = Math.abs(value).toFixed(places);
  return isDiverging(spec) ? `±${magnitude} ${spec.units}` : `${value.toFixed(places)} ${spec.units}`;
}

/**
 * The lowest departure a diverging Field's isosurface may be set to, as a window fraction.
 *
 * The detector's own threshold where the manifest carries one - 0.5 degC for the temperature
 * anomaly - so the surface cannot enclose water this platform refuses to call a departure. The
 * old default sat at 0.27 degC and drew the thermocline's ordinary seasonal breathing as a block
 * full of blobs. Everything else gets a floor just past the midpoint.
 */
function divergingIsoFloor(spec: FieldSpec, manifest: Manifest): number {
  if (!isDiverging(spec)) return 0.02;
  const threshold = manifest.anomalyFeatures?.valueThreshold;
  const [low, high] = spec.range;
  const fromDetector =
    spec.key === manifest.anomalyFeatures?.field && threshold !== undefined
      ? (threshold - low) / Math.max(high - low, 1e-9)
      : 0.52;
  return Math.min(Math.max(fromDetector, 0.52), 0.9);
}

/**
 * One labelled slider.
 *
 * The visible label sits in a sibling element, so the input needs its own accessible name -
 * without `aria-label` every one of these was announced as an unnamed slider, and there are
 * nine of them. `aria-valuetext` carries the formatted figure for the same reason: the raw
 * value is a window fraction or an axis position on most of these, so the number a screen
 * reader would otherwise read out is not the number on the screen.
 */
function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
  guide,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  /** Which entry in the guide explains this control. */
  guide?: string;
}) {
  const explain = () => guide && useStore.getState().set("touched", guide);
  return (
    <div className="slider" onPointerDown={explain} onFocus={explain}>
      <div className="slider-head">
        <span>{label}</span>
        <span className="slider-value">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        aria-valuetext={format(value)}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

/**
 * A latitude and a longitude, each with its hemisphere. The region runs to 10 S, so
 * "-8.0 degrees N" is two wrong statements in four characters.
 */
function place(lat: number, lon: number): string {
  return (
    `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? "N" : "S"} ` +
    `${Math.abs(lon).toFixed(1)}°${lon >= 0 ? "E" : "W"}`
  );
}

/** How many rows the ranked list shows. Eight fits without turning the panel into a table. */
const BIAS_ROWS = 8;

/** The diverging palette the bias map is drawn in. The scene reads the same name. */
const BIAS_PALETTE = "balance";

/**
 * How to say "the model read high" or "the model read low" for each quantity.
 *
 * `bias = observed - modelled`, so a positive bias means the instrument measured MORE than the
 * model did. Read the pairs as [what the model is when bias > 0, what it is when bias < 0]. The
 * Collocation panel carries the same table for the same reason: a sentence written for
 * temperature told a reader the model was "cooler than" the float on a density field.
 */
const SENSE: Record<string, [string, string]> = {
  temperature: ["cooler than", "warmer than"],
  salinity: ["fresher than", "saltier than"],
  density: ["lighter than", "denser than"],
};

type Focus = (lon: number, lat: number) => void;

/**
 * Where the model most disagrees with the instruments: the map, and the list.
 *
 * The other half of the automatic scan. The Anomaly Features answer "where did the field depart
 * from its own average"; this answers "where does the model depart from the floats", which is
 * the question the whole platform exists for and the one that took 234 clicks to answer.
 *
 * **It is not AI and must never be captioned as one.** There is no model here and no
 * confidence: every figure is a mean or an RMS of residuals `bake.py` already wrote, and the
 * ranking is on the RMS as a fraction of the Field's own range so a degree and a PSU can share
 * one list. See `pipeline/samudra/residuals.py`.
 */
function BiasMap({ onFocus, onPan }: { onFocus: Focus; onPan: Focus }) {
  const store = useStore();
  const { manifest, set } = store;
  const spec = store.field();
  if (!manifest || !spec) return null;

  const block = store.fieldResiduals();

  // Absent, not disabled. The Isosurface group leaves a "not applicable" line behind because an
  // isosurface is a thing you can *imagine* on any Field and a reader has to be told why not.
  // This is different: nothing measures cast count or heat potential in the water, so there is
  // no comparison to explain the absence of. Eleven of the fifteen Fields were carrying a row
  // that said only "switch to something else", which is clutter wearing the clothes of help.
  // What a reader needs instead is for the group to appear on the Fields where it means
  // something - which the Variable tabs make one click away - and the guide entry says which.
  if (!block) return null;

  const summary = block.summary;
  const worst = block.cells[0];
  const sense = SENSE[spec.key] ?? ["below", "above"];
  const rows = block.instruments.slice(0, BIAS_ROWS);
  const colours = manifest.palettes[BIAS_PALETTE] ?? [];
  const cell = store.residuals?.cellDegrees ?? 5;
  // The instruments INCOIS's analysis did not assimilate. See the note under the headline.
  const independent = block.byKind?.mooring ?? null;
  // Where the palette runs out: the Field's own ninetieth percentile, measured by the bake. See
  // `biasPosition` - the verdict threshold read as white on nine markers in ten.
  const saturateAt = summary.p90ScaledAbs ?? undefined;
  // Null is not zero. `biasColour(row.scaledBias ?? 0, ...)` painted a row with no measurement
  // at the palette's midpoint, which is the colour that means "the model and the instrument
  // agreed" - a missing measurement drawn as the best possible result.
  const swatch = (scaledBias: number | null) => {
    if (scaledBias === null) return undefined;
    const tint = biasColour(scaledBias, colours, store.theme, saturateAt);
    return tint ? `rgb(${tint[0]},${tint[1]},${tint[2]})` : undefined;
  };

  return (
    <Group
      id="bias"
      title="Model vs instruments"
      readout={summary.rms === null ? "-" : `RMS ${summary.rms.toFixed(2)} ${spec.units}`}
    >
      <label className="toggle">
        <input
          type="checkbox"
          checked={store.biasMode}
          onChange={(e) => {
            set("touched", "bias");
            set("biasMode", e.target.checked);
          }}
        />
        <span>Colour instruments by disagreement</span>
      </label>

      {/*
        * The basin-wide statement, and the reason it is two statements.
        *
        * INCOIS's analysis **assimilates Argo**, so a float's residual is largely the model
        * agreeing with an observation it was fed. The moored buoys are not assimilated, and
        * measured over this bake they disagree several times as much. Pooled into one figure
        * the nine of them vanish into 224 floats and the headline becomes a statement about
        * self-consistency, so the independent number is printed beside it - with its own count,
        * because nine instruments is a small sample and saying so is part of the answer.
        *
        * `null` is not zero. Rendering a missing mean as "0.00 °C cooler on average" would be
        * a missing measurement drawn as a perfect result.
        */}
      {summary.meanBias === null || summary.meanAbsBias === null ? (
        <p className="readout-line">
          Across <strong>{summary.count}</strong> instruments, nothing summarised: no comparison
          carried both a mean and an RMS.
        </p>
      ) : (
        <p className="readout-line">
          Across <strong>{summary.count}</strong> instruments the analysis reads{" "}
          <strong>
            {Math.abs(summary.meanBias).toFixed(2)} {spec.units}
          </strong>{" "}
          {summary.meanBias > 0 ? sense[0] : sense[1]} them on average. Typical gap{" "}
          <strong>
            {summary.meanAbsBias.toFixed(2)} {spec.units}
          </strong>
          .
        </p>
      )}

      {independent && independent.meanAbsBias !== null && (
        <p className="note">
          INCOIS assimilate Argo, so most of that is the analysis agreeing with data it was
          given. Against the <strong>{independent.count}</strong> moored buoys, which it was
          not, the typical gap is{" "}
          <strong>
            {independent.meanAbsBias.toFixed(2)} {spec.units}
          </strong>
          .
        </p>
      )}

      {worst && (
        <p className="note">
          Worst {cell}&deg; box:{" "}
          <button
            type="button"
            className="link"
            onClick={() => {
              set("touched", "bias");
              onPan(worst.west + cell / 2, worst.south + cell / 2);
            }}
          >
            {Math.abs(worst.south).toFixed(0)}-{Math.abs(worst.south + cell).toFixed(0)}
            &deg;{worst.south >= 0 ? "N" : "S"} {worst.west.toFixed(0)}-
            {(worst.west + cell).toFixed(0)}&deg;E
          </button>
          , {worst.count} instruments, typical gap{" "}
          <strong>
            {(worst.meanAbsBias ?? 0).toFixed(2)} {spec.units}
          </strong>
          .
        </p>
      )}

      {/* The ranked list. Worst first, and clicking one opens its comparison. */}
      <ol className="bias-list">
        {rows.map((row, index) => (
          <li key={row.id}>
            <button
              type="button"
              className={row.id === store.selectedFloatId ? "on" : ""}
              onClick={() => {
                useStore.setState({
                  // Not `touched: "bias"`. The comparison is the answer to clicking a row, and
                  // the two panels share the right-hand space; pressing the group heading again
                  // brings the explanation back over it.
                  touched: null,
                  selectedFloatId: row.id,
                  // The residual was measured at one cast on one date, so the timeline moves to
                  // that date: a Float is not drawn at a Timestep no cast of its own is near,
                  // and clicking a row that leaves nothing on screen reads as a broken link.
                  timestepIndex: row.step,
                  selectedAnomaly: null,
                  isolateAnomaly: false,
                });
                onFocus(row.lon, row.lat);
              }}
            >
              <span className="bias-rank">{index + 1}</span>
              <span
                className={`bias-swatch${swatch(row.scaledBias) ? "" : " unknown"}`}
                style={{ background: swatch(row.scaledBias) }}
              />
              <span className="bias-id">
                {row.id}
                {row.kind === "mooring" ? " buoy" : ""}
              </span>
              <span className="bias-where">{place(row.lat, row.lon)}</span>
              <span className="bias-gap">
                {(row.bias ?? 0) > 0 ? sense[0].split(" ")[0] : sense[1].split(" ")[0]}{" "}
                {Math.abs(row.bias ?? 0).toFixed(2)}
              </span>
              {/* What the gap rests on. Without it a float ranked worst in the basin looked
                  identical whether it matched three depths or two thousand. */}
              <span className="bias-matched">{row.matched} depths</span>
              {row.scaledRms === null ? (
                <span className="bias-band unknown">No RMS</span>
              ) : (
                <span className={`bias-band ${agreementOf(row.scaledRms)}`}>
                  {AGREEMENT_LABEL[agreementOf(row.scaledRms)]}
                </span>
              )}
            </button>
          </li>
        ))}
      </ol>
      <p className="note">
        {rows.length} of {block.instruments.length}, worst first. The gap is what the model read
        against what the instrument measured, at the cast that was compared. {block.cells.length}{" "}
        of the {cell}&deg; boxes hold {store.residuals?.minCount ?? 3} instruments or more; the
        rest are not drawn at all.
      </p>
      {/*
        * The map is a four-month composite, and until this line it did not say so.
        *
        * A residual belongs to its own cast, not to the Timestep on screen, so scrubbing the
        * timeline changes the water and leaves the colours where they were. A reader watching
        * that reasonably concludes the bias is being recomputed each step and is not.
        */}
      <p className="note">
        Every comparison is drawn where and when it was taken, across all{" "}
        {manifest.timesteps.length} analyses, so the markers move when you turn the colours on
        and the map does not change with the timeline. The eight worst all sit past the end of
        the colour scale, which runs out at{" "}
        {saturateAt === undefined
          ? "the ninetieth percentile"
          : `${(saturateAt * Math.abs(spec.range[1] - spec.range[0])).toFixed(2)} ${spec.units}`}
        , so their swatches show which way and not how far.
      </p>
    </Group>
  );
}

/**
 * Drift: where the analysed current alone says a thing in the water would go.
 *
 * PS 26067 names **search-and-rescue support** among the mandates a missing 3D platform impedes,
 * and it was the one of the four with no coverage anywhere in this build.
 *
 * **The caveat is the first thing on the panel and it stays there.** A real search product needs
 * surface wind, Stokes drift from the waves, and a leeway coefficient for the specific object -
 * a raft, a hull and a person in the water all drift differently in the same current. This has
 * none of them, which is why INCOIS run SARAT and this is not SARAT. Said plainly it is a
 * stronger demo than a fake search box, and the reason is the line under it: this platform holds
 * 228 Argo tracks, an Argo track *is* measured drift at the parking depth, and so the prediction
 * arrives with its own score already attached.
 */
function Drift({ drift, inVolume }: { drift: DriftPath | null; inVolume: boolean }) {
  const store = useStore();
  const { manifest, set } = store;
  if (!manifest) return null;

  const spec = manifest.drift;
  const summary = spec?.cycle;
  const pin = store.driftPin;
  const described = drift ? describePath(drift) : null;
  const metres = axisToDepth(manifest.volume, store.depthFrom);
  const check = store.selectedFloatId
    ? store.bakedDrift?.floats[store.selectedFloatId] ?? null
    : null;

  if (!spec) return null;

  return (
    <Group
      id="drift"
      title="Drift"
      readout={pin ? `${store.driftDays} days` : "no pin"}
      readoutMuted={!pin}
    >
      {/*
        * The caveat, in one line rather than four.
        *
        * It said the whole thing here - wind, Stokes drift, leeway, SARAT - which is right and
        * was in the wrong panel. The left panel says *what* and *how much*; the guide says
        * *why*, and it has the room to say it properly. What has to stay on the left is the
        * one clause a reader could otherwise get wrong, which is that this is not a forecast.
        */}
      <p className="note caution">
        The drift the <strong>ocean analysis alone</strong> implies. Not a search forecast: no
        wind, no waves, no leeway.
      </p>

      {!inVolume ? (
        <p className="note">Dive into the water to drop a pin.</p>
      ) : (
        <div className="button-row">
          <button
            type="button"
            className={`mode-switch${store.placingDriftPin ? " on" : ""}`}
            aria-pressed={store.placingDriftPin}
            onClick={() => {
              set("touched", "drift");
              set("placingDriftPin", !store.placingDriftPin);
            }}
          >
            <span className="mode-switch-mark" aria-hidden="true" />
            {store.placingDriftPin
              ? "Click the water to drop it"
              : pin
                ? "Move the pin"
                : "Drop a pin"}
          </button>
          {(pin || store.placingDriftPin) && (
            <button
              type="button"
              className="mode-switch compact"
              aria-label="Remove the drift pin"
              onClick={() => {
                set("touched", "drift");
                useStore.setState({ driftPin: null, placingDriftPin: false });
              }}
            >
              Remove
            </button>
          )}
        </div>
      )}

      {pin && (
        <Slider
          guide="drift"
          label="Follow it for"
          value={store.driftDays}
          min={1}
          max={60}
          step={1}
          format={(v) => `${v.toFixed(0)} days`}
          onChange={(v) => set("driftDays", v)}
        />
      )}

      {pin && described && (
        <p className="readout-line">
          <strong>{described.km.toFixed(0)} km</strong> on a bearing of{" "}
          <strong>{described.bearing.toFixed(0)}&deg;</strong> in{" "}
          {described.days.toFixed(0)} days, at {metres.toFixed(0)} m.
          <br />
          {place(pin.lat, pin.lon)} to {place(described.end.lat, described.end.lon)}.
        </p>
      )}

      {pin && drift && drift.ended !== "finished" && (
        <p className="note">
          It {drift.ended} after {described ? described.days.toFixed(0) : "0"} days, so nothing is
          drawn past there.
        </p>
      )}

      {pin && !drift && <p className="note">Loading the current fields this needs.</p>}

      {/* One line, and it is the one that makes the feature worth having. */}
      {summary && (
        <p className="note">
          Scored at <strong>{spec.parkingDepthMetres.toFixed(0)} m</strong> on{" "}
          <strong>{spec.floats}</strong> Argo floats: a median{" "}
          <strong>{summary.medianKm.toFixed(0)} km</strong> out over one cycle,{" "}
          {summary.p90Km.toFixed(0)} km at the ninetieth percentile.
          {Math.abs(metres - spec.parkingDepthMetres) > 1 && (
            <>
              {" "}
              Your line is at <strong>{metres.toFixed(0)} m</strong>, where the water moves
              faster and changes more, so the score is not a bound on it.
            </>
          )}
        </p>
      )}

      <label className="toggle">
        <input
          type="checkbox"
          checked={store.showDriftCheck}
          onChange={(e) => {
            set("touched", "drift");
            set("showDriftCheck", e.target.checked);
          }}
        />
        <span>Draw the check on the selected instrument</span>
      </label>

      {store.showDriftCheck && check && (
        <p className="readout-line">
          Float <strong>{store.selectedFloatId}</strong>: it went{" "}
          <strong>{(check.observedKm[check.observedKm.length - 1] ?? 0).toFixed(0)} km</strong>,
          the currents said{" "}
          <strong>{(check.predictedKm[check.predictedKm.length - 1] ?? 0).toFixed(0)} km</strong>,{" "}
          <strong>
            {(check.separationKm[check.separationKm.length - 1] ?? 0).toFixed(0)} km
          </strong>{" "}
          apart after {(check.days[check.days.length - 1] ?? 0).toFixed(0)} days.
        </p>
      )}
    </Group>
  );
}

/**
 * The vertical section: draw a line, get the water under it.
 *
 * The strongest item in its group and the one an oceanographer recognises instantly. It is a
 * measurement, so it is cut from the **Grid** - the three collocated Fields ship their native
 * float32 alongside their Volumes for exactly this - and never from the ray-marched block.
 */
function Section({ inVolume }: { inVolume: boolean }) {
  const store = useStore();
  const { manifest, set } = store;
  const spec = store.field();
  if (!manifest || !spec) return null;

  // Absent on a Field with no native Grid shipped, rather than present and refusing. Same
  // reasoning as the bias group above: a section through Observation Coverage is not a thing a
  // reader is owed an explanation for, and eleven rows saying "switch to something else" is
  // eleven rows of nothing. The guide entry names the three Fields that have one.
  if (!manifest.gridFiles?.[spec.key]) return null;

  const from = store.sectionFrom;
  const to = store.sectionTo;
  const km = from && to ? haversineKm(from.lon, from.lat, to.lon, to.lat) : 0;

  return (
    <Group
      id="section"
      title="Vertical section"
      readout={from && to ? `${km.toFixed(0)} km` : "no line"}
      readoutMuted={!(from && to)}
    >
      {!inVolume ? (
        <p className="note">Dive into the water to draw a line.</p>
      ) : (
        <div className="button-row">
          <button
            type="button"
            className={`mode-switch${store.placingSection > 0 ? " on" : ""}`}
            aria-pressed={store.placingSection > 0}
            onClick={() => {
              set("touched", "section");
              if (store.placingSection > 0) {
                useStore.setState({ placingSection: 0 });
              } else {
                useStore.setState({ placingSection: 1, sectionFrom: null, sectionTo: null });
              }
            }}
          >
            <span className="mode-switch-mark" aria-hidden="true" />
            {store.placingSection === 1
              ? "Click where it starts"
              : store.placingSection === 2
                ? "Click where it ends"
                : from && to
                  ? "Draw another line"
                  : "Draw a line"}
          </button>
          {(from || store.placingSection > 0) && (
            <button
              type="button"
              className="mode-switch compact"
              aria-label="Remove the section line"
              onClick={() => {
                set("touched", "section");
                useStore.setState({
                  sectionFrom: null,
                  sectionTo: null,
                  placingSection: 0,
                });
              }}
            >
              Remove
            </button>
          )}
        </div>
      )}

      {from && to && (
        <p className="readout-line">
          {place(from.lat, from.lon)} to {place(to.lat, to.lon)},{" "}
          <strong>{km.toFixed(0)} km</strong>.
        </p>
      )}

      {from && to && (
        <Slider
          guide="section"
          label="Casts within"
          value={store.sectionCorridorKm}
          min={25}
          max={400}
          step={25}
          format={(v) => `${v.toFixed(0)} km`}
          onChange={(v) => set("sectionCorridorKm", v)}
        />
      )}
    </Group>
  );
}

/**
 * Drop your own NetCDF file on the platform.
 *
 * PS 26067 asks for "automated parsers for NetCDF (via PyNIO / xarray backend) ... with a
 * modular architecture that allows new variables or data sources to be added with minimal code
 * change". Every team will claim it. This is the version a judge can falsify in fifteen seconds
 * with a file off their own laptop, which turns the project's most asserted claim into its most
 * demonstrated one.
 *
 * **The demo path is untouched.** This is the only control on the page that talks to a server,
 * it only ever does so when somebody drops a file, and everything else works with the API
 * stopped - which is exactly how OPeNDAP and WMS already sit in this build.
 *
 * The panel's job when something goes wrong is to **name the axis**, not to apologise. A file
 * this platform cannot read has to produce a sentence a user can act on; the one thing it must
 * never produce is a picture.
 */
function Upload() {
  const store = useStore();
  const { manifest, set } = store;
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  if (!manifest) return null;

  const take = async (file: File | undefined | null) => {
    if (!file) return;
    set("touched", "upload");
    useStore.setState({ uploadBusy: true, uploadProblem: null });
    try {
      store.acceptUpload(await uploadNetcdf(file));
    } catch (problem) {
      useStore.setState({
        uploadBusy: false,
        uploadProblem: problem as UploadProblem,
      });
    }
  };

  const file = store.upload;
  const problem = store.uploadProblem;

  return (
    <Group
      id="upload"
      title="Your own data"
      readout={file ? file.filename : "none"}
      readoutMuted={!file}
    >
      {!file && (
        <div
          className={`dropzone${dragging ? " over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void take(e.dataTransfer.files?.[0]);
          }}
        >
          <p>
            Drop a <strong>NetCDF</strong> file here, or{" "}
            <button type="button" className="link" onClick={() => input.current?.click()}>
              choose one
            </button>
            .
          </p>
          <input
            ref={input}
            type="file"
            accept=".nc,.nc4,.cdf,.netcdf"
            hidden
            onChange={(e) => void take(e.target.files?.[0])}
          />
        </div>
      )}

      {store.uploadBusy && <p className="note">Reading it&hellip;</p>}

      {/* Named, not apologised for. */}
      {problem && (
        <p className="note caution">
          {problem.axis ? (
            <>
              <strong>Could not read the {problem.axis}.</strong>{" "}
            </>
          ) : null}
          {problem.detail}
        </p>
      )}

      {file && (
        <>
          <p className="readout-line">
            <strong>{file.filename}</strong>, {(file.bytes / 1e6).toFixed(1)} MB &middot;{" "}
            {file.fields.length} variable{file.fields.length === 1 ? "" : "s"} &middot;{" "}
            {file.timesteps.length} step{file.timesteps.length === 1 ? "" : "s"}
          </p>
          <p className="note">
            Axes read from the file: <strong>{file.axes.longitude}</strong> as longitude,{" "}
            <strong>{file.axes.latitude}</strong> as latitude,{" "}
            {file.axes.depth ? (
              <>
                <strong>{file.axes.depth}</strong> as depth
              </>
            ) : (
              "no depth axis, so it is drawn as a skin on the surface"
            )}
            {file.axes.time ? (
              <>
                , <strong>{file.axes.time}</strong> as time
              </>
            ) : (
              ", and no time axis"
            )}
            .
          </p>
          {/*
            * Does the timeline actually do anything? The panel used to answer that from the
            * *axis* - "no time axis, so the timeline does not move it" - which is only half of
            * it. A file whose instants are all in 2019 has a time axis, maps every one of the
            * twelve steps to the same one, and animates nothing while the slider moves.
            */}
          {!timelineMoves(store.uploadSteps) && (
            <p className="note">
              The timeline does not move this file: every step maps to the same instant in it.
            </p>
          )}
          {/*
            * What was in the file and is not on offer. A partly readable file is not refused -
            * the drawable variables are offered - and before this the rest vanished without a
            * word, which reads as the parser having failed.
            */}
          {file.skipped && Object.keys(file.skipped).length > 0 && (
            <p className="note caution">
              Skipped:{" "}
              {Object.entries(file.skipped).map(([name, why], index) => (
                <span key={name}>
                  {index > 0 ? "; " : ""}
                  <strong>{name}</strong> {why}
                </span>
              ))}
            </p>
          )}
          <p className="note">
            Resampled onto this platform&apos;s own block, so it shares the water you are already
            looking at. Your variables are in the <strong>Yours</strong> tab and behave like the
            built-in ones. The file is held in memory on the API and never stored.
          </p>
          <button type="button" className="mode-switch" onClick={() => store.clearUpload()}>
            <span className="mode-switch-mark" aria-hidden="true" />
            Clear it
          </button>
        </>
      )}

      {/*
        * There used to be a note here naming the API's URL. It was the last line in the panel
        * that talked about the implementation rather than about the file, and it printed
        * `http://localhost:8000` to a room full of people who cannot reach it. What the panel
        * says about a file it has read - the axes it found, what it skipped - is the part that
        * helps. That nothing else on the page needs the API is still said, in `guide.ts`'s
        * `upload` entry and on `requirements.html`, which are the two places it is a claim about
        * the platform rather than a URL.
        */}
    </Group>
  );
}

export function Controls({
  onFocus,
  onPan,
  drift,
}: {
  onFocus: Focus;
  onPan: Focus;
  /** The live trajectory, integrated once in App so the panel and the scene draw one thing. */
  drift: DriftPath | null;
}) {
  const store = useStore();
  const { manifest, set } = store;
  const spec = store.field();
  if (!manifest || !spec) return null;

  const volume = manifest.volume;
  const fromDepth = axisToDepth(volume, store.depthFrom);
  const toDepth = axisToDepth(volume, store.depthTo);
  const inVolume = store.morph > 0.5;
  const short = spec.label.replace("Sea Water ", "");
  // Only a Volume Field has water to march through. The hazard Fields are a sheet or a drape and
  // the currents are arrows, and every control below that acts on the ray march is hidden for
  // them rather than left on screen doing nothing.
  const isVolumeField = (spec.render ?? "volume") === "volume";
  /**
   * Whether there is water on screen, which is **not** the same question as the one above.
   *
   * Currents declare `render: "vector"` because their direction is drawn as dots or arrows - but
   * they also carry a Volume, and the scene draws it: `OceanScene` hides the volume mesh only for
   * a sheet or a drape (`isSurfaceField`), never for a vector Field. So Current Speed put a block
   * of water on screen and hid the three controls that govern it - Water opacity, Ray steps and
   * Show volume - leaving a reader looking at a layer they were given no way to turn off or fade.
   *
   * That is the rule in `CLAUDE.md` about hiding a control, one direction along: there, a control
   * was hidden while its state stayed on; here, the *thing* stayed on while its control was
   * hidden. The predicate has to match the scene's, so it is the scene's: not a sheet, not a
   * drape.
   */
  const drawsWater = spec.render !== "depth" && spec.render !== "column";
  // Where the current arrows sit: the top of the Depth slice inside the block, the painted Level
  // on the map. The scene reads exactly the same two numbers.
  const arrowDepth = axisToDepth(volume, inVolume ? store.depthFrom : store.surfaceLevel);
  // A diverging Field gets two isosurfaces, one each side of zero, so its control reads as a
  // magnitude. The scene decides the same thing from the same function.
  const diverging = isDiverging(spec);
  const isoFloor = divergingIsoFloor(spec, manifest);

  return (
    <aside className="panel panel-left">
      {/*
        * Cyclone mode, above the Variable group rather than inside it.
        *
        * This used to be a button in the Variable group, which meant it rendered under Ocean
        * state, under Circulation and under Change - a cyclone shortcut sitting beneath
        * Salinity, where it means nothing. It is not a Field control: one press changes the
        * Field, the Timestep, the render hints and the anomaly rings, and a control that changes
        * four things should not look like the controls that change one.
        *
        * As a mode it also takes the fifth tab out of the strip, which is what stops the labels
        * colliding, and it gives a non-specialist a door marked with the question they came for.
        */}
      {store.fieldsInGroup("hazard").length > 0 && (
        <button
          type="button"
          className={`mode-switch${store.hazardMode ? " on" : ""}`}
          aria-pressed={store.hazardMode}
          onClick={() => store.setHazardMode(!store.hazardMode)}
        >
          <span className="mode-switch-mark" aria-hidden="true" />
          {store.hazardMode ? "Leave cyclone mode" : "Set up a cyclone question"}
        </button>
      )}

      <Group id="field" title="Variable" readout={short} readoutMuted>
        {/*
          * A tab strip, not five stacked sub-headings.
          *
          * Grouping is right - a flat list of fourteen buttons is a wall, and the headings are
          * what let somebody find Cyclone Heat Potential without reading all of them. Showing
          * all five groups at once is not: fourteen buttons in a two-column grid with wrapped
          * two-line labels came to about 640 px, so on a 1366x768 laptop four other control
          * groups were pushed off screen, and the panel's height jumped every time the reader
          * changed group.
          *
          * Five short words fit one row. The panel now shows 1 to 5 buttons instead of 14, at a
          * height that does not move when the tab changes.
          */}
        {/* Hidden in cyclone mode: there is one group to show and a tab strip of one is a
            label pretending to be a control. */}
        {!store.hazardMode && (
          <div className="field-tabs" role="tablist" aria-label="Variable group">
            {(manifest.fieldGroups ?? [])
              .filter((group) => group.key !== "hazard")
              .map((group) => {
                if (store.fieldsInGroup(group.key).length === 0) return null;
                const active = group.key === store.fieldGroupTab;
                // Which tab holds the Field actually on screen. Browsing tabs without switching
                // Field is deliberate, but with nothing marking where the live Field went, a
                // strip showing OCEAN STATE beside a readout saying "Temperature Anomaly" and no
                // button lit reads as broken rather than as browsing.
                const holdsLive =
                  !active && store.fieldsInGroup(group.key).some((f) => f.key === store.fieldKey);
                return (
                  <button
                    key={group.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={`${active ? "on" : ""}${holdsLive ? " holds-live" : ""}`}
                    title={holdsLive ? `${short} is in here` : undefined}
                    onClick={() => {
                      set("touched", "field");
                      set("fieldGroupTab", group.key);
                    }}
                  >
                    {group.label}
                  </button>
                );
              })}
          </div>
        )}

        <div className="segmented">
          {store.fieldsInGroup(store.hazardMode ? "hazard" : store.fieldGroupTab).map((f) => (
            <button
              key={f.key}
              className={f.key === store.fieldKey ? "on" : ""}
              onClick={() => {
                // A Field with its own guide entry explains itself; the rest fall back to the
                // entry describing the selector as a whole.
                set("touched", GUIDE[f.key] ? f.key : "field");
                store.selectField(f.key);
              }}
            >
              {f.label.replace("Sea Water ", "")}
            </button>
          ))}
        </div>
      </Group>

      <Colourbar />

      {inVolume && (
        <>
          {/* A depth sheet and a sea-surface drape are not cut by a depth range, so the two
              sliders would sit there doing nothing on five of the fourteen Fields. On the
              currents they do something important instead - they choose the depth the arrows
              sit on - so the group stays, with a readout that says which job it is doing. */}
          {(isVolumeField || spec.render === "vector") && (
          <Group
            id="depthSlice"
            title={spec.render === "vector" ? "Current depth" : "Depth slice"}
            readout={
              spec.render === "vector"
                ? `${fromDepth.toFixed(0)} m`
                : `${fromDepth.toFixed(0)}-${toDepth.toFixed(0)} m`
            }
          >
            <Slider
              guide="depthSlice"
              label={spec.render === "vector" ? "Depth of the arrows" : "From surface"}
              value={store.depthFrom}
              min={0}
              max={Math.max(store.depthTo - 0.02, 0.02)}
              step={0.01}
              format={() => `${fromDepth.toFixed(0)} m`}
              onChange={(v) => set("depthFrom", v)}
            />
            {isVolumeField && (
              <Slider
                guide="depthSlice"
                label="To depth"
                value={store.depthTo}
                min={Math.min(store.depthFrom + 0.02, 0.98)}
                max={1}
                step={0.01}
                format={() => `${toDepth.toFixed(0)} m`}
                onChange={(v) => set("depthTo", v)}
              />
            )}
          </Group>
          )}

          <Group id="rendering" title="Rendering">
            {/* A Field drawn as a sheet or a drape has no water to make more or less dense and
                no gradient to weight, so those two sliders are not shown for it rather than
                shown doing nothing. Currents **do** have water - they carry a Volume and the
                scene draws it - so they keep these. Vertical exaggeration applies to everything:
                it is what decides where the 26 degree sheet sits in the box. */}
            {drawsWater && (
              <>
                <Slider
                  guide="opacity"
                  label="Water opacity"
                  value={store.opacity}
                  min={0.005}
                  max={0.30}
                  step={0.005}
                  format={(v) => v.toFixed(3)}
                  onChange={(v) => set("opacity", v)}
                />
                <Slider
                  guide="emphasis"
                  label="Feature emphasis"
                  value={store.emphasis}
                  min={0}
                  max={1}
                  step={0.02}
                  format={(v) => `${(v * 100).toFixed(0)}%`}
                  onChange={(v) => set("emphasis", v)}
                />
              </>
            )}
            <Slider
              guide="exaggeration"
              label="Vertical exaggeration"
              value={store.exaggeration}
              min={200}
              max={3500}
              step={10}
              format={(v) => `${v.toFixed(0)}×`}
              onChange={(v) => set("exaggeration", v)}
            />
            {drawsWater && (
              <>
                <Slider
                  guide="quality"
                  label="Ray steps"
                  value={store.quality}
                  min={48}
                  max={320}
                  step={8}
                  format={(v) => v.toFixed(0)}
                  onChange={(v) => set("quality", v)}
                />
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={store.volumeEnabled}
                    onChange={(e) => {
                      set("touched", "volumeEnabled");
                      set("volumeEnabled", e.target.checked);
                    }}
                  />
                  <span>Show volume</span>
                </label>
              </>
            )}
          </Group>

          {!isVolumeField ? null : spec.isosurface === false ? (
            <Group id="isosurface" title="Isosurface" readout="not applicable" readoutMuted>
              {/* One line for a control that is not on screen. It also has to be true of all
                  four Fields that refuse one, and the old text was about cast counts. */}
              <p className="note">
                Not meaningful on {short}. Switch to Temperature, Salinity or Density.
              </p>
            </Group>
          ) : (
          <Group
            id="isosurface"
            title="Isosurface"
            readout={`${isoLabel(store.toValue(store.isoValue), spec, 1)}`}
          >
            <label className="toggle">
              <input
                type="checkbox"
                checked={store.isoEnabled}
                onChange={(e) => {
                  set("touched", "isosurface");
                  set("isoEnabled", e.target.checked);
                }}
              />
              <span>Draw isosurface</span>
            </label>
            {store.isoEnabled && (
              <Slider
                guide="isosurface"
                label={diverging ? "Departure of at least" : "Value"}
                value={store.isoValue}
                /*
                 * A diverging Field's slider starts past the midpoint, not at 0.02.
                 *
                 * Below the midpoint the number it shows is negative while the surface it draws
                 * is a departure of that size in both directions, so the control said one thing
                 * and the water did another. At the midpoint itself the surface is the skin
                 * around water that did not change, which is the whole block. The floor is the
                 * detector's own 0.5 degC where the manifest carries it, so the surface and the
                 * anomaly rings agree about what counts as a departure.
                 */
                min={diverging ? isoFloor : 0.02}
                max={0.98}
                step={0.005}
                format={(v) => isoLabel(store.toValue(v), spec, 2)}
                onChange={(v) => set("isoValue", v)}
              />
            )}
            {store.isoEnabled && diverging && (
              <p className="note">
                Two surfaces, one each side of zero: water that rose by this much and water that
                fell by it.
              </p>
            )}
            {store.isoEnabled && ISOSURFACES[spec.key] && (
              <p className="note">{ISOSURFACES[spec.key]?.hint}</p>
            )}
          </Group>
          )}
        </>
      )}

      {!inVolume && (
        <Group
          id="surfaceLevel"
          title="Sea surface level"
          readout={`${axisToDepth(volume, store.surfaceLevel).toFixed(0)} m`}
        >
          <Slider
            guide="surfaceLevel"
              label="Depth painted on the map"
            value={store.surfaceLevel}
            min={0}
            max={1}
            step={0.01}
            format={(v) => `${axisToDepth(volume, v).toFixed(0)} m`}
            onChange={(v) => set("surfaceLevel", v)}
          />
        </Group>
      )}

      {/*
        * Currents used to be a checkbox that turned on a rendered image. They are a Field now -
        * ADR 0013 - so the selector switches them on and this only has to say where the arrows
        * sit and whose analysis they are.
        */}
      {manifest.currents && spec.key === manifest.currents.field && (
        <Group
          id="currents"
          title="Currents"
          readout={`${store.currentStyle === "particles" ? "flow" : "arrows"}, ${arrowDepth.toFixed(0)} m`}
        >
          {/*
            * Two styles of one layer, not two layers.
            *
            * Both read the same float32 (u, v) Grid, sit on the same depth this group already
            * chooses, and colour themselves through the same palette and the same transfer
            * curve. Moving dots are the default because somebody who has never read a vector
            * plot reads them anyway; arrows are one click away because they are the mark the
            * problem statement names and the one that survives a screenshot.
            */}
          <div className="style-switch" role="radiogroup" aria-label="How currents are drawn">
            {(["particles", "arrows"] as const).map((style) => (
              <button
                key={style}
                type="button"
                role="radio"
                aria-checked={store.currentStyle === style}
                className={store.currentStyle === style ? "on" : undefined}
                onClick={() => {
                  set("touched", "currentStyle");
                  set("currentStyle", style);
                }}
              >
                {style === "particles" ? "Moving flow" : "Arrows"}
              </button>
            ))}
          </div>
          {/*
            * The live speed under the cursor is the only thing in this group a reader cannot
            * get anywhere else, so it is the only thing left. Whose analysis it is, at what
            * resolution, and how to move the arrows are all in the guide entry and in the
            * provenance page; two paragraphs restating them sat above the number.
            *
            * Read from the same float32 file the arrows are drawn from, never from the Volume -
            * a Volume is quantised and depth-warped, and this is a measurement.
            */}
          <p className="readout-line">
            {inVolume && store.hoverCurrent ? (
              <>
                <strong>{store.hoverCurrent.speed.toFixed(2)} m/s</strong>, heading{" "}
                {store.hoverCurrent.heading.toFixed(0)}&deg;, at{" "}
                {/* The block runs to 10 S, so the hemisphere is not always N. This printed
                    "-2.7 degrees N", which is two wrong statements in four characters. The
                    Collocation panel already formats a latitude properly; this did not. */}
                {Math.abs(store.hoverCurrent.lat).toFixed(1)}&deg;
                {store.hoverCurrent.lat >= 0 ? "N" : "S"}{" "}
                {store.hoverCurrent.lon.toFixed(1)}&deg;E
              </>
            ) : inVolume ? (
              "Move the cursor over the water for a speed."
            ) : (
              "Dive in for a speed under the cursor."
            )}
          </p>
          <p className="note">
            {store.currentStyle === "particles" ? "Flow" : "Arrows"} at{" "}
            <strong>{arrowDepth.toFixed(0)} m</strong>
            {inVolume ? ", set by the top of the Depth slice." : ", set by Sea surface level."}
          </p>
        </Group>
      )}

      <Group id="instruments" title="Instruments">
        <label className="toggle">
          <input
            type="checkbox"
            checked={store.showFloats}
            onChange={(e) => {
              set("touched", "floats");
              set("showFloats", e.target.checked);
            }}
          />
          <span>Instruments ({store.floats.length})</span>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={store.showTracks}
            onChange={(e) => {
              set("touched", "tracks");
              set("showTracks", e.target.checked);
            }}
          />
          <span>Drift tracks</span>
        </label>
        {/* Counted from the manifest rather than the array, so the line names what each kind
            is instead of lumping the anchored buoys in with the floats. Both figures survive;
            what an anchored buoy is for is in the guide entry behind the toggle above. */}
        {manifest.instruments && manifest.instruments.moorings > 0 && (
          <p className="note">
            {manifest.instruments.moorings} moored buoys (squares, anchored)
            {manifest.instruments.withChlorophyll > 0 &&
              ` · ${manifest.instruments.withChlorophyll} floats carry chlorophyll`}
          </p>
        )}
      </Group>

      <BiasMap onFocus={onFocus} onPan={onPan} />

      <Section inVolume={inVolume} />

      <Drift drift={drift} inVolume={inVolume} />

      <Upload />

      {inVolume && spec.key === ANOMALY_FIELD && store.features().length > 0 && (
        <Group
          id="anomalyFeatures"
          title="Anomaly features"
          readout={`${store.features().length} this step`}
          readoutMuted
        >
          <label className="toggle">
            <input
              type="checkbox"
              checked={store.showAnomalies}
              onChange={(e) => {
                set("touched", "anomalyFeatures");
                set("showAnomalies", e.target.checked);
                if (!e.target.checked) set("selectedAnomaly", null);
              }}
            />
            <span>Mark them in the water</span>
          </label>
          <p className="note">Click a ring for what that body of water is.</p>
        </Group>
      )}
    </aside>
  );
}
