/** Render the project dossier to PDF. */
import { chromium } from "playwright";
import path from "path";
import { pathToFileURL } from "url";

const root = path.resolve("..");
const src = pathToFileURL(path.join(root, "scripts", "dossier.html")).href;
const out = path.join(root, "docs", "Samudra3D-Dossier.pdf");

const browser = await chromium.launch();
const page = await browser.newPage();
const problems = [];
page.on("requestfailed", (r) => problems.push(`missing: ${r.url()}`));

await page.goto(src, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);

await page.pdf({
  path: out,
  format: "A4",
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: "<div></div>",
  footerTemplate:
    '<div style="width:100%;font-size:7pt;font-family:monospace;color:#8fa2b0;' +
    'padding:0 16mm;display:flex;justify-content:space-between;">' +
    "<span>Samudra 3D &middot; SIH 2026 &middot; PS 26067</span>" +
    '<span class="pageNumber"></span></div>',
  margin: { top: "17mm", bottom: "15mm", left: "16mm", right: "16mm" },
});

console.log(problems.length ? `PROBLEMS: ${problems.join(" | ")}` : "all assets loaded");
await browser.close();
