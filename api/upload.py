"""Drop your own NetCDF file in, and watch it render.

PS 26067 asks for "automated parsers for NetCDF (via PyNIO / xarray backend) and delimited text
formats, with a modular architecture that allows new variables or data sources to be added with
minimal code change", and lists the inability to ingest new streams "without significant
re-engineering" as one of the five gaps it exists to close.

Every team will claim that. This is the only version of the claim that can be **falsified in
fifteen seconds, with a stranger's own file, in front of the panel**. The parsing itself is
`pipeline/samudra/sources/netcdf.py` - a Source Adapter like every other one, behind the same
protocol - and this file is only the plumbing around it.

Three things are worth knowing before changing anything here.

**The demo path is untouched.** This is an API feature, exactly as OPeNDAP and WMS are. Nothing
in `web/public/data` changes, the browser makes no call here unless a user drops a file, and the
whole demo still runs with this service stopped.

**The upload is the raw body, not multipart.** `fetch(url, {method: "POST", body: file})` sends
the bytes as they are, which is one line in the browser and costs no new Python dependency -
FastAPI's `UploadFile` needs `python-multipart`, which is not in `requirements.txt` and does not
need to be for one endpoint that takes one file.

**Nothing is stored.** The file lands in a temporary directory, is opened, is read for as long
as the session holds it, and is deleted when it falls out of the cache. There is no database,
no user, and nothing written back - `CONTEXT.md` says the platform is strictly read-only and
this does not change that.
"""

from __future__ import annotations

import tempfile
import uuid
from collections import OrderedDict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import numpy as np
import xarray as xr
from fastapi import HTTPException, Request, Response

from samudra.depth_warp import DepthWarp
from samudra.grid import Grid
from samudra.sources.base import BoundingBox
from samudra.sources.netcdf import NetcdfAxisError, NetcdfFileSource
from samudra.volume import encode_volume

#: The largest file this will read. Big enough for a real regional model output, small enough
#: that a mistake cannot fill the disk. Stated in the refusal so a user knows what to trim.
MAX_BYTES = 256 * 1024 * 1024

#: How many uploads are held at once. Small on purpose: this is a demonstration endpoint, not a
#: storage service, and the oldest one is closed and deleted rather than kept.
MAX_SESSIONS = 4


@dataclass
class Session:
    token: str
    filename: str
    path: Path
    source: NetcdfFileSource
    grid: dict
    warp: DepthWarp
    #: The encoding range per variable, decided **once** over the whole file.
    #:
    #: Not per Timestep. The bake does exactly this for every baked Field, and for the same
    #: reason: a range recomputed per step would make the colours mean a different number in
    #: every frame, so pressing play would recolour water that had not changed. It is also what
    #: lets the colourbar beside the volume be the file's own scale rather than one step's.
    ranges: dict

    def close(self) -> None:
        try:
            self.source.dataset.close()
        except Exception:  # noqa: BLE001 - closing a dataset must never break a request
            pass
        self.path.unlink(missing_ok=True)
        # And the directory it lived in. One `mkdtemp` per upload was left behind, empty, for
        # the life of the machine - which is not a leak that hurts and is a leak.
        try:
            self.path.parent.rmdir()
        except OSError:
            pass


_sessions: "OrderedDict[str, Session]" = OrderedDict()


def register(app, manifest, allowed_origins=("*",)) -> None:
    """Mount the two upload endpoints. `manifest` is the callable serving the baked manifest.

    `allowed_origins` is which **web pages** may write here. The API's CORS policy is a wildcard
    because reading it is meant to be open, and that quietly made writing open too: any page a
    reader had in another tab could upload to a running instance and delete somebody else's
    upload by guessing a token. A request with no `Origin` header - a script, a notebook, curl -
    is not a browser and is not checked.
    """

    def _check_origin(request: Request) -> None:
        origin = request.headers.get("origin")
        if origin is None or "*" in allowed_origins or origin in allowed_origins:
            return
        raise HTTPException(
            403,
            f"`{origin}` may not upload to this service. Reading it is open to any origin;"
            " writing is not. Set SAMUDRA_UPLOAD_ORIGINS to allow yours.",
        )

    @app.post("/api/netcdf")
    async def upload_netcdf(request: Request) -> dict:
        """Read a NetCDF file and say what is in it, or say exactly what could not be read.

        The response is deliberately shaped like a small manifest: the axes that were found, the
        variables that can be drawn, the instants they cover. A client that can read the baked
        manifest can read this with the same code.
        """
        _check_origin(request)
        raw = await _read_capped(request)
        if not raw:
            raise HTTPException(400, "Empty request body. POST the file's bytes as the body.")

        filename = request.headers.get("x-filename", "uploaded.nc")
        directory = Path(tempfile.mkdtemp(prefix="samudra-upload-"))
        path = directory / "uploaded.nc"
        path.write_bytes(raw)

        try:
            dataset = xr.open_dataset(path)
        except Exception as error:  # noqa: BLE001 - every failure here is "not a NetCDF file"
            path.unlink(missing_ok=True)
            raise HTTPException(
                400,
                f"xarray could not open that as NetCDF: {error}. NetCDF-3 and NetCDF-4/HDF5 are"
                " both readable; GRIB, Zarr and plain CSV are not.",
            ) from error

        volume = manifest()["volume"]
        region = BoundingBox(
            south=volume["south"], north=volume["north"], west=volume["west"], east=volume["east"]
        )
        try:
            # The region is handed over at construction, so the colour range is taken over the
            # water that will actually be on screen rather than over the whole file. A global
            # file's percentiles are set by the Southern Ocean.
            source = NetcdfFileSource(dataset, box=region)
            fields = source.fields()
        except NetcdfAxisError as error:
            dataset.close()
            path.unlink(missing_ok=True)
            # 422 rather than 400: the file is well-formed and this platform cannot use it,
            # which is a different thing from "that is not a NetCDF file", and the client says
            # so in different words.
            raise HTTPException(422, {"axis": error.axis, "detail": error.detail}) from error

        warp = DepthWarp(top=volume["surfaceMetres"], bottom=volume["floorMetres"])
        session = Session(
            token=uuid.uuid4().hex,
            filename=filename,
            path=path,
            source=source,
            grid=volume,
            warp=warp,
            ranges={spec.key: (spec.display_min, spec.display_max) for spec in fields},
        )
        _remember(session)

        stamps = source.timesteps()
        # Does the file have a vertical axis with room to interpolate on? An isosurface through
        # a single slab is not a surface, and `api/upload.py` used to answer "yes, always" -
        # which is the failure `pipeline/tests/test_field_specs.py` exists to prevent, arriving
        # in the one place no FieldSpec was written by hand.
        levels = (
            np.atleast_1d(np.asarray(dataset[source.axes.depth].values, dtype=float))
            if source.axes.depth
            else np.array([])
        )
        has_depth = int(np.unique(levels[np.isfinite(levels)]).size) >= 2
        return {
            "token": session.token,
            "filename": filename,
            "bytes": len(raw),
            "axes": {
                "longitude": source.axes.longitude,
                "latitude": source.axes.latitude,
                "depth": source.axes.depth,
                "time": source.axes.time,
            },
            "timesteps": [s.isoformat() if isinstance(s, datetime) else None for s in stamps],
            "fields": [
                {
                    "key": spec.key,
                    "label": spec.label,
                    "units": spec.units,
                    "palette": spec.palette,
                    "range": [spec.display_min, spec.display_max],
                    "isosurface": has_depth,
                    "render": "volume",
                    "group": "yours",
                    # A file with no usable vertical axis is a skin on slab 0 and the other 47
                    # are Masked - the honest choice, ADR 0014. The client resets the Depth
                    # slice when it selects one, because an SST file uploaded after somebody
                    # sliced to 200 m rendered as nothing at all with no explanation.
                    "surfaceOnly": not has_depth,
                }
                for spec in fields
            ],
            # What was in the file and is not on offer, by name. A partly readable file is not
            # refused - the drawable variables are offered - but until this was reported, the
            # ones that were dropped vanished silently and a reader was left concluding the
            # parser had failed.
            "skipped": source.skipped(),
            # Said plainly, because it is the one thing about this feature a user could
            # otherwise get wrong: what comes back is resampled onto this platform's own block.
            "resampledOnto": {
                "west": volume["west"],
                "east": volume["east"],
                "south": volume["south"],
                "north": volume["north"],
                "width": volume["width"],
                "height": volume["height"],
                "depth": volume["depth"],
                "surfaceMetres": volume["surfaceMetres"],
                "floorMetres": volume["floorMetres"],
            },
        }

    @app.get("/api/netcdf/{token}/volume/{field}/{index}")
    def uploaded_volume(token: str, field: str, index: int) -> Response:
        """One variable at one instant, as a Volume the existing shader can draw.

        **Resampled onto this platform's own block**, not onto the file's axes: the same
        56 x 36 x 48 lattice, the same region, the same Depth Warp. That is what lets an
        uploaded file drop straight into the scene the reader is already looking at, and it is
        the same kind of transformation `encode_volume` has always been - a Volume is a
        rendering artefact and never the source of scientific truth. What the file actually
        holds is unchanged and is what `/api/netcdf/{token}` reported.
        """
        session = _session(token)
        stamps = session.source.timesteps()
        if not 0 <= index < len(stamps):
            raise HTTPException(404, f"No timestep {index}; this file has {len(stamps)}.")

        box = BoundingBox(
            south=session.grid["south"],
            north=session.grid["north"],
            west=session.grid["west"],
            east=session.grid["east"],
        )
        try:
            grid = session.source.fetch_grid(field, stamps[index], box)
        except NetcdfAxisError as error:
            raise HTTPException(422, {"axis": error.axis, "detail": error.detail}) from error

        block = _onto_demo_block(grid, session.grid, session.warp)
        if not np.isfinite(block).any():
            raise HTTPException(
                422,
                {
                    "axis": "region",
                    "detail": "Every cell of this variable is missing over 45-100 E, 10 S-25 N.",
                },
            )
        # The file's own range, decided once at upload. See `Session.ranges`.
        if field not in session.ranges:
            raise HTTPException(
                422,
                {
                    "axis": "variable",
                    "detail": f"`{field}` is in the file but is not something this platform can"
                    " draw: it does not span both horizontal axes.",
                },
            )
        low, high = session.ranges[field]

        encoded = encode_volume(block, vmin=low, vmax=high)
        return Response(
            content=encoded.data,
            media_type="application/octet-stream",
            headers={
                # The range the bytes were quantised against, so the client's colourbar reads the
                # user's own numbers rather than a percentile of them under a different name.
                "x-range-min": repr(low),
                "x-range-max": repr(high),
                "cache-control": "no-store",
            },
        )

    @app.delete("/api/netcdf/{token}")
    def forget(token: str, request: Request) -> dict:
        """Close and delete an upload. Called when the reader clears it; also happens on eviction."""
        _check_origin(request)
        session = _sessions.pop(token, None)
        if session is None:
            raise HTTPException(404, "No such upload; it may already have been cleared.")
        session.close()
        return {"forgotten": token}


async def _read_capped(request: Request) -> bytes:
    """The request body, refused as soon as it passes `MAX_BYTES` rather than after it.

    `await request.body()` buffers the whole thing and then compares, so a 2 GB POST was fully
    in memory before it was rejected. The declared length is checked first because that refuses
    an honest client without reading a byte, and the running total is checked because a client
    is free to declare nothing or to lie.
    """
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > MAX_BYTES:
        raise HTTPException(413, _too_big(int(declared)))

    chunks: list[bytes] = []
    total = 0
    async for chunk in request.stream():
        total += len(chunk)
        if total > MAX_BYTES:
            raise HTTPException(413, _too_big(total))
        chunks.append(chunk)
    return b"".join(chunks)


def _too_big(size: int) -> str:
    return (
        f"That file is at least {size / 1e6:.0f} MB and the limit is {MAX_BYTES / 1e6:.0f} MB."
        " Subset it in time or in depth and try again."
    )


def _remember(session: Session) -> None:
    _sessions[session.token] = session
    while len(_sessions) > MAX_SESSIONS:
        _, oldest = _sessions.popitem(last=False)
        oldest.close()


def _session(token: str) -> Session:
    session = _sessions.get(token)
    if session is None:
        raise HTTPException(
            404,
            "That upload is no longer held. Uploads live in memory for the life of the server"
            f" and only the {MAX_SESSIONS} most recent are kept; drop the file in again.",
        )
    _sessions.move_to_end(token)
    return session


def _onto_demo_block(grid: Grid, volume: dict, warp: DepthWarp) -> np.ndarray:
    """The uploaded Grid, resampled onto the demo's lattice: (depth, lat, lon).

    Bilinear horizontally through `Grid.column_at`, which refuses to blend across a Masked node
    for the reason that function's docstring gives - near a coast the nodes that do have data
    are the open ocean. A node the file does not cover is Mask, not zero: absence has to render
    as absence, or an uploaded regional file would paint a rectangle of cold water across the
    whole Indian Ocean.
    """
    latitudes = np.linspace(volume["south"], volume["north"], volume["height"])
    longitudes = np.linspace(volume["west"], volume["east"], volume["width"])
    samples = volume["depth"]

    block = np.full((samples, len(latitudes), len(longitudes)), np.nan)
    for row, latitude in enumerate(latitudes):
        for column, longitude in enumerate(longitudes):
            try:
                values = grid.column_at(float(latitude), float(longitude))
            except ValueError:
                continue  # outside the file: Mask, and the shader draws nothing there
            if not np.isfinite(values).any():
                continue
            if grid.levels.size < 2:
                # A file with no vertical axis is a surface field, and a surface field is not a
                # body of water. Drawing its one value all the way down would claim a 2000 m
                # column somebody measured at the surface - the exact failure ADR 0014 exists
                # to prevent. It gets the top slab and nothing else, so it reads as a skin.
                block[0, row, column] = values[0]
                continue
            block[:, row, column] = warp.resample(grid.levels, values, samples)
    return block
