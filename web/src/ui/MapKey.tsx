import { useState } from "react";
import { biasColour } from "../palette";
import { useStore } from "../store";

/** Remembered per browser, so a reader who folds it away keeps it folded. */
const OPEN_KEY = "samudra.mapkey";

/**
 * A key for the things drawn on the water.
 *
 * Nothing on screen said what the white dots or the red lines were, so a first-time viewer had
 * no way to know they were looking at instruments and their drift. An unexplained mark is worse
 * than no mark: it reads as decoration, and decoration on a scientific display undermines
 * everything next to it.
 */
export function MapKey() {
  const store = useStore();
  // Foldable, because it is a box sitting on top of the water it is describing. It has to be
  // readable the first time somebody sees the scene and it has to get out of the way after
  // that, and only the reader knows which of those they are doing.
  const [open, setOpen] = useState(() => {
    try {
      return window.localStorage.getItem(OPEN_KEY) !== "closed";
    } catch {
      return true; // a private window that refuses storage still gets a key
    }
  });
  const toggle = () => {
    setOpen((was) => {
      try {
        window.localStorage.setItem(OPEN_KEY, was ? "closed" : "open");
      } catch {
        // Storage is a convenience here; failing to remember must never cost the control.
      }
      return !was;
    });
  };

  const { manifest, morph, showFloats, showTracks, timestepIndex, fieldKey } = store;
  if (!manifest) return null;
  const moorings = manifest.instruments?.moorings ?? 0;

  // On the bias map the dots stop meaning "an instrument" and start meaning "how wrong the
  // analysis was here", so the key has to change with them. A marker whose meaning changed
  // under an unchanged legend is the exact failure the log scale was cut for once.
  const spec = store.field();
  const bias = store.biasMode ? store.fieldResiduals() : null;
  const colours = manifest.palettes.balance ?? [];
  // The same saturation point the markers use, or the legend is a different scale wearing the
  // same colours - which is the exact failure ADR 0007 and `transfer.ts` exist to prevent.
  // No fallback. `LARGE_FRACTION` is the *verdict* threshold and it is the scale that made the
  // map read as white; a legend drawn on it would be describing colours nothing on screen uses.
  // A bake with no measured scale gets no bias legend, and the markers draw hollow to match.
  const saturateAt = bias?.summary.p90ScaledAbs ?? undefined;
  const low = biasColour(-(saturateAt ?? 0), colours, store.theme, saturateAt);
  const mid = biasColour(0, colours, store.theme, saturateAt);
  const high = biasColour(saturateAt ?? 0, colours, store.theme, saturateAt);
  const ends = bias && low && mid && high && saturateAt !== undefined ? { low, mid, high } : null;
  const rgb = (c: [number, number, number]) => `rgb(${c[0]},${c[1]},${c[2]})`;

  const stamp = manifest.timesteps[timestepIndex];
  const when = stamp ? new Date(stamp).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "";

  return (
    <div className={`mapkey ${morph > 0.5 ? "in-volume" : "on-globe"}${open ? "" : " shut"}`}>
      <button
        type="button"
        className="mapkey-label"
        aria-expanded={open}
        onClick={toggle}
        title={open ? "Hide the key" : "Show the key"}
      >
        <span className="mapkey-fold" aria-hidden="true" />
        On the water
      </button>
      {!open ? null : (
        <>

      {showFloats && !ends && (
        <span className="mapkey-item">
          <span className="swatch float" aria-hidden="true" />
          Argo float, where it was on {when}
        </span>
      )}

      {/* The bias map replaces the marker key rather than sitting beside it: the dots are not
          two things at once, and a legend offering both would be describing a picture that is
          not on screen. The figures are the same ones the panel ranks on. */}
      {showFloats && ends && spec && (
        <>
          <span className="mapkey-item">
            <span className="swatch" style={{ background: rgb(ends.low) }} aria-hidden="true" />
            Model reads low by{" "}
            {((saturateAt ?? 0) * Math.abs(spec.range[1] - spec.range[0])).toFixed(2)}{" "}
            {spec.units} or more
          </span>
          <span className="mapkey-item">
            <span className="swatch" style={{ background: rgb(ends.mid) }} aria-hidden="true" />
            Model and instrument agree
          </span>
          <span className="mapkey-item">
            <span className="swatch" style={{ background: rgb(ends.high) }} aria-hidden="true" />
            Model reads high by the same
          </span>
          <span className="mapkey-item">
            <span className="swatch float hollow" aria-hidden="true" />
            No comparison for {spec.label.replace("Sea Water ", "").toLowerCase()}
          </span>
          {/*
            * Why the dots jump when the mode goes on, said where the jump happens.
            *
            * Two things change at once and both are deliberate. Every instrument is drawn,
            * not only the ones that surfaced near the date on screen; and each is drawn at the
            * cast that was compared rather than at where it has drifted to since. So the map
            * gains markers and the markers move, which without this line reads as a bug.
            */}
          <span className="mapkey-note">
            Each one is where its own comparison was taken, across all{" "}
            {manifest.timesteps.length} analyses - not where it was on {when}.
          </span>
        </>
      )}

      {showFloats && moorings > 0 && (
        <span className="mapkey-item">
          <span className="swatch mooring" aria-hidden="true" />
          Moored buoy, anchored in one place
        </span>
      )}

      {showTracks && (
        <span className="mapkey-item">
          <span className="swatch track" aria-hidden="true" />
          A float&apos;s drift since April
        </span>
      )}

      {/* Currents are a Field now, not an overlay, so the key names them exactly when they are
          on screen. They used to be a rendered image with no number behind them; ADR 0013 has
          the measurement that changed that. */}
      {manifest.currents && fieldKey === manifest.currents.field && (
        <span className="mapkey-item">
          <span className="swatch currents" aria-hidden="true" />
          {store.currentStyle === "particles"
            ? "Current, dots carried along the flow. The water's colour is the speed"
            : "Current, arrow along the flow and coloured by speed"}
        </span>
      )}

      {/* Named the moment it is on screen. A violet line nobody explains is decoration, and
          decoration on a scientific display undermines everything beside it. */}
      {(store.driftPin || (store.showDriftCheck && store.selectedFloatId)) && (
        <span className="mapkey-item">
          <span className="swatch drift" aria-hidden="true" />
          Drift the currents imply, not a search forecast
        </span>
      )}

      {store.sectionFrom && store.sectionTo && (
        <span className="mapkey-item">
          <span className="swatch section" aria-hidden="true" />
          Where the vertical section was cut
        </span>
      )}

      <span className="mapkey-item">
        <span className="swatch coast" aria-hidden="true" />
        Coastline
      </span>
        </>
      )}
    </div>
  );
}
