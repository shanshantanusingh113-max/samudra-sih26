/**
 * The moving current flow, measured rather than looked at.
 *
 * The dots are the prettiest thing in this build, which is exactly why they need a probe. Four
 * questions, and each one is a way the feature could be wrong while looking perfect:
 *
 *   1. **They are the drift model.** A particle stepped N times through one frozen analysis has
 *      to land where `integrateDrift` puts a pin over the same elapsed ocean time. Both go
 *      through `midpointStep` and `sample` in `drift.ts`; if somebody ever gives the animation
 *      its own cheaper step rule, this fails. That equivalence is the whole claim - an animation
 *      whose integrator has a published error - and an unchecked claim is decoration.
 *
 *   2. **They draw.** A frame pair differing only by the layer's `visible`, with no store change
 *      between the two frames. The project's own history says this is the only method that
 *      works: two shaders were silently failing to compile and the geometry was perfect.
 *
 *   3. **They are not on land.** Every live dot is sampled against the same masked field the
 *      renderer uses. One walking across Gujarat is the classic failure of a naive advection.
 *
 *   4. **Arrows and dots are exclusive.** Two styles of one layer, so exactly one of them is on
 *      screen at a time. Both at once would put two encodings of the same vector on the water.
 *
 *   node probe-particles.mjs        (needs a preview server on 4173)
 */
import { chromium } from "playwright";
import { comparePixels, decodePng } from "./probe-pixels.mjs";

const SERVER = process.env.PREVIEW_URL ?? "http://localhost:4173";

/**
 * How far apart a particle and a drift pin may end up, in kilometres, over the same ocean time.
 *
 * They run the same step rule on the same field, so this should be floating-point noise. It is
 * not zero because the particle takes many small steps where the pin takes a few large ones -
 * the animation integrates per frame - and a midpoint rule's truncation error differs with step
 * size. A kilometre over a path hundreds of kilometres long is that; a missing cosine, a swapped
 * axis or a second integrator is tens to hundreds.
 */
const TOLERANCE_KM = 1.0;

/**
 * How much of the frame the flow must cover before it counts as drawing at all, as a percentage.
 *
 * The arrows measure 0.54% with the water on. Trails are thinner than an arrow's shaft and there
 * are more of them, so this sits well below that and is a test for "nothing rendered", not for
 * "rendered exactly this much".
 */
const MIN_COVERAGE_PERCENT = 0.12;

const problems = [];
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));

await page.goto(`${SERVER}/app.html`, { waitUntil: "load", timeout: 60000 });
await page.waitForFunction(() => !!window.__store?.getState().manifest, null, { timeout: 120000 });
await page.waitForSelector("button.dive", { timeout: 60000 });
await page.click("button.dive");
await page.waitForTimeout(5000);

await page.evaluate(() => window.__store.getState().selectField("current_speed"));
await page.waitForFunction(
  () => !!window.__store.getState().vectors[window.__store.getState().timestepIndex],
  null,
  { timeout: 60000 },
);
await page.waitForTimeout(2500);

// ---- 1. a particle is the drift model ----------------------------------------------------
//
// Run the shipped `ParticleFlow` against the shipped `integrateDrift` over one frozen analysis.
// The flow's clock is a constant inside `particles.ts`, so the elapsed ocean time is read from
// the module rather than typed here - a number typed into a probe is a number that goes stale.
const agreement = await page.evaluate(async (tolerance) => {
  const store = window.__store.getState();
  const manifest = store.manifest;
  const drift = window.__drift;
  const particles = window.__particles;

  const index = store.timestepIndex;
  const field = store.vectors[index];
  if (!field) return { error: "no vectors loaded" };

  const volume = manifest.volume;
  const level = drift.levelIndexFor(volume, volume.levelMetres[0]);
  const timeMs = new Date(manifest.timesteps[index]).getTime();

  // One frozen analysis for the pin, so the two are integrating the same thing. The animation
  // never interpolates in time by design: it is the flow at one instant.
  const currents = { volume, timesMs: [timeMs], fields: [field] };

  const flow = new particles.ParticleFlow(1);
  flow.setField(field, volume, level);

  // A start point with real water under it: the Somali Current core, where the analysis is
  // fastest and a disagreement would show.
  const start = { lon: 51.5, lat: 9.5 };
  const frames = 60;
  const secondsPerFrame = 1 / 60;
  const oceanSeconds = particles.oceanSecondsPerSecond() * frames * secondsPerFrame;

  // Drive the population's single particle from the same place.
  flow.placeForTest(0, start.lon, start.lat);
  const placed = flow.positionOf(0);
  for (let i = 0; i < frames; i++) flow.advance(secondsPerFrame);
  const ended = flow.positionOf(0);

  const path = drift.integrateDrift(
    currents,
    placed.lon,
    placed.lat,
    timeMs,
    volume.levelMetres[level],
    oceanSeconds / 3600,
    oceanSeconds / 3600 / frames,
  );
  const pin = path.steps[path.steps.length - 1];

  return {
    km: drift.separationKm(
      { timeMs: 0, lon: ended.lon, lat: ended.lat },
      { timeMs: 0, lon: pin.lon, lat: pin.lat },
    ),
    travelledKm: drift.separationKm(
      { timeMs: 0, lon: placed.lon, lat: placed.lat },
      { timeMs: 0, lon: ended.lon, lat: ended.lat },
    ),
    tolerance,
    ended: path.ended,
  };
}, TOLERANCE_KM);

if (agreement.error) {
  problems.push(`could not compare the integrators: ${agreement.error}`);
} else {
  console.log(
    `particle against drift pin: ${agreement.km.toFixed(3)} km apart after ` +
      `${agreement.travelledKm.toFixed(0)} km of travel (${agreement.ended})`,
  );
  if (agreement.km > TOLERANCE_KM) {
    problems.push(
      `a particle and a drift pin disagree by ${agreement.km.toFixed(2)} km over the same ` +
        `ocean time, which is more than ${TOLERANCE_KM} km - they no longer share a step rule`,
    );
  }
}

// ---- 2. the flow actually draws ----------------------------------------------------------
//
// A frame pair, and nothing changes between the two but the layer's own visibility. Changing the
// store between frames would rebuild the geometry and set `visible` back to true, which is how
// this project once measured a visible layer as invisible.
//
// This layer animates, so a pair taken at two instants differs a little even with the flow
// hidden: the marker pulse is a sine of elapsed time and the ray marcher takes a `uTime`. The
// markers are turned off first - before the pair, never between its two frames - and what is
// left is measured as a **baseline** and required to be much smaller than the layer itself.
// Without that, "it moved" and "it drew" are the same measurement.
await page.evaluate(() =>
  window.__store.setState({ currentStyle: "particles", showFloats: false, showAnomalies: false }),
);
await page.waitForTimeout(1200);

await page.evaluate(() => window.__scene.setLayerVisibleForTest("particles", false));
await page.waitForTimeout(500);
const withoutFlow = decodePng(await page.screenshot({ timeout: 180000 }));
await page.waitForTimeout(500);
const withoutFlowAgain = decodePng(await page.screenshot({ timeout: 180000 }));

await page.evaluate(() => window.__scene.setLayerVisibleForTest("particles", true));
await page.waitForTimeout(500);
const withFlow = decodePng(await page.screenshot({ timeout: 180000 }));

const baseline = comparePixels(withoutFlow, withoutFlowAgain).share * 100;
const moved = comparePixels(withFlow, withoutFlowAgain).share * 100;
console.log(
  `flow layer covers ${moved.toFixed(2)}% of the frame, against ${baseline.toFixed(3)}% of ` +
    `background motion with it hidden`,
);
if (!Number.isFinite(moved) || moved < MIN_COVERAGE_PERCENT || moved < baseline * 3) {
  problems.push(
    `the flow layer changes ${moved.toFixed(3)}% of the frame against a ${baseline.toFixed(3)}% ` +
      `baseline, which is not drawing - shaders can fail to compile silently, see the flat/GLSL ` +
      `note in CLAUDE.md`,
  );
}
await page.evaluate(() => window.__store.setState({ showFloats: true, showAnomalies: true }));

// ---- 3. no dot is on land ----------------------------------------------------------------
const ashore = await page.evaluate(() => {
  const store = window.__store.getState();
  const drift = window.__drift;
  const manifest = store.manifest;
  const field = store.vectors[store.timestepIndex];
  const flow = window.__scene.particleFlowForTest?.();
  if (!flow || !field) return { checked: 0, ashore: 0 };

  const level = window.__scene.particleLevelForTest?.() ?? 0;
  let checked = 0;
  let ashore = 0;
  for (let i = 0; i < flow.size; i++) {
    const at = flow.positionOf(i);
    checked++;
    if (!drift.sample(field, manifest.volume, level, at.lon, at.lat)) ashore++;
  }
  return { checked, ashore };
});
console.log(`${ashore.checked} dots checked against the mask, ${ashore.ashore} on land`);
if (ashore.checked > 0 && ashore.ashore > 0) {
  problems.push(
    `${ashore.ashore} of ${ashore.checked} dots are sitting where the field has no current - ` +
      `they should have been re-seeded the frame they arrived`,
  );
}

// ---- 4. the two styles are exclusive -----------------------------------------------------
const exclusive = await page.evaluate(async () => {
  const seen = [];
  for (const style of ["particles", "arrows"]) {
    window.__store.setState({ currentStyle: style });
    await new Promise((resolve) => setTimeout(resolve, 500));
    seen.push({ style, ...window.__scene.currentLayersForTest?.() });
  }
  return seen;
});
for (const row of exclusive) {
  console.log(`${row.style}: arrows ${row.arrows ? "on" : "off"}, dots ${row.dots ? "on" : "off"}`);
  const wanted = row.style === "particles";
  if (row.dots !== wanted || row.arrows === wanted) {
    problems.push(
      `with style "${row.style}" the scene has arrows ${row.arrows} and dots ${row.dots}; ` +
        `exactly one of the two must be drawn`,
    );
  }
}

console.log(problems.length ? `PROBLEMS: ${problems.join(" | ")}` : "clean");
await browser.close();
process.exit(problems.length ? 1 : 0);
