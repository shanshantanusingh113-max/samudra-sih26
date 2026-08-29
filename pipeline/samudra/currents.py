"""Current vectors, as a picture, from Copernicus Marine.

PS 26067 names current vectors and this platform has not had them. Two attempts are already on
the record as failures, both for good reasons:

- INCOIS publish geostrophic currents in `incois_valueadded_products_datasets`, properly derived
  and validated, and that series stops at **2019-03-30** against an analysis running to
  2026-07-30. It cannot share this timeline.
- Deriving them here by thermal wind was prototyped and rejected on measurement: 0.16 m/s for
  the Somali Current at the height of the southwest monsoon against a real 1.5-2.5, and the
  fastest water in the block on the equator, where geostrophy does not hold. ADR 0010.

What is left is Copernicus Marine's global analysis, which is 1/12 degree, 50 levels, daily, and
current to a nine-day forecast. Its *data* is not anonymous - measured, the Zarr store answers
200 for `.zmetadata` and every coordinate array and 403 for `uo` and `vo` - so reading the
numbers would need a Copernicus account and a secret in the bake. Its **WMTS is anonymous**, and
that is what this module uses.

So this layer is a rendered image and nothing else, and the whole design follows from that:

- Nothing about it is clickable and no number is ever read off it. That is not a discipline the
  code has to maintain; a rendered tile physically cannot give you a number, which is exactly why
  a picture is the safe way to carry a field we cannot verify ourselves.
- It is not a Field. It never enters the Variable selector, it is never collocated, it has no
  Volume and no isosurface. Putting it beside temperature and salinity would imply it had been
  through the same pipeline, and it has not.
- It carries its own attribution and its own date on screen, because it is somebody else's
  analysis of somebody else's model, not ours.

Tiles are fetched at bake time and committed, so the demo still makes no network calls.

Why EPSG:4326 rather than the usual Web Mercator: the service offers both, and 4326 is plate
carree - linear in longitude and latitude, which is the projection the scene already uses. The
tiles drop straight onto the map with no reprojection and no resampling error.
"""

from __future__ import annotations

import io
import math
from dataclasses import dataclass
from datetime import datetime
from typing import Iterator

import requests

_SERVER = "https://wmts.marine.copernicus.eu/teroWmts"
_DATASET = "GLOBAL_ANALYSISFORECAST_PHY_001_024/cmems_mod_glo_phy-cur_anfc_0.083deg_P1D-m_202406"
LAYER = f"{_DATASET}/sea_water_velocity"

# Arrows coloured by speed, on transparent ground, so the layer sits over our own field instead
# of replacing it. The `solid` and `solidAndVector` styles paint a filled speed map, which would
# cover the INCOIS analysis the rest of the view is about.
STYLE = "cmap:speed,vectorStyle:vector"

# The shallowest level the product offers, which is what "surface current" means here.
SURFACE_ELEVATION = "-0.49402499198913574"

# Zoom and matrix set together decide two separate things, and it took a measurement to see
# that they are separate.
#
# Copernicus draws a fixed number of arrows per *tile*, so in the plain EPSG:4326 set the arrows
# come out eight pixels apart whatever the zoom - both the arrow count and the pixel count double
# per level, and they cancel. At zoom 4 the demo region came back as 1024 x 797 with roughly 128
# arrows across it, which does not read as vectors at all; it reads as texture.
#
# The `@2x` sets serve the same geographic tile at double the pixels, so dropping a zoom level
# and taking `@2x` keeps the resolution and quarters the arrows. Zoom 3 at `@2x` puts about 23
# pixels on a degree and an arrow every 0.7 degrees: 64 arrows across the region, which is a
# vector field.
MATRIX_SET = "EPSG:4326@2x"
ZOOM = 3
TILE_PIXELS = 512

ATTRIBUTION = (
    "Surface currents rendered by E.U. Copernicus Marine Service Information "
    "(GLOBAL_ANALYSISFORECAST_PHY_001_024). Arrows show direction; colour shows speed. "
    "This layer is an image published by Copernicus, not a field this platform computed or "
    "can be queried for values."
)

_TIMEOUT = 120


@dataclass(frozen=True)
class TileGrid:
    """Which tiles cover a box, and where to crop the stitched image."""

    zoom: int
    first_col: int
    last_col: int
    first_row: int
    last_row: int
    # Pixel box to cut out of the stitched sheet, left, top, right, bottom.
    crop: tuple[int, int, int, int]
    # What the cropped image actually spans, which is the box asked for.
    west: float
    east: float
    south: float
    north: float

    @property
    def columns(self) -> int:
        return self.last_col - self.first_col + 1

    @property
    def rows(self) -> int:
        return self.last_row - self.first_row + 1

    def tiles(self) -> Iterator[tuple[int, int]]:
        for row in range(self.first_row, self.last_row + 1):
            for col in range(self.first_col, self.last_col + 1):
                yield row, col


def tile_span(zoom: int) -> float:
    """Degrees covered by one tile at this zoom.

    The EPSG:4326 matrix set is 2 x 1 tiles at zoom 0 and doubles each level, with its top-left
    corner at 90 N, 180 W - so a tile is always square in degrees.
    """
    return 180.0 / (2**zoom)


def cover(west: float, east: float, south: float, north: float, zoom: int = ZOOM) -> TileGrid:
    """The tiles covering a geographic box, and the crop that trims them back to it.

    Tiles never line up with a region boundary, so the sheet is always bigger than the box and
    the surplus has to come off. Getting this wrong shifts the whole layer sideways against the
    coastlines underneath it, which reads as a current flowing over land.
    """
    if not (east > west and north > south):
        raise ValueError(f"need east > west and north > south, got {west},{east} {south},{north}")

    span = tile_span(zoom)
    first_col = int(math.floor((west + 180.0) / span))
    last_col = int(math.ceil((east + 180.0) / span)) - 1
    first_row = int(math.floor((90.0 - north) / span))
    last_row = int(math.ceil((90.0 - south) / span)) - 1

    pixels_per_degree = TILE_PIXELS / span
    sheet_west = first_col * span - 180.0
    sheet_north = 90.0 - first_row * span

    left = round((west - sheet_west) * pixels_per_degree)
    top = round((sheet_north - north) * pixels_per_degree)
    right = round((east - sheet_west) * pixels_per_degree)
    bottom = round((sheet_north - south) * pixels_per_degree)

    return TileGrid(
        zoom=zoom,
        first_col=first_col,
        last_col=last_col,
        first_row=first_row,
        last_row=last_row,
        crop=(left, top, right, bottom),
        west=west,
        east=east,
        south=south,
        north=north,
    )


def tile_url(row: int, col: int, when: datetime, zoom: int = ZOOM) -> str:
    """One GetTile request. Time is a dimension of the layer, so the date is part of the query."""
    from urllib.parse import urlencode

    query = {
        "service": "WMTS",
        "request": "GetTile",
        "version": "1.0.0",
        "layer": LAYER,
        "style": STYLE,
        "tilematrixset": MATRIX_SET,
        "format": "image/png",
        "tilematrix": str(zoom),
        "tilerow": str(row),
        "tilecol": str(col),
        "time": when.strftime("%Y-%m-%dT00:00:00.000Z"),
        "elevation": SURFACE_ELEVATION,
    }
    return f"{_SERVER}?{urlencode(query)}"


def fetch_overlay(west, east, south, north, when: datetime, zoom: int = ZOOM):
    """Stitch one date's tiles into a single transparent PNG covering exactly the box.

    Returns a Pillow image. Imported here rather than at module scope so the tile arithmetic
    above stays testable without Pillow, and so a machine that only runs the API never loads it.
    """
    from PIL import Image

    grid = cover(west, east, south, north, zoom)
    sheet = Image.new("RGBA", (grid.columns * TILE_PIXELS, grid.rows * TILE_PIXELS), (0, 0, 0, 0))

    for row, col in grid.tiles():
        response = requests.get(tile_url(row, col, when, zoom), timeout=_TIMEOUT)
        response.raise_for_status()
        tile = Image.open(io.BytesIO(response.content)).convert("RGBA")
        sheet.paste(
            tile,
            ((col - grid.first_col) * TILE_PIXELS, (row - grid.first_row) * TILE_PIXELS),
        )

    return sheet.crop(grid.crop)


def fetch_legend() -> dict:
    """The value range and colours Copernicus drew the arrows with.

    Fetched rather than assumed, so the key on screen carries real numbers - measured today,
    0 to 1.035 m/s - and cannot drift out of step with the tiles if Copernicus restyles them.
    """
    from urllib.parse import urlencode

    query = {
        "SERVICE": "WMTS",
        "REQUEST": "GetLegend",
        "LAYER": LAYER,
        "STYLE": STYLE,
        "FORMAT": "application/json",
    }
    response = requests.get(f"{_SERVER}?{urlencode(query)}", timeout=_TIMEOUT)
    response.raise_for_status()
    continuous = response.json().get("continuous", {})
    return {
        "min": float(continuous.get("valueMin", 0.0)),
        "max": float(continuous.get("valueMax", 1.0)),
        "units": "m/s",
        "quantity": continuous.get("variableName", "Sea water velocity"),
    }
