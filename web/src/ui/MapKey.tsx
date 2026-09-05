import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { biasColour } from "../palette";
import { useStore } from "../store";

/** Remembered per browser, so a reader who folds it away keeps it folded. */
const OPEN_KEY = "samudra.mapkey";
/** And where they dragged it to, for the same reason. */
const POS_KEY = "samudra.mapkey.pos";

/** How far clear of the control panel the key sits once it has to move. */
const CLEARANCE = 12;
/** Never let a dragged key leave the window; keep this much of it reachable. */
const MARGIN = 8;

type Spot = { left: number; top: number };

function readSpot(): Spot | null {
  try {
    const raw = window.localStorage.getItem(POS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Spot;
    return Number.isFinite(parsed?.left) && Number.isFinite(parsed?.top) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Where the key sits, and why it is not simply pinned to a corner.
 *
 * It used to be `left: 18px; bottom: 104px` - the same column as the control panel, which grows
 * downwards as groups open. Measured at 1600x900 and at 1366x768 with every group open, the
 * panel covered **33,768 px2 of a 268 x 126 key: all of it**, and the panel wins on z-index, so
 * the legend for everything drawn on the water was simply gone. `DepthRuler` already solves the
 * neighbouring problem by measuring the panel rather than assuming its size, and this is the
 * same measurement: when the panel's own box reaches the key's box, the key steps to the right
 * of the panel, which is where it already sits in the volume view.
 *
 * The test has to run against the key's **natural** left, not its current one, or the shift
 * removes the overlap that caused it and the two positions oscillate for ever.
 */
function usePlacement(inVolume: boolean, folded: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  /** Where the key sits with nothing applied. Re-read whenever the view changes. */
  const natural = useRef<{ left: number; top: number; height: number } | null>(null);
  const [shift, setShift] = useState<{ left?: number; bottom?: number } | null>(null);
  const [spot, setSpot] = useState<Spot | null>(readSpot);

  useLayoutEffect(() => {
    natural.current = null;
    setShift(null);
  }, [inVolume]);

  const place = useCallback(() => {
    const el = ref.current;
    if (!el || spot) return;
    const panel = document.querySelector(".panel-left");
    if (!panel) return;
    const now = el.getBoundingClientRect();
    if (shift === null) natural.current = { left: now.left, top: now.top, height: now.height };
    const base = natural.current;
    if (!base) return;

    const hits = (b: DOMRect, left: number, top: number) =>
      Math.min(b.right, left + now.width) - Math.max(b.left, left) > 0 &&
      Math.min(b.bottom, top + base.height) - Math.max(b.top, top) > 0;

    // 1. Clear the control panel by stepping to its right, which is where the key already sits
    //    in the volume view.
    const panelBox = panel.getBoundingClientRect();
    const left = hits(panelBox, base.left, base.top)
      ? Math.round(panelBox.right + CLEARANCE)
      : base.left;

    // 2. That can walk the key into the timeline on a short window, so check the place it is
    //    actually going rather than the place it came from.
    const rail = document.querySelector(".timeline")?.getBoundingClientRect();
    const bottom =
      rail && hits(rail, left, base.top)
        ? Math.round(window.innerHeight - rail.top + CLEARANCE)
        : undefined;

    const next =
      left === base.left && bottom === undefined ? null : { left, bottom };
    // Only re-render when the answer actually moved, or this settles into a loop.
    setShift((was) =>
      was?.left === next?.left && was?.bottom === next?.bottom ? was : next,
    );
  }, [shift, spot]);

  // Bounded to when the answer can change. Without the dependency this ran on every render,
  // and two forced layout reads per frame during playback is a real cost for a legend that
  // moves about twice a session. Everything that *can* move it is observed below.
  useLayoutEffect(place, [place]);

  /*
   * Re-measure when the layout settles, not only when something is resized.
   *
   * The panel *slides in* over 0.42 s, so a measurement taken on mount reads its animated
   * position, not its resting one - at 1280x720 that cached a panel right edge of 344 instead
   * of 358 and left the key 2 px inside the panel. A ResizeObserver never corrects it either,
   * because the panel is *moving*, not changing size.
   */
  useEffect(() => {
    const panel = document.querySelector(".panel-left");
    const observer = new ResizeObserver(place);
    if (panel) {
      observer.observe(panel);
      panel.addEventListener("animationend", place);
    }
    const rail = document.querySelector(".timeline");
    if (rail) observer.observe(rail);
    const settle = window.setTimeout(place, 700);
    window.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      if (panel) panel.removeEventListener("animationend", place);
      window.clearTimeout(settle);
      window.removeEventListener("resize", place);
    };
  }, [place, folded]);

  /** Drag from anywhere on the key that is not itself a control. */
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button, a, input")) return;
    const el = ref.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const grabX = event.clientX - box.left;
    const grabY = event.clientY - box.top;
    el.setPointerCapture(event.pointerId);
    el.classList.add("dragging");

    const move = (e: PointerEvent) => {
      setSpot({
        left: Math.min(
          Math.max(e.clientX - grabX, MARGIN),
          window.innerWidth - el.offsetWidth - MARGIN,
        ),
        top: Math.min(
          Math.max(e.clientY - grabY, MARGIN),
          window.innerHeight - el.offsetHeight - MARGIN,
        ),
      });
    };
    const up = () => {
      el.classList.remove("dragging");
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      try {
        const landed = el.getBoundingClientRect();
        window.localStorage.setItem(
          POS_KEY,
          JSON.stringify({ left: Math.round(landed.left), top: Math.round(landed.top) }),
        );
      } catch {
        // Remembering is a convenience; failing to must never cost the drag.
      }
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };

  const reset = () => {
    setSpot(null);
    setShift(null);
    natural.current = null;
    try {
      window.localStorage.removeItem(POS_KEY);
    } catch {
      // As above.
    }
  };

  // A dragged key is pinned to the window, so it takes both axes and gives up `bottom`.
  const style: React.CSSProperties = spot
    ? { left: `${spot.left}px`, top: `${spot.top}px`, bottom: "auto" }
    : shift
      ? {
          left: `${shift.left}px`,
          ...(shift.bottom === undefined ? {} : { bottom: `${shift.bottom}px` }),
        }
      : {};

  return { ref, style, onPointerDown, reset, moved: spot !== null };
}

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
  // Before the early return: a hook cannot be called conditionally.
  const placement = usePlacement(morph > 0.5, !open);
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
    <div
      ref={placement.ref}
      className={`mapkey ${morph > 0.5 ? "in-volume" : "on-globe"}${open ? "" : " shut"}`}
      style={placement.style}
      onPointerDown={placement.onPointerDown}
    >
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
      {/* Only offered once the key has actually been moved: a reset for a thing that is where
          it has always been is a control that does nothing. */}
      {placement.moved && (
        <button
          type="button"
          className="mapkey-reset"
          onClick={placement.reset}
          title="Put the key back where it started"
        >
          reset
        </button>
      )}
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
