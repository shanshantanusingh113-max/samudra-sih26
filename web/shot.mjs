/** Screenshot harness: drives the app and captures each stage of the demo so I can look at it. */
import { chromium } from "playwright";

const URL = process.env.SHOT_URL ?? "http://localhost:4173/";
const OUT = process.env.SHOT_DIR ?? "shots";

const browser = await chromium.launch({
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
  ],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

const problems = [];
page.on("console", (m) => {
  if (m.type() === "error") problems.push(`console: ${m.text()}`);
});
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));

await page.goto(URL, { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(6000);
await page.screenshot({ path: `${OUT}/1-globe.png`, timeout: 180000 });

// Dive into the water.
const dive = page.locator("button.dive");
if (await dive.count()) {
  await dive.click();
  await page.waitForTimeout(4500);
  await page.screenshot({ path: `${OUT}/2-volume.png`, timeout: 180000 });
}

// Select a float by clicking the brightest marker we can find: just try the middle-ish area.
const geometry = await page.evaluate(() => (window.__scene ? window.__scene.debug() : null));
console.log("GEOMETRY", JSON.stringify(geometry));

const report = await page.evaluate(() => {
  const canvas = document.querySelector("canvas");
  const gl = canvas?.getContext("webgl2");
  return {
    hasCanvas: !!canvas,
    webgl2: !!gl,
    renderer: gl?.getParameter(gl.getExtension("WEBGL_debug_renderer_info")?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER),
    panels: document.querySelectorAll(".panel").length,
    floats: document.body.innerText.match(/Argo floats \((\d+)\)/)?.[1] ?? null,
  };
});

console.log(JSON.stringify(report, null, 2));
console.log(problems.length ? `PROBLEMS:\n${problems.join("\n")}` : "no console errors");

await browser.close();
