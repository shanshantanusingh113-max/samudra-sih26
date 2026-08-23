import { chromium } from "playwright";
import path from "path";
import { pathToFileURL } from "url";
const src = pathToFileURL(path.join(path.resolve(".."), "scripts", "dossier.html")).href;
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 794, height: 1123 } });  // A4 at 96dpi
await page.goto(src, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);
await page.screenshot({ path: "shots/D1-cover.png" });
await page.evaluate(() => document.querySelector("#s11").scrollIntoView());
await page.waitForTimeout(600);
await page.screenshot({ path: "shots/D2-questions.png" });
const stats = await page.evaluate(() => ({
  sections: document.querySelectorAll("section").length,
  tables: document.querySelectorAll("table").length,
  rows: document.querySelectorAll("tbody tr").length,
  figures: document.querySelectorAll("figure").length,
  words: document.body.innerText.split(/\s+/).length,
}));
console.log(JSON.stringify(stats));
await b.close();
