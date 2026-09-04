/**
 * Drop your own NetCDF file on the platform and watch it render.
 *
 * PS 26067 asks for automated NetCDF parsing through an xarray backend, with new sources added
 * "with minimal code change". Every team will claim that; this is the version a judge can
 * falsify in fifteen seconds with their own file.
 *
 * **This is the only place in the frontend that talks to a server, and it only ever runs when a
 * user drops a file.** The demo path makes zero network calls and still does: nothing here is
 * touched by the globe, the volume, the comparison or the tour, and the whole demo runs with the
 * API stopped. That property is the reason the bake exists and it is not being spent here.
 *
 * The parsing is `pipeline/samudra/sources/netcdf.py`, a Source Adapter behind the same protocol
 * as INCOIS, Argo, Copernicus and the rest - which is the claim being demonstrated rather than
 * asserted. `api/upload.py` is the plumbing.
 */

import type { FieldSpec } from "../types";

/**
 * Where the API is.
 *
 * Overridable at build time for a deployment that serves both halves, and defaulting to the
 * localhost port `CLAUDE.md` documents for `uvicorn`. It is deliberately not read from the
 * manifest: the manifest describes the baked data, and a static bundle that named a server in
 * it would imply the server was needed.
 */
export const API_BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined) ?? "http://localhost:8000";

/** What the server found in the file, or could not. */
export interface UploadedFile {
  token: string;
  filename: string;
  bytes: number;
  axes: {
    longitude: string;
    latitude: string;
    depth: string | null;
    time: string | null;
  };
  /** One per instant in the file. `null` for a file with no time axis. */
  timesteps: (string | null)[];
  fields: FieldSpec[];
  /** Variables in the file that are not on offer, by name, with the reason for each. */
  skipped?: Record<string, string>;
  resampledOnto: {
    west: number;
    east: number;
    south: number;
    north: number;
    width: number;
    height: number;
    depth: number;
    surfaceMetres: number;
    floorMetres: number;
  };
}

/**
 * Why a file was refused, in the server's own words.
 *
 * `axis` is what could not be resolved - longitude, latitude, depth, variable, region - and it
 * is carried separately from the sentence so the panel can lead with it. The whole point of the
 * feature is that a file it cannot read produces a **named** problem rather than a picture of
 * something wrong.
 */
export interface UploadProblem {
  axis: string | null;
  detail: string;
}

/**
 * Send the file as the raw body.
 *
 * Not multipart: `body: file` sends the bytes as they are, and it saves the server a dependency
 * it would otherwise need for one endpoint. The name travels in a header because the body is
 * the file and nothing else.
 */
export async function uploadNetcdf(file: File): Promise<UploadedFile> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api/netcdf`, {
      method: "POST",
      headers: { "content-type": "application/octet-stream", "x-filename": file.name },
      body: file,
    });
  } catch {
    // A network failure here is almost always "the API is not running", which is a normal
    // state for this project and deserves the instruction rather than an error code.
    throw {
      axis: null,
      detail:
        `Could not reach the API at ${API_BASE}. Start it with` +
        " `python -m uvicorn api.main:app --port 8000` from the repository root. Everything" +
        " else on this page works without it.",
    } as UploadProblem;
  }

  if (!response.ok) throw await problemFrom(response);
  return (await response.json()) as UploadedFile;
}

/** Where one uploaded variable's Volume lives. An absolute URL, unlike every baked one. */
export function uploadedVolumeUrl(token: string, field: string, index: number): string {
  return `${API_BASE}/api/netcdf/${token}/volume/${encodeURIComponent(field)}/${index}`;
}

/** Close the upload and delete the server's copy. Best effort: a failure here changes nothing. */
export async function forgetUpload(token: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/netcdf/${token}`, { method: "DELETE" });
  } catch {
    // The server is gone, which is the same outcome as the file being gone.
  }
}

async function problemFrom(response: Response): Promise<UploadProblem> {
  try {
    const body = await response.json();
    const detail = body?.detail;
    if (detail && typeof detail === "object") {
      return { axis: String(detail.axis ?? ""), detail: String(detail.detail ?? "") };
    }
    return { axis: null, detail: String(detail ?? `HTTP ${response.status}`) };
  } catch {
    return { axis: null, detail: `HTTP ${response.status}` };
  }
}

/**
 * Which of the file's own instants each of the demo's Timesteps should show.
 *
 * The uploaded file has its own clock, and it is rarely the bake's twelve ten-day steps. Rather
 * than growing a second timeline, each Timestep on screen is mapped to the instant in the file
 * **nearest it in time**, so scrubbing the existing slider walks the uploaded file in the right
 * order and stops where the file stops.
 *
 * A file with no time axis maps every Timestep to its only field, and the panel says so - a
 * timeline that appears to animate something with no clock would be inventing a change.
 *
 * A file that *has* a clock and misses is the same problem wearing a disguise: a file whose
 * instants are all in 2019 maps every one of the twelve steps to the same index, so the slider
 * moves and nothing on screen changes. `timelineMoves` is what lets the panel say that, and it
 * is a fact about the mapping rather than about the axis.
 */
export function timestepMapping(upload: UploadedFile, demoTimesteps: string[]): number[] {
  const stamps = upload.timesteps.map((t) => (t ? new Date(t).getTime() : null));
  const usable = stamps.filter((t): t is number => t !== null);
  if (usable.length === 0) return demoTimesteps.map(() => 0);

  return demoTimesteps.map((stamp) => {
    const when = new Date(stamp).getTime();
    let best = 0;
    let gap = Number.POSITIVE_INFINITY;
    stamps.forEach((t, index) => {
      if (t === null) return;
      const delta = Math.abs(t - when);
      if (delta < gap) {
        best = index;
        gap = delta;
      }
    });
    return best;
  });
}

/**
 * Does scrubbing the timeline actually change what is drawn?
 *
 * False for a file with no time axis, and false for one whose instants all sit far enough from
 * the bake's four months that every Timestep lands on the same one. The panel only said the
 * first of those, so a 2019 file animated nothing while the timeline moved and nothing on
 * screen admitted it.
 */
export function timelineMoves(mapping: number[]): boolean {
  return new Set(mapping).size > 1;
}
