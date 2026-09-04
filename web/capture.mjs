/**
 * Captures every state of the demo, in either theme, and publishes the chosen ones.
 *
 * Three steps used to be one script and two habits. `capture.mjs` wrote PNGs into `shots/`; the
 * JPEGs the README and the landing page actually load were made by hand and copied by hand, so
 * `shots/` held PNGs from today beside JPEGs from three weeks ago and nothing in the repo could
 * tell which pictures the documents were showing. That is BUGS 42 and 44, both re-opened every
 * round because the missing step was never written down.
 *
 * So this does all three. It writes a PNG **and** a JPEG for every shot - the PNG is what you
 * look at while choosing, the JPEG is what ships - and `--publish` copies the chosen ones into
 * `docs/images/` and `web/public/images/` under the names those documents already reference.
 * There is no separate convert step because there is nothing to convert: Chromium encodes the
 * JPEG itself.
 *
 * The theme is a real capture, not a re-skin. The globe, the coastlines, the markers and the box
 * frame are drawn by us in WebGL and swap in `OceanScene.setTheme()`, so a light run produces a
 * genuinely different picture. It is set by writing the store's own `localStorage` key before
 * the first load, which is the same thing the toggle in the app does.
 *
 *   node capture.mjs                                     dark, into shots/
 *   node capture.mjs --theme light                       light, into shots/
 *   node capture.mjs --theme light --ingest              and promote into assets/screenshots/
 *   node capture.mjs --publish-only --publish            fill all three documents, no browser
 *   node capture.mjs --publish-only --publish --target docs      just the README's set
 *
 * **The common case is the last two**, and neither opens a browser. A capture run is about
 * forty minutes on this machine - every frame ray-marches in software - and once the pictures
 * are in `assets/screenshots/` the documents are filled from them in under a second. Every copy
 * prints the date of the file it came from, so a stale picture cannot reach a document quietly.
 *
 * `SHOT_URL` still names the page. A preview server has to be running: `npx vite preview`.
 */
import { chromium } from "playwright";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : args[at + 1];
};

const THEME = flag("theme", "dark");
const PUBLISH = args.includes("--publish");
/** Copy what `shots/` already holds, and never open a browser. See the note at the top. */
const PUBLISH_ONLY = args.includes("--publish-only");
/** Promote `shots/` into `assets/screenshots/<theme>/`. Opt-in; see the note on PUBLISH_MAP. */
const INGEST_SHOTS = args.includes("--ingest");
/** Let an ingest overwrite a picture a person chose. Almost never right. */
const FORCE = args.includes("--force");
/**
 * Which documents a publish writes into: `docs`, `site`, `ppt`, or `all`.
 *
 * They do not want the same theme. The README reads better light, the **SIH template is a white
 * page** so the deck wants light too, and the landing page is where the ray-marched water looks
 * best, which is dark - so the sets are shot in separate runs and each run publishes into the
 * ones that want its theme. Without this flag the second run would overwrite the first.
 *
 * The default is `all`, which is only ever right with `--publish-only`, where you are copying
 * one set of shots into every document that wants it. A real capture should always name a
 * target.
 */
const TARGET = flag("target", "all");
const URL = flag("url", process.env.SHOT_URL ?? "http://localhost:4173/app.html");
/** The store's own key. `web/src/store.ts` reads this before React mounts. */
const THEME_KEY = "samudra.theme";
/** High enough that the coastline stays crisp, low enough that seven of these are not a MB. */
const JPEG_QUALITY = 82;

if (THEME !== "light" && THEME !== "dark") {
  console.error(`--theme must be light or dark, not ${THEME}`);
  process.exit(1);
}
if (!["docs", "site", "ppt", "all"].includes(TARGET)) {
  console.error(`--target must be docs, site, ppt or all, not ${TARGET}`);
  process.exit(1);
}
if (PUBLISH_ONLY && !PUBLISH) {
  console.error("--publish-only does nothing without --publish");
  process.exit(1);
}

/**
 * Which picture becomes which published file.
 *
 * **There is one home for every screenshot in this project: `assets/screenshots/<theme>/`.**
 * It is named by what the picture *shows* - `collocation`, `hazard`, `bias` - not by which
 * document happens to use it, because the same frame is `hero.jpg` in the README, `volume.jpg`
 * on the landing page and `S2-app.jpg` in the deck, and three folders each holding their own
 * near-copy is how a project ends up unable to say which picture is current. That state lasted
 * a round here: `docs/images/`, `web/public/images/`, `ppt/images/` and `web/handpicked/` all
 * held overlapping sets in two themes, one of them from August.
 *
 * Those three folders still exist, because the documents reference those paths. They are
 * **outputs** now. Nothing is edited in them; one command fills all three.
 *
 *   assets/screenshots/light/*.jpg   the README and the deck: both are read on a white page
 *   assets/screenshots/dark/*.jpg    the landing page, which is dark by default
 *   web/shots/*.jpg                  scratch. The next capture run overwrites it wholesale
 *
 * A capture fills `shots/`. **`--ingest` is what promotes a shot into `assets/screenshots/`,
 * and it is opt-in on purpose**: the harness shoots one camera angle per state and a person
 * looking at the result will sometimes want a different frame - the one where the Somali
 * Current is actually visible, or where the drift pin has a track worth looking at. Those
 * frames go straight into `assets/screenshots/` through `scripts/normalise_screenshot.py`, and
 * an ingest refuses to overwrite one unless you say `--force`.
 *
 * `web/index.html` carries written captions describing what is in each picture, and some of
 * them name colours. A theme change makes those captions wrong; publishing does not fix prose.
 */
const PUBLISH_MAP = [
  // ---- the README, light, because GitHub renders it on a white page ----------------------
  ["globe", "docs/images/globe.jpg"],
  ["volume", "docs/images/volume.jpg"],
  ["collocation", "docs/images/collocation.jpg"],
  ["salinity", "docs/images/salinity.jpg"],
  ["density", "docs/images/density.jpg"],
  ["isosurface", "docs/images/isosurface.jpg"],
  ["anomaly", "docs/images/anomaly.jpg"],
  ["normal", "docs/images/normal.jpg"],
  ["coverage", "docs/images/coverage.jpg"],
  ["spread", "docs/images/spread.jpg"],
  ["flow", "docs/images/flow.jpg"],
  ["arrows", "docs/images/arrows.jpg"],
  ["drift", "docs/images/drift.jpg"],
  ["hazard", "docs/images/hazard.jpg"],
  ["d26", "docs/images/d26.jpg"],
  ["section", "docs/images/section.jpg"],
  ["bias", "docs/images/bias.jpg"],
  ["explore", "docs/images/explore.jpg"],

  // ---- the landing page, dark, which is its default theme --------------------------------
  // `hero` is published only here. The README's lead image is the collocation shot, which shows
  // the block, the instruments and the quantified comparison in one frame - the whole argument
  // in a picture, where the chrome-free block was only the pretty half of it.
  ["hero", "web/public/images/hero.jpg"],
  ["globe", "web/public/images/globe.jpg"],
  ["volume", "web/public/images/volume.jpg"],
  ["collocation", "web/public/images/collocation.jpg"],
  ["salinity", "web/public/images/salinity.jpg"],
  ["isosurface", "web/public/images/isosurface.jpg"],
  ["anomaly", "web/public/images/anomaly.jpg"],
  ["normal", "web/public/images/normal.jpg"],
  ["coverage", "web/public/images/coverage.jpg"],
  ["flow", "web/public/images/flow.jpg"],
  ["drift", "web/public/images/drift.jpg"],
  ["section", "web/public/images/section.jpg"],

  // ---- the landing page's LIGHT twins ----------------------------------------------------
  //
  // An `<img src>` is not a CSS property, so the theme toggle - which only swaps custom
  // properties on `<html>` - could not touch the pictures, and a light page carried thirteen
  // dark screenshots that read as holes in it. It could not have been fixed before now for a
  // duller reason: there was no light copy of the site set to swap *to*.
  //
  // Two pictures deliberately have no twin and must not gain one. **The hero** is a dark band
  // in both themes by design - `.hero` re-declares the dark palette for everything inside it,
  // and `probe-landing.mjs` asserts the two themes measure identically there. **Kiosk** is a
  // photograph of a dark screen; the darkness is the subject, not the theme.
  ["globe", "web/public/images/light/globe.jpg", "light"],
  ["volume", "web/public/images/light/volume.jpg", "light"],
  ["collocation", "web/public/images/light/collocation.jpg", "light"],
  ["salinity", "web/public/images/light/salinity.jpg", "light"],
  ["isosurface", "web/public/images/light/isosurface.jpg", "light"],
  ["anomaly", "web/public/images/light/anomaly.jpg", "light"],
  ["normal", "web/public/images/light/normal.jpg", "light"],
  ["coverage", "web/public/images/light/coverage.jpg", "light"],
  ["flow", "web/public/images/light/flow.jpg", "light"],
  ["drift", "web/public/images/light/drift.jpg", "light"],
  ["section", "web/public/images/light/section.jpg", "light"],

  // ---- the submission deck, light, because the SIH template is a white page --------------
  // A dark screenshot on it reads as a hole. The four `S*` names are placed by `ppt/DECK.md`;
  // the spares are there so a slide that feels bare has a real picture to reach for rather
  // than a stock photograph.
  ["globe", "ppt/images/S1-globe.jpg"],
  ["collocation", "ppt/images/S2-app.jpg"],
  ["coverage", "ppt/images/S4-coverage.jpg"],
  ["anomaly", "ppt/images/S5-anomaly.jpg"],
  ["volume", "ppt/images/spare-volume.jpg"],
  ["isosurface", "ppt/images/spare-isosurface.jpg"],
  ["density", "ppt/images/spare-density.jpg"],
  ["flow", "ppt/images/spare-flow.jpg"],
  ["section", "ppt/images/spare-section.jpg"],
  ["explore", "ppt/images/spare-explore.jpg"],
  ["hazard", "ppt/images/spare-hazard.jpg"],
  ["d26", "ppt/images/spare-d26.jpg"],
  ["bias", "ppt/images/spare-bias.jpg"],
  ["drift", "ppt/images/spare-drift.jpg"],
  ["normal", "ppt/images/spare-normal.jpg"],

  // ---- the one picture that is dark in all three documents -------------------------------
  // The exhibition screen is a dark screen wherever it stands, the deck included. Publishing a
  // light one would be publishing a picture of a mode nobody would run in a lit hall. The third
  // element is a per-entry theme override, and this is the only thing that needs one: without
  // it, `docs` and `ppt` both want light and a light run quietly replaced the dark kiosk.
  ["kiosk", "web/public/images/kiosk.jpg", "dark"],
  ["kiosk", "docs/images/kiosk.jpg", "dark"],
  ["kiosk", "ppt/images/spare-kiosk.jpg", "dark"],
];

/**
 * Which capture state becomes which canonical name, for `--ingest`.
 *
 * The shot names carry an ordering prefix because they are steps in one long run; the canonical
 * names do not, because a document does not care what order the harness took its pictures in.
 */
const INGEST = {
  "00-hero": "hero",
  "01-globe": "globe",
  "02-volume": "volume",
  "03-collocation": "collocation",
  "04-isosurface": "isosurface",
  "05-salinity": "salinity",
  "06-density": "density",
  "07-anomaly": "anomaly",
  "08-coverage": "coverage",
  "10-heat-potential": "hazard",
  "11-d26-sheet": "d26",
  "12-currents": "arrows",
  "13-analysis-spread": "spread",
  "14-flow": "flow",
  "15-explore": "explore",
  "16-kiosk": "kiosk",
  "17-section": "section",
};

/**
 * Pictures a person chose, which an ingest may not overwrite without `--force`.
 *
 * Every light picture in this set except the hero and the Explore surface was chosen by hand on
 * 2026-09-04, and four of the dark ones were. The harness can shoot all of those states; it just
 * cannot tell that its own flow shot has no Somali Current in it.
 */
const HANDPICKED = new Set([
  "light/globe", "light/volume", "light/collocation", "light/salinity", "light/density",
  "light/isosurface", "light/anomaly", "light/normal", "light/coverage", "light/spread",
  "light/flow", "light/arrows", "light/drift", "light/hazard", "light/d26", "light/section",
  "light/bias",
  "dark/flow", "dark/coverage", "dark/drift", "dark/normal",
]);

/** Which document a target path belongs to, so `--target` can pick one. */
const documentOf = (target) =>
  target.startsWith("docs/") ? "docs" : target.startsWith("ppt/") ? "ppt" : "site";

/**
 * The theme each document's pictures are supposed to be, and the reason.
 *
 * This is a guard, not a preference, and it exists because publishing the wrong one is silent
 * and total. A `--publish --target site` run against a light source replaced thirteen dark
 * pictures with thirteen light ones in under a second, on a landing page that is dark by
 * default, and nothing said a word.
 */
const WANTS_THEME = {
  docs: "light", // A README reads light, on GitHub's light page.
  ppt: "light", // The SIH template is a white page; a dark screenshot on it reads as a hole.
  site: "dark", // The landing page is dark by default and is where the water looks best.
};

const ROOT = resolve(process.cwd(), "..");
const sourceFor = (name, theme) => resolve(ROOT, "assets", "screenshots", theme, `${name}.jpg`);

/**
 * What theme `shots/` currently holds, stamped by every capture run before its first frame.
 *
 * An ingest without a capture in the same command has no other way to know. `--theme` is a flag
 * a person types, and typing the wrong one would promote a light globe into the dark set, where
 * it would sit on a dark landing page as a white rectangle.
 */
const THEME_STAMP = "shots/.theme";
const shotsTheme = async () => {
  try {
    return (await readFile(THEME_STAMP, "utf8")).trim();
  } catch {
    return null;
  }
};

/** Copy `shots/` into `assets/screenshots/<theme>/`, which is what a capture is *for*. */
async function ingest() {
  if (PUBLISH_ONLY) {
    const held = await shotsTheme();
    if (held !== THEME) {
      console.error(
        `REFUSED to ingest: shots/ holds ${held ?? "an unknown theme"} and --theme says ` +
          `${THEME}. Nothing was promoted into assets/screenshots/.`,
      );
      return;
    }
  }
  let taken = 0;
  let kept = 0;
  for (const [state, name] of Object.entries(INGEST)) {
    const key = `${THEME}/${name}`;
    if (HANDPICKED.has(key) && !FORCE) {
      kept += 1;
      continue;
    }
    const destination = sourceFor(name, THEME);
    try {
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(`shots/${state}.jpg`, destination);
      taken += 1;
      console.log(`ingested ${state}.jpg -> assets/screenshots/${key}.jpg`);
    } catch {
      console.error(`MISSING shots/${state}.jpg - nothing ingested for ${key}`);
    }
  }
  if (kept) {
    console.log(
      `kept ${kept} hand-picked picture(s) in the ${THEME} set; pass --force to overwrite them`,
    );
  }
  console.log(`ingested ${taken} into assets/screenshots/${THEME}/`);
}

/** Copy the canonical pictures into the documents that reference them. */
async function publish() {
  let refused = 0;
  for (const [name, target, override] of PUBLISH_MAP) {
    const into = documentOf(target);
    if (TARGET !== "all" && TARGET !== into) continue;
    const theme = override ?? WANTS_THEME[into];
    const source = sourceFor(name, theme);
    const destination = resolve(ROOT, target);
    let dated = "unknown date";
    try {
      dated = (await stat(source)).mtime.toISOString().slice(0, 10);
    } catch {
      console.error(`MISSING ${relative(ROOT, source)} - nothing published to ${target}`);
      refused += 1;
      continue;
    }
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(source, destination);
    console.log(`published ${theme}/${name}.jpg (${dated}) -> ${target}`);
  }
  if (refused) console.error(`${refused} picture(s) were missing from assets/screenshots/`);
}

if (PUBLISH_ONLY) {
  if (INGEST_SHOTS) await ingest();
  await publish();
  console.log("published from assets/screenshots/; nothing was captured");
  process.exit(0);
}

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const problems = [];
page.on("console", (m) => m.type() === "error" && problems.push(m.text()));
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));

// Before the first byte of the app runs, so the scene is built in the right theme rather than
// being switched into it afterwards.
await page.addInitScript(
  ([key, theme]) => {
    try {
      window.localStorage.setItem(key, theme);
    } catch {
      // A browser with storage blocked still captures; it captures the default theme.
    }
  },
  [THEME_KEY, THEME],
);

/** One state, as both a PNG to choose from and the JPEG that ships. */
const shot = async (name) => {
  await page.screenshot({ path: `shots/${name}.png`, timeout: 180000 });
  await page.screenshot({
    path: `shots/${name}.jpg`,
    type: "jpeg",
    quality: JPEG_QUALITY,
    timeout: 180000,
  });
};

// Stamp what this run is filling `shots/` with, so a later `--publish-only` can refuse to put
// light pictures on a dark page. Written before the first shot, so an interrupted run still
// leaves an honest stamp rather than the previous run's.
await mkdir("shots", { recursive: true });
await writeFile(THEME_STAMP, `${THEME}\n`, "utf8");

await page.goto(URL, { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(6000);
await shot("01-globe");

/**
 * The console, with everything that is console taken away.
 *
 * A hero image is a picture of the *water*, and a 1600 px screenshot of a working console
 * shrunk into a page column is a picture of some unreadable panels. So the chrome is hidden
 * with a stylesheet and nothing else.
 *
 * **It must not borrow kiosk mode**, which was the obvious way to do this and was wrong: kiosk
 * is not a CSS state, it mounts a component that plays the eight Explore questions on a loop.
 * The first hero shot came back as the *currents* with a drift pin in it, because the loop had
 * started and applied its first two questions while the shot was being taken.
 *
 * Ray steps come down for these too. With the panels gone the volume fills the whole 1600x900
 * frame, roughly three times the pixels the other shots march, and under the software renderer
 * this harness uses the first attempt never finished a frame inside a 180 s screenshot timeout.
 */
const bare = async (run) => {
  const quality = await page.evaluate(() => window.__store.getState().quality);
  await page.evaluate(() => {
    window.__store.setState({ quality: 72 });
    const style = document.createElement("style");
    style.id = "bare-shot";
    style.textContent =
      ".panel-left, .panel-right, .topbar, .timeline, .mapkey, .ruler, .cue, .attribution," +
      " .tour, .notice { display: none !important; }";
    document.head.append(style);
  });
  await page.waitForTimeout(1200);
  await run();
  await page.evaluate((q) => {
    window.__store.setState({ quality: q });
    document.getElementById("bare-shot")?.remove();
  }, quality);
  await page.waitForTimeout(800);
};

await page.click("button.dive");
await page.waitForTimeout(4500);
await shot("02-volume");

await bare(async () => {
  await page.evaluate(() => {
    window.__store.getState().selectField("temperature");
    window.__store.setState({ showTracks: true });
    window.__scene.controls.target.set(72, -7, -8);
    window.__scene.camera.position.set(58, 32, 46);
    window.__scene.controls.update();
  });
  await page.waitForTimeout(4000);
  await shot("00-hero");
});

// Pick the *drifting* float with the largest disagreement that is compared over most of the
// column. Two filters, both of which cost a shot before they were here. It has to be an Argo
// float, because a moored buoy is a different instrument with a different caveat and this shot
// is captioned as a float. And it has to have a real profile behind it: the largest RMS in the
// bake belongs to a float the model only reaches 45 m down, which draws as a smudge in the
// corner of a 2000 m axis and illustrates nothing.
const MIN_MATCHED = 200;
const chosen = await page.evaluate((minMatched) => {
  const { collocations, floats } = window.__store.getState();
  const drifting = new Set(floats.filter((f) => f.kind !== "mooring").map((f) => f.id));
  let best = null, bestRms = -1, bestMatched = 0;
  for (const [id, c] of Object.entries(collocations)) {
    if (!drifting.has(id)) continue;
    const t = c.fields?.temperature;
    if (!t || (t.matched ?? 0) < minMatched) continue;
    if (t.rmsResidual != null && t.rmsResidual > bestRms) {
      bestRms = t.rmsResidual; best = id; bestMatched = t.matched;
    }
  }
  window.__store.setState({ selectedFloatId: best });
  return { best, bestRms, bestMatched };
}, MIN_MATCHED);
console.log("SELECTED", JSON.stringify(chosen));
// The Profile panel mounts a chart per Field and the software renderer is slow: at 2500 ms
// this shot came back with no panel at all, and the README carried it for four days.
await page.waitForTimeout(5000);
await shot("03-collocation");

await page.evaluate(() => window.__store.setState({ isoEnabled: true, isoValue: 0.62, volumeEnabled: false }));
await page.waitForTimeout(2500);
await shot("04-isosurface");

// Every Variable in turn, switched through the store's own action so each Field's render hints
// are applied exactly as the panel would apply them.
await page.evaluate(() => window.__store.setState({ isoEnabled: false, volumeEnabled: true }));
for (const [name, key] of [
  ["05-salinity", "salinity"],
  ["06-density", "density"],
  ["07-anomaly", "temperature_anomaly"],
  ["08-coverage", "coverage"],
  // The September 2026 Fields, and the three render types that came with them. The sheet ones
  // need the volume off: a depth sheet suspended inside a solid block of haze is a sheet nobody
  // can see, and the panel turns the volume off for them for the same reason.
  ["10-heat-potential", "heat_potential"],
  ["11-d26-sheet", "d26"],
  ["12-currents", "current_speed"],
  ["13-analysis-spread", "analysis_spread"],
]) {
  await page.evaluate((k) => window.__store.getState().selectField(k), key);
  // The anomaly shot is published under an alt text that promises "rings marking each departure
  // and a panel explaining one of them", so it has to have one open. Selecting after the Field
  // has switched, because the features belong to the Timestep.
  if (key === "temperature_anomaly") {
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      if (window.__store.getState().features().length > 0) {
        window.__store.setState({ selectedAnomaly: 0 });
      }
    });
  }
  await page.waitForTimeout(3000);
  await shot(name);
}

await page.evaluate(() => {
  window.__store.getState().selectField("temperature");
  window.__store.setState({ windowMin: 0.55, windowMax: 0.80, selectedFloatId: null, selectedAnomaly: null });
});
await page.waitForTimeout(2500);
await shot("09-watermass");

// The September 2026 round: the moving flow, the section, the second door and the exhibition
// screen. Every one of them is a claim the README and the landing page now make, so every one
// of them needs a picture that is actually of that thing.
await page.evaluate(() => {
  window.__store.getState().selectField("current_speed");
  window.__store.setState({ windowMin: 0, windowMax: 1, currentStyle: "particles", volumeEnabled: true });
});
await bare(async () => {
  await page.evaluate(() => {
    window.__scene.controls.target.set(72, -7, -8);
    window.__scene.camera.position.set(62, 34, 42);
    window.__scene.controls.update();
  });
  await page.waitForTimeout(5000);
  await shot("14-flow");
});

await page.evaluate(() => {
  window.__store.getState().selectField("temperature");
  window.__store.setState({
    sectionFrom: { lon: 80, lat: 5 },
    sectionTo: { lon: 90, lat: 20 },
    placingSection: 0,
  });
});
await page.waitForTimeout(4000);
await shot("17-section");

await page.evaluate(() =>
  window.__store.setState({ sectionFrom: null, sectionTo: null, explore: true }),
);
await page.waitForTimeout(1500);
await shot("15-explore");

await page.evaluate(() => {
  window.__store.setState({ explore: false, kiosk: true });
  window.__store.getState().selectField("heat_potential");
});
await page.waitForTimeout(4000);
await shot("16-kiosk");
await page.evaluate(() => window.__store.setState({ kiosk: false }));

if (INGEST_SHOTS) await ingest();
if (PUBLISH) await publish();

console.log(`theme: ${THEME}${PUBLISH ? `, published into ${TARGET}` : ", not published"}`);
console.log(problems.length ? `PROBLEMS: ${problems.join(" | ")}` : "clean");
await browser.close();
