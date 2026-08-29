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

import type { AnomalyFeature, Manifest, OceanFloat } from "../types";
import type { Theme } from "../store";
import {
  coastlineFragmentShader,
  coastlineVertexShader,
  EARTH_RADIUS,
  surfaceFragmentShader,
  surfaceVertexShader,
} from "./earthShader";
import { axisToDepth, boxBounds, depthToAxis, depthToY, latToZ, lonToX, makeFrame } from "./geography";
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
  /** 0 hides the Copernicus current overlay; 1 draws it at full strength. */
  currentsOpacity: number;
  /** Which Field is drawn. The Anomaly Features belong to one of them and to no other. */
  fieldKey: string;
  /** This Timestep's Anomaly Features, and which of them is open. */
  anomalies: AnomalyFeature[];
  showAnomalies: boolean;
  selectedAnomaly: number | null;
  /** Hide every part of the water except the selected Anomaly Feature. */
  isolateAnomaly: boolean;
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
const ORDER = { surface: 0, lines: 5, volume: 10, markers: 20, anomalies: 25 } as const;

/** The Field the Anomaly Features were found in. Must match the FieldSpec key in bake.py. */
const ANOMALY_FIELD = "temperature_anomaly";

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
  /**
   * Clip the water down to one Anomaly Feature.
   *
   * A coloured blob inside a solid block tells a viewer *that* water departed and almost
   * nothing about its shape - where it starts, how deep it runs, whether it is one body or
   * three. Clearing the rest away is the only way to actually look at the thing the ring is
   * pointing at, and every number the panel reports is about exactly this box.
   *
   * The box is the Feature's own bounding box from the bake, converted into the Volume's
   * texture coordinates. Latitude runs the opposite way in the texture from the world, and the
   * depth axis is warped, so both are taken through `geography.ts` rather than scaled by hand -
   * the same rule that keeps the depth ruler honest.
   *
   * Half a grid cell is added around the horizontal edges. The Feature's box names the *node
   * centres* it occupies, and a node's cell reaches half a degree past its centre, so clipping
   * exactly on the centres would shave the outermost ring of cells off the body it is meant to
   * be showing whole.
   */
  private applyFocus(material: ShaderMaterial, state: ViewState): void {
    const feature = state.selectedAnomaly === null ? undefined : state.anomalies[state.selectedAnomaly];
    if (!feature || !state.isolateAnomaly || !this.manifest) {
      material.uniforms.uFocusStrength!.value = 0;
      return;
    }
    const volume = this.manifest.volume;
    const spanLon = volume.east - volume.west;
    const spanLat = volume.north - volume.south;
    const halfCellLon = spanLon / Math.max(volume.width - 1, 1) / 2;
    const halfCellLat = spanLat / Math.max(volume.height - 1, 1) / 2;

    const u0 = (feature.west - halfCellLon - volume.west) / spanLon;
    const u1 = (feature.east + halfCellLon - volume.west) / spanLon;
    // Texture v is referenced to the SOUTH edge, not the north. World z is -latitude, so the
    // shader's `(uBoxMax.z - p.z) / span.z` expands to `(lat - south) / (north - south)`.
    // Written north-referenced this mirrored the box about the region centre: the Oman feature
    // at 12.5-20.5N was clipped to -5.0 to 4.0N, 1800 km from the ring pointing at it.
    const v0 = (feature.south - halfCellLat - volume.south) / spanLat;
    const v1 = (feature.north + halfCellLat - volume.south) / spanLat;
    // And w runs down the warped axis, which is what depthToAxis inverts.
    const w0 = depthToAxis(volume, feature.topMetres);
    const w1 = depthToAxis(volume, feature.bottomMetres);

    (material.uniforms.uFocusMin!.value as Vector3).set(
      Math.max(0, Math.min(u0, u1)),
      Math.max(0, Math.min(v0, v1)),
      Math.max(0, Math.min(w0, w1)),
    );
    (material.uniforms.uFocusMax!.value as Vector3).set(
      Math.min(1, Math.max(u0, u1)),
      Math.min(1, Math.max(v0, v1)),
      Math.min(1, Math.max(w0, w1)),
    );
    material.uniforms.uFocusStrength!.value = 1;
  }

  /**
   * The Copernicus current overlay for the Timestep on screen.
   *
   * Takes ownership and releases the one it replaces, the same contract `setPalette` has. Null
   * clears it, which is what happens when the bake could not reach Copernicus at all - the
   * manifest then carries no currents block and the control is never offered.
   */
  setCurrents(texture: Texture | null): void {
    const material = this.surface?.material as ShaderMaterial | undefined;
    const slot = material?.uniforms.uCurrents;
    if (!slot) return;
    (slot.value as Texture | null)?.dispose?.();
    slot.value = texture;
  }

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
  private anomalyPoints?: Points;
  private trackLines?: LineSegments;
  private selectedColumn?: LineSegments;

  private currentVolume?: Data3DTexture;
  private currentPalette?: Texture;
  private lastBoxKey = "";
  private lastColumnKey = "";
  private lastTrackTime = Number.NaN;
  private lastAnomalyKey = "";
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
    this.buildAnomalies();
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
        uFieldOpacity: { value: 0.95 },
        uOceanColour: { value: SCENE_COLOURS.dark.ocean.clone() },
        uLightDirection: { value: new Vector3(0.6, 0.5, 0.7).normalize() },
        uRegionCutout: { value: 0 },
        uShadeFloor: { value: 0.62 },
        uRimStrength: { value: 1 },
        uRimColour: { value: SCENE_COLOURS.dark.rim.clone() },
        uCurrents: { value: null },
        uCurrentsOn: { value: 0 },
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
        uDepthFrom: { value: 0 },
        uDepthTo: { value: 1 },
        uIsoValue: { value: 0.5 },
        uIsoEnabled: { value: 0 },
        uVolumeEnabled: { value: 1 },
        uEmphasis: { value: 0.85 },
        uFocusMin: { value: new Vector3(0, 0, 0) },
        uFocusMax: { value: new Vector3(1, 1, 1) },
        uFocusStrength: { value: 0 },
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
    // 1 for a moored buoy. It is drawn as a square rather than a disc, because it is a
    // different kind of instrument and the difference matters: it is anchored, so it has no
    // drift track, and its comparison follows the timeline instead of being pinned to one date.
    // Shape rather than colour, so the distinction survives on either theme and for a viewer
    // who cannot separate the hues.
    const anchored = new Float32Array(this.floats.length);
    this.floats.forEach((item, index) => {
      anchored[index] = item.kind === "mooring" ? 1 : 0;
    });
    geometry.setAttribute("anchored", new BufferAttribute(anchored, 1));

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
        in float anchored;
        uniform float uMorph;
        uniform float uSize;
        out float vSelected;
        out float vFresh;
        out float vAnchored;
        const float PI = 3.141592653589793;
        const float EARTH_RADIUS = ${EARTH_RADIUS.toFixed(6)};
        void main() {
          vSelected = selected;
          vFresh = fresh;
          vAnchored = anchored;
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
        in float vAnchored;
        out vec4 fragColor;
        void main() {
          vec2 offset = gl_PointCoord - 0.5;
          // A disc for a drifting float, a square for an anchored buoy. Chebyshev distance is
          // the square's version of the same radius, so every threshold below reads the same
          // way for both and only the outline changes.
          float distance = mix(length(offset), max(abs(offset.x), abs(offset.y)), vAnchored);
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
      // A moored buoy is anchored. Its "track" is one position repeated, and drawing a line
      // through it would be a measurement claim about a current nobody measured.
      if (item.kind === "mooring") continue;
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

    if (this.volume) {
      const material = this.volume.material as ShaderMaterial;
      (material.uniforms.uBoxMin!.value as Vector3).set(min[0], min[1], min[2]);
      (material.uniforms.uBoxMax!.value as Vector3).set(max[0], max[1], max[2]);
      material.uniforms.uWindowMin!.value = state.windowMin;
      material.uniforms.uWindowMax!.value = state.windowMax;
      material.uniforms.uOpacity!.value = state.opacity;
      material.uniforms.uSteps!.value = state.quality;
      material.uniforms.uDepthFrom!.value = state.depthFrom;
      material.uniforms.uDepthTo!.value = state.depthTo;
      material.uniforms.uIsoEnabled!.value = state.isoEnabled ? 1 : 0;
      material.uniforms.uIsoValue!.value = state.isoValue;
      material.uniforms.uVolumeEnabled!.value = state.volumeEnabled ? 1 : 0;
      material.uniforms.uEmphasis!.value = state.emphasis;
      this.applyFocus(material, state);

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

    this.updateAnomalies(state, frame);

    this.setUniform(this.surface, "uCurrentsOn", state.currentsOpacity);

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

  /**
   * Ring markers on the Anomaly Features of the Timestep on screen.
   *
   * Unlike a Float, a Feature lives at a depth, so these are placed in world space rather than
   * morphed onto a sphere and they only appear once the camera is inside the box. They are rings
   * rather than discs so the water they are marking stays visible through them, and they draw
   * after everything - a marker hidden behind the haze it is labelling is not a marker.
   */
  private buildAnomalies(): void {
    const material = new ShaderMaterial({
      glslVersion: GLSL3,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        uSize: { value: 26 },
        uWarm: { value: new Color(0xd8663f) },
        uCool: { value: new Color(0x4a8fd0) },
        uSelectedColour: { value: SELECTED_COLOUR },
        uPulse: { value: 0 },
      },
      vertexShader: /* glsl */ `
        in float sign;
        in float selected;
        uniform float uSize;
        out float vSign;
        out float vSelected;
        void main() {
          vSign = sign;
          vSelected = selected;
          vec4 view = viewMatrix * modelMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * view;
          gl_PointSize = uSize * (1.0 + 0.35 * selected);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform vec3 uWarm;
        uniform vec3 uCool;
        uniform vec3 uSelectedColour;
        uniform float uPulse;
        in float vSign;
        in float vSelected;
        out vec4 fragColor;
        void main() {
          float distance = length(gl_PointCoord - vec2(0.5));
          if (distance > 0.5) discard;
          // A ring: solid at the rim, hollow in the middle, so the water shows through.
          float ring = smoothstep(0.30, 0.36, distance) * (1.0 - smoothstep(0.44, 0.50, distance));
          float dot = 1.0 - smoothstep(0.07, 0.12, distance);
          float alpha = clamp(ring + dot * 0.9, 0.0, 1.0);
          if (alpha < 0.02) discard;
          vec3 colour = mix(uCool, uWarm, step(0.0, vSign));
          colour = mix(colour, uSelectedColour, vSelected * (0.55 + 0.45 * uPulse));
          fragColor = vec4(colour, alpha * (0.55 + 0.45 * vSelected));
        }
      `,
    });

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(0), 3));
    geometry.setAttribute("sign", new BufferAttribute(new Float32Array(0), 1));
    geometry.setAttribute("selected", new BufferAttribute(new Float32Array(0), 1));

    this.anomalyPoints = new Points(geometry, material);
    this.anomalyPoints.renderOrder = ORDER.anomalies;
    this.anomalyPoints.frustumCulled = false;
    this.anomalyPoints.visible = false;
    this.scene.add(this.anomalyPoints);
  }

  /**
   * The Features that should be on screen: this Timestep's, minus any the Depth Slice has cut
   * away. The slice is described as hiding all water outside its range, so leaving a ring
   * floating over water that is no longer drawn would contradict it - and clicking that ring
   * would open a panel about water the user cannot see.
   *
   * Returned with the original index attached, because that index is what the store selects by.
   */
  private visibleAnomalies(state: ViewState): { feature: AnomalyFeature; index: number }[] {
    // They were found in the anomaly Field and describe departures in it. Drawn over
    // temperature or salinity they would look like markers on that Field, which they are not.
    if (state.fieldKey !== ANOMALY_FIELD) return [];
    const volume = this.manifest.volume;
    const from = axisToDepth(volume, state.depthFrom);
    const to = axisToDepth(volume, state.depthTo);
    return state.anomalies
      .map((feature, index) => ({ feature, index }))
      .filter(({ feature }) => feature.depth >= from && feature.depth <= to);
  }

  /** Where one Feature sits in world space. One place decides, as with everything else. */
  private featurePosition(feature: AnomalyFeature, frame: ReturnType<typeof makeFrame>) {
    return [
      lonToX(feature.lon),
      depthToY(frame, feature.depth),
      latToZ(feature.lat),
    ] as const;
  }

  private updateAnomalies(state: ViewState, frame: ReturnType<typeof makeFrame>): void {
    const points = this.anomalyPoints;
    if (!points) return;

    const shown = this.visibleAnomalies(state);
    // They belong to the water column, so they are meaningless on the globe.
    points.visible = state.showAnomalies && state.morph > 0.55 && shown.length > 0;
    if (!points.visible) return;

    const key = `${state.fieldKey}|${shown.map((s) => s.index).join(",")}|${frame.boxHeight}|${state.selectedAnomaly}`;
    if (key === this.lastAnomalyKey) return;
    this.lastAnomalyKey = key;

    const positions = new Float32Array(shown.length * 3);
    const signs = new Float32Array(shown.length);
    const selected = new Float32Array(shown.length);
    shown.forEach(({ feature, index }, slot) => {
      const [x, y, z] = this.featurePosition(feature, frame);
      positions[slot * 3] = x;
      positions[slot * 3 + 1] = y;
      positions[slot * 3 + 2] = z;
      signs[slot] = feature.sign;
      selected[slot] = index === state.selectedAnomaly ? 1 : 0;
    });

    points.geometry.dispose();
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    geometry.setAttribute("sign", new BufferAttribute(signs, 1));
    geometry.setAttribute("selected", new BufferAttribute(selected, 1));
    points.geometry = geometry;
  }

  /** Nearest Anomaly Feature to a screen point, as an index into this Timestep's list. */
  pickAnomaly(clientX: number, clientY: number, radiusPixels = 20): number | null {
    const state = this.state;
    if (!state?.showAnomalies || state.morph <= 0.55) return null;
    const frame = makeFrame(this.manifest.volume, state.exaggeration);
    const rect = this.canvas.getBoundingClientRect();
    const target = new Vector2(clientX - rect.left, clientY - rect.top);

    let best: number | null = null;
    let bestDistance = radiusPixels;
    this.visibleAnomalies(state).forEach(({ feature, index }) => {
      const [x, y, z] = this.featurePosition(feature, frame);
      const projected = new Vector3(x, y, z).project(this.camera);
      if (projected.z < -1 || projected.z > 1) return;
      const screenX = ((projected.x + 1) / 2) * rect.width;
      const screenY = ((1 - projected.y) / 2) * rect.height;
      const distance = target.distanceTo(new Vector2(screenX, screenY));
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });
    return best;
  }

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

  /**
   * Slide the view sideways onto a position, keeping the camera exactly where it is otherwise.
   *
   * Not `focusOn`, which swings to a fixed 18-unit radius. That is right for a Float - a point
   * you want to get close to - and wrong for a body of water five degrees across: it collapsed
   * the block frame to a single diagonal and put the isolated water off the top of the screen.
   * This keeps the distance and the angle the user has already chosen and only re-centres, so
   * an isolated Feature comes out from behind a panel without the picture changing character.
   */
  panTo(lon: number, lat: number): void {
    const offset = this.camera.position.clone().sub(this.controls.target);
    this.controls.target.set(lon, this.controls.target.y, -lat);
    this.camera.position.copy(this.controls.target).add(offset);
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
      this.setUniform(this.anomalyPoints, "uPulse", 0.5 + 0.5 * Math.sin(this.elapsed * 3));
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
