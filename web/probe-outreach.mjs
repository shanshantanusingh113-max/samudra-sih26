/**
 * The outreach half: Explore, the exhibition screen, and the link back out.
 *
 * PS 26067 names school and college students, the general public and policymakers, and three
 * channels - outreach events, exhibitions and e-learning. What answers them is a list of
 * questions, a kiosk mode and a copy-this-view button, and every one of those is the kind of
 * feature that is easy to build and easy to have quietly stop working, because nobody on the
 * team uses it daily. So:
 *
 *   1. **Every question sets up its own answer.** Not "it did something" - the state it lands on
 *      is checked against what the card promised. A card that says "where is the model guessing"
 *      and leaves temperature on screen is worse than no card.
 *
 *   2. **Every question carries its caveat**, where one is needed. Simplified framing that drops
 *      the limit is the failure mode this whole surface risks.
 *
 *   3. **Kiosk actually hides the console**, measured against the panels' own boxes rather than
 *      against the class name, and Escape gets out. A mode with no way out is a trap.
 *
 *   4. **Kiosk advances on its own.** The exhibition claim is a screen with nobody at it, so the
 *      probe stands there doing nothing for longer than one hold and checks the question moved.
 *
 *   5. **A copied link comes back to the same view.** The writer is new and the reader has been
 *      there since the requirements page; a writer that emits a parameter the reader ignores is a
 *      link that silently loses half of what it promised.
 *
 *   node probe-outreach.mjs        (needs a preview server on 4173)
 */
import { chromium } from "playwright";

const SERVER = process.env.PREVIEW_URL ?? "http://localhost:4173";

/**
 * What each question must have arranged, keyed by its id in `explore.ts`.
 *
 * Written here rather than read from the module on purpose: this is the one place in the probe
 * that should not share a source with the code it is checking. If both sides read the same
 * table, a question that stopped setting its Field would still pass.
 */
const PROMISED = {
  cyclone: (s) => s.fieldKey === "heat_potential" && s.hazardMode === true,
  guessing: (s) => s.fieldKey === "coverage",
  disagree: (s) => s.biasMode === true,
  changed: (s) => s.fieldKey === "temperature_normal_anomaly",
  adrift: (s) => s.fieldKey === "current_speed" && s.driftPin !== null,
  twoseas: (s) => s.fieldKey === "density",
  float: (s) => typeof s.selectedFloatId === "string" && s.selectedFloatId.length > 0,
  // The lowest exaggeration seen while it was running, not the value at one instant. A third of
  // the way down is well past anything a rounding error or a single stray frame produces.
  truescale: (s) => s.exaggeration < 1200,
};

const problems = [];
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));

await page.goto(`${SERVER}/app.html?dive=1`, { waitUntil: "load", timeout: 60000 });
await page.waitForFunction(() => !!window.__store?.getState().manifest, null, { timeout: 120000 });
await page.waitForTimeout(5000);

// ---- 1 and 2. every question keeps its promise -------------------------------------------
const questions = await page.evaluate(() =>
  window.__explore.QUESTIONS.map((q) => ({ id: q.id, question: q.question, caution: q.caution })),
);
console.log(`${questions.length} questions on the Explore surface`);

for (const question of questions) {
  const landed = await page.evaluate(async (id) => {
    // Back to a known state first, so nothing is inherited from the question before it.
    window.__store.getState().selectField("temperature");
    window.__store.setState({
      biasMode: false,
      driftPin: null,
      selectedFloatId: null,
      hazardMode: false,
      exaggeration: 1800,
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    const one = window.__explore.QUESTIONS.find((q) => q.id === id);
    one.run({ focusOn: () => {}, panTo: () => {} });

    // True scale is an **animation**, so sampling it once at a fixed moment measures the
    // machine's frame rate as much as the feature. It ran fine and then failed a run later at a
    // 900 ms snapshot, because under software rendering that is a coin toss. Watch a window
    // instead and keep the lowest exaggeration seen: the claim is "the block flattens", and the
    // minimum over four seconds is that claim measured rather than caught.
    let lowest = window.__store.getState().exaggeration;
    for (let i = 0; i < 40; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      lowest = Math.min(lowest, window.__store.getState().exaggeration);
    }
    const s = window.__store.getState();
    return {
      fieldKey: s.fieldKey,
      hazardMode: s.hazardMode,
      biasMode: s.biasMode,
      driftPin: s.driftPin,
      selectedFloatId: s.selectedFloatId,
      exaggeration: lowest,
    };
  }, question.id);

  const check = PROMISED[question.id];
  if (!check) {
    problems.push(`question "${question.id}" is not covered by this probe - add it to PROMISED`);
  } else if (!check(landed)) {
    problems.push(
      `"${question.question}" did not set up its own answer: ${JSON.stringify(landed)}`,
    );
  }
}

// A caveat is required on every question that simplifies a limit away. Three of them state a
// finding with no limit worth naming; the rest must say what they left out.
const needsCaution = ["cyclone", "guessing", "disagree", "changed", "adrift"];
for (const id of needsCaution) {
  const one = questions.find((q) => q.id === id);
  if (!one?.caution) {
    problems.push(`question "${id}" simplifies something and carries no caveat with it`);
  }
}
await page.evaluate(() => window.__store.setState({ exaggeration: 1800 }));

// ---- 3. kiosk hides the console, and Escape gets out --------------------------------------
await page.goto(`${SERVER}/app.html?kiosk=1`, { waitUntil: "load", timeout: 60000 });
await page.waitForFunction(() => !!window.__store?.getState().manifest, null, { timeout: 120000 });
await page.waitForTimeout(6000);

const hidden = await page.evaluate(() => {
  const box = (selector) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  };
  return {
    left: box("aside.panel-left"),
    topbar: box("header.topbar"),
    timeline: box(".timeline"),
    caption: box(".kiosk-caption"),
  };
});
for (const [name, rect] of Object.entries(hidden)) {
  if (name === "caption") continue;
  if (rect && (rect.width > 0 || rect.height > 0)) {
    problems.push(`kiosk mode leaves ${name} on screen at ${rect.width}x${rect.height}`);
  }
}
if (!hidden.caption || hidden.caption.width === 0) {
  problems.push("kiosk mode draws no caption, so the screen says nothing about what it shows");
}
console.log(
  `kiosk: panels hidden, caption ${hidden.caption?.width.toFixed(0)}x` +
    `${hidden.caption?.height.toFixed(0)} px`,
);

// ---- 4. it advances with nobody standing there -------------------------------------------
//
// The exhibition claim in one measurement. Slow on purpose: a hold is twenty seconds, and a
// probe that shortened it would be testing a different thing from the one that ships.
const first = await page.evaluate(() => document.querySelector(".kiosk-question")?.textContent);
await page.waitForTimeout(22000);
const second = await page.evaluate(() => document.querySelector(".kiosk-question")?.textContent);
console.log(`kiosk after 22 s: "${first}" -> "${second}"`);
if (first === second) {
  problems.push("kiosk mode did not advance in 22 seconds - the exhibition loop is not running");
}

await page.keyboard.press("Escape");
await page.waitForTimeout(800);
const escaped = await page.evaluate(() => ({
  kiosk: window.__store.getState().kiosk,
  panel: (document.querySelector("aside.panel-left")?.getBoundingClientRect().width ?? 0) > 0,
}));
if (escaped.kiosk || !escaped.panel) {
  problems.push(`Escape did not leave kiosk mode: ${JSON.stringify(escaped)}`);
}

// ---- 5. a copied link comes back to the same view -----------------------------------------
await page.goto(`${SERVER}/app.html?dive=1`, { waitUntil: "load", timeout: 60000 });
await page.waitForFunction(() => !!window.__store?.getState().manifest, null, { timeout: 120000 });
await page.waitForTimeout(4000);

const link = await page.evaluate(() => {
  window.__store.getState().selectField("current_speed");
  window.__store.setState({
    timestepIndex: 3,
    currentStyle: "arrows",
    biasMode: false,
    driftPin: { lon: 60.25, lat: 8.5 },
    sectionFrom: { lon: 80, lat: 5 },
    sectionTo: { lon: 90, lat: 20 },
  });
  return window.__deeplink.currentViewUrl();
});
console.log(`copied link: ${link.replace(/^https?:\/\/[^/]+/, "")}`);

await page.goto(link, { waitUntil: "load", timeout: 60000 });
await page.waitForFunction(() => !!window.__store?.getState().manifest, null, { timeout: 120000 });
await page.waitForTimeout(4000);
const restored = await page.evaluate(() => {
  const s = window.__store.getState();
  return {
    fieldKey: s.fieldKey,
    timestepIndex: s.timestepIndex,
    currentStyle: s.currentStyle,
    pin: s.driftPin,
    from: s.sectionFrom,
    to: s.sectionTo,
    dived: s.morph > 0.5 || s.stage !== "globe",
  };
});
const wanted = {
  fieldKey: "current_speed",
  timestepIndex: 3,
  currentStyle: "arrows",
  pin: { lon: 60.25, lat: 8.5 },
  from: { lon: 80, lat: 5 },
  to: { lon: 90, lat: 20 },
};
for (const [key, value] of Object.entries(wanted)) {
  if (JSON.stringify(restored[key]) !== JSON.stringify(value)) {
    problems.push(
      `the link did not restore ${key}: wanted ${JSON.stringify(value)}, got ` +
        `${JSON.stringify(restored[key])}`,
    );
  }
}
if (!restored.dived) problems.push("the link did not restore the Volume View");

console.log(problems.length ? `PROBLEMS: ${problems.join(" | ")}` : "clean");
await browser.close();
process.exit(problems.length ? 1 : 0);
