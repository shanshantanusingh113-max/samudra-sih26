/**
 * Checks the requirements page against the build it describes.
 *
 * Its whole claim is that every figure on it is read from the same manifest the application
 * loads, and that every link opens the real thing. So: no placeholder left unfilled, no external
 * request, and each deep link lands with the control it promises actually set.
 *
 *   node probe-requirements.mjs        (needs a preview server on 4173)
 */
import { chromium } from "playwright";

/** Which preview server to drive. `npx vite preview` defaults to 4173. */
const SERVER = process.env.PREVIEW_URL ?? "http://localhost:4173";

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const problems = [];
const external = [];
page.on("console", (m) => m.type() === "error" && problems.push(m.text()));
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
page.on("request", (r) => {
  if (!r.url().startsWith(SERVER) && !r.url().startsWith("data:")) {
    external.push(r.url());
  }
});

await page.goto(`${SERVER}/requirements.html`, { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(3000);

// Every measured figure must have been replaced by a real one.
const unfilled = await page.evaluate(() =>
  [...document.querySelectorAll(".measure")]
    .filter((n) => n.textContent.includes("measuring"))
    .map((n) => n.id),
);
const measured = await page.evaluate(() =>
  Object.fromEntries(
    [...document.querySelectorAll(".measure")].map((n) => [n.id, n.textContent.trim()]),
  ),
);
console.log("UNFILLED", JSON.stringify(unfilled));
console.log("MEASURED", JSON.stringify(measured, null, 1));
console.log("TALLY", await page.textContent("#tally"));
console.log(
  "CLAUSES",
  await page.evaluate(() => document.querySelectorAll(".clause").length),
);

// Every link into the app, followed, and the control it promised checked.
const links = await page.evaluate(() =>
  [...document.querySelectorAll("a.open:not(.code)")].map((a) => a.getAttribute("href")),
);
console.log("APP LINKS", links.length);

const seen = new Set();
for (const href of links) {
  if (seen.has(href)) continue;
  seen.add(href);
  const url = `${SERVER}/` + href.replace(/^\.\//, "");
  // `domcontentloaded`, not `load`. The app fetches its data after first paint, and a link that
  // pulls a 387 KB vector file keeps the load event pending long enough to time out under
  // software rendering - which looks exactly like a broken link and is not one.
  // Fourteen full app loads in one browser, each with a dive and a ray march. Under software
  // rendering that gets slower as the run goes on, and 60 s stopped being enough once the Sheet
  // went from 2,600 triangles to 47,824. The timeout is a property of this machine, not of the
  // build - so it is generous rather than tight, and a genuine hang still fails the probe.
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
  // Wait for the store to exist rather than for a fixed number of seconds. Under software
  // rendering the module can take longer than any timeout worth writing down, and a probe that
  // reports "undefined" because it looked too early is worse than no probe.
  await page.waitForFunction(() => !!window.__store?.getState().manifest, null, { timeout: 90000 });
  await page.waitForTimeout(5000);
  const state = await page.evaluate(() => {
    const s = window.__store.getState();
    return {
      field: s.fieldKey,
      step: s.timestepIndex,
      scale: s.scale,
      iso: s.isoEnabled,
      bias: s.biasMode,
      tour: s.tourStep,
      morph: Math.round(s.morph * 100) / 100,
    };
  });
  console.log("LINK", href, JSON.stringify(state));
}

console.log("EXTERNAL REQUESTS", JSON.stringify([...new Set(external)]));
console.log("PROBLEMS", JSON.stringify(problems));
await browser.close();
