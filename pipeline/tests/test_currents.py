"""The tile arithmetic behind the currents overlay.

The layer itself is a picture and nothing is read off it, so almost none of it needs a test. The
one part that does is where the tiles land: tiles never line up with a region boundary, so the
stitched sheet is always bigger than the box asked for and the surplus has to be cropped. Getting
that wrong shifts the whole overlay sideways against the coastlines under it, which does not look
like a bug - it looks like a current flowing across Somalia.
"""

from __future__ import annotations

import pytest

from samudra.currents import TILE_PIXELS, cover, tile_span


def test_the_matrix_matches_what_the_service_publishes():
    """Copernicus's EPSG:4326 set is 2x1 tiles at zoom 0, doubling each level. At zoom 4 its
    capabilities say MatrixWidth 32, MatrixHeight 16 - so a tile is 11.25 degrees square."""
    assert tile_span(0) == pytest.approx(180.0)
    assert tile_span(4) == pytest.approx(11.25)
    assert 360.0 / tile_span(4) == pytest.approx(32)
    assert 180.0 / tile_span(4) == pytest.approx(16)


def test_the_demo_region_needs_three_columns_and_three_rows():
    """Zoom 3, where a tile is 22.5 degrees square. 55 E falls in the column starting at 45 E."""
    grid = cover(west=55.0, east=100.0, south=-10.0, north=25.0, zoom=3)
    assert (grid.first_col, grid.last_col) == (10, 12)
    assert (grid.first_row, grid.last_row) == (2, 4)
    assert (grid.columns, grid.rows) == (3, 3)
    assert len(list(grid.tiles())) == 9


def test_the_crop_cuts_the_sheet_back_to_exactly_the_box():
    grid = cover(west=55.0, east=100.0, south=-10.0, north=25.0, zoom=3)
    left, top, right, bottom = grid.crop
    pixels_per_degree = TILE_PIXELS / tile_span(3)
    assert right - left == pytest.approx((100.0 - 55.0) * pixels_per_degree, abs=1)
    assert bottom - top == pytest.approx((25.0 - -10.0) * pixels_per_degree, abs=1)


def test_the_crop_never_reaches_outside_the_sheet():
    """An off-by-one here is a black band down one edge of the overlay."""
    for box in [
        (55.0, 100.0, -10.0, 25.0),
        (0.0, 22.5, 0.0, 22.5),            # exactly one tile
        (-180.0, 180.0, -80.0, 80.0),      # the whole world
        (44.9, 101.3, -10.1, 25.1),
    ]:
        grid = cover(*box, zoom=3)
        left, top, right, bottom = grid.crop
        assert 0 <= left < right <= grid.columns * TILE_PIXELS
        assert 0 <= top < bottom <= grid.rows * TILE_PIXELS


def test_a_box_on_exact_tile_boundaries_does_not_fetch_a_spare_tile():
    """A box whose edges land exactly on tile lines must not pull in a spare column."""
    grid = cover(west=45.0, east=112.5, south=-22.5, north=22.5, zoom=3)
    assert grid.columns == 3
    assert grid.rows == 2
    assert grid.crop == (0, 0, 3 * TILE_PIXELS, 2 * TILE_PIXELS)


def test_a_finer_zoom_covers_the_same_ground_with_more_pixels():
    coarse = cover(55.0, 100.0, -10.0, 25.0, zoom=3)
    fine = cover(55.0, 100.0, -10.0, 25.0, zoom=4)
    width = lambda g: g.crop[2] - g.crop[0]
    assert width(fine) == pytest.approx(2 * width(coarse), abs=2)
    assert (fine.west, fine.east) == (coarse.west, coarse.east)


def test_an_inside_out_box_is_refused_rather_than_silently_wrapped():
    with pytest.raises(ValueError):
        cover(west=100.0, east=55.0, south=-10.0, north=25.0)
    with pytest.raises(ValueError):
        cover(west=55.0, east=100.0, south=25.0, north=-10.0)
