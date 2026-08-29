"""The OPeNDAP endpoint, checked against a real DAP client.

A hand-written protocol is only worth having if something other than its own author can read it,
so these tests do not assert on the bytes this code produces. They hand those bytes to `pydap` -
the reference Python DAP2 client, and the one `xarray.open_dataset(..., engine="pydap")` uses -
and check that the numbers that come back are the numbers that went in.

Why hand-written at all: `xpublish` is the sanctioned xarray route and requires Python 3.11 while
this project runs 3.10, and `xpublish-wms` pulls in Cartopy, dask, distributed, datashader,
numba and pyarrow to serve five one-degree fields. DAP2 over a rectangular array is three
responses, two of them plain text.
"""

from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "api"))

from cf import as_dataset  # noqa: E402
from dap import ConstraintError, das, dds, dods, parse_constraint  # noqa: E402

from samudra.grid import Grid  # noqa: E402

pydap_dap2 = pytest.importorskip("pydap.parsers.dds", reason="pydap is the DAP2 client")


LEVELS = np.array([5.0, 10.0, 20.0, 50.0, 100.0])
LATITUDES = np.array([-1.5, -0.5, 0.5, 1.5])
LONGITUDES = np.array([70.5, 71.5, 72.5])
WHEN = datetime(2026, 7, 30, tzinfo=timezone.utc)


def make_grid() -> Grid:
    """Values that are unmistakable if an axis gets transposed: level*100 + row*10 + column."""
    values = np.zeros((len(LEVELS), len(LATITUDES), len(LONGITUDES)))
    for level in range(len(LEVELS)):
        for row in range(len(LATITUDES)):
            for column in range(len(LONGITUDES)):
                values[level, row, column] = level * 100 + row * 10 + column
    # One masked cell, because land is the thing a protocol most easily gets wrong.
    values[0, 0, 0] = np.nan
    return Grid(levels=LEVELS, latitudes=LATITUDES, longitudes=LONGITUDES, values=values)


@pytest.fixture
def dataset():
    return as_dataset(make_grid(), "temperature", WHEN)


# ----------------------------------------------------------------- structure


def test_the_dds_parses_as_dap2(dataset):
    from pydap.parsers.dds import dds_to_dataset

    parsed = dds_to_dataset(dds(dataset))
    assert "temperature" in parsed


def test_the_dds_reports_the_real_shape(dataset):
    text = dds(dataset)
    assert "time = 1" in text
    assert f"depth = {len(LEVELS)}" in text
    assert f"latitude = {len(LATITUDES)}" in text
    assert f"longitude = {len(LONGITUDES)}" in text
    # A DAP Grid, so a client can discover the axes rather than being told them.
    assert "Grid {" in text and "ARRAY:" in text and "MAPS:" in text


def test_the_das_carries_the_standard_name_and_the_conventions(dataset):
    text = das(dataset)
    assert 'String standard_name "sea_water_temperature";' in text
    assert 'String units "degree_Celsius";' in text
    assert 'String Conventions "CF-1.8";' in text
    assert 'String positive "down";' in text


def test_a_field_with_no_standard_name_does_not_borrow_one():
    """Observation Coverage is a count of Argo casts and no vocabulary has a term for it.
    Inventing one that looks official is the same fault as inventing a colour convention."""
    coverage = as_dataset(make_grid(), "coverage", WHEN)
    text = das(coverage)
    # Only the variable's own block. The coordinates legitimately have standard names - depth,
    # latitude and longitude are all in the CF table; the quantity is what does not exist.
    block = text.split("    coverage {")[1].split("    }")[0]
    assert "standard_name" not in block
    assert "long_name" in block
    assert 'String standard_name "depth";' in text


# ----------------------------------------------------------------- constraints


def test_a_bare_request_returns_the_axes_and_then_the_field(dataset):
    """Coordinates first, then the Grid - the order `dds()` declares them in, because a .dods
    body is positional and a client reads it against the header it was given.

    They are top-level variables at all because xarray's pydap backend does not lift a DAP
    Grid's MAPS into coordinates: given maps alone it reported "Dimensions without coordinates"
    and `.sel(latitude=...)` raised. ERDDAP declares them both ways for the same reason.
    """
    assert [name for name, _ in parse_constraint(None, dataset)] == [
        "time",
        "depth",
        "latitude",
        "longitude",
        "temperature",
    ]
    assert parse_constraint("", dataset) == parse_constraint(None, dataset)


def test_a_named_variable_still_comes_back_alone(dataset):
    assert parse_constraint("temperature", dataset) == [("temperature", ())]


def test_a_dap_stop_index_is_inclusive(dataset):
    """DAP2's `[0:4]` over five levels means all five. Python's slice does not, and a client
    that asked for the whole array and got one level short would read it as our arithmetic."""
    [(_, slices)] = parse_constraint("temperature[0][0:4][0:3][0:2]", dataset)
    assert slices == (slice(0, 1, 1), slice(0, 5, 1), slice(0, 4, 1), slice(0, 3, 1))


def test_a_stride_is_the_middle_number(dataset):
    [(_, slices)] = parse_constraint("temperature[0][0:2:4]", dataset)
    assert slices[1] == slice(0, 5, 2)


def test_a_grid_member_can_be_named_either_way(dataset):
    assert parse_constraint("temperature.temperature", dataset)[0][0] == "temperature"


def test_an_unknown_variable_is_refused(dataset):
    with pytest.raises(ConstraintError):
        parse_constraint("chlorophyll", dataset)


def test_too_many_dimensions_is_refused(dataset):
    with pytest.raises(ConstraintError):
        dods(dataset, "temperature[0][0][0][0][0]")


# ----------------------------------------------------------------- data


def read_back(dataset, expression=None):
    """Decode a .dods response the way a client does, and hand back the array."""
    from pydap.parsers.dds import dds_to_dataset

    payload = dods(dataset, expression)
    header, _, data = payload.partition(b"\nData:\n")
    parsed = dds_to_dataset(header.decode("ascii").strip())
    return parsed, data


def unpack_floats(data: bytes, count: int, offset: int = 0, dtype=">f4"):
    """DAP2 writes an array's length twice, then the elements, all big-endian.

    `dtype` because the time axis goes over as Float64: xarray holds it as datetime64, which
    DAP2 has no type for, so it becomes CF seconds since the epoch. The DDS declares that, and a
    reader that assumed Float32 throughout would drift out of alignment from the time map on.
    """
    import struct

    width = np.dtype(dtype).itemsize
    first, second = struct.unpack_from(">ii", data, offset)
    assert first == second == count, f"length header says {first}/{second}, expected {count}"
    values = np.frombuffer(data, dtype=dtype, count=count, offset=offset + 8)
    return values, offset + 8 + width * count


def test_the_whole_array_comes_back_with_the_values_that_went_in(dataset):
    grid = make_grid()
    _, data = read_back(dataset, "temperature")
    values, after = unpack_floats(data, grid.values.size)
    got = values.reshape((1, *grid.values.shape))[0]
    assert np.allclose(got, grid.values, equal_nan=True)
    assert after <= len(data), "the maps should follow the array"


def test_a_masked_cell_arrives_as_nan_and_not_as_zero(dataset):
    """Land is absence of ocean. A protocol that turned it into 0 degC would be inventing water
    at the freezing point along every coastline."""
    _, data = read_back(dataset, "temperature")
    values, _ = unpack_floats(data, make_grid().values.size)
    assert np.isnan(values[0])


def test_the_maps_follow_the_array_and_match_the_slab(dataset):
    """A map that does not match the slab draws the right numbers at the wrong coordinates."""
    _, data = read_back(dataset, "temperature[0][0:1][0:3][0:2]")
    values, offset = unpack_floats(data, 1 * 2 * 4 * 3)
    _time, offset = unpack_floats(data, 1, offset, ">f8")  # seconds since the epoch
    depth, offset = unpack_floats(data, 2, offset)
    latitude, offset = unpack_floats(data, 4, offset)
    longitude, _ = unpack_floats(data, 3, offset)
    assert np.allclose(depth, LEVELS[:2])
    assert np.allclose(latitude, LATITUDES)
    assert np.allclose(longitude, LONGITUDES)


def test_a_hyperslab_returns_exactly_that_slab(dataset):
    grid = make_grid()
    _, data = read_back(dataset, "temperature[0][2:3][1:2][0:1]")
    values, _ = unpack_floats(data, 1 * 2 * 2 * 2)
    expected = grid.values[2:4, 1:3, 0:2]
    assert np.allclose(values.reshape(expected.shape), expected)


def test_a_strided_request_skips_the_right_rows(dataset):
    grid = make_grid()
    _, data = read_back(dataset, "temperature[0][0:2:4][0:3][0:2]")
    values, _ = unpack_floats(data, 1 * 3 * 4 * 3)
    expected = grid.values[0:5:2]
    assert np.allclose(values.reshape(expected.shape), expected, equal_nan=True)


def test_the_response_header_describes_what_was_actually_sent(dataset):
    """The DDS in a .dods is the constrained one, not the whole dataset - a client sizes its
    buffers from it, so a full-size header in front of a slab desynchronises everything."""
    parsed, _ = read_back(dataset, "temperature[0][0:1][0:3][0:2]")
    assert parsed["temperature"].shape == (1, 2, 4, 3)


def test_the_axes_arrive_as_variables_a_client_can_index_on(dataset):
    """The property that made `.sel(latitude=...)` work against this server."""
    text = dds(dataset)
    header = text.split("Grid {")[0]
    for axis in ("time", "depth", "latitude", "longitude"):
        assert f"{axis}[{axis} = " in header, f"{axis} is not declared at the top level"


def test_an_axis_can_be_asked_for_on_its_own(dataset):
    _, data = read_back(dataset, "latitude")
    values, _ = unpack_floats(data, len(LATITUDES))
    assert np.allclose(values, LATITUDES)
