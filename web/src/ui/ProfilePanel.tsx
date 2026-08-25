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

  // A Collocation exists only where both sides of the comparison exist. Temperature, salinity
  // and density all do - a Float measures the first two and TEOS-10 turns them into the third,
  // so both sides go through the same chain. The other two Fields cannot, for reasons that are
  // different from each other, and WHY_NO_COLLOCATION says which rather than offering one vague
  // sentence that is wrong about at least one of them. When the selected Field has no series,
  // fall back to one the float does carry and say so.
  const available = collocation ? Object.keys(collocation.fields) : [];
  const shownKey = collocation?.fields[fieldKey] ? fieldKey : available[0];
  const series = shownKey ? collocation?.fields[shownKey] : undefined;
  const shownSpec = manifest?.fields.find((f) => f.key === shownKey) ?? spec;
  const substituted = shownKey !== undefined && shownKey !== fieldKey;
  const volume = manifest?.volume;

  // Five of the current 93 floats sit just past the southern or western edge of the loaded
  // Grid. "No usable data" would be misleading about those: the observations are fine, the
  // model simply does not extend that far, and saying so is a different and truer sentence.
  const outsideGrid =
    volume !== undefined &&
    (chosen.latest.lat < volume.south ||
      chosen.latest.lat > volume.north ||
      chosen.latest.lon < volume.west ||
      chosen.latest.lon > volume.east);

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
          {substituted && (
            <p className="note substituted">
              {WHY_NO_COLLOCATION[fieldKey] ??
                `There is no ${spec.label.toLowerCase()} to compare against this cast.`}{" "}
              Showing {shownSpec.label.replace("Sea Water ", "").toLowerCase()} instead.
            </p>
          )}
          <Chart series={series} spec={shownSpec} volume={volume} />
          <Verdict series={series} units={shownSpec.units} label={shownSpec.label} />
          <Stats series={series} units={shownSpec.units} />
          <p className={`analysis-note${analysisDrifted ? " drifted" : ""}`}>
            cast {collocation?.time.slice(0, 10)} vs {analysisDate} analysis
            {analysisDrifted ? " (not the step above)" : ""}
          </p>
        </>
      ) : (
        <p className="empty">
          {outsideGrid
            ? "This float's last cast is outside the model grid we loaded, so there is nothing" +
              " here to compare it against. Its track is still real - it simply drifted past the" +
              " edge of the region."
            : "This float reported nothing the model could be compared against at the matched" +
              " analysis step."}
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
  // Which way round the model read, in the words the quantity actually uses. This was a
  // temperature/salinity ternary, so adding density made it say the model read "cooler than"
  // the float - a sentence about density that means nothing. A Field with no entry here falls
  // back to the arithmetic rather than to a borrowed adjective.
  const words = SENSE[fieldKeyOf(label)];
  const sense = words ? (bias > 0 ? words[0] : words[1]) : bias > 0 ? "below" : "above";

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

/**
 * How to say "the model read high" or "the model read low" for each quantity.
 *
 * `residual = observed - modelled`, so a positive bias means the float measured MORE than the
 * model did. Read the pairs as [what the model is when bias > 0, what it is when bias < 0].
 */
const SENSE: Record<string, [string, string]> = {
  temperature: ["cooler than", "warmer than"],
  salinity: ["more saline than", "fresher than"],
  density: ["lighter than", "denser than"],
};

/** The Field key behind a label, without threading it through every caller. */
function fieldKeyOf(label: string): string {
  return label.replace("Sea Water ", "").toLowerCase().replace(/\s+/g, "_");
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

/**
 * Why a Field has no Collocation, in its own terms.
 *
 * There was one sentence here for all of them - "is measured, not predicted" - written when
 * Observation Coverage was the only Field it had to cover. It is false of density, which is
 * predicted and measured, and false of the anomaly, which is neither.
 */
const WHY_NO_COLLOCATION: Record<string, string> = {
  coverage:
    "Observation Coverage is counted from the floats themselves, so there is no model" +
    " prediction to hold it against.",
  temperature_anomaly:
    "An anomaly is a departure from an average over time, and a single cast has no average of" +
    " its own to depart from.",
};

