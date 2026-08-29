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
import type { AnomalyFeature, Collocation, Manifest, OceanFloat } from "../types";
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
  const response = await fetch(`${DATA_ROOT}/${path}`);
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
