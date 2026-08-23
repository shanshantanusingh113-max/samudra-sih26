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

// Pick the float with the largest disagreement — that is the interesting one to demo.
const chosen = await page.evaluate(() => {
  const { collocations } = window.__store.getState();
  let best = null, bestRms = -1;
  for (const [id, c] of Object.entries(collocations)) {
    const rms = c.fields?.temperature?.rmsResidual;
    if (rms != null && rms > bestRms) { bestRms = rms; best = id; }
  }
  window.__store.setState({ selectedFloatId: best });
  return { best, bestRms };
});
console.log("SELECTED", JSON.stringify(chosen));
await page.waitForTimeout(2500);
await shot("03-collocation");

await page.evaluate(() => window.__store.setState({ isoEnabled: true, isoValue: 0.62, volumeEnabled: false }));
await page.waitForTimeout(2500);
await shot("04-isosurface");

await page.evaluate(() => window.__store.setState({
  isoEnabled: false, volumeEnabled: true, fieldKey: "salinity", paletteName: "haline",
}));
await page.waitForTimeout(3000);
await shot("05-salinity");

await page.evaluate(() => window.__store.setState({
  fieldKey: "temperature", paletteName: "thermal", windowMin: 0.55, windowMax: 0.80, selectedFloatId: null,
}));
await page.waitForTimeout(2500);
await shot("06-watermass");

console.log(problems.length ? `PROBLEMS: ${problems.join(" | ")}` : "clean");
await browser.close();
