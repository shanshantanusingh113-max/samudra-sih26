"""The vertical section: depth against distance along a line somebody drew.

The hydrographic section is *the* figure of physical oceanography - it is what a crossing of the
Bay of Bengal looks like in every textbook and every INCOIS report - and it is a measurement, so
it is cut from the Grid and never from a Volume.

Two things here are easy to get wrong in a way that produces a beautiful and false picture: the
distance axis, which is what every feature on the plot is positioned against, and what happens
at a coast. Both are pinned by hand-computable cases.
"""

import numpy as np
import pytest

from samudra.grid import Grid
from samudra.section import (
    casts_near_line,
    great_circle_points,
    haversine_km,
    section_along,
)
from samudra.sources.base import Profile

from datetime import datetime, timezone

LEVELS = np.array([5.0, 50.0, 200.0, 1000.0])
LATITUDES = np.arange(0.0, 11.0, 1.0)
LONGITUDES = np.arange(60.0, 71.0, 1.0)


def grid(values=None) -> Grid:
    if values is None:
        # level*100 + lat + lon/100: unmistakable if any axis is transposed.
        values = np.zeros((len(LEVELS), len(LATITUDES), len(LONGITUDES)))
        for level in range(len(LEVELS)):
            for row, lat in enumerate(LATITUDES):
                for column, lon in enumerate(LONGITUDES):
                    values[level, row, column] = level * 100 + lat + lon / 100
    return Grid(levels=LEVELS, latitudes=LATITUDES, longitudes=LONGITUDES, values=values)


# --------------------------------------------------------------------------------------------
# The line
# --------------------------------------------------------------------------------------------


def test_a_degree_of_latitude_is_about_111_km():
    assert haversine_km(60.0, 0.0, 60.0, 1.0) == pytest.approx(111.3, rel=0.01)


def test_a_degree_of_longitude_shrinks_with_latitude():
    """At 60 N a degree of longitude is half what it is at the equator, and a section drawn
    east-west without that is twice as long as it says it is."""
    assert haversine_km(60.0, 0.0, 61.0, 0.0) == pytest.approx(111.3, rel=0.01)
    assert haversine_km(60.0, 60.0, 61.0, 60.0) == pytest.approx(55.6, rel=0.02)


def test_the_line_starts_and_ends_where_it_was_drawn():
    lons, lats = great_circle_points(60.0, 0.0, 70.0, 10.0, 25)
    assert (lons[0], lats[0]) == pytest.approx((60.0, 0.0))
    assert (lons[-1], lats[-1]) == pytest.approx((70.0, 10.0))
    assert len(lons) == 25


def test_the_points_are_evenly_spaced_along_the_line():
    lons, lats = great_circle_points(60.0, 0.0, 70.0, 10.0, 41)
    steps = [
        haversine_km(lons[i], lats[i], lons[i + 1], lats[i + 1]) for i in range(len(lons) - 1)
    ]
    assert max(steps) - min(steps) < 0.05 * np.mean(steps)


def test_a_line_of_zero_length_is_one_point_rather_than_a_division_by_zero():
    lons, lats = great_circle_points(60.0, 5.0, 60.0, 5.0, 10)
    assert np.allclose(lons, 60.0) and np.allclose(lats, 5.0)


# --------------------------------------------------------------------------------------------
# The section
# --------------------------------------------------------------------------------------------


def test_the_section_carries_one_column_per_point_and_one_row_per_level():
    section = section_along(grid(), 61.0, 1.0, 69.0, 9.0, points=33)
    assert section.values.shape == (len(LEVELS), 33)
    assert section.distances_km[0] == 0.0
    assert section.distances_km[-1] == pytest.approx(
        haversine_km(61.0, 1.0, 69.0, 9.0), rel=1e-6
    )


def test_a_value_on_the_line_is_the_model_value_at_that_point():
    """The whole plot is this number repeated, so it is worth pinning on its own."""
    section = section_along(grid(), 62.0, 2.0, 62.0, 2.0, points=1)
    # level*100 + lat + lon/100 at (2 N, 62 E)
    np.testing.assert_allclose(section.values[:, 0], [2.62, 102.62, 202.62, 302.62], rtol=1e-9)


def test_the_section_reads_the_grid_and_not_a_warped_axis():
    """The depth axis of a section is the model's own Levels, unwarped. A section plotted on the
    Volume's even axis would put the thermocline at the wrong depth on a chart somebody reads
    metres off."""
    section = section_along(grid(), 61.0, 1.0, 69.0, 9.0, points=9)
    np.testing.assert_allclose(section.levels, LEVELS)


def test_a_point_over_land_is_missing_rather_than_interpolated_around():
    """One masked node makes a hole in the section rather than a smooth wall of plausible water.

    The hole is a whole grid cell wide, not one sample, because `column_at` refuses a bilinear
    blend whose four corners include a Masked one - which is right: near a coast the corners
    that do have data are the open ocean, and averaging them in manufactures a sea temperature
    for a point on land.
    """
    values = grid().values.copy()
    row = int(np.where(LATITUDES == 5.0)[0][0])
    column = int(np.where(LONGITUDES == 65.0)[0][0])
    values[:, row, column] = np.nan
    section = section_along(grid(values), 61.0, 1.0, 69.0, 9.0, points=9)

    missing = np.isnan(section.values).all(axis=0)
    assert missing[4], "the sample nearest the masked node has to be a gap"
    assert not missing[0] and not missing[-1], "the ends are far from it and still carry values"


def test_a_line_that_leaves_the_grid_is_missing_where_it_leaves_it():
    """Half a section is a real answer. Refusing the whole line because one end is outside the
    model would throw away the half that is inside it."""
    section = section_along(grid(), 65.0, 5.0, 90.0, 5.0, points=11)
    assert np.isfinite(section.values[:, 0]).all()
    assert np.isnan(section.values[:, -1]).all()


def test_a_line_entirely_outside_the_grid_has_nothing_on_it():
    section = section_along(grid(), 100.0, 40.0, 110.0, 45.0, points=5)
    assert not np.isfinite(section.values).any()


# --------------------------------------------------------------------------------------------
# The casts drawn on the same axes
# --------------------------------------------------------------------------------------------


def cast(lon, lat, platform="x"):
    return Profile(
        platform_id=platform,
        latitude=lat,
        longitude=lon,
        time=datetime(2026, 7, 1, tzinfo=timezone.utc),
        depths=np.array([5.0, 100.0]),
        values={"temperature": np.array([29.0, 20.0])},
    )


def test_a_cast_on_the_line_lands_at_its_own_distance_along_it():
    """And "on the line" means on the **great circle**, which is not the parallel.

    A section from 60 E, 5 N to 70 E, 5 N is cut along a great circle, and a great circle
    between two points at 5 N bulges poleward between them. Measured by minimising over 20,001
    points of the drawn line, the closest point to 65 E, 5 N is 65 E, 5.019 N: the cast is
    **2.115 km** off the line and 554.477 km along it. This asserted zero, which was asserting
    the flat approximation the corridor used to be measured with.
    """
    found = casts_near_line([cast(65.0, 5.0)], 60.0, 5.0, 70.0, 5.0, corridor_km=50.0)
    assert len(found) == 1
    assert found[0].distance_km == pytest.approx(554.477, abs=0.01)
    assert found[0].offset_km == pytest.approx(2.115, abs=0.01)


def test_the_corridor_is_measured_against_the_line_that_is_drawn():
    """The failure this replaced: a corridor measured about a different line from the section.

    `section_along` samples a great circle; the corridor was a straight line in degrees scaled
    by the cosine of the mean latitude, which is a rhumb line, and the two separate over a long
    section. On 45 E, 10 S to 100 E, 25 N the reported offset was wrong by up to 179 km against
    a corridor 150 km wide.

    Hand-computable case: a cast at the great circle's own midpoint must read exactly zero
    offset and exactly half the line's length, whatever the line does.
    """
    lons, lats = great_circle_points(45.0, -10.0, 100.0, 25.0, 3)
    middle = cast(float(lons[1]), float(lats[1]))
    found = casts_near_line([middle], 45.0, -10.0, 100.0, 25.0, corridor_km=150.0)
    assert len(found) == 1
    assert found[0].offset_km == pytest.approx(0.0, abs=0.001)
    assert found[0].distance_km == pytest.approx(
        haversine_km(45.0, -10.0, 100.0, 25.0) / 2, rel=1e-6
    )


def test_a_cast_beyond_the_corridor_is_not_drawn():
    """A cast 300 km off the line is not on the section, and plotting it there would put an
    observation somewhere nobody observed."""
    assert casts_near_line([cast(65.0, 8.0)], 60.0, 5.0, 70.0, 5.0, corridor_km=50.0) == []


def test_a_cast_past_the_end_of_the_line_is_not_drawn():
    """Near the line is not the same as on it. A cast 200 km beyond the eastern end is within a
    corridor's width of the line's direction and is not part of this section."""
    assert casts_near_line([cast(72.0, 5.0)], 60.0, 5.0, 70.0, 5.0, corridor_km=50.0) == []


def test_casts_come_back_in_the_order_they_appear_along_the_line():
    found = casts_near_line(
        [cast(68.0, 5.0, "east"), cast(62.0, 5.0, "west"), cast(65.0, 5.0, "middle")],
        60.0,
        5.0,
        70.0,
        5.0,
        corridor_km=60.0,
    )
    assert [f.profile.platform_id for f in found] == ["west", "middle", "east"]


def test_the_offset_says_how_far_off_the_line_each_cast_actually_was():
    """A section with a cast on it implies the cast was there. The offset is what lets the panel
    say how far off it really was, which is the difference between a figure and a claim."""
    found = casts_near_line([cast(65.0, 5.5)], 60.0, 5.0, 70.0, 5.0, corridor_km=100.0)
    assert found[0].offset_km == pytest.approx(55.6, rel=0.05)
