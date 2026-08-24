import { applyTheme, useStore } from "../store";

export function LoadingScreen() {
  return (
    <div className="loading">
      <div className="loading-mark" />
      <p>Reading INCOIS analysis and Argo profiles…</p>
    </div>
  );
}

export function Chrome({ onDive }: { onDive: (into: boolean) => void }) {
  const { manifest, stage, morph, field, timestepIndex, theme, set } = useStore();
  if (!manifest) return null;

  const flipTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    set("theme", next);
    applyTheme(next);
  };

  const spec = field();
  const stamp = manifest.timesteps[timestepIndex];
  const inVolume = morph > 0.5;

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">SAMUDRA<span className="brand-dim">·3D</span></span>
          <span className="brand-sub">
            Ocean model &amp; in-situ co-visualisation - INCOIS · SIH&nbsp;26067
          </span>
        </div>

        <div className="topbar-right">
          <div className="stamp">
            <span className="stamp-label">Analysis</span>
            <span className="stamp-value">
              {stamp ? new Date(stamp).toISOString().slice(0, 10) : "-"}
            </span>
          </div>
          <div className="stamp">
            <span className="stamp-label">Field</span>
            <span className="stamp-value">{spec?.label ?? "-"}</span>
          </div>
          <button
            className="theme-toggle"
            onClick={flipTheme}
            title={theme === "dark" ? "Switch to light console" : "Switch to dark console"}
            aria-label={theme === "dark" ? "Switch to light console" : "Switch to dark console"}
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
          <button
            className={`dive ${inVolume ? "dive-up" : ""}`}
            onClick={() => onDive(!inVolume)}
            disabled={stage === "diving"}
          >
            {stage === "diving" ? "…" : inVolume ? "Return to globe" : "Dive into the water"}
          </button>
        </div>
      </header>

      {!inVolume && stage !== "diving" && (
        <div className="cue">
          <p className="cue-title">India&apos;s Exclusive Economic Zone</p>
          <p className="cue-body">
            {manifest.floatCount} Argo floats reporting over the Arabian Sea, the Bay of Bengal
            and the equatorial Indian Ocean. The colour on the sea is INCOIS&apos;s own gridded
            analysis - the same field you are about to fly into.
          </p>
        </div>
      )}

      <footer className="attribution">
        {manifest.sources.map((source) => (
          <span key={source.name} title={source.attribution}>
            {source.name}
          </span>
        ))}
        <span className="generated">baked {manifest.generated.slice(0, 10)}</span>
      </footer>
    </>
  );
}
