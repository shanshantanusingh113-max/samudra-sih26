import { depthToAxis } from "../scene/geography";
import { useStore } from "../store";
import type { CollocationSeries, VolumeSpec } from "../types";

const WIDTH = 340;
const HEIGHT = 290;
const PAD = { top: 12, right: 16, bottom: 36, left: 48 };

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
        <p className="profile-id">Argo {chosen.id}</p>
        <div className="profile-actions">
          <span className="pill live">Reporting</span>
          <button className="ghost" onClick={() => set("selectedFloatId", null)} aria-label="Close">
            ✕
          </button>
        </div>
      </div>

      {/* An aligned key/value block: someone scanning for one number should not have to read a
          sentence to find it. */}
      <dl className="kv">
        <dt>Position</dt>
        <dd>
          {Math.abs(chosen.latest.lat).toFixed(2)}&deg;{chosen.latest.lat >= 0 ? "N" : "S"}{" "}
          {chosen.latest.lon.toFixed(2)}&deg;E
        </dd>
        <dt>Last surfaced</dt>
        <dd>{chosen.latest.time.slice(0, 10)}</dd>
        <dt>Profiles</dt>
        <dd>{chosen.profileCount}</dd>
        <dt>Deepest</dt>
        <dd>{chosen.latest.depthMax.toFixed(0)} m</dd>
      </dl>

      {series && volume ? (
        <>
          <Chart series={series} spec={spec} volume={volume} />
          <Verdict series={series} units={spec.units} label={spec.label} />
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
  spec,
  volume,
}: {
  series: CollocationSeries;
  spec: { label: string; units: string };
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

  const valueTicks = [vMin, (vMin + vMax) / 2, vMax];
  const short = spec.label.replace("Sea Water ", "");

  return (
    <figure className="chart">
      <figcaption className="chart-title">
        {short} ({spec.units}) vs depth (m)
      </figcaption>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`${short} against depth, measured and modelled`}
      >
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

        {valueTicks.map((value) => (
          <g key={value}>
            <line
              x1={x(value)}
              x2={x(value)}
              y1={PAD.top}
              y2={HEIGHT - PAD.bottom}
              className="grid faint"
            />
            <text x={x(value)} y={HEIGHT - PAD.bottom + 15} className="tick tick-x">
              {value.toFixed(1)}
            </text>
          </g>
        ))}

        {ribbon && <path d={ribbon} className="ribbon" />}
        <path d={path(series.modelled)} className="line-model" />
        <path d={path(series.observed)} className="line-observed" />

        {/* Say which way is down. Without it, an inverted axis is a guess. */}
        <text x={10} y={PAD.top + 9} className="axis-label">
          DEPTH (m)
        </text>
        <text x={14} y={PAD.top + 23} className="axis-arrow">
          &darr;
        </text>
        <text x={WIDTH - PAD.right} y={HEIGHT - 6} className="axis-label" textAnchor="end">
          {short.toUpperCase()} ({spec.units})
        </text>
      </svg>

      <div className="legend">
        <span className="key key-observed">Measured by the float</span>
        <span className="key key-model">Predicted by INCOIS</span>
        <span className="key key-gap">The difference</span>
      </div>
    </figure>
  );
}

/**
 * A one-line verdict.
 *
 * "RMS 0.54" means nothing to anyone who does not already know what good looks like, which is
 * most people who will ever see this screen. The thresholds are deliberately coarse: this is
 * meant to orient a reader, not to stand in for their judgement.
 */
function Verdict({
  series,
  units,
  label,
}: {
  series: CollocationSeries;
  units: string;
  label: string;
}) {
  const rms = series.rmsResidual;
  const bias = series.meanResidual;
  if (rms === null || bias === null) return null;

  const quantity = label.replace("Sea Water ", "").toLowerCase();
  const sense =
    quantity === "salinity"
      ? bias > 0
        ? "more saline than"
        : "fresher than"
      : bias > 0
        ? "cooler than"
        : "warmer than";

  const tone = rms < 0.6 ? "good" : rms < 1.5 ? "fair" : "poor";
  const headline =
    rms < 0.6 ? "Close agreement." : rms < 1.5 ? "Moderate disagreement." : "Large disagreement.";

  const detail =
    rms < 0.6
      ? `The analysis reproduced this float's ${quantity} well through the water column.`
      : `The model reads on average ${Math.abs(bias).toFixed(2)} ${units} ${sense} the` +
        ` instrument measured. Worth a look.`;

  return (
    <p className={`verdict ${tone}`}>
      <b>{headline}</b> {detail}
    </p>
  );
}

function Stats({ series, units }: { series: CollocationSeries; units: string }) {
  const bias = series.meanResidual;
  return (
    <div className="stats">
      <div>
        <span className="stat-value">{series.matched}</span>
        <span className="stat-label">depths compared</span>
      </div>
      <div>
        <span className={`stat-value ${bias !== null && bias < 0 ? "cool" : "warm"}`}>
          {bias === null ? "-" : `${bias > 0 ? "+" : ""}${bias.toFixed(2)}`}
        </span>
        <span className="stat-label">average gap {units}</span>
      </div>
      <div>
        <span className="stat-value">
          {series.rmsResidual === null ? "-" : series.rmsResidual.toFixed(2)}
        </span>
        <span className="stat-label">typical gap {units}</span>
      </div>
    </div>
  );
}
