/**
 * A display lift for ocean palettes.
 *
 * Every perceptually-uniform ocean palette - cmocean's `thermal`, `haline`, `deep` - runs to
 * near-black at its cold end, because that is what makes it perceptually uniform on a white
 * page. In a dark 3D scene it is a disaster: water at 3 °C encodes to a colour within a couple
 * of levels of the background, so the bottom two-thirds of the water column renders perfectly
 * and is completely invisible. We measured it - coverage is 69-78% at every depth, the voxels
 * are all there, they just cannot be seen.
 *
 * A gamma lift fixes it. It is monotonic, so colder still reads darker than warmer and the
 * ordering a viewer infers from the image is never wrong. Crucially it is applied *here*, to
 * the palette itself, so the colourbar drawn in the control panel and the water drawn in the
 * scene are the same numbers - a lift applied only in the shader would have quietly made the
 * legend a lie.
 */

const LIFT = 0.62;

export function liftedPalette(colours: number[][]): number[][] {
  return colours.map(([r, g, b]) => [lift(r ?? 0), lift(g ?? 0), lift(b ?? 0)]);
}

function lift(channel: number): number {
  return Math.round(255 * Math.pow(channel / 255, LIFT));
}

/** A CSS gradient for the colourbar swatch, using exactly the colours the scene will draw. */
export function paletteGradient(colours: number[][], stops = 32): string {
  const lifted = liftedPalette(colours);
  const step = Math.max(1, Math.floor(lifted.length / stops));
  const picked = lifted.filter((_, index) => index % step === 0);
  return picked
    .map(([r, g, b], index) => `rgb(${r},${g},${b}) ${(index / (picked.length - 1)) * 100}%`)
    .join(", ");
}
