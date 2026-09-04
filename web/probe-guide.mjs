/**
 * Every control has an explanation, and every figure in one came from the bake.
 *
 * `CLAUDE.md` says it: **if you add a control, add its guide entry.** `GUIDE` is a plain record,
 * so a `Group` or a `Slider` whose key has no entry shows nothing at all and says nothing about
 * it - there is no error, no warning and no gap on screen. Twenty-odd control ids and nothing
 * asserting the two sets match.
 *
 * The second half is the one that had already gone wrong. Four measured figures used to be typed
 * into the entries by hand and every one of them moves on a re-bake; the anomaly-feature counts
 * had been stale since August with nothing able to notice, because a wrong number and a right
 * number are the same shape. The entries now write `{token}` and `guideFigures` fills them from
 * the manifest, so what is checkable is that no token reaches the screen unfilled.
 *
 *   node probe-guide.mjs        (needs a preview server on 4173)
 */
import { chromium } from "playwright";

const SERVER = process.env.PREVIEW_URL ?? "http://localhost:4173";
const problems = [];

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));

await page.goto(`${SERVER}/app.html`, { waitUntil: "load", timeout: 60000 });
// Wait for the store rather than for a fixed number of seconds. Under software rendering the
// app can take well over six seconds to have its manifest.
await page.waitForFunction(() => !!window.__store?.getState().manifest, null, { timeout: 120000 });
await page.waitForSelector("button.dive", { timeout: 60000 });
await page.click("button.dive");
await page.waitForFunction(() => window.__store.getState().morph > 0.9, null, { timeout: 60000 });
await page.waitForFunction(() => !!window.__store.getState().residuals, null, { timeout: 60000 });

// ---- 1. every control on screen has an entry ------------------------------------------------
//
// Read from the page, not from a list written here: a list would need updating for every new
// control, which is the same failure one level along. Every group is opened on every Field,
// because several groups only appear on some Fields.
const missing = await page.evaluate(async () => {
  const store = window.__store.getState();
  const ids = new Set();
  for (const field of store.manifest.fields) {
    store.selectField(field.key);
    await new Promise((r) => setTimeout(r, 30));
    for (const head of document.querySelectorAll(".control-group .control-head")) {
      head.click();
    }
    await new Promise((r) => setTimeout(r, 30));
    for (const key of Object.keys(window.__store.getState().openGroups)) ids.add(key);
    for (const node of document.querySelectorAll(".panel-left .slider input[aria-label]")) {
      void node;
    }
  }
  store.selectField("temperature");
  // Every group id the panel has ever opened, plus every Field key, which is what the Variable
  // buttons set `touched` to.
  const keys = [...ids, ...store.manifest.fields.map((f) => f.key)];
  return keys.filter((key) => !window.__guide.GUIDE[key] && key !== "yours");
});
if (missing.length) {
  problems.push(`no guide entry for: ${missing.join(", ")}`);
}
console.log(`control ids with no entry: ${missing.length}`);

// ---- 2. no entry reaches the screen with an unfilled token ---------------------------------
const rendered = [];
const touchable = [
  "field",
  "hazardPreset",
  "scale",
  "temperature",
  "salinity",
  "density",
  "temperature_anomaly",
  "temperature_normal_anomaly",
  "coverage",
  "heat_potential",
  "d26",
  "mixed_layer_depth",
  "isothermal_layer_depth",
  "barrier_layer",
  "current_speed",
  "incois_casts",
  "incois_rmse",
  "analysis_spread",
  "anomalyFeatures",
  "isolateAnomaly",
  "palette",
  "rendering",
  "currents",
  "currentStyle",
  "instruments",
  "window",
  "depthSlice",
  "opacity",
  "emphasis",
  "exaggeration",
  "quality",
  "volumeEnabled",
  "isosurface",
  "surfaceLevel",
  "timestep",
  "bias",
  "drift",
  "upload",
  "section",
  "floats",
  "moorings",
  "chlorophyll",
  "tracks",
];
for (const key of touchable) {
  const text = await page.evaluate(async (k) => {
    window.__store.setState({ touched: k, selectedFloatId: null, selectedAnomaly: null });
    await new Promise((r) => setTimeout(r, 40));
    const panel = document.querySelector(".panel-right.guide");
    return panel ? panel.innerText : null;
  }, key);
  if (text === null) {
    problems.push(`no guide panel for "${key}"`);
    continue;
  }
  const unfilled = text.match(/\{[a-zA-Z]\w*\}/g);
  if (unfilled) problems.push(`"${key}" printed unfilled tokens: ${unfilled.join(", ")}`);
  rendered.push({ key, words: text.split(/\s+/).filter(Boolean).length });
}

// ---- 3. the entries are as short as the rule says -------------------------------------------
//
// One sentence plus `means` and `look` as bullets, max 4 each and max 2 lines each. The panel's
// own text is what is measured, so a rule kept in the source and broken on screen would fail.
const shape = await page.evaluate(async (list) => {
  const out = [];
  for (const key of list) {
    window.__store.setState({ touched: key, selectedFloatId: null, selectedAnomaly: null });
    await new Promise((r) => setTimeout(r, 30));
    const lists = document.querySelectorAll(".panel-right.guide .guide-points");
    const counts = [...lists].map((l) => l.querySelectorAll("li").length);
    const longest = Math.max(
      0,
      ...[...lists].flatMap((l) =>
        [...l.querySelectorAll("li")].map((li) => li.innerText.split(/\s+/).length),
      ),
    );
    out.push({ key, bullets: counts, longestBullet: longest });
  }
  return out;
}, touchable);

for (const entry of shape) {
  for (const count of entry.bullets) {
    if (count > 4) problems.push(`"${entry.key}" has a list of ${count} bullets; the rule is 4`);
  }
  if (entry.longestBullet > 24) {
    problems.push(`"${entry.key}" has a ${entry.longestBullet}-word bullet; two lines is about 18`);
  }
}

const words = rendered.map((r) => r.words);
console.log(
  `entries checked: ${rendered.length}, panel words: median ` +
    `${words.sort((a, b) => a - b)[Math.floor(words.length / 2)]}, longest ` +
    `${Math.max(...words)}`,
);
console.log(
  "widest lists:",
  shape
    .map((e) => ({ key: e.key, max: Math.max(0, ...e.bullets), longest: e.longestBullet }))
    .sort((a, b) => b.longest - a.longest)
    .slice(0, 6)
    .map((e) => `${e.key} ${e.max}x${e.longest}w`)
    .join(", "),
);

console.log("PROBLEMS", JSON.stringify(problems, null, 1));
await browser.close();
process.exit(problems.length ? 1 : 0);
