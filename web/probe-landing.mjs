/**
 * The landing page, measured: no broken picture, no external request, an honest count, a hero
 * whose type is readable in both themes, and a globe that never sits under the type.
 *
 * That last one is structural. The hero is now a two-column grid - the type owns one column
 * and the globe owns its own - and this probe measures each text block's *whole box* against
 * the ground under it, which is exactly why the two needed their own columns: a spinning
 * planet inside a text box would break both the ground and the frame-to-frame stability. So
 * the overlap check below is not extra; it is the reason the layout exists.
 *
 * It checks six things, and each of them is a thing that has actually gone wrong:
 *
 *   1. **Every picture the page names exists and decodes.** The `<img src>` references and the
 *      CSS `url()` references are both captured, checked against `web/public/images/` (what
 *      `capture.mjs --publish` writes) and decoded in the browser out of `web/dist/` (what the
 *      preview serves). A publish that never made it into a build fails only the second; a file
 *      nothing ever wrote fails both.
 *   2. **Nothing is fetched from off this build.** The demo path makes zero network calls and
 *      the page carries a badge saying so. Fonts are served from this build - never from
 *      fonts.googleapis.com - and the texture is the same baked `./images/globe.jpg` the page
 *      already uses.
 *   3. **The heading's number is the number of steps.** "Three moves" over any number of
 *      `.step` blocks but three is the sort of wrong nobody looks at twice.
 *   4. **The pictures follow the theme, and this page's pictures never change.** Four dark
 *      renders ship on a page whose palette re-themes - globe, isosurface, water masses and the
 *      comparison screenshot. A `<img src>` is not a CSS property, so the toggle cannot reach
 *      them, and the probe records why each one is allowed to be fixed. If some future shot
 *      needs a light twin, it gains a `FIXED` reason or it fails.
 *   5. **The hero's type has ground under it, in both themes, and the globe stays out of every
 *      text box.** Every hero text block is measured against the *rendered* ground beneath it -
 *      the same frame with the words taken away - and each theme has to clear the floor. The
 *      type re-themes with the page (the page's palette is parchment on light, ink on ink),
 *      so unlike the old page there is deliberately no "both themes read the same" check here.
 *   6. **The globe is actually turning.** The canvas declares `.ready` and the CSS fallback
 *      `.handoff` (the globe took over from the gradient), and two frames of the sphere region
 *      differ enough to mean motion, not a static texture.
 *
 * Run it against the preview, like every other probe here:
 *   npx vite preview --port 4173   then   node probe-landing.mjs
 */
import { chromium } from "playwright";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng } from "./probe-pixels.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PREVIEW = process.env.PREVIEW_URL ?? "http://localhost:4173";
const PAGE = `${PREVIEW}/index.html`;

/**
 * The headline is large text; the lede, the sub and the stat labels are not (11-18 px), so the
 * floor is the full WCAG AA normal-text 4.5 rather than the 3.0 the large headline alone earns.
 * Ink against parchment passes by a wide margin on both themes; the floor is here for the day
 * a new token or a drift sets the two close together.
 */
const CONTRAST_FLOOR = 4.5;
/** The number words the two counted headings could plausibly reach. */
const WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};

const failures = [];
const fail = (message) => { failures.push(message); console.log(`  FAIL ${message}`); };
const note = (message) => console.log(`  ${message}`);

// ---------------------------------------------------------------- 1. the files on disk

const source = readFileSync(resolve(HERE, "index.html"), "utf8");
// `light/` is a real subfolder, so the path and not just the basename has to be captured.
const named = [...new Set([...source.matchAll(/\.\/images\/((?:light\/)?[a-z0-9-]+\.jpg)/g)].map((m) => m[1]))];
named.sort();
console.log(`\npictures named by index.html: ${named.length}`);
for (const file of named) {
  const path = resolve(HERE, "public/images", file);
  if (!existsSync(path)) {
    fail(`index.html asks for ./images/${file} and web/public/images/${file} does not exist`);
  }
}
note(`${named.join(", ")}`);

// ---------------------------------------------------------------- the browser

const browser = await chromium.launch();
const requests = [];
const context = await browser.newContext({ viewport: { width: 1600, height: 1400 } });
context.on("request", (r) => requests.push(r.url()));
const page = await context.newPage();
await page.goto(PAGE, { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(1200);

// ---------------------------------------------------------------- 2. nothing from off the build

const external = requests.filter((u) => !u.startsWith(PREVIEW) && !u.startsWith("data:"));
console.log(`\nrequests: ${requests.length}, none of them external: ${external.length === 0}`);
if (external.length) fail(`the landing page fetched ${external.length} external URL(s): ${external.join(", ")}`);

// ---------------------------------------------------------------- 1b. the pictures decode

const broken = await page.evaluate(async () => {
  const srcs = new Set();
  document.querySelectorAll("img[src]").forEach((i) => i.getAttribute("src") && srcs.add(i.getAttribute("src")));
  // Twinned pictures carry their light copy in data-light; the rail cards carry the dialog's
  // copies in data-image / data-image-light. All of them are part of what must resolve.
  document.querySelectorAll("img[data-light]").forEach((i) => srcs.add(i.getAttribute("data-light")));
  document.querySelectorAll("[data-image]").forEach((c) => srcs.add(c.getAttribute("data-image")));
  document.querySelectorAll("[data-image-light]").forEach((c) => srcs.add(c.getAttribute("data-image-light")));
  const bad = [];
  for (const src of srcs) {
    const ok = await new Promise((done) => {
      const probe = new Image();
      probe.onload = () => done(probe.naturalWidth > 0);
      probe.onerror = () => done(false);
      probe.src = src;
    });
    if (!ok) bad.push(src);
  }
  return { count: srcs.size, bad };
});
console.log(`\nimage references on the page: ${broken.count}, broken: ${broken.bad.length}`);
for (const src of broken.bad) fail(`${src} does not load in the browser`);

// ---------------------------------------------------------------- 6. the globe is real and turning

const globeSeen = await page.evaluate(async () => {
  const canvas = document.getElementById("globeCanvas");
  const fallback = document.getElementById("sphereFallback");
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline && !(canvas.classList.contains("ready") && canvas.dataset.globeContinents === "1")) {
    await new Promise((r) => setTimeout(r, 150));
  }
  return {
    ready: canvas.classList.contains("ready"),
    continents: canvas.dataset.globeContinents === "1",
    handoff: fallback.classList.contains("handoff"),
    box: (() => { const r = canvas.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })(),
  };
});
if (!globeSeen.ready) fail("the globe canvas never declared .ready - the 3D globe did not take over");
else if (!globeSeen.continents) fail("the globe never drew its continents (data-globe-continents) - it is not the real globe");
else if (!globeSeen.handoff) fail("the CSS fallback was not handed off (.handoff) once the globe drew");
else {
  const box = globeSeen.box;
  const spot = { x: box.x + box.w / 2, y: box.y + box.h / 2 };

  // The claim measured here is that the globe TURNS. It is drawn from smooth data now, not a
  // high-frequency screenshot, so the old long-idle pixel check stopped proving anything: a
  // slow drift of a tonal sphere moves a few units a pixel, under an 8-value change threshold.
  // So the probe grabs it (the same gesture a visitor uses, trusted mouse events so the
  // capture works) and measures the turn, then lets inertia die and measures the idle drift
  // over a longer window.

  const diff = (a, b) => {
    let changed = 0;
    let total = 0;
    for (let i = 0; i < a.data.length; i += a.channels) {
      total += 1;
      const d = Math.abs(a.data[i] - b.data[i]);
      const e = Math.abs(a.data[i + 1] - b.data[i + 1]);
      const f = Math.abs(a.data[i + 2] - b.data[i + 2]);
      if (Math.max(d, e, f) > 8) changed += 1;
    }
    return total ? (100 * changed) / total : 0;
  };

  await page.mouse.move(spot.x, spot.y);
  await page.mouse.down();
  await page.mouse.move(spot.x + 180, spot.y - 45, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const afterGrab = decodePng(await page.screenshot({ clip: { x: box.x, y: box.y, width: box.w, height: box.h } }));
  // Idle drift needs the released inertia to have died, then a real window to accumulate
  // rotation in - 0.10 rad/s over three seconds is about a sixth of a turn.
  await page.waitForTimeout(2500);
  const driftA = decodePng(await page.screenshot({ clip: { x: box.x, y: box.y, width: box.w, height: box.h } }));
  await page.waitForTimeout(3000);
  const driftB = decodePng(await page.screenshot({ clip: { x: box.x, y: box.y, width: box.w, height: box.h } }));

  const grabShare = diff(afterGrab, driftA);
  const driftShare = diff(driftA, driftB);
  console.log(`\nglobe: canvas .ready, fallback handed off, grab turned ${grabShare.toFixed(1)}% of sphere pixels, idle drift ${driftShare.toFixed(1)}% over 3 s`);
  if (grabShare < 3) fail(`a grab of the globe barely moved it (${grabShare.toFixed(2)}% of pixels) - is it dragging?`);
  if (driftShare < 0.2) fail(`the idle drift is dead (${driftShare.toFixed(2)}% over 3 s) - is it rotating on its own?`);
}

// ---------------------------------------------------------------- 3. the count in the heading

const counted = await page.evaluate(() => ({
  heading: document.querySelector("#how h2")?.textContent?.trim() ?? "",
  steps: document.querySelectorAll("#how .step").length,
}));
const word = counted.heading.toLowerCase().split(/\s+/)[0];
const claimed = WORDS[word];
console.log(`\nheading: "${counted.heading}" over ${counted.steps} steps`);
if (claimed === undefined) {
  fail(`the how heading starts with "${word}", which is not a number this probe knows`);
} else if (claimed !== counted.steps) {
  fail(`the heading claims ${claimed} steps and #how holds ${counted.steps}`);
}

// ---- the features rail counts its own heading ----
const features = await page.evaluate(() => ({
  heading: document.querySelector("#features h2")?.textContent?.trim() ?? "",
  cards: document.querySelectorAll("#rail .feature").length,
}));
const fword = features.heading.toLowerCase().split(/\s+/)[0];
const fclaim = WORDS[fword];
console.log(`\nfeatures heading: "${features.heading}" over ${features.cards} cards`);
if (fclaim === undefined) {
  fail(`the features heading starts with "${fword}", which is not a number this probe knows`);
} else if (fclaim !== features.cards) {
  fail(`the features heading claims ${fclaim} cards and the rail holds ${features.cards}`);
}

// ---------------------------------------------------------------- 4. the pictures follow the theme

/** Pictures that are the same in both themes on purpose, and why. */
const FIXED = {
  "kiosk.jpg": "an exhibition screen is a dark screen in any theme; a light copy would be the wrong picture",
};

const swap = await page.evaluate(async () => {
  const shot = () => [...document.querySelectorAll("#rail .feature img, figure.shot img")].map((i) => ({
    src: i.getAttribute("src"),
    twinned: i.hasAttribute("data-light"),
  }));
  const globeTheme = () => {
    const el = document.getElementById("globeCanvas");
    return el ? el.getAttribute("data-globe-theme") : null;
  };
  const fallbackPic = () => {
    // The no-WebGL fallback is a pure gradient sphere: there is deliberately no picture on it.
    const el = document.getElementById("sphereFallback");
    const bg = el ? getComputedStyle(el, "::after").backgroundImage : "";
    return bg && bg !== "none" ? bg : null;
  };
  const before = shot();
  const globeBefore = globeTheme();
  const fallbackBefore = fallbackPic();
  document.getElementById("themeToggle").click();
  await new Promise((r) => setTimeout(r, 0));
  const light = document.documentElement.dataset.theme === "light";
  const after = shot();
  const globeAfter = globeTheme();
  const fallbackAfter = fallbackPic();
  document.getElementById("themeToggle").click();
  await new Promise((r) => setTimeout(r, 0));
  const back = shot();
  const globeBack = globeTheme();
  return { before, after, light, back, globeBefore, globeAfter, globeBack, fallbackBefore, fallbackAfter };
});

if (!swap.light) fail("clicking the theme toggle did not put the page into light");
let moved = 0;
let held = 0;
for (let i = 0; i < swap.before.length; i += 1) {
  const was = swap.before[i];
  const now = swap.after[i];
  const file = (was.src ?? "").split("/").pop();
  if (was.twinned) {
    if (was.src === now.src) fail(`${was.src} has a light twin and did not change with the theme`);
    else moved += 1;
  } else {
    if (was.src !== now.src) fail(`${was.src} changed with the theme and should not have`);
    else held += 1;
    if (!FIXED[file]) fail(`${file} has no light twin and no reason on record; add one to FIXED`);
  }
  if (swap.back[i].src !== was.src) fail(`${was.src} did not come back on the second toggle`);
}
console.log(`\npictures on the theme toggle: ${moved} swapped, ${held} deliberately fixed`);
for (const [file, why] of Object.entries(FIXED)) note(`${file} stays put: ${why}`);

// ---- the turning globe wears the theme too, and it is drawn from data, not a picture ----
if (swap.globeBefore !== "dark") fail(`the globe should start dark and reads "${swap.globeBefore}"`);
if (swap.globeAfter !== "light") fail(`the globe should turn light with the page and reads "${swap.globeAfter}"`);
if (swap.globeBack !== "dark") fail(`the globe should return to dark and reads "${swap.globeBack}"`);
if (swap.fallbackBefore) fail(`the no-WebGL fallback carries a picture ("${swap.fallbackBefore}") and must be a plain gradient`);
if (swap.fallbackAfter) fail(`the no-WebGL fallback acquired a picture ("${swap.fallbackAfter}") and must be a plain gradient`);
console.log(`globe on the theme toggle: canvas ${swap.globeBefore} -> ${swap.globeAfter} -> ${swap.globeBack}, fallback picture-free`);

// ---------------------------------------------------------------- 5. the hero's type

const lum = (r, g, b) => {
  const channel = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};
const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const TYPE = [
  ["eyebrow", ".hero .eyebrow"],
  ["headline", ".hero h1"],
  ["lede", ".hero .lede"],
  ["sub", ".hero .sub"],
  ["stat figure", ".stat-strip b"],
  ["stat label", ".stat-strip span"],
];

/** Every hero text block against the frame with the hero's words taken away. */
const heroContrast = async (theme, width) => {
  const ctx = await browser.newContext({ viewport: { width, height: 1400 } });
  await ctx.addInitScript((t) => {
    try { window.localStorage.setItem("samudra.theme", t); } catch { /* dark is the default */ }
  }, theme);
  const p = await ctx.newPage();
  await p.goto(PAGE, { waitUntil: "load", timeout: 60000 });
  await p.waitForTimeout(900);
  const boxes = await p.evaluate((targets) => targets.map(([label, selector]) => {
    const el = document.querySelector(selector);
    const box = el.getBoundingClientRect();
    return { label, colour: getComputedStyle(el).color, x: box.x, y: box.y, w: box.width, h: box.height };
  }), TYPE);
  const sphere = await p.evaluate(() => {
    const r = document.getElementById("sphereWrap")?.getBoundingClientRect();
    return r && r.width > 0 ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
  });
  for (const box of boxes) {
    if (sphere && box.x < sphere.x + sphere.w && box.x + box.w > sphere.x &&
        box.y < sphere.y + sphere.h && box.y + box.h > sphere.y) {
      fail(`${box.label} at ${width} px overlaps the globe's box - a spinning planet inside a text box breaks both the ground and the frame`);
    }
  }
  if (sphere) console.log(`\n  ${width} px: no hero text block overlaps the globe box`);
  await p.addStyleTag({
    content: ".hero h1, .hero .lede, .hero .sub, .hero .eyebrow, .stat-strip b, .stat-strip span { visibility: hidden !important; }",
  });
  await p.waitForTimeout(400);
  const png = decodePng(await p.screenshot({ clip: { x: 0, y: 0, width, height: 1400 } }));
  const out = {};
  for (const box of boxes) {
    let sum = 0;
    let n = 0;
    for (let y = Math.max(0, Math.round(box.y)); y < Math.min(png.height, box.y + box.h); y++) {
      for (let x = Math.max(0, Math.round(box.x)); x < Math.min(png.width, box.x + box.w); x++) {
        const i = (y * png.width + x) * png.channels;
        sum += lum(png.data[i], png.data[i + 1], png.data[i + 2]);
        n += 1;
      }
    }
    if (n === 0) { fail(`${box.label} has no pixels to measure at ${width} px`); continue; }
    const [r, g, b] = box.colour.match(/[\d.]+/g).slice(0, 3).map(Number);
    out[box.label] = contrast(lum(r, g, b), sum / n);
  }
  await ctx.close();
  return out;
};

console.log("\nhero type against the ground actually under it:");
for (const width of [1600, 1280]) {
  const light = await heroContrast("light", width);
  const dark = await heroContrast("dark", width);
  for (const [label] of TYPE) {
    const l = light[label];
    const d = dark[label];
    if (l === undefined || d === undefined) continue;
    console.log(`  ${width} px  ${label.padEnd(16)} light ${l.toFixed(2)}  dark ${d.toFixed(2)}`);
    if (l < CONTRAST_FLOOR) fail(`${label} at ${width} px is ${l.toFixed(2)}:1 on light, under the ${CONTRAST_FLOOR}:1 floor`);
    if (d < CONTRAST_FLOOR) fail(`${label} at ${width} px is ${d.toFixed(2)}:1 on dark, under the ${CONTRAST_FLOOR}:1 floor`);
  }
}

await browser.close();

console.log(failures.length ? `\nFAILED: ${failures.length}` : "\nPASS");
process.exit(failures.length ? 1 : 0);