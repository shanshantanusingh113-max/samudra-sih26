import {
  Data3DTexture,
  DataTexture,
  LinearFilter,
  RGBAFormat,
  ClampToEdgeWrapping,
  UnsignedByteType,
} from "three";
import { liftedPalette } from "../palette";
import type { Collocation, Manifest, OceanFloat } from "../types";

const DATA_ROOT = `${import.meta.env.BASE_URL}data`;

async function getJson<T>(name: string): Promise<T> {
  const response = await fetch(`${DATA_ROOT}/${name}`);
  if (!response.ok) throw new Error(`could not load ${name} (HTTP ${response.status})`);
  return (await response.json()) as T;
}

export const loadManifest = () => getJson<Manifest>("manifest.json");
export const loadFloats = () => getJson<OceanFloat[]>("floats.json");
export const loadCollocations = () => getJson<Record<string, Collocation>>("collocations.json");

/**
 * Fetch one Volume and hand it to the GPU.
 *
 * Linear filtering is deliberate on every channel. On the value channel it is what smooths a
 * 1-degree grid into something that reads as water; on the coverage channel it is what turns a
 * stair-stepped coastline into a clean edge. It is only safe because the bake back-fills masked
 * cells with a real neighbouring value — see the note in `pipeline/samudra/volume.py`.
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

/** A palette as a 256 x 1 texture the shader samples as its Transfer Function. */
export function paletteTexture(colours: number[][]): DataTexture {
  const lifted = liftedPalette(colours);
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
