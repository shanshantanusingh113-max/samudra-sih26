"""The depth of an isotherm is a threshold operation on a column, and threshold operations are
where the quiet mistakes live: an off-by-one bracket, an inversion picked up from the wrong end,
a column that never crosses coming back as zero instead of missing.
"""

from __future__ import annotations

import numpy as np
import pytest

from samudra.grid import Grid
from samudra.thermocline import isotherm_depth, swept_through

LEVELS = np.array([5.0, 20.0, 50.0, 100.0, 200.0, 500.0])
LATS = np.array([0.0, 1.0])
LONS = np.array([60.0, 61.0])


def grid_of(*columns) -> Grid:
    """One Grid whose four columns are the ones given, in row-major order."""
    values = np.stack(columns, axis=-1).reshape(len(LEVELS), len(LATS), len(LONS))
    return Grid(levels=LEVELS, latitudes=LATS, longitudes=LONS, values=values)


WARM_TO_COLD = np.array([29.0, 28.0, 24.0, 18.0, 12.0, 5.0])


def test_the_isotherm_sits_between_the_two_levels_that_bracket_it():
    """20 degC falls between 24 at 50 m and 18 at 100 m, four sixths of the way down."""
    grid = grid_of(*[WARM_TO_COLD] * 4)
    depth = isotherm_depth(grid, 20.0)
    assert depth.shape == (len(LATS), len(LONS))
    assert depth[0, 0] == pytest.approx(50.0 + 50.0 * (24.0 - 20.0) / (24.0 - 18.0))


def test_a_column_that_never_gets_that_cold_has_no_isotherm():
    """Missing, not the sea floor. Reporting the deepest Level would invent a thermocline
    exactly where the data says there is not one."""
    grid = grid_of(*[np.full(len(LEVELS), 25.0)] * 4)
    assert np.isnan(isotherm_depth(grid, 20.0)).all()


def test_a_column_that_is_already_that_cold_at_the_surface_has_no_isotherm():
    grid = grid_of(*[np.full(len(LEVELS), 5.0)] * 4)
    assert np.isnan(isotherm_depth(grid, 20.0)).all()


def test_land_stays_missing():
    grid = grid_of(np.full(len(LEVELS), np.nan), WARM_TO_COLD, WARM_TO_COLD, WARM_TO_COLD)
    depth = isotherm_depth(grid, 20.0)
    assert np.isnan(depth[0, 0])
    assert np.isfinite(depth[0, 1])


def test_a_column_that_runs_out_partway_down_is_used_as_far_as_it_goes():
    """A shelf column has real water above the sea floor and NaN below. If the isotherm is in
    the real part, it counts."""
    column = WARM_TO_COLD.copy()
    column[4:] = np.nan
    grid = grid_of(column, WARM_TO_COLD, WARM_TO_COLD, WARM_TO_COLD)
    assert isotherm_depth(grid, 20.0)[0, 0] == pytest.approx(
        isotherm_depth(grid, 20.0)[0, 1]
    )


def test_an_inversion_is_read_from_the_surface_down():
    """Some columns cross the value more than once. The operational figure is the first
    crossing going down - the bottom of the warm surface layer - not the last."""
    column = np.array([29.0, 18.0, 22.0, 21.0, 12.0, 5.0])
    grid = grid_of(column, WARM_TO_COLD, WARM_TO_COLD, WARM_TO_COLD)
    assert 5.0 < isotherm_depth(grid, 20.0)[0, 0] < 20.0


def test_the_result_is_deeper_for_a_cooler_isotherm_in_the_same_water():
    grid = grid_of(*[WARM_TO_COLD] * 4)
    assert isotherm_depth(grid, 26.0)[0, 0] < isotherm_depth(grid, 20.0)[0, 0]
    assert isotherm_depth(grid, 20.0)[0, 0] < isotherm_depth(grid, 15.0)[0, 0]


def test_the_isotherm_explains_water_it_moved_through():
    """The test that decides whether the panel leads with a cause.

    Asking whether the isotherm sits *inside* the body of water today is too strict, and it fails
    on exactly the case it should catch. The strongest feature in the current bake is a cool body
    at 30-100 m off Oman where the 20 degC line has risen from 116 m to 29 m: the isotherm is one
    metre above the body, so a containment test says "not related", while what actually happened
    is that the line swept up through all of that water and took the warmth with it.
    """
    assert swept_through(here=29.2, usually=115.7, top=30.0, bottom=100.0)
    assert swept_through(here=103.6, usually=72.0, top=75.0, bottom=125.0)


def test_an_isotherm_that_stayed_put_elsewhere_explains_nothing():
    assert not swept_through(here=110.0, usually=112.0, top=400.0, bottom=500.0)
    assert not swept_through(here=110.0, usually=112.0, top=5.0, bottom=20.0)


def test_an_isotherm_sitting_still_inside_the_body_still_counts():
    """A degenerate sweep is still contact: the line is in that water."""
    assert swept_through(here=80.0, usually=80.0, top=50.0, bottom=100.0)


def test_a_missing_isotherm_explains_nothing():
    assert not swept_through(here=float("nan"), usually=100.0, top=50.0, bottom=150.0)
    assert not swept_through(here=100.0, usually=float("nan"), top=50.0, bottom=150.0)


def test_the_answer_is_a_plain_bool_and_not_numpys():
    """It is written straight into JSON, and json.dumps refuses np.bool_."""
    depths = np.array([29.2, 115.7])
    assert type(swept_through(depths[0], depths[1], 30.0, 100.0)) is bool
