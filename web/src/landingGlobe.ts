/**
 * The hero sphere: a real WebGL globe in the landing hero.
 *
 * Progressive enhancement, not a replacement:
 *  - The CSS gradient circle (`.sphere` in index.html) paints instantly with zero JS and no
 *    WebGL, so a browser with either unavailable is left with a sphere and nothing broken.
 *  - This module then mounts a Three.js canvas over it and crossfades in once WebGL has
 *    actually produced a frame. `three` is dynamic-imported only once the hero has been
 *    idle-painted and the sphere is on screen, so the landing page's first paint never waits
 *    on the ~130 KB WebGL chunk.
 *
 * What it draws, and why it is not the screenshot-textured ball it replaced:
 *  - The sphere used to wear `globe.jpg`, the same static render the gallery shows, scaled
 *    over a ball with a blob of material at its centre - a picture, not a globe. This one is
 *    built from the same data the full application is built from: the world coastline set
 *    (`coastlines.json`, 1,429 Natural Earth rings - the dataset the app's own globe draws)
 *    is projected onto a unit sphere from each vertex's own (lon, lat), exactly like the
 *    app's `earthShader.ts`, so turning it reveals real continents and ocean, not a baked
 *    image. `manifest.json` supplies the study region, which glows faintly so the sphere says
 *    where the product works. Both fetch from the same deployment, so the zero-external-request
 *    rule still holds.
 *  - The ocean is a per-pixel shaded sphere lit by one fixed sun, one palette per theme.
 *  - Two theme palettes swap with `data-theme` the way `OceanScene.setTheme` does, because the
 *    world is drawn by us and cannot be themed in CSS. The current theme is mirrored onto the
 *    canvas as `data-globe-theme` for `probe-landing.mjs` to read.
 *
 * The globe carries two meshes under two nested groups:
 *  - An ocean sphere: lit in a fragment shader by a fixed directional light (so the lit limb
 *    stays put on screen while the globe turns, like a real sun), deepened to abyssal navy at
 *    the terminator, with a fresnel rim.
 *  - Ring-shaped coastline line segments lifted just above it, every ring closed, coloured per
 *    theme with the app's own coast colours.
 *
 * The groups split the two ways the globe turns so neither fights the other:
 *  - `spin` is what the viewer turns. It carries yaw and pitch directly, and it is the only
 *    thing a drag writes to, so grabbing the planet and turning it is never competing with
 *    anything else. A released drag keeps a little inertia, and once that has died the idle
 *    drift resumes - unless the viewer asked for reduced motion, in which case the globe only
 *    moves when they move it.
 *  - `lean` is the cursor-parallax tilt toward wherever the pointer is; it lives above `spin`
 *    so the two compose instead of overwriting each other.
 */
// Type-only import: erased at build time. The real `three` module is fetched lazily below.
import type * as ThreeTypes from "three";
// The same colour functions the app's colourbar and its non-Volume Fields use, so a pixel of
// the region fill and the app's own sea-surface sheet can never disagree about what a degC is.
import { colourOf, liftedPalette } from "./palette";

const canvas = document.getElementById("globeCanvas") as HTMLCanvasElement | null;
const wrap = document.getElementById("sphereWrap") as HTMLDivElement | null;
const fallback = document.getElementById("sphereFallback") as HTMLDivElement | null;

/**
 * Wait until the browser is idle before pulling in three.js. `requestIdleCallback` with a
 * window-load fallback for Safari.
 */
function whenIdle(fn: () => void) {
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback;
  if (ric) ric(fn);
  else window.addEventListener("load", () => setTimeout(fn, 200));
}

/** A globe that never stops spinning is a moving element to someone who asked for none. */
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The drag's pitch is clamped so the planet cannot be flipped over its poles; a fully
 * inverted globe reads as a bug rather than freedom. 1.25 rad is about 72 degrees.
 */
const clamp = (v: number) => Math.max(-1.25, Math.min(1.25, v));

if (canvas && wrap) {
  whenIdle(() => {
    void mountGlobe();
  });
}

type Continent = number[][];

/** World coastlines as `number[][][]` of [lon, lat] rings, the study region in degrees, and the
 * near-surface temperature Grid the region is filled with. The fill is what the product
 * visualises - the model's own analysis at the surface, coloured by the same functions the
 * platform's colourbar uses - so the globe's centre shows real data, not a flat box. */
async function fetchGlobeData(): Promise<{
  lines: Continent[];
  region: [number, number, number, number];
  fieldPlane: Float32Array | null;
  fieldWidth: number;
  fieldHeight: number;
  fieldRange: [number, number];
  thermal: number[][] | null;
}> {
  const [data, manifest] = await Promise.all([
    fetch("./data/coastlines.json").then((r) => r.json()),
    fetch("./data/manifest.json").then((r) => r.json()),
  ]);
  const v = manifest?.volume;
  const region: [number, number, number, number] = v
    ? [Number(v.west), Number(v.east), Number(v.south), Number(v.north)]
    : [45.5, 100.5, -9.5, 25.5];

  // The region box is filled from the temperature Grid of the newest Timestep, matching the
  // analysis the app would open on. Level 0 is the 5 m surface (volume.surfaceMetres), and the
  // Grid file is C-order [level][lat][lon] with the southernmost row first, exactly as the
  // hazards and currents are shipped.
  let fieldPlane: Float32Array | null = null;
  let fieldWidth = v ? Number(v.width) : 56;
  let fieldHeight = v ? Number(v.height) : 36;
  let fieldRange: [number, number] = [2.604, 30.001];
  const spec = (manifest?.fields ?? []).find((f: { key: string }) => f?.key === "temperature");
  if (spec?.range) fieldRange = [Number(spec.range[0]), Number(spec.range[1])];
  const tempPaths = manifest?.gridFiles?.temperature as string[] | undefined;
  const thermal = (manifest?.palettes?.thermal as number[][] | undefined) ?? null;
  if (v && tempPaths?.length && thermal) {
    try {
      const res = await fetch(`./data/${tempPaths[tempPaths.length - 1]}`);
      if (res.ok) {
        const buffer = await res.arrayBuffer();
        // the native Grid carries the model's own 24 levels (volume.levelMetres), not the 48
        // depth-warped slabs - the same count the app's section passes to loadNativeGrid
        const levels = (v.levelMetres ?? []).length || 24;
        const bytes = fieldWidth * fieldHeight * levels * 4;
        if (buffer.byteLength === bytes) {
          fieldPlane = new Float32Array(buffer).slice(0, fieldWidth * fieldHeight);
        }
      }
    } catch {
      // no fill without the Grid; the coral glowing region alone is still a good globe
    }
  }
  return { lines: data as Continent[], region, fieldPlane, fieldWidth, fieldHeight, fieldRange, thermal };
}

async function mountGlobe() {
  const THREE = await import("three");
  if (!canvas || !wrap) return;
  let renderer: ThreeTypes.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    renderer = null as unknown as ThreeTypes.WebGLRenderer;
  }

  if (renderer) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 10);
    camera.position.set(0, 0, 3.1);

    const group = new THREE.Group();
    scene.add(group);

    // `spin` is what a drag turns; `group` above it holds the fixed entrance scale and the
    // cursor-parallax lean, so clicking and spinning the planet never fights the tilt.
    const spin = new THREE.Group();
    group.add(spin);

    // ---- theme palettes, mirroring the app's own SCENE_COLOURS ----
    const themes = {
      dark: {
        sky: new THREE.Color(0x9fd7ec),
        sea: new THREE.Color(0x2f76a8),
        deep: new THREE.Color(0x06172a),
        fresnel: new THREE.Color(0xdff2fb),
        rim: new THREE.Color(0x3fb0de),
        region: new THREE.Color(0xff9a5c),
        coast: new THREE.Color(0x7fd4f5),
        rimStrength: 0.4,
        coastOpacity: 0.8,
        regionStrength: 0.34,
        fieldStrength: 0.9,
      },
      light: {
        sky: new THREE.Color(0xeaf8fd),
        sea: new THREE.Color(0x8fc7e0),
        deep: new THREE.Color(0x2a6e97),
        fresnel: new THREE.Color(0xffffff),
        rim: new THREE.Color(0x9fd9ec),
        region: new THREE.Color(0xef8a4c),
        coast: new THREE.Color(0x0e9bb4),
        rimStrength: 0.26,
        coastOpacity: 1,
        regionStrength: 0.14,
        fieldStrength: 0.82,
      },
    } as const;

    const isLightTheme = () => document.documentElement.getAttribute("data-theme") === "light";

    // ---- ocean sphere: shaded per pixel by one fixed sun ----
    const oceanUniforms = {
      uTime: { value: 0 },
      uLight: { value: new THREE.Vector3(0.5, 0.55, 0.7).normalize() },
      uSky: { value: themes.dark.sky.clone() },
      uSea: { value: themes.dark.sea.clone() },
      uDeep: { value: themes.dark.deep.clone() },
      uFresnel: { value: themes.dark.fresnel.clone() },
      uRim: { value: themes.dark.rim.clone() },
      uRimStrength: { value: themes.dark.rimStrength as number },
      uRegion: { value: new THREE.Vector4(45.5, 100.5, -9.5, 25.5) },
      uRegionStrength: { value: themes.dark.regionStrength as number },
      uRegionTint: { value: themes.dark.region.clone() },
      // the sea-surface temperature from the deployment, coloured per theme by the app's own
      // palette functions; null until the Grid has loaded
      uFieldTex: { value: null as unknown as ThreeTypes.DataTexture },
      uFieldStrength: { value: themes.dark.fieldStrength as number },
    };
    const oceanMaterial = new THREE.ShaderMaterial({
      uniforms: oceanUniforms,
      vertexShader: /* glsl */ `
        varying vec3 vObjDir;
        varying vec3 vWorldPos;
        void main() {
          // planet-local direction is normalize(position), not the normal attribute - the two
          // drift apart on some GPU/driver paths and the region box and coast placement follow
          // position exactly, so this is what lat/lon get built from
          vObjDir = normalize(position);
          vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vObjDir;
        varying vec3 vWorldPos;
        uniform float uTime;
        uniform vec3 uLight;
        uniform vec3 uSky;
        uniform vec3 uSea;
        uniform vec3 uDeep;
        uniform vec3 uFresnel;
        uniform vec3 uRim;
        uniform float uRimStrength;
        uniform vec4 uRegion;
        uniform float uRegionStrength;
        uniform vec3 uRegionTint;
        uniform sampler2D uFieldTex;
        uniform float uFieldStrength;

        const float PI = 3.141592653589793;

        void main() {
          // planet-local direction already carries which spot this pixel is on, after any user
          // drag, and is exact - it is built from the vertex position in the vertex shader
          vec3 dir = normalize(vObjDir);
          // the globe is a unit sphere centred at the origin, so the world-space direction of
          // the surface point *is* the world-space normal; no normal attribute needed
          vec3 worldN = normalize(vWorldPos);
          vec3 viewDir = normalize(cameraPosition - vWorldPos);

          // one fixed sun in world space, so the lit limb stays put while the globe turns
          float t = dot(worldN, uLight) * 0.5 + 0.5;
          t += sin(uTime * 0.05) * 0.02;
          vec3 col = mix(uDeep, uSea, smoothstep(0.18, 0.52, t));
          col = mix(col, uSky, smoothstep(0.55, 0.95, t));

          float fresnel = pow(1.0 - max(dot(worldN, viewDir), 0.0), 3.0);
          col = mix(col, uFresnel, fresnel * 0.30);
          col += uRim * fresnel * uRimStrength;

          // the study region, from the same manifest the platform reads. Built from the
          // planet-local direction, so the highlight rotates with the globe instead of staying
          // pinned to the screen.
          float lat = asin(clamp(dir.y, -1.0, 1.0)) * 180.0 / PI;
          float lon = atan(dir.x, dir.z) * 180.0 / PI;
          float inset = min(min(lon - uRegion.x, uRegion.y - lon), min(lat - uRegion.z, uRegion.w - lat));
          float regionMask = smoothstep(0.0, 1.6, inset);
          col = mix(col, uRegionTint, regionMask * uRegionStrength);

          // the built-in field fill: the sea-surface temperature at the same [lat, lon] the
          // region box spans, sampled from the per-theme colour texture. The revealed band is a
          // fraction of a degree wide and the interior is opaque in the lit part of the sphere,
          // which keeps the fill reading as a map on the planet instead of a pasted-on square.
          vec2 fieldUv = vec2(
            (lon - uRegion.x) / (uRegion.y - uRegion.x),
            (lat - uRegion.z) / (uRegion.w - uRegion.z)
          );
          vec4 fieldSample = texture2D(uFieldTex, fieldUv);
          float lit = smoothstep(0.05, 0.9, t);
          vec3 fieldCol = fieldSample.rgb * (0.35 + 0.65 * lit);
          float reveal = fieldSample.a * smoothstep(0.0, 0.5, inset);
          col = mix(col, fieldCol, reveal * uFieldStrength);

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const ocean = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 96), oceanMaterial);
    spin.add(ocean);

    // ---- the region fill's sea-surface temperature, one colour texture per theme ----
    // Built from the native Grid's level 0 (the 5 m surface) through the app's own colour
    // functions, so the globe's box and the platform's sheet read the same numbers. Row 0 of
    // the Grid is the southern edge. This texture is sampled with flipY = false, which a
    // rendered check confirmed samples data row 0 at v = 0, and the shader's v = 0 is the south
    // edge of the box, so the Grid rows are written in their own order with no reversal.
    let fieldPlane: Float32Array | null = null;
    let fieldWidth = 56;
    let fieldHeight = 36;
    let fieldRange: [number, number] = [2.604, 30.001];
    let fieldThermal: number[][] | null = null;
    const fieldTextures: { dark?: ThreeTypes.DataTexture; light?: ThreeTypes.DataTexture } = {};
    const ensureFieldTexture = (_theme: "dark" | "light"): ThreeTypes.DataTexture | null => {
      if (!fieldPlane || !fieldThermal) return null;
      if (fieldTextures[_theme]) return fieldTextures[_theme];
      const lifted = liftedPalette(fieldThermal, _theme);
      const pixels = new Uint8Array(fieldWidth * fieldHeight * 4);
      const spec = { range: fieldRange } as Parameters<typeof colourOf>[1];
      for (let row = 0; row < fieldHeight; row++) {
        const latIndex = row * fieldWidth;
        for (let col = 0; col < fieldWidth; col++) {
          const value = fieldPlane[latIndex + col] ?? NaN;
          const colour = colourOf(value, spec, 0, 1, "linear", lifted);
          const at = (row * fieldWidth + col) * 4;
          if (colour) {
            pixels[at] = colour[0];
            pixels[at + 1] = colour[1];
            pixels[at + 2] = colour[2];
            pixels[at + 3] = 255;
          } else {
            pixels[at + 3] = 0;
          }
        }
      }
      const tex = new THREE.DataTexture(pixels, fieldWidth, fieldHeight, THREE.RGBAFormat, THREE.UnsignedByteType);
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.flipY = false;
      tex.needsUpdate = true;
      fieldTextures[_theme] = tex;
      return tex;
    };

    // ---- world coastlines from Natural Earth, projected from each vertex's own lon/lat ----
    const coastUniforms = {
      uColour: { value: themes.dark.coast.clone() },
      uOpacity: { value: themes.dark.coastOpacity as number },
    };
    const coastMaterial = new THREE.ShaderMaterial({
      uniforms: coastUniforms,
      vertexShader: /* glsl */ `
        void main() {
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position * 1.004, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColour;
        uniform float uOpacity;
        void main() {
          gl_FragColor = vec4(uColour, uOpacity);
        }
      `,
      transparent: true,
      depthWrite: false,
    });

    let coastlines: ThreeTypes.LineSegments | null = null;
    const buildCoastlines = (lines: Continent[]) => {
      const positions: number[] = [];
      for (const ring of lines) {
        // every ring is closed: the last point goes back to the first
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i];
          const b = ring[(i + 1) % ring.length];
          if (!a || !b) continue;
          // lon/lat -> unit-sphere point, the same mapping the app's own globe uses
          const toPos = (deg: number[]): number[] => {
            const lon = deg[0] ?? 0;
            const lat = deg[1] ?? 0;
            const phi = (lon * Math.PI) / 180;
            const theta = (lat * Math.PI) / 180;
            return [Math.cos(theta) * Math.sin(phi), Math.sin(theta), Math.cos(theta) * Math.cos(phi)];
          };
          positions.push(...toPos(a), ...toPos(b));
        }
      }
      // three sizes LineSegments by its position attribute - a geometry carrying only a custom
      // lonLat attribute had count 0 and quietly drew nothing at all
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
      coastlines = new THREE.LineSegments(geometry, coastMaterial);
      coastlines.frustumCulled = false;
      spin.add(coastlines);
    };

    // ---- the theme swap: colours move with `data-theme`, and the probe reads the state
    // off the canvas because a canvas has no CSS. Both data fetches below land on the same
    // deployment, so nothing here asks an outside server for anything.
    const applyGlobeTheme = () => {
      const keys = isLightTheme() ? themes.light : themes.dark;
      oceanUniforms.uSky.value.copy(keys.sky);
      oceanUniforms.uSea.value.copy(keys.sea);
      oceanUniforms.uDeep.value.copy(keys.deep);
      oceanUniforms.uFresnel.value.copy(keys.fresnel);
      oceanUniforms.uRim.value.copy(keys.rim);
      oceanUniforms.uRimStrength.value = keys.rimStrength;
      oceanUniforms.uRegionStrength.value = keys.regionStrength;
      oceanUniforms.uRegionTint.value.copy(keys.region);
      oceanUniforms.uFieldStrength.value = keys.fieldStrength;
      oceanUniforms.uFieldTex.value = ensureFieldTexture(isLightTheme() ? "light" : "dark") ?? (null as unknown as ThreeTypes.DataTexture);
      coastUniforms.uColour.value.copy(keys.coast);
      coastUniforms.uOpacity.value = keys.coastOpacity;
      canvas!.dataset.globeTheme = isLightTheme() ? "light" : "dark";
    };
    const themeObserver = new MutationObserver(() => applyGlobeTheme());
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    applyGlobeTheme();

    void fetchGlobeData()
      .then(({ lines, region, fieldPlane: plane, fieldWidth: fw, fieldHeight: fh, fieldRange: fr, thermal }) => {
        oceanUniforms.uRegion.value.set(region[0], region[1], region[2], region[3]);
        fieldPlane = plane;
        fieldWidth = fw;
        fieldHeight = fh;
        fieldRange = fr;
        fieldThermal = thermal;
        buildCoastlines(lines);
        // bind the fill now - `applyGlobeTheme` ran before the Grid arrived, so a texture that
        // was null at mount needs its uniform refreshed here, not on some later theme swap
        oceanUniforms.uFieldTex.value = ensureFieldTexture(isLightTheme() ? "light" : "dark") ?? (null as unknown as ThreeTypes.DataTexture);
        // the probe waits on this before it measures rotation: a globe without its
        // continents has not yet taken over from the half-empty fallback
        canvas!.dataset.globeContinents = "1";
      })
      .catch(() => {
        // no continents, no region: the ocean sphere alone is still a globe, and the page
        // must never fail because a hero decoration could not load
      });

    function resize() {
      const size = wrap!.clientWidth;
      renderer.setSize(size, size, false);
      camera.aspect = 1;
      camera.updateProjectionMatrix();
    }
    resize();
    window.addEventListener("resize", resize);

    // ---- drag to spin the globe: the planet follows the pointer while held, keeps the
    // last push as inertia after release, and drifts again once inertia has died. The
    // entrance parallax below still tilts `group` toward the pointer when not dragging.
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let vx = 0;
    let vy = 0;
    let yaw = 0;
    let pitch = 0;
    let parallaxX = 0;
    let parallaxZ = 0;
    let openProgress = 0; // 0 -> 1 iris-open, drives an entrance spin + scale

    // `touch-action: none` so a drag on a touch screen turns the globe instead of scrolling
    // the page, and `setPointerCapture` so a fast throw does not leave the canvas mid-gesture.
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", (e) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      vx = 0;
      vy = 0;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // a pointer that is not currently active (synthetic events, some mixed-input edge
        // cases) has nothing to capture; the drag still works, just without the hold-a-throw
      }
      canvas.classList.add("dragging");
    });
    canvas.addEventListener("pointermove", (e) => {
      if (dragging) {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        yaw += dx * 0.006;
        pitch = clamp(pitch + dy * 0.006);
        vx = dx * 0.006;
        vy = dy * 0.006;
        lastX = e.clientX;
        lastY = e.clientY;
        return;
      }
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = (e.clientY / window.innerHeight) * 2 - 1;
      parallaxX = ny * 0.22;
      parallaxZ = nx * 0.32;
    });
    const endDrag = () => {
      dragging = false;
      canvas.classList.remove("dragging");
    };
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);

    let started = false;
    let firstFrameShown = false;
    const clock = new THREE.Clock();

    function animate() {
      requestAnimationFrame(animate);
      const dt = clock.getDelta();
      const elapsed = clock.getElapsedTime();
      oceanUniforms.uTime.value = elapsed;

      if (openProgress < 1) {
        openProgress = Math.min(1, openProgress + dt * 0.6);
      }
      const eased = 1 - Math.pow(1 - openProgress, 3);
      group.scale.setScalar(0.72 + eased * 0.28);

      if (!dragging) {
        // inertia after a released drag tails off; the idle drift resumes once it has
        const coasting = Math.abs(vx) + Math.abs(vy) > 0.0001;
        if (coasting) {
          yaw += vx;
          pitch = clamp(pitch + vy);
          vx *= 0.93;
          vy *= 0.93;
        } else if (!reduceMotion) {
          // slow, calm drift - fast enough that a reviewer can watch it turn and slow enough
          // that the continent set reads as geography rather than a spinning advert
          yaw += dt * 0.10 + (1 - eased) * dt * 2.4;
        }
      }

      group.rotation.x += (parallaxX - group.rotation.x) * 0.04;
      group.rotation.z += (parallaxZ * 0.5 - group.rotation.z) * 0.04;

      spin.rotation.y = yaw;
      spin.rotation.x = pitch;

      renderer.render(scene, camera);

      if (!firstFrameShown) {
        firstFrameShown = true;
        canvas!.classList.add("ready");
        fallback?.classList.add("handoff");
      }
    }

    // Only spend the WebGL budget once the sphere is actually likely to be seen.
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !started) {
          started = true;
          animate();
        }
      });
    });
    io.observe(wrap);
  }
}