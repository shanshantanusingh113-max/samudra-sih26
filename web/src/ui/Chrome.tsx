import { useCallback, useRef, useState } from "react";
import { copyCurrentView } from "../deeplink";
import { applyTheme, useStore } from "../store";

/**
 * Publish the source credits' measured height, so the timeline can sit above them.
 *
 * The two shared the foot of the screen and overlapped in every state - 8,078 px2 at 1600x900
 * and 19,041 px2 at 1366x768, where the credits wrap to a second line. Attribution for Argo,
 * INCOIS, Copernicus and NOAA is a licence obligation, so it is the last thing that should be
 * sitting under a control.
 *
 * The height is measured rather than written down because it changes with the window: the
 * credits wrap, and how many lines they take depends on the width and on how many sources the
 * bake holds. A number chosen for one viewport is wrong at the next.
 */
function usePublishedHeight() {
  const watcher = useRef<ResizeObserver | null>(null);
  // A callback ref, not an effect. The footer only exists once the manifest has loaded, so an
  // effect with no dependencies would re-create the observer on every render - and `Chrome`
  // re-renders on every store change, which during playback is every frame.
  return useCallback((el: HTMLElement | null) => {
    watcher.current?.disconnect();
    if (!el) return;
    const publish = () => {
      document.documentElement.style.setProperty(
        "--attribution-height",
        `${Math.ceil(el.getBoundingClientRect().height)}px`,
      );
    };
    publish();
    watcher.current = new ResizeObserver(publish);
    watcher.current.observe(el);
  }, []);
}

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
  // What the copy button last did, so it can say so for a moment. A control that fires and
  // shows nothing is a control a user presses three times.
  const [copied, setCopied] = useState<"" | "copied" | "failed">("");
  // Before the early return: a hook cannot be called conditionally.
  const credits = usePublishedHeight();
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
          {/*
            * Two readouts, inline, with no boxes.
            *
            * These were bordered tiles with the label stacked over the value, which made two
            * pieces of text look like two form fields and took about a third of the bar. They
            * are readouts: a label and a number, on one line, in the same mono the rest of the
            * console uses. The rule after them separates what the app is showing from what the
            * user can press, which is the only division on this bar that means anything.
            */}
          <dl className="topbar-readouts">
            <div>
              <dt>Analysis</dt>
              <dd>{stamp ? new Date(stamp).toISOString().slice(0, 10) : "-"}</dd>
            </div>
            <div>
              <dt>Field</dt>
              <dd className="topbar-field">{spec?.label.replace("Sea Water ", "") ?? "-"}</dd>
            </div>
          </dl>

          <span className="topbar-rule" aria-hidden="true" />

          <button
            className="icon-button"
            onClick={flipTheme}
            title={theme === "dark" ? "Switch to light console" : "Switch to dark console"}
            aria-label={theme === "dark" ? "Switch to light console" : "Switch to dark console"}
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
          {/*
            * The link to what is on screen.
            *
            * `applyDeepLink` has read these parameters since the requirements page was built and
            * nothing could write one. That gap is the whole "e-learning initiatives" clause: a
            * teacher's worksheet is six links, and a forecaster hands a colleague a view rather
            * than a description of one. See `deeplink.ts`.
            */}
          <button
            className="icon-button"
            onClick={async () => {
              const result = await copyCurrentView();
              setCopied(result.copied ? "copied" : "failed");
              window.setTimeout(() => setCopied(""), 2400);
            }}
            title="Copy a link to exactly this view"
            aria-label="Copy a link to exactly this view"
          >
            {copied === "copied" ? "✓" : copied === "failed" ? "!" : "🔗"}
          </button>
          {/* Offered on the top bar rather than buried, because the people it is for are the
              ones who would never find it in a panel. */}
          <button
            className="ghost tour-start"
            onClick={() => set("tourStep", 0)}
            title="A guided walk through every control, in six chapters"
          >
            Show me around
          </button>
          {/*
            * The second door. PS 26067 names school students, the public and policymakers, and
            * fifteen variables in five groups is the wrong first minute for all three. One
            * button, and everything outreach lives behind it rather than in this bar.
            */}
          <button
            className="ghost"
            onClick={() => set("explore", true)}
            title="The same platform, as a list of questions"
          >
            Explore
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

      <footer className="attribution" ref={credits}>
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
