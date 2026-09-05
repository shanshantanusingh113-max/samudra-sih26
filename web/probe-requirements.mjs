/**
 * Checks the requirements page against the build it describes.
 *
 * Its whole claim is that every figure on it is read from the same manifest the application
 * loads, and that every link opens the real thing. So: no placeholder left unfilled, no external
 * request, and each deep link lands with the control it promises actually set.
 *
 * **The last of those was printed and never checked**, and it cost a real defect: two links
 * labelled "Open a float comparison" and "Open a comparison" pointed at `?dive=1&tour=1`, which
 * starts the guided tour and selects no float at all. This probe followed both, printed
 * `{"tour":0}` beside them, and exited 0. So the expectation is now **derived from the href
 * itself** rather than from a list typed in here: every query parameter a link carries is looked
 * up in `PROMISES` below and asserted against the store it landed in. A link that grows a new
 * parameter this probe has never seen fails too, rather than passing silently.
 *
 *   node probe-requirements.mjs        (needs a preview server on 4173)
 */
import { chromium } from "playwright";

const failures = [];
const fail = (message) => { failures.push(message); console.log(`  FAIL ${message}`); };

/**
 * What each query parameter is a promise about, read out of the store that link landed in.
 *
 * Keyed by parameter name. Each entry returns null when the promise was kept, or a sentence
 * saying what arrived instead. `dive` is here because a link that says it dives and does not
 * leaves the reader on a globe, looking at the wrong half of the product.
 */
const PROMISES = {
  field: (want, s) => (s.field === want ? null : `field is ${s.field}`),
  step: (want, s) => (String(s.step) === want ? null : `step is ${s.step}`),
  scale: (want, s) => (s.scale === want ? null : `scale is ${s.scale}`),
  iso: (want, s) => (s.iso === (want === "1") ? null : `isoEnabled is ${s.iso}`),
  bias: (want, s) => (s.bias === (want === "1") ? null : `biasMode is ${s.bias}`),
  tour: (want, s) => (want !== "1" || s.tour === 0 ? null : `tourStep is ${s.tour}`),
  float: (want, s) => (s.float === want ? null : `selectedFloatId is ${s.float}`),
  explore: (want, s) => (want !== "1" || s.explore ? null : "explore is closed"),
  kiosk: (want, s) => (want !== "1" || s.kiosk ? null : "kiosk is off"),
  flow: (want, s) => (s.currentStyle === want ? null : `currentStyle is ${s.currentStyle}`),
  preset: (want, s) => (want !== "hazard" || s.hazardMode ? null : "hazardMode is off"),
  // The dive is an animation, so this is "did it arrive", not "did it start".
  dive: (want, s) => (want !== "1" || s.morph > 0.99 ? null : `morph is ${s.morph}`),
  pin: (want, s) => {
    const [lon, lat] = want.split(",").map(Number);
    if (!s.pin) return "no drift pin was dropped";
    const off = Math.hypot(s.pin.lon - lon, s.pin.lat - lat);
    return off < 0.01 ? null : `pin is at ${s.pin.lon},${s.pin.lat}`;
  },
  section: (want, s) => {
    const [ax, ay, bx, by] = want.split(",").map(Number);
    if (!s.from || !s.to) return "no section line was drawn";
    const off = Math.hypot(s.from.lon - ax, s.from.lat - ay)
      + Math.hypot(s.to.lon - bx, s.to.lat - by);
    return off < 0.01 ? null : `line is ${s.from.lon},${s.from.lat} to ${s.to.lon},${s.to.lat}`;
  },
};

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
      float: s.selectedFloatId,
      explore: s.explore,
      kiosk: s.kiosk,
      hazardMode: s.hazardMode,
      currentStyle: s.currentStyle,
      pin: s.driftPin,
      from: s.sectionFrom,
      to: s.sectionTo,
      morph: Math.round(s.morph * 100) / 100,
    };
  });
  console.log("LINK", href, JSON.stringify(state));

  // Every parameter the link carries, against the state it produced.
  for (const [key, want] of new URLSearchParams(href.split("?")[1] ?? "")) {
    const promise = PROMISES[key];
    if (!promise) {
      fail(`${href} carries "${key}", which this probe does not know how to check`);
      continue;
    }
    const wrong = promise(want, state);
    if (wrong) fail(`${href} promised ${key}=${want} and ${wrong}`);
  }
}

console.log("EXTERNAL REQUESTS", JSON.stringify([...new Set(external)]));
console.log("PROBLEMS", JSON.stringify(problems));

// A figure that never got filled is the one thing this page cannot ship: its banner says every
// number on it is read from the build.
for (const id of unfilled) fail(`#${id} still reads "measuring..." after the page settled`);
for (const url of new Set(external)) fail(`the page fetched an external URL: ${url}`);
for (const message of problems) fail(`console: ${message}`);
if (!links.length) fail("the page offered no links into the app at all");

await browser.close();

console.log(failures.length ? `\nFAILED: ${failures.length}` : "\nPASS");
process.exit(failures.length ? 1 : 0);
