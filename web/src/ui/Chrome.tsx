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
  const store = useStore();
  const { manifest, stage, morph, field, timestepIndex, theme, touched, set } = store;
  if (!manifest) return null;

  const flipTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    set("theme", next);
    applyTheme(next);
  };

  const spec = field();
  const stamp = manifest.timesteps[timestepIndex];
  // Split by kind: nine of the instruments on the water are anchored buoys, not Argo floats,
  // and calling them all floats is the same class of error as calling all 221 of them
  // "reporting" when only 184 are.
  const reporting = store.reportingByKind();
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
          {/* Offered on the top bar rather than buried, because the people it is for are the
              ones who would never find it in a panel. */}
          <button
            className="ghost tour-start"
            onClick={() => set("tourStep", 0)}
            title="A five-step walk through what this shows"
          >
            Show me around
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

      {!inVolume && stage !== "diving" && !touched && (
        <div className="cue">
          <p className="cue-title">India&apos;s Exclusive Economic Zone</p>
          {/* Not manifest.floatCount. That is every Float in the bake; this card is a claim
              about what is on the water right now, and a Float whose nearest cast is outside
              the window is not drawn. At the step the app opens on the two differ by 37. */}
          <p className="cue-body">
            {reporting.floats} Argo floats
            {reporting.moorings > 0 && ` and ${reporting.moorings} moored buoys`} reporting over
            the Arabian Sea, the Bay of Bengal and the equatorial Indian Ocean on{" "}
            {stamp ? stamp.slice(0, 10) : "this date"}. The colour on the sea is INCOIS&apos;s
            own gridded analysis - the same field you are about to fly into.
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
