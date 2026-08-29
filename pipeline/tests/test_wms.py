"""WMS 1.3.0, with the axis-order trap tested first.

WMS 1.3.0 reversed the axis order of EPSG:4326: a BBOX is minLat,minLon,maxLat,maxLon, because
that is what the EPSG registry says 4326's axis order is. Under CRS:84 - the same datum, defined
lon-first precisely because so much software got 4326 wrong - it is minLon,minLat,maxLon,maxLat.

Getting it backwards raises nothing. It serves the Arabian Sea rotated into the Southern Ocean,
and the picture still looks like an ocean, which is why every conformance suite tests it and why
it is the first thing tested here.
"""

from __future__ import annotations

import io
import sys
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "api"))

from wms import (  # noqa: E402
    VERSION,
    WmsError,
    capabilities,
    feature_info,
    nearest_level,
    nearest_timestep,
    parse_bbox,
    render,
    service_exception,
)

from samudra.grid import Grid  # noqa: E402
from samudra.palettes import lookup_table  # noqa: E402

LEVELS = np.array([5.0, 50.0, 200.0])
LATITUDES = np.arange(-9.5, 25.5, 1.0)
LONGITUDES = np.arange(55.5, 100.5, 1.0)
WHEN = [datetime(2026, 7, d, tzinfo=timezone.utc) for d in (10, 20, 30)]


def make_grid() -> Grid:
    """Temperature that rises to the north, so a flipped axis is visible as a flipped image."""
    values = np.zeros((len(LEVELS), len(LATITUDES), len(LONGITUDES)))
    for level in range(len(LEVELS)):
        for row in range(len(LATITUDES)):
            values[level, row, :] = 5.0 + row
    values[:, 0, 0] = np.nan  # one corner of land
    return Grid(levels=LEVELS, latitudes=LATITUDES, longitudes=LONGITUDES, values=values)


# ----------------------------------------------------------------- axis order


def test_epsg4326_takes_latitude_first():
    """The 1.3.0 rule. minLat, minLon, maxLat, maxLon."""
    assert parse_bbox("-10,55,25,100", "EPSG:4326") == (55.0, 100.0, -10.0, 25.0)


def test_crs84_takes_longitude_first():
    """Same ground, other order - which is the entire reason CRS:84 exists."""
    assert parse_bbox("55,-10,100,25", "CRS:84") == (55.0, 100.0, -10.0, 25.0)


def test_the_urn_form_of_a_crs_is_understood():
    assert parse_bbox("-10,55,25,100", "urn:ogc:def:crs:EPSG::4326") == (55.0, 100.0, -10.0, 25.0)


def test_the_two_orders_disagree_which_is_why_this_is_tested():
    """If these ever came out the same, the test above would be proving nothing."""
    assert parse_bbox("-10,55,25,100", "EPSG:4326") != parse_bbox("-10,55,25,100", "CRS:84")


def test_an_unsupported_crs_is_refused_with_the_right_code():
    with pytest.raises(WmsError) as caught:
        parse_bbox("0,0,1,1", "EPSG:3857")
    assert caught.value.code == "InvalidCRS"


def test_an_inside_out_or_malformed_bbox_is_refused():
    with pytest.raises(WmsError):
        parse_bbox("25,100,-10,55", "EPSG:4326")
    with pytest.raises(WmsError):
        parse_bbox("1,2,3", "CRS:84")


# ----------------------------------------------------------------- getmap


def open_png(data: bytes):
    from PIL import Image

    return Image.open(io.BytesIO(data))


def test_getmap_returns_a_png_of_the_size_asked_for():
    image = open_png(
        render(make_grid(), 0, lookup_table("thermal"), 2.0, 40.0, (55.0, 100.0, -10.0, 25.0), 90, 70)
    )
    assert image.size == (90, 70)
    assert image.mode == "RGBA"


def test_north_is_at_the_top():
    """An image runs north to south down its rows and a Grid runs south to north up its own.
    Getting that backwards flips the ocean, and the picture still looks plausible."""
    grid = make_grid()
    image = open_png(
        render(grid, 0, lookup_table("thermal"), 5.0, 40.0, (55.0, 100.0, -10.0, 25.0), 40, 40)
    )
    pixels = np.asarray(image)
    # thermal runs dark-cold to bright-warm, and the fixture is warmest at its northern edge.
    top = pixels[2, 20, :3].astype(int).sum()
    bottom = pixels[-3, 20, :3].astype(int).sum()
    assert top > bottom, "the north edge should be the warm end of the palette"


def test_land_is_transparent_and_never_a_colour():
    """A masked cell is absence of ocean. Painting it the bottom of the palette would draw
    freezing water along every coastline - the same fault volume.py records for the GPU."""
    grid = make_grid()
    data = render(grid, 0, lookup_table("thermal"), 5.0, 40.0, (55.0, 56.0, -10.0, -9.0), 8, 8)
    alpha = np.asarray(open_png(data))[..., 3]
    assert alpha.max() == 0, "that corner of the fixture is land"


def test_water_outside_the_grid_is_transparent_rather_than_the_nearest_edge():
    """A WMS that smeared its edge row across the request would be inventing an ocean."""
    grid = make_grid()
    data = render(grid, 0, lookup_table("thermal"), 5.0, 40.0, (120.0, 140.0, -10.0, 25.0), 20, 20)
    assert np.asarray(open_png(data))[..., 3].max() == 0


def test_a_silly_size_is_refused_rather_than_allocated():
    with pytest.raises(WmsError):
        render(make_grid(), 0, lookup_table("thermal"), 5.0, 40.0, (55.0, 100.0, -10.0, 25.0), 99999, 10)
    with pytest.raises(WmsError):
        render(make_grid(), 0, lookup_table("thermal"), 5.0, 40.0, (55.0, 100.0, -10.0, 25.0), 0, 10)


def test_an_empty_style_range_is_refused():
    with pytest.raises(WmsError):
        render(make_grid(), 0, lookup_table("thermal"), 20.0, 20.0, (55.0, 100.0, -10.0, 25.0), 10, 10)


# ----------------------------------------------------------------- dimensions


def test_time_resolves_to_the_nearest_analysis_and_defaults_to_the_newest():
    assert nearest_timestep(None, WHEN) == 2
    assert nearest_timestep("2026-07-19T00:00:00Z", WHEN) == 1
    assert nearest_timestep("2026-07-11T00:00:00Z", WHEN) == 0


def test_a_malformed_time_is_refused_with_the_dimension_code():
    with pytest.raises(WmsError) as caught:
        nearest_timestep("last tuesday", WHEN)
    assert caught.value.code == "InvalidDimensionValue"


def test_elevation_resolves_to_the_nearest_level_and_defaults_to_the_surface():
    assert nearest_level(None, LEVELS) == 0
    assert nearest_level("60", LEVELS) == 1
    # Depth is positive down here and WMS elevation is usually negative down. Both work, because
    # a client that sends -200 means 200 m below the surface and refusing it helps nobody.
    assert nearest_level("-200", LEVELS) == 2


# ----------------------------------------------------------------- feature info


def test_getfeatureinfo_reads_the_grid_and_not_the_picture():
    grid = make_grid()
    value = feature_info(grid, 0, latitude=float(LATITUDES[5]), longitude=float(LONGITUDES[3]))
    assert value == pytest.approx(grid.values[0, 5, 3])


def test_getfeatureinfo_over_land_says_nothing_rather_than_zero():
    assert np.isnan(feature_info(make_grid(), 0, float(LATITUDES[0]), float(LONGITUDES[0])))


# ----------------------------------------------------------------- capabilities


LAYERS = [
    {
        "name": "temperature",
        "title": "Sea water temperature",
        "abstract": "INCOIS analysis, restated",
        "units": "degree_Celsius",
        "ours": False,
    },
    {
        "name": "density",
        "title": "Sea water density",
        "abstract": "Computed here with TEOS-10",
        "units": "kg m-3",
        "ours": True,
    },
]


def parsed_capabilities():
    return ET.fromstring(
        capabilities("http://localhost:8000/wms", LAYERS, WHEN, LEVELS, (55.0, 100.0, -10.0, 25.0))
    )


def test_the_capabilities_document_is_well_formed_and_declares_its_version():
    root = parsed_capabilities()
    assert root.get("version") == VERSION
    assert root.tag.endswith("WMS_Capabilities")


def test_every_layer_appears_with_both_supported_crs():
    root = parsed_capabilities()
    ns = {"w": "http://www.opengis.net/wms"}
    names = [e.text for e in root.iterfind(".//w:Layer/w:Name", ns)]
    assert names == ["temperature", "density"]
    for layer in root.iterfind(".//w:Layer[w:Name]", ns):
        crs = {e.text for e in layer.iterfind("w:CRS", ns)}
        assert crs == {"EPSG:4326", "CRS:84"}


def test_the_bounding_boxes_state_each_crs_in_its_own_axis_order():
    """A capabilities document that declares both CRS in the same order is telling one lie."""
    root = parsed_capabilities()
    ns = {"w": "http://www.opengis.net/wms"}
    layer = root.find(".//w:Layer[w:Name]", ns)
    boxes = {b.get("CRS"): b for b in layer.iterfind("w:BoundingBox", ns)}
    assert boxes["EPSG:4326"].get("minx") == "-10.0"   # latitude first
    assert boxes["EPSG:4326"].get("miny") == "55.0"
    assert boxes["CRS:84"].get("minx") == "55.0"       # longitude first
    assert boxes["CRS:84"].get("miny") == "-10.0"


def test_the_time_and_elevation_dimensions_list_what_is_actually_there():
    root = parsed_capabilities()
    ns = {"w": "http://www.opengis.net/wms"}
    layer = root.find(".//w:Layer[w:Name]", ns)
    dimensions = {d.get("name"): d for d in layer.iterfind("w:Dimension", ns)}
    assert dimensions["time"].text.count(",") == len(WHEN) - 1
    assert dimensions["time"].get("default") == "2026-07-30T00:00:00Z"
    assert dimensions["elevation"].text == "5,50,200"


def test_an_error_comes_back_as_a_service_exception_a_client_can_read():
    root = ET.fromstring(service_exception("BBOX is empty", "InvalidParameterValue"))
    assert root.tag.endswith("ServiceExceptionReport")
    assert root[0].get("code") == "InvalidParameterValue"
    assert "BBOX is empty" in root[0].text
