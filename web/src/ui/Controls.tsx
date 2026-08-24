import { axisToDepth } from "../scene/geography";
import { paletteGradient } from "../palette";
import { useStore } from "../store";

/** The colourbar the user edits: palette, range, and linear-or-log. */
function Colourbar() {
  const { manifest, paletteName, windowMin, windowMax, logScale, toValue, set, field, theme } =
    useStore();
  const spec = field();
  if (!manifest || !spec) return null;

  const stops = paletteGradient(manifest.palettes[paletteName] ?? [], theme);

  return (
    <div className="control-group">
      <div className="control-head">
        <label>Colourbar</label>
        <select
          value={paletteName}
          onFocus={() => set("touched", "palette")}
          onChange={(e) => {
            set("touched", "palette");
            set("paletteName", e.target.value);
          }}
        >
          {Object.keys(manifest.palettes).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <div className="colourbar" style={{ background: `linear-gradient(90deg, ${stops})` }} />
      <div className="colourbar-scale">
        <span>{toValue(windowMin).toFixed(1)}</span>
        <span className="units">{spec.units}</span>
        <span>{toValue(windowMax).toFixed(1)}</span>
      </div>

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

      <label className="toggle">
        <input
          type="checkbox"
          checked={logScale}
          onChange={(e) => {
            set("touched", "logScale");
            set("logScale", e.target.checked);
          }}
        />
        <span>Logarithmic scale</span>
      </label>
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
                set("touched", "field");
                set("fieldKey", f.key);
                set("paletteName", f.palette);
                set("windowMin", 0);
                set("windowMax", 1);
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
            {store.isoEnabled && store.fieldKey === "temperature" && (
              <p className="note">
                The 20 °C isotherm is the conventional proxy for the thermocline, and its depth
                drives cyclone-intensity forecasts.
              </p>
            )}
          </div>
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
    </aside>
  );
}
