import { depthToAxis } from "../scene/geography";
import { useStore } from "../store";
import type { CollocationSeries, VolumeSpec } from "../types";

const WIDTH = 330;
const HEIGHT = 360;
const PAD = { top: 16, right: 14, bottom: 30, left: 46 };

const DEPTH_TICKS = [0, 50, 100, 200, 500, 1000, 2000];

export function ProfilePanel({ onFocus }: { onFocus: (lon: number, lat: number) => void }) {
  const { selectedFloatId, floats, collocations, fieldKey, field, set, manifest, timestepIndex } =
    useStore();
  const spec = field();

  if (!selectedFloatId || !spec) return null;
  const chosen = floats.find((f) => f.id === selectedFloatId);
  const collocation = collocations[selectedFloatId];
  if (!chosen) return null;

  const series = collocation?.fields[fieldKey];
  const volume = manifest?.volume;

  // Scrubbing the timeline moves the header's analysis date, but a baked Collocation is pinned
  // to the analysis step nearest its own cast. Name the step this chart is actually against -
  // and note that this is the *analysis* date from the manifest, not `collocation.time`, which
  // is when the float surfaced.
  const analysisDate = collocation
    ? manifest?.timesteps[collocation.timestepIndex]?.slice(0, 10)
    : undefined;
  const analysisDrifted =
    collocation !== undefined && collocation.timestepIndex !== timestepIndex;

  return (
    <aside className="panel panel-right">
      <div className="profile-head">
        <div>
          <p className="profile-id">Argo {chosen.id}</p>
          <p className="profile-meta">
            {Math.abs(chosen.latest.lat).toFixed(2)}°{chosen.latest.lat >= 0 ? "N" : "S"}{" "}
            {chosen.latest.lon.toFixed(2)}°E · {chosen.latest.time.slice(0, 10)}
          </p>
          <p className="profile-meta">
            {chosen.profileCount} profiles · deepest {chosen.latest.depthMax.toFixed(0)} m
          </p>
        </div>
        <button className="ghost" onClick={() => set("selectedFloatId", null)}>
          ✕
        </button>
      </div>

      {series && volume ? (
        <>
          <Chart series={series} units={spec.units} label={spec.label} volume={volume} />
          <Stats series={series} units={spec.units} />
          <p className={`analysis-note${analysisDrifted ? " drifted" : ""}`}>
            cast {collocation?.time.slice(0, 10)} vs {analysisDate} analysis
            {analysisDrifted ? " (not the step above)" : ""}
          </p>
        </>
      ) : (
        <p className="empty">
          This float reported no usable {spec.label.toLowerCase()} for the matched analysis step.
        </p>
      )}

      <button className="ghost wide" onClick={() => onFocus(chosen.latest.lon, chosen.latest.lat)}>
        Centre the view on this float
      </button>
    </aside>
  );
}

function Chart({
  series,
  units,
  label,
  volume,
}: {
  series: CollocationSeries;
  units: string;
  label: string;
  volume: VolumeSpec;
}) {
  // The Depth Warp, read back from the axis the pipeline shipped rather than re-derived here.
  // A third copy of the formula would drift out of step the moment the pipeline changed, and
  // nothing would catch it: the chart exists to corroborate the 3D view.
  const warp = (metres: number) => depthToAxis(volume, metres);
  const finite = [...series.observed, ...series.modelled].filter(
    (v): v is number => v !== null && Number.isFinite(v),
  );
  if (finite.length === 0) return <p className="empty">Nothing to plot.</p>;

  const low = Math.min(...finite);
  const high = Math.max(...finite);
  const pad = (high - low) * 0.08 || 0.5;
  const vMin = low - pad;
  const vMax = high + pad;

  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const x = (value: number) => PAD.left + ((value - vMin) / (vMax - vMin)) * plotWidth;
  const y = (depth: number) => PAD.top + warp(depth) * plotHeight;

  const path = (values: (number | null)[]) => {
    let d = "";
    let pen = false;
    values.forEach((value, index) => {
      const depth = series.depths[index];
      if (value === null || depth === undefined || !Number.isFinite(value)) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(value).toFixed(1)},${y(depth).toFixed(1)}`;
      pen = true;
    });
    return d;
  };

  // Shade between the two curves wherever both exist - the Residual, made visible.
  const ribbon = (() => {
    const forward: string[] = [];
    const back: string[] = [];
    series.depths.forEach((depth, index) => {
      const observed = series.observed[index];
      const modelled = series.modelled[index];
      if (observed == null || modelled == null) return;
      forward.push(`${x(observed).toFixed(1)},${y(depth).toFixed(1)}`);
      back.unshift(`${x(modelled).toFixed(1)},${y(depth).toFixed(1)}`);
    });
    return forward.length > 1 ? `M${forward.join("L")}L${back.join("L")}Z` : "";
  })();

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`${label} profile`}>
        {DEPTH_TICKS.map((depth) => (
          <g key={depth}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y(depth)}
              y2={y(depth)}
              className="grid"
            />
            <text x={PAD.left - 7} y={y(depth) + 3} className="tick tick-y">
              {depth}
            </text>
          </g>
        ))}

        {[vMin, (vMin + vMax) / 2, vMax].map((value) => (
          <text key={value} x={x(value)} y={HEIGHT - 12} className="tick tick-x">
            {value.toFixed(1)}
          </text>
        ))}

        {ribbon && <path d={ribbon} className="ribbon" />}
        <path d={path(series.modelled)} className="line-model" />
        <path d={path(series.observed)} className="line-observed" />

        <text x={PAD.left - 34} y={PAD.top - 4} className="axis-label">
          m
        </text>
        <text x={WIDTH - PAD.right} y={HEIGHT - 12} className="axis-label" textAnchor="end">
          {units}
        </text>
      </svg>

      <figcaption className="legend">
        <span className="key key-observed">Argo observed</span>
        <span className="key key-model">INCOIS analysis</span>
      </figcaption>
    </figure>
  );
}

function Stats({ series, units }: { series: CollocationSeries; units: string }) {
  const bias = series.meanResidual;
  return (
    <div className="stats">
      <div>
        <span className="stat-value">{series.matched}</span>
        <span className="stat-label">levels matched</span>
      </div>
      <div>
        <span className={`stat-value ${bias !== null && bias < 0 ? "cool" : "warm"}`}>
          {bias === null ? "-" : `${bias > 0 ? "+" : ""}${bias.toFixed(2)}`}
        </span>
        <span className="stat-label">mean residual {units}</span>
      </div>
      <div>
        <span className="stat-value">
          {series.rmsResidual === null ? "-" : series.rmsResidual.toFixed(2)}
        </span>
        <span className="stat-label">RMS {units}</span>
      </div>
    </div>
  );
}
