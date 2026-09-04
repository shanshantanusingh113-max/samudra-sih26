/**
 * Render the architecture diagram to PNG at 2x, for README section 5.
 *
 * **This used to render nine boards for the SIH deck and no longer does.** They were pictures of
 * text: a table, a list of technologies, five risk rows. A picture of text cannot be searched,
 * copied, corrected on the day, or read at any size other than the one it was rendered at, and
 * one wrong word meant re-rendering an image. `ppt/DECK.md` carries that content as words now, to
 * be typed natively on the slide, and `ppt/images/` holds screenshots of the running software and
 * nothing else.
 *
 * The architecture board survives because it is the one thing here that is genuinely a *diagram*
 * - four zones with arrows between them, where the shape carries an argument a list does not -
 * and because the README shows it. It is still rendered rather than generated for the reason that
 * killed the other eight as slide images but not as a repository figure: every label in it is a
 * fact, and an image model cannot spell `incois_argo_10d_VAM` or be trusted to point an arrow at
 * the right box. The deck gets a prompt for the *shape* instead - `DECK.md` Part 2 - and the
 * words go on top by hand.
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "path";
import { pathToFileURL } from "url";

const root = path.resolve("..");
const src = pathToFileURL(path.join(root, "scripts", "ppt_diagrams.html")).href;
const out = path.join(root, "docs", "images");

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
await page.goto(src, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(1200);

const boards = {
  arch: "architecture.png",
};

await mkdir(out, { recursive: true });
for (const [id, file] of Object.entries(boards)) {
  const box = await page.locator(`#${id}`).boundingBox();
  await page.locator(`#${id}`).screenshot({ path: path.join(out, file) });
  console.log(`rendered ${file}  ${Math.round(box.width)}x${Math.round(box.height)} css px`);
}
await browser.close();
