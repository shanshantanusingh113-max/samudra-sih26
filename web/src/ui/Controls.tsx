import { axisToDepth } from "../scene/geography";

/** The Field the Anomaly Features were found in. They mean nothing drawn over any other. */
const ANOMALY_FIELD = "temperature_anomaly";
import { GUIDE, ISOSURFACES, PALETTES } from "../guide";
import { liftedPalette, paletteGradient } from "../palette";
import { useStore } from "../store";

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
  const { manifest, windowMin, windowMax, toValue, set, field, theme } = useStore();
  const spec = field();
  if (!manifest || !spec) return null;

  const stops = paletteGradient(manifest.palettes[spec.palette] ?? [], theme);
  // Only a banded Field gets a band key; every other Field gets the usual two-ended scale.
  const bands = spec.palette === "coverage" ? manifest.coverage : undefined;
  const note = PALETTES[spec.palette];
  const short = spec.label.replace("Sea Water ", "");
  const explain = () => set("touched", "palette");

  return (
    <div className="control-group">
      <div className="control-head">
        <label>Colourbar</label>
        <span className="readout muted">{spec.palette}</span>
      </div>

      <button
        type="button"
        className="colourbar"
        style={{ background: `linear-gradient(90deg, ${stops})` }}
        onPointerDown={explain}
        onFocus={explain}
        aria-label={`${note?.designedFor ?? short} colour scale - explain`}
      />
      <p className="palette-note">
        {note?.designedFor ?? "This scale"}, {note?.form ?? "sequential"}. The conventional
        oceanographic scale for {short.toLowerCase()}.
      </p>

      {bands ? (
        <>
          <ul className="band-key">
            {bands.labels.map((label, index) => (
              <li key={label}>
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
              </li>
            ))}
          </ul>
          <p className="note">
            Argo casts within {bands.radiusKm} km that dived through this depth, in the{" "}
            {bands.windowDays * 2} days around this step. A float drawn on a one-cast patch is
            that cast.
          </p>
        </>
      ) : (
        <div className="colourbar-scale">
          <span>{toValue(windowMin).toFixed(1)}</span>
          <span className="units">{spec.units}</span>
          <span>{toValue(windowMax).toFixed(1)}</span>
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

      <p className="note">
        Narrowing the range hides water outside it, which is how you isolate a single water mass.
      </p>
    </div>
  );
}

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
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export function Controls() {
  const store = useStore();
  const { manifest, set } = store;
  const spec = store.field();
  if (!manifest || !spec) return null;

  const volume = manifest.volume;
  const fromDepth = axisToDepth(volume, store.depthFrom);
  const toDepth = axisToDepth(volume, store.depthTo);
  const inVolume = store.morph > 0.5;
  const short = spec.label.replace("Sea Water ", "");

  return (
    <aside className="panel panel-left">
      <div className="control-group">
        <div className="control-head">
          <label>Variable</label>
        </div>
        <div className="segmented">
          {manifest.fields.map((f) => (
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
      </div>

      <Colourbar />

      {inVolume && (
        <>
          <div className="control-group">
            <div className="control-head">
              <label>Depth slice</label>
              <span className="readout">
                {fromDepth.toFixed(0)}-{toDepth.toFixed(0)} m
              </span>
            </div>
            <Slider
              guide="depthSlice"
              label="From surface"
              value={store.depthFrom}
              min={0}
              max={Math.max(store.depthTo - 0.02, 0.02)}
              step={0.01}
              format={() => `${fromDepth.toFixed(0)} m`}
              onChange={(v) => set("depthFrom", v)}
            />
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
          </div>

          <div className="control-group">
            <div className="control-head">
              <label>Rendering</label>
            </div>
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
          </div>

          {spec.isosurface === false ? (
            <div className="control-group">
              <div className="control-head">
                <label>Isosurface</label>
                <span className="readout muted">not applicable</span>
              </div>
              <p className="note">
                {short} counts casts in whole numbers, so it steps rather than varies smoothly.
                An isosurface through it would trace the boundary between "1 cast" and "2 casts"
                as a wall of flat slabs, which looks like structure and is not. Switch to
                Temperature or Salinity to draw one.
              </p>
            </div>
          ) : (
          <div className="control-group">
            <div className="control-head">
              <label>Isosurface</label>
              <span className="readout">
                {store.toValue(store.isoValue).toFixed(1)} {spec.units}
              </span>
            </div>
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
              label="Value"
                value={store.isoValue}
                min={0.02}
                max={0.98}
                step={0.005}
                format={(v) => `${store.toValue(v).toFixed(2)} ${spec.units}`}
                onChange={(v) => set("isoValue", v)}
              />
            )}
            {store.isoEnabled && ISOSURFACES[spec.key] && (
              <p className="note">{ISOSURFACES[spec.key]?.hint}</p>
            )}
          </div>
          )}
        </>
      )}

      {!inVolume && (
        <div className="control-group">
          <div className="control-head">
            <label>Sea surface level</label>
            <span className="readout">{axisToDepth(volume, store.surfaceLevel).toFixed(0)} m</span>
          </div>
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
        </div>
      )}

      <div className="control-group">
        <div className="control-head">
          <label>Instruments</label>
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            checked={store.showFloats}
            onChange={(e) => {
              set("touched", "floats");
              set("showFloats", e.target.checked);
            }}
          />
          <span>Argo floats ({store.floats.length})</span>
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
      </div>

      {inVolume && spec.key === ANOMALY_FIELD && store.features().length > 0 && (
        <div className="control-group">
          <div className="control-head">
            <label>Anomaly features</label>
            <span className="readout muted">{store.features().length} this step</span>
          </div>
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
          <p className="note">
            Rings sit on every body of water that departed from its own average. Click one and
            this panel is replaced by what it is, why it is there, and whether anything measured
            it.
          </p>
        </div>
      )}
    </aside>
  );
}
