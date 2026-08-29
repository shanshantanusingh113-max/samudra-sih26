import numpy as np
import pytest

from samudra.collocation import MIN_USEFUL_MATCHES, choose_cast, collocate
from samudra.grid import Grid

LEVELS = np.array([0.0, 100.0, 200.0])
LATS = np.array([10.0, 11.0])
LONS = np.array([80.0, 81.0])


def uniform_grid(per_level) -> Grid:
    values = np.repeat(np.asarray(per_level, dtype=float), 4).reshape(3, 2, 2)
    return Grid(levels=LEVELS, latitudes=LATS, longitudes=LONS, values=values)


def column_grid(levels, per_level) -> Grid:
    """A Grid on arbitrary Levels, for the cases that turn on where the top one sits."""
    levels = np.asarray(levels, dtype=float)
    values = np.repeat(np.asarray(per_level, dtype=float), 4).reshape(len(levels), 2, 2)
    return Grid(levels=levels, latitudes=LATS, longitudes=LONS, values=values)


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


def test_it_counts_the_measurements_that_sit_above_the_model_s_shallowest_level():
    """Refusing to extrapolate is right. Being quiet about it is not.

    INCOIS's shallowest Level is 5 m and 88% of Argo casts report something above it - 8,845
    levels across the current bake. Those points are correctly left unmatched, and the surface is
    exactly what a fisheries or cyclone reader looks at first, so the panel has to be able to say
    how many were skipped rather than letting the reader assume the cast started at 5 m.
    """
    grid = column_grid([5.0, 10.0, 20.0], [29.0, 28.0, 24.0])
    result = collocate(
        grid,
        latitude=10.5,
        longitude=80.5,
        depths=np.array([0.5, 2.0, 4.9, 5.0, 10.0, 20.0]),
        observed=np.array([30.0, 29.9, 29.7, 29.0, 28.0, 24.0]),
    )
    assert result.above_model_count == 3
    assert result.matched_count == 3


def test_nothing_above_the_top_level_means_nothing_to_report():
    grid = column_grid([5.0, 10.0, 20.0], [29.0, 28.0, 24.0])
    result = collocate(
        grid,
        latitude=10.5,
        longitude=80.5,
        depths=np.array([5.0, 10.0, 20.0]),
        observed=np.array([29.0, 28.0, 24.0]),
    )
    assert result.above_model_count == 0


def test_a_measurement_below_the_deepest_level_is_not_counted_as_above_the_top():
    """The two refusals are different sentences and must not be conflated."""
    grid = column_grid([5.0, 10.0, 20.0], [29.0, 28.0, 24.0])
    result = collocate(
        grid,
        latitude=10.5,
        longitude=80.5,
        depths=np.array([1.0, 10.0, 500.0]),
        observed=np.array([30.0, 28.0, 4.0]),
    )
    assert result.above_model_count == 1
    assert result.matched_count == 1


# ---------------------------------------------------------------- choosing which cast to bake
#
# The static bundle carries one Collocation per Float, so something has to choose which cast.
# It used to be "the newest", full stop, and on the shipped bake that gave 6 of 212 Floats a
# chart with nothing on it and 24 a cast more than 500 m shallower than their own deepest.


def test_the_newest_cast_wins_when_it_actually_compares():
    casts = ["april", "may", "june"]
    matched = {"april": 400, "may": 380, "june": 120}
    assert choose_cast(casts, matched.__getitem__) == 2


def test_a_newest_cast_that_compares_against_nothing_falls_back_to_the_one_before():
    """Float 6990611: 13 casts, and the newest reported only from 1300 m down."""
    casts = ["april", "may", "fragment"]
    matched = {"april": 400, "may": 380, "fragment": 0}
    assert choose_cast(casts, matched.__getitem__) == 1


def test_it_keeps_walking_back_past_more_than_one_bad_cast():
    casts = ["good", "bad", "worse", "worst"]
    matched = {"good": 300, "bad": 4, "worse": 0, "worst": 2}
    assert choose_cast(casts, matched.__getitem__) == 0


def test_a_cast_just_over_the_threshold_is_preferred_to_an_older_richer_one():
    """Recency is the rule; usefulness is only a floor. ADR 0009's argument, inside one Float."""
    casts = ["old", "new"]
    matched = {"old": 900, "new": MIN_USEFUL_MATCHES}
    assert choose_cast(casts, matched.__getitem__) == 1


def test_when_no_cast_compares_it_returns_the_newest_rather_than_pretending():
    """Usually the Float is beside a Masked node, and the panel says so. An older cast from the
    same position would fail in exactly the same way, so showing one would only hide the reason."""
    casts = ["a", "b", "c"]
    assert choose_cast(casts, lambda _: 0) == 2


def test_a_float_with_one_cast_uses_it_whatever_it_looks_like():
    assert choose_cast(["only"], lambda _: 0) == 0
    assert choose_cast(["only"], lambda _: 500) == 0
