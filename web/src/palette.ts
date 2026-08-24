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

import type { Theme } from "./store";

const LIFT_DARK = 0.62;
const LIFT_LIGHT = 1.0; // identity: cmocean as published

export function liftFor(theme: Theme): number {
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

/** A CSS gradient for the colourbar swatch, using exactly the colours the scene will draw. */
export function paletteGradient(colours: number[][], theme: Theme = "dark", stops = 32): string {
  const lifted = liftedPalette(colours, theme);
  const step = Math.max(1, Math.floor(lifted.length / stops));
  const picked = lifted.filter((_, index) => index % step === 0);
  return picked
    .map(([r, g, b], index) => `rgb(${r},${g},${b}) ${(index / (picked.length - 1)) * 100}%`)
    .join(", ");
}
