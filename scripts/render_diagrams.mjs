import { chromium } from "playwright";
import { fileURLToPath } from "url";
import path from "path";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = "file:///" + path.join(here, "ppt_diagrams.html").replace(/\/g, "/");
const out = path.join(here, "..", "ppt", "images");

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
await page.goto(src, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

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
