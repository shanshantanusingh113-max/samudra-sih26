/** Render the PPT diagram boards to PNG at 2x, so they stay crisp on a projector. */
import { chromium } from "playwright";
import path from "path";
import { pathToFileURL } from "url";

const root = path.resolve("..");
const src = pathToFileURL(path.join(root, "scripts", "ppt_diagrams.html")).href;
const out = path.join(root, "ppt", "images");

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
await page.goto(src, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);

const boards = {
  gap: "06-gap-2d-vs-3d.png",
  arch: "07-architecture.png",
  method: "08-methodology.png",
  risk: "09-feasibility-risk.png",
  impact: "10-impact.png",
};

for (const [id, file] of Object.entries(boards)) {
  await page.locator(`#${id}`).screenshot({ path: path.join(out, file) });
  console.log("rendered", file);
}
await browser.close();
