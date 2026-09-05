"""The Samudra 3D REST API.

The browser demo runs entirely on baked static files, deliberately - see the note at the top of
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
import os
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
# So `cf`, `dap` and `wms` resolve however uvicorn was launched - `api.main:app` from the repo
# root does not put this directory on the path.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from samudra.collocation import collocate  # noqa: E402
from samudra.grid import Grid  # noqa: E402
from samudra.section import casts_near_line, section_along  # noqa: E402
from samudra.sources.argo import ArgoErddapSource, BgcArgoSource, IncoisArgoSource  # noqa: E402
from samudra.sources.copernicus import CopernicusCurrentsSource  # noqa: E402
from samudra.sources.glider import GliderSource  # noqa: E402
from samudra.sources.incois import IncoisErddapSource, IncoisMcCrearySource  # noqa: E402
from samudra.sources.osmc import OsmcSource  # noqa: E402

import standards  # noqa: E402
import upload  # noqa: E402

WEB_DATA = ROOT / "web" / "public" / "data"
GRID_DATA = ROOT / "data" / "grids"

app = FastAPI(
    title="Samudra 3D API",
    version="1.0.0",
    description="Ocean model fields and in-situ observations over India's EEZ (SIH 26067).",
)
#: Which web pages may POST an upload or DELETE one.
#:
#: The wildcard below is for **reading**, and its stated reason - read-only public scientific
#: data - is a good one: a notebook, a QGIS layer or somebody else's page should be able to pull
#: a Grid without asking. It stopped being the whole truth when POST and DELETE were added for
#: the NetCDF drop, because then any page a reader happened to have open while this service ran
#: could upload to it and delete somebody else's upload by guessing a token.
#:
#: So reads keep the wildcard and writes get a list. CORS is a browser rule and nothing else, so
#: this costs a script, a notebook and `curl` nothing at all: they send no `Origin` and are not
#: checked. Override with `SAMUDRA_UPLOAD_ORIGINS`, comma separated, or `*` to go back.
UPLOAD_ORIGINS = [
    origin.strip()
    for origin in os.environ.get(
        "SAMUDRA_UPLOAD_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,"
        "http://localhost:4173,http://127.0.0.1:4173,"
        "https://rak2315.github.io",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # read-only public scientific data; nothing here is private
    # POST and DELETE are for the NetCDF upload alone - see `upload.py`. Nothing else here
    # writes anything, and an upload is held in memory and deleted, never stored. The handlers
    # themselves check the origin against UPLOAD_ORIGINS; this only gets the preflight through.
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["*"],
)


# ----------------------------------------------------------------- loading


# What the caches were built from. The manifest's own modification time, and nothing cleverer:
# every derived file in a bake is written in the same run, so one stamp answers for all of them.
_baked_at: float | None = None


def _drop_caches_if_rebaked() -> None:
    """Forget everything cached the moment the bake underneath changes.

    Every loader here is `lru_cache`d, which is right - a Grid is 400 KB of npz and a request
    should not re-read it - and was permanent, which is not. Re-baking under a running uvicorn
    left the API serving the previous field list, the previous timesteps and the previous grids
    for ever, with no way to reload and nothing on any response admitting the two halves had
    parted. Measured once by accident: `/api/column` answered for a Field that
    `GetCapabilities` did not list and `/api/netcdf/<that field>/11` returned 404, all three
    from one process, and restarting fixed all three.

    Cheap enough to do on every request: one `stat` against a file the OS has cached.
    """
    global _baked_at
    path = WEB_DATA / "manifest.json"
    stamp = path.stat().st_mtime if path.exists() else None
    if stamp == _baked_at:
        return
    _baked_at = stamp
    _manifest.cache_clear()
    native_grid.cache_clear()
    floats.cache_clear()
    profiles.cache_clear()
    _section_profiles.cache_clear()


@lru_cache(maxsize=1)
def _manifest() -> dict:
    path = WEB_DATA / "manifest.json"
    if not path.exists():
        raise HTTPException(503, "no baked data; run `python -m samudra.bake` in pipeline/")
    return json.loads(path.read_text(encoding="utf-8"))


def manifest() -> dict:
    """The baked manifest, re-read whenever the bake on disk has changed under us."""
    _drop_caches_if_rebaked()
    return _manifest()


@lru_cache(maxsize=64)
def native_grid(field: str, index: int) -> Grid:
    # Check the manifest, not just the filesystem: a grid file can outlive the bake that made
    # it, and answering from one would mean reporting a different date range as current.
    if not 0 <= index < len(manifest()["timesteps"]):
        raise HTTPException(404, f"no analysis timestep {index}")
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
    """Every Profile, grouped by Float. Keys encode id|time|lat|lon - see bake.py."""
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
                    # Computed in the bake from the two above, so /api/collocation can answer
                    # for density with both sides through the same TEOS-10 chain.
                    "density": block[3],
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
        # When the bake this process is answering from was written. A client comparing this
        # against the manifest it holds can tell that the two have parted, which is exactly what
        # nothing could do while the caches were permanent.
        "generated": manifest().get("generated") if baked else None,
    }


# The registry. Adding a provider means adding a class that satisfies the protocol in
# `samudra/sources/base.py` and putting it in one of these lists. Nothing else in the system -
# renderer, API, UI - has ever heard of ERDDAP.
# Seven Source Adapters now, three of them added in the September 2026 round. Registering them
# here rather than only in the bake is what keeps `/api/sources` an honest answer to "can this
# ingest a new stream": every one of these satisfies the same Protocol, and the endpoint below
# reads them rather than restating them.
GRID_SOURCES = [IncoisErddapSource(), IncoisMcCrearySource(), CopernicusCurrentsSource()]
PROFILE_SOURCES = [
    ArgoErddapSource(),
    BgcArgoSource(),
    OsmcSource(),
    IncoisArgoSource(),
    GliderSource(),
]


@app.get("/api/sources")
def sources() -> dict:
    """The registered Source Adapters, and which one the demo actually reads.

    This is the extensibility claim made checkable rather than asserted. Two Argo providers are
    registered and they disagree about everything superficial: INCOIS names its columns in upper
    case and serves the delayed-mode `*_ADJUSTED` fields empty, while Ifremer names them in lower
    case and populates them. Both are absorbed by one parser driven by a column description.
    """
    return {
        "gridSources": [
            {
                "name": source.name,
                "attribution": source.attribution,
                "fields": [f.key for f in source.fields()],
                "kind": "gridded-model",
                "usedByDemo": True,
            }
            for source in GRID_SOURCES
        ],
        "profileSources": [
            {
                "name": source.name,
                "attribution": source.attribution,
                "kind": "in-situ",
                # Four providers now, and the fourth does not have a ProfileColumns at all:
                # the GTS feed reports depth rather than pressure, one row per level, the
                # surface reading in a different column from every other level, and no quality
                # flags. It is absorbed by its own parser behind the same protocol, which is a
                # stronger demonstration of the seam than a second provider with the same shape.
                "columnStyle": (
                    {
                        "platform": source.columns.platform,
                        "prefers": list(source.columns.temperature),
                        "channels": [name for name, _ in source.columns.measurements],
                    }
                    if hasattr(source, "columns")
                    else {"format": "flattened GTS rows, one per level; no quality flags"}
                ),
                # INCOIS's Argo archive stops in April 2025 while their gridded analysis runs to
                # July 2026. Collocating across that gap would compare two different oceans, so
                # the demo reads the current GDAC mirror and keeps this one as proof of the seam.
                "coverageEnds": getattr(source, "coverage_ends", None),
                "usedByDemo": not hasattr(source, "coverage_ends"),
            }
            for source in PROFILE_SOURCES
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
    """The model's water column at any position - bilinear between the four surrounding nodes."""
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


@app.get("/api/section")
def section(
    field: str = Query("temperature"),
    index: int = Query(0, ge=0),
    from_lon: float = Query(..., ge=-180, le=180),
    from_lat: float = Query(..., ge=-90, le=90),
    to_lon: float = Query(..., ge=-180, le=180),
    to_lat: float = Query(..., ge=-90, le=90),
    points: int = Query(121, ge=2, le=601),
    corridor_km: float = Query(150.0, gt=0, le=1000),
    window_days: float | None = Query(None, gt=0, le=365),
) -> dict:
    """A vertical section along a line: depth against distance, cut from the native Grid.

    The hydrographic section is the standard figure of physical oceanography, and this is it
    served as numbers. **From the Grid, never a Volume** - a reader takes metres off one axis
    and a value off the colour, and a Volume is quantised and depth-warped for a GPU.

    The browser has its own copy of this: the same three Fields ship as float32 in
    `web/public/data/grids/`, so the section works with the API stopped and on the static
    deployment, where there is no API at all. This endpoint is for everybody else - a script, a
    notebook, another service - and it is what `web/probe-section.mjs` measures the browser's
    answer against.
    """
    grid = native_grid(field, index)
    cut = section_along(grid, from_lon, from_lat, to_lon, to_lat, points=points)
    # Near in time as well as in space. A section is cut at one Timestep, so a cast four months
    # old drawn on it claims an observation of water it was never in. The default is the bake's
    # own coverage window, which is what the Float markers are gated on.
    when = datetime.fromisoformat(manifest()["timesteps"][index])
    window = window_days if window_days is not None else manifest()["coverage"]["windowDays"]
    near = casts_near_line(
        _section_profiles(),
        from_lon,
        from_lat,
        to_lon,
        to_lat,
        corridor_km=corridor_km,
        when=when,
        window_days=window,
    )
    return {
        "field": field,
        "timestep": manifest()["timesteps"][index],
        "from": [from_lon, from_lat],
        "to": [to_lon, to_lat],
        "lengthKm": round(float(cut.distances_km[-1]), 2),
        "distancesKm": [round(float(d), 2) for d in cut.distances_km],
        "longitudes": [round(float(v), 4) for v in cut.longitudes],
        "latitudes": [round(float(v), 4) for v in cut.latitudes],
        "levels": [float(v) for v in cut.levels],
        # [level][point], null where the model has no ocean. Absence renders as absence.
        "values": [_numbers(row) for row in cut.values],
        "casts": [
            {
                "platformId": c.profile.platform_id,
                "time": c.profile.time.isoformat(),
                "lon": round(c.profile.longitude, 4),
                "lat": round(c.profile.latitude, 4),
                "distanceKm": round(c.distance_km, 2),
                # How far off the line it really was. A section with a cast drawn on it implies
                # the cast was on it, and this is what keeps that a figure rather than a claim.
                "offsetKm": round(c.offset_km, 2),
                "depthMax": round(float(c.profile.depths.max()), 1),
            }
            for c in near
        ],
        "corridorKm": corridor_km,
        "windowDays": window,
    }


@app.get("/api/live/timesteps")
def live_timesteps(limit: int = Query(12, ge=1, le=100)) -> dict:
    """Ask INCOIS directly what analysis steps exist right now.

    Proof that the ingestion path is live and not a fixture. It is deliberately not on the demo's
    critical path - if Hyderabad is unreachable this returns an error and nothing else breaks.
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


@lru_cache(maxsize=1)
def _section_profiles() -> list:
    """Every baked cast as a `Profile`, for `casts_near_line`.

    `profiles()` caches plain dicts because that is what every other endpoint here wants;
    `samudra.section` is pipeline code and speaks the pipeline's own type. Converting at the
    boundary keeps the science module free of this API's storage shape, which is the same
    division `sources/base.py` draws everywhere else.

    Cached for the same reason `native_grid` is: this built 3,077 `Profile` objects on every
    single `/api/section` request, and the answer only changes when the bake does.
    `_drop_caches_if_rebaked` clears it along with the rest.
    """
    from samudra.sources.base import Profile

    out = []
    for platform, casts in profiles().items():
        for cast in casts:
            out.append(
                Profile(
                    platform_id=platform,
                    latitude=cast["latitude"],
                    longitude=cast["longitude"],
                    time=datetime.fromisoformat(cast["time"]),
                    depths=cast["depths"],
                    values={
                        "temperature": cast["temperature"],
                        "salinity": cast["salinity"],
                        "density": cast["density"],
                    },
                )
            )
    return out


def _numbers(values) -> list:
    return [_number(v) for v in np.asarray(values, dtype=float)]


def _number(value):
    """JSON has no NaN. Missing becomes null, which a client renders as a gap, not a zero."""
    value = float(value)
    return None if not np.isfinite(value) else round(value, 4)


# The open-standards half: OPeNDAP, CF NetCDF and OGC WMS, all over the same native Grids.
# Registered last so it can borrow this module's cached loaders rather than opening the files
# again - and so there is one place that decides where a Grid comes from.
standards.register(app, manifest, native_grid)

# Drop your own NetCDF file in. The parsing is a Source Adapter like every other provider's -
# `samudra/sources/netcdf.py` - and this is the only endpoint on the service that accepts
# anything. The demo path never touches it.
upload.register(app, manifest, UPLOAD_ORIGINS)
