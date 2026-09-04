/**
 * How close is close: the one place that decides whether the model agreed with an instrument.
 *
 * The Collocation panel's verdict and the bias map are the same judgement seen twice - one float
 * at a time, and all 233 at once - so they read the same constants. Two copies would let the
 * list call a float the worst in the basin while its own panel said "Close agreement", which is
 * exactly the class of contradiction ADR 0007 and `transfer.ts` exist to prevent.
 *
 * The thresholds are fractions of the Field's own encoded range, never absolute numbers. They
 * were 0.6 and 1.5 flat, which are degrees Celsius wearing no units: applied to salinity, 0.6
 * PSU is a sixth of the entire range the field occupies, so 82 of 85 floats read "Close
 * agreement" and the headline stopped carrying information. The fractions below are the ones
 * temperature already implied - 0.6 and 1.5 against a range about 27.4 degC wide - so
 * temperature's verdicts are unchanged and every other Field is judged on its own terms rather
 * than on temperature's.
 *
 * They are a judgement about wording, not a measurement, and they are stated rather than buried.
 */

/**
 * The temperature span these two judgements were written against, in degrees Celsius.
 *
 * It is not a live measurement and must not read like one. It was written inline as `27.42`,
 * which was that bake's temperature range and is 27.397 in this one - so the number looked
 * measured, was stale, and moves every bake while the judgement behind it does not. Naming it
 * is the whole fix: 0.6 degC is "close" and 1.5 degC is "a large disagreement" for a field of
 * roughly this width, and those two words are a decision about wording rather than a statistic.
 */
const REFERENCE_SPAN_DEGC = 27.4;

export const CLOSE_FRACTION = 0.6 / REFERENCE_SPAN_DEGC;
export const LARGE_FRACTION = 1.5 / REFERENCE_SPAN_DEGC;

/** The RMS residuals, in the Field's own units, at which the verdict changes. */
export function thresholds(range: [number, number]): [number, number] {
  const span = Math.abs(range[1] - range[0]);
  return [span * CLOSE_FRACTION, span * LARGE_FRACTION];
}

export type Agreement = "close" | "moderate" | "large";

/** Which verdict an RMS residual expressed as a fraction of the Field's range earns. */
export function agreementOf(scaledRms: number): Agreement {
  if (scaledRms < CLOSE_FRACTION) return "close";
  if (scaledRms < LARGE_FRACTION) return "moderate";
  return "large";
}

export const AGREEMENT_LABEL: Record<Agreement, string> = {
  close: "Close",
  moderate: "Moderate",
  large: "Large",
};

/**
 * A signed bias as a position along a diverging palette, 0 to 1, with 0.5 meaning "no gap".
 *
 * `saturateAt` is where the palette runs out, as a fraction of the Field's own range, and
 * getting it wrong is how a correct map becomes an unreadable one.
 *
 * It was `LARGE_FRACTION` - the "large disagreement" threshold, 1.5 degC on temperature - which
 * is the right *verdict* boundary and the wrong *colour* boundary. Measured on this bake: the
 * median instrument is off by 0.02 degC and the ninetieth percentile by 0.39 degC, so 90% of
 * the 233 markers landed within a quarter-step of the pale midpoint and **the whole map read as
 * white**. The colours were exactly what `palette.ts` computes; the scale was useless.
 *
 * So the caller passes the Field's own ninetieth percentile, which the bake measures and ships
 * in `residuals.json`. Nine markers in ten then use the full palette and the worst tenth clamp,
 * which is what a diverging scale is for - and the map key prints the figure in the Field's own
 * units, so a reader knows what the deep end means rather than guessing.
 *
 * **There is no default.** It used to fall back to `LARGE_FRACTION`, which is the scale that
 * made the map unreadable: a bake made before `p90ScaledAbs` existed would have got the white
 * map back, silently, and a white map reads as agreement. A caller with no measured scale gets
 * null, and the marker is drawn as "no comparison" rather than as a colour nobody chose.
 */
export function biasPosition(scaledBias: number, saturateAt?: number): number | null {
  if (saturateAt === undefined || !(saturateAt > 1e-9)) return null;
  const clamped = Math.min(Math.max(scaledBias / saturateAt, -1), 1);
  return 0.5 + 0.5 * clamped;
}
