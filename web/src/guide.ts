/**
 * What every control actually does, in plain language.
 *
 * This is written by hand rather than generated. The set is small and fixed, the answers are
 * physics rather than opinion, and being *correct* matters more than being dynamic: a wrong
 * sentence about thermocline behaviour in front of an oceanographer is worse than no sentence.
 * Hand-written also means it is instant and works with the network unplugged, which is the
 * property the whole demo is built around.
 *
 * Each entry answers three questions a confused user actually has, in this order:
 *   what does this change      -> "does"
 *   what does that mean        -> "means"
 *   what should I look for     -> "look"
 */

export interface GuideEntry {
  /** Control name as it appears in the panel. */
  title: string;
  /** Is this a scientific choice, or only how it is drawn? Users badly want to know. */
  kind: "science" | "rendering" | "navigation";
  does: string;
  means: string;
  look: string;
  /** A concrete thing to try, so the user has a next action. */
  tryThis?: string;
}

export const GUIDE: Record<string, GuideEntry> = {
  field: {
    title: "Variable",
    kind: "science",
    does: "Switches which ocean property is drawn: temperature or salinity.",
    means:
      "Both come from the same INCOIS analysis, on the same 24 depth levels. Temperature drives" +
      " cyclone intensity and where the thermocline sits. Salinity traces where water came from," +
      " because river outflow and evaporation leave a lasting fingerprint.",
    look:
      "Switch to salinity and compare the two coasts. The Bay of Bengal is visibly fresher than" +
      " the Arabian Sea, because the Ganges and Brahmaputra pour into it.",
    tryThis: "Switch to Salinity and look at the surface on either side of India.",
  },

  palette: {
    title: "Colour palette",
    kind: "rendering",
    does: "Changes which colours represent which values.",
    means:
      "These are cmocean palettes, the standard in oceanography. They are perceptually uniform," +
      " meaning an equal step in value looks like an equal step in colour. Rainbow palettes are" +
      " avoided because they invent sharp boundaries that are not in the data.",
    look: "thermal suits temperature, haline suits salinity, balance suits differences about zero.",
  },

  window: {
    title: "Colourbar range",
    kind: "science",
    does: "Sets which values get colour. Water outside the range becomes fully transparent.",
    means:
      "This is not just recolouring. Because out-of-range water disappears, narrowing the range" +
      " isolates a single body of water and lets you see its shape in three dimensions.",
    look:
      "Narrow the range to a few degrees and the rest of the ocean vanishes, leaving one layer" +
      " floating in space. That layer is a water mass.",
    tryThis: "Set the range to roughly 17-24 C and watch a single layer separate out.",
  },

  logScale: {
    title: "Logarithmic scale",
    kind: "rendering",
    does: "Spreads the colours unevenly, giving more of the scale to low values.",
    means:
      "Useful when most of the interesting variation sits at one end of the range and a linear" +
      " scale flattens it.",
    look: "Detail appears in the darker, colder part of the scale.",
  },

  depthSlice: {
    title: "Depth slice",
    kind: "navigation",
    does: "Hides all water outside a chosen depth range.",
    means:
      "It cuts the block open so you can look inside. Nothing is recalculated; water outside the" +
      " range is simply not drawn.",
    look:
      "Set it to roughly 0-200 m to keep only the sunlit surface layer, or 500-2000 m to see the" +
      " cold deep ocean on its own.",
    tryThis: "Drag 'from surface' down slowly and watch the warm layer peel away.",
  },

  opacity: {
    title: "Water opacity",
    kind: "rendering",
    does: "Sets how much light each metre of water blocks.",
    means:
      "Think of it as how murky the water is. Low values let you see all the way to 2000 m. High" +
      " values and the view runs out of transparency in the first few metres, so you only ever" +
      " see the warm surface.",
    look:
      "Turn it up and the block becomes a solid yellow lid. Turn it down and depth reappears." +
      " Nothing about the data changed; only how far into it you can see.",
  },

  emphasis: {
    title: "Feature emphasis",
    kind: "rendering",
    does: "Makes still water transparent and changing water solid.",
    means:
      "Ocean temperature decreases smoothly with depth, so drawing every drop equally gives an" +
      " opaque warm lid over an invisible abyss. This weights opacity by how fast the value is" +
      " changing from place to place, so featureless water fades out and boundaries stay.",
    look:
      "At 0 percent you see a flat surface layer and little else. Turn it up and a sharp band" +
      " appears part way down. That band is the thermocline, and it is the single most important" +
      " structure in the picture.",
    tryThis: "Slide it from 0 to 100 percent slowly and watch the thermocline emerge.",
  },

  exaggeration: {
    title: "Vertical exaggeration",
    kind: "rendering",
    does: "Stretches the depth axis by the factor shown.",
    means:
      "The region is about 4000 times wider than it is deep. Drawn true to scale it would be an" +
      " invisible film. Stretching it is what makes the water column readable, and it is normal" +
      " practice in oceanography. It changes the shape of the picture, never the numbers.",
    look:
      "The depth labels down the left stay correct at every setting. Notice their spacing is" +
      " uneven: the axis is deliberately denser near the surface, where the interesting physics is.",
  },

  quality: {
    title: "Ray steps",
    kind: "rendering",
    does: "Sets how many samples are taken along each ray of light through the water.",
    means:
      "Purely a quality against speed trade. This is the one control that changes nothing" +
      " scientific whatsoever. If the view feels sluggish, lower it.",
    look: "Low values show faint banding. High values are smoother and slower.",
    tryThis: "If the demo machine struggles, drop this to 64. It stays perfectly readable.",
  },

  volumeEnabled: {
    title: "Show volume",
    kind: "rendering",
    does: "Turns the body of water on or off.",
    means: "Useful for looking at an isosurface on its own, without water drawn in front of it.",
    look: "With the volume off and an isosurface on, the surface shape becomes much clearer.",
  },

  isosurface: {
    title: "Isosurface",
    kind: "science",
    does: "Draws a solid skin through every point where the water is exactly one chosen value.",
    means:
      "For temperature, the 20 C isotherm is the standard marker for the bottom of the warm" +
      " surface layer. How deep it sits tells a forecaster how much warm water a cyclone can draw" +
      " energy from. This is a real operational number, not a visual effect.",
    look:
      "The surface is not flat. Where it bulges downward there is a deep pool of warm water," +
      " which is fuel for a storm. Where it rises, cold water is close to the surface.",
    tryThis: "Turn off 'Show volume', then set the value near 20 C and look at the shape.",
  },

  surfaceLevel: {
    title: "Sea surface level",
    kind: "navigation",
    does: "Chooses which depth is painted onto the map and globe.",
    means:
      "The globe shows one depth at a time. This picks which one, so you can see how a pattern" +
      " changes as you go down without entering the 3D view.",
    look: "Surface patterns are sharp and varied. By 1000 m the ocean is far more uniform.",
  },

  timestep: {
    title: "Time",
    kind: "navigation",
    does: "Steps through INCOIS analyses, one every 10 days.",
    means:
      "Each frame is a separate analysis published by INCOIS, not an interpolation or a" +
      " simulation. The colour scale is held fixed across all frames deliberately, so that" +
      " changes you see are real and not the scale rescaling itself.",
    look: "Playing April through July shows the monsoon arriving.",
    tryThis: "Press play and watch the surface layer change through the season.",
  },

  floats: {
    title: "Argo floats",
    kind: "science",
    does: "Shows the robot instruments that were drifting in this water, at their true positions.",
    means:
      "Argo floats sink to 2000 m, drift for ten days, then rise while measuring temperature and" +
      " salinity all the way up. They are the ground truth the model is checked against.",
    look: "Click any float to compare what it measured against what the model predicted.",
    tryThis: "Click a float. The panel on the right becomes the comparison.",
  },

  tracks: {
    title: "Drift tracks",
    kind: "science",
    does: "Draws the path each float has taken between surfacings.",
    means:
      "Floats are not anchored. They drift with the current at their parking depth, so the track" +
      " is itself a measurement of deep ocean flow.",
    look: "Long straight tracks mean a strong steady current. Loops and knots mean an eddy.",
  },
};

/** A plain-language description of the current view, for when no control is being touched. */
export function describeView(options: {
  fieldLabel: string;
  units: string;
  date: string;
  fromDepth: number;
  toDepth: number;
  exaggeration: number;
  isoEnabled: boolean;
  isoValue: string;
  floatCount: number;
}): string {
  const {
    fieldLabel,
    date,
    fromDepth,
    toDepth,
    exaggeration,
    isoEnabled,
    isoValue,
    floatCount,
  } = options;

  const sliced =
    fromDepth > 10 || toDepth < 1900
      ? `Only water between ${fromDepth.toFixed(0)} m and ${toDepth.toFixed(0)} m is shown.`
      : "The full water column is shown, from 5 m down to 2000 m.";

  const iso = isoEnabled
    ? ` The solid surface running through it marks where the water is exactly ${isoValue}.`
    : "";

  return (
    `You are looking at ${fieldLabel.toLowerCase()} across India's exclusive economic zone,` +
    ` as INCOIS analysed it on ${date}. ${sliced}${iso}` +
    ` Depth is stretched ${exaggeration.toFixed(0)} times so the column is readable.` +
    ` ${floatCount} Argo floats are drawn where they actually were; click one to compare it` +
    ` against the model.`
  );
}
