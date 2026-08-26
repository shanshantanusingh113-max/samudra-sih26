"""The anomaly Field is arithmetic, so the tests are mostly about what it must refuse to do:
invent a baseline it does not have, survive a single Timestep, or let land acquire a departure.
"""

from __future__ import annotations

import numpy as np
import pytest

from samudra.anomaly import (
    DEGREES_THRESHOLD,
    anomaly_series,
    find_anomaly_features,
    symmetric_encoding_range,
)
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


# --------------------------------------------------------------- Anomaly Features

LEVELS_DEEP = np.array([5.0, 20.0, 50.0, 100.0, 200.0, 500.0])
LATS = np.arange(0.0, 8.0)
LONS = np.arange(60.0, 68.0)


def series_of(base=20.0, steps=12):
    """A calm ocean: every cell the same value at every Timestep, so nothing departs."""
    shape = (len(LEVELS_DEEP), len(LATS), len(LONS))
    return [
        Grid(
            levels=LEVELS_DEEP,
            latitudes=LATS,
            longitudes=LONS,
            values=np.full(shape, float(base)),
        )
        for _ in range(steps)
    ]


def with_patch(grids, step, box, delta):
    """Add `delta` to one box (levels, lats, lons as slices) at one Timestep."""
    kz, ky, kx = box
    grids[step].values[kz, ky, kx] += delta
    return grids


def features_of(grids, **kw):
    return find_anomaly_features(anomaly_series(grids), **kw)


def test_a_calm_ocean_has_no_features():
    assert all(step == [] for step in features_of(series_of()))


def test_one_warm_patch_is_found_where_it_was_put():
    grids = with_patch(series_of(), 5, (slice(2, 5), slice(2, 5), slice(3, 6)), +3.0)
    found = features_of(grids)
    assert sum(len(s) for s in found) == 1
    f = found[5][0]
    assert f.sign == 1
    assert f.peak_value > 2.0
    assert f.cell_count == 27
    # Depth comes from the Levels, not from indices into them.
    assert f.top_metres == 50.0
    assert f.bottom_metres == 200.0
    assert LATS[2] <= f.latitude <= LATS[4]
    assert LONS[3] <= f.longitude <= LONS[5]


def test_a_warm_and_a_cool_patch_that_touch_stay_two_features():
    """The trap this was built around.

    Thresholding on the absolute departure merges a warm patch into the cool one beside it
    whenever the front between them is sharp enough that no cell sits inside the threshold. On
    the real bake that produced a single "feature" spanning the whole basin, containing both
    +5.3 and -7.7 degC. Warm and cool are labelled separately.
    """
    grids = series_of()
    grids = with_patch(grids, 5, (slice(1, 4), slice(1, 4), slice(1, 4)), +3.0)
    grids = with_patch(grids, 5, (slice(1, 4), slice(1, 4), slice(4, 7)), -3.0)
    found = features_of(grids)[5]
    assert len(found) == 2
    assert {f.sign for f in found} == {1, -1}


def test_a_patch_smaller_than_the_minimum_is_not_a_feature():
    grids = with_patch(series_of(), 5, (slice(2, 3), slice(2, 3), slice(3, 4)), +5.0)
    assert features_of(grids)[5] == []


def test_water_that_is_unusual_but_physically_tiny_is_not_a_feature():
    """A hundredth of a degree can be a huge z-score in water that never moves. The deep ocean
    is full of that, and surfacing it beside a 3 degC thermocline swing would mislead."""
    grids = with_patch(series_of(), 5, (slice(2, 5), slice(2, 5), slice(3, 6)), +0.3)
    assert features_of(grids)[5] == []


def test_water_that_swings_hard_every_step_is_not_a_feature():
    """Large is not the same as unusual. Water that does this every Timestep is doing its job."""
    grids = series_of()
    for step in range(12):
        grids[step].values[2:5, 2:5, 3:6] += 3.0 if step % 2 else -3.0
    assert all(step == [] for step in features_of(grids))


def test_land_never_becomes_a_feature():
    grids = series_of()
    for g in grids:
        g.values[0, :, :] = np.nan
    grids = with_patch(grids, 5, (slice(2, 5), slice(2, 5), slice(3, 6)), +3.0)
    found = features_of(grids)[5]
    assert len(found) == 1
    assert found[0].top_metres >= LEVELS_DEEP[1]


def test_features_come_back_strongest_first_and_capped():
    grids = series_of()
    # Separated by a column of untouched water, or they merge into one body - which is correct
    # behaviour and not what this test is about.
    for i, lon in enumerate((0, 3, 6)):
        grids = with_patch(
            grids, 5, (slice(1, 4), slice(1, 4), slice(lon, lon + 2)), 1.0 + i
        )
    assert len(features_of(grids)[5]) == 3
    found = features_of(grids, limit=2)[5]
    assert len(found) == 2
    assert abs(found[0].peak_value) > abs(found[1].peak_value)


def test_the_centre_index_points_at_the_cell_the_marker_is_in():
    """Everything that explains a feature - the isotherm depth here, what salinity did, how many
    casts are nearby - reads this cell. If it drifts by one the explanation describes the water
    next door."""
    grids = with_patch(series_of(), 5, (slice(2, 5), slice(2, 5), slice(3, 6)), +3.0)
    f = features_of(grids)[5][0]
    anomaly = anomaly_series(grids)[5]
    level, row, column = f.centre_index
    assert anomaly.levels[level] == f.depth_metres
    assert anomaly.latitudes[row] == f.latitude
    assert anomaly.longitudes[column] == f.longitude


def test_the_marker_sits_at_the_middle_of_the_body_not_at_its_hottest_cell():
    """Where the ring goes, and what the panel describes.

    It used to be the peak cell. Measured over the real bake that put the ring a median 222 km
    from the middle of its own feature, 451 km at the ninetieth percentile and 1063 km at worst -
    so a ring could sit on pale water at one end of a long body, and every fact the panel gave
    ("the 20 degC line sits at X here") was about a place the user was not looking at.
    """
    grids = series_of()
    # A long body along longitude, with its hottest cell jammed at the western end.
    grids = with_patch(grids, 5, (slice(2, 5), slice(2, 5), slice(0, 8)), +3.0)
    grids = with_patch(grids, 5, (slice(2, 5), slice(2, 5), slice(0, 1)), +6.0)
    f = features_of(grids)[5][0]

    assert f.peak_value > 5.0            # the headline is still the strongest point
    assert f.longitude > LONS[2]         # the marker is not out at the hot western end
    assert LONS[2] < f.longitude < LONS[5]
    # And the cell the panel reads its facts from is the marker's, not the peak's.
    level, row, column = f.centre_index
    assert anomaly_series(grids)[5].longitudes[column] == f.longitude


def test_the_centre_is_a_cell_the_body_actually_occupies():
    """A crescent's mass centre falls outside it. Reading salinity from a hole in the middle of a
    feature would describe water that is not part of it."""
    grids = series_of()
    grids = with_patch(grids, 5, (slice(2, 5), slice(1, 2), slice(1, 7)), +3.0)  # top bar
    grids = with_patch(grids, 5, (slice(2, 5), slice(1, 6), slice(1, 2)), +3.0)  # left bar
    f = features_of(grids)[5][0]
    anomaly = anomaly_series(grids)[5]
    level, row, column = f.centre_index
    assert anomaly.values[level, row, column] > DEGREES_THRESHOLD


def test_the_footprint_is_an_area_and_not_a_bounding_box_diagonal():
    """`widthKm` was the span of the box the body fits in, so a diagonal or curved band reported
    far wider than it is - 3228 km from 705 cells in the real bake. Area cannot be gamed that
    way."""
    grids = series_of()
    # A diagonal band. Blocks overlap so the body stays connected - the labeller joins cells that
    # share a face, not a corner, so a staircase of single cells would be eight separate bodies.
    for i in range(6):
        grids = with_patch(grids, 5, (slice(1, 4), slice(i, i + 2), slice(i, i + 2)), +3.0)
    f = features_of(grids)[5][0]

    cell = (111.32) ** 2
    box = (f.north - f.south + 1) * (f.east - f.west + 1) * cell
    assert f.footprint_km2 < box * 0.6   # a diagonal fills well under half its own box
    # And it is the area of the columns it really occupies, to within the cosine correction.
    columns = round(f.footprint_km2 / cell)
    assert 15 <= columns <= 30


def test_the_footprint_counts_a_column_once_however_deep_it_goes():
    shallow = with_patch(series_of(), 5, (slice(2, 3), slice(2, 5), slice(2, 7)), +3.0)
    deep = with_patch(series_of(), 5, (slice(1, 5), slice(2, 5), slice(2, 7)), +3.0)
    a = features_of(shallow)[5][0]
    b = features_of(deep)[5][0]
    assert b.cell_count > a.cell_count
    assert a.footprint_km2 == pytest.approx(b.footprint_km2)
