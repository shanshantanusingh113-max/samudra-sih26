/**
 * "Show only this body of water" clips the Volume to the Feature the panel is describing.
 *
 * The bug this exists for gave no error at all. `toTexture` references the v axis to the
 * **south** edge, and a clip box written north-referenced mirrors about the region's centre
 * line - so the shader isolated -5.0N to 4.0N for a feature at 12.5N to 20.5N, about 1800 km
 * from the ring pointing at it, and drew a perfectly plausible blob while doing it.
 *
 * So the check is pixels against degrees: project the Feature's own corners into screen space,
 * diff the isolated frame against the same frame with the Volume off, and require the water that
 * survived to sit inside the Feature's own footprint. For a round this wrote the two frames to
 * `shots/`, printed the projection and compared neither, which would have passed the mirrored
 * clip exactly as happily as the right one.
 *
 *   node probe-isolate.mjs        (needs a preview server on 4173)
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { comparePixels, decodePng } from "./probe-pixels.mjs";

const failures = [];
const fail = (message) => { failures.push(message); console.log(`  FAIL ${message}`); };

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on("pageerror", (e) => fail(`pageerror: ${e.message}`));
await page.goto("http://localhost:4173/app.html", { waitUntil: "load", timeout: 60000 });
// Wait for the store rather than for a fixed number of seconds. Under software rendering the
// app can take well over six seconds to have its manifest, and a probe that looks too early
// reports "Cannot read properties of null" - which reads as a broken build and is a slow
// machine. `probe-requirements.mjs` has always done it this way; the rest now do too.
await page.waitForFunction(() => !!window.__store?.getState().manifest, null, { timeout: 120000 });
await page.waitForSelector("button.dive", { timeout: 60000 });
await page.click("button.dive");
await page.waitForTimeout(5000);
await page.evaluate(() => window.__store.getState().selectField("temperature_anomaly"));
await page.waitForTimeout(2000);
const feature = await page.evaluate(() => {
  const s = window.__store.getState();
  const feats = s.features();
  let best = 0;
  feats.forEach((f, i) => { if (f.north > feats[best].north) best = i; });
  window.__store.setState({ selectedAnomaly: best, showFloats: false, showTracks: false,
                            showAnomalies: false, isolateAnomaly: true });
  const f = feats[best];
  return { index: best, lat: f.lat, lon: f.lon, south: f.south, north: f.north, west: f.west, east: f.east, depth: f.depth };
});
console.log("FEATURE", JSON.stringify(feature));
await page.waitForTimeout(3000);
await page.screenshot({ path: "shots/m-water.png", timeout: 180000 });
await page.evaluate(() => window.__store.setState({ volumeEnabled: false }));
await page.waitForTimeout(2500);
await page.screenshot({ path: "shots/m-empty.png", timeout: 180000 });

// Where the feature's own corners land on screen, so the pixels can be checked against degrees.
const geom = await page.evaluate(() => {
  const scene = window.__scene;
  const s = window.__store.getState();
  const f = s.features()[s.selectedAnomaly];
  const canvas = scene.renderer.domElement;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const V = scene.camera.position.constructor;
  const un = scene.volume.material.uniforms;
  const bmin = un.uBoxMin.value, bmax = un.uBoxMax.value;
  const vol = scene.manifest.volume;
  const yFor = (metres) => {
    // linear along the sampled axis, same inversion the scene uses
    const ax = vol.depthAxisMetres;
    let i = 0; while (i < ax.length - 2 && ax[i + 1] < metres) i++;
    const t = (metres - ax[i]) / (ax[i + 1] - ax[i]);
    const frac = (i + t) / (ax.length - 1);
    return bmax.y + frac * (bmin.y - bmax.y);
  };
  const proj = (lon, lat, metres) => {
    const v = new V(lon, yFor(metres), -lat).project(scene.camera);
    return [Math.round((v.x * 0.5 + 0.5) * w), Math.round((-v.y * 0.5 + 0.5) * h)];
  };
  // The band of canvas with no panel over it. Measured, not guessed: the right-hand Anomaly
  // panel fades in on a CSS reveal, so a frame pair taken around it differs by the whole panel -
  // 83% of the differing pixels in the first run of this check, none of them water.
  const rect = (sel) => document.querySelector(sel)?.getBoundingClientRect() ?? null;
  const left = rect(".panel-left");
  const right = rect(".panel-right");
  return {
    centre: proj(f.lon, f.lat, f.depth),
    corners: [proj(f.west, f.south, f.depth), proj(f.east, f.south, f.depth),
              proj(f.west, f.north, f.depth), proj(f.east, f.north, f.depth)],
    boxCorners: [proj(vol.west, vol.south, 5), proj(vol.east, vol.north, 5)],
    band: [Math.ceil(left ? left.right : 0) + 8, Math.floor(right ? right.left : w) - 8],
  };
});
console.log("GEOM", JSON.stringify(geom));

// ---- the clip box, in degrees, against the Feature's own box ---------------------------------
//
// The pixel check below proves water is drawn near the ring. It cannot prove the box is *right*,
// because this camera looks almost edge-on and 35 degrees of latitude compress into about 3 px a
// degree - the north-referenced bug moved this feature by 8 degrees, which is 27 px on screen and
// would slide under any pixel tolerance worth setting. So read the uniform the shader actually
// clips with, convert it back to degrees, and compare it with the Feature. That catches the
// mirror by construction, whatever the camera is doing.
const clip = await page.evaluate(() => {
  const un = window.__scene.volume.material.uniforms;
  const vol = window.__scene.manifest.volume;
  const s = window.__store.getState();
  const f = s.features()[s.selectedAnomaly];
  const min = un.uFocusMin.value;
  const max = un.uFocusMax.value;
  const spanLon = vol.east - vol.west;
  const spanLat = vol.north - vol.south;
  return {
    strength: un.uFocusStrength.value,
    box: {
      west: vol.west + min.x * spanLon,
      east: vol.west + max.x * spanLon,
      south: vol.south + min.y * spanLat,
      north: vol.south + max.y * spanLat,
    },
    feature: { west: f.west, east: f.east, south: f.south, north: f.north },
    region: { west: vol.west, east: vol.east, south: vol.south, north: vol.north },
    halfCell: {
      lon: spanLon / Math.max(vol.width - 1, 1) / 2,
      lat: spanLat / Math.max(vol.height - 1, 1) / 2,
    },
  };
});
console.log("CLIP", JSON.stringify(clip));

if (clip.strength !== 1) {
  fail(`uFocusStrength is ${clip.strength}, so the shader is not clipping at all`);
}
// The box is grown by half a cell and then clamped to the region, so an edge that sits on the
// region's own boundary is allowed to have been cut back.
for (const [edge, sign] of [["west", -1], ["east", 1], ["south", -1], ["north", 1]]) {
  const want = clip.feature[edge] + sign * (edge === "west" || edge === "east"
    ? clip.halfCell.lon : clip.halfCell.lat);
  const got = clip.box[edge];
  const clamped = Math.abs(got - clip.region[edge]) < 1e-6;
  const off = Math.abs(got - want);
  if (off > 0.01 && !clamped) {
    fail(`the clip's ${edge} edge is ${got.toFixed(2)} and the feature's is ${want.toFixed(2)}, ${off.toFixed(2)} degrees out`);
  }
}

// ---- the water that survived the clip is the water the Feature describes ---------------------
//
// Diff the isolated frame against the volume-off frame: every pixel that differs is water the
// clip kept. Its bounding box has to sit inside the Feature's own projected footprint, with a
// margin for the ray marcher's soft edge and the ring drawn around it.
const water = decodePng(readFileSync("shots/m-water.png"));
const empty = decodePng(readFileSync("shots/m-empty.png"));
const diff = comparePixels(water, empty);
console.log("CLIPPED", JSON.stringify({ ...diff, share: Number(diff.share.toFixed(5)) }));

if (diff.count === 0) {
  fail("isolating the feature drew no water at all");
} else {
  // Only the band with no panel over it, and the **centroid** rather than the bounding box:
  // the box frame is drawn in both frames but antialiases differently, so a handful of edge
  // pixels stretch a bbox across the whole canvas while moving a centroid barely at all.
  const [x0, x1] = geom.band;
  let sx = 0, sy = 0, n = 0;
  for (let y = 0; y < water.height; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * water.width + x;
      const a = i * water.channels;
      const b = i * empty.channels;
      const d =
        Math.abs(water.data[a] - empty.data[b]) +
        Math.abs(water.data[a + 1] - empty.data[b + 1]) +
        Math.abs(water.data[a + 2] - empty.data[b + 2]);
      if (d > 30) { sx += x; sy += y; n++; }
    }
  }
  const xs = geom.corners.map((c) => c[0]);
  const ys = geom.corners.map((c) => c[1]);
  const want = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  const drawn = [sx / n, sy / n];
  const off = Math.round(Math.hypot(drawn[0] - want[0], drawn[1] - want[1]));
  console.log(
    "WATER",
    JSON.stringify({
      band: geom.band,
      pixels: n,
      drawn: drawn.map(Math.round),
      want: want.map(Math.round),
      offsetPx: off,
    }),
  );

  if (n < 2000) {
    fail(`only ${n} pixels of water survived the clip, which is not a body of water`);
  }
  // Generous on purpose. What this has to catch is a clip in the wrong *place* - the
  // north-referenced box put it about 1800 km from its own feature, most of the block away -
  // not one off by a few pixels of soft edge.
  const SLACK = 260;
  if (off > SLACK) {
    fail(`the isolated water sits ${off} px from the feature it claims to be, over the ${SLACK} px slack`);
  }
}

await browser.close();

console.log(failures.length ? `\nFAILED: ${failures.length}` : "\nPASS");
process.exit(failures.length ? 1 : 0);
