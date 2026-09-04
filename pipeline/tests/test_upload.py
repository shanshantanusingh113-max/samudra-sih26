"""The upload endpoint: what it accepts, what it refuses, and what it says when it refuses.

The parsing itself is tested in `test_netcdf_source.py`. What is tested here is the thing a
judge will actually do - drop a file on a running service and read what comes back - and in
particular that a file this platform cannot use produces a **sentence naming the problem**
rather than a 500 or, far worse, a rendered picture of the wrong thing.

The endpoint is driven through FastAPI's own test client, so what is exercised is the routing,
the status codes and the response shape, not a re-implementation of them.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pytest
import xarray as xr

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "api"))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import upload  # noqa: E402

# The demo's own grid nodes, exactly. A file one row short of the block's northern edge is a
# legitimate thing to upload and Masks that row, which is correct and is not what this fixture
# is for - it is here to check the resampling, not the edge.
LATS = np.arange(-9.5, 26.5, 1.0)
LONS = np.arange(45.5, 101.5, 1.0)
DEPTHS = np.array([5.0, 50.0, 200.0, 1000.0, 2000.0])

# The block the demo renders. Kept here rather than read from the bake, so the test does not
# depend on a bake having been run.
VOLUME = {
    "width": 56,
    "height": 36,
    "depth": 48,
    "surfaceMetres": 5.0,
    "floorMetres": 2000.0,
    "west": 45.5,
    "east": 100.5,
    "south": -9.5,
    "north": 25.5,
}


@pytest.fixture
def client():
    app = FastAPI()
    upload.register(app, lambda: {"volume": VOLUME})
    with TestClient(app) as test_client:
        yield test_client
    for session in list(upload._sessions.values()):
        session.close()
    upload._sessions.clear()


def netcdf_bytes(dataset, tmp_path, name="test.nc") -> bytes:
    path = tmp_path / name
    dataset.to_netcdf(path)
    return path.read_bytes()


def good_dataset():
    values = np.zeros((len(DEPTHS), len(LATS), len(LONS)))
    for level in range(len(DEPTHS)):
        for row in range(len(LATS)):
            values[level, row, :] = level * 10 + row * 0.5
    return xr.Dataset(
        {
            "thetao": (
                ("depth", "lat", "lon"),
                values,
                {"long_name": "Potential Temperature", "units": "degC",
                 "standard_name": "sea_water_potential_temperature"},
            )
        },
        coords={
            "depth": ("depth", DEPTHS, {"units": "m", "positive": "down"}),
            "lat": ("lat", LATS, {"units": "degrees_north"}),
            "lon": ("lon", LONS, {"units": "degrees_east"}),
        },
    )


def test_a_good_file_comes_back_as_something_shaped_like_a_manifest(client, tmp_path):
    response = client.post("/api/netcdf", content=netcdf_bytes(good_dataset(), tmp_path))
    assert response.status_code == 200
    body = response.json()
    assert body["axes"] == {"longitude": "lon", "latitude": "lat", "depth": "depth", "time": None}
    assert [f["key"] for f in body["fields"]] == ["thetao"]
    assert body["fields"][0]["label"] == "Potential Temperature"
    assert body["fields"][0]["palette"] == "thermal"
    assert body["timesteps"] == [None]
    # The one thing a user could otherwise get wrong, said in the response itself.
    assert body["resampledOnto"]["width"] == VOLUME["width"]


def test_the_volume_is_the_size_the_shader_expects(client, tmp_path):
    token = client.post("/api/netcdf", content=netcdf_bytes(good_dataset(), tmp_path)).json()["token"]
    response = client.get(f"/api/netcdf/{token}/volume/thetao/0")
    assert response.status_code == 200
    assert len(response.content) == VOLUME["width"] * VOLUME["height"] * VOLUME["depth"] * 4
    # The range the bytes were quantised against travels with them, or the colourbar beside them
    # is a different scale wearing the same numbers.
    assert float(response.headers["x-range-min"]) < float(response.headers["x-range-max"])


def test_not_a_netcdf_file_at_all_is_refused_in_words(client):
    response = client.post("/api/netcdf", content=b"platform_id,latitude\n1901897,12.4\n")
    assert response.status_code == 400
    assert "NetCDF" in response.json()["detail"]


def test_an_empty_body_is_refused(client):
    assert client.post("/api/netcdf", content=b"").status_code == 400


def test_a_file_with_no_longitude_names_the_axis_it_could_not_find(client, tmp_path):
    """The refusal that matters. A file rendered on a guessed axis looks entirely normal."""
    ds = xr.Dataset(
        {"foo": (("lat", "x"), np.zeros((len(LATS), len(LONS))))},
        coords={"lat": ("lat", LATS, {"units": "degrees_north"}), "x": ("x", LONS)},
    )
    response = client.post("/api/netcdf", content=netcdf_bytes(ds, tmp_path))
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["axis"] == "longitude"
    assert "degrees_east" in detail["detail"]


def test_a_sigma_coordinate_is_refused_rather_than_drawn_as_metres(client, tmp_path):
    ds = good_dataset()
    ds["depth"].attrs["units"] = "sigma"
    response = client.post("/api/netcdf", content=netcdf_bytes(ds, tmp_path))
    assert response.status_code == 422
    assert response.json()["detail"]["axis"] == "depth"


def test_a_file_covering_a_different_ocean_is_refused_by_name(client, tmp_path):
    ds = xr.Dataset(
        {"thetao": (("lat", "lon"), np.zeros((5, 5)))},
        coords={
            "lat": ("lat", np.arange(50.0, 55.0), {"units": "degrees_north"}),
            "lon": ("lon", np.arange(-40.0, -35.0), {"units": "degrees_east"}),
        },
    )
    token = client.post("/api/netcdf", content=netcdf_bytes(ds, tmp_path)).json()["token"]
    response = client.get(f"/api/netcdf/{token}/volume/thetao/0")
    assert response.status_code == 422
    assert response.json()["detail"]["axis"] == "region"


def test_a_variable_the_file_does_not_have_is_refused_by_name(client, tmp_path):
    token = client.post("/api/netcdf", content=netcdf_bytes(good_dataset(), tmp_path)).json()["token"]
    response = client.get(f"/api/netcdf/{token}/volume/salinity/0")
    assert response.status_code == 422
    assert response.json()["detail"]["axis"] == "variable"


def test_a_timestep_the_file_does_not_have_is_refused(client, tmp_path):
    token = client.post("/api/netcdf", content=netcdf_bytes(good_dataset(), tmp_path)).json()["token"]
    assert client.get(f"/api/netcdf/{token}/volume/thetao/7").status_code == 404


def test_an_unknown_token_says_the_upload_is_gone_rather_than_failing(client):
    response = client.get("/api/netcdf/deadbeef/volume/thetao/0")
    assert response.status_code == 404
    assert "no longer held" in response.json()["detail"]


def test_clearing_an_upload_deletes_the_file_from_disk(client, tmp_path):
    token = client.post("/api/netcdf", content=netcdf_bytes(good_dataset(), tmp_path)).json()["token"]
    path = upload._sessions[token].path
    assert path.exists()
    assert client.delete(f"/api/netcdf/{token}").status_code == 200
    assert not path.exists()
    assert client.get(f"/api/netcdf/{token}/volume/thetao/0").status_code == 404


def test_only_the_most_recent_uploads_are_kept_and_the_rest_are_deleted(client, tmp_path):
    """A demonstration endpoint, not a storage service. The oldest is closed and its file
    removed, so a long-running server cannot accumulate strangers' data."""
    tokens, paths = [], []
    for index in range(upload.MAX_SESSIONS + 1):
        body = client.post(
            "/api/netcdf", content=netcdf_bytes(good_dataset(), tmp_path, f"f{index}.nc")
        ).json()
        tokens.append(body["token"])
        if body["token"] in upload._sessions:
            paths.append(upload._sessions[body["token"]].path)
    assert len(upload._sessions) == upload.MAX_SESSIONS
    assert tokens[0] not in upload._sessions
    assert not paths[0].exists()


def test_a_surface_only_file_is_drawn_as_a_skin_and_not_as_a_column(tmp_path):
    """A 2D field has no vertical axis. Filling the column with its one value would claim a
    2000 m measurement somebody took at the surface - ADR 0014's rule, one quantity further on.
    """
    ds = xr.Dataset(
        {"sst": (("lat", "lon"), np.full((len(LATS), len(LONS)), 28.0))},
        coords={
            "lat": ("lat", LATS, {"units": "degrees_north"}),
            "lon": ("lon", LONS, {"units": "degrees_east"}),
        },
    )
    from samudra.depth_warp import DepthWarp
    from samudra.sources.base import BoundingBox
    from samudra.sources.netcdf import NetcdfFileSource

    source = NetcdfFileSource(ds)
    grid = source.fetch_grid(
        "sst", None, BoundingBox(south=-9.5, north=25.5, west=45.5, east=100.5)
    )
    block = upload._onto_demo_block(
        grid, VOLUME, DepthWarp(top=VOLUME["surfaceMetres"], bottom=VOLUME["floorMetres"])
    )
    assert np.isfinite(block[0]).all()
    assert not np.isfinite(block[1:]).any()


@pytest.fixture
def fussy_client():
    """A service that only accepts writes from one page, which is the shipped default's shape."""
    app = FastAPI()
    upload.register(app, lambda: {"volume": VOLUME}, ["http://localhost:5173"])
    with TestClient(app) as test_client:
        yield test_client
    for session in list(upload._sessions.values()):
        session.close()
    upload._sessions.clear()


def test_a_page_this_service_does_not_know_may_not_upload(fussy_client, tmp_path):
    """Reading is open to any origin. Writing is not, and that is a different question.

    The wildcard CORS policy is right for read-only public scientific data and became wrong the
    moment POST and DELETE were added: any page a reader had open in another tab could upload
    here and delete somebody else's upload by guessing a token.
    """
    response = fussy_client.post(
        "/api/netcdf",
        content=netcdf_bytes(good_dataset(), tmp_path),
        headers={"origin": "https://not-us.example"},
    )
    assert response.status_code == 403


def test_a_script_with_no_origin_header_is_not_a_browser_and_is_not_checked(
    fussy_client, tmp_path
):
    response = fussy_client.post("/api/netcdf", content=netcdf_bytes(good_dataset(), tmp_path))
    assert response.status_code == 200


def test_the_page_this_service_serves_may_upload(fussy_client, tmp_path):
    response = fussy_client.post(
        "/api/netcdf",
        content=netcdf_bytes(good_dataset(), tmp_path),
        headers={"origin": "http://localhost:5173"},
    )
    assert response.status_code == 200


def test_a_flat_file_is_not_offered_an_isosurface(client, tmp_path):
    """An isosurface through one slab is not a surface. This answered "yes, always"."""
    values = np.zeros((len(LATS), len(LONS)))
    flat = xr.Dataset(
        {"sst": (("lat", "lon"), values, {"units": "degC"})},
        coords={
            "lat": ("lat", LATS, {"units": "degrees_north"}),
            "lon": ("lon", LONS, {"units": "degrees_east"}),
        },
    )
    body = client.post("/api/netcdf", content=netcdf_bytes(flat, tmp_path)).json()
    assert body["fields"][0]["isosurface"] is False
    # And it says so, so the client can open the Depth slice back to the surface rather than
    # drawing a Field in slab 0 under a slice that starts at 200 m.
    assert body["fields"][0]["surfaceOnly"] is True


def test_a_file_with_depth_keeps_its_isosurface(client, tmp_path):
    body = client.post("/api/netcdf", content=netcdf_bytes(good_dataset(), tmp_path)).json()
    assert body["fields"][0]["isosurface"] is True
    assert body["fields"][0]["surfaceOnly"] is False


def test_a_partly_readable_file_offers_what_it_can_and_names_what_it_dropped(client, tmp_path):
    """The good variable is drawn and the bad one is reported, rather than either being silent."""
    good = good_dataset()
    sigma = np.array([0.1, 0.5])
    mixed = xr.Dataset(
        {
            "thetao": good["thetao"],
            "so": (("sigma", "lat", "lon"), np.zeros((2, len(LATS), len(LONS)))),
        },
        coords={
            **{k: good[k] for k in ("depth", "lat", "lon")},
            "sigma": ("sigma", sigma, {"long_name": "sigma level"}),
        },
    )
    body = client.post("/api/netcdf", content=netcdf_bytes(mixed, tmp_path)).json()
    assert [f["key"] for f in body["fields"]] == ["thetao"]
    assert "so" in body["skipped"]
    assert "sigma" in body["skipped"]["so"]


def test_the_colour_range_is_taken_over_the_water_that_will_be_drawn(client, tmp_path):
    """A global file's percentiles are set by ocean nowhere near this block.

    The region holds values 0 to 35 and the rest of the file holds 1000. Ranged over the whole
    variable the block would use a sliver of the palette under a colourbar promising a thousand.
    """
    lats = np.arange(-60.0, 60.0, 1.0)
    lons = np.arange(-180.0, 180.0, 1.0)
    inside_rows = (lats >= VOLUME["south"]) & (lats <= VOLUME["north"])
    inside_cols = (lons >= VOLUME["west"]) & (lons <= VOLUME["east"])
    block = np.full((len(lats), len(lons)), 1000.0)
    block[np.ix_(inside_rows, inside_cols)] = 20.0
    global_file = xr.Dataset(
        {"sst": (("lat", "lon"), block, {"units": "degC"})},
        coords={
            "lat": ("lat", lats, {"units": "degrees_north"}),
            "lon": ("lon", lons, {"units": "degrees_east"}),
        },
    )
    body = client.post("/api/netcdf", content=netcdf_bytes(global_file, tmp_path)).json()
    low, high = body["fields"][0]["range"]
    assert low == pytest.approx(20.0)
    assert high == pytest.approx(20.0 + 1.0)


def test_a_file_over_the_size_limit_is_refused_by_its_declared_length(client):
    """Refused before it is in memory, not after. `await request.body()` buffered 2 GB first."""
    response = client.post(
        "/api/netcdf",
        content=b"x" * 16,
        headers={"content-length": str(upload.MAX_BYTES + 1)},
    )
    assert response.status_code == 413
