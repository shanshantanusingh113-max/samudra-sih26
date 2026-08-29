import { useStore } from "../store";

/**
 * A key for the things drawn on the water.
 *
 * Nothing on screen said what the white dots or the red lines were, so a first-time viewer had
 * no way to know they were looking at instruments and their drift. An unexplained mark is worse
 * than no mark: it reads as decoration, and decoration on a scientific display undermines
 * everything next to it.
 */
export function MapKey() {
  const { manifest, morph, showFloats, showTracks, timestepIndex, currentsOpacity } = useStore();
  if (!manifest) return null;
  const moorings = manifest.instruments?.moorings ?? 0;

  const stamp = manifest.timesteps[timestepIndex];
  const when = stamp ? new Date(stamp).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "";

  return (
    <div className={`mapkey ${morph > 0.5 ? "in-volume" : "on-globe"}`}>
      <span className="mapkey-label">On the water</span>

      {showFloats && (
        <span className="mapkey-item">
          <span className="swatch float" aria-hidden="true" />
          Argo float, where it was on {when}
        </span>
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

      {/* Only on the globe and the map. In the Volume View the sea surface is cut away over the
          region so you can see into the water, and the current arrows are composited into that
          surface - so they are correctly absent, and naming them here would be a key for
          something not on screen. */}
      {currentsOpacity > 0 && manifest.currents && morph < 0.5 && (
        <span className="mapkey-item">
          <span className="swatch currents" aria-hidden="true" />
          Surface current, drawn by Copernicus
        </span>
      )}

      <span className="mapkey-item">
        <span className="swatch coast" aria-hidden="true" />
        Coastline
      </span>
    </div>
  );
}
