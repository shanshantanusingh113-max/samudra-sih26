"""The Samudra 3D REST API.

The browser demo runs entirely on baked static files, deliberately — see the note at the top of
`pipeline/samudra/bake.py`. So what is this for?

It is the deployable half. The problem statement asks for "a lightweight REST/OPeNDAP API
backend", and more importantly a Collocation is a *query*, not a fixture: a forecaster wants
this float against that analysis step, or an arbitrary position, and pre-computing the whole
cross-product is neither possible nor sensible. The static bundle carries the answers the demo
needs; this serves the answers nobody thought to bake.

Everything scientific here reads the native Grids, never the Volume. The Volume is quantised,
depth-warped and back-filled across land to suit a GPU; answering a question about the ocean
with it would be answering with a picture of the data instead of the data.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime
from functools import lru_cache
from pathlib import Path

import numpy as np
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "pipeline"))

from samudra.collocation import collocate  # noqa: E402
from samudra.grid import Grid  # noqa: E402
from samudra.sources.argo import ArgoErddapSource  # noqa: E402
from samudra.sources.incois import IncoisErddapSource  # noqa: E402

WEB_DATA = ROOT / "web" / "public" / "data"
GRID_DATA = ROOT / "data" / "grids"

app = FastAPI(
    title="Samudra 3D API",
    version="1.0.0",
    description="Ocean model fields and in-situ observations over India's EEZ (SIH 26067).",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # read-only public scientific data; nothing here is private
    allow_methods=["GET"],
    allow_headers=["*"],
)


# ----------------------------------------------------------------- loading


@lru_cache(maxsize=1)
def manifest() -> dict:
    path = WEB_DATA / "manifest.json"
    if not path.exists():
        raise HTTPException(503, "no baked data; run `python -m samudra.bake` in pipeline/")
    return json.loads(path.read_text(encoding="utf-8"))


@lru_cache(maxsize=64)
def native_grid(field: str, index: int) -> Grid:
    path = GRID_DATA / f"{field}_{index:03d}.npz"
    if not path.exists():
        raise HTTPException(404, f"no grid for {field} at timestep {index}")
    with np.load(path) as data:
        return Grid(
            levels=data["levels"],
            latitudes=data["latitudes"],
            longitudes=data["longitudes"],
            values=data["values"].astype(float),
        )


@lru_cache(maxsize=1)
def floats() -> dict[str, dict]:
    path = WEB_DATA / "floats.json"
    if not path.exists():
        return {}
    return {item["id"]: item for item in json.loads(path.read_text(encoding="utf-8"))}


@lru_cache(maxsize=1)
def profiles() -> dict[str, list[dict]]:
    """Every Profile, grouped by Float. Keys encode id|time|lat|lon — see bake.py."""
    path = GRID_DATA / "profiles.npz"
    if not path.exists():
        return {}
    grouped: dict[str, list[dict]] = {}
    with np.load(path) as data:
        for key in data.files:
            platform, stamp, latitude, longitude = key.split("|")
            block = data[key]
            grouped.setdefault(platform, []).append(
                {
                    "time": stamp,
                    "latitude": float(latitude),
                    "longitude": float(longitude),
                    "depths": block[0],
                    "temperature": block[1],
                    "salinity": block[2],
                }
            )
    for casts in grouped.values():
        casts.sort(key=lambda c: c["time"])
    return grouped


# ----------------------------------------------------------------- routes


@app.get("/api/health")
def health() -> dict:
    baked = (WEB_DATA / "manifest.json").exists()
    return {
        "status": "ok" if baked else "no-data",
        "baked": baked,
        "grids": len(list(GRID_DATA.glob("*.npz"))) if GRID_DATA.exists() else 0,
    }


@app.get("/api/sources")
def sources() -> dict:
    """The registered Source Adapters.

    This is the extensibility claim made checkable: adding a mooring, an ADCP or an HF-radar
    feed means adding one class that satisfies the protocol in `samudra/sources/base.py` and
    listing it here. Nothing downstream — renderer, API, UI — knows what an ERDDAP is.
    """
    model = IncoisErddapSource()
    observations = ArgoErddapSource()
    return {
        "gridSources": [
            {
                "name": model.name,
                "attribution": model.attribution,
                "fields": [f.key for f in model.fields()],
                "kind": "gridded-model",
            }
        ],
        "profileSources": [
            {"name": observations.name, "attribution": observations.attribution, "kind": "in-situ"}
        ],
    }


@app.get("/api/manifest")
def get_manifest() -> dict:
    return manifest()


@app.get("/api/fields")
def fields() -> list[dict]:
    return manifest()["fields"]


@app.get("/api/timesteps")
def timesteps() -> list[str]:
    return manifest()["timesteps"]


@app.get("/api/volume/{field}/{index}")
def volume(field: str, index: int) -> Response:
    """The GPU-ready Volume: interleaved value, coverage, gradient, spare."""
    paths = manifest()["volumeFiles"].get(field)
    if not paths or not 0 <= index < len(paths):
        raise HTTPException(404, f"no volume for {field} at timestep {index}")
    return FileResponse(WEB_DATA / paths[index], media_type="application/octet-stream")


@app.get("/api/floats")
def list_floats() -> list[dict]:
    return list(floats().values())


@app.get("/api/floats/{platform_id}/profiles")
def float_profiles(platform_id: str) -> dict:
    casts = profiles().get(platform_id)
    if not casts:
        raise HTTPException(404, f"no profiles for float {platform_id}")
    return {
        "platformId": platform_id,
        "profiles": [
            {
                "time": c["time"],
                "latitude": c["latitude"],
                "longitude": c["longitude"],
                "depths": _numbers(c["depths"]),
                "temperature": _numbers(c["temperature"]),
                "salinity": _numbers(c["salinity"]),
            }
            for c in casts
        ],
    }


@app.get("/api/column")
def column(
    field: str = Query("temperature"),
    index: int = Query(0),
    latitude: float = Query(...),
    longitude: float = Query(...),
) -> dict:
    """The model's water column at any position — bilinear between the four surrounding nodes."""
    grid = native_grid(field, index)
    try:
        values = grid.column_at(latitude, longitude)
    except ValueError as error:
        raise HTTPException(400, str(error)) from error
    return {
        "field": field,
        "timestep": manifest()["timesteps"][index],
        "latitude": latitude,
        "longitude": longitude,
        "depths": _numbers(grid.levels),
        "values": _numbers(values),
    }


@app.get("/api/collocation/{platform_id}")
def collocation(
    platform_id: str,
    field: str = Query("temperature"),
    index: int | None = Query(None, description="analysis timestep; defaults to nearest in time"),
    cast: int = Query(-1, description="which Profile of this Float; -1 is the most recent"),
) -> dict:
    """Pair one observed Profile against the model interpolated to its position.

    This is the query the static bundle cannot answer: it carries only each Float's latest cast
    against its nearest analysis step. Here you can ask for any cast against any step, which is
    how you would actually investigate whether a disagreement is real or a timing artefact.
    """
    casts = profiles().get(platform_id)
    if not casts:
        raise HTTPException(404, f"no profiles for float {platform_id}")
    if not -len(casts) <= cast < len(casts):
        raise HTTPException(404, f"float {platform_id} has {len(casts)} profiles")

    chosen = casts[cast]
    stamps = [datetime.fromisoformat(t) for t in manifest()["timesteps"]]
    if index is None:
        when = datetime.fromisoformat(chosen["time"])
        index = int(np.argmin([abs((when - s).total_seconds()) for s in stamps]))
    if not 0 <= index < len(stamps):
        raise HTTPException(404, f"no analysis timestep {index}")

    observed = chosen.get(field)
    if observed is None:
        raise HTTPException(400, f"float {platform_id} reports no {field}")

    grid = native_grid(field, index)
    try:
        result = collocate(
            grid,
            latitude=chosen["latitude"],
            longitude=chosen["longitude"],
            depths=chosen["depths"],
            observed=observed,
        )
    except ValueError as error:
        raise HTTPException(400, str(error)) from error

    return {
        "platformId": platform_id,
        "field": field,
        "observedAt": chosen["time"],
        "analysisAt": stamps[index].isoformat(),
        "latitude": result.latitude,
        "longitude": result.longitude,
        "depths": _numbers(result.depths),
        "observed": _numbers(result.observed),
        "modelled": _numbers(result.modelled),
        "residual": _numbers(result.residual),
        "matched": result.matched_count,
        "meanResidual": _number(result.mean_residual),
        "rmsResidual": _number(result.rms_residual),
    }


@app.get("/api/live/timesteps")
def live_timesteps(limit: int = Query(12, ge=1, le=100)) -> dict:
    """Ask INCOIS directly what analysis steps exist right now.

    Proof that the ingestion path is live and not a fixture. It is deliberately not on the demo's
    critical path — if Hyderabad is unreachable this returns an error and nothing else breaks.
    """
    try:
        available = list(IncoisErddapSource().timesteps())
    except Exception as error:  # noqa: BLE001 - upstream can fail in many ways; all are the same to us
        raise HTTPException(502, f"INCOIS ERDDAP unreachable: {error}") from error
    return {
        "source": IncoisErddapSource.name,
        "count": len(available),
        "latest": [t.isoformat() for t in available[-limit:]],
        "baked": manifest()["timesteps"],
    }


# ----------------------------------------------------------------- helpers


def _numbers(values) -> list:
    return [_number(v) for v in np.asarray(values, dtype=float)]


def _number(value):
    """JSON has no NaN. Missing becomes null, which a client renders as a gap, not a zero."""
    value = float(value)
    return None if not np.isfinite(value) else round(value, 4)
