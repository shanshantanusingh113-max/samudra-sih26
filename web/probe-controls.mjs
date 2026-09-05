/**
 * Every Field, against the two controls whose meaning changes with the Field.
 *
 * A log scale and an isosurface are both offered per Field, both are hidden rather than disabled
 * where they do not apply, and both have been wrong in a way nothing on screen admitted: the log
 * curve repainted every band of Observation Coverage under a key that still said otherwise, and
 * the isosurface kept drawing after the control that turned it on had gone.
 *
 * So this walks every Field and reports, per Field: whether each control is on screen, what the
 * shader is actually doing, and what the panel says it is doing. The two must agree.
 *
 * It also **fails** when they do not. For a round it built the `broken` list below, printed it,
 * and exited 0 - so six checked rules could all have been violated and the run was still green.
 *
 *   node probe-controls.mjs        (needs a preview server on 4173)
 */
import { chromium } from "playwright";

const SERVER = process.env.PREVIEW_URL ?? "http://localhost:4173";

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
const problems = [];
page.on("console", (m) => m.type() === "error" && problems.push(m.text()));
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));

await page.goto(`${SERVER}/app.html`, { waitUntil: "load", timeout: 60000 });
// Wait for the store rather than for a fixed number of seconds. Under software rendering the
// app can take well over six seconds to have its manifest, and a probe that looks too early
// reports "Cannot read properties of null" - which reads as a broken build and is a slow
// machine. `probe-requirements.mjs` has always done it this way; the rest now do too.
await page.waitForFunction(() => !!window.__store?.getState().manifest, null, { timeout: 120000 });
await page.waitForSelector("button.dive", { timeout: 60000 });
await page.click("button.dive");
await page.waitForTimeout(5000);

const fields = await page.evaluate(() =>
  window.__store.getState().manifest.fields.map((f) => f.key),
);

const rows = [];
for (const key of fields) {
  // Turn the isosurface on where it is allowed, so the "does it leak" question is asked from a
  // state where it could leak. Then open the group so the control is in the DOM to be read.
  await page.evaluate(() => {
    window.__store.getState().selectField("temperature");
    window.__store.setState({ isoEnabled: true });
  });
  await page.waitForTimeout(300);
  await page.evaluate((k) => window.__store.getState().selectField(k), key);
  await page.evaluate(() =>
    window.__store.setState((s) => ({ openGroups: { ...s.openGroups, isosurface: true } })),
  );
  await page.waitForTimeout(900);

  const iso = await page.evaluate(() => {
    const group = [...document.querySelectorAll(".control-group")].find((g) =>
      g.querySelector("label")?.textContent?.startsWith("Isosurface"),
    );
    return {
      groupOnScreen: !!group,
      readout: group?.querySelector(".readout")?.textContent ?? null,
      hasCheckbox: !!group?.querySelector('input[type="checkbox"]'),
      sliderLabel: group?.querySelector(".slider-head span")?.textContent ?? null,
      sliderValue: group?.querySelector(".slider-value")?.textContent ?? null,
    };
  });

  await page.evaluate(() =>
    window.__store.setState((s) => ({ openGroups: { ...s.openGroups, palette: true } })),
  );
  await page.waitForTimeout(600);

  const scale = await page.evaluate(() => ({
    toggleOnScreen: !!document.querySelector(".scale-toggle"),
    banded: !!document.querySelector(".band-key"),
    hasGradientBar: !!document.querySelector(".colourbar"),
  }));

  const shader = await page.evaluate(() => {
    const u = window.__scene.volume.material.uniforms;
    const state = window.__store.getState();
    const spec = state.manifest.fields.find((f) => f.key === state.fieldKey);
    return {
      uIsoEnabled: u.uIsoEnabled.value,
      uIsoMirror: u.uIsoMirror.value,
      uLog: u.uLog.value,
      storeScale: state.scale,
      storeIso: state.isoEnabled,
      allowsIso: spec.isosurface !== false,
      render: spec.render ?? "volume",
      range: spec.range,
      palette: spec.palette,
    };
  });

  rows.push({ key, ...shader, iso, scale });
}

// ---- the rules, checked rather than eyeballed -------------------------------------------------
const broken = [];
for (const r of rows) {
  const diverging = r.range[0] < 0 && r.range[1] > 0;
  const volume = r.render === "volume";

  // 1. A Field that forbids an isosurface must not be drawing one.
  if (!r.allowsIso && (r.storeIso || r.uIsoEnabled === 1)) {
    broken.push(`${r.key}: forbids an isosurface and one is still on`);
  }
  // 2. The control is on screen only where it can act.
  if (r.iso.hasCheckbox !== (volume && r.allowsIso)) {
    broken.push(`${r.key}: isosurface checkbox on screen = ${r.iso.hasCheckbox}, should be ${volume && r.allowsIso}`);
  }
  // 3. Both skins on a diverging Field, one on everything else.
  if (r.uIsoMirror !== (diverging ? 1 : 0)) {
    broken.push(`${r.key}: uIsoMirror = ${r.uIsoMirror}, diverging = ${diverging}`);
  }
  // 4. A diverging Field's readout is a magnitude, because two surfaces are drawn.
  if (volume && r.allowsIso && diverging && !(r.iso.readout ?? "").includes("±")) {
    broken.push(`${r.key}: diverging isosurface readout "${r.iso.readout}" has no plus-or-minus`);
  }
  // 5. The log toggle is offered only where the range starts at zero and the palette can bend.
  const span = r.range[1] - r.range[0];
  const shouldLog = r.range[0] >= 0 && !r.scale.banded && span > 0 && r.range[0] <= 0.05 * span;
  if (r.scale.toggleOnScreen !== shouldLog) {
    broken.push(`${r.key}: log toggle on screen = ${r.scale.toggleOnScreen}, should be ${shouldLog}`);
  }
  // 6. A banded Field must never be offered one, whatever its range says.
  if (r.scale.banded && r.scale.toggleOnScreen) {
    broken.push(`${r.key}: banded palette is offering a log scale`);
  }
}

console.log("FIELDS", JSON.stringify(rows, null, 1));
console.log("BROKEN", JSON.stringify(broken, null, 1));
console.log("PROBLEMS", JSON.stringify(problems));

// Every Field in the manifest has to have been reached. A field that threw on its way onto
// screen would otherwise leave a shorter list and six rules that vacuously held.
if (rows.length !== fields.length) {
  broken.push(`measured ${rows.length} Fields of ${fields.length}`);
}
for (const message of problems) broken.push(`console: ${message}`);

await browser.close();

console.log(broken.length ? `\nFAILED: ${broken.length}` : "\nPASS");
process.exit(broken.length ? 1 : 0);
