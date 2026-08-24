import {
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  Data3DTexture,
  DoubleSide,
  GLSL3,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  Texture,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type { Manifest, OceanFloat } from "../types";
import type { Theme } from "../store";
import {
  coastlineFragmentShader,
  coastlineVertexShader,
  EARTH_RADIUS,
  surfaceFragmentShader,
  surfaceVertexShader,
} from "./earthShader";
import { boxBounds, depthToY, latToZ, lonToX, makeFrame } from "./geography";
import { freshness, positionAt, trackUpTo } from "../floatTime";
import { morphedPosition } from "./morph";
import { volumeFragmentShader, volumeVertexShader } from "./volumeShader";

export interface ViewState {
  morph: number;
  timestepIndex: number;
  /** The analysis instant on screen, in epoch milliseconds. Floats are placed against it. */
  timeMs: number;
  windowMin: number;
  windowMax: number;
  opacity: number;
  logScale: boolean;
  depthFrom: number;
  depthTo: number;
  surfaceLevel: number;
  isoEnabled: boolean;
  isoValue: number;
  volumeEnabled: boolean;
  emphasis: number;
  exaggeration: number;
  quality: number;
  selectedFloatId: string | null;
  showFloats: boolean;
  showTracks: boolean;
  theme: Theme;
}

/**
 * Explicit draw order for the transparent passes.
 *
 * Three sorts transparent objects by the distance to each object's *centroid*, which is a fine
 * heuristic for compact meshes and useless for ours: the sea surface spans the entire globe, so
 * its centroid sits at the origin while the part you are actually looking at is thousands of
 * units away. The sort therefore placed the opaque world surface *after* the Volume and painted
 * flat ocean straight over the water column - the volume rendered perfectly and was covered up.
 * Ordering the passes by hand is the fix; it is also simply what we mean.
 */
const ORDER = { surface: 0, lines: 5, volume: 10, markers: 20 } as const;

/**
 * Scene palettes, one per theme.
 *
 * The chrome could be themed in CSS alone, but the world could not: the globe's sea, the
 * coastlines, the float markers and the box frame are all drawn by us, and on a white page the
 * dark-on-dark set is invisible. So each theme carries its own, and `setTheme` swaps them.
 *
 * The float marker inverts rather than merely lightening. It is a bright core inside a dark
 * ring on a dark ground, and a dark core inside a bright ring on a light one, because whatever
 * colour it is, some water underneath it is that colour too.
 */
const SCENE_COLOURS = {
  dark: {
    ocean: new Color(0x0a1a2c),
    coast: new Color(0x7fd4f5),
    float: new Color(0xfdfdfd),
    outline: new Color(0x07111d),
    frame: new Color(0x3d5a76),
    track: new Color(0xf0a04b),
    rim: new Color(0.1, 0.28, 0.42),
    shadeFloor: 0.62,
    coastOpacity: 0.75,
    trackOpacity: 0.5,
  },
  light: {
    ocean: new Color(0xdff2f8),
    coast: new Color(0x0e9bb4),
    float: new Color(0x0c2531),
    outline: new Color(0xffffff),
    frame: new Color(0x6f9cb0),
    track: new Color(0xc2621a),
    rim: new Color(0.0, 0.0, 0.0),
    shadeFloor: 0.88,
    coastOpacity: 1.0,
    trackOpacity: 0.7,
  },
} as const;

const SELECTED_COLOUR = new Color(0x4ade80);

/** Where the camera sits in each view. The Drill-down interpolates between them. */
const GLOBE_DISTANCE = 175;
const REGION_VIEW = { lon: 79, lat: 8, height: 17, back: 74 };

export class OceanScene {
  /** Debug hook so a screenshot harness can assert on real geometry rather than pixels. */
  debug() {
    return {
      volumeScale: this.volume?.scale.toArray(),
      volumePosition: this.volume?.position.toArray(),
      cameraPosition: this.camera.position.toArray(),
      target: this.controls.target.toArray(),
      visible: this.volume?.visible,
      corners: this.debugCorners(),
      uniforms: this.volume
        ? {
            boxMin: (this.volume.material as ShaderMaterial).uniforms.uBoxMin?.value?.toArray?.(),
            boxMax: (this.volume.material as ShaderMaterial).uniforms.uBoxMax?.value?.toArray?.(),
            depthFrom: (this.volume.material as ShaderMaterial).uniforms.uDepthFrom?.value,
            depthTo: (this.volume.material as ShaderMaterial).uniforms.uDepthTo?.value,
            opacity: (this.volume.material as ShaderMaterial).uniforms.uOpacity?.value,
          }
        : null,
    };
  }

  /** Screen-space y of the box's top and bottom faces, to check what is actually on screen. */
  private debugCorners() {
    if (!this.volume) return null;
    const half = this.volume.scale.clone().multiplyScalar(0.5);
    const centre = this.volume.position;
    const ys: number[] = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      const p = new Vector3(
        centre.x + sx * half.x, centre.y + sy * half.y, centre.z + sz * half.z,
      ).project(this.camera);
      ys.push(Math.round(((1 - p.y) / 2) * this.renderer.domElement.clientHeight));
    }
    return { minScreenY: Math.min(...ys), maxScreenY: Math.max(...ys) };
  }

  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  private readonly controls: OrbitControls;

  private manifest!: Manifest;
  private floats: OceanFloat[] = [];

  private surface?: Mesh;
  private coastlines?: LineSegments;
  private volume?: Mesh;
  private boxFrame?: LineSegments;
  private floatPoints?: Points;
  private trackLines?: LineSegments;
  private selectedColumn?: LineSegments;

  private currentVolume?: Data3DTexture;
  private currentPalette?: Texture;
  private lastBoxKey = "";
  private lastColumnKey = "";
  private lastTrackTime = Number.NaN;
  private lastTheme: Theme | null = null;
  private state?: ViewState;
  private frameId = 0;
  private elapsed = 0;
  private disposed = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    // Integrated graphics have to ray-march every pixel. Capping the device pixel ratio at 1.5
    // is the single biggest win available and is very hard to see.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    // Transparent, so the CSS backdrop shows through. The deep ocean is almost black in every
    // perceptually-uniform palette, and on a black canvas the bottom two-thirds of the water
    // column simply disappears - the geometry renders, you just cannot see it.
    this.renderer.setClearColor(0x000000, 0);

    this.camera = new PerspectiveCamera(45, 1, 0.05, 4000);
    this.camera.position.set(0, 60, GLOBE_DISTANCE);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 900;

    // Exposed so a demo operator, and the screenshot harness, can drive the scene directly.
    (window as unknown as Record<string, unknown>).__scene = this;
  }

  build(manifest: Manifest, floats: OceanFloat[], coastlines: number[][][]): void {
    this.manifest = manifest;
    this.floats = floats;

    this.buildSurface();
    this.buildCoastlines(coastlines);
    this.buildVolume();
    this.buildFloats();
    this.buildTracks();
  }

  // ---------------------------------------------------------------- geometry

  /** A lon/lat lattice that is a globe at morph 0 and an equirectangular map at morph 1. */
  private buildSurface(): void {
    const stepDegrees = 1;
    const columns = 360 / stepDegrees;
    const rows = 180 / stepDegrees;

    const lonLat: number[] = [];
    for (let row = 0; row <= rows; row++) {
      for (let column = 0; column <= columns; column++) {
        lonLat.push(-180 + column * stepDegrees, 90 - row * stepDegrees);
      }
    }

    const indices: number[] = [];
    const width = columns + 1;
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const a = row * width + column;
        indices.push(a, a + width, a + 1, a + 1, a + width, a + width + 1);
      }
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute("lonLat", new BufferAttribute(new Float32Array(lonLat), 2));
    // Three still wants a `position` attribute even though the vertex shader ignores it.
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(lonLat.length / 2 * 3), 3));
    geometry.setIndex(indices);

    const { volume } = this.manifest;
    const material = new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: surfaceVertexShader,
      fragmentShader: surfaceFragmentShader,
      side: DoubleSide,
      transparent: true,
      uniforms: {
        uMorph: { value: 0 },
        uVolume: { value: null },
        uPalette: { value: null },
        uRegion: {
          value: [volume.west, volume.east, volume.south, volume.north],
        },
        uDepthFraction: { value: 0 },
        uWindowMin: { value: 0 },
        uWindowMax: { value: 1 },
        uLogScale: { value: 0 },
        uFieldOpacity: { value: 0.95 },
        uOceanColour: { value: SCENE_COLOURS.dark.ocean.clone() },
        uLightDirection: { value: new Vector3(0.6, 0.5, 0.7).normalize() },
        uRegionCutout: { value: 0 },
        uShadeFloor: { value: 0.62 },
        uRimStrength: { value: 1 },
        uRimColour: { value: SCENE_COLOURS.dark.rim.clone() },
      },
    });

    this.surface = new Mesh(geometry, material);
    this.surface.renderOrder = ORDER.surface;
    this.surface.frustumCulled = false;
    this.scene.add(this.surface);
  }

  private buildCoastlines(coastlines: number[][][]): void {
    const lonLat: number[] = [];
    for (const line of coastlines) {
      for (let i = 0; i < line.length - 1; i++) {
        const a = line[i];
        const b = line[i + 1];
        if (!a || !b) continue;
        lonLat.push(a[0] ?? 0, a[1] ?? 0, b[0] ?? 0, b[1] ?? 0);
      }
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute("lonLat", new BufferAttribute(new Float32Array(lonLat), 2));
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(lonLat.length / 2 * 3), 3));

    const material = new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: coastlineVertexShader,
      fragmentShader: coastlineFragmentShader,
      transparent: true,
      uniforms: {
        uMorph: { value: 0 },
        uColour: { value: SCENE_COLOURS.dark.coast.clone() },
        uOpacity: { value: 0.75 },
      },
    });

    this.coastlines = new LineSegments(geometry, material);
    this.coastlines.renderOrder = ORDER.lines;
    this.coastlines.frustumCulled = false;
    this.scene.add(this.coastlines);
  }

  private buildVolume(): void {
    const material = new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: volumeVertexShader,
      fragmentShader: volumeFragmentShader,
      transparent: true,
      depthWrite: false,
      side: BackSide, // so the volume survives the camera entering the water
      uniforms: {
        uVolume: { value: null },
        uPalette: { value: null },
        uBoxMin: { value: new Vector3() },
        uBoxMax: { value: new Vector3() },
        uWindowMin: { value: 0 },
        uWindowMax: { value: 1 },
        uOpacity: { value: 0.012 },
        uSteps: { value: 128 },
        uLogScale: { value: 0 },
        uDepthFrom: { value: 0 },
        uDepthTo: { value: 1 },
        uIsoValue: { value: 0.5 },
        uIsoEnabled: { value: 0 },
        uVolumeEnabled: { value: 1 },
        uEmphasis: { value: 0.85 },
        uLightDirection: { value: new Vector3(0.5, 0.8, 0.4).normalize() },
        uTime: { value: 0 },
      },
    });

    this.volume = new Mesh(new BoxGeometry(1, 1, 1), material);
    this.volume.renderOrder = ORDER.volume;
    (window as unknown as Record<string, unknown>).__scene = this;
    this.volume.frustumCulled = false;
    this.scene.add(this.volume);

    this.boxFrame = new LineSegments(
      new BufferGeometry(),
      new LineBasicMaterial({
        color: SCENE_COLOURS.dark.frame.clone(),
        transparent: true,
        opacity: 0.7,
      }),
    );
    this.boxFrame.renderOrder = ORDER.markers;
    this.scene.add(this.boxFrame);
  }

  private buildFloats(): void {
    const lonLat = new Float32Array(this.floats.length * 2);
    this.floats.forEach((item, index) => {
      lonLat[index * 2] = item.latest.lon;
      lonLat[index * 2 + 1] = item.latest.lat;
    });

    const geometry = new BufferGeometry();
    geometry.setAttribute("lonLat", new BufferAttribute(lonLat, 2));
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(this.floats.length * 3), 3));
    geometry.setAttribute("selected", new BufferAttribute(new Float32Array(this.floats.length), 1));
    // 0 means "not reporting near this moment", so the shader can drop it entirely.
    geometry.setAttribute("fresh", new BufferAttribute(new Float32Array(this.floats.length), 1));

    const material = new ShaderMaterial({
      glslVersion: GLSL3,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uMorph: { value: 0 },
        uSize: { value: 10 },
        uColour: { value: SCENE_COLOURS.dark.float.clone() },
        uOutline: { value: SCENE_COLOURS.dark.outline.clone() },
        uSelectedColour: { value: SELECTED_COLOUR },
        uPulse: { value: 0 },
      },
      vertexShader: /* glsl */ `
        in vec2 lonLat;
        in float selected;
        in float fresh;
        uniform float uMorph;
        uniform float uSize;
        out float vSelected;
        out float vFresh;
        const float PI = 3.141592653589793;
        const float EARTH_RADIUS = ${EARTH_RADIUS.toFixed(6)};
        void main() {
          vSelected = selected;
          vFresh = fresh;
          if (fresh <= 0.0) {
            // Not reporting near this Timestep: park it behind the camera so it never draws.
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
            gl_PointSize = 0.0;
            return;
          }
          float phi = radians(lonLat.x);
          float theta = radians(lonLat.y);
          float r = EARTH_RADIUS + 0.15;
          vec3 sphere = vec3(r * cos(theta) * sin(phi), r * sin(theta), r * cos(theta) * cos(phi));
          vec3 plane = vec3(lonLat.x, 0.15, -lonLat.y);
          vec4 view = viewMatrix * vec4(mix(sphere, plane, uMorph), 1.0);
          gl_Position = projectionMatrix * view;
          gl_PointSize = (uSize + selected * 7.0) * (60.0 / -view.z);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform vec3 uColour;
        uniform vec3 uOutline;
        uniform vec3 uSelectedColour;
        uniform float uPulse;
        in float vSelected;
        in float vFresh;
        out vec4 fragColor;
        void main() {
          vec2 offset = gl_PointCoord - 0.5;
          float distance = length(offset);
          if (distance > 0.5) discard;

          // A bright core inside a dark ring. A single-colour marker is unreadable here: the
          // Float sits on top of the field it is being compared against, so whatever colour it
          // is, some water is that colour. The dark ring is what keeps it legible over a warm
          // yellow surface and over violet abyssal water alike.
          float core = 1.0 - smoothstep(0.17, 0.23, distance);
          float body = 1.0 - smoothstep(0.33, 0.39, distance);

          vec3 fill = mix(uColour, uSelectedColour, vSelected);
          vec3 colour = mix(uOutline, fill, core);
          float alpha = body * (0.85 + 0.15 * core) * vFresh;

          // The selected Float breathes, so the eye can find it again after the camera moves.
          float pulse = vSelected * (1.0 - smoothstep(0.39, 0.5, distance)) * uPulse * 0.5;
          fragColor = vec4(mix(colour, uSelectedColour, pulse), clamp(alpha + pulse, 0.0, 1.0));
        }
      `,
    });

    this.floatPoints = new Points(geometry, material);
    this.floatPoints.renderOrder = ORDER.markers;
    this.floatPoints.frustumCulled = false;
    this.scene.add(this.floatPoints);
  }

  /** Track segments travelled by `whenMs`. */
  private buildTrackGeometry(whenMs: number): BufferGeometry {
    const lonLat: number[] = [];
    for (const item of this.floats) {
      const travelled = trackUpTo(item, whenMs);
      for (let i = 0; i < travelled.length - 1; i++) {
        const a = travelled[i];
        const b = travelled[i + 1];
        if (!a || !b) continue;
        lonLat.push(a.lon, a.lat, b.lon, b.lat);
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("lonLat", new BufferAttribute(new Float32Array(lonLat), 2));
    geometry.setAttribute("position", new BufferAttribute(new Float32Array((lonLat.length / 2) * 3), 3));
    return geometry;
  }

  private buildTracks(): void {
    const geometry = this.buildTrackGeometry(Number.POSITIVE_INFINITY);

    const material = new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: coastlineVertexShader,
      fragmentShader: coastlineFragmentShader,
      transparent: true,
      uniforms: {
        uMorph: { value: 0 },
        uColour: { value: SCENE_COLOURS.dark.track.clone() },
        uOpacity: { value: 0.5 },
      },
    });

    this.trackLines = new LineSegments(geometry, material);
    this.trackLines.renderOrder = ORDER.lines;
    this.trackLines.frustumCulled = false;
    this.scene.add(this.trackLines);

    this.selectedColumn = new LineSegments(
      new BufferGeometry(),
      new LineBasicMaterial({ color: SELECTED_COLOUR, transparent: true, opacity: 0.85 }),
    );
    this.selectedColumn.renderOrder = ORDER.markers;
    this.scene.add(this.selectedColumn);
  }

  // ---------------------------------------------------------------- updates

  /**
   * Adopt a Volume texture, releasing the one it replaces.
   *
   * The scene owns these once handed over. Timestep playback swaps a ~300 KB 3-D texture every
   * 900 ms; without freeing the previous one, a few minutes of the animation running quietly
   * exhausts GPU memory and loses the WebGL context - on exactly the integrated graphics this
   * project targets.
   */
  setVolumeTexture(texture: Data3DTexture): void {
    if (this.currentVolume === texture) return;
    this.currentVolume?.dispose();
    this.currentVolume = texture;
    this.setUniform(this.volume, "uVolume", texture);
    this.setUniform(this.surface, "uVolume", texture);
  }

  setPalette(texture: Texture): void {
    if (this.currentPalette === texture) return;
    this.currentPalette?.dispose();
    this.currentPalette = texture;
    this.setUniform(this.volume, "uPalette", texture);
    this.setUniform(this.surface, "uPalette", texture);
  }

  /**
   * Repaint everything the scene draws itself. Cheap - it writes uniforms, touches no geometry
   * and uploads no textures - so it is safe to call from update() behind a cache check.
   */
  setTheme(theme: Theme): void {
    if (theme === this.lastTheme) return;
    this.lastTheme = theme;
    const palette = SCENE_COLOURS[theme];

    (this.surface?.material as ShaderMaterial | undefined)?.uniforms.uOceanColour?.value.copy(
      palette.ocean,
    );
    this.setUniform(this.surface, "uShadeFloor", palette.shadeFloor);
    this.setUniform(this.surface, "uRimStrength", theme === "light" ? 0 : 1);
    (this.surface?.material as ShaderMaterial | undefined)?.uniforms.uRimColour?.value.copy(
      palette.rim,
    );

    const coastMaterial = this.coastlines?.material as ShaderMaterial | undefined;
    coastMaterial?.uniforms.uColour?.value.copy(palette.coast);
    this.setUniform(this.coastlines, "uOpacity", palette.coastOpacity);

    const trackMaterial = this.trackLines?.material as ShaderMaterial | undefined;
    trackMaterial?.uniforms.uColour?.value.copy(palette.track);
    this.setUniform(this.trackLines, "uOpacity", palette.trackOpacity);

    const floatMaterial = this.floatPoints?.material as ShaderMaterial | undefined;
    floatMaterial?.uniforms.uColour?.value.copy(palette.float);
    floatMaterial?.uniforms.uOutline?.value.copy(palette.outline);

    if (this.boxFrame) (this.boxFrame.material as LineBasicMaterial).color.copy(palette.frame);
  }

  update(state: ViewState): void {
    this.state = state;
    this.setTheme(state.theme);
    const frame = makeFrame(this.manifest.volume, state.exaggeration);
    const { min, max } = boxBounds(frame);

    for (const object of [this.surface, this.coastlines, this.trackLines, this.floatPoints]) {
      this.setUniform(object, "uMorph", state.morph);
    }

    this.setUniform(this.surface, "uDepthFraction", state.surfaceLevel);
    this.setUniform(this.surface, "uRegionCutout", smoothLimit(state.morph));

    // The sea surface must stop writing depth once we are in the Volume View.
    //
    // The camera sits above y = 0 and the water column hangs below it, so every ray heading for
    // the deep part of the box crosses the sea-surface plane long before it arrives - at around
    // 40 degrees south, far outside the cutout, where the surface is still opaque. It was
    // silently depth-culling the bottom 700 pixels of a box that renders perfectly well.
    //
    // On the globe it must keep writing depth, or the far side of the sphere shows through.
    if (this.surface) {
      const material = this.surface.material as ShaderMaterial;
      material.depthWrite = state.morph < 0.5;
    }
    this.setUniform(this.surface, "uWindowMin", state.windowMin);
    this.setUniform(this.surface, "uWindowMax", state.windowMax);
    this.setUniform(this.surface, "uLogScale", state.logScale ? 1 : 0);

    if (this.volume) {
      const material = this.volume.material as ShaderMaterial;
      (material.uniforms.uBoxMin!.value as Vector3).set(min[0], min[1], min[2]);
      (material.uniforms.uBoxMax!.value as Vector3).set(max[0], max[1], max[2]);
      material.uniforms.uWindowMin!.value = state.windowMin;
      material.uniforms.uWindowMax!.value = state.windowMax;
      material.uniforms.uOpacity!.value = state.opacity;
      material.uniforms.uSteps!.value = state.quality;
      material.uniforms.uLogScale!.value = state.logScale ? 1 : 0;
      material.uniforms.uDepthFrom!.value = state.depthFrom;
      material.uniforms.uDepthTo!.value = state.depthTo;
      material.uniforms.uIsoEnabled!.value = state.isoEnabled ? 1 : 0;
      material.uniforms.uIsoValue!.value = state.isoValue;
      material.uniforms.uVolumeEnabled!.value = state.volumeEnabled ? 1 : 0;
      material.uniforms.uEmphasis!.value = state.emphasis;

      this.volume.position.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
      this.volume.scale.set(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
      // The Volume only exists once the world has flattened; on the globe it would be a box
      // floating incoherently off the limb.
      this.volume.visible = state.morph > 0.55;
    }

    if (this.boxFrame) {
      // Rebuilt only when the box actually changes shape. update() runs on every React render,
      // and the dive writes morph 60 times a second - disposing and re-uploading a GPU buffer
      // each of those frames is pure waste, and the bounds do not move during a dive anyway.
      const key = `${min.join()}|${max.join()}`;
      if (key !== this.lastBoxKey) {
        this.lastBoxKey = key;
        this.boxFrame.geometry.dispose();
        this.boxFrame.geometry = boxWireframe(min, max);
      }
      this.boxFrame.visible = state.morph > 0.55;
      (this.boxFrame.material as LineBasicMaterial).opacity = 0.7 * smoothLimit(state.morph);
    }

    if (this.floatPoints) {
      this.floatPoints.visible = state.showFloats;
      const selected = this.floatPoints.geometry.getAttribute("selected") as BufferAttribute;
      const fresh = this.floatPoints.geometry.getAttribute("fresh") as BufferAttribute;
      const lonLat = this.floatPoints.geometry.getAttribute("lonLat") as BufferAttribute;

      this.floats.forEach((item, index) => {
        const fix = positionAt(item, state.timeMs);
        selected.setX(index, item.id === state.selectedFloatId ? 1 : 0);
        fresh.setX(index, fix ? freshness(fix.ageDays) : 0);
        if (fix) lonLat.setXY(index, fix.lon, fix.lat);
      });
      selected.needsUpdate = true;
      fresh.needsUpdate = true;
      lonLat.needsUpdate = true;
    }

    if (this.trackLines) {
      this.trackLines.visible = state.showTracks;
      // Only the drift that had already happened by this Timestep, so pressing play draws the
      // tracks out rather than showing every float's whole future at once.
      if (state.timeMs !== this.lastTrackTime) {
        this.lastTrackTime = state.timeMs;
        this.trackLines.geometry.dispose();
        this.trackLines.geometry = this.buildTrackGeometry(state.timeMs);
      }
    }

    this.updateSelectedColumn(state, frame);
  }

  /** A plumb line from the selected Float down through the water it profiled. */
  private updateSelectedColumn(state: ViewState, frame: ReturnType<typeof makeFrame>): void {
    if (!this.selectedColumn) return;
    const chosen = this.floats.find((item) => item.id === state.selectedFloatId);
    if (!chosen || state.morph < 0.55) {
      this.selectedColumn.visible = false;
      return;
    }

    const key = `${chosen.id}|${frame.boxHeight}|${state.timeMs}`;
    if (key === this.lastColumnKey) {
      this.selectedColumn.visible = true;
      return;
    }
    this.lastColumnKey = key;

    const fix = positionAt(chosen, state.timeMs);
    const x = lonToX(fix?.lon ?? chosen.latest.lon);
    const z = latToZ(fix?.lat ?? chosen.latest.lat);
    const bottom = -frame.boxHeight;

    const points: number[] = [x, 0.4, z, x, bottom, z];
    const ticks = 12;
    for (let i = 0; i <= ticks; i++) {
      const y = (bottom * i) / ticks;
      points.push(x - 0.5, y, z, x + 0.5, y, z);
    }

    this.selectedColumn.geometry.dispose();
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(points), 3));
    this.selectedColumn.geometry = geometry;
    this.selectedColumn.visible = true;
  }

  // ---------------------------------------------------------------- interaction

  /** Nearest Float to a screen point, or null. See `morph.ts` for why this is done by hand. */
  pickFloat(clientX: number, clientY: number, radiusPixels = 22): OceanFloat | null {
    if (!this.state?.showFloats) return null;
    const rect = this.canvas.getBoundingClientRect();
    const target = new Vector2(clientX - rect.left, clientY - rect.top);

    let best: OceanFloat | null = null;
    let bestDistance = radiusPixels;
    const world = new Vector3();

    for (const item of this.floats) {
      const fix = positionAt(item, this.state.timeMs);
      if (!fix) continue;
      morphedPosition(fix.lon, fix.lat, this.state.morph, 0.15, world);
      const projected = world.clone().project(this.camera);
      if (projected.z < -1 || projected.z > 1) continue;

      const screenX = ((projected.x + 1) / 2) * rect.width;
      const screenY = ((1 - projected.y) / 2) * rect.height;
      const distance = target.distanceTo(new Vector2(screenX, screenY));
      if (distance < bestDistance) {
        bestDistance = distance;
        best = item;
      }
    }
    return best;
  }

  /** Project any world point to canvas pixels, so React can hang crisp HTML off the 3D scene. */
  projectPoint(x: number, y: number, z: number): { x: number; y: number; visible: boolean } {
    const projected = new Vector3(x, y, z).project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((projected.x + 1) / 2) * rect.width,
      y: ((1 - projected.y) / 2) * rect.height,
      visible: projected.z > -1 && projected.z < 1,
    };
  }

  /** The box's near-left vertical edge, where the depth ruler is drawn. */
  rulerAnchor(exaggeration: number, metres: number) {
    const frame = makeFrame(this.manifest.volume, exaggeration);
    const { min, max } = boxBounds(frame);
    return this.projectPoint(min[0], depthToY(frame, metres), max[2]);
  }

  /** Where a Float sits on screen right now, so React can hang a label off it. */
  projectFloat(item: OceanFloat): { x: number; y: number; visible: boolean } {
    const fix = this.state ? positionAt(item, this.state.timeMs) : null;
    const world = morphedPosition(
      fix?.lon ?? item.latest.lon,
      fix?.lat ?? item.latest.lat,
      this.state?.morph ?? 0,
      0.15,
    );
    const projected = world.project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((projected.x + 1) / 2) * rect.width,
      y: ((1 - projected.y) / 2) * rect.height,
      visible: projected.z > -1 && projected.z < 1,
    };
  }

  /** Camera pose for a given Drill-down progress. */
  applyCamera(progress: number): void {
    const eased = progress * progress * (3 - 2 * progress);

    const globe = new Vector3(0, 55, GLOBE_DISTANCE);
    morphedPosition(REGION_VIEW.lon, REGION_VIEW.lat + 26, 0, GLOBE_DISTANCE - EARTH_RADIUS, globe);

    // Far enough back to hold the whole block, and low enough that the flank stays the main
    // face - a ray crossing the side at 1500 m never meets the warm surface, so the thermocline
    // reads directly as bands of colour rather than being hidden under a warm lid.
    const region = new Vector3(
      REGION_VIEW.lon,
      REGION_VIEW.height,
      -REGION_VIEW.lat + REGION_VIEW.back,
    );

    const globeTarget = new Vector3(0, 0, 0);
    const regionTarget = new Vector3(78, -13, -8);

    this.camera.position.lerpVectors(globe, region, eased);
    this.controls.target.lerpVectors(globeTarget, regionTarget, eased);
    this.controls.update();
  }

  focusOn(lon: number, lat: number, distance = 18): void {
    this.controls.target.set(lon, -3, -lat);
    this.camera.position.set(lon + distance * 0.15, distance * 0.75, -lat + distance * 0.8);
    this.controls.update();
  }

  // ---------------------------------------------------------------- lifecycle

  start(): void {
    let previous = performance.now();
    const loop = () => {
      if (this.disposed) return;
      this.frameId = requestAnimationFrame(loop);
      const now = performance.now();
      this.elapsed += (now - previous) / 1000;
      previous = now;

      this.setUniform(this.volume, "uTime", this.elapsed);
      this.setUniform(this.floatPoints, "uPulse", 0.5 + 0.5 * Math.sin(this.elapsed * 3));
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    this.controls.dispose();
    this.currentVolume?.dispose();
    this.currentPalette?.dispose();
    this.scene.traverse((object) => {
      if (object instanceof Mesh || object instanceof LineSegments || object instanceof Points) {
        object.geometry.dispose();
        const material = object.material;
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material.dispose();
      }
    });
    this.renderer.dispose();
  }

  private setUniform(object: { material: unknown } | undefined, name: string, value: unknown): void {
    const material = object?.material as ShaderMaterial | undefined;
    const uniform = material?.uniforms?.[name];
    if (uniform) uniform.value = value;
  }
}

function smoothLimit(morph: number): number {
  return Math.max(0, Math.min(1, (morph - 0.55) / 0.35));
}

function boxWireframe(min: readonly number[], max: readonly number[]): BufferGeometry {
  const [x0, y0, z0] = [min[0]!, min[1]!, min[2]!];
  const [x1, y1, z1] = [max[0]!, max[1]!, max[2]!];
  const corners = [
    [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
    [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1],
  ];
  const edges = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  const points: number[] = [];
  for (const [a, b] of edges) {
    points.push(...corners[a!]!, ...corners[b!]!);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(points), 3));
  return geometry;
}
