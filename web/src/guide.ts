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

  temperature: {
    title: "Temperature",
    kind: "science",
    does: "Draws the sea temperature INCOIS published, at every depth from 5 m to 2000 m.",
    means:
      "This is the analysis itself, not a measurement and not a simulation: INCOIS take the" +
      " Argo floats reporting in this ocean and fit a field to them every ten days. It is the" +
      " thing every other view here is checked against, and the thing a cyclone forecast is" +
      " built on - warm water is fuel, and how *deep* the warm water goes decides whether a" +
      " storm keeps it.",
    look:
      "The orange band part way down is the thermocline: the boundary where the sun-warmed" +
      " surface stops and the cold deep begins. It is not flat. Where it dips, there is a thick" +
      " pool of warm water; where it lifts, cold water is close to the surface.",
    tryThis:
      "Click a float and see whether the analysis got that column right. Then try Observation" +
      " Coverage to see how much measurement stands behind it.",
  },

  salinity: {
    title: "Salinity",
    kind: "science",
    does: "Draws how salty the water is, on the same 24 depth levels as temperature.",
    means:
      "Salinity decides, with temperature, whether water floats or sinks - and in this ocean it" +
      " is often the one that wins. The Ganges and the Brahmaputra pour enough fresh water into" +
      " the Bay of Bengal to put a light lid on top of it that a storm cannot easily mix away." +
      " PSU is a practical salinity unit; open ocean sits near 35.",
    look:
      "Compare the two sides of India. The Bay of Bengal is visibly fresher than the Arabian" +
      " Sea, and the freshest water is a thin skin at the very top of the northern Bay. Then" +
      " switch to Density and watch that freshness decide the answer.",
    tryThis: "Set the isosurface near 33 PSU: the surface closes around the river plume.",
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
      " instruments actually went. In the current bake 6% of the block is grey - the Argo array is dense here, and the gaps that remain are near coasts and at the corners of the region.",
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

  anomalyFeatures: {
    title: "Anomaly features",
    kind: "science",
    does:
      "Puts a ring on every connected body of water that departed from its own average, and" +
      " makes each one clickable.",
    means:
      "The anomaly field shows you that something departed. It cannot tell you which blob you" +
      " are looking at, how big it is, why it is there, or whether to believe it. A body has to" +
      " be both unusual - past two standard deviations for its own cell - and physically" +
      " noticeable, past half a degree, before it is marked. A hundredth of a degree in water" +
      " that never moves is a huge statistical outlier and a meaningless one.",
    look:
      "Click one. The panel names its depth and size, then says whether the 20 °C line swept" +
      " through it, what salinity and density did there, and how many Argo casts stand behind" +
      " it. Three of the 111 in this bake have none at all - the model departed" +
      " and no instrument checked it. Plenty of vivid colour carries no ring: most of the bright" +
      " band at 50-100 m is the thermocline doing what it does every step, which is large in" +
      " degrees and not unusual for that water.",
    tryThis:
      "Click a ring, then press 'Show only this body of water'. Everything else disappears and" +
      " you are looking at the departure itself, at its real size and depth.",
  },

  /**
   * Not reachable from the guide panel, and that is correct: the Anomaly Feature panel takes
   * that space whenever a Feature is open, so a reader who presses this button is already
   * looking at the explanation. Kept here so the wording lives with every other control's, and
   * so the sentence under the button and this entry cannot drift apart.
   */
  isolateAnomaly: {
    title: "Show only this body of water",
    kind: "rendering",
    does:
      "Hides every part of the block except the one feature you clicked, and swings the camera" +
      " onto it.",
    means:
      "A coloured blob inside a solid block tells you that some water departed and almost" +
      " nothing about its shape - you cannot see where it starts, how deep it runs, or whether" +
      " it is one body or three. This clears the rest away. What is left is exactly the cells" +
      " the detector selected, which is exactly the water every number on the panel is measured" +
      " over: the size, the depth range, the salinity, the cast count.",
    look:
      "The shape and the thickness. Most of these are wide and thin - a few hundred kilometres" +
      " across and a few tens of metres deep - because what moves over a season is the" +
      " thermocline, and it moves up and down rather than sideways.",
    tryThis:
      "Isolate one, then drag Vertical exaggeration down. The body flattens into the sheet it" +
      " really is.",
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

  currents: {
    title: "Surface currents",
    kind: "rendering",
    does:
      "Lays arrows over the map showing which way the surface water is moving. The colour of an" +
      " arrow is its speed: pale is slow, dark green is fast.",
    means:
      "Every other layer here is our own data. This one is a picture drawn by somebody else." +
      " Copernicus Marine, Europe's ocean service, run a global ocean model on a grid about" +
      " nine kilometres across and publish these arrows as map images every day. We download" +
      " the images once, when the data is baked, and draw them. We do not have the numbers" +
      " behind them - Copernicus only give those out to account holders - so there is nothing" +
      " to click and no speed to read off it. That is on purpose. If we cannot check a field" +
      " ourselves, it is more honest to show it as a picture that says so than to dress it up" +
      " as a variable like the rest.",
    look:
      "The Somali coast in July. That dark green ribbon running north is the Somali Current at" +
      " the height of the monsoon, one of the fastest currents in any ocean. We tried to" +
      " calculate this ourselves and got it wrong by a factor of ten, which is why the honest" +
      " version is borrowed and labelled.",
    tryThis:
      "Turn it on and press play. The whole circulation reverses through the monsoon - that is" +
      " the thing the Indian Ocean does that no other ocean does.",
  },

  moorings: {
    title: "Moored buoys",
    kind: "science",
    does: "Shows the buoys anchored to the sea floor, drawn as squares rather than dots.",
    means:
      "A moored buoy is tethered in one place with sensors strung down the wire, so it measures" +
      " the same water column every few hours for years. Four of the ones here are India's own" +
      " OMNI network, run by NIOT with INCOIS as the data centre, and three are RAMA, the joint" +
      " MoES-NOAA array. They reach the open feed through the same global weather network that" +
      " carries ship and buoy reports.",
    look:
      "Click one and move the timeline. Because it never drifts, its comparison follows the" +
      " dates - you are watching one patch of ocean through the whole season. An Argo float" +
      " cannot do that: by the next analysis it is somewhere else.",
    tryThis: "Open the buoy in the Bay of Bengal and play the timeline from April to July.",
  },

  chlorophyll: {
    title: "Chlorophyll",
    kind: "science",
    does:
      "Shows how much plant life a float measured in the water, where it carries the sensor" +
      " for it.",
    means:
      "Chlorophyll marks where nutrients are reaching the sunlit layer - upwelling, river" +
      " plumes, blooms - and it is what fisheries advisories are built on. It comes from the" +
      " Argo floats that carry a fluorometer, and it is drawn on its own because there is" +
      " nothing to compare it against: no gridded chlorophyll shares this timeline. INCOIS" +
      " publish ocean colour themselves and both series stopped, in 2006 and in 2020.",
    look:
      "The peak is usually not at the surface. Look for the bulge between about 30 and 80" +
      " metres - the deep chlorophyll maximum, where there is still light and the nutrients" +
      " have not been used up.",
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

/**
 * Where each Field came from, in the words that are true of *that* Field.
 *
 * This used to be one clause - "as INCOIS analysed it on <date>" - written once and reused for
 * all five. It is true of two of them. Density and the temperature anomaly are computed here,
 * and Observation Coverage is not the model at all: it is a count of Argo casts, and separating
 * the evidence from the model is the whole point of that Field. Crediting INCOIS with it
 * contradicted the platform's headline idea in the platform's own words.
 *
 * `%d` stands for the analysis date, so a Field that does not sit on one can leave it out.
 */
const PROVENANCE: Record<string, string> = {
  temperature: "as INCOIS analysed it on %d",
  salinity: "as INCOIS analysed it on %d",
  density:
    "worked out here with TEOS-10 from INCOIS's temperature and salinity analyses for %d," +
    " at each cell's own pressure",
  temperature_anomaly:
    "worked out here as each cell's departure from its own average across the twelve analyses" +
    " in this bake, shown for %d",
  coverage:
    "counted here from the Argo casts taken around %d. This is the evidence behind the model," +
    " not the model",
};

/** A plain-language description of the current view, for when no control is being touched. */
export function describeView(options: {
  fieldKey: string;
  fieldLabel: string;
  units: string;
  date: string;
  fromDepth: number;
  toDepth: number;
  exaggeration: number;
  isoEnabled: boolean;
  isoValue: string;
  /** Instruments actually on the water at this Timestep, not every one in the bake. */
  floatsDrawn: number;
  /** How many of those are anchored buoys rather than drifting floats. */
  mooringsDrawn: number;
}): string {
  const {
    fieldKey,
    fieldLabel,
    date,
    fromDepth,
    toDepth,
    exaggeration,
    isoEnabled,
    isoValue,
    floatsDrawn,
    mooringsDrawn,
  } = options;

  const provenance = (PROVENANCE[fieldKey] ?? "as loaded for %d").replace("%d", date);

  const sliced =
    fromDepth > 10 || toDepth < 1900
      ? `Only water between ${fromDepth.toFixed(0)} m and ${toDepth.toFixed(0)} m is shown.`
      : "The full water column is shown, from 5 m down to 2000 m.";

  const iso = isoEnabled
    ? ` The solid surface running through it marks where the water is exactly ${isoValue}.`
    : "";

  return (
    `You are looking at ${fieldLabel.toLowerCase()} across India's exclusive economic zone,` +
    ` ${provenance}. ${sliced}${iso}` +
    ` Depth is stretched ${exaggeration.toFixed(0)} times so the column is readable.` +
    ` ${floatsDrawn} Argo floats` +
    (mooringsDrawn > 0 ? ` and ${mooringsDrawn} moored buoys` : "") +
    ` were reporting near this date and are drawn where they actually were; click one to` +
    ` compare it against the model.`
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
  form: "sequential" | "diverging" | "banded";
  /** Field keys this is the conventional palette for. */
  suits: string[];
  /**
   * The one line printed under the swatch.
   *
   * Written per palette rather than assembled from `designedFor` and `form`. The template was
   * "<designedFor>, <form>. The conventional oceanographic scale for <field>." - true of the
   * three cmocean scales and false of the coverage one, which was invented here and is not
   * continuous. It printed "The conventional oceanographic scale for observation coverage",
   * naming a convention that does not exist, two clicks away from a guide entry saying so.
   */
  caption: string;
  note: string;
}

/**
 * What narrowing the Transfer Function range actually does, per Field.
 *
 * "which is how you isolate a single water mass" is the right sentence for temperature,
 * salinity and density. A water mass is a body of water with a characteristic temperature and
 * salinity, so there is no water mass in a count of Argo casts and none in a departure from an
 * average either - and this note was printed under all five.
 */
export const RANGE_NOTE: Record<string, string> = {
  temperature:
    "Narrowing the range hides water outside it, which is how you isolate a single water mass.",
  salinity:
    "Narrowing the range hides water outside it, which is how you isolate a single water mass.",
  density:
    "Narrowing the range hides water outside it, which is how you isolate a single water mass.",
  temperature_anomaly:
    "Narrowing the range hides water outside it. Lift the minimum past the middle and only" +
    " water that warmed is left; drop the maximum and only water that cooled is left.",
  coverage:
    "Narrowing the range hides water outside it. Lift the minimum and only the better-observed" +
    " water is left, which shows you the shape of the gaps.",
};

export const PALETTES: Record<string, PaletteNote> = {
  thermal: {
    title: "thermal",
    designedFor: "Temperature",
    form: "sequential",
    suits: ["temperature"],
    caption:
      "Temperature, sequential. cmocean's thermal - the conventional oceanographic scale for"
      + " temperature.",
    note:
      "Runs cold and dark to warm and bright, which is the direction people already expect heat" +
      " to run. This is the house palette for temperature.",
  },
  haline: {
    title: "haline",
    designedFor: "Salinity",
    form: "sequential",
    suits: ["salinity"],
    caption:
      "Salinity, sequential. cmocean's haline - the conventional oceanographic scale for"
      + " salinity.",
    note:
      "Fresh to saline, in blues and yellows chosen so river plumes separate cleanly from open" +
      " ocean water. The house palette for salinity.",
  },
  dense: {
    title: "dense",
    designedFor: "Density",
    form: "sequential",
    suits: ["density"],
    caption:
      "Density, sequential. cmocean's dense - the conventional oceanographic scale for"
      + " seawater density.",
    note:
      "Built for seawater density, and running light to heavy in the direction people already" +
      " expect weight to run. The house palette for density.",
  },
  balance: {
    title: "balance",
    designedFor: "Anomalies about zero",
    form: "diverging",
    suits: ["temperature_anomaly"],
    caption:
      "Departure from average, diverging. cmocean's balance, with the pale middle forced onto"
      + " zero.",
    note:
      "A diverging palette, built around a midpoint that means something: the pale middle is" +
      " water sitting at its own average, and the two dark ends are warmer and cooler than it." +
      " The encoding range is forced to be symmetric so that midpoint really is zero.",
  },
  coverage: {
    title: "coverage",
    designedFor: "Observation coverage",
    form: "banded",
    suits: ["coverage"],
    caption:
      "Cast count, in four steps. Not a cmocean scale and not a continuous one: this palette was"
      + " built here, because twice as many casts is not twice as good.",
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
