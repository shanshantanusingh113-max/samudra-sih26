import numpy as np
import pytest

from samudra.grid import Grid

LEVELS = np.array([5.0, 50.0, 200.0])
LATS = np.array([10.0, 11.0, 12.0])
LONS = np.array([80.0, 81.0])


def build(values=None) -> Grid:
    if values is None:
        values = np.arange(3 * 3 * 2, dtype=float).reshape(3, 3, 2)
    return Grid(levels=LEVELS, latitudes=LATS, longitudes=LONS, values=values)


def test_column_on_an_exact_node_returns_that_nodes_values():
    g = build()
    assert g.column_at(11.0, 81.0) == pytest.approx(g.values[:, 1, 1])


def test_column_at_a_cell_centre_is_the_mean_of_its_four_corners():
    g = build()
    corners = g.values[:, 0:2, 0:2].mean(axis=(1, 2))
    assert g.column_at(10.5, 80.5) == pytest.approx(corners)


def test_column_interpolates_along_one_axis_only_when_on_a_gridline():
    g = build()
    expected = (g.values[:, 0, 0] + g.values[:, 1, 0]) / 2
    assert g.column_at(10.5, 80.0) == pytest.approx(expected)


def test_a_masked_corner_poisons_the_column():
    """Bilinear interpolation across a coastline would invent ocean where there is land."""
    values = np.zeros((3, 3, 2))
    values[:, 0, 0] = np.nan
    g = build(values)
    assert np.all(np.isnan(g.column_at(10.5, 80.5)))
    # ...but a cell well clear of the land is unaffected.
    assert not np.any(np.isnan(g.column_at(11.5, 80.5)))


def test_a_masked_corner_only_poisons_the_levels_where_it_is_masked():
    values = np.zeros((3, 3, 2))
    values[2, 0, 0] = np.nan  # sea floor at the deepest Level only
    g = build(values)
    column = g.column_at(10.5, 80.5)
    assert not np.isnan(column[0]) and not np.isnan(column[1])
    assert np.isnan(column[2])


def test_outside_the_grid_is_refused_rather_than_clamped():
    g = build()
    for lat, lon in [(9.0, 80.5), (13.0, 80.5), (11.0, 79.0), (11.0, 82.0)]:
        with pytest.raises(ValueError):
            g.column_at(lat, lon)


def test_rejects_values_whose_shape_disagrees_with_the_axes():
    with pytest.raises(ValueError):
        Grid(levels=LEVELS, latitudes=LATS, longitudes=LONS, values=np.zeros((3, 2, 2)))
