"""The five disaster-management Fields, checked against physics rather than against themselves.

These are the quantities a cyclone forecaster names, and INCOIS stopped publishing them on
2019-03-30 - see `docs/plan/04-ps-update-2026-09.md`. Every one is derived from the temperature
and salinity already in the Grid, so a wrong constant or a wrong reference level would produce a
number that is finite, smooth and completely believable. That is exactly the failure ADR 0010
was written about, so each function here is held to a hand-computable case.
"""

from __future__ import annotations

import numpy as np
import pytest

from samudra.grid import Grid
from samudra.hazard import (
    CP_SEAWATER,
    RHO_SEAWATER,
    barrier_layer_thickness,
    heat_potential,
    isothermal_layer_depth,
    mixed_layer_depth,
)


LEVELS = np.array([5.0, 10.0, 20.0, 30.0, 50.0, 75.0, 100.0])


def column_grid(column, levels=LEVELS):
    """One water column, as a Grid with a single node. Enough for every threshold rule."""
    values = np.asarray(column, dtype=float).reshape(len(levels), 1, 1)
    return Grid(
        levels=np.asarray(levels, dtype=float),
        latitudes=np.array([10.0]),
        longitudes=np.array([70.0]),
        values=values,
    )


# ----------------------------------------------------------------- heat potential


def test_heat_potential_integrates_from_the_sea_surface_not_from_the_top_level():
    """The shallowest Level is 5 m and the integral is defined from the surface.

    A column that is 28 degC everywhere down to exactly 50 m, then cold. The 26 degC crossing
    lands at 50 m, so the excess is 2 degC over 50 m of water: 100 degC m.

    Starting the integral at 5 m instead would give 90 degC m and a 10% low bias on every cell
    in the block - a plausible-looking wrong answer, which is the only kind worth a test.
    """
    grid = column_grid([28, 28, 28, 28, 28, 20, 15])
    # The crossing between 50 m (28) and 75 m (20) is at 50 + 25 * (28-26)/8 = 56.25 m.
    # Excess: 2 degC over the first 50 m, then falling linearly to 0 at 56.25 m.
    expected_integral = 2.0 * 50.0 + 0.5 * 2.0 * 6.25
    expected = RHO_SEAWATER * CP_SEAWATER * expected_integral * 1e-7

    assert heat_potential(grid)[0, 0] == pytest.approx(expected, rel=1e-6)


def test_water_that_never_reaches_26_carries_no_cyclone_fuel():
    """Not NaN. A cold column has a heat potential and it is zero, which is a fact about the
    ocean; NaN would say we could not tell, and we can."""
    grid = column_grid([24, 23, 22, 21, 20, 18, 15])
    assert heat_potential(grid)[0, 0] == 0.0


def test_land_stays_land():
    grid = column_grid([np.nan] * len(LEVELS))
    assert np.isnan(heat_potential(grid)[0, 0])
    assert np.isnan(mixed_layer_depth(grid)[0, 0])
    assert np.isnan(isothermal_layer_depth(grid)[0, 0])


def test_a_cool_skin_over_warmer_water_never_reports_negative_fuel():
    """The Somali upwelling case, and it is not hypothetical.

    Monsoon wind drags cold water over water that is still warm underneath, so the column
    inverts: 25.5 at 5 m, 26.5 at 10 m. Reading the 26 degC crossing from the surface down finds
    it at 22 m, and the integral from 0 to 22 m then adds a cold top to a warm middle. Measured
    against the real bake on 2026-07-30 at 9.5 N, 51.5 E it gave **-0.2 kJ/cm2**, which is not a
    small number - it is a meaningless one. Heat stored above 26 degC cannot be negative.
    """
    grid = column_grid([25.5, 26.5, 26.2, 25.0, 22.0, 18.0, 15.0])
    fuel = heat_potential(grid)[0, 0]
    assert fuel >= 0.0
    # And it is the warm middle only: 0.5 degC at 10 m falling to 0 at the crossing near 22 m,
    # plus the 0.2 at 20 m, over the levels that carry it.
    assert 0.0 < fuel < 5.0


def test_the_oman_upwelling_case_reads_as_almost_no_fuel():
    """The check that matters, from `04-ps-update-2026-09.md`: off Oman in peak monsoon the
    26 degC isotherm is nearly at the surface and there is no cyclone fuel at all."""
    grid = column_grid([26.4, 25.8, 24.0, 22.5, 20.0, 17.0, 15.0])
    assert heat_potential(grid)[0, 0] < 3.0


# ----------------------------------------------------------------- mixed layer depth


def test_mixed_layer_depth_is_interpolated_between_the_levels_that_bracket_it():
    """de Boyer Montegut: the first depth where sigma-theta is 0.03 kg/m3 above its 10 m value.

    Reference 22.00 at 10 m, so the threshold is 22.03. The column crosses it between 10 m
    (22.00) and 20 m (22.13), one part in 13 of the way: 10 + 10 * 0.03/0.13 = 12.3 m.
    """
    sigma = column_grid([22.00, 22.00, 22.13, 22.60, 23.40, 24.80, 25.50])
    assert mixed_layer_depth(sigma)[0, 0] == pytest.approx(10 + 10 * 0.03 / 0.13, abs=1e-6)


def test_the_reference_is_10_metres_and_not_the_shallowest_level():
    """A near-surface inversion above 10 m must not move the answer.

    Both columns are identical from 10 m down and differ only at 5 m. Referencing the shallowest
    Level instead of 10 m is the obvious shortcut and it makes these two disagree.
    """
    a = mixed_layer_depth(column_grid([22.00, 22.00, 22.13, 22.60, 23.40, 24.80, 25.50]))
    b = mixed_layer_depth(column_grid([21.40, 22.00, 22.13, 22.60, 23.40, 24.80, 25.50]))
    assert a[0, 0] == pytest.approx(b[0, 0])


def test_a_column_that_never_crosses_the_threshold_is_missing_rather_than_deep():
    """Reporting the deepest Level would draw a 2000 m mixed layer where the data says only
    that the criterion is not met in the column we hold."""
    sigma = column_grid([22.0, 22.0, 22.005, 22.01, 22.015, 22.02, 22.025])
    assert np.isnan(mixed_layer_depth(sigma)[0, 0])


def test_a_column_with_no_10_metre_level_is_missing_rather_than_guessed():
    grid = column_grid([22.0, 22.5, 23.0], levels=np.array([5.0, 20.0, 30.0]))
    assert np.isnan(mixed_layer_depth(grid)[0, 0])


# ----------------------------------------------------------------- isothermal layer


def test_isothermal_layer_depth_uses_the_temperature_threshold_from_the_same_reference():
    """0.2 degC below the 10 m value. 28.0 at 10 m, so the threshold is 27.8, crossed between
    20 m (27.9) and 30 m (27.5): 20 + 10 * 0.1/0.4 = 22.5 m."""
    grid = column_grid([28.1, 28.0, 27.9, 27.5, 25.0, 20.0, 18.0])
    assert isothermal_layer_depth(grid)[0, 0] == pytest.approx(22.5, abs=1e-6)


def test_a_warming_column_does_not_cross_downwards_and_is_missing():
    grid = column_grid([28.0, 28.0, 28.05, 28.1, 28.15, 28.18, 28.19])
    assert np.isnan(isothermal_layer_depth(grid)[0, 0])


# ----------------------------------------------------------------- barrier layer


def test_the_barrier_layer_is_the_gap_between_the_two_layer_depths():
    """The Bay of Bengal signature: fresh water holds the density layer shallow while the warm
    layer runs deeper, and the water between them is the barrier a cyclone spins up over."""
    ild = np.array([[64.3]])
    mld = np.array([[25.5]])
    assert barrier_layer_thickness(ild, mld)[0, 0] == pytest.approx(38.8)


def test_a_barrier_layer_can_be_negative_and_the_sign_is_kept():
    """Negative means a compensated layer - salinity stratifying water the temperature says is
    mixed. Clamping it to zero would erase a real structure, exactly as clamping a Residual
    would."""
    assert barrier_layer_thickness(np.array([[20.0]]), np.array([[35.0]]))[0, 0] == pytest.approx(-15.0)


def test_a_barrier_layer_needs_both_halves():
    out = barrier_layer_thickness(np.array([[np.nan]]), np.array([[35.0]]))
    assert np.isnan(out[0, 0])


# ----------------------------------------------------------------- shape


def test_every_field_comes_back_on_the_grid_horizontal_axes():
    levels = np.array([5.0, 10.0, 20.0, 30.0])
    values = np.tile(np.array([29.0, 28.0, 24.0, 20.0])[:, None, None], (1, 3, 4))
    grid = Grid(
        levels=levels,
        latitudes=np.linspace(0, 3, 3),
        longitudes=np.linspace(70, 73, 4),
        values=values,
    )
    for out in (heat_potential(grid), mixed_layer_depth(grid), isothermal_layer_depth(grid)):
        assert out.shape == (3, 4)
