import numpy as np
import pytest

from samudra.collocation import collocate
from samudra.grid import Grid

LEVELS = np.array([0.0, 100.0, 200.0])
LATS = np.array([10.0, 11.0])
LONS = np.array([80.0, 81.0])


def uniform_grid(per_level) -> Grid:
    values = np.repeat(np.asarray(per_level, dtype=float), 4).reshape(3, 2, 2)
    return Grid(levels=LEVELS, latitudes=LATS, longitudes=LONS, values=values)


def test_model_is_sampled_at_the_observations_own_depths():
    g = uniform_grid([20.0, 10.0, 0.0])  # a clean linear 20 -> 0 degC gradient
    c = collocate(g, latitude=10.5, longitude=80.5, depths=[50.0, 150.0], observed=[0.0, 0.0])
    assert c.modelled == pytest.approx([15.0, 5.0])


def test_residual_is_observed_minus_modelled_and_keeps_its_sign():
    g = uniform_grid([20.0, 20.0, 20.0])
    c = collocate(g, latitude=10.5, longitude=80.5, depths=[50.0], observed=[21.5])
    assert c.residual == pytest.approx([1.5])
    c = collocate(g, latitude=10.5, longitude=80.5, depths=[50.0], observed=[18.5])
    assert c.residual == pytest.approx([-1.5])


def test_observations_deeper_than_the_model_are_kept_but_unmatched():
    """A float profiling to 2000 m under a model that stops at 200 m is normal. Do not drop it."""
    g = uniform_grid([20.0, 10.0, 0.0])
    c = collocate(g, latitude=10.5, longitude=80.5, depths=[50.0, 900.0], observed=[19.0, 4.0])
    assert c.observed == pytest.approx([19.0, 4.0])
    assert np.isnan(c.modelled[1])
    assert np.isnan(c.residual[1])
    assert not np.isnan(c.residual[0])


def test_summary_statistics_ignore_unmatched_depths():
    g = uniform_grid([20.0, 20.0, 20.0])
    c = collocate(
        g, latitude=10.5, longitude=80.5,
        depths=[50.0, 150.0, 900.0], observed=[21.0, 19.0, 99.0],
    )
    assert c.matched_count == 2
    assert c.mean_residual == pytest.approx(0.0)
    assert c.rms_residual == pytest.approx(1.0)


def test_a_profile_over_land_matches_nothing_and_does_not_raise():
    g = uniform_grid([np.nan, np.nan, np.nan])
    c = collocate(g, latitude=10.5, longitude=80.5, depths=[50.0], observed=[21.0])
    assert c.matched_count == 0
    assert np.isnan(c.mean_residual)
    assert np.isnan(c.rms_residual)


def test_observations_are_sorted_by_depth():
    """Argo reports ascending; some sources report descending. The chart needs one order."""
    g = uniform_grid([20.0, 10.0, 0.0])
    c = collocate(g, latitude=10.5, longitude=80.5, depths=[150.0, 50.0], observed=[5.0, 15.0])
    assert list(c.depths) == [50.0, 150.0]
    assert list(c.observed) == [15.0, 5.0]


def test_a_profile_outside_the_grid_is_refused():
    g = uniform_grid([20.0, 10.0, 0.0])
    with pytest.raises(ValueError):
        collocate(g, latitude=45.0, longitude=80.5, depths=[50.0], observed=[10.0])


def test_mismatched_depth_and_value_lengths_are_refused():
    g = uniform_grid([20.0, 10.0, 0.0])
    with pytest.raises(ValueError):
        collocate(g, latitude=10.5, longitude=80.5, depths=[50.0, 60.0], observed=[10.0])
