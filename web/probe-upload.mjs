/**
 * Drop a NetCDF file on the running app, and check what actually happens.
 *
 * This is the claim PS 26067 makes hardest to prove - "new variables or data sources with
 * minimal code change" - so the thing worth measuring is not that an endpoint returned 200. It
 * is that a file a stranger supplied ends up as a **real Field**, going through the same
 * selector, the same colourbar and the same ray marcher as a baked one, and changing the
 * picture on screen.
 *
 * Four questions:
 *
 *   1. A good file is read, its axes are named correctly, and its variable appears in the
 *      Variable selector under a tab of its own.
 *   2. Selecting it changes the rendered frame. A field that loads and draws nothing is the
 *      failure this project keeps hitting, so it is measured rather than assumed.
 *   3. A file this platform cannot read is refused **by name**, on screen, with no picture.
 *   4. Clearing it removes the Field rather than leaving the shader on the last texture.
 *
 *   node probe-upload.mjs
 *
 * Needs the preview server on 4173 **and the API on 8000** - it is the one probe that does,
 * because it is the one feature that does.
 *
 * The two fixtures are committed in `ncfixtures/`: a good CF file and a sigma-coordinate one
 * that must be refused. They used to be defaulted to a scratchpad path belonging to a session
 * that no longer existed, so this probe exited 2 with "no fixtures" for anyone who cloned the
 * repository - a committed probe that could not run. Point `NC_DIR` at your own pair if you
 * want different ones.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { comparePixels, decodePng } from "./probe-pixels.mjs";

const SERVER = process.env.PREVIEW_URL ?? "http://localhost:4173";
const API = process.env.API_BASE ?? "http://localhost:8000";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const NC_DIR = process.env.NC_DIR ?? path.join(HERE, "..", "ncfixtures");

const GOOD = path.join(NC_DIR, "probe-good.nc");
const SIGMA = path.join(NC_DIR, "probe-sigma.nc");
const problems = [];

if (!existsSync(GOOD) || !existsSync(SIGMA)) {
  console.log(`No fixtures at ${NC_DIR}. They are committed in ncfixtures/; set NC_DIR to move them.`);
  process.exit(2);
}

const health = await fetch(`${API}/api/health`).catch(() => null);
if (!health?.ok) {
  console.log(`The API is not answering at ${API}. Start uvicorn and try again.`);
  process.exit(2);
}

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

// Open the group and hand it the file through the panel's own input, so what is exercised is
// the control a user touches rather than a function called behind it.
await page.evaluate(() =>
  window.__store.setState((s) => ({ openGroups: { ...s.openGroups, upload: true } })),
);
await page.waitForTimeout(400);

const before = await page.screenshot({ timeout: 180000 });

await page.setInputFiles('input[type="file"]', GOOD);
await page.waitForFunction(() => !!window.__store.getState().upload, null, { timeout: 60000 });
await page.waitForTimeout(4000);

const read = await page.evaluate(() => {
  const store = window.__store.getState();
  return {
    filename: store.upload.filename,
    axes: store.upload.axes,
    steps: store.upload.timesteps.length,
    fields: store.upload.fields.map((f) => f.key),
    inManifest: store.manifest.fields.filter((f) => f.group === "yours").map((f) => f.key),
    groups: (store.manifest.fieldGroups ?? []).map((g) => g.key),
    selected: store.fieldKey,
    volumeUrl: store.manifest.volumeFiles[store.upload.fields[0].key]?.[store.timestepIndex],
    // The mapping from this platform's twelve Timesteps onto the file's own instants.
    mapping: store.uploadSteps,
  };
});
console.log(
  `read ${read.filename}: axes ${JSON.stringify(read.axes)}, ${read.steps} steps, ` +
    `variables ${read.fields.join(", ")}`,
);
console.log(
  `in the selector: group tabs ${read.groups.join(", ")} - "yours" holds ` +
    `${read.inManifest.join(", ")}, selected ${read.selected}`,
);
console.log(`timestep mapping onto the file: [${read.mapping.join(", ")}]`);

if (read.axes.longitude !== "lon" || read.axes.latitude !== "lat" || read.axes.depth !== "depth") {
  problems.push(`the axes were read wrong: ${JSON.stringify(read.axes)}`);
}
if (!read.groups.includes("yours")) problems.push("no `yours` tab in the Variable selector");
if (!read.inManifest.includes("sea_temp")) problems.push("the uploaded variable is not a Field");
if (read.selected !== "sea_temp") problems.push("the uploaded variable was not selected");
if (!read.volumeUrl?.startsWith(API)) problems.push(`the volume URL is wrong: ${read.volumeUrl}`);

// ---- 2. it actually changed the picture -------------------------------------------------
const after = await page.screenshot({ timeout: 180000 });
const pair = comparePixels(decodePng(before), decodePng(after));
console.log(
  `the water before against after: ${pair.count} px, ${(100 * pair.share).toFixed(2)}% of the` +
    ` frame, mean channel gap ${pair.meanDifference.toFixed(1)}`,
);
if (pair.share < 0.02) {
  problems.push(`the uploaded field barely changed the picture: ${(100 * pair.share).toFixed(2)}%`);
}

// The texture on the GPU is the uploaded one, not the last baked one left behind.
const texture = await page.evaluate(() => {
  const uniforms = window.__scene.volume.material.uniforms;
  const image = uniforms.uVolume.value?.image;
  return { width: image?.width ?? 0, height: image?.height ?? 0, depth: image?.depth ?? 0 };
});
console.log(`volume texture on the GPU: ${texture.width} x ${texture.height} x ${texture.depth}`);
if (texture.width !== 56 || texture.height !== 36 || texture.depth !== 48) {
  problems.push("the uploaded volume is not the size the shader expects");
}

// ---- 3. a file it cannot read is refused by name -----------------------------------------
await page.evaluate(() => window.__store.getState().clearUpload());
await page.waitForTimeout(1500);
await page.setInputFiles('input[type="file"]', SIGMA);
await page.waitForFunction(() => !!window.__store.getState().uploadProblem, null, {
  timeout: 60000,
});
await page.waitForTimeout(800);

const refused = await page.evaluate(() => {
  const store = window.__store.getState();
  const note = [...document.querySelectorAll(".note.caution")]
    .map((n) => n.textContent)
    .find((t) => t.includes("dimension") || t.includes("could not"));
  return {
    axis: store.uploadProblem.axis,
    detail: store.uploadProblem.detail,
    onScreen: note ?? null,
    fieldsFromUpload: store.manifest.fields.filter((f) => f.group === "yours").length,
    fieldKey: store.fieldKey,
  };
});
console.log(`refused: axis "${refused.axis}"`);
console.log(`  ${refused.detail.slice(0, 120)}...`);
console.log(`  on screen: ${refused.onScreen ? "yes" : "NO"}`);
if (refused.axis !== "dimension") problems.push(`wrong refusal axis: ${refused.axis}`);
if (!refused.onScreen) problems.push("the refusal is not on screen");
if (refused.fieldsFromUpload !== 0) problems.push("a refused file still added Fields");
if (refused.fieldKey === "sea_temp") problems.push("the cleared Field is still selected");

console.log("PROBLEMS", problems);
await browser.close();
process.exit(problems.length ? 1 : 0);
