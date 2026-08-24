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


def test_a_coarsely_sampled_cast_leaves_the_thin_surface_slabs_empty():
    """Honest, not a bug. Near the surface a slab is a few metres thick, so a cast sampling
    every 50 m really did not measure in most of them, and the field must not pretend it did."""
    coarse = column_at(
        coverage([profile_at(0.5, 65.5, np.arange(5.0, 2000.0, 50.0))]), 0.5, 65.5
    )
    assert coarse.max() == 1
    assert (coarse[:6] == 0).any()   # thin slabs near the surface are missed
    assert (coarse[-6:] == 1).all()  # thick slabs in the abyss are not


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
