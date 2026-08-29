import { useStore } from "../store";

export function Timeline() {
  const { manifest, timestepIndex, playing, set } = useStore();
  if (!manifest) return null;

  const steps = manifest.timesteps;
  const current = steps[timestepIndex];
  const shown = current ? new Date(current).toISOString().slice(0, 10) : "-";

  return (
    <div className="timeline">
      <button
        className="play"
        onClick={() => {
          set("touched", "timestep");
          set("playing", !playing);
        }}
        // The label used to say "Play" in both states, so a screen reader announced the
        // stop control as a start control.
        aria-label={playing ? "Pause the time animation" : "Play the time animation"}
        aria-pressed={playing}
      >
        {playing ? "❚❚" : "▶"}
      </button>

      <div className="timeline-track">
        <input
          type="range"
          min={0}
          max={steps.length - 1}
          step={1}
          value={timestepIndex}
          aria-label="Analysis date"
          aria-valuetext={shown}
          onFocus={() => set("touched", "timestep")}
          onChange={(e) => {
            set("touched", "timestep");
            set("timestepIndex", Number(e.target.value));
          }}
        />
        {/*
          * Buttons, not spans. These were clickable and unreachable by keyboard, which made the
          * tick strip a mouse-only duplicate of a control the slider already offers.
          *
          * Every step stays clickable, but only every other one carries its date. Twelve
          * five-character labels need more width than the track has on a 1366 px screen, and
          * they ran into each other - "04-1004-2004-30" - which reads as a broken axis. The
          * unlabelled steps keep their accessible name, so nothing is lost to a screen reader.
          */}
        <div className="timeline-ticks">
          {steps.map((stamp, index) => {
            const date = new Date(stamp).toISOString().slice(0, 10);
            const labelled = index % 2 === 0 || index === steps.length - 1;
            return (
              <button
                type="button"
                key={stamp}
                className={`${index === timestepIndex ? "on" : ""}${labelled ? "" : " bare"}`}
                aria-label={`Show the analysis of ${date}`}
                aria-current={index === timestepIndex}
                onClick={() => {
                  set("touched", "timestep");
                  set("timestepIndex", index);
                }}
              >
                {labelled ? date.slice(5) : "·"}
              </button>
            );
          })}
        </div>
      </div>

      <div className="timeline-stamp">
        <span className="timeline-date">{shown}</span>
        <span className="timeline-note">10-day analysis</span>
      </div>
    </div>
  );
}
