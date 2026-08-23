import numpy as np
import pytest

from samudra.depth_warp import DepthWarp

# The real INCOIS ZAX axis: 24 uneven levels, clustered near the surface.
INCOIS_LEVELS = np.array(
    [5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500,
     600, 700, 800, 900, 1000, 1200, 1400, 1600, 1800, 2000],
    dtype=float,
)


def test_endpoints_map_to_unit_interval():
    w = DepthWarp(top=5.0, bottom=2000.0)
    assert w.to_axis(5.0) == pytest.approx(0.0)
    assert w.to_axis(2000.0) == pytest.approx(1.0)


def test_round_trips():
    w = DepthWarp(top=5.0, bottom=2000.0)
    depths = np.linspace(5.0, 2000.0, 97)
    assert w.to_depth(w.to_axis(depths)) == pytest.approx(depths, rel=1e-9)


def test_is_strictly_monotonic():
    w = DepthWarp(top=5.0, bottom=2000.0)
    s = w.to_axis(INCOIS_LEVELS)
    assert np.all(np.diff(s) > 0)


def test_gives_the_upper_ocean_more_of_the_axis_than_linear_would():
    """The point of the warp: the thermocline must not be squeezed into a few voxels."""
    w = DepthWarp(top=5.0, bottom=2000.0)
    # The top 300 m is where the thermocline lives. Linearly it would get ~15% of the axis.
    share = w.to_axis(300.0)
    assert share > 0.45, f"top 300 m only got {share:.0%} of the axis"
    assert share < 0.85, "warp is so aggressive the deep ocean is unresolvable"


def test_resample_preserves_values_at_original_levels():
    w = DepthWarp(top=5.0, bottom=2000.0)
    # A field that is exactly linear in warped space is reproduced exactly.
    values = w.to_axis(INCOIS_LEVELS)
    out = w.resample(INCOIS_LEVELS, values, samples=64)
    expected = np.linspace(0.0, 1.0, 64)
    assert out == pytest.approx(expected, abs=1e-9)


def test_resample_keeps_gaps_missing():
    """A NaN at a source level must not be silently interpolated into real-looking data."""
    w = DepthWarp(top=5.0, bottom=2000.0)
    values = np.arange(len(INCOIS_LEVELS), dtype=float)
    values[10:14] = np.nan  # a slab of missing water
    out = w.resample(INCOIS_LEVELS, values, samples=64)
    axis_depths = w.to_depth(np.linspace(0.0, 1.0, 64))
    inside_gap = (axis_depths > INCOIS_LEVELS[10]) & (axis_depths < INCOIS_LEVELS[13])
    assert inside_gap.any(), "test is vacuous - no samples landed in the gap"
    assert np.all(np.isnan(out[inside_gap]))


def test_resample_does_not_extrapolate_past_the_deepest_real_value():
    """A water column that ends at 500 m (sea floor) must stay missing below it."""
    w = DepthWarp(top=5.0, bottom=2000.0)
    values = np.arange(len(INCOIS_LEVELS), dtype=float)
    values[INCOIS_LEVELS > 500] = np.nan
    out = w.resample(INCOIS_LEVELS, values, samples=64)
    axis_depths = w.to_depth(np.linspace(0.0, 1.0, 64))
    assert np.all(np.isnan(out[axis_depths > 500.0]))


def test_resample_handles_an_entirely_missing_column():
    """Land. Every sample must be missing, and it must not raise."""
    w = DepthWarp(top=5.0, bottom=2000.0)
    values = np.full(len(INCOIS_LEVELS), np.nan)
    out = w.resample(INCOIS_LEVELS, values, samples=32)
    assert out.shape == (32,)
    assert np.all(np.isnan(out))
