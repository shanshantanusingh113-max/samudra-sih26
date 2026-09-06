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
 * The globe carries three meshes:
 *  - An inner sphere shaded by a fragment shader in ocean blues (pale sky at the lit edge,
 *    deepening to abyssal navy), standing in for a directional light across water.
 *  - An outer, slightly larger sphere textured with the same `globe.jpg` the page uses
 *    elsewhere (INCOIS analysis + Argo tracks), blended at high opacity, so the sphere reads
 *    as the actual product and not an abstract brand decoration.
 *  - A faint neutral wireframe rim.
 */
// Type-only import: erased at build time. The real `three` module is fetched lazily below.
import type * as ThreeTypes from "three";

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

if (canvas && wrap) {
  whenIdle(() => {
    void mountGlobe();
  });
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

    // ---- inner shaded sphere: ocean blues, standing in for a directional light ----
    const gradientMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vNormal;
        uniform float uTime;

        const vec3 pale  = vec3(0.890, 0.965, 0.988);
        const vec3 sky   = vec3(0.596, 0.792, 0.918);
        const vec3 sea   = vec3(0.184, 0.435, 0.659);
        const vec3 abyss = vec3(0.039, 0.145, 0.251);

        void main() {
          float angle = radians(255.0);
          vec2 dir = vec2(cos(angle), sin(angle));
          float t = dot(vNormal.xy, dir) * 0.5 + 0.5;
          t += sin(uTime * 0.05) * 0.02;

          vec3 col = mix(pale, sky, smoothstep(0.0, 0.30, t));
          col = mix(col, sea, smoothstep(0.30, 0.65, t));
          col = mix(col, abyss, smoothstep(0.65, 1.0, t));

          // gentle fresnel: a soft pale glow at the rim, like light grazing a wet sphere
          float fresnel = pow(1.0 - max(dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0), 2.0);
          col = mix(col, pale, fresnel * 0.35);

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const gradientSphere = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 96), gradientMaterial);
    group.add(gradientSphere);

    // ---- outer textured sphere: the same INCOIS analysis + Argo tracks screenshot ----
    const loader = new THREE.TextureLoader();
    const texture = loader.load("./images/globe.jpg");
    texture.colorSpace = THREE.SRGBColorSpace;
    const textureMaterial = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
    });
    const textureSphere = new THREE.Mesh(new THREE.SphereGeometry(1.004, 64, 64), textureMaterial);
    group.add(textureSphere);

    // thin neutral rim, deliberately theme-agnostic so it reads against both canvases
    const rimMaterial = new THREE.MeshBasicMaterial({ color: 0x8fa3b0, transparent: true, opacity: 0.22, wireframe: true });
    const rim = new THREE.Mesh(new THREE.SphereGeometry(1.012, 24, 16), rimMaterial);
    group.add(rim);

    function resize() {
      const size = wrap!.clientWidth;
      renderer.setSize(size, size, false);
      camera.aspect = 1;
      camera.updateProjectionMatrix();
    }
    resize();
    window.addEventListener("resize", resize);

    // cursor parallax: the globe tilts gently toward wherever the pointer is on screen
    let targetX = 0;
    let targetY = 0;
    let openProgress = 0; // 0 -> 1 iris-open, drives an entrance spin + scale
    window.addEventListener("pointermove", (e) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = (e.clientY / window.innerHeight) * 2 - 1;
      targetX = ny * 0.22;
      targetY = nx * 0.32;
    });

    let started = false;
    let firstFrameShown = false;
    const clock = new THREE.Clock();

    function animate() {
      requestAnimationFrame(animate);
      const dt = clock.getDelta();
      const elapsed = clock.getElapsedTime();
      gradientMaterial.uniforms["uTime"]!.value = elapsed;

      if (openProgress < 1) {
        openProgress = Math.min(1, openProgress + dt * 0.6);
      }
      const eased = 1 - Math.pow(1 - openProgress, 3);
      group.scale.setScalar(0.72 + eased * 0.28);

      if (!reduceMotion) {
        group.rotation.y += dt * 0.06 + (1 - eased) * dt * 2.4;
      }
      group.rotation.x += (targetX - group.rotation.x) * 0.04;
      group.rotation.z += (targetY * 0.5 - group.rotation.z) * 0.04;

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