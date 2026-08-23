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
  const { manifest, morph, showFloats, showTracks, timestepIndex } = useStore();
  if (!manifest) return null;

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

      {showTracks && (
        <span className="mapkey-item">
          <span className="swatch track" aria-hidden="true" />
          Its drift since April
        </span>
      )}

      <span className="mapkey-item">
        <span className="swatch coast" aria-hidden="true" />
        Coastline
      </span>
    </div>
  );
}
