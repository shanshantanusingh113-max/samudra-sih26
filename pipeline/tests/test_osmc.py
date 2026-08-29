"""Moorings, from the real-time GTS feed.

PS 26067 asks that the design extend to CTDs, moorings, HF-radar and ADCP. The seam was real and
tested and nothing was plugged into it, which is a weaker claim than it sounds - so this wires
up the one class of instrument that is both reachable and *Indian*.

NOAA's OSMC feed flattens the whole Global Telecommunication System into one ERDDAP table, CC0,
no login. Measured over the demo region for a single ten-day window, 20-30 Jul 2026, it returns
100,405 rows of which 94,653 carry subsurface temperature, from 169 profiling floats, 13 generic
moored buoys, 2 tropical moored buoys, 122 ships and 14 drifters. Five of those moorings report a
real vertical profile: 23459, 23451 and 23452 are India's OMNI network, and 2300009 and 2300019
are RAMA, the joint MoES-NOAA array.

It is a genuinely different format from Argo's, which is the point: depth in metres rather than
pressure, one row per level per report, the surface value in a different column from every other
level, no per-value QC flags at all, and a platform type that decides how the thing is drawn.
Absorbing all of that happens here and stops here; nothing downstream of `Profile` changes.
"""

from __future__ import annotations

import numpy as np
import pytest

from samudra.sources.osmc import (
    MIN_PROFILE_LEVELS,
    OsmcSource,
    parse_osmc,
    thin_to_one_per_day,
)

# Two reports from India's OMNI buoy 23459 in the Bay of Bengal, three hours apart, trimmed to
# six levels. Note the shape of the surface row: `ztmp` and `zsal` are empty at 0 m and the
# reading lives in `sst`/`sss` instead.
OMNI = """platform_code,platform_type,country,time,latitude,longitude,observation_depth,ztmp,zsal,sst,sss
,,,UTC,degrees_north,degrees_east,,Deg C,,Deg C,1
23459,MOORED BUOYS (GENERIC),INDIA,2026-07-25T00:00:00Z,13.984,87.02,0.0,NaN,NaN,29.1,33.2
23459,MOORED BUOYS (GENERIC),INDIA,2026-07-25T00:00:00Z,13.984,87.02,10.0,29.09,33.76,NaN,NaN
23459,MOORED BUOYS (GENERIC),INDIA,2026-07-25T00:00:00Z,13.984,87.02,20.0,29.09,33.72,NaN,NaN
23459,MOORED BUOYS (GENERIC),INDIA,2026-07-25T00:00:00Z,13.984,87.02,75.0,26.32,34.39,NaN,NaN
23459,MOORED BUOYS (GENERIC),INDIA,2026-07-25T00:00:00Z,13.984,87.02,200.0,13.6,35.0,NaN,NaN
23459,MOORED BUOYS (GENERIC),INDIA,2026-07-25T00:00:00Z,13.984,87.02,500.0,9.97,35.1,NaN,NaN
23459,MOORED BUOYS (GENERIC),INDIA,2026-07-25T03:00:00Z,13.986,87.025,0.0,NaN,NaN,29.1,33.2
23459,MOORED BUOYS (GENERIC),INDIA,2026-07-25T03:00:00Z,13.986,87.025,10.0,29.07,33.75,NaN,NaN
23459,MOORED BUOYS (GENERIC),INDIA,2026-07-25T03:00:00Z,13.986,87.025,20.0,29.07,33.55,NaN,NaN
23459,MOORED BUOYS (GENERIC),INDIA,2026-07-25T03:00:00Z,13.986,87.025,75.0,26.09,34.41,NaN,NaN
23459,MOORED BUOYS (GENERIC),INDIA,2026-07-25T03:00:00Z,13.986,87.025,200.0,13.91,34.99,NaN,NaN
23459,MOORED BUOYS (GENERIC),INDIA,2026-07-25T03:00:00Z,13.986,87.025,500.0,10.14,35.1,NaN,NaN
"""

# A coastal buoy that only reports at the surface. Real, and common: about ten of these sit off
# Chennai, Visakhapatnam, Lakshadweep and the Andamans.
SURFACE_ONLY = """platform_code,platform_type,country,time,latitude,longitude,observation_depth,ztmp,zsal,sst,sss
,,,UTC,degrees_north,degrees_east,,Deg C,,Deg C,1
23099,MOORED BUOYS (GENERIC),INDIA,2026-07-25T00:00:00Z,13.09,80.31,0.0,NaN,NaN,29.9,32.0
23099,MOORED BUOYS (GENERIC),INDIA,2026-07-25T03:00:00Z,13.09,80.31,0.0,NaN,NaN,29.8,32.0
23099,MOORED BUOYS (GENERIC),INDIA,2026-07-25T06:00:00Z,13.09,80.31,0.0,NaN,NaN,30.0,32.1
"""


def test_one_profile_per_report():
    profiles = parse_osmc(OMNI)
    assert len(profiles) == 2
    assert {p.platform_id for p in profiles} == {"23459"}
    assert [len(p) for p in profiles] == [6, 6]


def test_the_surface_reading_comes_from_the_column_it_actually_lives_in():
    """`ztmp` is empty at 0 m and the value is in `sst`. Dropping the surface would throw away
    the level a fisheries or cyclone reader looks at first."""
    first = parse_osmc(OMNI)[0]
    assert first.depths[0] == pytest.approx(0.0)
    assert first.values["temperature"][0] == pytest.approx(29.1)
    assert first.values["salinity"][0] == pytest.approx(33.2)


def test_depth_is_taken_as_metres_and_not_run_through_the_pressure_conversion():
    """Argo reports pressure; this feed reports depth. Converting again would move the deepest
    level of an Indian mooring by about 12 m, which is the axis the whole comparison sits on."""
    deepest = parse_osmc(OMNI)[0].depths[-1]
    assert deepest == pytest.approx(500.0)


def test_a_mooring_is_carried_as_anchored_and_named_by_its_operator():
    profile = parse_osmc(OMNI)[0]
    assert profile.kind == "mooring"
    assert profile.country == "INDIA"


def test_a_surface_only_buoy_is_not_a_profile():
    """One point is a measurement, not a cast. It cannot be drawn against a water column, and
    the panel would have nothing to put on its depth axis."""
    assert parse_osmc(SURFACE_ONLY) == []


def test_the_minimum_is_stated_rather_than_hidden():
    assert MIN_PROFILE_LEVELS >= 4


def test_implausible_values_are_refused_per_channel():
    """A mooring's thermistor string fails the same way a float's does, and the feed carries no
    quality flags at all - so the regional plausible range is the only layer there is."""
    broken = OMNI.replace(",13.6,35.0,", ",13.6,2.0,")
    profile = parse_osmc(broken)[0]
    assert np.isfinite(profile.values["temperature"]).all()
    assert not np.isfinite(profile.values["salinity"][4])


def test_reports_are_thinned_to_one_a_day():
    """A moored buoy reports every three hours. Eight identical-looking casts a day is 80 per
    Timestep window per instrument, which is a fact about telemetry rather than about the ocean
    - the same trap `coverage.py` records for counting levels instead of casts."""
    profiles = thin_to_one_per_day(parse_osmc(OMNI))
    assert len(profiles) == 1
    assert profiles[0].time.hour == 0


def test_thinning_keeps_the_richest_report_of_the_day():
    thin = OMNI.replace(
        "23459,MOORED BUOYS (GENERIC),INDIA,2026-07-25T00:00:00Z,13.984,87.02,500.0,9.97,35.1,NaN,NaN\n",
        "",
    )
    profiles = thin_to_one_per_day(parse_osmc(thin))
    assert len(profiles) == 1
    assert len(profiles[0]) == 6, "the 03:00 report has more levels and should win"


def test_the_source_is_a_registered_provider_reading_its_own_dataset():
    source = OsmcSource()
    assert "OSMC_RealTime" in source.endpoint
    assert "public domain" in source.attribution.lower() or "cc0" in source.attribution.lower()
