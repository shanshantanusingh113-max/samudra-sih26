import { useEffect, useMemo, useRef } from "react";
import { colourOf, liftedPalette } from "../palette";
import { castsNearLine, sectionAlong, type SectionCut } from "../section";
import { useStore } from "../store";

/**
 * The vertical section, drawn.
 *
 * Depth down, distance along the line across, the Field's own colour scale for the value, and
 * every float cast within the corridor marked on the same axes. It is the standard figure of
 * physical oceanography and it is the one an oceanographer on a panel recognises before reading
 * a single label.
 *
 * **Three things about how it is drawn are decisions, not defaults.**
 *
 * The depth axis is **linear in metres**, not the Volume's Depth Warp. The warp exists to give
 * a GPU an even texture axis and it deliberately gives the upper ocean more of the block; a
 * chart somebody measures off has to be linear or the thermocline sits at the wrong depth.
 *
 * The colour comes from `colourOf`, which is the same function the colourbar and the hazard
 * Sheets use, through the same `liftedPalette`. So the section, the water behind it and the
 * swatch in the panel cannot disagree - ADR 0007, and the reason the log Scale was cut once.
 *
 * A gap is drawn as a **gap**. Where the model has no ocean - land, or below the sea floor -
 * nothing is painted and the panel's own background shows through. Interpolating across it
 * would draw a smooth wall of plausible water where there is rock.
 */
export function SectionPanel() {
  const store = useStore();
  const canvas = useRef<HTMLCanvasElement>(null);
  const { manifest, sectionFrom, sectionTo, fieldKey, timestepIndex, theme } = store;

  const grid = manifest?.gridFiles?.[fieldKey]
    ? store.nativeGrids[`${fieldKey}|${timestepIndex}`]
    : undefined;
  const spec = store.field();

  const whenMs = new Date(manifest?.timesteps[timestepIndex] ?? 0).getTime();
  const windowDays = manifest?.coverage?.windowDays;

  // Memoised, and the dependency arrays below depend on it.
  //
  // Both of these ran in the component body: 121 points x 24 Levels, and 237 instruments x up
  // to 12 fixes, on every React render - and because each returned a new object every time, the
  // `useEffect` underneath repainted the whole canvas on every render too. Dragging the
  // corridor slider did all three per frame.
  const cut: SectionCut | null = useMemo(
    () =>
      manifest && grid && sectionFrom && sectionTo
        ? sectionAlong(grid, manifest.volume, sectionFrom, sectionTo)
        : null,
    [manifest, grid, sectionFrom, sectionTo],
  );

  const casts = useMemo(
    () =>
      manifest && sectionFrom && sectionTo
        ? castsNearLine(
            store.floats,
            sectionFrom,
            sectionTo,
            store.sectionCorridorKm,
            whenMs,
            windowDays,
          )
        : [],
    [manifest, store.floats, sectionFrom, sectionTo, store.sectionCorridorKm, whenMs, windowDays],
  );

  useEffect(() => {
    const element = canvas.current;
    if (!element || !cut || !spec || !manifest) return;
    const context = element.getContext("2d");
    if (!context) return;

    const ratio = Math.min(window.devicePixelRatio, 2);
    const width = element.clientWidth;
    const height = element.clientHeight;
    element.width = Math.round(width * ratio);
    element.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    const left = 46;
    const bottom = 22;
    const plotWidth = width - left - 8;
    const plotHeight = height - bottom - 8;
    const totalKm = cut.distancesKm[cut.distancesKm.length - 1] ?? 1;
    const deepest = cut.levels[cut.levels.length - 1] ?? 2000;
    const lifted = liftedPalette(manifest.palettes[spec.palette] ?? [], theme);

    // One filled rectangle per (Level, sample). Rectangles rather than an ImageData blit
    // because the Levels are unevenly spaced - 5 m to 2000 m in 24 steps - so a row's height on
    // a linear depth axis is a property of that Level, not a constant.
    const x = (km: number) => left + (km / Math.max(totalKm, 1e-6)) * plotWidth;
    const y = (metres: number) => 8 + (metres / deepest) * plotHeight;

    for (let level = 0; level < cut.levels.length; level++) {
      const top = level === 0 ? 0 : ((cut.levels[level - 1] ?? 0) + (cut.levels[level] ?? 0)) / 2;
      const base =
        level === cut.levels.length - 1
          ? deepest
          : ((cut.levels[level] ?? 0) + (cut.levels[level + 1] ?? 0)) / 2;
      const row = cut.values[level];
      if (!row) continue;

      for (let index = 0; index < row.length; index++) {
        const value = row[index] ?? Number.NaN;
        const colour = colourOf(value, spec, store.windowMin, store.windowMax, store.scale, lifted);
        if (!colour) continue;
        const x0 =
          index === 0
            ? x(cut.distancesKm[0] ?? 0)
            : x(((cut.distancesKm[index - 1] ?? 0) + (cut.distancesKm[index] ?? 0)) / 2);
        const x1 =
          index === row.length - 1
            ? x(totalKm)
            : x(((cut.distancesKm[index] ?? 0) + (cut.distancesKm[index + 1] ?? 0)) / 2);
        context.fillStyle = `rgb(${colour[0]},${colour[1]},${colour[2]})`;
        context.fillRect(x0, y(top), Math.max(x1 - x0 + 0.5, 1), Math.max(y(base) - y(top), 1));
      }
    }

    // The instruments, on the same axes. A tick down to the depth that cast actually reached,
    // because a mark drawn the full height would claim a 2000 m profile from a buoy whose
    // deepest sensor is 180 m.
    const ink = getComputedStyle(element).getPropertyValue("--on-surface").trim() || "#fff";
    context.strokeStyle = ink;
    context.globalAlpha = 0.75;
    context.lineWidth = 1;
    for (const cast of casts) {
      const at = x(cast.distanceKm);
      context.beginPath();
      context.moveTo(at, y(0));
      context.lineTo(at, y(Math.min(cast.depthMax, deepest)));
      context.stroke();
      context.beginPath();
      context.arc(at, y(0) + 3, 2.5, 0, Math.PI * 2);
      context.fillStyle = ink;
      context.fill();
    }
    context.globalAlpha = 1;

    // Axes, last, so nothing paints over them.
    context.strokeStyle = ink;
    context.globalAlpha = 0.35;
    context.beginPath();
    context.moveTo(left, 8);
    context.lineTo(left, 8 + plotHeight);
    context.lineTo(left + plotWidth, 8 + plotHeight);
    context.stroke();
    context.globalAlpha = 1;

    context.fillStyle = ink;
    context.font = "10px var(--mono), monospace";
    context.textAlign = "right";
    for (const metres of [0, 200, 500, 1000, 2000].filter((d) => d <= deepest)) {
      context.fillText(`${metres}`, left - 5, y(metres) + 3);
    }
    context.textAlign = "center";
    for (const fraction of [0, 0.5, 1]) {
      context.fillText(
        `${(totalKm * fraction).toFixed(0)} km`,
        x(totalKm * fraction),
        height - 7,
      );
    }
  }, [cut, casts, spec, manifest, store.windowMin, store.windowMax, store.scale, theme]);

  if (!sectionFrom || !sectionTo || !spec) return null;

  const totalKm = cut?.distancesKm[cut.distancesKm.length - 1] ?? 0;

  return (
    <aside className="panel panel-section">
      <div className="section-head">
        <label>Vertical section</label>
        <span className="readout">
          {spec.label.replace("Sea Water ", "")} &middot; {totalKm.toFixed(0)} km
        </span>
        <button
          type="button"
          className="section-close"
          aria-label="Close the section"
          onClick={() => useStore.setState({ sectionFrom: null, sectionTo: null, placingSection: 0 })}
        >
          &#10005;
        </button>
      </div>

      {!cut ? (
        <p className="note">Loading the grid this is cut from&hellip;</p>
      ) : (
        <>
          {/*
            * A picture with a text alternative, not a bare canvas.
            *
            * The 3D view was given a role, a label and keyboard navigation in an earlier round
            * because a public-sector procurement asks; the newest chart in the app had none of
            * it. The label carries the same four facts the caption does, so a reader who cannot
            * see the figure is told what it is, how long, how deep and how many casts.
            */}
          <canvas
            ref={canvas}
            className="section-canvas"
            role="img"
            aria-label={
              `Vertical section of ${spec.label.replace("Sea Water ", "").toLowerCase()} in ` +
              `${spec.units}, ${totalKm.toFixed(0)} km long, from the surface to ` +
              `${(cut.levels[cut.levels.length - 1] ?? 2000).toFixed(0)} m, with ` +
              `${casts.length} instrument cast${casts.length === 1 ? "" : "s"} marked. ` +
              `Read the numbers along it by clicking a float, or from the API at /api/section.`
            }
          />
          <p className="note">
            Depth in metres down, distance along your line across, {spec.units} as colour.{" "}
            <strong>{casts.length}</strong> cast{casts.length === 1 ? "" : "s"} within{" "}
            {store.sectionCorridorKm} km of the line{" "}
            {windowDays === undefined ? "" : `and ${windowDays} days of this analysis `}
            {casts.length === 1 ? "is" : "are"} marked, each drawn down to the depth it actually
            reached. Blank is where the model has no ocean.
          </p>
        </>
      )}
    </aside>
  );
}
