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
    does: "Switches which ocean property is drawn.",
    means:
      "Temperature and salinity are fetched from INCOIS, on the same 24 depth levels. Density" +
      " and the temperature anomaly are computed here from those two, so they cost no extra" +
      " download and make no extra assumption. Observation Coverage is not the model at all: it" +
      " is how much real measurement stands behind each part of it.",
    look:
      "Switch to salinity and compare the two coasts. The Bay of Bengal is visibly fresher than" +
      " the Arabian Sea, because the Ganges and Brahmaputra pour into it. Then switch to density" +
      " and watch what that freshness does.",
    tryThis: "Move along the row: the same water, four different questions about it.",
  },

  density: {
    title: "Density",
    kind: "science",
    does:
      "Draws potential density - sigma-theta - worked out here from the temperature and" +
      " salinity analyses at each cell's own pressure, using TEOS-10.",
    means:
      "The ocean does not move because water is warm. It moves because water is light, and how" +
      " light depends on temperature and salinity together. The figure is an anomaly: 22 means" +
      " 1022 kg per cubic metre, because seawater varies over about 8 units against an absolute" +
      " value near 1025 and a scale running 1020 to 1028 would spend itself on a constant." +
      " Nothing was downloaded for this: density is a fixed function of what we already held.",
    look:
      "The northern Bay of Bengal against the northern Arabian Sea. In this bake the Bay's" +
      " surface is 0.8 degrees warmer and still 3.0 units lighter, because it is 3.6 PSU" +
      " fresher. A temperature map cannot show you that, and it is why a cyclone crossing the" +
      " Bay meets water that will not mix away beneath it.",
    tryThis:
      "Look at Temperature first, then at Density, without moving the camera. The layers change" +
      " shape.",
  },

  temperature_anomaly: {
    title: "Temperature Anomaly",
    kind: "science",
    does:
      "Draws how far each point is from its own average across the twelve Timesteps loaded," +
      " rather than its absolute temperature.",
    means:
      "The baseline is those twelve steps and nothing else: roughly April to July 2026. It is" +
      " a seasonal swing, not a climatological normal. Saying water is 'warmer than usual' the" +
      " way an operational centre means it needs a thirty-year reference series, which this" +
      " build does not carry and would have to download and validate separately. The two read" +
      " identically on screen and mean different things, so this one says which it is." +
      " Subtracting each cell's own average is what removes the map: the Arabian Sea being" +
      " warmer than the equator is geography, not an anomaly.",
    look:
      "The signal is strongest at 75 to 125 metres, not at the surface. Measured here, the" +
      " spread is 0.74 degrees at 5 m, 1.55 at 100 m and 0.08 by 2000 m. What moves over a" +
      " season is the thermocline, and the deep ocean barely notices.",
    tryThis:
      "Drag Range min up past the middle. Everything cooler than its own average disappears," +
      " leaving only the water that warmed.",
  },

  coverage: {
    title: "Observation Coverage",
    kind: "science",
    does:
      "Stops drawing the model and draws the evidence instead: how many Argo casts were taken" +
      " within about 330 km of each point, and dived through that depth.",
    means:
      "A model has a value in every cell whether or not anyone measured there. That is a" +
      " property of the grid, not of the evidence. This field separates the two. Grey water is" +
      " where the analysis is interpolating between distant floats; green is where several" +
      " instruments actually went. In the current bake about a fifth of the block is grey.",
    look:
      "Look at the middle of the Arabian Sea against the water close to the coasts and the" +
      " Andamans. Then press play: the pattern shifts as the floats drift, because coverage is" +
      " a property of where the instruments were that week, not a fixed map." +
      " A float sitting on a red patch is not a contradiction: red means one cast nearby, and" +
      " the float you are looking at is that cast.",
    tryThis:
      "Switch back to Temperature afterwards and look at the same spot. The model is confident" +
      " there either way - that is the point.",
  },

  palette: {
    title: "Colourbar",
    kind: "rendering",
    does: "Shows which colour stands for which value in the Field on screen.",
    means:
      "These are cmocean palettes, the standard in oceanography. They are perceptually uniform," +
      " meaning an equal step in value looks like an equal step in colour, and rainbow scales" +
      " are avoided because they invent sharp boundaries that are not in the data. There is no" +
      " palette chooser: each variable carries the scale its quantity is drawn with, so the" +
      " colours can never end up meaning something other than what the label says.",
    look:
      "The numbers at the ends of the bar move when you narrow the range, because the range is" +
      " the part that is yours to change. The colours are not.",
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
      "A surface of constant value. What that surface *is* depends on the variable it is cut" +
      " through, and each one has its own name and its own meaning in oceanography.",
    look: "Turn off 'Show volume' to see the surface on its own.",
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

/**
 * What each cmocean palette was designed for.
 *
 * There used to be nine of these and a dropdown to pick between them, and the panel would say
 * plainly when the pairing was unconventional. That was the wrong fix for the right problem:
 * cmocean's palettes are designed per quantity, so putting one on the wrong Field miscues
 * anyone who knows the convention, and no amount of explanatory text repairs a control that
 * reads as a data control and is not one. See docs/adr/0010.
 *
 * Now every Field names its own palette and there is nothing to choose. What survives here is
 * the sentence saying what each scale encodes, which the colourbar still shows and the guide
 * panel still expands. `suits` names the Field a palette belongs to.
 */
export interface PaletteNote {
  title: string;
  /** What the palette encodes, in the convention it comes from. */
  designedFor: string;
  /** Sequential runs one way; diverging is built around a meaningful midpoint. */
  form: "sequential" | "diverging";
  /** Field keys this is the conventional palette for. */
  suits: string[];
  note: string;
}

export const PALETTES: Record<string, PaletteNote> = {
  thermal: {
    title: "thermal",
    designedFor: "Temperature",
    form: "sequential",
    suits: ["temperature"],
    note:
      "Runs cold and dark to warm and bright, which is the direction people already expect heat" +
      " to run. This is the house palette for temperature.",
  },
  haline: {
    title: "haline",
    designedFor: "Salinity",
    form: "sequential",
    suits: ["salinity"],
    note:
      "Fresh to saline, in blues and yellows chosen so river plumes separate cleanly from open" +
      " ocean water. The house palette for salinity.",
  },
  dense: {
    title: "dense",
    designedFor: "Density",
    form: "sequential",
    suits: ["density"],
    note:
      "Built for seawater density, and running light to heavy in the direction people already" +
      " expect weight to run. The house palette for density.",
  },
  balance: {
    title: "balance",
    designedFor: "Anomalies about zero",
    form: "diverging",
    suits: ["temperature_anomaly"],
    note:
      "A diverging palette, built around a midpoint that means something: the pale middle is" +
      " water sitting at its own average, and the two dark ends are warmer and cooler than it." +
      " The encoding range is forced to be symmetric so that midpoint really is zero.",
  },
  coverage: {
    title: "coverage",
    designedFor: "Observation coverage",
    form: "sequential",
    suits: ["coverage"],
    note:
      "Not a cmocean palette and not a continuous scale. Four flat bands with hard edges," +
      " because twice as many casts is not twice as good and a smooth ramp invites exactly that" +
      " reading. Grey through red and amber to green, which is the one ordering a non-specialist" +
      " reads correctly without a legend.",
  },
};

/**
 * What an isosurface *is*, per Field.
 *
 * A surface of constant value has a different name and a different meaning in every variable:
 * an isotherm, an isohaline and an isopycnal are three different objects. This used to be one
 * static entry written for temperature, so selecting density and asking what the surface meant
 * got an answer about cyclones drawing energy from warm water.
 *
 * `hint` is the one-liner printed beside the slider; the rest fills the guide panel.
 */
export const ISOSURFACES: Record<
  string,
  { name: string; hint: string; means: string; look: string; tryThis: string }
> = {
  temperature: {
    name: "isotherm",
    hint:
      "The 20 °C isotherm is the conventional proxy for the thermocline, and its depth drives" +
      " cyclone-intensity forecasts.",
    means:
      "A surface of constant temperature, an isotherm. The 20 °C one is the standard marker for" +
      " the bottom of the warm surface layer, and how deep it sits tells a forecaster how much" +
      " warm water a cyclone can draw energy from. A real operational number, not an effect.",
    look:
      "The surface is not flat. Where it bulges downward there is a deep pool of warm water," +
      " which is fuel for a storm. Where it rises, cold water is close to the surface.",
    tryThis: "Set the value near 20 °C and look at the shape.",
  },
  salinity: {
    name: "isohaline",
    hint: "An isohaline traces the edge of a freshwater plume rather than a temperature layer.",
    means:
      "A surface of constant salinity, an isohaline. It wraps the river water: the Ganges and" +
      " Brahmaputra put a fresh lid on the Bay of Bengal, and this draws the underside of that" +
      " lid, which no map of the surface can show you.",
    look:
      "Set the value low, around 33 PSU, and the surface closes around the northern Bay of" +
      " Bengal. That shape is the plume, and how thick it is decides whether a storm can mix it" +
      " away.",
    tryThis: "Set the value near 33 PSU and look at the northern Bay of Bengal.",
  },
  density: {
    name: "isopycnal",
    hint: "An isopycnal is a surface the ocean genuinely moves along, not just a contour.",
    means:
      "A surface of constant density, an isopycnal, and it is the most physical of the three." +
      " Water moves *along* surfaces of equal density far more easily than across them, so an" +
      " isopycnal is close to a real sheet the ocean slides on. Oceanographers label water" +
      " masses by the isopycnals they sit between.",
    look:
      "Where the surface bulges downward, light water is piled up - a warm or fresh lens." +
      " Where it lifts toward the surface, denser water is close to the top, which is what" +
      " upwelling looks like from the side.",
    tryThis: "Set the value near 24 kg/m³ and watch it dome across the equator.",
  },
  temperature_anomaly: {
    name: "contour of departure",
    hint: "Here the surface encloses the water that departed by more than the chosen amount.",
    means:
      "Not a water mass but a boundary: the skin around every region that departed from its own" +
      " average by more than the value you set. Inside it, the water changed by at least that" +
      " much; outside it, less.",
    look:
      "Set a positive value and the surface closes around the warm patches only, so you can see" +
      " how big and how deep each one is rather than guessing from colour.",
    tryThis: "Set the value near +1 °C and count how many separate warm blobs there are.",
  },
};

/** The guide entry for the isosurface, worded for the Field it is being cut through. */
export function describeIsosurface(fieldKey: string, units: string): GuideEntry {
  const entry = ISOSURFACES[fieldKey];
  if (!entry) return GUIDE.isosurface as GuideEntry;
  return {
    title: `Isosurface: the ${entry.name}`,
    kind: "science",
    does:
      `Draws a solid skin through every point where the water is exactly one chosen value in` +
      ` ${units}. That surface is called ${/^[aeiou]/i.test(entry.name) ? "an" : "a"}` +
      ` ${entry.name}.`,
    means: entry.means,
    look: entry.look,
    tryThis: `Turn off 'Show volume', then: ${entry.tryThis}`,
  };
}

/** The guide entry for the colourbar of one Field. */
export function describePalette(name: string, fieldLabel: string): GuideEntry {
  const palette = PALETTES[name];
  if (!palette) return GUIDE.palette as GuideEntry;

  return {
    title: `Colourbar: ${palette.title}`,
    kind: "rendering",
    does:
      `Draws ${fieldLabel.toLowerCase()} using cmocean's ${palette.title} palette, a` +
      ` ${palette.form} scale designed for ${palette.designedFor.toLowerCase()}.`,
    means: palette.note,
    look:
      "This pairing is fixed. The palette belongs to the variable rather than being chosen" +
      " beside it, so the colours always mean what the label says. Only the range below is" +
      " yours, and the figures at the ends of the bar follow it.",
  };
}
