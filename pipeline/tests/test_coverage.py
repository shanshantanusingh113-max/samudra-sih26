from datetime import datetime, timezone

import numpy as np

from samudra.coverage import RADIUS_DEGREES, band_of, observation_coverage, slab_edges
from samudra.depth_warp import DepthWarp
from samudra.sources.base import Profile

WARP = DepthWarp(top=5.0, bottom=2000.0)
SAMPLES = 24
LATITUDES = np.arange(-4.5, 5.5, 1.0)
LONGITUDES = np.arange(60.5, 70.5, 1.0)

# Real Argo sampling in this region: 2 dbar bins all the way down. Measured, not assumed - see
# the module docstring.
FULL_CAST = np.arange(5.0, 2000.0, 2.0)


def profile_at(latitude, longitude, depths, platform="test"):
    return Profile(
        platform_id=platform,
        latitude=latitude,
        longitude=longitude,
        time=datetime(2026, 7, 1, tzinfo=timezone.utc),
        depths=np.asarray(depths, dtype=float),
        values={},
    )


def coverage(profiles, mask=None):
    return observation_coverage(profiles, LATITUDES, LONGITUDES, WARP, SAMPLES, mask)


def column_at(field, latitude, longitude):
    return field.counts[:, LATITUDES == latitude, LONGITUDES == longitude].ravel()


def test_no_profiles_means_no_coverage_anywhere():
    field = coverage([])
    assert field.counts.shape == (SAMPLES, len(LATITUDES), len(LONGITUDES))
    assert field.counts.sum() == 0
    assert field.observed_fraction == 0.0


def test_slabs_tile_the_column_without_gaps_or_overlap():
    edges = slab_edges(WARP, SAMPLES)
    assert edges.size == SAMPLES + 1
    assert edges[0] == WARP.top
    assert edges[-1] == WARP.bottom
    assert np.all(np.diff(edges) > 0)


def test_one_cast_never_counts_more_than_once_in_a_slab():
    """The point of counting casts: 511 levels is one cast, not 511 pieces of evidence."""
    fine = column_at(coverage([profile_at(0.5, 65.5, FULL_CAST)]), 0.5, 65.5)
    assert fine.max() == 1


def test_how_finely_a_cast_reports_does_not_change_what_it_constrains():
    """The bug this replaced a test for.

    Argo reports every 2 dbar in delayed mode and at round depths in real time. Both are one
    float, one dive, the same water. The earlier rule asked "did this cast have a level inside
    this slab", which near the surface is a question about our slab edges rather than about the
    ocean: at 19 m a slab is 5 m thick and a real-time cast reporting at 10 and 20 m can miss it.
    Measured over the shipped bake, that cost slab 3 (19 m) 22 percentage points of casts against
    its neighbours at 25 m and 37 m, and put "no observations" directly under floats.
    """
    coarse = column_at(
        coverage([profile_at(0.5, 65.5, [5.0, 10, 20, 30, 50, 75, 100, 150, 200, 300, 500, 1000])]),
        0.5,
        65.5,
    )
    fine = column_at(
        coverage([profile_at(0.5, 65.5, np.linspace(5.0, 1000.0, 498))]), 0.5, 65.5
    )
    assert np.array_equal(coarse, fine)


def test_a_cast_whose_levels_straddle_the_surface_slab_still_counts_for_it():
    """The exact cast that exposed it: float 1902196, 2026-04-26, at -6.11 N 78.24 E.

    Its two shallowest levels are 4.71 m and 9.1 m. The surface slab spans 5.00 to 7.16 m in the
    shipped bake, so the old rule found nothing in it - the 4.71 m level falling below the first
    bin edge and the 9.1 m one above the slab - and painted the water directly under a float that
    had just measured there as unobserved.
    """
    levels = [4.71, 9.1, 19.1, 30.2, 39.4, 50.2, 58.3, 68.0, 77.2, 89.3]
    # 48 slabs, as the bake ships, because it is that geometry that makes the top slab 2.16 m
    # thick. At the 24 this file uses elsewhere the slab is wide enough to hide the fault.
    field = observation_coverage(
        [profile_at(0.5, 65.5, levels)], LATITUDES, LONGITUDES, WARP, 48
    )
    assert slab_edges(WARP, 48)[1] < 9.1  # the second level really is below the top slab
    assert field.counts[0, LATITUDES == 0.5, LONGITUDES == 65.5].ravel()[0] == 1


def test_a_cast_that_starts_below_the_surface_does_not_claim_the_surface():
    """The other end of the same rule. Some floats only begin reporting at 25 m, and the water
    above that genuinely was not measured, so being generous downwards must not be generous
    upwards as well."""
    column = column_at(
        coverage([profile_at(0.5, 65.5, np.arange(25.0, 2000.0, 2.0))]), 0.5, 65.5
    )
    assert column[0] == 0
    assert column[-1] == 1


def test_full_depth_sampling_is_flat_with_depth():
    """A 2 dbar cast to 2000 m constrains every slab equally. Any tilt would be a warp artefact."""
    column = column_at(coverage([profile_at(0.5, 65.5, FULL_CAST)]), 0.5, 65.5)
    assert column.min() == 1
    assert column.max() == 1


def test_a_cast_that_turns_around_early_does_not_claim_the_abyss():
    """The real vertical signal: some floats stop short, and deep water is less constrained."""
    shallow = profile_at(0.5, 65.5, np.arange(5.0, 400.0, 2.0))
    deep = profile_at(0.5, 65.5, FULL_CAST, platform="deep")
    column = column_at(coverage([shallow, deep]), 0.5, 65.5)
    assert column[0] == 2
    assert column[-1] == 1


def test_casts_accumulate_where_several_floats_overlap():
    here = [profile_at(0.5, 65.5, FULL_CAST, platform=str(i)) for i in range(4)]
    assert column_at(coverage(here), 0.5, 65.5).max() == 4


def test_a_cast_only_covers_its_own_neighbourhood():
    field = coverage([profile_at(0.5, 65.5, FULL_CAST)])
    assert column_at(field, 0.5, 65.5).sum() > 0
    assert column_at(field, -4.5, 69.5).sum() == 0


def test_the_neighbourhood_reaches_exactly_as_far_as_the_stated_radius():
    field = coverage([profile_at(0.5, 65.5, FULL_CAST)])
    assert column_at(field, 0.5 + RADIUS_DEGREES, 65.5).sum() > 0
    assert column_at(field, 0.5 + RADIUS_DEGREES + 1.0, 65.5).sum() == 0


def test_the_neighbourhood_is_a_circle_and_not_a_square():
    """A square box reaches 1.41 times further diagonally than it claims, and its right-angled
    corners are visible in the render as structure that is not in the ocean."""
    field = coverage([profile_at(0.5, 65.5, FULL_CAST)])
    assert column_at(field, 0.5 + 3.0, 65.5).sum() > 0   # due north at the radius, inside
    assert column_at(field, 0.5, 65.5 + 3.0).sum() > 0   # due east at the radius, inside
    # 2 degrees north and 3 east is 3.6 degrees away, so the circle excludes it and the old
    # square included it.
    assert column_at(field, 0.5 + 2.0, 65.5 + 3.0).sum() == 0


def test_longitude_window_widens_away_from_the_equator():
    """A degree of longitude is shorter at 60 N, so the box widens to stay roughly circular."""
    latitudes = np.arange(55.5, 65.5, 1.0)
    longitudes = np.arange(0.5, 20.5, 1.0)
    field = observation_coverage(
        [profile_at(60.5, 10.5, FULL_CAST)], latitudes, longitudes, WARP, SAMPLES
    )
    reach = np.where(field.counts[0].sum(axis=0) > 0)[0]
    assert longitudes[reach].max() - 10.5 > RADIUS_DEGREES


def test_land_is_missing_rather_than_zero():
    """Zero casts and 'not ocean' are different statements and must not be conflated."""
    mask = np.zeros((SAMPLES, len(LATITUDES), len(LONGITUDES)), dtype=bool)
    mask[:, 0, 0] = True
    field = coverage([profile_at(0.5, 65.5, FULL_CAST)], mask=mask)
    assert np.isnan(field.counts[:, 0, 0]).all()
    assert np.isfinite(field.counts[:, 5, 5]).all()


def test_observed_fraction_ignores_land_rather_than_counting_it_as_unobserved():
    mask = np.zeros((SAMPLES, len(LATITUDES), len(LONGITUDES)), dtype=bool)
    mask[:, :, :5] = True  # half the block is land
    field = coverage([profile_at(0.5, 65.5, FULL_CAST)], mask=mask)
    assert 0.0 < field.observed_fraction <= 1.0
    # Every ocean voxel within reach is covered, so the fraction reflects the sea only.
    assert field.observed_fraction > coverage([profile_at(0.5, 65.5, FULL_CAST)]).observed_fraction


def test_bands_split_counts_into_the_four_a_user_reads():
    assert band_of(0) == 0
    assert band_of(1) == 1
    assert band_of(3) == 2
    assert band_of(9) == 3
    assert band_of(float("nan")) == 0
