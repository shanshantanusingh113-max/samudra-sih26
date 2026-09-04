"""Drift: where the analysis says a thing in the water would go, and where a float actually went.

Every case here is hand-computable, because the whole feature is one number multiplied by
another and a wrong constant produces a track that is smooth, plausible and hundreds of
kilometres wrong. The two that matter most are the metres-per-degree conversion and the cosine
of latitude on the longitude axis: get the second one wrong and every trajectory in the tropics
is right and every one at 20 N is 6% short, which nothing on screen would ever admit.
"""

from datetime import datetime, timedelta, timezone

import numpy as np
import pytest

from samudra.drift import (
    CurrentSeries,
    METRES_PER_DEGREE,
    integrate_drift,
    separation_km,
    track_against_drift,
)
from samudra.grid import Grid

LEVELS = np.array([5.0, 100.0, 1000.0])
LATITUDES = np.arange(-5.0, 25.0, 1.0)
LONGITUDES = np.arange(45.0, 75.0, 1.0)

START = datetime(2026, 4, 10, tzinfo=timezone.utc)
STEP = timedelta(days=10)


def uniform(value: float) -> Grid:
    return Grid(
        levels=LEVELS,
        latitudes=LATITUDES,
        longitudes=LONGITUDES,
        values=np.full((len(LEVELS), len(LATITUDES), len(LONGITUDES)), value, dtype=float),
    )


def series(u_values, v_values, steps=2) -> CurrentSeries:
    """A series whose every node carries the same velocity, one entry per Timestep."""
    if not isinstance(u_values, (list, tuple)):
        u_values = [u_values] * steps
        v_values = [v_values] * steps
    return CurrentSeries(
        times=[START + i * STEP for i in range(len(u_values))],
        u=[uniform(u) for u in u_values],
        v=[uniform(v) for v in v_values],
    )


# --------------------------------------------------------------------------------------------
# Reading a velocity out of the field
# --------------------------------------------------------------------------------------------


def test_a_uniform_field_reads_the_same_everywhere():
    got = series(0.25, -0.1).velocity_at(START, 5.0, 10.0, 60.0)
    assert got == pytest.approx((0.25, -0.1))


def test_the_velocity_is_interpolated_between_two_analyses_in_time():
    """The analyses are ten days apart. Holding the first one for ten days and then jumping is a
    step function, and a drift track integrated through a step function has a corner in it that
    is an artefact of the sampling rather than of the ocean."""
    s = series([0.0, 1.0], [0.0, 0.0])
    half = START + timedelta(days=5)
    assert s.velocity_at(half, 5.0, 10.0, 60.0)[0] == pytest.approx(0.5)


def test_before_the_first_analysis_and_after_the_last_the_ends_are_held():
    s = series([0.2, 0.8], [0.0, 0.0])
    assert s.velocity_at(START - timedelta(days=30), 5.0, 10.0, 60.0)[0] == pytest.approx(0.2)
    assert s.velocity_at(START + timedelta(days=99), 5.0, 10.0, 60.0)[0] == pytest.approx(0.8)


def test_the_depth_used_is_the_nearest_level_the_provider_published():
    """The same rule the adapter used landing Copernicus on this grid: nearest node, never a
    blend. A blend across 5 m and 1000 m would report a current that exists at neither."""
    fast = uniform(0.0)
    values = fast.values.copy()
    values[0] = 1.0  # 5 m
    values[1] = 2.0  # 100 m
    values[2] = 3.0  # 1000 m
    s = CurrentSeries(
        times=[START],
        u=[Grid(LEVELS, LATITUDES, LONGITUDES, values)],
        v=[uniform(0.0)],
    )
    assert s.velocity_at(START, 4.0, 10.0, 60.0)[0] == pytest.approx(1.0)
    assert s.velocity_at(START, 90.0, 10.0, 60.0)[0] == pytest.approx(2.0)
    assert s.velocity_at(START, 5000.0, 10.0, 60.0)[0] == pytest.approx(3.0)


def test_a_position_off_the_grid_has_no_velocity_rather_than_a_clamped_one():
    assert series(1.0, 0.0).velocity_at(START, 5.0, 10.0, 120.0) is None
    assert series(1.0, 0.0).velocity_at(START, 5.0, 40.0, 60.0) is None


def test_land_stops_the_lookup_rather_than_being_blended_around():
    """`Grid.column_at` refuses to blend across a Masked node for the same reason: the nodes
    that do have data near a coast are the open ocean, and averaging them in manufactures a
    current for a point that is on land."""
    values = np.zeros((len(LEVELS), len(LATITUDES), len(LONGITUDES)))
    row = int(np.where(LATITUDES == 10.0)[0][0])
    col = int(np.where(LONGITUDES == 60.0)[0][0])
    values[:, row, col] = np.nan
    s = CurrentSeries(
        times=[START],
        u=[Grid(LEVELS, LATITUDES, LONGITUDES, values)],
        v=[uniform(0.0)],
    )
    assert s.velocity_at(START, 5.0, 10.4, 60.4) is None
    assert s.velocity_at(START, 5.0, 14.5, 64.5) is not None


# --------------------------------------------------------------------------------------------
# The integration
# --------------------------------------------------------------------------------------------


def test_a_steady_eastward_current_moves_east_by_speed_times_time():
    """One metre a second for one day is 86.4 km. At the equator that is 86400 / 111320 degrees
    of longitude, which is 0.7761. Hand-computable, and it is the whole feature."""
    path = integrate_drift(
        series(1.0, 0.0), longitude=60.0, latitude=0.0, start_time=START, depth_metres=5.0,
        hours=24.0, step_hours=1.0,
    )
    assert path.steps[-1].latitude == pytest.approx(0.0, abs=1e-9)
    assert path.steps[-1].longitude == pytest.approx(60.0 + 86400.0 / METRES_PER_DEGREE, rel=1e-6)
    assert path.ended == "finished"


def test_a_degree_of_longitude_is_shorter_away_from_the_equator():
    """At 20 N a degree of longitude is cos(20) = 0.9397 of a degree at the equator, so the same
    current carries a float 6.4% further in degrees. Without the cosine every trajectory in the
    Arabian Sea is short, smoothly and invisibly."""
    path = integrate_drift(
        series(1.0, 0.0), longitude=60.0, latitude=20.0, start_time=START, depth_metres=5.0,
        hours=24.0, step_hours=1.0,
    )
    expected = 60.0 + 86400.0 / (METRES_PER_DEGREE * np.cos(np.radians(20.0)))
    assert path.steps[-1].longitude == pytest.approx(expected, rel=1e-4)


def test_a_steady_northward_current_moves_north_by_speed_times_time():
    path = integrate_drift(
        series(0.0, 0.5), longitude=60.0, latitude=0.0, start_time=START, depth_metres=5.0,
        hours=48.0, step_hours=1.0,
    )
    assert path.steps[-1].latitude == pytest.approx(0.5 * 172800.0 / METRES_PER_DEGREE, rel=1e-6)
    assert path.steps[-1].longitude == pytest.approx(60.0, abs=1e-9)


def test_the_first_step_is_the_starting_point_itself():
    path = integrate_drift(
        series(1.0, 0.0), longitude=60.0, latitude=0.0, start_time=START, depth_metres=5.0,
        hours=24.0, step_hours=6.0,
    )
    assert path.steps[0].longitude == 60.0
    assert path.steps[0].latitude == 0.0
    assert path.steps[0].time == START
    assert len(path.steps) == 5


def test_a_trajectory_that_leaves_the_region_stops_and_says_so():
    path = integrate_drift(
        series(3.0, 0.0), longitude=73.0, latitude=0.0, start_time=START, depth_metres=5.0,
        hours=24.0 * 30, step_hours=6.0,
    )
    assert path.ended == "left the area with current data"
    assert path.steps[-1].longitude <= LONGITUDES[-1]
    assert len(path.steps) >= 2


def test_a_trajectory_that_runs_into_land_stops_and_says_so():
    values = np.zeros((len(LEVELS), len(LATITUDES), len(LONGITUDES)))
    values[:, :, LONGITUDES >= 65.0] = np.nan
    s = CurrentSeries(
        times=[START],
        u=[Grid(LEVELS, LATITUDES, LONGITUDES, np.where(np.isnan(values), np.nan, 1.0))],
        v=[uniform(0.0)],
    )
    path = integrate_drift(
        s, longitude=60.0, latitude=0.0, start_time=START, depth_metres=5.0,
        hours=24.0 * 30, step_hours=6.0,
    )
    assert path.ended == "left the area with current data"
    assert path.steps[-1].longitude < 65.0


def test_a_start_with_no_current_at_all_returns_one_point_and_no_track():
    path = integrate_drift(
        series(1.0, 0.0), longitude=120.0, latitude=0.0, start_time=START, depth_metres=5.0,
        hours=24.0, step_hours=6.0,
    )
    assert len(path.steps) == 1
    assert path.ended == "left the area with current data"


def test_halving_the_step_barely_moves_a_smooth_trajectory():
    """A convergence check. The field here is uniform so the answer is exact either way; what
    this guards is a step-dependent bug, where the answer quietly depends on how finely it was
    integrated - which is how an integrator gets shipped with the timestep in the wrong place."""
    coarse = integrate_drift(
        series(1.0, 0.3), longitude=60.0, latitude=10.0, start_time=START, depth_metres=5.0,
        hours=120.0, step_hours=12.0,
    )
    fine = integrate_drift(
        series(1.0, 0.3), longitude=60.0, latitude=10.0, start_time=START, depth_metres=5.0,
        hours=120.0, step_hours=1.0,
    )
    assert separation_km(coarse.steps[-1], fine.steps[-1]) < 1.0


def test_the_step_uses_the_velocity_halfway_along_it_and_not_the_one_at_its_start():
    """Midpoint against Euler, on a current that changes along the float's own path.

    `u` rises by 1 m/s per degree of longitude east of 60 E, so a float at 61 E sits in 1.0 m/s
    and is moving into faster water. Over one six-hour step, with a degree of longitude at the
    equator being 111,320 m:

        Euler     61 + 1.0000 * 21600 / 111320 = 61.194035
        midpoint  halfway is 61 + 1.0 * 10800 / 111320 = 61.097018, where u = 1.097018 m/s,
                  so 61 + 1.097018 * 21600 / 111320 = 61.212860

    Euler is 1.9 km short after six hours. Over a ten-day analysis interval, in a jet that
    accelerates the way the Somali Current does, that is not a rounding difference.
    """
    ramp = np.zeros((len(LEVELS), len(LATITUDES), len(LONGITUDES)))
    for column, lon in enumerate(LONGITUDES):
        ramp[:, :, column] = max(lon - 60.0, 0.0)
    s = CurrentSeries(
        times=[START],
        u=[Grid(LEVELS, LATITUDES, LONGITUDES, ramp)],
        v=[uniform(0.0)],
    )
    path = integrate_drift(
        s, longitude=61.0, latitude=0.0, start_time=START, depth_metres=5.0,
        hours=6.0, step_hours=6.0,
    )

    euler = 61.0 + 1.0 * 21600.0 / METRES_PER_DEGREE
    midway = 61.0 + 1.0 * 10800.0 / METRES_PER_DEGREE
    midpoint = 61.0 + (midway - 60.0) * 21600.0 / METRES_PER_DEGREE

    assert path.steps[-1].longitude == pytest.approx(midpoint, rel=1e-9)
    assert path.steps[-1].longitude != pytest.approx(euler, rel=1e-6)


def test_a_trajectory_never_ends_on_a_point_the_data_does_not_cover():
    """The line is read as a position, so its last point has to be one the analysis carries.

    Appending first and discovering the problem on the next pass leaves the final vertex outside
    the region - drawn, indistinguishable from the rest, and a claim about water with no data
    in it.
    """
    path = integrate_drift(
        series(3.0, 0.0), longitude=73.5, latitude=0.0, start_time=START, depth_metres=5.0,
        hours=24.0 * 30, step_hours=6.0,
    )
    assert path.ended == "left the area with current data"
    for step in path.steps:
        assert LONGITUDES[0] <= step.longitude <= LONGITUDES[-1]


# --------------------------------------------------------------------------------------------
# Against a float's own track
# --------------------------------------------------------------------------------------------


def test_separation_is_a_great_circle_distance_in_kilometres():
    from samudra.drift import DriftStep

    a = DriftStep(time=START, longitude=60.0, latitude=0.0)
    b = DriftStep(time=START, longitude=61.0, latitude=0.0)
    assert separation_km(a, b) == pytest.approx(111.32, rel=0.01)

    north = DriftStep(time=START, longitude=60.0, latitude=1.0)
    assert separation_km(a, north) == pytest.approx(111.32, rel=0.01)


def test_a_float_carried_by_exactly_the_analysed_current_has_no_separation():
    """The check that the comparison itself is right. If the float went where the current said,
    the answer has to be zero - and if it is not, the bug is here rather than in the ocean."""
    fixes = [
        (START, 60.0, 0.0),
        (START + timedelta(days=10), 60.0 + 10 * 86400.0 / METRES_PER_DEGREE, 0.0),
    ]
    comparison = track_against_drift(
        series(1.0, 0.0), fixes, depth_metres=1000.0, step_hours=1.0
    )
    assert comparison.separations_km[0] == pytest.approx(0.0, abs=1e-6)
    assert comparison.separations_km[-1] == pytest.approx(0.0, abs=0.5)
    assert comparison.days[-1] == pytest.approx(10.0)


def test_a_float_that_did_not_move_while_the_current_ran_separates_by_the_whole_distance():
    fixes = [(START, 60.0, 0.0), (START + timedelta(days=10), 60.0, 0.0)]
    comparison = track_against_drift(
        series(1.0, 0.0), fixes, depth_metres=1000.0, step_hours=1.0
    )
    assert comparison.separations_km[-1] == pytest.approx(864.0, rel=0.02)
    assert comparison.observed_km[-1] == pytest.approx(0.0, abs=1e-6)
    assert comparison.predicted_km[-1] == pytest.approx(864.0, rel=0.02)


def test_a_track_with_one_fix_cannot_be_compared():
    assert track_against_drift(series(1.0, 0.0), [(START, 60.0, 0.0)], depth_metres=1000.0) is None


def test_a_track_starting_outside_the_current_field_cannot_be_compared():
    fixes = [(START, 120.0, 0.0), (START + timedelta(days=10), 121.0, 0.0)]
    assert track_against_drift(series(1.0, 0.0), fixes, depth_metres=1000.0) is None


def test_the_comparison_reports_the_predicted_position_at_each_fix_and_not_between_them():
    fixes = [
        (START, 60.0, 0.0),
        (START + timedelta(days=3), 60.0, 0.0),
        (START + timedelta(days=7), 60.0, 0.0),
    ]
    comparison = track_against_drift(
        series(1.0, 0.0), fixes, depth_metres=1000.0, step_hours=1.0
    )
    assert comparison.days == pytest.approx([0.0, 3.0, 7.0])
    assert len(comparison.predicted) == 3
    assert comparison.predicted[1].longitude == pytest.approx(
        60.0 + 3 * 86400.0 / METRES_PER_DEGREE, rel=1e-4
    )


# --------------------------------------------------------------------------------------------
# What the score is allowed to be measured on
# --------------------------------------------------------------------------------------------


def test_a_fix_before_the_first_analysis_is_not_scored_against_it():
    """The failure this exists to stop: a score measured on days the current field never saw.

    `_bracket_time` holds the first analysis rather than extrapolating, which is the right
    choice for a drawn line and a silent one for a number. Measured in the shipped bake before
    this: the earliest Fix was 2026-03-22 against a first analysis of 2026-04-10, and 199 of the
    202 comparisons started inside that 19-day hole.

    Three Fixes, the first of them ten days before the series begins. The comparison must start
    at the second, so day 0 is the first analysis and the last day is 10, not 20.
    """
    s = series(0.25, 0.0, steps=2)
    fixes = [
        (START - timedelta(days=10), 60.0, 5.0),
        (START, 60.0, 5.0),
        (START + timedelta(days=10), 61.0, 5.0),
    ]
    got = track_against_drift(s, fixes, depth_metres=5.0, step_hours=6.0)
    assert got is not None
    assert got.days[0] == pytest.approx(0.0)
    assert got.days[-1] == pytest.approx(10.0)
    assert len(got.days) == 2


def test_a_track_that_finishes_before_the_first_analysis_is_refused_outright():
    s = series(0.25, 0.0, steps=2)
    fixes = [
        (START - timedelta(days=20), 60.0, 5.0),
        (START - timedelta(days=10), 60.5, 5.0),
    ]
    assert track_against_drift(s, fixes, depth_metres=5.0, step_hours=6.0) is None


def test_covers_is_inclusive_of_both_ends():
    s = series(0.25, 0.0, steps=2)
    assert s.covers(START)
    assert s.covers(START + STEP)
    assert not s.covers(START - timedelta(seconds=1))
    assert not s.covers(START + STEP + timedelta(seconds=1))
