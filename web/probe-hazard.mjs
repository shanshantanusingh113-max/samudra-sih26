/**
 * Measures the three new render types instead of looking at them.
 *
 * Every bad bug in this project looked like a shader bug and was not, so a sheet that "seems to
 * be there" is not evidence. For each Field this counts the pixels that change when the Field's
 * own geometry is switched off, and projects a known grid node to check the sheet is where the
 * data says it should be.
 *
 *   node probe-hazard.mjs        (needs a preview server on 4173)
 */
import { chromium } from "playwright";
import { comparePixels, decodePng } from "./probe-pixels.mjs";

/** Which preview server to drive. `npx vite preview` defaults to 4173. */
const SERVER = process.env.PREVIEW_URL ?? "http://localhost:4173";

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
const problems = [];
page.on("console", (m) => m.type() === "error" && problems.push(m.text()));
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));

await page.goto(`${SERVER}/app.html`, { waitUntil: "load", timeout: 60000 });
// Wait for the store rather than for a fixed number of seconds. Under software rendering the app
// can take well over six seconds to have its manifest, and a probe that looks too early reports
// "Cannot read properties of null" - which reads as a broken build and is a slow machine.
await page.waitForFunction(() => !!window.__store?.getState().manifest, null, { timeout: 120000 });
await page.waitForSelector("button.dive", { timeout: 60000 });

const fields = await page.evaluate(() =>
  window.__store.getState().manifest.fields.map((f) => [f.key, f.render, f.group, f.range]),
);
console.log("FIELDS", JSON.stringify(fields));

await page.click("button.dive");
await page.waitForTimeout(5000);
await page.evaluate(() =>
  window.__store.setState({ showFloats: false, showTracks: false, showAnomalies: false }),
);

/**
 * Never change the store between a paired frame and its partner.
 *
 * `updateArrows` sets `arrows.visible = true` on every `push(state)`, and `updateSheet` does the
 * same for the sheet, so *any* store change between the "on" shot and the "off" shot silently
 * turns the geometry back on and the two frames come out identical. That reads as "this Field
 * draws nothing", which is the exact conclusion this file exists to prevent, arrived at from the
 * other direction. It cost a wrong measurement once: the current arrows were reported as
 * invisible under the water at 0.007% of the frame, and correctly paired they are 0.54%.
 *
 * The render loop is continuous, so moving `visible` alone is enough - no store change is needed
 * to make the next frame show it.
 */

/**
 * How many **pixels** differ between two frames.
 *
 * This counted differing bytes of two compressed PNGs, which `CLAUDE.md` forbids for a
 * magnitude in its own words: a PNG is a zlib stream, so a handful of changed pixels shifts
 * every byte after them and the same frame pair reads as "99.4% different" or "0.5% different"
 * depending only on which was counted. It was only ever asked "did anything change at all", so
 * it was not wrong - and `probe-pixels.mjs` exists to make obeying the rule free.
 */
function changed(one, two) {
  const pixels = comparePixels(decodePng(one), decodePng(two));
  return { differing: pixels.count, of: pixels.total, share: pixels.share };
}

// ---- the isosurface flag does not leak onto a Field that refuses one -------------------------
//
// The control correctly disappears for a Field declaring `isosurface: false`, and for a while
// that was all that happened: the shader kept drawing the surface with nothing on screen to turn
// it off. There is no TS test harness, so this is the honest equivalent - turn it on somewhere
// it is allowed, switch to each Field that forbids it, and read the uniform the shader uses.
const isoLeak = [];
for (const [key, , , ] of fields) {
  await page.evaluate(() => {
    window.__store.getState().selectField("temperature");
    window.__store.setState({ isoEnabled: true });
  });
  await page.waitForTimeout(400);
  const before = await page.evaluate(() => window.__scene.volume.material.uniforms.uIsoEnabled.value);
  await page.evaluate((k) => window.__store.getState().selectField(k), key);
  await page.waitForTimeout(900);
  isoLeak.push(
    await page.evaluate(
      ({ k, before }) => ({
        key: k,
        allowed: window.__store.getState().manifest.fields.find((f) => f.key === k).isosurface,
        wasOn: before,
        stateIsoEnabled: window.__store.getState().isoEnabled,
        uIsoEnabled: window.__scene.volume.material.uniforms.uIsoEnabled.value,
      }),
      { k: key, before },
    ),
  );
}
console.log("ISOLEAK", JSON.stringify(isoLeak));
const leaked = isoLeak
  .filter((row) => row.allowed === false && (row.stateIsoEnabled || row.uIsoEnabled === 1))
  .map((row) => row.key);
console.log("ISOLEAK_OK", JSON.stringify(leaked));
for (const key of leaked) {
  problems.push(`${key} forbids an isosurface and the shader is still drawing one`);
}

const results = [];
for (const [key, render] of fields) {
  if (render === "volume") continue;
  await page.evaluate((k) => window.__store.getState().selectField(k), key);
  // The vector Field has two styles and this row is about the arrows, which are the geometry
  // this loop counts vertices of. The default became moving dots, so without this the row
  // reported `arrowVertices: 0` and a `share` that was the animation moving between the two
  // frames rather than the layer being drawn - a measurement of nothing, printed as a number.
  if (render === "vector") {
    await page.evaluate(() => window.__store.setState({ currentStyle: "arrows" }));
  }
  await page.waitForTimeout(2500);

  const on = await page.screenshot({ timeout: 180000 });
  // Turn the Field's own geometry off, whatever kind it is, and take the same frame again.
  await page.evaluate(() => {
    const scene = window.__scene;
    if (scene.fieldSheet) scene.fieldSheet.visible = false;
    if (scene.arrows) scene.arrows.visible = false;
    if (scene.particleLines) scene.particleLines.visible = false;
  });
  await page.waitForTimeout(1200);
  const off = await page.screenshot({ timeout: 180000 });

  // Triangle count and the softness of the coast, both as numbers.
  //
  // The Sheet and the Drape are built on a 56 x 36 Grid - about 110 km a cell - and read as
  // tiling under a full-resolution coastline. `smoothSurface` upsamples the lattice 4x on the
  // values before anything is coloured, so the count here is the smoothing made visible; and a
  // corner's alpha is now the share of its source cells that held water rather than a quad
  // either drawn or dropped, so `rampedVertices` is the coast that used to be a cliff.
  const geometry = await page.evaluate(() => {
    const scene = window.__scene;
    const tint = scene.fieldSheet?.geometry.getAttribute("tint");
    let ramped = 0;
    let opaque = 0;
    for (let i = 0; tint && i < tint.count; i++) {
      const alpha = tint.getW(i);
      if (alpha > 0.001 && alpha < 0.999) ramped++;
      else if (alpha >= 0.999) opaque++;
    }
    return {
      sheetVertices: scene.fieldSheet?.geometry.getAttribute("lonLat")?.count ?? 0,
      sheetTriangles: (scene.fieldSheet?.geometry.getIndex()?.count ?? 0) / 3,
      rampedVertices: ramped,
      opaqueVertices: opaque,
      arrowVertices: scene.arrows?.geometry.getAttribute("lonLat")?.count ?? 0,
    };
  });

  results.push({ key, render, ...changed(on, off), ...geometry });
  await page.evaluate(() => {
    const scene = window.__scene;
    if (scene.fieldSheet) scene.fieldSheet.visible = true;
    if (scene.arrows) scene.arrows.visible = true;
    if (scene.particleLines) scene.particleLines.visible = true;
  });
}
console.log("RENDER", JSON.stringify(results, null, 1));

// A vector Field that builds no arrow geometry is a layer that is not drawn, and it is exactly
// the failure the default style change could have caused silently.
for (const row of results) {
  if (row.render === "vector" && row.arrowVertices === 0) {
    problems.push(`${row.key} drew no arrows at all: arrowVertices is 0`);
  }
}

// ---- the sheet sits where the data says -----------------------------------------------------
await page.evaluate(() => window.__store.getState().selectField("d26"));
await page.waitForTimeout(2500);
const sheet = await page.evaluate(() => {
  const scene = window.__scene;
  const state = window.__store.getState();
  const surface = state.surfaces[`d26|${state.timestepIndex}`];
  const volume = scene.manifest.volume;
  const lonLat = scene.fieldSheet.geometry.getAttribute("lonLat");
  const depthY = scene.fieldSheet.geometry.getAttribute("depthY");

  // The mesh is no longer the file.
  //
  // `smoothSurface` upsamples the lattice before the mesh is built, so a file index and a vertex
  // index stopped being the same number - and this check went on reading `depthY` at the file's
  // index and reported 5 m and 115 m landing 0.04 units apart, which is a sheet that is not
  // there. The mesh is (width-1)*factor+1 across and a source node (row, column) sits at
  // (row*factor, column*factor) in it, so the two are still tied exactly; they just have to be
  // tied on purpose. Same class of failure this file exists to catch, caught in this file.
  const factor = (lonLat.count === surface.width * surface.height)
    ? 1
    : Math.round((meshWidth(lonLat.count, surface) - 1) / (surface.width - 1));
  const outWidth = (surface.width - 1) * factor + 1;
  const vertexOf = (index) => {
    const row = Math.floor(index / surface.width);
    const column = index % surface.width;
    return row * factor * outWidth + column * factor;
  };

  // Pick the deepest and shallowest real values in the file, and check the vertex the sheet put
  // there is deeper / shallower in world space by the same ordering.
  let deepest = -1;
  let shallowest = -1;
  for (let i = 0; i < surface.values.length; i++) {
    const v = surface.values[i];
    if (!Number.isFinite(v)) continue;
    if (deepest < 0 || v > surface.values[deepest]) deepest = i;
    if (shallowest < 0 || v < surface.values[shallowest]) shallowest = i;
  }
  const deepVertex = vertexOf(deepest);
  const shallowVertex = vertexOf(shallowest);
  return {
    factor,
    meshVertices: lonLat.count,
    fileCells: surface.width * surface.height,
    deepestMetres: surface.values[deepest],
    deepestY: depthY.getX(deepVertex),
    deepestAt: [lonLat.getX(deepVertex), lonLat.getY(deepVertex)],
    shallowestMetres: surface.values[shallowest],
    shallowestY: depthY.getX(shallowVertex),
    shallowestAt: [lonLat.getX(shallowVertex), lonLat.getY(shallowVertex)],
    // The upsample must not move a source node. If it did, every depth read off the sheet would
    // be read at the wrong place, which is the one failure a smoothing pass can hide.
    deepestSourceLon:
      volume.west +
      ((deepest % surface.width) * (volume.east - volume.west)) / (surface.width - 1),
    boxTop: 0,
    boxBottom: -scene.debug().volumeScale[1],
    west: volume.west,
    east: volume.east,
  };

  function meshWidth(count, source) {
    // The mesh is a rectangle whose aspect matches the file's, so its width falls out of both.
    return Math.round(Math.sqrt((count * (source.width - 1)) / (source.height - 1))) + 1;
  }
});
console.log("SHEET", JSON.stringify(sheet));

// What the mesh would have been without the upsample, computed from the same file: a quad per
// source cell with four finite corners. The ratio against `sheetTriangles` above is the whole of
// item 3's first fix, as a number.
const unsmoothed = await page.evaluate(() => {
  const state = window.__store.getState();
  const surface = state.surfaces[`d26|${state.timestepIndex}`];
  const { width, height, values } = surface;
  let quads = 0;
  for (let row = 0; row < height - 1; row++) {
    for (let column = 0; column < width - 1; column++) {
      const a = row * width + column;
      const ok =
        Number.isFinite(values[a]) &&
        Number.isFinite(values[a + 1]) &&
        Number.isFinite(values[a + width]) &&
        Number.isFinite(values[a + width + 1]);
      if (ok) quads++;
    }
  }
  return { fileCells: width * height, quadsWithFourCorners: quads, trianglesBefore: quads * 2 };
});
console.log("UNSMOOTHED", JSON.stringify(unsmoothed));

// ---- currents: the speed under the cursor ---------------------------------------------------
await page.evaluate(() => {
  window.__store.getState().selectField("current_speed");
  // Arrows, because `arrowVertices` below is a claim about the arrows.
  window.__store.setState({ currentStyle: "arrows" });
});
await page.waitForTimeout(3000);
const currents = await page.evaluate(() => {
  const scene = window.__scene;
  const state = window.__store.getState();
  const vectors = state.vectors[state.timestepIndex];
  if (!vectors) return { error: "no vectors loaded" };

  // The fastest surface water in the file, and where. Read straight out of the Grid, which is
  // the whole claim: the arrows are not a picture.
  const { width, height, values } = vectors;
  const volume = scene.manifest.volume;
  let best = 0;
  let bestSpeed = -1;
  for (let i = 0; i < width * height; i++) {
    const u = values[i * 2];
    const v = values[i * 2 + 1];
    const speed = Math.hypot(u, v);
    if (Number.isFinite(speed) && speed > bestSpeed) {
      bestSpeed = speed;
      best = i;
    }
  }
  const row = Math.floor(best / width);
  const column = best % width;
  return {
    fastest: bestSpeed,
    lat: volume.south + (row * (volume.north - volume.south)) / (height - 1),
    lon: volume.west + (column * (volume.east - volume.west)) / (width - 1),
    arrowVertices: scene.arrows.geometry.getAttribute("lonLat").count,
  };
});
console.log("CURRENTS", JSON.stringify(currents));

// The speed under the cursor, aimed at the fastest arrow in the block. Asked of the scene
// directly as well as through a real mouse move, because the first is the measurement and the
// second is the wiring, and they fail for completely different reasons.
const box = await page.locator("canvas").boundingBox();
const aimed = await page.evaluate(
  ({ lon, lat }) => {
    const scene = window.__scene;
    const at = scene.projectPoint(lon, 0, -lat);
    return { at, picked: scene.pickCurrent(at.x, at.y) };
  },
  { lon: currents.lon, lat: currents.lat },
);
await page.mouse.move(box.x + aimed.at.x, box.y + aimed.at.y);
await page.waitForTimeout(600);
console.log(
  "CURSOR",
  JSON.stringify({
    picked: aimed.picked,
    stored: await page.evaluate(() => window.__store.getState().hoverCurrent),
  }),
);

// ---- the log scale bends the water and the bar together --------------------------------------
//
// The bar has to be **on screen** to be measured. This read `.colourbar` with the Colourbar
// group shut, got null every time, printed `"barStops": null` and asserted nothing - under a
// heading claiming to check the one thing that got this feature cut the first time round.
// Open the Colourbar group and let React put it on screen before anything is measured off it.
await page.evaluate(() =>
  window.__store.setState((s) => ({ openGroups: { ...s.openGroups, palette: true } })),
);
await page.waitForTimeout(1200);
const scaleCheck = await page.evaluate(() => {
  const before = window.__scene.volume.material.uniforms.uLog.value;
  const barBefore = document.querySelector(".colourbar")?.style.background ?? null;
  window.__store.getState().set("scale", "log");
  return { before, barBefore };
});
await page.waitForTimeout(1500);
const scale = {
  ...scaleCheck,
  after: await page.evaluate(() => window.__scene.volume.material.uniforms.uLog.value),
  barAfter: await page.evaluate(
    () => document.querySelector(".colourbar")?.style.background ?? null,
  ),
};
console.log(
  "SCALE",
  JSON.stringify({
    before: scale.before,
    after: scale.after,
    barChanged: scale.barBefore !== null && scale.barBefore !== scale.barAfter,
    barStops: (scale.barAfter ?? "").slice(0, 120),
  }),
);
if (scale.before !== 0 || scale.after !== 1) {
  problems.push(`uLog went ${scale.before} -> ${scale.after}, not 0 -> 1`);
}
if (scale.barAfter === null) {
  problems.push("the colourbar is not on screen, so the bar could not be measured at all");
} else if (scale.barBefore === scale.barAfter) {
  problems.push("the shader bent and the colourbar beside it did not: one curve, two answers");
}

console.log("PROBLEMS", JSON.stringify(problems));
await browser.close();

console.log(problems.length ? `\nFAILED: ${problems.length}` : "\nPASS");
process.exit(problems.length ? 1 : 0);
