/**
 * The Transfer Function's scale: linear, or logarithmic.
 *
 * PS 26067 names "log/linear scale" by hand. It was cut once, and `CONTEXT.md` said flatly
 * "there is no log scale - it warped the water while the colourbar stayed linear, so the legend
 * became a lie". That was a bug, not a reason: the shader applied a curve and the swatch drawn
 * beside it did not, so a reader matching a colour in the water against the bar got the wrong
 * number. ADR 0010 is amended rather than left looking like a refusal.
 *
 * The fix is that there is exactly **one** formula and it lives here. The TypeScript below draws
 * the colourbar and reads the tick figures; `TRANSFER_GLSL` is the same expression as a string,
 * inlined into the ray-marching shader, so the water and the legend cannot drift apart. If the
 * curve ever changes it changes in one place.
 *
 * The curve is `log(1 + C·t) / log(1 + C)` over the window fraction t, with C = 99: t = 0 stays
 * at 0, t = 1 stays at 1, and the bottom 1% of the window is given 50% of the colour range. That
 * is what a log scale is for here - Cyclone Heat Potential, current speed and cast counts are all
 * heavily skewed towards zero, and on a linear scale nine tenths of the block sits in the first
 * fifth of the palette.
 *
 * **It is offered only where it means something.** A diverging Field runs through negative
 * values, and there is no logarithm of a negative number; `supportsLog` is what decides, and the
 * control is hidden rather than disabled-with-a-warning where it does not apply.
 */

import type { FieldSpec } from "./types";

export type Scale = "linear" | "log";

/** How hard the curve bends. 99 puts the window's bottom 1% into the palette's bottom half. */
export const LOG_CURVE = 99;

/** Window fraction -> position along the palette. Identity when the scale is linear. */
export function transfer(t: number, scale: Scale): number {
  if (scale !== "log") return t;
  const clamped = Math.min(Math.max(t, 0), 1);
  return Math.log(1 + LOG_CURVE * clamped) / Math.log(1 + LOG_CURVE);
}

/** Position along the palette -> window fraction. What the tick figures are read through. */
export function inverseTransfer(position: number, scale: Scale): number {
  if (scale !== "log") return position;
  const clamped = Math.min(Math.max(position, 0), 1);
  return (Math.pow(1 + LOG_CURVE, clamped) - 1) / LOG_CURVE;
}

/**
 * A Field whose encoded range straddles zero, so its palette has a meaningful midpoint.
 *
 * Four of the fifteen: the temperature anomaly, the departure from the climatological normal,
 * the analysis spread and the barrier layer thickness. Two things follow, and both are decided
 * here so the control and the water cannot disagree. A log scale is refused, because bending one
 * half would move the midpoint off the value that means "no departure". And an isosurface is
 * drawn on **both** sides of that midpoint, because a contour of departure at +0.3 degC that
 * draws nothing for water which cooled by two degrees is answering half the question with no
 * sign that it has.
 */
export function isDiverging(field: FieldSpec | null | undefined): boolean {
  return !!field && field.range[0] < 0 && field.range[1] > 0;
}

/**
 * Palettes that cannot express a bent scale, because they have no gradient to bend.
 *
 * Observation Coverage is drawn in four flat bands whose edges sit at whole cast counts, and the
 * key beside it names them: "No casts", "1 cast", "2 to 3 casts", "4 or more casts". The curve
 * moves the position along the palette, so it moves every band edge, and a band key cannot bend
 * with it. Measured on the current bake, range 0..14, edges at 0.5 / 1.5 / 3.5 casts:
 *
 *   casts   linear reads as   log reads as
 *   0       No casts          No casts
 *   1       1 cast            4 or more casts
 *   2       2 to 3 casts      4 or more casts
 *   3       2 to 3 casts      4 or more casts
 *
 * So under a log scale every cell with a single cast behind it painted as the best-observed
 * water in the block, under a key that still said otherwise. That is exactly the failure this
 * file exists to prevent - the water bending while the legend does not - arriving through a door
 * the usual fix cannot close, because `Controls.tsx` deliberately draws no gradient swatch for a
 * banded Field. The only fix is not to offer the control.
 */
const BANDED_PALETTES = new Set(["coverage"]);

function isBandedPalette(name: string | undefined): boolean {
  return !!name && BANDED_PALETTES.has(name);
}

/**
 * How near zero a Field's range has to start before a log scale means anything, as a fraction of
 * its span. See `supportsLog`.
 */
const ANCHOR_TOLERANCE = 0.05;

/**
 * Whether a log scale is meaningful for this Field.
 *
 * Three conditions, and the first was the only one for a while.
 *
 * **1. The range must not go below zero.** A temperature anomaly, an analysis spread and a
 * barrier layer thickness are all signed about zero, and compressing one end of a diverging
 * scale would move the midpoint off the value that means "no departure" - the one thing ADR 0007
 * exists to protect.
 *
 * **2. The palette must have a gradient to bend.** See BANDED_PALETTES above.
 *
 * **3. The range must actually be anchored at zero.** This is the one that was missing, and it
 * let the control onto seven Fields where it says nothing. The curve is applied to the *window
 * fraction*, not to the value, so on Temperature - 2.60 to 30.00 degC - a "log scale" gives half
 * the palette to the coldest water in the block and means nothing at all, because t = 0 is
 * 2.60 degC rather than zero. A logarithm needs a real zero to run away from. Measured against
 * the current bake, with the tolerance at 5% of the span:
 *
 *   offered   Cyclone Heat Potential 0.00-136.45 · Current Speed 0.01-0.91 · INCOIS Error 0.00-3.60
 *   hidden    Temperature 2.60 · Salinity 32.94 · Density 20.48 · D26 7.92 · MLD 10.23 ·
 *             ILD 10.62 · INCOIS Cast Count 1.00 - none of them starts near its own zero
 *
 * Three Fields, and all three are genuinely piled up against zero, which is what a log scale is
 * for. The guide entry for the scale says so in the reader's words.
 *
 * If a Field ever needs to override this, the override belongs in its `FieldSpec` beside
 * `emphasis` and `opacity`, not as a second rule here.
 */
export function supportsLog(field: FieldSpec | undefined): boolean {
  if (!field) return false;
  if (field.range[0] < 0) return false;
  if (isBandedPalette(field.palette)) return false;
  const span = field.range[1] - field.range[0];
  return span > 0 && field.range[0] <= ANCHOR_TOLERANCE * span;
}

/**
 * The same curve as GLSL, inlined into the volume shader.
 *
 * A string rather than a second implementation, so there is no second implementation. `uLog` is
 * 1 when the scale is logarithmic and 0 when it is not.
 */
export const TRANSFER_GLSL = /* glsl */ `
float applyScale(float t) {
  if (uLog < 0.5) return t;
  return log(1.0 + ${LOG_CURVE}.0 * clamp(t, 0.0, 1.0)) / log(1.0 + ${LOG_CURVE}.0);
}
`;
