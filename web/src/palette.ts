/**
 * A display lift for ocean palettes, applied per theme.
 *
 * Every perceptually-uniform ocean palette - cmocean's `thermal`, `haline`, `deep` - runs to
 * near-black at its cold end, because that is what makes it perceptually uniform on a white
 * page. In a dark 3D scene it is a disaster: water at 3 °C encodes to a colour within a couple
 * of levels of the background, so the bottom two-thirds of the water column renders perfectly
 * and is completely invisible. We measured it - coverage is 69-78% at every depth, the voxels
 * are all there, they just cannot be seen.
 *
 * A gamma lift fixes it. It is monotonic, so colder still reads darker than warmer and the
 * ordering a viewer infers from the image is never wrong.
 *
 * On a *light* console the problem inverts. cmocean was designed for exactly that ground, so
 * the palette is used as its authors published it. Lifting it there would wash the cold end out
 * against a white page and cost the contrast the lift exists to protect.
 *
 * Crucially the lift is applied *here*, to the palette itself, so the colourbar drawn in the
 * control panel and the water drawn in the scene are always the same numbers. A lift applied
 * only in the shader would have quietly made the legend a lie - and that stays true now that
 * there are two themes, because both read the same value.
 */

import { biasPosition } from "./agreement";
import type { Theme } from "./store";
import { smoothSurface } from "./surface";
import { transfer, type Scale } from "./transfer";
import type { FieldSpec, SurfaceField } from "./types";

const LIFT_DARK = 0.62;
const LIFT_LIGHT = 1.0; // identity: cmocean as published

/** Internal: the display lift for a theme. Not exported - `liftedPalette` is the seam. */
function liftFor(theme: Theme): number {
  return theme === "light" ? LIFT_LIGHT : LIFT_DARK;
}

export function liftedPalette(colours: number[][], theme: Theme = "dark"): number[][] {
  const gamma = liftFor(theme);
  if (gamma === 1) return colours;
  return colours.map(([r, g, b]) => [
    lift(r ?? 0, gamma),
    lift(g ?? 0, gamma),
    lift(b ?? 0, gamma),
  ]);
}

function lift(channel: number, gamma: number): number {
  return Math.round(255 * Math.pow(channel / 255, gamma));
}

/**
 * A CSS gradient for the colourbar swatch, using exactly the colours the scene will draw.
 *
 * The scale goes through `transfer` here as well as in the shader, which is the whole fix for
 * the bug that got the log scale cut. The bar is drawn across the *value* axis - position x is
 * the value at x through the window - and the colour at x is the one the water will be given
 * for that value. So on a log scale the bar visibly bunches its colours towards the low end,
 * which is what a reader needs to see to know the scale is not linear.
 */
export function paletteGradient(
  colours: number[][],
  theme: Theme = "dark",
  scale: Scale = "linear",
  stops = 48,
): string {
  const lifted = liftedPalette(colours, theme);
  const out: string[] = [];
  for (let i = 0; i < stops; i++) {
    const t = i / (stops - 1);
    const index = Math.round(transfer(t, scale) * (lifted.length - 1));
    const [r, g, b] = lifted[Math.min(Math.max(index, 0), lifted.length - 1)] ?? [0, 0, 0];
    out.push(`rgb(${r},${g},${b}) ${(t * 100).toFixed(2)}%`);
  }
  return out.join(", ");
}

/**
 * How a Field that is **not** a Volume gets its colours: on the CPU, from the same two functions
 * the colourbar uses.
 *
 * The hazard Fields ship as float32 on the Grid's own axes, so nothing quantises them and no
 * shader has to know their units. Colouring them here rather than in GLSL means the sheet
 * floating inside the block, the drape on the sea surface and the swatch in the panel all go
 * through `liftedPalette` and `transfer` - literally the same code - so they cannot disagree.
 * That is the whole reason ADR 0010's log scale was cut once, and it is fixed here rather than
 * fixed twice.
 *
 * Returns null where the value is Mask (NaN) or outside the Transfer Function window. Outside
 * the window is dropped rather than clamped, exactly as the Volume drops it: narrowing the range
 * on Depth of 26 °C to 80-150 m is how you ask "where is the deep warm water", and a clamped
 * sheet would answer "everywhere".
 */
export function colourOf(
  value: number,
  field: FieldSpec,
  windowMin: number,
  windowMax: number,
  scale: Scale,
  lifted: number[][],
): [number, number, number] | null {
  if (!Number.isFinite(value)) return null;
  const [low, high] = field.range;
  // Clamped into the encoded range first, and only then tested against the window. The range is
  // the bake's 0.5/99.5 percentile clip - an encoding decision, which is why `encode_volume`
  // clamps too - and dropping the cells outside it punched holes in the sheet at exactly the
  // deepest and shallowest water, which is the part somebody looking at Depth of 26 degrees is
  // looking for. The window is the user's choice, and dropping what it excludes is the point.
  const unit = Math.min(Math.max((value - low) / Math.max(high - low, 1e-9), 0), 1);
  const t = (unit - windowMin) / Math.max(windowMax - windowMin, 1e-5);
  if (t < 0 || t > 1) return null;

  const index = Math.round(transfer(t, scale) * (lifted.length - 1));
  const colour = lifted[Math.min(Math.max(index, 0), lifted.length - 1)];
  return [colour?.[0] ?? 0, colour?.[1] ?? 0, colour?.[2] ?? 0];
}

/**
 * The colour of one instrument on the bias map.
 *
 * A signed bias, through the diverging palette, with the palette's midpoint meaning "the model
 * and the instrument agreed". It goes through `liftedPalette` like everything else that colours
 * a number here, so a dot in the water and the key beside it are the same bytes on both themes.
 *
 * `saturateAt` is where the palette runs out, as a fraction of the Field's own range - the
 * bake's own ninetieth percentile of the magnitude. See `biasPosition` for why it is not the
 * verdict threshold: with that, nine markers in ten came out the same pale midpoint.
 *
 * **Null when there is no measured scale to colour against**, rather than a colour computed on
 * a scale nobody chose. The caller draws that as "no comparison", which is what it is.
 */
export function biasColour(
  scaledBias: number,
  colours: number[][],
  theme: Theme,
  saturateAt?: number,
): [number, number, number] | null {
  const position = biasPosition(scaledBias, saturateAt);
  if (position === null) return null;
  const lifted = liftedPalette(colours, theme);
  const index = Math.round(position * (lifted.length - 1));
  const colour = lifted[Math.min(Math.max(index, 0), lifted.length - 1)];
  return [colour?.[0] ?? 0, colour?.[1] ?? 0, colour?.[2] ?? 0];
}

/**
 * One hazard Field at one Timestep, as RGBA bytes ready to paint on the sea surface.
 *
 * Row 0 of the file is the southernmost latitude, and this keeps that order - the caller flips
 * it in the texture coordinate, the same way round as the Volume texture's v axis, which is the
 * convention this project already had to learn once the hard way.
 *
 * The Field is resampled through `smoothSurface` first, so the Drape and the Sheet are built
 * from the same lattice and cannot disagree about where the coast is.
 *
 * Alpha carries the coast. It is 0 for anything the window has cut away - a hard edge, because
 * dropping what the window excludes is the point of the window - and it is the *coverage* of
 * the resampled cell otherwise, so land fades into sea over about 28 km instead of stepping
 * over 110. Absence still renders as absence rather than as a value of zero.
 */
export function surfacePixels(
  surface: SurfaceField,
  field: FieldSpec,
  windowMin: number,
  windowMax: number,
  scale: Scale,
  colours: number[][],
  theme: Theme,
): { pixels: Uint8Array; width: number; height: number } {
  const lifted = liftedPalette(colours, theme);
  const smooth = smoothSurface(surface);
  const pixels = new Uint8Array(smooth.width * smooth.height * 4);
  for (let i = 0; i < smooth.values.length; i++) {
    const colour = colourOf(smooth.values[i] ?? NaN, field, windowMin, windowMax, scale, lifted);
    if (!colour) continue;
    pixels[i * 4 + 0] = colour[0];
    pixels[i * 4 + 1] = colour[1];
    pixels[i * 4 + 2] = colour[2];
    pixels[i * 4 + 3] = Math.round(255 * Math.min(Math.max(smooth.coverage[i] ?? 0, 0), 1));
  }
  return { pixels, width: smooth.width, height: smooth.height };
}
