import {
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  ClampToEdgeWrapping,
  Color,
  Data3DTexture,
  DataTexture,
  DoubleSide,
  GLSL3,
  LinearFilter,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  PerspectiveCamera,
  Points,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  Texture,
  UnsignedByteType,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type {
  AnomalyFeature,
  FieldSpec,
  Manifest,
  OceanFloat,
  SurfaceField,
  VectorField,
} from "../types";
import type { Theme } from "../store";
import { biasColour, colourOf, liftedPalette, surfacePixels } from "../palette";
import { ParticleFlow } from "../particles";
import { smoothSurface } from "../surface";
import { isDiverging, transfer, type Scale } from "../transfer";
import {
  arrowFragmentShader,
  arrowVertexShader,
  sheetFragmentShader,
  sheetVertexShader,
} from "./fieldShaders";
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

/**
 * One instrument's residual, **and the position it was measured at**.
 *
 * The two travel together on purpose. A residual belongs to one cast on one date, so a map of
 * residuals is a composite of every analysis in the bake and not a picture of the Timestep on
 * screen. Carrying the position with the number is what stops the scene drawing the two apart.
 */
export interface BiasMark {
  /** Signed, as a fraction of the Field's own encoded range. */
  bias: number;
  lon: number;
  lat: number;
}

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
  /** Which Field is drawn. The Anomaly Features belong to one of them and to no other. */
  fieldKey: string;
  /**
   * The Field's own spec and palette, needed because three of the render types colour themselves
   * on the CPU rather than in a shader - see `fieldShaders.ts` for why that is the honest way
   * round.
   */
  field: FieldSpec | null;
  paletteColours: number[][];
  /** Linear or logarithmic Transfer Function. One curve, shared with the colourbar. */
  scale: Scale;
  /** This Timestep's hazard Field, when one is selected. Not a Volume; float32 on the Grid. */
  surface: SurfaceField | null;
  /** This Timestep's current components, when the Currents Field is selected. */
  vectors: VectorField | null;
  /** Moving dots or arrows. Two styles of one layer; see `store.ts`. */
  currentStyle: "particles" | "arrows";
  /** This Timestep's Anomaly Features, and which of them is open. */
  anomalies: AnomalyFeature[];
  showAnomalies: boolean;
  selectedAnomaly: number | null;
  /** Hide every part of the water except the selected Anomaly Feature. */
  isolateAnomaly: boolean;
  /**
   * Colour every instrument by how far the model sat from it, instead of by its own colour.
   *
   * The tint is computed on the CPU, in `palette.ts`, exactly like the Sheet's and the arrows' -
   * so the dot in the water and the swatch in the panel go through one function and cannot
   * disagree. Instruments with no comparison for the Field on screen are absent from the map
   * and are drawn hollow rather than being given the palette's midpoint, which would say the
   * model agreed with an instrument nothing compared.
   */
  biasMode: boolean;
  /** Signed bias per instrument id, as a fraction of the Field's own range. Null off-mode. */
  biasByInstrument: Map<string, BiasMark> | null;

  /**
   * Where the bias palette runs out, as a fraction of the Field's own range.
   *
   * The Field's own ninetieth percentile, measured by the bake. It is passed in rather than
   * assumed because the scene once used the verdict threshold instead, and at that scale the
   * median instrument sat 2% of the way along the palette: 90% of the markers came out the
   * same pale midpoint and the whole map read as white.
   */
  biasSaturateAt?: number;
  /**
   * The drift trajectory from a dropped pin, as [lon, lat] pairs, and the pin itself.
   *
   * Integrated in `drift.ts` from the same float32 current files the arrows are drawn from -
   * the Grid, never a Volume, because every step of it is a measurement.
   */
  driftPath: [number, number][] | null;
  driftPin: { lon: number; lat: number } | null;
  /**
   * The selected Float's *predicted* track: where the analysed current says it should have gone
   * from its own first Fix. Drawn against the observed Track already on screen, which is the
   * whole point - it is the only drift demo in this competition with a measurement beside it.
   */
  predictedTrack: [number, number][] | null;
  /**
   * The line a vertical section is cut along: two points, or null.
   *
   * Drawn in the accent colour rather than the drift violet, because it is a different kind of
   * claim: the drift lines are a prediction about water and this is only where a chart was cut.
   */
  sectionLine: [number, number][] | null;
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
const ORDER = {
  surface: 0,
  lines: 5,
  volume: 10,
  // After the water and before the markers. A sheet sitting inside the block has to be drawn
  // over the haze it is suspended in, or it is a sheet nobody can see; the Floats still draw
  // over it, because a Float is a specific instrument and the sheet is a surface it sits on.
  sheet: 12,
  arrows: 14,
  markers: 20,
  anomalies: 25,
} as const;

/**
 * The palette the bias map is drawn in.
 *
 * `balance` is cmocean's diverging scale and is already what the Temperature Anomaly and the
 * Analysis Spread use, so a reader who has seen either of those already knows that the pale
 * middle means "no departure" and the two ends mean opposite signs. A bias is the same shape of
 * quantity, so it gets the same colours rather than a fourth convention.
 */
const BIAS_PALETTE = "balance";

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
    // The drift the analysis implies, against the orange Track that was measured. Violet
    // because it has to be unmistakable next to both the orange track and the pale blue
    // coastline, and because a reader should never have to wonder which line is the model.
    drift: new Color(0xc39bff),
    // Where a vertical section was cut. A different claim from the drift lines - it is not a
    // prediction about water, only where a chart was taken - so a different colour.
    section: new Color(0x63e6c4),
    rim: new Color(0.1, 0.28, 0.42),
    shadeFloor: 0.62,
    coastOpacity: 0.75,
    trackOpacity: 0.5,
    driftOpacity: 0.95,
  },
  light: {
    ocean: new Color(0xdff2f8),
    coast: new Color(0x0e9bb4),
    float: new Color(0x0c2531),
    outline: new Color(0xffffff),
    frame: new Color(0x6f9cb0),
    track: new Color(0xc2621a),
    drift: new Color(0x6b3fc4),
    section: new Color(0x0b7a63),
    rim: new Color(0.0, 0.0, 0.0),
    shadeFloor: 0.88,
    coastOpacity: 1.0,
    trackOpacity: 0.7,
    driftOpacity: 1.0,
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
   * Paint a Field that has no Volume onto the sea surface, or clear it.
   *
   * Cyclone Heat Potential is one number for the whole water column, so there is nothing for a
   * ray to march through and the globe would otherwise show whatever Volume happened to be on
   * the GPU - which is the last Field's data under this Field's name, the worst failure
   * available. The pixels arrive already coloured by `palette.ts`, through the same two
   * functions that draw the colourbar.
   *
   * Takes ownership and releases the texture it replaces, the same contract `setPalette` has.
   */
  private setSurfacePixels(pixels: Uint8Array | null, width: number, height: number): void {
    const material = this.surface?.material as ShaderMaterial | undefined;
    const slot = material?.uniforms.uSurface;
    if (!slot) return;
    (slot.value as Texture | null)?.dispose?.();

    if (!pixels) {
      slot.value = null;
      this.setUniform(this.surface, "uSurfaceOn", 0);
      return;
    }
    const texture = new DataTexture(pixels, width, height, RGBAFormat, UnsignedByteType);
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.wrapS = ClampToEdgeWrapping;
    texture.wrapT = ClampToEdgeWrapping;
    texture.needsUpdate = true;
    slot.value = texture;
    this.setUniform(this.surface, "uSurfaceOn", 1);
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
  private fieldSheet?: Mesh;
  private arrows?: LineSegments;
  private particleLines?: LineSegments;
  private readonly flow = new ParticleFlow(PARTICLE_COUNT);
  /** Which field, Level and Timestep the population is currently drifting through. */
  private lastFlowKey = "";
  /**
   * What the dots need every frame, captured when the view state was last pushed.
   *
   * The trails move on the render loop rather than on a store change, so `advanceFlow` runs
   * between pushes and cannot read `this.state` for a colour: a Field switch would recolour
   * the dots a frame before the geometry that goes with it. Everything it needs is frozen here
   * by `updateParticles` instead.
   */
  private flowContext: {
    field: FieldSpec;
    windowMin: number;
    windowMax: number;
    scale: Scale;
    lifted: number[][];
    trail: [number, number, number];
  } | null = null;
  private trackLines?: LineSegments;
  private driftLine?: LineSegments;
  private predictedLine?: LineSegments;
  private sectionLine?: LineSegments;
  private driftPinPoints?: Points;
  private selectedColumn?: LineSegments;

  private currentVolume?: Data3DTexture;
  private currentPalette?: Texture;
  private lastBoxKey = "";
  private lastColumnKey = "";
  private lastTrackTime = Number.NaN;
  private lastDriftKey = "";
  private lastPredictedKey = "";
  private lastSectionKey = "";
  private lastAnomalyKey = "";
  private lastSheetKey = "";
  private lastArrowKey = "";
  private lastDrapeKey = "";
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
    this.buildDrift();
    this.buildFieldSheet();
    this.buildArrows();
    this.buildParticles();
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
        uLog: { value: 0 },
        uSurface: { value: null },
        uSurfaceOn: { value: 0 },
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
        uLog: { value: 0 },
        uOpacity: { value: 0.012 },
        uSteps: { value: 128 },
        uDepthFrom: { value: 0 },
        uDepthTo: { value: 1 },
        uIsoValue: { value: 0.5 },
        uIsoEnabled: { value: 0 },
        uIsoMirror: { value: 0 },
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
    // The bias map, on the markers themselves. `biasTint` is an RGB the CPU computed through
    // `palette.ts`, and `biasKnown` is 0 for an instrument the Field on screen has no
    // comparison for - drawn hollow, because the palette's midpoint would claim agreement
    // where there was no measurement at all.
    geometry.setAttribute(
      "biasTint",
      new BufferAttribute(new Float32Array(this.floats.length * 3), 3),
    );
    geometry.setAttribute("biasKnown", new BufferAttribute(new Float32Array(this.floats.length), 1));

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
        uBiasMode: { value: 0 },
      },
      vertexShader: /* glsl */ `
        in vec2 lonLat;
        in float selected;
        in float fresh;
        in float anchored;
        in vec3 biasTint;
        in float biasKnown;
        uniform float uMorph;
        uniform float uSize;
        out float vSelected;
        out float vFresh;
        out float vAnchored;
        out vec3 vBiasTint;
        out float vBiasKnown;
        const float PI = 3.141592653589793;
        const float EARTH_RADIUS = ${EARTH_RADIUS.toFixed(6)};
        void main() {
          vSelected = selected;
          vFresh = fresh;
          vAnchored = anchored;
          vBiasTint = biasTint;
          vBiasKnown = biasKnown;
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
        uniform float uBiasMode;
        in float vSelected;
        in float vFresh;
        in float vAnchored;
        in vec3 vBiasTint;
        in float vBiasKnown;
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

          // On the bias map the fill carries the number, so it replaces the plain marker
          // colour but never the selection colour - losing track of which instrument is open
          // would cost more than the tint gains. An instrument with no comparison for this
          // Field keeps its plain colour and loses its bright core, so it reads as "here, but
          // not measured" rather than as a value.
          vec3 mapped = mix(uColour, vBiasTint, uBiasMode * vBiasKnown);
          vec3 fill = mix(mapped, uSelectedColour, vSelected);
          float hollow = uBiasMode * (1.0 - vBiasKnown) * (1.0 - vSelected);
          vec3 colour = mix(uOutline, fill, core * (1.0 - hollow));
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

    for (const object of [this.driftLine, this.predictedLine, this.driftPinPoints]) {
      const material = object?.material as ShaderMaterial | undefined;
      material?.uniforms.uColour?.value.copy(palette.drift);
    }
    (this.sectionLine?.material as ShaderMaterial | undefined)?.uniforms.uColour?.value.copy(
      palette.section,
    );
    this.setUniform(this.sectionLine, "uOpacity", palette.driftOpacity);
    this.setUniform(this.driftLine, "uOpacity", palette.driftOpacity);
    this.setUniform(this.predictedLine, "uOpacity", palette.driftOpacity);

    if (this.boxFrame) (this.boxFrame.material as LineBasicMaterial).color.copy(palette.frame);
  }

  update(state: ViewState): void {
    this.state = state;
    this.setTheme(state.theme);
    const frame = makeFrame(this.manifest.volume, state.exaggeration);
    const { min, max } = boxBounds(frame);

    for (const object of [
      this.surface,
      this.coastlines,
      this.trackLines,
      this.floatPoints,
      this.driftLine,
      this.predictedLine,
      this.sectionLine,
      this.driftPinPoints,
    ]) {
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
    this.setUniform(this.surface, "uLog", state.scale === "log" ? 1 : 0);
    this.updateDrape(state);

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
      // Both skins on a diverging Field. `isDiverging` is the same test the panel uses to label
      // the slider with a plus-or-minus, so the control and the water cannot disagree about how
      // many surfaces are being drawn.
      material.uniforms.uIsoMirror!.value = isDiverging(state.field) ? 1 : 0;
      material.uniforms.uVolumeEnabled!.value = state.volumeEnabled ? 1 : 0;
      material.uniforms.uEmphasis!.value = state.emphasis;
      material.uniforms.uLog!.value = state.scale === "log" ? 1 : 0;
      this.applyFocus(material, state);
      // A Field with no Volume has nothing here to march through, and the texture on the GPU is
      // the last Field's. Drawing it would put one Field's data under another Field's name.
      this.volume.visible = state.morph > 0.55 && !isSurfaceField(state.field);

      this.volume.position.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
      this.volume.scale.set(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
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
      const biasTint = this.floatPoints.geometry.getAttribute("biasTint") as BufferAttribute;
      const biasKnown = this.floatPoints.geometry.getAttribute("biasKnown") as BufferAttribute;
      this.setUniform(this.floatPoints, "uBiasMode", state.biasMode ? 1 : 0);

      // The bias map draws every instrument where its *compared cast* was, not where it is at
      // the Timestep on screen. A residual was measured at one position on one date; drawing it
      // wherever the float has drifted to since would put a number on the wrong water, which is
      // the same mistake `positions_from` exists to prevent on the pipeline side. The comment
      // said this for a round while the line below still called `positionAt`.
      //
      // The map is therefore a **composite of all twelve analyses** and does not thin out with
      // the timeline. That is the second half of the same fix: a marker gated on
      // `freshness(fix.ageDays)` left 196 of 233 on screen at the step the app opens on, under
      // a headline counting 233, and a row in the ranked list could point at nothing at all.
      // The panel says the map is a composite; nothing else here may quietly disagree with it.
      const biases = state.biasMode ? state.biasByInstrument : null;

      this.floats.forEach((item, index) => {
        const mark = biases?.get(item.id);
        const fix = positionAt(item, state.timeMs);
        selected.setX(index, item.id === state.selectedFloatId ? 1 : 0);

        if (biases) {
          // Where the comparison was taken, or - for an instrument this Field never compared -
          // its newest Fix, so the hollow ring the map key names is on screen at every step.
          if (mark) lonLat.setXY(index, mark.lon, mark.lat);
          else lonLat.setXY(index, item.latest.lon, item.latest.lat);
          fresh.setX(index, 1);
        } else {
          fresh.setX(index, fix ? freshness(fix.ageDays) : 0);
          if (fix) lonLat.setXY(index, fix.lon, fix.lat);
        }

        const tint =
          mark === undefined
            ? null
            : biasColour(
                mark.bias,
                this.manifest.palettes[BIAS_PALETTE] ?? [],
                state.theme,
                state.biasSaturateAt,
              );
        if (tint === null) {
          // Either this Field never compared this instrument, or the bake shipped no scale to
          // colour against. Both are "we cannot say", and both draw hollow - a colour on a
          // scale nobody chose is what made the map read as white for a round.
          biasKnown.setX(index, 0);
        } else {
          biasTint.setXYZ(index, tint[0] / 255, tint[1] / 255, tint[2] / 255);
          biasKnown.setX(index, 1);
        }
      });
      selected.needsUpdate = true;
      fresh.needsUpdate = true;
      lonLat.needsUpdate = true;
      biasTint.needsUpdate = true;
      biasKnown.needsUpdate = true;
    }

    this.updateAnomalies(state, frame);
    this.updateSheet(state, frame);
    this.updateArrows(state, frame);
    this.updateParticles(state, frame);
    this.updateDrift(state);

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
  /**
   * The two drift lines and the pin, all violet, all the same claim.
   *
   * One line is the trajectory from a dropped pin; the other is where the analysed current says
   * the selected Float should have gone from its own first Fix. They are the same quantity - the
   * drift the ocean analysis alone implies - so they are the same colour, and what distinguishes
   * them is that one starts at a pin and the other starts at an instrument.
   *
   * They reuse the coastline shader, which is the one that already knows how to draw a lon/lat
   * polyline through the globe-to-map morph. `renderOrder` is ORDER.lines, beside the Tracks
   * they are meant to be read against - ADR 0006, because Three's centroid sort is meaningless
   * for world-spanning geometry.
   */
  private buildDrift(): void {
    const line = (colour = SCENE_COLOURS.dark.drift) => {
      const geometry = new BufferGeometry();
      geometry.setAttribute("lonLat", new BufferAttribute(new Float32Array(0), 2));
      geometry.setAttribute("position", new BufferAttribute(new Float32Array(0), 3));
      const object = new LineSegments(
        geometry,
        new ShaderMaterial({
          glslVersion: GLSL3,
          vertexShader: coastlineVertexShader,
          fragmentShader: coastlineFragmentShader,
          transparent: true,
          uniforms: {
            uMorph: { value: 0 },
            uColour: { value: colour.clone() },
            uOpacity: { value: SCENE_COLOURS.dark.driftOpacity },
          },
        }),
      );
      object.renderOrder = ORDER.lines;
      object.frustumCulled = false;
      object.visible = false;
      this.scene.add(object);
      return object;
    };
    this.driftLine = line();
    this.predictedLine = line();
    this.sectionLine = line(SCENE_COLOURS.dark.section);

    // The pin itself: one point, drawn as a ring so it reads as a place rather than as an
    // instrument. A filled disc here would be a fifth kind of dot on a map that already has
    // floats, buoys, anomaly rings and the selected marker.
    const geometry = new BufferGeometry();
    geometry.setAttribute("lonLat", new BufferAttribute(new Float32Array(2), 2));
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(3), 3));
    this.driftPinPoints = new Points(
      geometry,
      new ShaderMaterial({
        glslVersion: GLSL3,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uMorph: { value: 0 },
          uColour: { value: SCENE_COLOURS.dark.drift.clone() },
        },
        vertexShader: /* glsl */ `
          in vec2 lonLat;
          uniform float uMorph;
          const float PI = 3.141592653589793;
          const float EARTH_RADIUS = ${EARTH_RADIUS.toFixed(6)};
          void main() {
            float phi = radians(lonLat.x);
            float theta = radians(lonLat.y);
            float r = EARTH_RADIUS + 0.16;
            vec3 sphere = vec3(r * cos(theta) * sin(phi), r * sin(theta), r * cos(theta) * cos(phi));
            vec3 plane = vec3(lonLat.x, 0.16, -lonLat.y);
            vec4 view = viewMatrix * vec4(mix(sphere, plane, uMorph), 1.0);
            gl_Position = projectionMatrix * view;
            gl_PointSize = 18.0 * (60.0 / -view.z);
          }
        `,
        fragmentShader: /* glsl */ `
          precision highp float;
          uniform vec3 uColour;
          out vec4 fragColor;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            if (d > 0.5) discard;
            float ring = smoothstep(0.24, 0.30, d) * (1.0 - smoothstep(0.42, 0.48, d));
            float dot_ = 1.0 - smoothstep(0.08, 0.13, d);
            float alpha = clamp(ring + dot_, 0.0, 1.0);
            if (alpha < 0.02) discard;
            fragColor = vec4(uColour, alpha);
          }
        `,
      }),
    );
    this.driftPinPoints.renderOrder = ORDER.markers;
    this.driftPinPoints.frustumCulled = false;
    this.driftPinPoints.visible = false;
    this.scene.add(this.driftPinPoints);
  }

  /** Rebuild a drift polyline only when its points actually changed. */
  private updateDrift(state: ViewState): void {
    const apply = (
      object: LineSegments | undefined,
      points: [number, number][] | null,
      lastKey: "lastDriftKey" | "lastPredictedKey" | "lastSectionKey",
    ) => {
      if (!object) return;
      object.visible = !!points && points.length > 1;
      const key = points ? `${points.length}|${points[0]?.[0]},${points[0]?.[1]}|${points[points.length - 1]?.[0]},${points[points.length - 1]?.[1]}` : "";
      if (key === this[lastKey]) return;
      this[lastKey] = key;
      const lonLat: number[] = [];
      for (let i = 0; points && i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        if (!a || !b) continue;
        lonLat.push(a[0], a[1], b[0], b[1]);
      }
      object.geometry.dispose();
      const geometry = new BufferGeometry();
      geometry.setAttribute("lonLat", new BufferAttribute(new Float32Array(lonLat), 2));
      geometry.setAttribute(
        "position",
        new BufferAttribute(new Float32Array((lonLat.length / 2) * 3), 3),
      );
      object.geometry = geometry;
    };

    apply(this.driftLine, state.driftPath, "lastDriftKey");
    apply(this.predictedLine, state.predictedTrack, "lastPredictedKey");
    apply(this.sectionLine, state.sectionLine, "lastSectionKey");

    if (this.driftPinPoints) {
      this.driftPinPoints.visible = !!state.driftPin;
      if (state.driftPin) {
        const lonLat = this.driftPinPoints.geometry.getAttribute("lonLat") as BufferAttribute;
        lonLat.setXY(0, state.driftPin.lon, state.driftPin.lat);
        lonLat.needsUpdate = true;
      }
    }
  }

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

  // ------------------------------------------------------- Fields that are not Volumes

  /**
   * The mesh three hazard Fields share.
   *
   * Depth of 26 degrees, Mixed Layer Depth and Isothermal Layer Depth all report a depth, so
   * they are drawn as a surface sitting at that depth inside the block. Build it once and three
   * Fields have it; the two column totals reuse the same mesh at the sea surface, which is where
   * a whole-column number honestly lives.
   *
   * Colour is per vertex and computed on the CPU, by the same `colourOf` the colourbar swatch
   * uses. No shader here knows a unit or a range, so none of them can disagree with the legend.
   */
  private buildFieldSheet(): void {
    const material = new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: sheetVertexShader,
      fragmentShader: sheetFragmentShader,
      transparent: true,
      depthWrite: false,
      side: DoubleSide, // you fly under the 26 degree surface, and it has to still be there
      uniforms: {
        uMorph: { value: 0 },
        uOpacity: { value: 0.92 },
        uFade: { value: 0 },
      },
    });

    this.fieldSheet = new Mesh(emptySheetGeometry(), material);
    this.fieldSheet.renderOrder = ORDER.sheet;
    this.fieldSheet.frustumCulled = false;
    this.fieldSheet.visible = false;
    this.scene.add(this.fieldSheet);
  }

  private buildArrows(): void {
    const material = new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: arrowVertexShader,
      fragmentShader: arrowFragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        uMorph: { value: 0 },
        uOpacity: { value: 0.95 },
      },
    });

    this.arrows = new LineSegments(emptySheetGeometry(), material);
    this.arrows.renderOrder = ORDER.arrows;
    this.arrows.frustumCulled = false;
    this.arrows.visible = false;
    this.scene.add(this.arrows);
  }

  /**
   * The dots, drawn with the arrows' own shader.
   *
   * A trail is a run of short line segments whose alpha falls off towards the tail, and the
   * arrow shader already takes a per-vertex `tint` with an alpha in it - so the two styles of
   * this layer share a material as well as a palette, and neither can drift out of step with the
   * colourbar. The buffers are allocated once at their largest and written in place; only the
   * draw range moves, because a few thousand `new Float32Array` a second is how a smooth
   * animation becomes a stuttering one.
   */
  private buildParticles(): void {
    const material = new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: arrowVertexShader,
      fragmentShader: arrowFragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        uMorph: { value: 0 },
        uOpacity: { value: 0.95 },
      },
    });

    // The flow owns these arrays; the geometry is a view onto them, so `build` writing into the
    // population is the same thing as writing into the vertex buffer.
    const empty = this.flow.build(() => null);
    const vertices = empty.lonLat.length / 2;
    const geometry = new BufferGeometry();
    geometry.setAttribute("lonLat", new BufferAttribute(empty.lonLat, 2));
    geometry.setAttribute("tint", new BufferAttribute(empty.tint, 4));
    geometry.setAttribute("depthY", new BufferAttribute(new Float32Array(vertices), 1));
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(vertices * 3), 3));
    geometry.setDrawRange(0, 0);

    this.particleLines = new LineSegments(geometry, material);
    this.particleLines.renderOrder = ORDER.arrows;
    this.particleLines.frustumCulled = false;
    this.particleLines.visible = false;
    this.scene.add(this.particleLines);
  }

  /**
   * The sea-surface painting for a Field that has no Volume.
   *
   * On the globe this is the whole picture - a map of Cyclone Heat Potential over the region -
   * and in the Volume View it is what the sheet mesh takes over from, because the sea surface is
   * cut away there so you can see into the water.
   */
  private updateDrape(state: ViewState): void {
    if (!isSurfaceField(state.field) || !state.surface || !state.field) {
      if (this.lastDrapeKey !== "") {
        this.lastDrapeKey = "";
        this.setSurfacePixels(null, 0, 0);
      }
      return;
    }
    const key = [
      state.field.key,
      state.timestepIndex,
      state.windowMin.toFixed(3),
      state.windowMax.toFixed(3),
      state.scale,
      state.theme,
    ].join("|");
    if (key === this.lastDrapeKey) return;
    this.lastDrapeKey = key;

    // The drape is resampled inside surfacePixels, so the texture is larger than the file. Its
    // own dimensions come back with it rather than being read off the Grid.
    const drape = surfacePixels(
      state.surface,
      state.field,
      state.windowMin,
      state.windowMax,
      state.scale,
      state.paletteColours,
      state.theme,
    );
    this.setSurfacePixels(drape.pixels, drape.width, drape.height);
  }

  /**
   * The sheet, rebuilt when anything it is made of changes.
   *
   * A quad is drawn only when all four of its corners carry a value. Mask is NaN and a value
   * outside the Transfer Function window is dropped rather than clamped - the same rule the
   * Volume follows, and the reason narrowing the range on Depth of 26 degrees to 80-150 m is a
   * way of asking where the deep warm water is rather than just a recolouring.
   *
   * The lattice is resampled first, through the same `smoothSurface` the Drape goes through, so
   * the two cannot disagree about where the coast is. Two things follow from that. The mesh
   * stops looking like 110 km tiles, and the coast stops being a cliff: a corner's alpha is now
   * the share of its source cells that held water, so the edge fades over about 28 km instead
   * of dropping a quad. That ramp is only for Mask. A value the window excludes still leaves a
   * hard edge, because that edge is the answer to the question the window asks.
   */
  private updateSheet(state: ViewState, frame: ReturnType<typeof makeFrame>): void {
    const sheet = this.fieldSheet;
    if (!sheet) return;

    const field = state.field;
    const surface = state.surface;
    if (!isSurfaceField(field) || !surface || !field) {
      sheet.visible = false;
      this.lastSheetKey = "";
      return;
    }

    sheet.visible = state.morph > 0.55;
    this.setUniform(sheet, "uMorph", state.morph);
    this.setUniform(sheet, "uFade", smoothLimit(state.morph));
    if (!sheet.visible) return;

    const key = [
      field.key,
      state.timestepIndex,
      state.windowMin.toFixed(3),
      state.windowMax.toFixed(3),
      state.scale,
      state.theme,
      frame.boxHeight.toFixed(2),
    ].join("|");
    if (key === this.lastSheetKey) return;
    this.lastSheetKey = key;

    const volume = this.manifest.volume;
    const lifted = liftedPalette(state.paletteColours, state.theme);
    const smooth = smoothSurface(surface);
    const { width, height } = smooth;
    // A column total has no depth of its own, so it is drawn just under the sea surface rather
    // than at 0 - exactly at the box top face it would fight the frame for the same pixels.
    const drapeY = -0.004 * frame.boxHeight;

    const lonLat = new Float32Array(width * height * 2);
    const depthY = new Float32Array(width * height);
    const tint = new Float32Array(width * height * 4);
    const drawn = new Uint8Array(width * height);

    for (let row = 0; row < height; row++) {
      for (let column = 0; column < width; column++) {
        const index = row * width + column;
        const value = smooth.values[index] ?? NaN;
        lonLat[index * 2] = volume.west + (column * (volume.east - volume.west)) / (width - 1);
        lonLat[index * 2 + 1] = volume.south + (row * (volume.north - volume.south)) / (height - 1);

        const colour = colourOf(value, field, state.windowMin, state.windowMax, state.scale, lifted);
        if (!colour) continue;
        depthY[index] = field.render === "depth" ? depthToY(frame, value) : drapeY;
        tint[index * 4] = colour[0] / 255;
        tint[index * 4 + 1] = colour[1] / 255;
        tint[index * 4 + 2] = colour[2] / 255;
        // The coast, as a ramp rather than a cliff. Full where four source cells held water,
        // partial where some of them were land.
        tint[index * 4 + 3] = Math.min(Math.max(smooth.coverage[index] ?? 0, 0), 1);
        drawn[index] = 1;
      }
    }

    const indices: number[] = [];
    for (let row = 0; row < height - 1; row++) {
      for (let column = 0; column < width - 1; column++) {
        const a = row * width + column;
        const b = a + 1;
        const c = a + width;
        const d = c + 1;
        if (!drawn[a] || !drawn[b] || !drawn[c] || !drawn[d]) continue;
        indices.push(a, c, b, b, c, d);
      }
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute("lonLat", new BufferAttribute(lonLat, 2));
    geometry.setAttribute("depthY", new BufferAttribute(depthY, 1));
    geometry.setAttribute("tint", new BufferAttribute(tint, 4));
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(width * height * 3), 3));
    geometry.setIndex(indices);
    sheet.geometry.dispose();
    sheet.geometry = geometry;
  }

  /**
   * Current arrows on the depth the user has sliced to.
   *
   * Read from the float32 vector file - the Grid - and never from a Volume, so the length of
   * every arrow is a measurement. The direction is corrected for the convergence of the
   * meridians: a degree of longitude is shorter than a degree of latitude away from the equator,
   * and without the correction an arrow at 25 N points about 10 degrees off true.
   */
  private updateArrows(state: ViewState, frame: ReturnType<typeof makeFrame>): void {
    const arrows = this.arrows;
    if (!arrows) return;

    const field = state.field;
    const vectors = state.vectors;
    // Two styles of one layer, so the one that is not chosen draws nothing at all. Leaving both
    // on would put two encodings of the same vector on screen at once, which is the confusion
    // `describePalette` exists to prevent, one layer along.
    if (!field || field.render !== "vector" || !vectors || state.currentStyle !== "arrows") {
      arrows.visible = false;
      this.lastArrowKey = "";
      return;
    }

    arrows.visible = true;
    this.setUniform(arrows, "uMorph", state.morph);

    const volume = this.manifest.volume;
    const levels = volume.levelMetres ?? [];
    // Which depth the arrows sit on: the top of the depth slice in the Volume View, and the
    // Level painted on the map on the globe. One control each way, no third slider.
    const metres = axisToDepth(volume, state.morph > 0.55 ? state.depthFrom : state.surfaceLevel);
    let level = 0;
    for (let i = 1; i < levels.length; i++) {
      if (Math.abs((levels[i] ?? 0) - metres) < Math.abs((levels[level] ?? 0) - metres)) level = i;
    }

    const key = [
      state.timestepIndex,
      level,
      state.windowMin.toFixed(3),
      state.windowMax.toFixed(3),
      state.scale,
      state.theme,
      frame.boxHeight.toFixed(2),
    ].join("|");
    if (key === this.lastArrowKey) return;
    this.lastArrowKey = key;

    const lifted = liftedPalette(state.paletteColours, state.theme);
    const { width, height } = vectors;
    const y = depthToY(frame, levels[level] ?? volume.surfaceMetres);
    const fastest = Math.max(field.range[1], 1e-3);

    const lonLat: number[] = [];
    const depthY: number[] = [];
    const tint: number[] = [];

    const push = (lon: number, lat: number, colour: [number, number, number]) => {
      lonLat.push(lon, lat);
      depthY.push(y);
      tint.push(colour[0] / 255, colour[1] / 255, colour[2] / 255, 1);
    };

    for (let row = 0; row < height; row += ARROW_STRIDE) {
      for (let column = 0; column < width; column += ARROW_STRIDE) {
        const at = ((level * height + row) * width + column) * 2;
        const u = vectors.values[at] ?? NaN;
        const v = vectors.values[at + 1] ?? NaN;
        if (!Number.isFinite(u) || !Number.isFinite(v)) continue;

        const speed = Math.hypot(u, v);
        const colour = colourOf(speed, field, state.windowMin, state.windowMax, state.scale, lifted);
        if (!colour || speed < 1e-4) continue;

        const lon = volume.west + (column * (volume.east - volume.west)) / (width - 1);
        const lat = volume.south + (row * (volume.north - volume.south)) / (height - 1);
        // A degree of longitude is shorter than a degree of latitude, so an eastward component
        // has to be drawn longer to point the same way on a plate-carree map.
        const stretch = 1 / Math.max(Math.cos((lat * Math.PI) / 180), 0.2);
        // Length goes through the same curve the colour does.
        //
        // It used to be linear in `speed / fastest` while the colour went through `transfer`, so
        // on a log scale one arrow encoded its own speed two different ways at once: short and
        // dark. The guide entry for the scale sends people to Current Speed and tells them to
        // switch to Log, so that contradiction was on the recommended path. Proportionality was
        // never the argument for leaving it linear either - ARROW_MIN means a zero-speed arrow
        // is already 0.45 degrees long.
        const length =
          ARROW_MIN +
          (ARROW_MAX - ARROW_MIN) * transfer(Math.min(speed / fastest, 1), state.scale);

        const east = (u / speed) * length;
        const north = (v / speed) * length;
        const tipLon = lon + east * stretch;
        const tipLat = lat + north;

        push(lon, lat, colour);
        push(tipLon, tipLat, colour);
        // Two barbs, swept back from the tip and rotated in true compass space before being
        // stretched, so the head stays symmetrical at every latitude.
        for (const angle of [2.5, -2.5]) {
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          const barbEast = (east * cos - north * sin) * 0.34;
          const barbNorth = (east * sin + north * cos) * 0.34;
          push(tipLon, tipLat, colour);
          push(tipLon + barbEast * stretch, tipLat + barbNorth, colour);
        }
      }
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute("lonLat", new BufferAttribute(new Float32Array(lonLat), 2));
    geometry.setAttribute("depthY", new BufferAttribute(new Float32Array(depthY), 1));
    geometry.setAttribute("tint", new BufferAttribute(new Float32Array(tint), 4));
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(depthY.length * 3), 3));
    arrows.geometry.dispose();
    arrows.geometry = geometry;
  }

  /**
   * Point the dots at the Timestep and depth on screen, and freeze what they need to colour
   * themselves. Moving them is the render loop's job - see `advanceFlow`.
   *
   * The depth is the **same** one the arrows use, read from the same control, because these are
   * two styles of one layer and not two layers. A dot and an arrow at the same place have to be
   * describing the same water.
   */
  private updateParticles(state: ViewState, frame: ReturnType<typeof makeFrame>): void {
    const lines = this.particleLines;
    if (!lines) return;

    const field = state.field;
    const vectors = state.vectors;
    if (!field || field.render !== "vector" || !vectors || state.currentStyle !== "particles") {
      lines.visible = false;
      this.lastFlowKey = "";
      this.flowContext = null;
      return;
    }

    lines.visible = true;
    this.setUniform(lines, "uMorph", state.morph);

    const volume = this.manifest.volume;
    const levels = volume.levelMetres ?? [];
    const metres = axisToDepth(volume, state.morph > 0.55 ? state.depthFrom : state.surfaceLevel);
    let level = 0;
    for (let i = 1; i < levels.length; i++) {
      if (Math.abs((levels[i] ?? 0) - metres) < Math.abs((levels[level] ?? 0) - metres)) level = i;
    }

    this.flowContext = {
      field,
      windowMin: state.windowMin,
      windowMax: state.windowMax,
      scale: state.scale,
      lifted: liftedPalette(state.paletteColours, state.theme),
      trail: state.theme === "light" ? TRAIL_INK_LIGHT : TRAIL_INK_DARK,
    };

    // The plane the dots sit on, in world units. One value for every vertex, so it is written
    // only when the depth or the exaggeration actually moves it.
    const y = depthToY(frame, levels[level] ?? volume.surfaceMetres);
    const depthY = lines.geometry.getAttribute("depthY") as BufferAttribute;
    if (depthY.array[0] !== y) {
      (depthY.array as Float32Array).fill(y);
      depthY.needsUpdate = true;
    }

    // Re-seeding on a Timestep or depth change is the honest thing: a trail drawn half in one
    // analysis and half in the next is a line no water ever took.
    const key = `${state.timestepIndex}|${level}`;
    if (key !== this.lastFlowKey) {
      this.lastFlowKey = key;
      this.flow.setField(vectors, volume, level);
    }
  }

  /**
   * Move the dots one frame and rewrite their vertices.
   *
   * Called from the render loop rather than from `update`, because the flow animates while
   * nothing in the store is changing. It draws only what `updateParticles` last approved: with
   * no context - another Field is selected, or the style is arrows - there is nothing to move.
   */
  private advanceFlow(seconds: number): void {
    const lines = this.particleLines;
    const context = this.flowContext;
    if (!lines || !lines.visible || !context || !this.flow.ready) return;

    this.flow.advance(seconds);
    // The palette still decides **whether** a dot is drawn - a speed outside the Transfer
    // Function window drops its trail, exactly as it drops an arrow - and then the trail is
    // inked rather than tinted. See TRAIL_INK_DARK for why.
    const built = this.flow.build((speed) =>
      colourOf(
        speed,
        context.field,
        context.windowMin,
        context.windowMax,
        context.scale,
        context.lifted,
      )
        ? context.trail
        : null,
    );

    const geometry = lines.geometry;
    (geometry.getAttribute("lonLat") as BufferAttribute).needsUpdate = true;
    (geometry.getAttribute("tint") as BufferAttribute).needsUpdate = true;
    geometry.setDrawRange(0, built.vertices);
  }

  // ---------------------------------------------------------------- test hooks
  //
  // Four accessors that exist only for `web/probe-particles.mjs`. This project's rule is that a
  // rendering claim is measured rather than looked at, and measuring the flow needs three things
  // a probe cannot reach from outside: the population itself, the Level it is drifting on, and
  // the ability to hide one layer **without touching the store**. A store change would rebuild
  // the geometry and set `visible` back to true, which is exactly how a visible layer was once
  // measured as invisible here.

  /** The live population, so a probe can check every dot against the mask. */
  particleFlowForTest(): ParticleFlow {
    return this.flow;
  }

  /** Which Level the dots are drifting on, as an index into `levelMetres`. */
  particleLevelForTest(): number {
    return Number(this.lastFlowKey.split("|")[1] ?? 0);
  }

  /** Which of the two current styles is on screen. Exactly one of them should be. */
  currentLayersForTest(): { arrows: boolean; dots: boolean } {
    return {
      arrows: this.arrows?.visible === true,
      dots: this.particleLines?.visible === true,
    };
  }

  /** Hide or show one layer for a frame pair, without going through the store. */
  setLayerVisibleForTest(layer: "particles" | "arrows", visible: boolean): void {
    const mesh = layer === "particles" ? this.particleLines : this.arrows;
    if (mesh) mesh.visible = visible;
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

  /**
   * The current under the cursor: a real speed and a real heading, read from the Grid.
   *
   * This is the sentence the old rendered overlay could not say. A tile physically cannot give
   * you a number, so the layer that preceded this one carried arrows nobody could measure - and
   * `CONTEXT.md` listed "current numbers" under what the platform deliberately did not do. It
   * does now, and the number comes from the same float32 file the arrows are drawn from, never
   * from a Volume.
   *
   * Only inside the Volume View, where the arrows sit on one horizontal plane and a ray through
   * the pixel meets it exactly once. On the globe there is no plane to hit and the honest answer
   * is no answer.
   */
  /**
   * Where on the water a screen point lands, in degrees, or null off the block.
   *
   * A ray from the camera through the pixel, met against one horizontal plane inside the box.
   * Done by hand rather than with a Raycaster because there is nothing to hit: the arrows are
   * line segments a few pixels wide and the water is a ray march, and nobody can point at
   * either. It is only meaningful inside the Volume View, where the world is a flat map with a
   * box on it; on the globe the same pixel is a point on a sphere and this returns null rather
   * than a plausible wrong answer.
   *
   * Both the current readout and the drift pin read this, so the number under the cursor and
   * the place a pin lands cannot disagree about where the cursor is.
   */
  pickWater(clientX: number, clientY: number, metres?: number): { lon: number; lat: number } | null {
    const state = this.state;
    if (!state || state.morph <= 0.55) return null;
    const volume = this.manifest.volume;
    const frame = makeFrame(volume, state.exaggeration);
    const planeY = depthToY(frame, metres ?? volume.surfaceMetres);

    const rect = this.canvas.getBoundingClientRect();
    const ndc = new Vector3(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
      0.5,
    ).unproject(this.camera);
    const direction = ndc.sub(this.camera.position);
    if (Math.abs(direction.y) < 1e-6) return null;
    const t = (planeY - this.camera.position.y) / direction.y;
    if (t <= 0) return null;

    const lon = this.camera.position.x + direction.x * t;
    const lat = -(this.camera.position.z + direction.z * t);
    if (lon < volume.west || lon > volume.east || lat < volume.south || lat > volume.north) {
      return null;
    }
    return { lon, lat };
  }

  pickCurrent(clientX: number, clientY: number) {
    const state = this.state;
    if (!state?.vectors || state.field?.render !== "vector" || state.morph <= 0.55) return null;

    const volume = this.manifest.volume;
    const levels = volume.levelMetres ?? [];
    const metres = axisToDepth(volume, state.depthFrom);
    let level = 0;
    for (let i = 1; i < levels.length; i++) {
      if (Math.abs((levels[i] ?? 0) - metres) < Math.abs((levels[level] ?? 0) - metres)) level = i;
    }

    const at = this.pickWater(clientX, clientY, levels[level] ?? volume.surfaceMetres);
    if (!at) return null;
    const { lon, lat } = at;

    const { width, height, values } = state.vectors;
    const column = ((lon - volume.west) / (volume.east - volume.west)) * (width - 1);
    const row = ((lat - volume.south) / (volume.north - volume.south)) * (height - 1);
    // Bilinear, and a Masked corner makes the answer Masked rather than falling back to the
    // corners that do have data - the same rule Grid.column_at follows in the pipeline, and for
    // the same reason: near a coast the corners with data are the open ocean.
    const c0 = Math.min(Math.floor(column), width - 2);
    const r0 = Math.min(Math.floor(row), height - 2);
    const fx = column - c0;
    const fy = row - r0;

    let u = 0;
    let v = 0;
    for (const [dr, dc, weight] of [
      [0, 0, (1 - fy) * (1 - fx)],
      [0, 1, (1 - fy) * fx],
      [1, 0, fy * (1 - fx)],
      [1, 1, fy * fx],
    ] as const) {
      const at = ((level * height + (r0 + dr)) * width + (c0 + dc)) * 2;
      const cu = values[at];
      const cv = values[at + 1];
      if (cu === undefined || cv === undefined || !Number.isFinite(cu) || !Number.isFinite(cv)) {
        return null;
      }
      u += cu * weight;
      v += cv * weight;
    }

    // Compass heading: the direction the water is going to, clockwise from north.
    const heading = (450 - (Math.atan2(v, u) * 180) / Math.PI) % 360;
    return {
      speed: Math.hypot(u, v),
      heading,
      lon,
      lat,
      metres: levels[level] ?? volume.surfaceMetres,
    };
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
      const seconds = (now - previous) / 1000;
      this.elapsed += seconds;
      previous = now;

      // The dots move on the clock, not on a store change: nothing in the state changes between
      // one frame of a flow and the next.
      this.advanceFlow(seconds);
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

/** How far apart the arrows are, in grid nodes. Every node is 2016 arrows and reads as texture. */
const ARROW_STRIDE = 2;
/** Arrow length in degrees, at zero speed and at the top of the Field range. */
const ARROW_MIN = 0.45;
const ARROW_MAX = 1.7;

/**
 * How many dots carry the flow.
 *
 * Measured on the software renderer the probes drive - the slowest thing this has to survive -
 * 2,400 particles with a 20-segment trail is 96,000 vertices rebuilt a frame, and the buffers
 * are written in place rather than reallocated. Fewer than about a thousand and the basin looks
 * sparse; more and the open ocean turns into static and the coastline stops reading.
 */
const PARTICLE_COUNT = 2400;

/**
 * The colour of a trail, and the one place in this project where a mark is **not** coloured by
 * its own value.
 *
 * Taking the colour from the palette is the obvious thing and it makes the layer illegible. The
 * dot sits directly on top of water coloured by the same number through the same palette, so
 * wherever the current is slow the dot is pale cream on pale cream: **zero contrast, by
 * construction, over most of the basin.** Measured by eye and confirmed by the user on both
 * themes - the fast water reads and the Arabian Sea interior draws nothing you can see.
 *
 * So the trail carries **direction** and the speed is carried three other ways that all still
 * work: the water underneath it, how far a dot travels per frame, and the real number under the
 * cursor. Colouring the trail by speed was a fourth copy of one fact, and it was the copy that
 * cost the picture its legibility.
 *
 * This is what Copernicus's MyOcean Pro and earth.nullschool both do, for the same reason. The
 * legend and the guide entry say so: the map key names the trails as flow and the *water* as
 * speed, so nothing on screen claims the trail's colour means anything.
 *
 * The window still filters. A dot whose speed falls outside the Transfer Function window is
 * dropped, not inked - the range control stays analytical.
 */
const TRAIL_INK_DARK: [number, number, number] = [240, 246, 247];
const TRAIL_INK_LIGHT: [number, number, number] = [22, 30, 32];

/** A Field with no Volume: its value is a depth, or a total for the whole water column. */
function isSurfaceField(field: FieldSpec | null | undefined): boolean {
  return field?.render === "depth" || field?.render === "column";
}

function emptySheetGeometry(): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("lonLat", new BufferAttribute(new Float32Array(0), 2));
  geometry.setAttribute("depthY", new BufferAttribute(new Float32Array(0), 1));
  geometry.setAttribute("tint", new BufferAttribute(new Float32Array(0), 4));
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(0), 3));
  return geometry;
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
