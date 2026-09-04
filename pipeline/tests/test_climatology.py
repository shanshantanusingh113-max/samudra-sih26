"""Departure from a real climatological normal, rather than from four months of its own.

The Temperature Anomaly this platform already had is a departure from the mean of the twelve
baked Timesteps - roughly April to July 2026 - so it is a **seasonal swing**, and its own guide
entry says so. "Warmer than usual" to a forecaster means warmer than the 1991-2020 normal for
that calendar month, and that is a different quantity with a different sign in places.

Two things here would produce a plausible and wrong field, so both are pinned:

**The depth interpolation.** The normal is published on 57 levels to 1500 m and the analysis is
on 24 to 2000 m. Below 1500 m there is no normal, and a value there would be an extrapolation
dressed as a measurement.

**The month.** The normal is monthly and the analysis is ten-daily, so each Timestep is
differenced against its own calendar month. Differencing July against April's normal is a wrong
answer that looks entirely reasonable.
"""

import numpy as np
import pytest

from samudra.climatology import (
    AxisMismatch,
    climatological_anomaly,
    month_of,
    to_model_levels,
)
from samudra.grid import Grid

from datetime import datetime, timezone

MODEL_LEVELS = np.array([5.0, 50.0, 200.0, 1000.0, 2000.0])
NORMAL_LEVELS = np.array([0.0, 100.0, 500.0, 1500.0])
LATITUDES = np.array([-1.5, -0.5, 0.5, 1.5])
LONGITUDES = np.array([70.5, 71.5, 72.5])


def grid(levels, fill) -> Grid:
    values = np.zeros((len(levels), len(LATITUDES), len(LONGITUDES)))
    for index in range(len(levels)):
        values[index] = fill(levels[index])
    return Grid(levels=levels, latitudes=LATITUDES, longitudes=LONGITUDES, values=values)


# --------------------------------------------------------------------------------------------
# The depth interpolation
# --------------------------------------------------------------------------------------------


def test_the_normal_is_interpolated_onto_the_model_own_levels():
    """Linear in depth. The normal at 0 m is 20 and at 100 m is 10, so at 50 m it is 15."""
    normal = grid(NORMAL_LEVELS, lambda d: 20.0 - d / 10.0)
    got = to_model_levels(normal, MODEL_LEVELS)
    assert got.shape == (len(MODEL_LEVELS), len(LATITUDES), len(LONGITUDES))
    assert got[0, 0, 0] == pytest.approx(19.5)   # 5 m
    assert got[1, 0, 0] == pytest.approx(15.0)   # 50 m
    # 200 m sits a quarter of the way from the 100 m normal (10.0) to the 500 m one (-30.0),
    # so it is 0.0. The interpolation is between *published levels*, not along the formula the
    # fixture happens to use - which is the whole point of interpolating rather than evaluating.
    assert got[2, 0, 0] == pytest.approx(0.0)


def test_below_the_deepest_normal_there_is_no_normal():
    """The atlas stops at 1500 m and the analysis runs to 2000 m. Extending the last value down
    would draw an anomaly at a depth nothing was ever averaged over."""
    normal = grid(NORMAL_LEVELS, lambda d: 20.0 - d / 10.0)
    got = to_model_levels(normal, MODEL_LEVELS)
    assert np.isnan(got[-1]).all()
    assert np.isfinite(got[-2]).all()


def test_above_the_shallowest_normal_the_top_value_is_used():
    """The atlas starts at 0 m and the model's top Level is 5 m, so the model is *inside* the
    atlas's range everywhere it matters. This pins the boundary rather than leaving it open."""
    normal = grid(np.array([10.0, 100.0]), lambda d: 20.0 - d / 10.0)
    got = to_model_levels(normal, np.array([5.0, 10.0]))
    assert got[0, 0, 0] == pytest.approx(19.0)
    assert got[1, 0, 0] == pytest.approx(19.0)


def test_a_masked_normal_stays_masked_rather_than_being_interpolated_across():
    normal = grid(NORMAL_LEVELS, lambda d: 20.0 - d / 10.0)
    values = normal.values.copy()
    values[1, 0, 0] = np.nan  # the 100 m level at one node
    normal = Grid(NORMAL_LEVELS, LATITUDES, LONGITUDES, values)
    got = to_model_levels(normal, MODEL_LEVELS)
    assert np.isnan(got[1, 0, 0])   # 50 m, bracketed by the masked level
    assert np.isfinite(got[1, 1, 1])  # a node that was not masked is unaffected


# --------------------------------------------------------------------------------------------
# The difference
# --------------------------------------------------------------------------------------------


def test_the_anomaly_is_the_analysis_minus_the_normal():
    analysis = grid(MODEL_LEVELS, lambda d: 25.0)
    normal = grid(NORMAL_LEVELS, lambda d: 20.0)
    got = climatological_anomaly(analysis, normal)
    assert got.levels.tolist() == MODEL_LEVELS.tolist()
    # 2000 m has no normal, so it is missing rather than +5.
    np.testing.assert_allclose(got.values[:-1], 5.0)
    assert np.isnan(got.values[-1]).all()


def test_the_sign_says_which_way_round_it_is():
    """A positive anomaly means the ocean is warmer than the normal. Getting this backwards
    produces a field that is exactly as smooth and exactly as wrong."""
    analysis = grid(MODEL_LEVELS, lambda d: 18.0)
    normal = grid(NORMAL_LEVELS, lambda d: 20.0)
    got = climatological_anomaly(analysis, normal)
    assert got.values[0, 0, 0] == pytest.approx(-2.0)


def test_where_the_analysis_has_no_ocean_neither_does_the_anomaly():
    analysis = grid(MODEL_LEVELS, lambda d: 25.0)
    values = analysis.values.copy()
    values[:, 0, 0] = np.nan
    analysis = Grid(MODEL_LEVELS, LATITUDES, LONGITUDES, values)
    got = climatological_anomaly(analysis, grid(NORMAL_LEVELS, lambda d: 20.0))
    assert np.isnan(got.values[:, 0, 0]).all()


def test_a_normal_on_different_horizontal_axes_is_refused_rather_than_regridded():
    """WOA 2023's one-degree product sits on the same node centres as the INCOIS analysis, which
    is the whole reason it fits. If that ever stops being true the answer is to say so, not to
    quietly regrid one onto the other and difference two different pieces of water."""
    normal = Grid(
        levels=NORMAL_LEVELS,
        latitudes=LATITUDES + 0.5,
        longitudes=LONGITUDES,
        values=np.zeros((len(NORMAL_LEVELS), len(LATITUDES), len(LONGITUDES))),
    )
    with pytest.raises(AxisMismatch) as raised:
        climatological_anomaly(grid(MODEL_LEVELS, lambda d: 25.0), normal)
    assert "latitude" in str(raised.value)


# --------------------------------------------------------------------------------------------
# Which month
# --------------------------------------------------------------------------------------------


def test_a_timestep_is_differenced_against_its_own_calendar_month():
    assert month_of(datetime(2026, 4, 10, tzinfo=timezone.utc)) == 4
    assert month_of(datetime(2026, 7, 30, tzinfo=timezone.utc)) == 7


def test_the_month_is_the_one_the_analysis_is_stamped_with_and_not_the_bake_date():
    """Every Timestep in this bake is April to July 2026 and the bake happened in September.
    Reading the clock instead of the Timestep would difference all twelve against September."""
    assert month_of(datetime(2026, 4, 20, 23, 59, tzinfo=timezone.utc)) == 4
