/**
 * The browser's vertical section, measured against the pipeline's.
 *
 * `web/src/section.ts` is the second implementation of a piece of science, like `drift.ts`, and
 * gets the same treatment: it is not trusted because it looks the same. The pipeline's
 * `samudra/section.py` is the one under test and is served at `/api/section`, and this runs the
 * shipped browser module along the same line and compares the two value by value.
 *
 * Four questions:
 *
 *   1. Every value the browser cut matches the API's to within a float32 rounding difference.
 *   2. The distance axis agrees, which is what every feature on the plot is positioned against.
 *   3. A line that runs onto land shows a **gap** rather than a smooth wall of plausible water.
 *   4. Drawing one changes the picture: the panel appears, the canvas has ink on it, and the
 *      line is drawn on the water.
 *
 *   node probe-section.mjs        (needs the preview on 4173 and the API on 8000)
 */
import { chromium } from "playwright";
import { comparePixels, decodePng } from "./probe-pixels.mjs";

const SERVER = process.env.PREVIEW_URL ?? "http://localhost:4173";
const API = process.env.API_BASE ?? "http://localhost:8000";

/**
 * How far apart the two cuts may be, in the Field's own units.
 *
 * The browser reads float32 off the wire and the API reads float64 out of a .npz, and the JSON
 * on the way rounds to four decimals. 0.002 degC covers all of that and nothing else: a wrong
 * axis, a transposed array or a level off by one is tenths to whole degrees.
 */
const TOLERANCE = 0.002;

/** A line across the Bay of Bengal, which is the section this figure exists for. */
const LINE = { fromLon: 80.0, fromLat: 5.0, toLon: 90.0, toLat: 20.0 };
/**
 * And one that starts in open water and runs onto the Indian coast, to check the gap.
 *
 * From 68 E off Gujarat east to 76 E, which is inland. The surface row has to be part water and
 * part nothing: all water would mean land was being painted, and all nothing would mean a
 * column with a shallow sea floor was blanking the water above it - which is exactly the bug
 * this probe caught the first time it ran.
 */
const ASHORE = { fromLon: 68.0, fromLat: 21.0, toLon: 76.0, toLat: 21.0 };

const problems = [];
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

async function cutBoth(line, field = "temperature", index = 11, points = 61) {
  const query = new URLSearchParams({
    field,
    index: String(index),
    from_lon: String(line.fromLon),
    from_lat: String(line.fromLat),
    to_lon: String(line.toLon),
    to_lat: String(line.toLat),
    points: String(points),
  });
  const server = await (await fetch(`${API}/api/section?${query}`)).json();

  const mine = await page.evaluate(
    async ({ line, field, index, points }) => {
      const store = window.__store.getState();
      const manifest = store.manifest;
      const path = manifest.gridFiles[field][index];
      const response = await fetch(new URL(`data/${path}`, location.href));
      const buffer = await response.arrayBuffer();
      const grid = {
        levels: manifest.volume.levelMetres.length,
        width: manifest.volume.width,
        height: manifest.volume.height,
        values: new Float32Array(buffer),
      };
      const cut = window.__section.sectionAlong(
        grid,
        manifest.volume,
        { lon: line.fromLon, lat: line.fromLat },
        { lon: line.toLon, lat: line.toLat },
        points,
      );
      return {
        distancesKm: cut.distancesKm,
        levels: cut.levels,
        values: cut.values.map((row) => Array.from(row)),
      };
    },
    { line, field, index, points },
  );
  return { server, mine };
}

// ---- 1 and 2. the two cuts, against each other ------------------------------------------
const { server, mine } = await cutBoth(LINE);

let worstValue = 0;
let compared = 0;
let bothMissing = 0;
let disagreeOnMissing = 0;
for (let level = 0; level < server.values.length; level++) {
  for (let index = 0; index < server.distancesKm.length; index++) {
    const theirs = server.values[level][index];
    const ours = mine.values[level][index];
    const theirsMissing = theirs === null;
    const oursMissing = !Number.isFinite(ours);
    if (theirsMissing !== oursMissing) {
      disagreeOnMissing++;
      continue;
    }
    if (theirsMissing) {
      bothMissing++;
      continue;
    }
    compared++;
    worstValue = Math.max(worstValue, Math.abs(theirs - ours));
  }
}
const worstDistance = Math.max(
  ...server.distancesKm.map((d, i) => Math.abs(d - mine.distancesKm[i])),
);
console.log(
  `browser against pipeline: ${compared} values compared, worst gap ` +
    `${worstValue.toExponential(2)}; ${bothMissing} both missing, ${disagreeOnMissing} disagree` +
    ` about missing; distance axis worst ${worstDistance.toFixed(4)} km`,
);
if (worstValue > TOLERANCE) problems.push(`the two cuts disagree by ${worstValue}`);
if (disagreeOnMissing > 0) {
  problems.push(`${disagreeOnMissing} cells disagree about whether there is ocean there`);
}
if (worstDistance > 0.05) problems.push(`the distance axes disagree by ${worstDistance} km`);
if (compared < 500) problems.push(`only ${compared} values had anything to compare`);

// ---- 3. a line that runs ashore has a gap in it -----------------------------------------
const ashore = await cutBoth(ASHORE);
const surface = ashore.mine.values[0];
const missing = surface.filter((v) => !Number.isFinite(v)).length;
console.log(`a line running onto the Indian coast: ${missing} of ${surface.length} samples blank`);
if (missing === 0) problems.push("a section running onto land drew water all the way");
if (missing === surface.length) problems.push("a section running onto land drew nothing at all");

// ---- 4. drawing one puts a figure and a line on screen ----------------------------------
const before = await page.screenshot({ timeout: 180000 });
await page.evaluate((line) => {
  window.__store.getState().selectField("temperature");
  window.__store.setState({
    sectionFrom: { lon: line.fromLon, lat: line.fromLat },
    sectionTo: { lon: line.toLon, lat: line.toLat },
    placingSection: 0,
  });
}, LINE);
await page.waitForSelector(".section-canvas", { timeout: 30000 });
await page.waitForTimeout(3000);

const drawn = await page.evaluate(() => {
  const canvas = document.querySelector(".section-canvas");
  const context = canvas.getContext("2d");
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let painted = 0;
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 8) painted++;
  return {
    width: canvas.width,
    height: canvas.height,
    painted,
    share: painted / (canvas.width * canvas.height),
    lineVertices: window.__scene.sectionLine?.geometry.getAttribute("lonLat")?.count ?? 0,
    lineVisible: window.__scene.sectionLine?.visible ?? false,
    casts: (document.querySelector(".panel-section .note")?.textContent ?? "").slice(0, 90),
  };
});
console.log(
  `the figure: ${drawn.width} x ${drawn.height}, ${drawn.painted} px painted ` +
    `(${(100 * drawn.share).toFixed(1)}% of the canvas)`,
);
console.log(`the line on the water: ${drawn.lineVertices} vertices, visible ${drawn.lineVisible}`);
console.log(`the caption: ${drawn.casts}`);
if (drawn.share < 0.25) problems.push(`the section canvas is nearly empty: ${drawn.painted} px`);
if (!drawn.lineVisible || drawn.lineVertices < 2) {
  problems.push("the section line is not drawn on the water");
}

const after = await page.screenshot({ timeout: 180000 });
const pair = comparePixels(decodePng(before), decodePng(after));
console.log(
  `the screen before against after: ${pair.count} px, ${(100 * pair.share).toFixed(2)}% of it`,
);
if (pair.share < 0.02) problems.push("drawing a section changed almost nothing on screen");

console.log("PROBLEMS", problems);
await browser.close();
process.exit(problems.length ? 1 : 0);
