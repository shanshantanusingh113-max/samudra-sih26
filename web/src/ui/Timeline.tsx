import { useStore } from "../store";

export function Timeline() {
  const { manifest, timestepIndex, playing, set } = useStore();
  if (!manifest) return null;

  const steps = manifest.timesteps;
  const current = steps[timestepIndex];

  return (
    <div className="timeline">
      <button
        className="play"
        onClick={() => {
          set("touched", "timestep");
          set("playing", !playing);
        }}
        aria-label="Play"
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
          onFocus={() => set("touched", "timestep")}
          onChange={(e) => {
            set("touched", "timestep");
            set("timestepIndex", Number(e.target.value));
          }}
        />
        <div className="timeline-ticks">
          {steps.map((stamp, index) => (
            <span
              key={stamp}
              className={index === timestepIndex ? "on" : ""}
              onClick={() => set("timestepIndex", index)}
            >
              {new Date(stamp).toISOString().slice(5, 10)}
            </span>
          ))}
        </div>
      </div>

      <div className="timeline-stamp">
        <span className="timeline-date">
          {current ? new Date(current).toISOString().slice(0, 10) : "-"}
        </span>
        <span className="timeline-note">10-day analysis</span>
      </div>
    </div>
  );
}
