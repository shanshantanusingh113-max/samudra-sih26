import type { AnomalyFeature, Manifest } from "./types";

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

/**
 * One control, explained.
 *
 * `does` is one sentence. `means` and `look` are **bullets**, at most four each and at most two
 * lines apiece, because these entries used to be three prose blocks of 40 to 70 words and
 * nobody read them mid-demo. The rewrite cut the average entry from about 170 words to about
 * 70. Nothing measured was cut: every figure kept its unit and moved into a bullet, and the
 * words that went were the connective ones.
 *
 * The left panel says *what* and *how much*; this says *why*. Anything that duplicates a
 * readout on the left belongs here and not there.
 */
export interface GuideEntry {
  /** Control name as it appears in the panel. */
  title: string;
  /** Is this a scientific choice, or only how it is drawn? Users badly want to know. */
  kind: "science" | "rendering" | "navigation";
  /** One sentence saying what this is. Never a paragraph. */
  does: string;
  /** Why it matters. Max 4 bullets, max 2 lines each. */
  means: string[];
  /** What to look for. Max 4 bullets, max 2 lines each. */
  look: string[];
  /** A concrete thing to try, so the user has a next action. The only imperative on the panel. */
  tryThis?: string;
}

/**
 * Every measured figure the guide panel quotes, read from the bake rather than typed here.
 *
 * Four figures used to be written into the entries below by hand - the coverage gap, three
 * statistics about the climatological normal, the anomaly-feature counts, and the drift score -
 * and every one of them moves on a re-bake. The anomaly one had been stale since August and
 * nothing caught it, because nothing can: a wrong number and a right number are the same shape.
 *
 * `requirements.html` already proves the pattern. An entry writes `{token}` and this fills it;
 * a token with no figure behind it takes its whole bullet out of the panel, because a sentence
 * that cannot be completed truthfully is better absent than approximate.
 */
export type GuideFigures = Record<string, string>;

/** `1234567` -> `1,234,567`. The panel quotes cell counts and cycle counts. */
function grouped(value: number): string {
  return Math.round(value).toLocaleString("en-GB");
}

/**
 * Build the figures from what the bake shipped.
 *
 * Everything optional. A bake without Copernicus has no drift block and a bake that could not
 * reach NOAA has no climatological one, and in both cases the bullets that quote them simply
 * do not appear.
 */
export function guideFigures(source: {
  manifest: Manifest | null;
  /** Anomaly Features per Timestep, as `anomalies.json` ships them. */
  anomalies?: AnomalyFeature[][];
}): GuideFigures {
  const figures: GuideFigures = {};
  const manifest = source.manifest;
  if (!manifest) return figures;

  figures.fieldCount = String(manifest.fields.length);
  figures.groupCount = String(manifest.fieldGroups?.length ?? 0);

  const coverage = manifest.coverage;
  if (coverage?.emptyFraction != null) {
    figures.coverageEmptyPct = `${(coverage.emptyFraction * 100).toFixed(1)}%`;
  }
  if (coverage?.radiusKm != null) figures.coverageRadiusKm = `${coverage.radiusKm} km`;

  const normal = manifest.normalAnomaly;
  if (normal) {
    figures.normalCells = grouped(normal.cells);
    figures.normalMean = `${normal.meanDegC >= 0 ? "+" : "-"}${Math.abs(normal.meanDegC).toFixed(2)} °C`;
    figures.normalP95 = `${normal.p95AbsDegC.toFixed(2)} °C`;
  }

  const cycle = manifest.drift?.cycle;
  if (cycle) {
    figures.driftMedianKm = `${cycle.medianKm.toFixed(0)} km`;
    figures.driftP90Km = `${cycle.p90Km.toFixed(0)} km`;
    figures.driftCycles = grouped(cycle.count);
  }
  if (manifest.drift) {
    figures.driftFloats = String(manifest.drift.floats);
    figures.driftDepth = `${manifest.drift.parkingDepthMetres.toFixed(0)} m`;
  }

  const features = source.anomalies;
  if (features && features.length) {
    const all = features.flat();
    figures.featureCount = grouped(all.length);
    figures.featuresNoCast = grouped(all.filter((f) => !f.casts).length);
  }

  return figures;
}

const TOKEN = /\{(\w+)\}/g;

/**
 * Fill one entry's `{token}`s, and drop whatever cannot be filled.
 *
 * Dropping is the whole point. Leaving `{driftMedianKm}` on screen is obviously broken and
 * would be caught; quietly printing a figure from the last bake is not, and that is the failure
 * this replaced.
 */
export function fillFigures(entry: GuideEntry, figures: GuideFigures): GuideEntry {
  const complete = (text: string) =>
    [...text.matchAll(TOKEN)].every((match) => figures[match[1] ?? ""] !== undefined);
  const fill = (text: string) => text.replace(TOKEN, (whole, key) => figures[key] ?? whole);
  const list = (points: string[]) => points.filter(complete).map(fill);
  return {
    ...entry,
    does: complete(entry.does) ? fill(entry.does) : entry.does.replace(TOKEN, "").replace(/\s{2,}/g, " "),
    means: list(entry.means),
    look: list(entry.look),
    tryThis: entry.tryThis && complete(entry.tryThis) ? fill(entry.tryThis) : undefined,
  };
}

export const GUIDE: Record<string, GuideEntry> = {
  field: {
    title: "Variable",
    kind: "science",
    does: "Switches which ocean property is drawn. {fieldCount} of them, in {groupCount} groups.",
    means: [
      "OCEAN STATE - what INCOIS publish, plus the density worked out from it.",
      "CIRCULATION - which way the water is moving.",
      "EVIDENCE - how much real measurement stands behind the model.",
      "CHANGE - how far the water is from its own average. HAZARD is behind cyclone mode.",
    ],
    look: [
      "Not every variable is a block of water, and its shape tells you which.",
      "A depth is a sheet inside the block, at the depth it reports.",
      "A whole-column total is painted on the sea surface. Currents are arrows.",
    ],
    tryThis: "Press 'Set up a cyclone question' above the tabs.",
  },

  hazardPreset: {
    title: "Cyclone mode",
    kind: "navigation",
    does:
      "Swaps the Variable list for the five things a cyclone forecaster asks for, and opens on" +
      " Cyclone Heat Potential.",
    means: [
      "A cyclone runs on stored heat, not on surface warmth.",
      "It stirs the water as it goes, so a thin warm skin cools itself out in hours.",
      "What matters is the heat above 26 °C down the whole column.",
      "Press it again to go back to where you were.",
    ],
    look: [
      "Deep red is where a storm would get stronger.",
      "Above 60 kJ/cm² is the usual threshold for rapid intensification.",
      "The pale patch off Oman is cold water being dragged up. No fuel at all.",
    ],
    tryThis: "Press play and watch the fuel build through the monsoon.",
  },

  scale: {
    title: "Log or linear colour scale",
    kind: "rendering",
    does: "Changes how the colours are spread across the range, not what the range is.",
    means: [
      "Linear - equal steps in value are equal steps in colour. Right for temperature.",
      "Wrong when most values are piled up near zero, as heat potential and speed are.",
      "Log gives the small values most of the colour range, so their structure appears.",
      "Offered on three variables only: the three whose range starts at a real zero.",
    ],
    look: [
      "The colourbar bends with it, so a colour reads the same number on both.",
      "So do the current arrows: their length runs through the same curve as their colour.",
    ],
    tryThis: "On Currents, switch to Log. The flat middle of the ocean turns into structure.",
  },

  temperature: {
    title: "Temperature",
    kind: "science",
    does: "The sea temperature INCOIS published, at every depth from 5 m to 2000 m.",
    means: [
      "The analysis itself. Not a measurement, and not a simulation.",
      "INCOIS fit it to the Argo floats reporting here every 10 days.",
      "It is what every other view here is checked against.",
      "Warm water is a storm's fuel, and how deep it goes decides whether it keeps it.",
    ],
    look: [
      "The orange band part way down is the thermocline, where the warm surface stops.",
      "Where it dips there is a thick pool of warm water.",
      "Where it lifts, cold water is near the surface.",
    ],
    tryThis: "Click a float and see whether the analysis got that column right.",
  },

  salinity: {
    title: "Salinity",
    kind: "science",
    does: "How salty the water is, on the same 24 depth levels as temperature.",
    means: [
      "Salt and temperature together decide whether water floats or sinks.",
      "Here salt often wins: the Ganges and Brahmaputra put a fresh lid on the Bay of Bengal.",
      "A storm cannot easily mix that lid away.",
      "PSU is the practical salinity unit. Open ocean sits near 35.",
    ],
    look: [
      "Compare India's two sides: the Bay of Bengal is visibly fresher than the Arabian Sea.",
      "The freshest water is a thin skin at the very top of the northern Bay.",
    ],
    tryThis: "Set the isosurface near 33 PSU. The surface closes around the river plume.",
  },

  density: {
    title: "Density",
    kind: "science",
    does: "How heavy the water is, worked out here from temperature and salinity together.",
    means: [
      "The ocean moves because water is light, not because it is warm.",
      "Light water floats on heavy water, and that is what makes the layers.",
      "The figure is an anomaly: 22 means 1022 kg/m³, against seawater near 1025.",
      "Nothing was downloaded for it. It follows from what we already held.",
    ],
    look: [
      "The northern Bay of Bengal is 0.8 °C warmer than the northern Arabian Sea.",
      "It is still 3.0 units lighter, because it is 3.6 PSU fresher.",
    ],
    tryThis: "Look at Temperature, then Density, without moving the camera. The layers change.",
  },

  temperature_anomaly: {
    title: "Temperature Anomaly",
    kind: "science",
    does: "How far each point is from its own average across the twelve analyses loaded.",
    means: [
      "The baseline is those twelve steps and nothing else: roughly April to July 2026.",
      "So it is a seasonal swing. Temperature vs Normal beside it is the climate one.",
      "Using each cell's own average removes geography: a warm Arabian Sea is not news.",
    ],
    look: [
      "The signal is strongest at 75 to 125 m, not at the surface.",
      "Measured: 0.74 °C of spread at 5 m, 1.55 °C at 100 m, 0.08 °C by 2000 m.",
      "What moves over a season is the thermocline. The deep ocean barely notices.",
    ],
    tryThis: "Drag Range min past the middle. Everything cooler than its average disappears.",
  },

  temperature_normal_anomaly: {
    title: "Temperature vs Normal",
    kind: "science",
    does:
      "How far this analysis sits from the 1991-2020 average for the same month, from NOAA's" +
      " World Ocean Atlas.",
    means: [
      "This is what a forecaster means by 'warmer than usual'.",
      "The atlas is monthly, so three ten-day steps share one baseline.",
      "Below 1500 m the atlas has no normal, so the deepest water is blank, not zero.",
      "Over {normalCells} cells: mean {normalMean}, and {normalP95} at the 95th percentile.",
    ],
    look: [
      "Red is warmer than the thirty-year normal for that month. Blue is cooler.",
      "The strongest departures are in the thermocline, not at the surface.",
      "The atlas has its own coastline: 79 of 1,537 surface cells are blank here and wet next" +
        " door.",
    ],
    tryThis: "Compare it against Temperature Anomaly on the last Timestep.",
  },

  coverage: {
    title: "Observation Coverage",
    kind: "science",
    does:
      "Not the model but the evidence: Argo casts within {coverageRadiusKm} of each point that" +
      " dived through that depth.",
    means: [
      "A model has a value everywhere, measured or not. That is the grid, not the evidence.",
      "Grey is the analysis filling in between distant floats. Green is where floats went.",
      "In this bake {coverageEmptyPct} of the block has no cast behind it at all.",
    ],
    look: [
      "The middle of the Arabian Sea, against the coasts and the Andamans.",
      "Press play: the pattern shifts as the floats drift.",
      "A float on a red patch is no contradiction. Red means one cast nearby.",
    ],
    tryThis: "Switch to Temperature and look at the same spot. The model is confident either way.",
  },

  // The five hazard Fields, and the reason each one's first bullet reads the way it does.
  //
  // Read in the order the panel offers them - heat potential, depth of 26 °C, mixed layer,
  // isothermal layer, barrier layer - four of the five are "a depth to do with warm water", and
  // nothing here used to say why a reader would open one rather than the one above it. They are
  // one chain: how much fuel there is, how far down it reaches, how far the wind has stirred,
  // that same boundary measured a second way, and the gap between the last two. So the **first
  // bullet of every one of them names its neighbour and says what it asks instead**. Nothing
  // measured was cut to make room: the level spacing each sheet inherits stays on its own entry,
  // and barrier layer's moved from `means` into `look`, which is where a limitation of the
  // picture belongs anyway. Measured by `probe-guide.mjs` after the rewrite: median 113 words on
  // the panel, unmoved, and no list over 4 bullets.
  heat_potential: {
    title: "Cyclone Heat Potential",
    kind: "science",
    does:
      "Heat stored above 26 °C, from the surface down to the 26 °C depth. One number per" +
      " water column.",
    means: [
      "The total: how much fuel there is. Depth of 26 °C says how far down it reaches.",
      "A cyclone stirs the column, so a thin warm skin cools out in hours and a deep one does not.",
      "Sea surface temperature cannot tell those two apart. This can.",
      "Above 60 kJ/cm² is the usual threshold for rapid intensification.",
    ],
    look: [
      "Deep red, Bay of Bengal, June to July: the deepest fuel in this ocean.",
      "Almost white off Oman, where the monsoon pulls cold water up. No fuel at all.",
      "It stops at the 26 °C depth, found between model levels about 25 m apart.",
    ],
    tryThis: "Press play: watch the fuel build through the monsoon.",
  },

  d26: {
    title: "Depth of 26 °C",
    kind: "science",
    does:
      "How deep the water warm enough to feed a cyclone runs, drawn as a sheet at that depth.",
    means: [
      "The same fuel as Cyclone Heat Potential, asked the other way: not how much, but how deep.",
      "26 °C is the conventional floor for a tropical cyclone to develop.",
      "A bulge downward is fuel a storm can keep drawing on; near the surface it is a thin lid.",
      "Found between model levels, 25 m apart near 70 m.",
    ],
    look: [
      "It is not flat, and that is the picture no map can give you.",
      "It bulges down in the central Bay of Bengal. Deepest fuel in the region.",
      "It rises almost to the surface off Somalia and Oman, where cold water is pulled up.",
    ],
    tryThis: "Press play and watch the sheet breathe across four months, with the floats on it.",
  },

  mixed_layer_depth: {
    title: "Mixed Layer Depth",
    kind: "science",
    does: "How deep the wind and waves have stirred the water into one uniform body, by density.",
    means: [
      "How far down the wind has reached. It decides whether a storm can pull cold water up.",
      "Above it the ocean is one slab that heats and cools quickly. Below it, layered and still.",
      "Defined by density: where it has risen 0.03 kg/m³ above its value at 10 m.",
      "It usually bites between 10 and 30 m, where the model has only three levels.",
    ],
    look: [
      "Shallow in the northern Bay of Bengal, where fresh river water refuses to mix.",
      "Deeper in the Arabian Sea, where the monsoon wind does the stirring.",
    ],
    tryThis: "Compare it against Isothermal Layer Depth. Where they differ there is a barrier layer.",
  },

  isothermal_layer_depth: {
    title: "Isothermal Layer Depth",
    kind: "science",
    does: "How deep the water is all one temperature, drawn as a sheet at that depth.",
    means: [
      "The same boundary as Mixed Layer Depth, found with a thermometer and not a density meter.",
      "Where temperature has fallen 0.2 °C below its value at 10 m.",
      "So it runs deeper wherever fresh water floats on top: fresh water is light, not cold.",
      "Found between model levels, 10 m apart near the surface.",
    ],
    look: [
      "In the northern Bay of Bengal this runs much deeper than the Mixed Layer Depth.",
      "The gap between the two is the barrier layer, which is the variable below this one.",
    ],
    tryThis: "Switch between this and Mixed Layer Depth and watch where they part company.",
  },

  barrier_layer: {
    title: "Barrier Layer Thickness",
    kind: "science",
    does: "Isothermal Layer Depth minus Mixed Layer Depth, painted on the sea surface.",
    means: [
      "The gap between those two depths, and the gap is the whole point.",
      "River water floats on the warm salty water below and makes a lid.",
      "A storm stirring through it pulls up water that is fresh but not cold, so the sea stays warm.",
      "That is why Bay of Bengal cyclones behave unlike Arabian Sea ones.",
    ],
    look: [
      "The northern Bay of Bengal, late in the monsoon when the rivers are fullest.",
      "The Arabian Sea has very little of it.",
      "Negative means the opposite: salt layering water the temperature calls mixed.",
      "It is two depths subtracted, so it carries the level spacing of both.",
    ],
    tryThis: "Turn on Cyclone Heat Potential afterwards. The two together are the storm question.",
  },

  current_speed: {
    title: "Currents",
    kind: "science",
    does: "Which way the water is moving and how fast, as arrows on the depth you have sliced to.",
    means: [
      "Copernicus Marine's global model at 1/12 of a degree, about 9 km.",
      "That is twelve times finer than the INCOIS grid.",
      "Read at bake time, at the nearest of their points to each of ours.",
    ],
    look: [
      "The Somali coast in July: 2.94 m/s at 9.5 °N, 51.5 °E on 30 July.",
      "One of the fastest currents in any ocean, and why this block starts at 45 °E.",
    ],
    tryThis: "Press play. The whole circulation reverses through the monsoon.",
  },

  incois_casts: {
    title: "INCOIS Cast Count",
    kind: "science",
    does: "How many observations INCOIS's own analysis says it drew on at each point.",
    means: [
      "The provider's number, not ours.",
      "It comes from their second analysis of the same Argo floats.",
      "Put it beside Observation Coverage, which we count ourselves from the raw casts.",
    ],
    look: [
      "Where both say nothing was measured, nothing was measured.",
      "Neither of us is guessing about that.",
    ],
    tryThis: "Switch back and forth between the two: our method against the provider's.",
  },

  incois_rmse: {
    title: "INCOIS Error Estimate",
    kind: "science",
    does: "INCOIS's own error figure for their temperature analysis, at every point and depth.",
    means: [
      "Published by the provider alongside the analysis.",
      "It is how far their field typically sits from the observations that went into it.",
      "Large values mark water the analysis itself does not claim to know well.",
    ],
    look: [
      "Largest in the thermocline, where a small vertical shift is a big temperature change.",
      "Largest again where no float has been.",
    ],
    tryThis: "Turn on Observation Coverage after this. Two views of the same weakness.",
  },

  analysis_spread: {
    title: "Analysis Spread",
    kind: "science",
    does: "INCOIS's two analyses of the same Argo floats, subtracted from each other.",
    means: [
      "INCOIS analyse the same observations twice, by two different methods.",
      "Where the two agree, two careful independent pieces of work say the same thing.",
      "Where they disagree, neither really knows. A real uncertainty signal, free.",
    ],
    look: [
      "The disagreement clusters in the thermocline and where there are fewest casts.",
      "Pale means the methods agree. The dark ends are where they do not.",
    ],
    tryThis: "Compare it against Observation Coverage. Most disagreement is where nobody measured.",
  },

  anomalyFeatures: {
    title: "Anomaly features",
    kind: "science",
    does: "Puts a clickable ring on every connected body of water that departed from its average.",
    means: [
      "The anomaly field says water departed. It cannot say which blob, or how big.",
      "A body must pass two standard deviations AND 0.5 °C before it is marked.",
      "A hundredth of a degree in water that never moves is a big outlier and a useless one.",
    ],
    look: [
      "Click one for its depth, its size, and how many casts stand behind it.",
      "{featuresNoCast} of the {featureCount} in this bake have no cast at all.",
      "Vivid colour with no ring is usually the thermocline at 50-100 m, moving every step.",
    ],
    tryThis: "Click a ring, then 'Show only this body of water'.",
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
    does: "Hides everything except the feature you clicked, and swings the camera onto it.",
    means: [
      "A coloured blob inside a solid block says almost nothing about its shape.",
      "You cannot see where it starts, how deep it runs, or if it is one body or three.",
      "What is left is exactly the water every number on the panel was measured over.",
    ],
    look: [
      "Most are wide and thin: a few hundred kilometres across, a few tens of metres deep.",
      "The thermocline moves up and down over a season, not sideways.",
    ],
    tryThis: "Isolate one, then drag Vertical exaggeration down. It flattens into a sheet.",
  },

  rendering: {
    title: "Rendering",
    kind: "rendering",
    does: "How the water is drawn. None of these changes a number.",
    means: [
      "Water opacity is how murky the water is, so how far into it you can see.",
      "Feature emphasis fades out still water and keeps the boundaries.",
      "Vertical exaggeration stretches the depth axis, because the region is 4000 times wider" +
        " than it is deep.",
      "Ray steps is quality against speed.",
    ],
    look: [
      "A sheet or an arrow field has no water to make murky, so those two sliders disappear.",
      "The depth labels down the left stay correct at every exaggeration.",
    ],
    tryThis: "Slide Feature emphasis from 0 to 100% and watch the thermocline appear.",
  },

  currents: {
    title: "Currents",
    kind: "science",
    does: "The speed and heading of the water under your cursor, read where you point.",
    means: [
      "Read from the current file itself, not from the picture on screen.",
      "The flow sits at the top of the Depth slice, or at Sea surface level on the globe.",
      "So moving the Depth slice moves it down through the water.",
    ],
    look: [
      "Move the cursor along the Somali coast in July for the fastest water here.",
      "Speeds fall quickly with depth. The surface jets are not there at 1000 m.",
    ],
    tryThis: "Drag the Depth slice down and watch the flow change direction.",
  },

  currentStyle: {
    title: "Moving flow, or arrows",
    kind: "rendering",
    does: "Two ways of drawing one layer. The same file, the same depth, the same colours.",
    means: [
      "Moving flow is a few thousand dots carried by the current, with a fading trail.",
      "It is the water at ONE instant, not a forecast. Drift is the one that runs time.",
      "The clock is sped up to make it visible. Relative speeds are untouched.",
      "The trails carry direction only. Speed is the colour of the water under them.",
    ],
    look: [
      "The Somali Current and the equatorial jets, drawn as lines you can follow.",
      "A faster current draws a longer trail, because a dot travels further per frame.",
      "No small swirls: the grid is 1 degree, so an eddy is smaller than one cell.",
    ],
    tryThis: "Drag the Depth slice from 5 m to 1000 m and watch the whole basin change direction.",
  },

  instruments: {
    title: "Instruments",
    kind: "navigation",
    does: "Turns the markers and their tracks on or off.",
    means: [
      "Circles are drifting Argo floats. Squares are buoys anchored to the sea floor.",
      "The count is every instrument in the bake, not the number on screen right now.",
      "A float is only drawn near a date it actually surfaced on.",
      "Drift tracks are the path each float took between surfacings.",
    ],
    look: [
      "Press play and watch the floats move. That movement is a measurement of the current.",
      "The squares never move. That is what makes them a different kind of check.",
    ],
    tryThis: "Turn on Drift tracks and press play.",
  },

  palette: {
    title: "Colourbar",
    kind: "rendering",
    does: "Shows which colour stands for which value in the variable on screen.",
    means: [
      "cmocean palettes, the standard in oceanography.",
      "An equal step in value looks like an equal step in colour.",
      "Rainbow scales are avoided: they invent sharp edges that are not in the data.",
      "There is no palette chooser. Each variable carries its own.",
    ],
    look: [
      "The numbers at the ends of the bar move when you narrow the range.",
      "The range is yours to change. The colours are not.",
    ],
  },

  window: {
    title: "Colourbar range",
    kind: "science",
    does: "Sets which values get colour. Water outside the range becomes fully transparent.",
    means: [
      "This is not just recolouring: out-of-range water disappears.",
      "So narrowing it isolates one body of water and shows its shape in three dimensions.",
    ],
    look: [
      "Narrow it to a few degrees and the rest of the ocean vanishes.",
      "One layer is left floating in space. That layer is a water mass.",
    ],
    tryThis: "Set it to roughly 17-24 °C and watch a single layer separate out.",
  },

  depthSlice: {
    title: "Depth slice",
    kind: "navigation",
    does: "Hides all water outside a chosen depth range.",
    means: [
      "It cuts the block open so you can look inside.",
      "Nothing is recalculated. Water outside the range is simply not drawn.",
    ],
    look: [
      "0-200 m keeps only the sunlit surface layer.",
      "500-2000 m shows the cold deep ocean on its own.",
    ],
    tryThis: "Drag 'from surface' down slowly and watch the warm layer peel away.",
  },

  opacity: {
    title: "Water opacity",
    kind: "rendering",
    does: "Sets how much light each metre of water blocks.",
    means: [
      "Think of it as how murky the water is.",
      "Low values let you see all the way to 2000 m.",
      "High values run out of transparency in the first few metres.",
    ],
    look: [
      "Turn it up and the block becomes a solid yellow lid.",
      "Turn it down and depth reappears. Nothing about the data changed.",
    ],
  },

  emphasis: {
    title: "Feature emphasis",
    kind: "rendering",
    does: "Makes still water transparent and changing water solid.",
    means: [
      "Temperature falls smoothly with depth, so drawing every drop equally hides the deep.",
      "This weights each drop by how fast the value is changing around it.",
      "So featureless water fades out and boundaries stay.",
    ],
    look: [
      "At 0% you see a flat surface layer and little else.",
      "Turn it up and a sharp band appears part way down. That band is the thermocline.",
    ],
    tryThis: "Slide it from 0 to 100% slowly and watch the thermocline emerge.",
  },

  exaggeration: {
    title: "Vertical exaggeration",
    kind: "rendering",
    does: "Stretches the depth axis by the factor shown.",
    means: [
      "The region is about 4000 times wider than it is deep.",
      "True to scale it would be an invisible film. Stretching it is normal in oceanography.",
      "It changes the shape of the picture, never the numbers.",
    ],
    look: [
      "The depth labels down the left stay correct at every setting.",
      "Their spacing is uneven on purpose: the axis is denser near the surface.",
    ],
  },

  quality: {
    title: "Ray steps",
    kind: "rendering",
    does: "Sets how many samples are taken along each ray of light through the water.",
    means: [
      "Purely quality against speed.",
      "The one control here that changes nothing scientific at all.",
    ],
    look: ["Low values show faint banding. High values are smoother and slower."],
    tryThis: "If the machine struggles, drop this to 64. It stays perfectly readable.",
  },

  volumeEnabled: {
    title: "Show volume",
    kind: "rendering",
    does: "Turns the body of water on or off.",
    means: ["Useful for looking at an isosurface with no water drawn in front of it."],
    look: ["With the volume off and an isosurface on, the surface's shape becomes much clearer."],
  },

  isosurface: {
    title: "Isosurface",
    kind: "science",
    does: "Draws a solid skin through every point where the water is exactly one chosen value.",
    means: [
      "A surface of constant value.",
      "What it means depends on the variable it cuts through, and each has its own name.",
    ],
    look: ["Turn off 'Show volume' to see the surface on its own."],
  },

  surfaceLevel: {
    title: "Sea surface level",
    kind: "navigation",
    does: "Chooses which depth is painted onto the map and globe.",
    means: [
      "The globe shows one depth at a time.",
      "This picks which, so you can see a pattern change with depth without diving in.",
    ],
    look: ["Surface patterns are sharp and varied.", "By 1000 m the ocean is far more uniform."],
  },

  timestep: {
    title: "Time",
    kind: "navigation",
    does: "Steps through INCOIS analyses, one every 10 days.",
    means: [
      "Each frame is a separate analysis INCOIS published. Not an interpolation.",
      "The colour scale is held fixed across all frames, so a change you see is real.",
    ],
    look: ["Playing April through July shows the monsoon arriving."],
    tryThis: "Press play and watch the surface layer change through the season.",
  },

  bias: {
    title: "Model vs instruments",
    kind: "science",
    does: "Ranks every instrument by how far the analysis sat from what it measured.",
    means: [
      "The gap is the model minus the instrument, at the cast that was compared.",
      "INCOIS feed the Argo floats into their analysis, so the buoys are the real test.",
      "Ranked as a share of each variable's range, so degrees and PSU share one list.",
    ],
    look: [
      "Blue is where the analysis reads low against the instruments, red where it reads high.",
      "One colour over a patch is a regional bias. A mix is scatter, a different problem.",
      "The map holds every comparison at once, so it does not change with the timeline.",
      "Only Temperature, Salinity and Density have one. Nothing measures the rest.",
    ],
    tryThis: "Click the top row. The comparison for that instrument opens on the right.",
  },

  drift: {
    title: "Drift",
    kind: "science",
    does: "Drops a pin and follows it forward through the currents, at the depth you sliced to.",
    means: [
      "A real search also needs wind, waves and the object's own drift. This has none.",
      "'Follow it for' is how many days ahead to run it, 1 to 60.",
      "The pin does not move. The line is the whole trip, from the date on screen.",
    ],
    look: [
      "The violet line is predicted. The orange track is measured.",
      "Where they run together the currents were right. Where they part they were not.",
      "A line that stops early ran out of ocean with current data, and says so.",
      "Scored at {driftDepth} on {driftFloats} floats: median {driftMedianKm} over one cycle.",
    ],
    tryThis: "Drop a pin, then select a float and watch its predicted line against its real one.",
  },

  upload: {
    title: "Your own data",
    kind: "science",
    does: "Reads a NetCDF file you drop on the page and offers its variables beside ours.",
    means: [
      "The problem statement asks for NetCDF parsing with little new code. This is that claim.",
      "It is resampled onto this block: 56 x 36 x 48 over 45-100 °E, 10 °S-25 °N.",
      "It is held in memory on the API and never stored.",
    ],
    look: [
      "Your variables appear under a YOURS tab and behave like the built-in ones.",
      "A file it cannot read names the axis it could not find, rather than drawing something.",
      "Variables it had to skip are listed by name, with the reason.",
    ],
    tryThis: "Drop any CF-conventions NetCDF with latitude and longitude in it.",
  },

  section: {
    title: "Vertical section",
    kind: "science",
    does:
      "Cuts the model along a line you draw and shows it side-on: depth down, distance across," +
      " value as colour.",
    means: [
      "A map shows you one depth. This shows every depth along the line at once.",
      "So you see the layers, and where they tilt, and how thick each one is.",
      "Cut from the model's own 24 levels, so the depths are the analysis's, not the picture's.",
      "Casts near the line and near this date are drawn on the same axes.",
    ],
    look: [
      "The thermocline is the band where the colour changes fastest, usually 50-150 m.",
      "Where it bends up toward the surface, cold water is being pulled up. That is upwelling.",
      "Blank is where the model has no ocean: land, or below the sea floor.",
    ],
    tryThis: "Draw one from off Somalia east across the Arabian Sea and watch the upwelling.",
  },

  floats: {
    title: "Argo floats",
    kind: "science",
    does: "Shows the robot instruments drifting in this water, at their true positions.",
    means: [
      "A float sinks to 2000 m, drifts for 10 days, then rises measuring on the way up.",
      "They are the ground truth the model is checked against.",
    ],
    look: ["Click any float to compare what it measured against what the model predicted."],
    tryThis: "Click a float. The panel on the right becomes the comparison.",
  },

  moorings: {
    title: "Moored buoys",
    kind: "science",
    does: "Shows the buoys anchored to the sea floor, drawn as squares rather than dots.",
    means: [
      "Tethered in one place, sensors down a wire, measuring the same column for years.",
      "Four here are India's own OMNI network, run by NIOT with INCOIS as data centre.",
      "Three are RAMA, the joint MoES-NOAA array.",
      "INCOIS do not feed these into the analysis, so they are an independent check.",
    ],
    look: [
      "Click one and move the timeline. It never drifts, so you watch one patch all season.",
      "An Argo float cannot. By the next analysis it is somewhere else.",
    ],
    tryThis: "Open the buoy in the Bay of Bengal and play the timeline from April to July.",
  },

  chlorophyll: {
    title: "Chlorophyll",
    kind: "science",
    does: "How much plant life a float measured, where it carries the sensor for it.",
    means: [
      "It marks where nutrients reach the sunlit layer: upwelling, river plumes, blooms.",
      "It is what fisheries advisories are built on.",
      "It is drawn alone: no gridded chlorophyll shares this timeline to compare against.",
    ],
    look: [
      "The peak is usually not at the surface.",
      "Look for the bulge between about 30 and 80 m, where there is light and food left.",
    ],
  },

  tracks: {
    title: "Drift tracks",
    kind: "science",
    does: "Draws the path each float has taken between surfacings.",
    means: [
      "Floats are not anchored. They drift with the current at their parking depth.",
      "So the track is itself a measurement of deep ocean flow.",
    ],
    look: ["Long straight tracks mean a strong steady current.", "Loops and knots mean an eddy."],
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
  temperature_normal_anomaly:
    "worked out here as INCOIS's analysis for %d minus NOAA's World Ocean Atlas 2023 mean for" +
    " that calendar month, averaged over 1991-2020",
  coverage:
    "counted here from the Argo casts taken around %d. This is the evidence behind the model," +
    " not the model",
  heat_potential:
    "worked out here from INCOIS's temperature analysis for %d, by Leipper and Volgenau's" +
    " definition - the heat above 26 °C, integrated from the surface to that isotherm",
  d26: "worked out here from INCOIS's temperature analysis for %d",
  mixed_layer_depth:
    "worked out here from the TEOS-10 density for %d, by de Boyer Montegut's 0.03 kg/m³" +
    " criterion referenced to 10 m",
  isothermal_layer_depth:
    "worked out here from INCOIS's temperature analysis for %d, by the matching 0.2 °C" +
    " criterion referenced to 10 m",
  barrier_layer:
    "worked out here for %d as the isothermal layer depth minus the mixed layer depth",
  current_speed:
    "read from Copernicus Marine's global analysis for %d, at one twelfth of a degree, taken at" +
    " the nearest of their grid points to each of ours",
  incois_casts:
    "INCOIS's own count of the observations behind their Kessler-McCreary analysis for %d." +
    " Their number, not ours",
  incois_rmse:
    "INCOIS's own error estimate, published alongside their Kessler-McCreary analysis for %d",
  analysis_spread:
    "worked out here for %d as INCOIS's Variational analysis minus their Kessler-McCreary" +
    " analysis of the same floats",
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
  /** How this Field is drawn. A depth sheet and a column total are not a body of water. */
  render?: "volume" | "depth" | "column" | "vector";
  /** Where the current arrows or the flow sit, when a vector Field is on screen. */
  arrowDepth?: number;
  /** Which of the two styles that layer is drawn in, so the sentence names what is on screen. */
  currentStyle?: "particles" | "arrows";
  /** True where the Field runs through zero, so an isosurface is drawn on both sides of it. */
  diverging?: boolean;
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
    render = "volume",
    arrowDepth,
    currentStyle = "particles",
    diverging = false,
  } = options;

  const provenance = (PROVENANCE[fieldKey] ?? "as loaded for %d").replace("%d", date);

  // What the middle sentence says depends on what kind of thing is drawn, because the depth
  // slice does not cut a sheet or a drape and saying it does would be describing the wrong
  // picture. Same rule as describePalette and describeIsosurface: anything whose meaning changes
  // with the Field is built per Field rather than written once.
  const shape =
    render === "depth"
      ? "It is drawn as a sheet inside the block, sitting at the depth it reports - so where the" +
        " sheet dips, the value is larger."
      : render === "column"
        ? "It is one number for the whole water column, so it is painted on the sea surface" +
          " rather than drawn inside the water."
        : render === "vector"
          ? currentStyle === "arrows"
            ? `The arrows sit at ${(arrowDepth ?? 5).toFixed(0)} m and point the way the water` +
              " is going; their length and colour are its speed."
            : `The moving dots sit at ${(arrowDepth ?? 5).toFixed(0)} m and are carried by the` +
              " current itself, so they show its direction; the colour of the water under them" +
              " is its speed. This is the flow at this one date, not a forecast."
          : fromDepth > 10 || toDepth < 1900
            ? `Only water between ${fromDepth.toFixed(0)} m and ${toDepth.toFixed(0)} m is shown.`
            : "The full water column is shown, from 5 m down to 2000 m.";

  // Two surfaces on a diverging Field, not one. This said "the solid surface ... is exactly
  // 0.5 degC" while the scene was drawing a warm skin and a cool skin, which is the same sentence
  // being wrong about the count and about the sign at once.
  const iso =
    isoEnabled && render === "volume"
      ? diverging
        ? ` The two solid surfaces running through it enclose the water that rose by ${isoValue}` +
          ` and the water that fell by it.`
        : ` The solid surface running through it marks where the water is exactly ${isoValue}.`
      : "";

  return (
    `You are looking at ${fieldLabel.toLowerCase()} across India's exclusive economic zone,` +
    ` ${provenance}. ${shape}${iso}` +
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
   * Why this scale, in bullets. Printed by the guide panel.
   *
   * There used to be a one-line `caption` beside this, printed as a paragraph under the swatch
   * in the left panel. It said the same thing describePalette's own first line says, which is
   * built from `designedFor` and `form` - so the panel carried the explanation and the readout
   * of the same fact. The left panel says what and how much; this says why. The caption is gone
   * and the two clauses that lived only in it moved here.
   */
  note: string[];
}

/**
 * What narrowing the Transfer Function range does, per Field. **One clause.**
 *
 * "which is how you isolate a single water mass" is the right sentence for temperature,
 * salinity and density. A water mass is a body of water with a characteristic temperature and
 * salinity, so there is no water mass in a count of Argo casts and none in a departure from an
 * average either - and this note was printed under all five.
 *
 * These used to be two-clause sentences that all began "Narrowing the range hides water outside
 * it", which the reader has already learned by the second Field. The shared half is gone and
 * what is left is the part that differs: the one move worth making on *this* Field.
 */
export const RANGE_NOTE: Record<string, string> = {
  temperature: "Hides water outside the range, which isolates a single water mass.",
  salinity: "Hides water outside the range, which isolates a single water mass.",
  density: "Hides water outside the range, which isolates a single water mass.",
  temperature_anomaly: "Lift the minimum past the middle for only the water that warmed.",
  temperature_normal_anomaly:
    "Lift the minimum past the middle for only the water warmer than its thirty-year normal.",
  coverage: "Lift the minimum for the better-observed water, which shows the shape of the gaps.",
  incois_casts: "Lift the minimum for only the water INCOIS themselves say is well observed.",
  incois_rmse: "Lift the minimum for only the water INCOIS are least confident about.",
  analysis_spread: "Pull both ends in: only the water the two analyses agree about survives.",
  heat_potential: "Lift the minimum to 60 for the water a cyclone could intensify over.",
  d26: "The sheet is drawn only where it sits between the two depths.",
  mixed_layer_depth: "The sheet is drawn only where it sits between the two depths.",
  isothermal_layer_depth: "The sheet is drawn only where it sits between the two depths.",
  barrier_layer: "Lift the minimum past zero for only the genuine barrier layers.",
  current_speed: "Lift the minimum and only the jets are left, which finds the Somali Current.",
};

export const PALETTES: Record<string, PaletteNote> = {
  thermal: {
    title: "thermal",
    designedFor: "Temperature",
    form: "sequential",
    suits: ["temperature"],
    note: [
      "Cold and dark to warm and bright, the direction people already expect heat to run.",
      "The house palette for temperature.",
    ],
  },
  haline: {
    title: "haline",
    designedFor: "Salinity",
    form: "sequential",
    suits: ["salinity"],
    note: [
      "Fresh to saline, in blues and yellows chosen so river plumes separate cleanly from open" +
        " ocean water.",
      "The house palette for salinity.",
    ],
  },
  dense: {
    title: "dense",
    designedFor: "Density",
    form: "sequential",
    suits: ["density"],
    note: [
      "Built for seawater density, running light to heavy - the direction people already expect" +
        " weight to run.",
      "The house palette for density.",
    ],
  },
  balance: {
    title: "balance",
    designedFor: "Anomalies about zero",
    form: "diverging",
    suits: [
      "temperature_anomaly",
      "temperature_normal_anomaly",
      "analysis_spread",
      "barrier_layer",
    ],
    note: [
      "Diverging, around a midpoint that means something.",
      "The pale middle is water at its own average. The dark ends are above and below.",
      "The range is forced symmetric so that midpoint really is zero.",
    ],
  },
  deep: {
    title: "deep",
    designedFor: "A depth",
    form: "sequential",
    suits: ["d26", "mixed_layer_depth", "isothermal_layer_depth"],
    note: [
      "Pale where the surface is shallow, dark where it runs deep.",
      "All three variables that are a depth share it, so comparing them is fair.",
    ],
  },
  amp: {
    title: "amp",
    designedFor: "Heat content",
    form: "sequential",
    suits: ["heat_potential"],
    note: [
      "Almost white at zero, deep red at the top.",
      "Heat potential has a real zero: water with nothing above 26 °C in it.",
      "The deep end is where a storm would intensify.",
    ],
  },
  speed: {
    title: "speed",
    designedFor: "Current speed",
    form: "sequential",
    suits: ["current_speed"],
    note: [
      "Built for exactly this: still water pale, the fastest jets dark.",
      "Speed has a real zero, so the scale is anchored there, not at the slowest value.",
    ],
  },
  tempo: {
    title: "tempo",
    designedFor: "A count of observations",
    form: "sequential",
    suits: ["incois_casts"],
    note: [
      "Anchored at zero: no observations is a real value, not the smallest one here.",
      "Deliberately not the banded scale used for our own Observation Coverage.",
      "That one is banded because we choose the thresholds. This count is INCOIS's.",
    ],
  },
  matter: {
    title: "matter",
    designedFor: "An error estimate",
    form: "sequential",
    suits: ["incois_rmse"],
    note: [
      "Pale where the analysis is confident, dark where it is not.",
      "Anchored at zero, because no error is a real claim rather than the smallest here.",
      "The dark end is water INCOIS themselves say they do not know well.",
    ],
  },
  coverage: {
    title: "coverage",
    designedFor: "Observation coverage",
    form: "banded",
    suits: ["coverage"],
    note: [
      "Not a cmocean palette and not a continuous scale.",
      "Four flat bands, because twice as many casts is not twice as good.",
      "Grey through red and amber to green, which reads correctly without a legend.",
    ],
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
  { name: string; hint: string; means: string[]; look: string[]; tryThis: string }
> = {
  temperature: {
    name: "isotherm",
    hint:
      "The 20 °C isotherm is the conventional proxy for the thermocline, and its depth drives" +
      " cyclone-intensity forecasts.",
    means: [
      "A surface of constant temperature, an isotherm.",
      "The 20 °C one marks the bottom of the warm surface layer.",
      "How deep it sits says how much warm water a cyclone can draw on.",
      "A real operational number, not an effect.",
    ],
    look: [
      "Bulging downward - a deep pool of warm water, which is fuel for a storm.",
      "Rising - cold water close to the surface.",
    ],
    tryThis: "Set the value near 20 °C and look at the shape.",
  },
  salinity: {
    name: "isohaline",
    hint: "An isohaline traces the edge of a freshwater plume rather than a temperature layer.",
    means: [
      "A surface of constant salinity, an isohaline.",
      "It wraps the river water: the Ganges and Brahmaputra freshen the Bay of Bengal.",
      "This draws the underside of that lid, which no surface map can show.",
    ],
    look: [
      "Set it near 33 PSU and the surface closes around the northern Bay of Bengal.",
      "That shape is the plume. Its thickness decides whether a storm can mix it away.",
    ],
    tryThis: "Set the value near 33 PSU and look at the northern Bay of Bengal.",
  },
  density: {
    name: "isopycnal",
    hint: "An isopycnal is a surface the ocean genuinely moves along, not just a contour.",
    means: [
      "A surface of constant density, an isopycnal, and the most physical of the three.",
      "Water slides along equal density far more easily than across it.",
      "So this is close to a real sheet the ocean moves on.",
    ],
    look: [
      "Bulging downward - light water piled up, a warm or fresh lens.",
      "Lifting toward the surface - upwelling, seen from the side.",
    ],
    tryThis: "Set the value near 24 kg/m³ and watch it dome across the equator.",
  },
  analysis_spread: {
    name: "contour of disagreement",
    hint: "Here the surface encloses the water the two analyses disagree about by at least this.",
    means: [
      "Not a water mass but a boundary.",
      "The skin around water where INCOIS's two analyses differ by more than you set.",
      "Inside it they disagree by at least that much. Outside it, less.",
    ],
    look: [
      "Two surfaces, not one: one for each analysis being the warmer.",
      "So you can see how big each argument is, and which way round it goes.",
    ],
    tryThis: "Set it near 1 °C and see where the two methods part company.",
  },
  temperature_normal_anomaly: {
    name: "contour of departure from normal",
    means: [
      "A boundary, not a water mass: the skin around water past your value from normal.",
      "Two surfaces, one each side of zero, each in its own end of the palette.",
      "The normal is monthly, so three Timesteps in a row share one baseline.",
    ],
    look: [
      "How big and how deep a real climate departure is, rather than guessing from colour.",
      "Nothing below 1500 m: the atlas has no normal there, so no departure to draw.",
    ],
    hint: "The surface encloses water that departed from its 1991-2020 normal by this much.",
    tryThis: "Set it near 1 °C and count the separate bodies of each sign.",
  },
  temperature_anomaly: {
    name: "contour of departure",
    hint: "Here the surface encloses the water that departed by more than the chosen amount.",
    means: [
      "Not a water mass but a boundary.",
      "The skin around water that departed from its own average by more than you set.",
      "Two surfaces: one around water that warmed, one around water that cooled.",
      "It will not go below 0.5 °C, the threshold the anomaly detector itself uses.",
    ],
    look: [
      "How big and how deep each body is, rather than guessing from colour.",
      "Warm and cool bodies are usually different shapes, easiest to see here.",
    ],
    tryThis: "Set it near 1 °C and count how many separate bodies there are of each sign.",
  },
};

/** The guide entry for the isosurface, worded for the Field it is being cut through. */
/** The guide entry for the isosurface, worded for the Field it is being cut through. */
export function describeIsosurface(fieldKey: string, units: string): GuideEntry {
  const entry = ISOSURFACES[fieldKey];
  if (!entry) return GUIDE.isosurface as GuideEntry;
  return {
    title: `Isosurface: the ${entry.name}`,
    kind: "science",
    does:
      `A solid skin through every point where the water is exactly one chosen value in` +
      ` ${units}. That surface is called ${/^[aeiou]/i.test(entry.name) ? "an" : "a"}` +
      ` ${entry.name}.`,
    means: entry.means,
    look: entry.look,
    tryThis: `Turn off 'Show volume', then: ${entry.tryThis}`,
  };
}

/**
 * The guide entry for the colourbar of one Field.
 *
 * `uploaded` is not a detail. Every entry in `PALETTES` says what its scale was *designed for*,
 * which is true of a Field this project chose a palette for and false of one where a palette
 * was inferred from a stranger's file. `netcdf._palette_for` reads `standard_name`, so an
 * unrecognised variable gets `matter` - and the note then told the reader they were looking at
 * a scale "designed for an error estimate", naming a quantity their file is not. That is
 * ADR 0010's own failure arriving through a door the ADR did not close, so an uploaded Field
 * gets its own wording: what the scale is, and where the pairing came from.
 */
export function describePalette(
  name: string,
  fieldLabel: string,
  uploaded = false,
): GuideEntry {
  const palette = PALETTES[name];
  if (!palette) return GUIDE.palette as GuideEntry;

  if (uploaded) {
    return {
      title: `Colourbar: ${palette.title}`,
      kind: "rendering",
      does:
        `Draws ${fieldLabel.toLowerCase()} using cmocean's ${palette.title} palette, a` +
        ` ${palette.form} scale.`,
      means: [
        "This came from your file, so nobody here chose its colours.",
        "The scale was picked by reading the file's own CF standard_name.",
        "Where the file did not say, a neutral one is used rather than a guess.",
        "So read the colours off the bar, not off what the scale is normally used for.",
      ],
      look: [
        "The ends of the bar are the 0.5 and 99.5 percentiles of your variable.",
        "Only the range below is yours to change.",
      ],
    };
  }

  return {
    title: `Colourbar: ${palette.title}`,
    kind: "rendering",
    does:
      `Draws ${fieldLabel.toLowerCase()} using cmocean's ${palette.title} palette, a` +
      ` ${palette.form} scale designed for ${palette.designedFor.toLowerCase()}.`,
    means: palette.note,
    look: [
      "The palette belongs to the variable, so the colours always mean what the label says.",
      "Only the range below is yours, and the figures at the ends of the bar follow it.",
    ],
  };
}
