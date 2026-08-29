/** Captures every state of the demo so each can be inspected. */
import { chromium } from "playwright";

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const problems = [];
page.on("console", (m) => m.type() === "error" && problems.push(m.text()));
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));

const shot = (n) => page.screenshot({ path: `shots/${n}.png`, timeout: 180000 });

await page.goto(process.env.SHOT_URL, { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(6000);
await shot("01-globe");

await page.click("button.dive");
await page.waitForTimeout(4500);
await shot("02-volume");

// Pick the *drifting* float with the largest disagreement that is compared over most of the
// column. Two filters, both of which cost a shot before they were here. It has to be an Argo
// float, because a moored buoy is a different instrument with a different caveat and this shot
// is captioned as a float. And it has to have a real profile behind it: the largest RMS in the
// bake belongs to a float the model only reaches 45 m down, which draws as a smudge in the
// corner of a 2000 m axis and illustrates nothing.
const MIN_MATCHED = 200;
const chosen = await page.evaluate((minMatched) => {
  const { collocations, floats } = window.__store.getState();
  const drifting = new Set(floats.filter((f) => f.kind !== "mooring").map((f) => f.id));
  let best = null, bestRms = -1, bestMatched = 0;
  for (const [id, c] of Object.entries(collocations)) {
    if (!drifting.has(id)) continue;
    const t = c.fields?.temperature;
    if (!t || (t.matched ?? 0) < minMatched) continue;
    if (t.rmsResidual != null && t.rmsResidual > bestRms) {
      bestRms = t.rmsResidual; best = id; bestMatched = t.matched;
    }
  }
  window.__store.setState({ selectedFloatId: best });
  return { best, bestRms, bestMatched };
}, MIN_MATCHED);
console.log("SELECTED", JSON.stringify(chosen));
// The Profile panel mounts a chart per Field and the software renderer is slow: at 2500 ms
// this shot came back with no panel at all, and the README carried it for four days.
await page.waitForTimeout(5000);
await shot("03-collocation");

await page.evaluate(() => window.__store.setState({ isoEnabled: true, isoValue: 0.62, volumeEnabled: false }));
await page.waitForTimeout(2500);
await shot("04-isosurface");

// Every Variable in turn, switched through the store's own action so each Field's render hints
// are applied exactly as the panel would apply them.
await page.evaluate(() => window.__store.setState({ isoEnabled: false, volumeEnabled: true }));
for (const [name, key] of [
  ["05-salinity", "salinity"],
  ["06-density", "density"],
  ["07-anomaly", "temperature_anomaly"],
  ["08-coverage", "coverage"],
]) {
  await page.evaluate((k) => window.__store.getState().selectField(k), key);
  await page.waitForTimeout(3000);
  await shot(name);
}

await page.evaluate(() => {
  window.__store.getState().selectField("temperature");
  window.__store.setState({ windowMin: 0.55, windowMax: 0.80, selectedFloatId: null });
});
await page.waitForTimeout(2500);
await shot("09-watermass");

console.log(problems.length ? `PROBLEMS: ${problems.join(" | ")}` : "clean");
await browser.close();
