import { chromium } from "playwright";
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on("pageerror", (e) => console.log("pageerror", e.message));
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
  return {
    centre: proj(f.lon, f.lat, f.depth),
    corners: [proj(f.west, f.south, f.depth), proj(f.east, f.south, f.depth),
              proj(f.west, f.north, f.depth), proj(f.east, f.north, f.depth)],
    boxCorners: [proj(vol.west, vol.south, 5), proj(vol.east, vol.north, 5)],
  };
});
console.log("GEOM", JSON.stringify(geom));
await browser.close();
