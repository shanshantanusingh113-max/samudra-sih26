"""Open standards over the same native Grids: OPeNDAP, CF NetCDF, and OGC WMS.

Three protocols, one description. `cf.py` turns a `Grid` into a self-describing CF-1.8 dataset;
`dap.py` and `wms.py` serve it. They are together in one module because they are one afternoon's
work sharing one wrapper, and separate from `main.py` because `main.py` is the REST API the
frontend and a human use, and this is the part machines use.

Why these three, and why not WCS

PS 26067 asks for an OPeNDAP backend, CF Conventions and OGC WMS/WCS. The first two were marked
Not met and Partly met, and WMS was declined in `CONTEXT.md` as "a checkbox no judge will click".
That was a fair call when each was a separate day. Two measurements changed the argument:

- **ERDDAP's griddap is a DAP2 server.** `incois_argo_10d_VAM.dds` and `.dods` both answer on
  INCOIS's own server, so this project already *consumed* OPeNDAP and only ever lacked the
  serving half. The README said otherwise and has been corrected.
- **INCOIS's ERDDAP already publishes WMS for the dataset we read.** So re-serving their
  temperature is re-publishing. What is worth serving is density, the temperature anomaly and
  Observation Coverage - computed here, published nowhere else - and the capabilities document
  says which layers are which.

WCS stays unbuilt, and `docs/plan/03-requirement-gaps.md` records why: there is no maintained
pure-Python WCS server, the coverage encodings are a day's work for a checkbox, and the numbers
are already served properly over OPeNDAP, which is what this community actually uses.

The one rule
------------
Every endpoint here reads `native_grid()`. None of them can reach a Volume. The Volume is
quantised to 255 levels, depth-warped and back-filled across land for the GPU, and a consumer
pulling it over a scientific protocol could not see that it had happened.
"""

from __future__ import annotations

import json
from datetime import datetime

import numpy as np
from fastapi import HTTPException, Request
from fastapi.responses import Response

import cf
import dap
import wms
from samudra.palettes import lookup_table

# Layers this platform computed rather than restated. The capabilities document says so.
OURS = {"density", "temperature_anomaly"}

# Observation Coverage is deliberately not served over any of these.
#
# It is the one Field that has no native Grid: it is counted on the Volume's own warped lattice,
# because "how many casts dived through this slab" is a question about a slab, and a slab is a
# rendering construct. Serving it here would mean serving the depth warp over a scientific
# protocol, where a consumer cannot see that it happened - which is exactly the rule these
# endpoints exist to keep. It stays where it can be read honestly: in the app, with its own
# legend, and in `/api/volume/coverage/{index}` clearly labelled as a rendering artefact.
#
# Named rather than filtered silently, because a Field that is missing for a reason and a Field
# that is missing by accident look the same from outside.
NOT_ON_A_NATIVE_GRID = {"coverage"}


def register(app, manifest, native_grid) -> None:
    """Attach the endpoints. `manifest` and `native_grid` are main.py's cached loaders."""

    def dataset_for(field: str, index: int):
        stamps = manifest()["timesteps"]
        if not 0 <= index < len(stamps):
            raise HTTPException(404, f"no analysis timestep {index}")
        return cf.as_dataset(
            native_grid(field, index),
            field,
            datetime.fromisoformat(stamps[index]),
            extra_attributes={
                "history": f"Served by Samudra 3D from the bake of {manifest()['generated']}"
            },
        )

    def servable_fields() -> list[dict]:
        return [f for f in manifest()["fields"] if f["key"] not in NOT_ON_A_NATIVE_GRID]

    def field_spec(field: str) -> dict:
        if field in NOT_ON_A_NATIVE_GRID:
            raise HTTPException(
                404,
                f"{field!r} is counted on the rendering lattice rather than the analysis grid, "
                "so it is not served over CF, OPeNDAP or WMS. See /api/volume/"
                f"{field}/0 and the note in api/standards.py.",
            )
        for spec in manifest()["fields"]:
            if spec["key"] == field:
                return spec
        raise HTTPException(404, f"no field {field!r}")

    def palette_for(spec: dict) -> list:
        """The Field's own palette, unlifted.

        The display lift is a dark-console concession - ADR 0007 - and has no business in a
        picture somebody is going to composite into their own GIS on their own background.
        """
        return lookup_table(spec["palette"]).tolist()

    # ------------------------------------------------------------------ CF NetCDF

    @app.get("/api/netcdf/{field}/{index}")
    def netcdf(field: str, index: int) -> Response:
        """One Field at one Timestep as CF-1.8 NetCDF.

        The clause the README marked Partly: this platform read INCOIS's CF-1.6 and wrote packed
        binary plus JSON, which is right for a GPU and useless to a scientist. Same numbers,
        self-describing.
        """
        field_spec(field)
        return Response(
            content=cf.to_netcdf_bytes(dataset_for(field, index)),
            media_type="application/x-netcdf",
            headers={"Content-Disposition": f'attachment; filename="{field}_{index:03d}.nc"'},
        )

    # ------------------------------------------------------------------ OPeNDAP

    @app.get("/opendap/{field}/{index}.das")
    def opendap_das(field: str, index: int) -> Response:
        field_spec(field)
        return Response(dap.das(dataset_for(field, index)), media_type="text/plain")

    @app.get("/opendap/{field}/{index}.dds")
    def opendap_dds(field: str, index: int) -> Response:
        field_spec(field)
        return Response(dap.dds(dataset_for(field, index)), media_type="text/plain")

    @app.get("/opendap/{field}/{index}.dods")
    def opendap_dods(field: str, index: int, request: Request) -> Response:
        """The data.

        The constraint expression is taken from the raw query string, because DAP2's syntax -
        `?temperature[0][0:9][0:35][0:45]` - is not key=value and a form parser mangles it.

        It still has to be percent-decoded by hand: most DAP clients escape the brackets, so the
        raw query arrives as `temperature%5B0%5D%5B0:9%5D...` and the variable name parses out
        as the whole encoded string.
        """
        from urllib.parse import unquote

        field_spec(field)
        try:
            payload = dap.dods(dataset_for(field, index), unquote(request.url.query) or None)
        except dap.ConstraintError as error:
            raise HTTPException(400, str(error)) from error
        return Response(payload, media_type="application/octet-stream")

    @app.get("/opendap/{field}/{index}.html")
    def opendap_form(field: str, index: int) -> Response:
        """What a browser gets. A DAP endpoint that answers a browser with binary looks broken."""
        spec = field_spec(field)
        stamp = manifest()["timesteps"][index][:10]
        base = f"/opendap/{field}/{index}"
        body = f"""<!doctype html><meta charset="utf-8">
<title>Samudra 3D - OPeNDAP</title>
<style>
 body{{font:15px/1.65 system-ui,-apple-system,sans-serif;max-width:64ch;margin:44px auto;padding:0 20px;color:#16232a}}
 code,pre{{background:#eef3f3;border-radius:4px}} code{{padding:1px 5px}} pre{{padding:12px 14px;overflow-x:auto}}
 h1{{font-size:22px;margin-bottom:4px}} .sub{{color:#5a6f75;margin-top:0}}
</style>
<h1>{spec['label']} &middot; {stamp}</h1>
<p class="sub">OPeNDAP (DAP2), served from the analysis on its native one-degree grid - never
from the quantised volume the 3D view renders.</p>
<ul>
 <li><a href="{base}.das">{base}.das</a> &mdash; attributes</li>
 <li><a href="{base}.dds">{base}.dds</a> &mdash; structure</li>
 <li><a href="{base}.dods">{base}.dods</a> &mdash; data, optionally constrained</li>
 <li><a href="/api/netcdf/{field}/{index}">/api/netcdf/{field}/{index}</a> &mdash; the same
     numbers as CF-1.8 NetCDF</li>
</ul>
<p>From Python:</p>
<pre><code>import xarray as xr
ds = xr.open_dataset("http://localhost:8000{base}", engine="pydap")
ds["{field}"].sel(latitude=12.5, longitude=72.5, method="nearest")</code></pre>
<p>A hyperslab, in DAP's own syntax (the last index is <em>inclusive</em>):</p>
<pre><code>{base}.dods?{field}[0][0:9][0:35][0:45]</code></pre>
"""
        return Response(body, media_type="text/html")

    # ------------------------------------------------------------------ OGC WMS

    @app.get("/wms")
    def wms_endpoint(request: Request) -> Response:
        """OGC WMS 1.3.0: GetCapabilities, GetMap, GetFeatureInfo."""
        params = {key.lower(): value for key, value in request.query_params.items()}
        operation = params.get("request", "").lower()
        stamps = [datetime.fromisoformat(t) for t in manifest()["timesteps"]]

        try:
            if operation == "getcapabilities":
                region = manifest()["region"]
                levels = [float(v) for v in native_grid(manifest()["fields"][0]["key"], 0).levels]
                layers = [
                    {
                        "name": spec["key"],
                        "title": spec["label"],
                        "abstract": (spec.get("description") or spec["label"])
                        + (
                            "  Computed by this platform; published nowhere else."
                            if spec["key"] in OURS
                            else "  INCOIS's published analysis, restated on its native grid."
                        ),
                        "units": spec["units"],
                        "ours": spec["key"] in OURS,
                    }
                    for spec in servable_fields()
                ]
                return Response(
                    wms.capabilities(
                        str(request.url.replace(query="")),
                        layers,
                        stamps,
                        levels,
                        (region["west"], region["east"], region["south"], region["north"]),
                    ),
                    media_type="text/xml",
                )

            if operation in ("getmap", "getfeatureinfo"):
                raw = params.get("query_layers") or params.get("layers") or ""
                names = [name for name in raw.split(",") if name]
                if len(names) != 1:
                    raise wms.WmsError(
                        "this server draws exactly one layer per request", "LayerNotDefined"
                    )
                spec = field_spec(names[0])
                index = wms.nearest_timestep(params.get("time"), stamps)
                grid = native_grid(spec["key"], index)
                level = wms.nearest_level(params.get("elevation"), grid.levels)
                bbox = wms.parse_bbox(params.get("bbox", ""), params.get("crs", "EPSG:4326"))
                width = int(params.get("width", 256))
                height = int(params.get("height", 256))

                if operation == "getmap":
                    low, high = spec["range"]
                    return Response(
                        wms.render(grid, level, palette_for(spec), low, high, bbox, width, height),
                        media_type="image/png",
                    )

                west, east, south, north = bbox
                column, row = int(params.get("i", 0)), int(params.get("j", 0))
                longitude = west + (column + 0.5) * (east - west) / width
                latitude = north - (row + 0.5) * (north - south) / height
                value = wms.feature_info(grid, level, latitude, longitude)
                return Response(
                    json.dumps(
                        {
                            "layer": spec["key"],
                            "units": spec["units"],
                            "latitude": round(latitude, 4),
                            "longitude": round(longitude, 4),
                            "depth": float(grid.levels[level]),
                            "time": manifest()["timesteps"][index],
                            # Read off the Grid, not sampled back out of the picture. Null over
                            # land, because that is absence of ocean rather than a value.
                            "value": None if not np.isfinite(value) else round(float(value), 4),
                        }
                    ),
                    media_type="application/json",
                )

            raise wms.WmsError(
                f"unknown REQUEST {params.get('request', '')!r}", "OperationNotSupported"
            )
        except wms.WmsError as error:
            # A WMS client can read a ServiceExceptionReport and cannot read a bare 400.
            return Response(
                wms.service_exception(str(error), error.code),
                media_type="text/xml",
                status_code=400,
            )
