/**
 * The browser's drift integrator, measured against the pipeline's.
 *
 * `web/src/drift.ts` is this project's **one** deliberate second implementation of a piece of
 * science. The rule here is one curve in one file, and it exists because a second copy of the
 * Scale silently disagreed with the first and the log scale had to be cut. So this copy is not
 * trusted on the grounds that it looks the same: it is run from the same start points as the
 * baked trajectories `pipeline/samudra/drift.py` produced and the two are compared in
 * kilometres. A second implementation that is measured against the first is a different thing
 * from one that is assumed to match.
 *
 * Four things are asked:
 *
 *   1. The browser's trajectory from each baked start point ends within TOLERANCE_KM of the
 *      baked one after the same number of days.
 *   2. Dropping a pin draws a line: a frame pair differing only by the line's `visible`, with
 *      no store change between the two frames. See CLAUDE.md on frame pairing.
 *   3. The selected float's predicted track is the *baked* polyline, vertex for vertex, and not
 *      something re-integrated in the browser under the numbers the panel quotes.
 *   4. A trajectory started outside the current field returns one point and says why, rather
 *      than a straight line to nowhere.
 *
 *   node probe-drift.mjs        (needs a preview server on 4173)
 */
import { chromium } from "playwright";
import { comparePixels, decodePng } from "./probe-pixels.mjs";

const SERVER = process.env.PREVIEW_URL ?? "http://localhost:4173";

/**
 * How far apart the two integrators may end up, in kilometres, over a whole baked trajectory.
 *
 * Not zero, and the reason is worth writing down: the baked path is written to three decimal
 * places of a degree, which is 111 m a vertex, and the browser reads the current field from the
 * same float32 files through its own bilinear code. A hundred days of six-hourly steps
 * accumulates that. Two kilometres over a trajectory that runs hundreds is a rounding
 * difference; a sign error, a missing cosine or a swapped axis is tens to hundreds, and every
 * one of those fails this.
 */
const TOLERANCE_KM = 2.0;

/** How many baked trajectories to re-run. All 202 would be right and would take minutes. */
const SAMPLE = 40;

const problems = [];
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));

await page.goto(`${SERVER}/app.html`, { waitUntil: "load", timeout: 60000 });
// Wait for the store rather than for a fixed number of seconds. Under software rendering the
// app can take well over six seconds to have its manifest, and a probe that looks too early
// reports "Cannot read properties of null" - which reads as a broken build and is a slow
// machine. `probe-requirements.mjs` has always done it this way; the rest now do too.
await page.waitForFunction(() => !!window.__store?.getState().manifest, null, { timeout: 120000 });
await page.waitForSelector("button.dive", { timeout: 60000 });
await page.click("button.dive");
await page.waitForTimeout(5000);

// Wait for the baked drift file, which is fetched off the critical path.
await page.waitForFunction(() => !!window.__store.getState().bakedDrift, null, { timeout: 60000 });

// ---- 1. the two integrators, against each other -----------------------------------------
//
// The browser module is imported straight out of the built bundle through the app's own scope:
// `window.__drift` is exported by App for exactly this, so the probe measures the code that
// ships rather than a copy of it.
const agreement = await page.evaluate(async (sample) => {
  const store = window.__store.getState();
  const manifest = store.manifest;
  const baked = store.bakedDrift;
  const drift = window.__drift;

  // Every Timestep's vectors, because a trajectory that runs the whole window crosses all of
  // them. This is a probe, so 4.6 MB is a fair price for an exact comparison.
  const spec = manifest.currents;
  const fields = [];
  for (let i = 0; i < spec.files.length; i++) {
    const response = await fetch(new URL(`data/${spec.files[i]}`, location.href));
    const buffer = await response.arrayBuffer();
    fields.push({
      levels: spec.levels,
      width: spec.width,
      height: spec.height,
      values: new Float32Array(buffer),
    });
  }
  const currents = {
    volume: manifest.volume,
    timesMs: manifest.timesteps.map((t) => new Date(t).getTime()),
    fields,
  };

  const ids = Object.keys(baked.floats).slice(0, sample);
  const rows = [];
  for (const id of ids) {
    const entry = baked.floats[id];
    const item = store.floats.find((f) => f.id === id);
    if (!item) continue;
    // Where the *comparison* starts, shipped in drift.json, not the float's first Fix. A Fix
    // outside the analysed period is refused by the pipeline, and a probe that guessed the
    // start point instead would compare two different trajectories and call them a
    // disagreement - measured, up to 860 km of one.
    const start = { lon: entry.observed[0][0], lat: entry.observed[0][1], time: entry.startTime };
    const days = entry.days[entry.days.length - 1];
    const path = drift.integrateDrift(
      currents,
      start.lon,
      start.lat,
      new Date(start.time).getTime(),
      baked.parkingDepthMetres,
      days * 24,
      baked.stepHours,
    );
    const mine = path.steps[path.steps.length - 1];
    const theirs = entry.predicted[entry.predicted.length - 1];
    rows.push({
      id,
      days,
      km: drift.separationKm(mine, { timeMs: 0, lon: theirs[0], lat: theirs[1] }),
      ended: path.ended,
      bakedEnded: entry.ended,
    });
  }
  return rows;
}, SAMPLE);

const gaps = agreement.map((r) => r.km).sort((a, b) => a - b);
const worst = agreement.reduce((a, b) => (b.km > a.km ? b : a), agreement[0]);
console.log(
  `browser against pipeline: ${agreement.length} trajectories, median ` +
    `${(gaps[Math.floor(gaps.length / 2)] ?? 0).toFixed(3)} km, worst ` +
    `${worst.km.toFixed(3)} km on float ${worst.id} after ${worst.days.toFixed(0)} days`,
);
const over = agreement.filter((r) => r.km > TOLERANCE_KM);
if (over.length) {
  problems.push(
    `${over.length} trajectories disagree by more than ${TOLERANCE_KM} km: ` +
      over.slice(0, 3).map((r) => `${r.id} ${r.km.toFixed(1)} km`).join(", "),
  );
}

// ---- 2. a dropped pin actually draws -----------------------------------------------------
await page.evaluate(() => {
  const manifest = window.__store.getState().manifest;
  window.__store.setState({
    // The Somali Current core at the surface in the last analysis - measured at 2.94 m/s at
    // 9.5 N, 51.5 E on 2026-07-30, the fastest water in the block - so the line is long enough
    // to measure rather than a smudge.
    driftPin: { lon: 51.5, lat: 9.5 },
    driftDays: 20,
    depthFrom: 0,
    showDriftCheck: false,
    selectedFloatId: null,
    timestepIndex: 11,
    showTracks: false,
    showFloats: false,
    showAnomalies: false,
    volumeEnabled: false,
  });
  return manifest.timesteps.length;
});
// The trajectory is not drawn until every Timestep it reads has arrived, on purpose - see the
// note in App.tsx - so this waits for the line rather than for a fixed number of seconds.
await page.waitForFunction(
  () => (window.__scene.driftLine?.geometry.getAttribute("lonLat")?.count ?? 0) > 4,
  null,
  { timeout: 60000 },
);
await page.waitForTimeout(1500);

const drawn = await page.evaluate(() => {
  const scene = window.__scene;
  return {
    visible: scene.driftLine?.visible ?? false,
    vertices: scene.driftLine?.geometry.getAttribute("lonLat")?.count ?? 0,
    pin: scene.driftPinPoints?.visible ?? false,
  };
});
const length = await page.evaluate(() => {
  const drift = window.__drift;
  const attribute = window.__scene.driftLine.geometry.getAttribute("lonLat");
  let km = 0;
  for (let i = 0; i < attribute.count - 1; i += 2) {
    km += drift.separationKm(
      { timeMs: 0, lon: attribute.getX(i), lat: attribute.getY(i) },
      { timeMs: 0, lon: attribute.getX(i + 1), lat: attribute.getY(i + 1) },
    );
  }
  return km;
});
console.log(
  `pin trajectory: ${drawn.vertices} line vertices, ${length.toFixed(0)} km long, ` +
    `visible ${drawn.visible}`,
);
if (!drawn.visible || drawn.vertices < 4) problems.push("a dropped pin drew no trajectory");
if (!drawn.pin) problems.push("the pin marker is not drawn");

// The frame pair. Only `visible` moves between the two frames - the render loop is continuous,
// so no store change is needed and a store change would move other things too.
// A generous timeout: the ray march under software rendering can take longer than
// Playwright's 30 s default to settle, and a slow machine is not a failing build.
const withLine = await page.screenshot({ timeout: 180000 });
await page.evaluate(() => {
  window.__scene.driftLine.visible = false;
  window.__scene.driftPinPoints.visible = false;
});
await page.waitForTimeout(500);
const withoutLine = await page.screenshot({ timeout: 180000 });
await page.evaluate(() => {
  window.__scene.driftLine.visible = true;
  window.__scene.driftPinPoints.visible = true;
});
const pair = comparePixels(decodePng(withLine), decodePng(withoutLine));
console.log(
  `trajectory on against off: ${pair.count} px, ${(100 * pair.share).toFixed(3)}% of the frame`,
);
// A one-pixel-wide polyline is a tiny share of a 1400x800 frame however far it runs. Measured
// on this bake, twenty days out of the Somali Current core is a 1,001 km trajectory and 277
// changed pixels, which is simply what a hairline costs. So the threshold asks the question the
// pixels can actually answer - drawn, or not drawn at all - and that is the failure that has
// happened here twice (`flat` in a vertex shader, and a mesh left invisible). The line's real
// length in kilometres, printed above, is the check on whether it is the *right* line.
if (pair.count < 120) problems.push(`the trajectory is drawing almost nothing: ${pair.count} px`);

// ---- 3. the check on a float is the baked polyline ---------------------------------------
const checked = await page.evaluate(() => {
  const store = window.__store.getState();
  const id = Object.keys(store.bakedDrift.floats)[0];
  window.__store.setState({ selectedFloatId: id, showDriftCheck: true, driftPin: null });
  return id;
});
await page.waitForTimeout(2500);
const predicted = await page.evaluate((id) => {
  const store = window.__store.getState();
  const baked = store.bakedDrift.floats[id].path;
  const attribute = window.__scene.predictedLine.geometry.getAttribute("lonLat");
  // The polyline is drawn as segments, so the vertex count is 2 * (points - 1).
  let worst = 0;
  for (let i = 0; i < baked.length - 1; i++) {
    const drawnLon = attribute.getX(i * 2);
    const drawnLat = attribute.getY(i * 2);
    worst = Math.max(worst, Math.abs(drawnLon - baked[i][0]), Math.abs(drawnLat - baked[i][1]));
  }
  return {
    id,
    points: baked.length,
    vertices: attribute.count,
    worstDegrees: worst,
    visible: window.__scene.predictedLine.visible,
  };
}, checked);
console.log(
  `float ${predicted.id}: baked ${predicted.points} points, drawn ${predicted.vertices} ` +
    `vertices, worst vertex error ${predicted.worstDegrees.toExponential(1)} degrees`,
);
if (!predicted.visible) problems.push("the float's predicted track is not drawn");
if (predicted.vertices !== 2 * (predicted.points - 1)) {
  problems.push("the predicted track is not the baked polyline");
}
if (predicted.worstDegrees > 1e-4) {
  problems.push(`the drawn predicted track differs from the baked one by ${predicted.worstDegrees}`);
}

// ---- 4. a pin outside the data refuses rather than guessing ------------------------------
const refused = await page.evaluate(() => {
  const store = window.__store.getState();
  const manifest = store.manifest;
  const drift = window.__drift;
  const index = store.timestepIndex;
  const currents = {
    volume: manifest.volume,
    timesMs: [new Date(manifest.timesteps[index]).getTime()],
    fields: [store.vectors[index]],
  };
  if (!store.vectors[index]) return null;
  const path = drift.integrateDrift(currents, 20.0, 0.0, currents.timesMs[0], 5, 240);
  return { steps: path.steps.length, ended: path.ended };
});
if (refused) {
  console.log(`a pin outside the region: ${refused.steps} step, "${refused.ended}"`);
  if (refused.steps !== 1 || refused.ended === "finished") {
    problems.push("a pin outside the current field produced a trajectory anyway");
  }
} else {
  console.log("a pin outside the region: skipped, no vector field loaded for this step");
}

console.log("PROBLEMS", problems);
await browser.close();
process.exit(problems.length ? 1 : 0);
