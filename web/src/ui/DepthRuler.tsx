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
 *
 * It used to be anchored to the Volume's near-left edge, and at the default camera that edge is
 * *behind* the control panel - the box is wider than the gap between the two panels, so both of
 * its vertical edges are covered. Measured at 1500 px wide, nine of the ten figures were hidden.
 *
 * So the figures sit in the clear strip just past the panel instead. Only the horizontal
 * position moves: each tick's `y` is still the projection of that depth on the box's edge, which
 * is the whole content of a depth ruler, and the uneven spacing it exists to show is untouched.
 * The column is placed rather than clamped so that it lands in the same strip at every viewport
 * width - the map key is positioned against it, and a ruler that drifted with the camera would
 * collide with the key on wide screens and not on narrow ones.
 */

/** The label sits 58 px to the left of its tick and is 44 px wide; this clears both. */
const LABEL_GUTTER = 70;
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
      // Read the panel rather than hardcoding its width, so this cannot drift out of step with
      // the stylesheet the way a magic number would.
      const panel = document.querySelector("aside.panel-left")?.getBoundingClientRect();
      const clear = panel ? panel.right + LABEL_GUTTER : 0;

      setTicks(
        marks.map((metres) => {
          const anchor = scene.rulerAnchor(exaggeration, metres);
          return { metres, ...anchor, x: clear };
        }),
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
