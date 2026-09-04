/**
 * The landing page, measured: no broken picture, no external request, an honest count, and a
 * hero whose type is readable in both themes.
 *
 * Two of the fourteen cards shipped with alt text over an empty panel for a whole round.
 * `capture.mjs` sends `07-anomaly` into `docs/images/` and `web/index.html` asks for
 * `./images/anomaly.jpg`, which lives in `web/public/images/` - two halves of one map, and the
 * hole between them is invisible in a diff, in a build, in a typecheck and in every other probe
 * here. Nothing compiles HTML against the files it names, so this does.
 *
 * It checks five things, and each of them is a thing that has actually gone wrong:
 *
 *   1. **Every picture the page names exists and decodes.** Both the `<img src>` and the
 *      `data-image` a card hands the shared dialog, checked twice against two different copies:
 *      the file is in `web/public/images/`, which is what `capture.mjs --publish` writes, and
 *      the browser reports a non-zero `naturalWidth` for what the preview serves out of
 *      `web/dist/`. A publish that never made it into a build fails only the second; a truncated
 *      file fails only the second; a name nothing ever wrote fails both.
 *   2. **Nothing is fetched from off this build.** The demo path makes zero network calls and
 *      the page carries a badge saying so; `probe-requirements.mjs` makes the same check on its
 *      own page, and this is the same shape of check on the page a judge opens first.
 *   3. **The heading's number is the number of cards.** "Sixteen things you can do with it" over
 *      fourteen cards is the sort of wrong nobody looks at twice. The heading is read, its number
 *      word is turned back into a number, and the cards are counted.
 *   4. **The pictures follow the theme, and the two that must not, do not.** An `<img src>` is
 *      not a CSS property, so the toggle could not reach the screenshots and a light page
 *      carried a dozen dark ones. Each twinned picture now carries `data-light`; this toggles
 *      the theme for real and checks every `src` actually moved. Two pictures are asserted
 *      *not* to move: the hero, which is a dark band in both themes on purpose, and kiosk mode,
 *      which is a photograph of a dark screen.
 *   5. **The hero's type has ground under it, in both themes.** The hero image is the same dark
 *      render on light and on dark, and the ink used to follow the page: on light "Fly into the"
 *      was near-black over the darkest part of the picture, measured at a contrast of 3.66 to 1,
 *      and "Indian Ocean." at 1.27 to 1, which is no contrast at all. Every hero text block is
 *      measured against the *rendered* ground beneath it - the same frame with the words taken
 *      away - and both themes have to clear the floor and agree with each other.
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

/** WCAG AA for large text is 3.0, and every string in the hero is large or bold. */
const CONTRAST_FLOOR = 3.0;
/** The number words this page could plausibly reach. */
const WORDS = {
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
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
  // The shared dialog's `<img>` ships with an empty src and is filled from the card that opened
  // it, so an empty one is the page working rather than a picture missing.
  document.querySelectorAll("img[src]").forEach((i) => i.getAttribute("src") && srcs.add(i.getAttribute("src")));
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

// ---------------------------------------------------------------- 3. the count in the heading

const counted = await page.evaluate(() => ({
  heading: document.querySelector("#features h2")?.textContent?.trim() ?? "",
  cards: document.querySelectorAll("#rail .feature").length,
}));
const word = counted.heading.toLowerCase().split(/\s+/)[0];
const claimed = WORDS[word];
console.log(`\nheading: "${counted.heading}" over ${counted.cards} cards`);
if (claimed === undefined) {
  fail(`the features heading starts with "${word}", which is not a number this probe knows`);
} else if (claimed !== counted.cards) {
  fail(`the heading claims ${claimed} cards and the rail holds ${counted.cards}`);
}

// ---------------------------------------------------------------- 4. the pictures follow the theme

/** Pictures that are the same in both themes on purpose, and why. */
const FIXED = {
  "hero.jpg": "the hero is a dark band in both themes; `.hero` re-declares the dark palette",
  "kiosk.jpg": "an exhibition screen is a dark screen wherever it stands",
};

const swap = await page.evaluate(() => {
  const shot = () => [...document.querySelectorAll("#rail img, .hero-media img")].map((i) => ({
    src: i.getAttribute("src"),
    twinned: i.hasAttribute("data-light"),
  }));
  const before = shot();
  document.getElementById("theme-toggle").click();
  const after = shot();
  const light = document.documentElement.dataset.theme === "light";
  document.getElementById("theme-toggle").click();
  return { before, after, light, back: shot() };
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
    if (!FIXED[file]) {
      fail(`${file} has no light twin and no reason on record; add one to FIXED or publish a twin`);
    }
  }
  if (swap.back[i].src !== was.src) fail(`${was.src} did not come back on the second toggle`);
}
console.log(`\npictures on the theme toggle: ${moved} swapped, ${held} deliberately fixed`);
for (const [file, why] of Object.entries(FIXED)) note(`${file} stays put: ${why}`);

// ---------------------------------------------------------------- 5. the hero's type

const lum = (r, g, b) => {
  const channel = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};
const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const TYPE = [
  ["headline", ".hero h1"],
  ["headline accent", ".hero h1 em"],
  ["lede", ".hero .lede"],
  ["sub", ".hero .sub"],
  ["stat figure", ".hero-stats b"],
  ["stat label", ".hero-stats span"],
];

/** Every hero text block against the frame with the hero's words taken away. */
const heroContrast = async (theme, width) => {
  const ctx = await browser.newContext({ viewport: { width, height: 1400 } });
  await ctx.addInitScript((t) => {
    try { window.localStorage.setItem("samudra.theme", t); } catch { /* dark is the default */ }
  }, theme);
  const p = await ctx.newPage();
  await p.goto(PAGE, { waitUntil: "load", timeout: 60000 });
  // The hero image drifts on a 34 s loop, so the ground has to be one frame and not two.
  await p.addStyleTag({ content: ".hero-media img { animation: none !important; transform: scale(1.06); }" });
  await p.waitForTimeout(900);
  const boxes = await p.evaluate((targets) => targets.map(([label, selector]) => {
    const el = document.querySelector(selector);
    const box = el.getBoundingClientRect();
    return { label, colour: getComputedStyle(el).color, x: box.x, y: box.y, w: box.width, h: box.height };
  }), TYPE);
  await p.addStyleTag({
    content: ".hero h1, .hero .lede, .hero .sub, .hero-stats b, .hero-stats span { visibility: hidden !important; }",
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
    // The hero is one dark band in both themes. If a theme ever starts painting it differently
    // the two numbers separate, and that is the bug this section exists for.
    if (Math.abs(l - d) > 0.05) {
      fail(`${label} at ${width} px reads ${l.toFixed(2)}:1 on light and ${d.toFixed(2)}:1 on dark; the hero is meant to be one band in both`);
    }
  }
}

await browser.close();

console.log(failures.length ? `\nFAILED: ${failures.length}` : "\nPASS");
process.exit(failures.length ? 1 : 0);
