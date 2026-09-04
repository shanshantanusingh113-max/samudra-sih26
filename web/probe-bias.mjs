/**
 * The bias map, measured rather than looked at.
 *
 * The marker tint is a per-vertex attribute the CPU writes, so "it drew" and "it drew the right
 * colour" are two different questions and only the second one matters. This asks four things:
 *
 *   1. Turning the mode on actually changes the picture, in a frame pair that differs by
 *      exactly one thing - the uniform, written directly, with no store change between the two
 *      frames. See CLAUDE.md on frame pairing; a store change is never the one thing.
 *   2. The colour written for each instrument is the colour `palette.ts` computes for its own
 *      bias, checked against the shipped `residuals.json` rather than against itself.
 *   3. An instrument with no comparison for the Field on screen is marked unknown, not given
 *      the palette's midpoint - which would say the model agreed with something nothing
 *      compared.
 *   4. Switching to a Field with no comparison leaves no coloured markers behind.
 *
 *   node probe-bias.mjs        (needs a preview server on 4173)
 */
import { chromium } from "playwright";
import { comparePixels, decodePng } from "./probe-pixels.mjs";

const SERVER = process.env.PREVIEW_URL ?? "http://localhost:4173";
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

// ---- 1. the frame pair -----------------------------------------------------------------
//
// The store is set once, then the pair differs only by the uniform the mode drives. Diffing a
// "mode on" frame against a "mode off" frame taken across a store change would also move the
// markers, the tracks and anything else a re-render touches.
await page.evaluate(() => {
  const store = window.__store.getState();
  store.selectField("temperature");
  window.__store.setState({ biasMode: true, showFloats: true, showTracks: false, morph: 1 });
});
await page.waitForTimeout(1500);

// A generous timeout: the ray march under software rendering can take longer than
// Playwright's 30 s default to settle, and a slow machine is not a failing build.
const withTint = await page.screenshot({ timeout: 180000 });
await page.evaluate(() => {
  const scene = window.__scene;
  scene.floatPoints.material.uniforms.uBiasMode.value = 0;
});
await page.waitForTimeout(600);
const withoutTint = await page.screenshot({ timeout: 180000 });
await page.evaluate(() => {
  window.__scene.floatPoints.material.uniforms.uBiasMode.value = 1;
});

const pair = comparePixels(decodePng(withTint), decodePng(withoutTint));
console.log(
  `tinted vs untinted markers: ${pair.count} px, ${(100 * pair.share).toFixed(3)}% of the frame,` +
    ` mean channel gap ${pair.meanDifference.toFixed(1)}`,
);
if (pair.count < 200) problems.push(`bias tint changed almost nothing: ${pair.count} px`);

// ---- 2 and 3. the colours, against the shipped numbers ---------------------------------
const check = await page.evaluate(() => {
  const scene = window.__scene;
  const store = window.__store.getState();
  const geometry = scene.floatPoints.geometry;
  const tint = geometry.getAttribute("biasTint");
  const known = geometry.getAttribute("biasKnown");
  const floats = store.floats;

  const residuals = store.residuals.fields[store.fieldKey];
  const byId = new Map(residuals.instruments.map((r) => [r.id, r.scaledBias]));

  const out = { rows: [], knownCount: 0, unknownCount: 0, mismatched: [], missing: [] };
  floats.forEach((item, index) => {
    const expected = byId.get(item.id);
    const isKnown = known.getX(index) === 1;
    if (expected === undefined || expected === null) {
      if (isKnown) out.missing.push(item.id);
      out.unknownCount++;
      return;
    }
    out.knownCount++;
    if (!isKnown) {
      out.missing.push(item.id);
      return;
    }
    out.rows.push({
      id: item.id,
      expected,
      rgb: [
        Math.round(tint.getX(index) * 255),
        Math.round(tint.getY(index) * 255),
        Math.round(tint.getZ(index) * 255),
      ],
    });
  });
  return out;
});

console.log(
  `instruments with a comparison: ${check.knownCount}, without: ${check.unknownCount}`,
);
if (check.missing.length) {
  problems.push(`bias flag disagrees with residuals.json for ${check.missing.length} instruments`);
}

// Recompute the expected colour here, from the shipped palette, rather than trusting the page.
const expectedColours = await page.evaluate((rows) => {
  const store = window.__store.getState();
  const colours = store.manifest.palettes.balance;
  // Where the palette runs out: the Field's own ninetieth percentile, measured by the bake.
  // It used to be the verdict threshold, 1.5 degC of a 27.4 degC range, and at that scale the
  // median instrument sat at 2% of the way along the palette - so 90% of the markers came out
  // the same pale midpoint and the map read as white. Measured after the change: 78 distinct
  // colours across 233 markers, red channel 0.23 to 0.96.
  const LARGE = store.residuals.fields[store.fieldKey].summary.p90ScaledAbs;
  // The display lift, per theme, exactly as palette.ts applies it.
  const gamma = store.theme === "light" ? 1.0 : 0.62;
  const lift = (c) => Math.round(255 * Math.pow(c / 255, gamma));
  return rows.map((row) => {
    const clamped = Math.min(Math.max(row.expected / LARGE, -1), 1);
    const position = 0.5 + 0.5 * clamped;
    const index = Math.min(Math.max(Math.round(position * (colours.length - 1)), 0), colours.length - 1);
    const [r, g, b] = colours[index];
    return { id: row.id, rgb: [lift(r), lift(g), lift(b)] };
  });
}, check.rows);

let wrong = 0;
for (let i = 0; i < check.rows.length; i++) {
  const got = check.rows[i].rgb;
  const want = expectedColours[i].rgb;
  if (Math.abs(got[0] - want[0]) > 1 || Math.abs(got[1] - want[1]) > 1 || Math.abs(got[2] - want[2]) > 1) {
    wrong++;
    if (wrong <= 3) {
      console.log(`  ${check.rows[i].id}: drew ${got.join(",")}, expected ${want.join(",")}`);
    }
  }
}
const distinct = new Set(check.rows.map((r) => r.rgb.join(","))).size;
console.log(
  `marker colours checked: ${check.rows.length}, wrong: ${wrong}, distinct: ${distinct}`,
);
if (distinct < 40) {
  problems.push(`only ${distinct} distinct marker colours - the scale is too wide to read`);
}
// The spread, not only the count. Promoted from `probe-fixups.mjs`, which was gitignored and
// would have rotted: "the map reads as white" is a real failure that has happened once, and
// forty distinct colours clustered around the pale midpoint would pass the check above.
const reds = check.rows.map((r) => r.rgb[0]);
const redSpan = (Math.max(...reds) - Math.min(...reds)) / 255;
console.log(`red channel spans ${redSpan.toFixed(2)} of its range across the markers`);
if (redSpan < 0.35) {
  problems.push(`the markers barely differ: the red channel spans ${redSpan.toFixed(2)}`);
}
if (wrong > 0) problems.push(`${wrong} marker colours do not match palette.ts`);

// ---- 4. the markers are where the comparisons were, at every Timestep -------------------
//
// Two failures at once, and both were invisible.
//
// The scene carried a comment saying the bias map drew every instrument where its *compared
// cast* was, and the line under it called `positionAt(item, timeMs)` - so it drew a residual
// wherever the float had drifted to by the Timestep on screen. Small today only by luck: 94% of
// the comparisons sit on the last two steps.
//
// And a marker gated on `freshness` disappears at a Timestep no cast of its own is near, so at
// the step the app opens on 196 of 233 were drawn under a headline counting 233, and a row in
// the ranked list could point at a marker that was not there.
for (const step of [0, 5, 11]) {
  await page.evaluate((index) => {
    window.__store.getState().selectField("temperature");
    window.__store.setState({ biasMode: true, timestepIndex: index });
  }, step);
  await page.waitForTimeout(900);
  const placed = await page.evaluate(() => {
    const geometry = window.__scene.floatPoints.geometry;
    const lonLat = geometry.getAttribute("lonLat");
    const known = geometry.getAttribute("biasKnown");
    const fresh = geometry.getAttribute("fresh");
    const store = window.__store.getState();
    const byId = new Map(
      store.residuals.fields[store.fieldKey].instruments.map((r) => [r.id, r]),
    );
    let drawn = 0;
    let worstKm = 0;
    let expected = 0;
    store.floats.forEach((item, index) => {
      const row = byId.get(item.id);
      if (!row) return;
      expected++;
      if (known.getX(index) !== 1 || fresh.getX(index) <= 0) return;
      drawn++;
      const dx = (lonLat.getX(index) - row.lon) * 111.32 * Math.cos((row.lat * Math.PI) / 180);
      const dy = (lonLat.getY(index) - row.lat) * 111.32;
      worstKm = Math.max(worstKm, Math.hypot(dx, dy));
    });
    return { drawn, expected, worstKm };
  });
  console.log(
    `step ${step}: ${placed.drawn} of ${placed.expected} comparisons drawn, worst marker ` +
      `${placed.worstKm.toFixed(2)} km from its own cast`,
  );
  if (placed.drawn !== placed.expected) {
    problems.push(
      `step ${step}: the panel counts ${placed.expected} comparisons and ${placed.drawn} are drawn`,
    );
  }
  if (placed.worstKm > 1) {
    problems.push(
      `step ${step}: a marker sits ${placed.worstKm.toFixed(0)} km from the cast it reports`,
    );
  }
}
await page.evaluate(() => window.__store.setState({ timestepIndex: 11 }));
await page.waitForTimeout(600);

// ---- 5. a Field with no comparison keeps no colours ------------------------------------
await page.evaluate(() => window.__store.getState().selectField("heat_potential"));
await page.waitForTimeout(1200);
const none = await page.evaluate(() => {
  const known = window.__scene.floatPoints.geometry.getAttribute("biasKnown");
  let count = 0;
  for (let i = 0; i < known.count; i++) if (known.getX(i) === 1) count++;
  return { count, residuals: !!window.__store.getState().fieldResiduals() };
});
console.log(
  `on Cyclone Heat Potential: ${none.count} instruments still tinted, panel block ${none.residuals}`,
);
if (none.count !== 0 || none.residuals) {
  problems.push("a Field with no comparison still carries bias colours");
}

console.log("PROBLEMS", problems);
await browser.close();
process.exit(problems.length ? 1 : 0);
