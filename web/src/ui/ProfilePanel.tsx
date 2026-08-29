import { positionAt } from "../floatTime";
import { depthToAxis } from "../scene/geography";
import { useStore } from "../store";
import type { CollocationSeries, ObservedOnlySeries, VolumeSpec } from "../types";

const WIDTH = 340;
const HEIGHT = 290;
const PAD = { top: 12, right: 16, bottom: 36, left: 48 };

/**
 * Depth figures for the chart's own axis.
 *
 * The first one is the model's shallowest Level, not zero. This list used to start at 0, which
 * drew a gridline labelled "0" in exactly the place 5 m goes - the same mistake the 3D view's
 * depth ruler was already fixed for, and for the same reason: there is no data above 5 m, and an
 * axis figure is a measurement claim.
 */
function depthTicksFor(volume: VolumeSpec): number[] {
  const round = [50, 100, 200, 500, 1000, 2000].filter(
    (d) => d > volume.surfaceMetres && d <= volume.floorMetres,
  );
  return [volume.surfaceMetres, ...round];
}

export function ProfilePanel({ onFocus }: { onFocus: (lon: number, lat: number) => void }) {
  const {
    selectedFloatId,
    floats,
    collocations,
    collocationsReady,
    fieldKey,
    field,
    set,
    manifest,
    timestepIndex,
  } = useStore();
  const timeMs = new Date(manifest?.timesteps[timestepIndex] ?? 0).getTime();
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
  // A mooring is anchored, so it has a comparison at *every* Timestep and the chart follows
  // the timeline. A Float has drifted somewhere else by the next analysis, so its chart stays
  // pinned to one date and says so. This is the one place the two kinds of instrument diverge.
  const anchored = chosen?.kind === "mooring";
  const atStep = collocation?.steps?.[String(timestepIndex)];
  const fields = atStep?.fields ?? collocation?.fields;
  const castTime = atStep?.time ?? collocation?.time;

  const available = fields ? Object.keys(fields) : [];
  const shownKey = fields?.[fieldKey] ? fieldKey : available[0];
  const series = shownKey ? fields?.[shownKey] : undefined;
  const shownSpec = manifest?.fields.find((f) => f.key === shownKey) ?? spec;
  const substituted = shownKey !== undefined && shownKey !== fieldKey;
  const volume = manifest?.volume;

  // Where this Float actually was at the moment on screen, which is where its marker is drawn.
  // The header used to read `chosen.latest` instead - its newest report, whatever the timeline
  // said. At the first Timestep that described a position a median 247 km from the dot the user
  // had just clicked, and 1157 km away at worst. Same family as the frozen-float bug: the marker
  // was corrected and the readout was left behind.
  const here = positionAt(chosen, timeMs);
  const reporting = here !== null;
  const shown = here ?? chosen.latest;

  // Nine of the current 221 floats sit just past the southern or western edge of the loaded
  // Grid. "No usable data" would be misleading about those: the observations are fine, the
  // model simply does not extend that far, and saying so is a different and truer sentence.
  const outsideGrid =
    volume !== undefined &&
    (shown.lat < volume.south ||
      shown.lat > volume.north ||
      shown.lon < volume.west ||
      shown.lon > volume.east);

  // Scrubbing the timeline moves the header's analysis date, but a baked Collocation is pinned
  // to the analysis step nearest its own cast. Name the step this chart is actually against -
  // and note that this is the *analysis* date from the manifest, not `collocation.time`, which
  // is when the float surfaced.
  const analysisIndex = atStep ? timestepIndex : collocation?.timestepIndex;
  const analysisDate =
    analysisIndex === undefined ? undefined : manifest?.timesteps[analysisIndex]?.slice(0, 10);
  // A mooring never drifts off the step on screen, because it has one for every step.
  const analysisDrifted =
    !atStep && collocation !== undefined && collocation.timestepIndex !== timestepIndex;


  return (
    <aside className="panel panel-right">
      <div className="profile-head">
        {/* A moored buoy is not an Argo float and must not be labelled as one. Four of the nine
            in this bake are India's own OMNI network and two are RAMA; saying so is the point of
            having wired them up. */}
        <p className="profile-id">
          {anchored ? "Moored buoy" : "Argo"} {chosen.id}
          {anchored && chosen.country && chosen.country !== "UNKNOWN" && (
            <span className="profile-operator">{titleCase(chosen.country)}</span>
          )}
        </p>
        <div className="profile-actions">
          {/* Say it at the top. The chlorophyll chart is the last thing in a long panel, and
              nothing above it hinted that there was anything below to scroll to. */}
          {collocation?.observedOnly?.chlorophyll && (
            <span className="pill chl" title="This float carries a fluorometer">
              + chlorophyll
            </span>
          )}
          <span className={`pill ${reporting ? "live" : "stale"}`}>
            {reporting ? "Reporting" : "Not reporting"}
          </span>
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
          {Math.abs(shown.lat).toFixed(2)}&deg;{shown.lat >= 0 ? "N" : "S"}{" "}
          {shown.lon.toFixed(2)}&deg;E
        </dd>
        <dt>{anchored ? "Last reported" : reporting ? "Surfaced" : "Last surfaced"}</dt>
        <dd>{shown.time.slice(0, 10)}</dd>
        <dt>{anchored ? "Reports" : "Profiles"}</dt>
        <dd>{chosen.profileCount}</dd>
        <dt>{anchored ? "Deepest sensor" : "That cast reached"}</dt>
        <dd>{shown.depthMax.toFixed(0)} m</dd>
      </dl>

      {anchored && (
        <p className="note">
          Anchored to the sea floor, so it does not drift and has no track. It measures the same
          water column every few hours, which is why this comparison follows the timeline instead
          of being pinned to one date.
        </p>
      )}

      {!reporting && (
        <p className="note substituted">
          {anchored
            ? "This buoy sent nothing"
            : "This float was not surfacing anywhere"}{" "}
          near {analysisDate}, so its marker is not on the water at this step. The figures above
          are its nearest report, {chosen.latest.time.slice(0, 10)}.
        </p>
      )}

      {!collocationsReady ? (
        /* The comparisons arrive after first paint. Until they do, "nothing to compare" would
           be a different and false statement. */
        <p className="empty">Loading this float&apos;s comparison&hellip;</p>
      ) : series && volume && series.matched === 0 ? (
        /*
         * A Collocation exists and is empty. Six of the 212 Floats in the current bake are like
         * this, so about one click in thirty-five landed on a chart with a single line, a legend
         * promising two more that were never drawn, "0 depths compared", two dashes and no
         * verdict - with nothing on screen saying why. The `outsideGrid` branch below never
         * fired, because an entry does exist; it is just empty.
         *
         * The reason is almost always a good one and worth saying out loud: `Grid.column_at`
         * refuses to blend across a Masked node, so a Float sitting next to a coast gets no
         * model column rather than a sea temperature manufactured out of the open-ocean nodes
         * around it. That is the platform's own rule doing its job.
         */
        <p className="empty">{whyEmpty(series, volume)}</p>
      ) : series && volume ? (
        <>
          {substituted && (
            <p className="note substituted">
              {WHY_NO_COLLOCATION[fieldKey] ??
                `There is no ${spec.label.toLowerCase()} to compare against this cast.`}{" "}
              Showing {shownSpec.label.replace("Sea Water ", "").toLowerCase()} instead.
            </p>
          )}
          <p className={`analysis-note lead${analysisDrifted ? " drifted" : ""}`}>
            {analysisDrifted
              ? `Comparing the ${castTime?.slice(0, 10)} cast against the ${analysisDate}` +
                ` analysis - not the step on the timeline. Scrubbing does not move this chart.`
              : anchored
                ? `Comparing this buoy's ${castTime?.slice(0, 10)} report against the` +
                  ` ${analysisDate} analysis. It is anchored, so this chart follows the` +
                  ` timeline - move it and you are watching one patch of ocean through the season.`
                : `Comparing the ${castTime?.slice(0, 10)} cast against the ${analysisDate}` +
                  ` analysis, the step you are looking at.`}
          </p>
          <Chart series={series} spec={shownSpec} volume={volume} anchored={anchored} />
          <Verdict
            series={series}
            units={shownSpec.units}
            label={shownSpec.label}
            range={shownSpec.range}
          />
          <Stats series={series} units={shownSpec.units} />

          {/*
            * The objection an oceanographer on the panel will raise, raised first.
            *
            * INCOIS's VAM analysis is *derived from* Argo profiles, so this comparison is partly
            * the analysis being graded against its own input, and somebody will say so. The
            * adapter's own docstring has always said this; nothing on screen did, so the verdict
            * read as a straightforward validation.
            *
            * Saying it costs nothing, because the check is not degenerate: across the current
            * bake temperature splits 150 close / 52 moderate / 4 large and salinity 122 / 65 /
            * 11. An analysis reproducing its own inputs is exactly the operational question, and
            * turning the objection into the point is stronger than hoping it does not come up.
            */}
          <p className="note">
            {anchored ? (
              <>
                This is a moored buoy, not an Argo float, so it is <b>not</b> part of what INCOIS
                assimilated. Nothing about this water column went into the analysis being drawn
                against it, which makes this the more independent of the two comparisons the
                platform can show - and the reason it was worth wiring the buoys up.
              </>
            ) : (
              <>
                INCOIS's analysis assimilates Argo, so this float may be one of the observations
                that went into it. That is the question a forecaster actually asks: did the
                analysis reproduce the measurement it was given, here, at this depth? It does not
                always - across this bake the disagreement runs from 0.00 to 1.99 &deg;C.
              </>
            )}
          </p>

          {collocation?.observedOnly?.chlorophyll && volume && (
            <ObservedOnly
              series={collocation.observedOnly.chlorophyll}
              when={collocation.observedOnlyTime}
              sameDive={collocation.observedOnlySameDive !== false}
            />
          )}

          {series.aboveModel > 0 && (
            <p className="note">
              The model's shallowest level is {volume.surfaceMetres} m, so the top{" "}
              {series.aboveModel === 1
                ? "measurement of this cast has"
                : `${series.aboveModel} measurements of this cast have`}{" "}
              nothing to compare against.{" "}
              {series.aboveModel === 1 ? "It is" : "They are"} left out rather than extrapolated
              into - the very surface is the number people most want, and inventing it would be
              the worst place to start.
            </p>
          )}
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

      <button className="ghost wide" onClick={() => onFocus(shown.lon, shown.lat)}>
        Centre the view on this float
      </button>
    </aside>
  );
}

/** Title Case from the GTS feed's shouting. "INDIA" on a panel reads as an error. */
function titleCase(value: string): string {
  return value.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/** How deep chlorophyll is worth drawing. Below the euphotic zone it is zero everywhere. */
const CHLOROPHYLL_FLOOR = 300;

/**
 * A quantity this instrument measured that the model has no counterpart for.
 *
 * Chlorophyll is the one that exists today, and it is drawn on its own rather than as half of a
 * comparison, because there is nothing to compare it against: no gridded chlorophyll shares this
 * timeline. INCOIS publish ocean colour themselves and both series are dead - `IRS_chlorophyll`
 * ends 2006-03-21 and the Oceansat-2 product ends 2020-05-01 - so the honest thing is one curve
 * with a sentence saying why there is only one.
 *
 * It gets its own depth axis, linear and stopping at 300 m. The main chart's warp exists to give
 * the thermocline room down a 2000 m column; chlorophyll lives in the top 100 m and is zero
 * below the sunlight, so stretching it down the same axis would draw a flat line through four
 * fifths of the panel.
 */
function ObservedOnly({
  series,
  when,
  sameDive,
}: {
  series: ObservedOnlySeries;
  when?: string;
  sameDive: boolean;
}) {
  const points = series.depths
    .map((depth, index) => ({ depth, value: series.observed[index] }))
    .filter(
      (p): p is { depth: number; value: number } =>
        p.value !== null && Number.isFinite(p.value) && p.depth <= CHLOROPHYLL_FLOOR,
    );
  if (points.length < 2) return null;

  const height = 150;
  const pad = { top: 10, right: 16, bottom: 30, left: 48 };
  const plotWidth = WIDTH - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;

  const deepest = Math.max(...points.map((p) => p.depth)) || 1;
  const peak = Math.max(...points.map((p) => p.value));
  // A fluorometer reads a little below zero in clean deep water - the factory dark count is
  // subtracted - so the axis starts at the real minimum rather than at zero, which would clip
  // perfectly good measurements off the bottom of the chart.
  const floor = Math.min(0, ...points.map((p) => p.value));
  const span = peak - floor || 1;

  const x = (value: number) => pad.left + ((value - floor) / span) * plotWidth;
  const y = (depth: number) => pad.top + (depth / deepest) * plotHeight;

  const path = points
    .map((p, i) => `${i ? "L" : "M"}${x(p.value).toFixed(1)},${y(p.depth).toFixed(1)}`)
    .join("");
  const ticks = [0, Math.round(deepest / 2), Math.round(deepest)];

  return (
    <figure className="chart chart-secondary">
      <figcaption className="chart-title">
        {series.label} ({series.units}) vs depth (m)
      </figcaption>
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        role="img"
        aria-label={`${series.label} against depth, measured by this float`}
      >
        {ticks.map((depth) => (
          <g key={depth}>
            <line
              x1={pad.left}
              x2={WIDTH - pad.right}
              y1={y(depth)}
              y2={y(depth)}
              className="grid"
            />
            <text x={pad.left - 7} y={y(depth) + 3} className="tick tick-y">
              {depth}
            </text>
          </g>
        ))}
        {[floor, peak].map((value) => (
          <text key={value} x={x(value)} y={height - pad.bottom + 15} className="tick tick-x">
            {value.toFixed(2)}
          </text>
        ))}
        <path d={path} className="line-observed line-chlorophyll" />
      </svg>
      <p className="note">
        Measured by this float&apos;s fluorometer{when ? ` on ${when.slice(0, 10)}` : ""}.
        {sameDive
          ? " "
          : " That is this float's neighbouring dive - the BGC product is assembled a cycle" +
            " behind the core one. "}
        There is no second curve because no gridded chlorophyll shares this timeline:
        INCOIS&apos;s own ocean-colour products end in 2006 and 2020. It is an observation with
        nothing to hold it against, which is what Observation Coverage says one variable along.
      </p>
    </figure>
  );
}


/**
 * Why a Collocation came back with nothing matched, in its own terms.
 *
 * Three different causes, and they are not interchangeable. Saying "no data" for all of them
 * would hide the one that is actually a decision the platform made on purpose.
 */
function whyEmpty(series: CollocationSeries, volume: VolumeSpec): string {
  const depths = series.depths.filter((d) => Number.isFinite(d));
  const shallowest = depths.length ? Math.min(...depths) : NaN;
  const deepest = depths.length ? Math.max(...depths) : NaN;

  if (depths.length && deepest < volume.surfaceMetres) {
    return (
      `Every measurement in this cast is shallower than ${volume.surfaceMetres} m, which is the` +
      ` model's topmost level, so there is nothing to compare it against. The cast is real; the` +
      ` model simply does not reach that high, and extrapolating it upward would be inventing` +
      ` the one number people most want.`
    );
  }
  if (depths.length && shallowest > volume.floorMetres) {
    return (
      `This cast only reported below ${volume.floorMetres.toFixed(0)} m, which is as deep as the` +
      ` analysis goes, so none of it can be compared. Argo floats park at 2000 m and the model` +
      ` stops there too.`
    );
  }
  return (
    "The model has no water column at this position. This float is close enough to land that" +
    " one of the four analysis grid points around it is dry, and the model refuses to blend a" +
    " sea temperature out of the open-ocean points on the other side - near a coastline those" +
    " are a different body of water, and averaging them in would manufacture a measurement." +
    " The float's own profile is perfectly good; there is just nothing here to hold it against."
  );
}

function Chart({
  series,
  spec,
  volume,
  anchored,
}: {
  series: CollocationSeries;
  spec: { label: string; units: string };
  volume: VolumeSpec;
  /** A moored buoy, not a drifting float. It changes two words and the depth axis. */
  anchored: boolean;
}) {
  // The Depth Warp, read back from the axis the pipeline shipped rather than re-derived here.
  // A third copy of the formula would drift out of step the moment the pipeline changed, and
  // nothing would catch it: the chart exists to corroborate the 3D view.
  // Warped, as the 3D view is - the chart exists to corroborate it - but normalised to the part
  // of the column this instrument reached rather than to the whole 2000 m.
  const warp = (metres: number, floorMetres: number) =>
    depthToAxis(volume, metres) / Math.max(depthToAxis(volume, floorMetres), 1e-6);
  // Only the depth figures this instrument actually reached, plus the one below it so the
  // curve does not end flush against the frame. A moored buoy's deepest sensor is 500 m and
  // drawing its profile down a 2000 m axis squashed the whole measurement into the top third
  // under two gridlines with nothing on them.
  const deepest = Math.max(
    ...series.depths.filter((d, i) => Number.isFinite(d) && series.observed[i] != null),
    volume.surfaceMetres,
  );
  const all = depthTicksFor(volume);
  const below = all.findIndex((d) => d >= deepest);
  const ticks = below < 0 ? all : all.slice(0, below + 1);
  const floor = ticks[ticks.length - 1] ?? volume.floorMetres;

  // The axis stops where the instrument stopped, so everything drawn has to stop there too.
  // The model has values far below the deepest sensor - a buoy carries density at four levels,
  // because density needs both temperature and salinity, while the model has it to 500 m - and
  // the model curve was being drawn at those depths regardless, straight out of the bottom of
  // the frame. Below the last measurement there is nothing to compare against anyway, which is
  // the only thing this chart is for.
  const drawn = (index: number) => {
    const depth = series.depths[index];
    return depth !== undefined && Number.isFinite(depth) && depth <= floor;
  };

  const finite: number[] = [];
  series.depths.forEach((_, index) => {
    if (!drawn(index)) return;
    for (const value of [series.observed[index], series.modelled[index]]) {
      if (value != null && Number.isFinite(value)) finite.push(value);
    }
  });
  if (finite.length === 0) return <p className="empty">Nothing to plot.</p>;

  const low = Math.min(...finite);
  const high = Math.max(...finite);
  const pad = (high - low) * 0.08 || 0.5;
  const vMin = low - pad;
  const vMax = high + pad;

  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const x = (value: number) => PAD.left + ((value - vMin) / (vMax - vMin)) * plotWidth;
  const y = (depth: number) => PAD.top + warp(depth, floor) * plotHeight;

  const path = (values: (number | null)[]) => {
    let d = "";
    let pen = false;
    values.forEach((value, index) => {
      const depth = series.depths[index];
      if (value === null || depth === undefined || !Number.isFinite(value) || !drawn(index)) {
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
      if (observed == null || modelled == null || !drawn(index)) return;
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
        {ticks.map((depth) => (
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
        <span className="key key-observed">Measured by the {anchored ? "buoy" : "float"}</span>
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
  range,
}: {
  series: CollocationSeries;
  units: string;
  label: string;
  /** The Field's encoded range, which is what the thresholds are a fraction of. */
  range: [number, number];
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

  const [close, large] = thresholds(range);
  const tone = rms < close ? "good" : rms < large ? "fair" : "poor";
  const headline =
    rms < close
      ? "Close agreement."
      : rms < large
        ? "Moderate disagreement."
        : "Large disagreement.";

  const detail =
    rms < close
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
/**
 * Where "close" and "large" sit, as a fraction of the Field's own encoded range.
 *
 * These were 0.6 and 1.5 flat, which are degrees Celsius wearing no units. Applied to salinity
 * they made the verdict a constant: 0.6 PSU is a sixth of the entire range the field occupies,
 * so 82 of 85 floats read "Close agreement" and the headline stopped carrying information.
 * Density, added later, landed in exactly the same place.
 *
 * The fractions are the ones temperature already implied - 0.6 and 1.5 against its 27.4 degC
 * range - so temperature's verdicts are unchanged and every other Field is judged on the same
 * terms rather than on temperature's. There is no per-Field constant to keep in step: a new
 * collocated Field is scaled correctly the moment it has a range.
 *
 * They are a judgement about wording, not a measurement, and they are stated rather than buried.
 */
const CLOSE_FRACTION = 0.6 / 27.42;
const LARGE_FRACTION = 1.5 / 27.42;

function thresholds(range: [number, number]): [number, number] {
  const span = Math.abs(range[1] - range[0]);
  return [span * CLOSE_FRACTION, span * LARGE_FRACTION];
}

const SENSE: Record<string, [string, string]> = {
  temperature: ["cooler than", "warmer than"],
  salinity: ["fresher than", "more saline than"],
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
        {/*
          * The class says which way the *model* read, which is what the number underneath it
          * means. It used to be `cool` when `bias < 0`, and `bias < 0` is the model reading
          * high - so the name encoded the opposite of the physics, and meant nothing at all on
          * salinity or density.
          */}
        <span className={`stat-value ${modelReads(bias)}`}>{signed(bias)}</span>
        <span className="stat-label">average gap {units}</span>
      </div>
      <div>
        <span className="stat-value">
          {series.rmsResidual === null ? "-" : series.rmsResidual.toFixed(2)}
        </span>
        {/* Not "typical": RMS is the quadratic mean and is always at least the mean absolute
            deviation, so a statistician reading "typical" would be reading the wrong quantity. */}
        <span className="stat-label">RMS gap {units}</span>
      </div>
    </div>
  );
}

/** Which way the model read, from `residual = observed - modelled`. */
function modelReads(bias: number | null): string {
  if (bias === null || Math.abs(bias) < 0.005) return "";
  return bias > 0 ? "model-low" : "model-high";
}

/**
 * A signed number that never prints a negative zero.
 *
 * `(-0.001).toFixed(2)` is "-0.00", which reads as a bug to anyone looking carefully. Rounding
 * before formatting means a value that rounds to nothing prints as nothing signed.
 */
function signed(value: number | null): string {
  if (value === null) return "-";
  const rounded = Number(value.toFixed(2));
  if (rounded === 0) return "0.00";
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(2)}`;
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

