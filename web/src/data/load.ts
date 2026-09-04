import {
  Data3DTexture,
  DataTexture,
  LinearFilter,
  RGBAFormat,
  ClampToEdgeWrapping,
  Texture,
  UnsignedByteType,
} from "three";
import { liftedPalette } from "../palette";
import type {
  AnomalyFeature,
  BakedDrift,
  Collocation,
  Manifest,
  NativeGrid,
  OceanFloat,
  Residuals,
  SurfaceField,
  VectorField,
} from "../types";
import type { Theme } from "../store";

const DATA_ROOT = `${import.meta.env.BASE_URL}data`;

async function getJson<T>(name: string): Promise<T> {
  const response = await fetch(`${DATA_ROOT}/${name}`);
  if (!response.ok) throw new Error(`could not load ${name} (HTTP ${response.status})`);
  return (await response.json()) as T;
}

export const loadManifest = () => getJson<Manifest>("manifest.json");
export const loadFloats = () => getJson<OceanFloat[]>("floats.json");

/**
 * Every matched depth for every collocated Float. Deliberately **not** on the critical path.
 *
 * Measured on the production build, this one file is 9.08 MB raw and 2.42 MB over the wire -
 * 73% of everything the app fetches before it can draw. Waiting on it put 17.1 s of blank
 * loading screen in front of a 1.5 Mbit venue network, and nothing needs it until somebody
 * clicks a Float. It is fetched in the background once the scene is up, so in practice it has
 * always arrived by the time anyone clicks; `collocationsReady` covers the case where it has
 * not.
 */
export const loadCollocations = () => getJson<Record<string, Collocation>>("collocations.json");
/** One list per Timestep, strongest first. */
export const loadAnomalies = () => getJson<AnomalyFeature[][]>("anomalies.json");

/**
 * Where the model most disagrees with the instruments: 151 KB, against `collocations.json`'s
 * 10.5 MB.
 *
 * Every number in it is derived from that larger file, and it exists separately for exactly
 * that reason - the bias map is the answer to "so where is it wrong", and waiting on ten
 * megabytes of depth arrays to draw 233 coloured dots would be paying for the charts nobody has
 * opened yet. See `pipeline/samudra/residuals.py`.
 */
export const loadResiduals = () => getJson<Residuals>("residuals.json");

/**
 * The drift check: every Float's own track against the trajectory the analysed currents imply.
 *
 * 560 KB. It is the measurement that turns a drift toy into a validated one, and it is baked
 * rather than integrated live because the numbers on the panel have to be the ones
 * `pipeline/samudra/drift.py` produced and tests cover - see the note at the top of `drift.ts`.
 */
export const loadDrift = () => getJson<BakedDrift>("drift.json");

/**
 * One Field at one Timestep on the model's own Levels: the **Grid**, not a Volume.
 *
 * 194 KB apiece, fetched only when a section is drawn. This is what makes the vertical section
 * a measurement rather than a picture of one, and what lets it work on the static deployment
 * where there is no API to ask.
 */
export async function loadNativeGrid(
  path: string,
  levels: number,
  width: number,
  height: number,
): Promise<NativeGrid> {
  const response = await fetch(`${DATA_ROOT}/${path}`);
  if (!response.ok) throw new Error(`could not load grid ${path} (HTTP ${response.status})`);

  const buffer = await response.arrayBuffer();
  const expected = levels * width * height * 4;
  if (buffer.byteLength !== expected) {
    throw new Error(`grid ${path} is ${buffer.byteLength} bytes, expected ${expected}`);
  }
  return { levels, width, height, values: new Float32Array(buffer) };
}

/**
 * Fetch one Volume and hand it to the GPU.
 *
 * Linear filtering is deliberate on every channel. On the value channel it is what smooths a
 * 1-degree grid into something that reads as water; on the coverage channel it is what turns a
 * stair-stepped coastline into a clean edge. It is only safe because the bake back-fills masked
 * cells with a real neighbouring value - see the note in `pipeline/samudra/volume.py`.
 */
export async function loadVolumeTexture(
  path: string,
  width: number,
  height: number,
  depth: number,
): Promise<Data3DTexture> {
  // An uploaded file's Volume comes from the API and carries its own absolute URL, so the data
  // root is prefixed only to the baked, relative ones. Everything else about the two is
  // identical - the same lattice, the same four bytes a voxel, the same shader.
  const url = /^https?:\/\//.test(path) ? path : `${DATA_ROOT}/${path}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`could not load volume ${path} (HTTP ${response.status})`);

  const bytes = new Uint8Array(await response.arrayBuffer());
  const expected = width * height * depth * 4;
  if (bytes.length !== expected) {
    throw new Error(`volume ${path} is ${bytes.length} bytes, expected ${expected}`);
  }

  const texture = new Data3DTexture(bytes, width, height, depth);
  texture.format = RGBAFormat;
  texture.type = UnsignedByteType;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.wrapR = ClampToEdgeWrapping;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

/**
 * A baked overlay image as a texture on the sea surface.
 *
 * `flipY = false` because the shader does the flip itself: the image runs north to south down
 * its rows and latitude runs south to north, and doing it in one place means the coordinate
 * arithmetic and the crop that produced the image are written the same way round.
 *
 * `ClampToEdge` on both axes, so a sampling coordinate a hair outside the region cannot wrap an
 * arrow from Somalia onto Sumatra.
 */
export async function loadOverlayTexture(path: string): Promise<Texture> {
  const response = await fetch(`${DATA_ROOT}/${path}`);
  if (!response.ok) throw new Error(`could not load overlay ${path} (HTTP ${response.status})`);
  const bitmap = await createImageBitmap(await response.blob());

  const texture = new Texture(bitmap as unknown as HTMLImageElement);
  texture.flipY = false;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

/** A palette as a 256 x 1 texture the shader samples as its Transfer Function. */
export function paletteTexture(colours: number[][], theme: Theme = "dark"): DataTexture {
  const lifted = liftedPalette(colours, theme);
  const pixels = new Uint8Array(lifted.length * 4);
  lifted.forEach(([r, g, b], index) => {
    pixels[index * 4 + 0] = r ?? 0;
    pixels[index * 4 + 1] = g ?? 0;
    pixels[index * 4 + 2] = b ?? 0;
    pixels[index * 4 + 3] = 255;
  });

  const texture = new DataTexture(pixels, lifted.length, 1, RGBAFormat, UnsignedByteType);
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

/**
 * One hazard Field at one Timestep, as float32 on the Grid's own horizontal axes.
 *
 * Not a Volume, and deliberately not put through `loadVolumeTexture`. These Fields are read as
 * measurements - a depth in metres, a heat content in kJ/cm² - so they are never byte-quantised
 * and never depth-warped. 8 KB a file, which is not worth a compromise on the project's first
 * rule.
 */
export async function loadSurfaceField(
  path: string,
  width: number,
  height: number,
): Promise<SurfaceField> {
  const response = await fetch(`${DATA_ROOT}/${path}`);
  if (!response.ok) throw new Error(`could not load surface ${path} (HTTP ${response.status})`);

  const buffer = await response.arrayBuffer();
  const expected = width * height * 4;
  if (buffer.byteLength !== expected) {
    throw new Error(`surface ${path} is ${buffer.byteLength} bytes, expected ${expected}`);
  }
  return { width, height, values: new Float32Array(buffer) };
}

/**
 * Current components at one Timestep: interleaved (u, v) float32 on the model's own Levels.
 *
 * 387 KB, so it is fetched only when somebody actually selects the Field, and cached per
 * Timestep by the caller. Like the surfaces this is the Grid rather than a Volume: every arrow's
 * length and the speed under the cursor are read off it.
 */
export async function loadVectorField(
  path: string,
  levels: number,
  width: number,
  height: number,
): Promise<VectorField> {
  const response = await fetch(`${DATA_ROOT}/${path}`);
  if (!response.ok) throw new Error(`could not load vectors ${path} (HTTP ${response.status})`);

  const buffer = await response.arrayBuffer();
  const expected = levels * width * height * 2 * 4;
  if (buffer.byteLength !== expected) {
    throw new Error(`vectors ${path} is ${buffer.byteLength} bytes, expected ${expected}`);
  }
  return { levels, width, height, values: new Float32Array(buffer) };
}
