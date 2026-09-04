/**
 * The one place a Field that is not a Volume is resampled, and the one place its coast is
 * softened.
 *
 * The Sheet and the Drape are float32 on the Grid's own axes - 56 x 36 cells over 55 by 35
 * degrees, so a cell is about 110 km. Drawn as one quad per cell under a full-resolution
 * coastline, that reads as tiling, and it looked like a rendering fault rather than what it is.
 * The ray-marched Fields never showed it because the GPU filters a 3D texture and the coverage
 * channel already softens their boundary.
 *
 * Two things happen here, in one pass, because they are the same computation:
 *
 * 1. **Bilinear on the values, never on the colours.** The lattice is upsampled before anything
 *    is coloured. Colouring first and blurring afterwards would interpolate *through the
 *    palette* - halfway between two ends of `balance` is its pale midpoint, which means "no
 *    departure", so blurring across a warm patch and a cool one would draw a band of water that
 *    did not change between two bodies that did.
 *
 * 2. **Coverage, for the alpha ramp.** `updateSheet` used to drop any quad with a Masked corner,
 *    which made every coast a cliff at 110 km resolution. Each output cell also carries the
 *    share of its four source corners that held a real value, so the boundary can fade instead.
 *
 * What is deliberately NOT smoothed is the interior blotchiness. The 26 degC crossing jumps
 * between Levels - 5, 10, 20, 30, 50, 75, 100 m - and that quantisation propagates into the
 * heat integral. It is in the data, `hazard.py` documents it as the limitation to state rather
 * than hide, and smoothing it would invent structure that was never measured. Upsampling
 * between the cells the bake produced is resampling; flattening a step the instrument grid put
 * there is not.
 */
import type { SurfaceField } from "./types";

/**
 * How many output cells per input cell along each axis.
 *
 * 4 takes the 56 x 36 Grid to 221 x 141, so a cell is about 28 km rather than 110, and the mask
 * ramp is four cells wide rather than a step. Triangles go from 3,850 to 61,600, which is
 * nothing for a GPU and is the number `probe-hazard.mjs` reports so the change is visible as a
 * figure rather than as an impression.
 */
export const UPSAMPLE = 4;

/** A resampled Field, plus how much real data stands behind each of its cells. */
export interface SmoothSurface extends SurfaceField {
  /** 0 where every source corner was Mask, 1 where all four held a value, between at a coast. */
  coverage: Float32Array;
}

/**
 * Bilinear upsample that refuses to blend land into the sea.
 *
 * A Mask corner contributes nothing and its weight is removed from the total, so a cell next to
 * the coast takes the value of the water beside it rather than a value dragged towards zero by
 * the land. `Grid.column_at` in the pipeline applies exactly this rule for exactly this reason.
 */
export function smoothSurface(surface: SurfaceField, factor = UPSAMPLE): SmoothSurface {
  const { width, height, values } = surface;
  if (factor <= 1 || width < 2 || height < 2) {
    return { width, height, values, coverage: coverageOf(values) };
  }

  const outWidth = (width - 1) * factor + 1;
  const outHeight = (height - 1) * factor + 1;
  const out = new Float32Array(outWidth * outHeight);
  const coverage = new Float32Array(outWidth * outHeight);

  for (let row = 0; row < outHeight; row++) {
    const sourceRow = row / factor;
    const r0 = Math.min(Math.floor(sourceRow), height - 2);
    const fy = sourceRow - r0;

    for (let column = 0; column < outWidth; column++) {
      const sourceColumn = column / factor;
      const c0 = Math.min(Math.floor(sourceColumn), width - 2);
      const fx = sourceColumn - c0;

      let sum = 0;
      let weight = 0;
      for (let dy = 0; dy <= 1; dy++) {
        for (let dx = 0; dx <= 1; dx++) {
          const w = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy);
          if (w === 0) continue;
          const value = values[(r0 + dy) * width + (c0 + dx)] ?? NaN;
          if (!Number.isFinite(value)) continue;
          sum += value * w;
          weight += w;
        }
      }
      const at = row * outWidth + column;
      out[at] = weight > 0 ? sum / weight : NaN;
      coverage[at] = weight;
    }
  }
  return { width: outWidth, height: outHeight, values: out, coverage };
}

/** Coverage for a Field that was not resampled: a cell either has a value or it does not. */
function coverageOf(values: Float32Array): Float32Array {
  const coverage = new Float32Array(values.length);
  for (let i = 0; i < values.length; i++) {
    coverage[i] = Number.isFinite(values[i] ?? NaN) ? 1 : 0;
  }
  return coverage;
}
