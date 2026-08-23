import { Vector3 } from "three";
import { EARTH_RADIUS } from "./earthShader";

/**
 * The morph, in TypeScript.
 *
 * This mirrors `morphedPosition` in `earthShader.ts`, and the duplication is deliberate rather
 * than lazy. Because the geometry is positioned entirely in the vertex shader, the CPU-side
 * vertex buffers still hold undeformed coordinates - so Three's raycaster would happily pick
 * against a globe that is no longer where it appears to be, and Float markers would select from
 * the wrong place with no error to show for it. Anything that needs to know where a point
 * *actually is* on screen has to redo the same arithmetic here.
 *
 * If one of these two changes, the other must change with it.
 */
export function morphedPosition(
  lon: number,
  lat: number,
  morph: number,
  lift = 0,
  target = new Vector3(),
): Vector3 {
  const phi = (lon * Math.PI) / 180;
  const theta = (lat * Math.PI) / 180;
  const radius = EARTH_RADIUS + lift;

  const sphereX = radius * Math.cos(theta) * Math.sin(phi);
  const sphereY = radius * Math.sin(theta);
  const sphereZ = radius * Math.cos(theta) * Math.cos(phi);

  return target.set(
    sphereX + (lon - sphereX) * morph,
    sphereY + (lift - sphereY) * morph,
    sphereZ + (-lat - sphereZ) * morph,
  );
}
