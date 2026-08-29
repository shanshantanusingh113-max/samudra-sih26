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
 *
 * The caption sits at the **foot of the column**, under the deepest figure. It used to be
 * centred at the bottom of the viewport, where the map key covered its first third at every
 * window size measured - 1600x900, 1366x768 and 1280x720 - so a reader saw "...xis stretched -
 * see the uneven spacing". The head of the column was tried next and is worse: that is the top
 * face of the Volume, the brightest surface in the picture, and a hairline caption over it
 * cannot be read at all. Under the column is background at every viewport size, and it still
 * sits beside the thing it describes.
 */

/** The label sits 58 px to the left of its tick and is 44 px wide; this clears both. */
const LABEL_GUTTER = 70;
/** How far below the deepest figure the caption sits. */
const CAPTION_DROP = 20;

export function DepthRuler({ scene }: { scene: OceanScene | null }) {
  const { manifest, exaggeration, morph } = useStore();
  const [ticks, setTicks] = useState<Tick[]>([]);
  const [caption, setCaption] = useState<{ x: number; y: number } | null>(null);
  const frame = useRef(0);

  const active = morph > 0.55 && !!scene && !!manifest;

  useEffect(() => {
    if (!active || !scene || !manifest) {
      setTicks([]);
      setCaption(null);
      return;
    }
    const marks = depthTicks(manifest.volume);

    const update = () => {
      // Read the panel rather than hardcoding its width, so this cannot drift out of step with
      // the stylesheet the way a magic number would.
      const panel = document.querySelector("aside.panel-left")?.getBoundingClientRect();
      const clear = panel ? panel.right + LABEL_GUTTER : 0;

      const next = marks.map((metres) => {
        const anchor = scene.rulerAnchor(exaggeration, metres);
        return { metres, ...anchor, x: clear };
      });
      setTicks(next);

      // Anchored under the *deepest* figure on screen, so the caption follows the column when
      // Vertical Exaggeration moves it. Below rather than above: above the column is the top
      // face of the Volume, which is the brightest surface in the picture, and a hairline
      // caption laid over it cannot be read at all. Below the column is background.
      const visible = next.filter((t) => t.visible);
      const foot = visible[visible.length - 1];
      setCaption(foot ? { x: clear - 58, y: foot.y + CAPTION_DROP } : null);

      frame.current = requestAnimationFrame(update);
    };
    frame.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame.current);
  }, [active, scene, manifest, exaggeration]);

  if (!active || ticks.length === 0) return null;

  return (
    <div className="ruler" aria-hidden="true">
      {caption && (
        <p className="ruler-note" style={{ transform: `translate(${caption.x}px, ${caption.y}px)` }}>
          Depth axis is stretched, not linear
        </p>
      )}
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
    </div>
  );
}
