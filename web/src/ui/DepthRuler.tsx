import { useEffect, useRef, useState } from "react";
import type { OceanScene } from "../scene/OceanScene";
import { depthTicks } from "../scene/geography";
import { useStore } from "../store";

interface Tick {
  metres: number;
  x: number;
  y: number;
  visible: boolean;
}

/**
 * Real depth figures against the side of the Volume.
 *
 * This is not decoration. The Volume's vertical axis is deliberately *not* linear in metres -
 * it is warped so the top 300 m gets about half the axis instead of 15%, because that is where
 * the thermocline lives. Without labels a viewer would reasonably assume the block is
 * proportional and read depths off it that are wrong by hundreds of metres. The ruler makes the
 * non-linearity visible: the gaps between figures are conspicuously uneven, which is the honest
 * signal that the axis is stretched.
 *
 * Drawn as HTML rather than 3D text so the type stays crisp and matches the rest of the console.
 */
export function DepthRuler({ scene }: { scene: OceanScene | null }) {
  const { manifest, exaggeration, morph } = useStore();
  const [ticks, setTicks] = useState<Tick[]>([]);
  const frame = useRef(0);

  const active = morph > 0.55 && !!scene && !!manifest;

  useEffect(() => {
    if (!active || !scene || !manifest) {
      setTicks([]);
      return;
    }
    const marks = depthTicks(manifest.volume);

    const update = () => {
      setTicks(
        marks.map((metres) => ({ metres, ...scene.rulerAnchor(exaggeration, metres) })),
      );
      frame.current = requestAnimationFrame(update);
    };
    frame.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame.current);
  }, [active, scene, manifest, exaggeration]);

  if (!active || ticks.length === 0) return null;

  return (
    <div className="ruler" aria-hidden="true">
      {ticks.map(
        (tick) =>
          tick.visible && (
            <div
              key={tick.metres}
              className="ruler-tick"
              style={{ transform: `translate(${tick.x}px, ${tick.y}px)` }}
            >
              <span className="ruler-line" />
              <span className="ruler-label">{tick.metres === 0 ? "0" : tick.metres} m</span>
            </div>
          ),
      )}
      <p className="ruler-note">depth axis stretched - see the uneven spacing</p>
    </div>
  );
}
