"""The anomaly Field is arithmetic, so the tests are mostly about what it must refuse to do:
invent a baseline it does not have, survive a single Timestep, or let land acquire a departure.
"""

from __future__ import annotations

import numpy as np
import pytest

from samudra.anomaly import anomaly_series, symmetric_encoding_range
from samudra.grid import Grid

# Big enough that a single absurd cell is a fraction of a percent of the block, which is what
# it is in the real bake. A 2x2x2 fixture made one outlier 12% of the values and the percentile
# clip could not have worked on it however it was written.
LEVELS = np.array([5.0, 100.0])
LATITUDES = np.arange(0.0, 6.0)
LONGITUDES = np.arange(60.0, 66.0)


def grid_of(fill) -> Grid:
    values = np.full((len(LEVELS), len(LATITUDES), len(LONGITUDES)), float(fill))
    return Grid(levels=LEVELS, latitudes=LATITUDES, longitudes=LONGITUDES, values=values)


def test_departures_cancel_across_the_series():
    """The baseline is the series' own mean, so by construction nothing is left over. If this
    drifts, the baseline is not what the guide panel says it is."""
    series = anomaly_series([grid_of(v) for v in (28.0, 29.0, 30.0, 25.0)])
    total = sum(g.values for g in series)
    assert np.allclose(total, 0.0)


def test_water_that_never_changes_has_no_anomaly():
    series = anomaly_series([grid_of(28.0) for _ in range(5)])
    assert all(np.allclose(g.values, 0.0) for g in series)


def test_a_warm_step_is_positive_and_a_cool_one_negative():
    series = anomaly_series([grid_of(v) for v in (20.0, 30.0)])
    assert np.all(series[0].values < 0)
    assert np.all(series[1].values > 0)
    assert series[1].values[0, 0, 0] == pytest.approx(5.0)


def test_the_baseline_is_per_cell_and_not_one_number_for_the_block():
    """A cold corner is not an anomaly, it is a cold corner. Only its departure from its own
    average over time is."""
    a, b = grid_of(28.0), grid_of(28.0)
    a.values[:, 0, 0] = 2.0  # a permanently cold cell
    b.values[:, 0, 0] = 2.0
    series = anomaly_series([a, b])
    assert np.allclose(series[0].values, 0.0)


def test_land_stays_land():
    grids = [grid_of(28.0), grid_of(30.0)]
    for g in grids:
        g.values[0, 0, 0] = np.nan
    series = anomaly_series(grids)
    assert all(np.isnan(g.values[0, 0, 0]) for g in series)
    assert all(np.isfinite(g.values[1, 1, 1]) for g in series)


def test_a_single_timestep_has_no_baseline_to_depart_from():
    """One step against its own mean is identically zero, which would draw an empty field and
    look like a rendering fault rather than a missing baseline."""
    with pytest.raises(ValueError):
        anomaly_series([grid_of(28.0)])
    with pytest.raises(ValueError):
        anomaly_series([])


def test_mismatched_axes_are_refused():
    other = Grid(
        levels=LEVELS,
        latitudes=LATITUDES + 0.5,
        longitudes=LONGITUDES,
        values=grid_of(28.0).values,
    )
    with pytest.raises(ValueError):
        anomaly_series([grid_of(28.0), other])


def test_the_axes_survive():
    series = anomaly_series([grid_of(28.0), grid_of(30.0)])
    assert np.array_equal(series[0].levels, LEVELS)
    assert np.array_equal(series[0].latitudes, LATITUDES)
    assert np.array_equal(series[0].longitudes, LONGITUDES)


def test_the_encoding_range_puts_zero_in_the_middle():
    """A diverging palette's midpoint is a claim: this colour means no departure. An asymmetric
    range moves zero off the middle of the bar and every colour then lies about its sign."""
    series = anomaly_series([grid_of(v) for v in (20.0, 22.0, 40.0)])
    low, high = symmetric_encoding_range(series)
    assert low == pytest.approx(-high)
    assert high > 0


def test_the_encoding_range_clips_rather_than_letting_one_cell_set_the_scale():
    grids = [grid_of(28.0) for _ in range(6)] + [grid_of(29.0)]
    grids[0].values[0, 0, 0] = 900.0  # one absurd cell
    series = anomaly_series(grids)
    _, high = symmetric_encoding_range(series, percentile=90.0)
    assert high < 10.0


def test_the_encoding_range_is_never_degenerate():
    """Water that never moves must still produce a usable range rather than vmin == vmax."""
    series = anomaly_series([grid_of(28.0), grid_of(28.0)])
    low, high = symmetric_encoding_range(series)
    assert high > low
