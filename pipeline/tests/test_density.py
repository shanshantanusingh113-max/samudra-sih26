"""Density is the first Field that is computed rather than fetched, so the tests have to do
two jobs: pin the TEOS-10 chain against an independent evaluation of it, and check the physics
comes out the right way up. A wiring mistake here - depth read as pressure, salinity and
temperature swapped, latitude dropped - produces numbers that still look like densities.
"""

from __future__ import annotations

import gsw
import numpy as np
import pytest

from samudra.density import potential_density, profile_density
from samudra.grid import Grid

LEVELS = np.array([5.0, 100.0, 1000.0, 2000.0])
LATITUDES = np.array([-5.0, 5.0, 15.0])
LONGITUDES = np.array([60.0, 70.0, 80.0])

# A plausible tropical Indian Ocean column: a warm fresh-ish lid over cold salty deep water.
COLUMN_T = np.array([29.0, 22.0, 5.0, 2.5])
COLUMN_S = np.array([35.0, 35.4, 34.8, 34.7])


def grid_of(column: np.ndarray) -> Grid:
    values = np.broadcast_to(
        column[:, None, None], (len(LEVELS), len(LATITUDES), len(LONGITUDES))
    ).copy()
    return Grid(levels=LEVELS, latitudes=LATITUDES, longitudes=LONGITUDES, values=values)


def test_matches_an_independent_teos10_evaluation():
    """The whole chain, cell by cell: depth to pressure, practical to absolute salinity,
    in-situ to conservative temperature, then sigma-theta."""
    result = potential_density(grid_of(COLUMN_T), grid_of(COLUMN_S))

    for level, (depth, t, sp) in enumerate(zip(LEVELS, COLUMN_T, COLUMN_S)):
        for row, latitude in enumerate(LATITUDES):
            for column, longitude in enumerate(LONGITUDES):
                pressure = gsw.p_from_z(-depth, latitude)
                absolute = gsw.SA_from_SP(sp, pressure, longitude, latitude)
                conservative = gsw.CT_from_t(absolute, t, pressure)
                assert result.values[level, row, column] == pytest.approx(
                    float(gsw.sigma0(absolute, conservative)), abs=1e-9
                )


def test_a_tropical_column_gets_denser_with_depth():
    column = potential_density(grid_of(COLUMN_T), grid_of(COLUMN_S)).values[:, 1, 1]
    assert np.all(np.diff(column) > 0)


def test_values_land_where_indian_ocean_water_actually_sits():
    """Sigma-theta, not density: about 20 at the warm surface to about 28 in the deep. A result
    near 1025 would mean absolute density leaked out instead of the anomaly."""
    values = potential_density(grid_of(COLUMN_T), grid_of(COLUMN_S)).values
    assert 20.0 < values.min() < 24.0
    assert 26.0 < values.max() < 29.0


def test_fresher_water_is_lighter_at_the_same_temperature():
    salty = potential_density(grid_of(COLUMN_T), grid_of(COLUMN_S)).values
    fresh = potential_density(grid_of(COLUMN_T), grid_of(COLUMN_S - 2.0)).values
    assert np.all(fresh < salty)


def test_warmer_water_is_lighter_at_the_same_salinity():
    cool = potential_density(grid_of(COLUMN_T), grid_of(COLUMN_S)).values
    warm = potential_density(grid_of(COLUMN_T + 3.0), grid_of(COLUMN_S)).values
    assert np.all(warm < cool)


def test_the_depth_axis_is_really_used():
    """Sigma-theta is referenced to the surface, but reaching it runs through in-situ pressure
    twice, in SA_from_SP and again in CT_from_t. Passing zero would put the 2000 m water
    0.023 kg/m^3 light, which is small, invisible, and wrong."""
    latitude, longitude = LATITUDES[1], LONGITUDES[1]
    at_depth = potential_density(grid_of(COLUMN_T), grid_of(COLUMN_S)).values[-1, 1, 1]

    absolute = gsw.SA_from_SP(COLUMN_S[-1], 0.0, longitude, latitude)
    conservative = gsw.CT_from_t(absolute, COLUMN_T[-1], 0.0)
    as_if_surface = float(gsw.sigma0(absolute, conservative))

    assert abs(at_depth - as_if_surface) > 0.02


def test_land_stays_land():
    """A masked cell in either input must not become a plausible-looking density."""
    temperature = grid_of(COLUMN_T)
    salinity = grid_of(COLUMN_S)
    temperature.values[0, 0, 0] = np.nan
    salinity.values[1, 2, 2] = np.nan
    result = potential_density(temperature, salinity)
    assert np.isnan(result.values[0, 0, 0])
    assert np.isnan(result.values[1, 2, 2])
    assert np.isfinite(result.values[2, 1, 1])


def test_the_result_keeps_the_axes_it_was_given():
    result = potential_density(grid_of(COLUMN_T), grid_of(COLUMN_S))
    assert np.array_equal(result.levels, LEVELS)
    assert np.array_equal(result.latitudes, LATITUDES)
    assert np.array_equal(result.longitudes, LONGITUDES)


def test_mismatched_axes_are_refused_rather_than_broadcast():
    other = Grid(
        levels=LEVELS,
        latitudes=LATITUDES,
        longitudes=np.array([60.0, 70.0, 90.0]),
        values=grid_of(COLUMN_S).values,
    )
    with pytest.raises(ValueError):
        potential_density(grid_of(COLUMN_T), other)


def test_a_cast_and_the_model_are_put_through_the_same_chain():
    """A Collocation is only a comparison if both sides were computed the same way. This is the
    observed side, and it must agree cell for cell with the gridded one at the same position."""
    depths = np.array([5.0, 100.0, 1000.0, 2000.0])
    observed = profile_density(
        latitude=LATITUDES[1],
        longitude=LONGITUDES[1],
        depths=depths,
        temperature=COLUMN_T,
        salinity=COLUMN_S,
    )
    modelled = potential_density(grid_of(COLUMN_T), grid_of(COLUMN_S)).values[:, 1, 1]
    assert observed == pytest.approx(modelled, abs=1e-9)


def test_a_cast_with_gaps_keeps_them():
    """A level the float did not report, or that failed QC, must stay missing rather than
    becoming a density the instrument never justified."""
    temperature = COLUMN_T.copy()
    temperature[1] = np.nan
    salinity = COLUMN_S.copy()
    salinity[2] = np.nan
    result = profile_density(
        latitude=0.0,
        longitude=70.0,
        depths=np.array([5.0, 100.0, 1000.0, 2000.0]),
        temperature=temperature,
        salinity=salinity,
    )
    assert np.isnan(result[1]) and np.isnan(result[2])
    assert np.isfinite(result[0]) and np.isfinite(result[3])
