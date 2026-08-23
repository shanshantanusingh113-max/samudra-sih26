import numpy as np
import pytest

from samudra.sources.argo import parse_profiles, pressure_to_depth

CSV = """platform_number,time,latitude,longitude,pres_adjusted,temp_adjusted,psal_adjusted
,UTC,degrees_north,degrees_east,decibar,degree_Celsius,PSU
1902198,2026-06-09T20:58:41Z,3.8773,80.2215,4.3,29.54,34.99
1902198,2026-06-09T20:58:41Z,3.8773,80.2215,25.0,29.20,35.00
1902198,2026-06-09T20:58:41Z,3.8773,80.2215,50.0,28.10,35.02
1902198,2026-06-09T20:58:41Z,3.8773,80.2215,75.0,26.40,35.06
1902198,2026-06-09T20:58:41Z,3.8773,80.2215,100.0,24.30,35.10
1902198,2026-06-09T20:58:41Z,3.8773,80.2215,200.0,15.20,35.30
1902198,2026-06-09T20:58:41Z,3.8773,80.2215,300.0,12.40,35.20
1902198,2026-06-09T20:58:41Z,3.8773,80.2215,500.0,9.10,35.05
1902198,2026-06-19T20:58:41Z,4.1000,80.5000,5.0,29.60,34.90
1902198,2026-06-19T20:58:41Z,4.1000,80.5000,25.0,29.30,34.95
1902198,2026-06-19T20:58:41Z,4.1000,80.5000,50.0,28.00,35.00
1902198,2026-06-19T20:58:41Z,4.1000,80.5000,75.0,26.20,35.05
1902198,2026-06-19T20:58:41Z,4.1000,80.5000,100.0,24.00,35.10
1902198,2026-06-19T20:58:41Z,4.1000,80.5000,200.0,15.00,35.20
1902198,2026-06-19T20:58:41Z,4.1000,80.5000,300.0,12.20,35.15
1902198,2026-06-19T20:58:41Z,4.1000,80.5000,500.0,9.00,35.00
"""


def test_groups_rows_into_one_profile_per_platform_and_time():
    profiles = parse_profiles(CSV)
    assert len(profiles) == 2
    assert {p.platform_id for p in profiles} == {"1902198"}
    assert [len(p) for p in profiles] == [8, 8]


def test_profile_carries_its_position_and_time():
    first = parse_profiles(CSV)[0]
    assert first.latitude == pytest.approx(3.8773)
    assert first.longitude == pytest.approx(80.2215)
    assert first.time.year == 2026 and first.time.month == 6


def test_depths_are_ascending_and_close_to_but_not_equal_to_pressure():
    first = parse_profiles(CSV)[0]
    assert np.all(np.diff(first.depths) > 0)
    # ~1% shallower than the dbar figure at these depths - close, but deliberately not equal.
    assert first.depths[-1] == pytest.approx(496.0, abs=2.0)
    assert first.depths[-1] != pytest.approx(500.0, abs=0.5)


def test_implausible_salinity_is_dropped_but_the_good_temperature_survives():
    """The real GDAC has a float reporting ~20 PSU. Keep the cast, lose the bad channel."""
    bad = CSV.replace("4.3,29.54,34.99", "4.3,29.54,19.99")
    first = parse_profiles(bad)[0]
    assert np.isnan(first.values["salinity"][0])
    assert first.values["temperature"][0] == pytest.approx(29.54)
    assert np.isfinite(first.values["salinity"][1:]).all()


def test_a_cast_with_too_few_points_is_discarded():
    stub = "\n".join(CSV.splitlines()[:4]) + "\n"
    assert parse_profiles(stub) == []


def test_malformed_rows_do_not_lose_the_whole_download():
    corrupted = CSV.replace("100.0,24.30,35.10", "not-a-number,24.30,35.10")
    profiles = parse_profiles(corrupted)
    assert len(profiles) == 2
    assert len(profiles[0]) == 7


def test_missing_values_are_tolerated():
    gappy = CSV.replace("200.0,15.20,35.30", "200.0,15.20,")
    profiles = parse_profiles(gappy)
    assert len(profiles) == 2
    assert len(profiles[0]) == 8
    assert np.isnan(profiles[0].values["salinity"][5])
    assert profiles[0].values["temperature"][5] == pytest.approx(15.20)


def test_a_cast_whose_every_row_is_malformed_does_not_take_down_the_download():
    """One truncated line used to leave an empty cast behind and abort the whole parse."""
    lines = CSV.splitlines()
    broken = [line.replace(",4.1000,80.5000,", ",4.1000,") for line in lines]
    profiles = parse_profiles("\n".join(broken) + "\n")
    assert len(profiles) == 1  # the good float survives
    assert len(profiles[0]) == 8


def test_a_row_that_fails_to_parse_leaves_no_empty_cast():
    trailing = CSV + "9999999,2026-06-09T20:58:41Z,notalat,80.0,4.3,29.5,35.0\n"
    profiles = parse_profiles(trailing)
    assert {p.platform_id for p in profiles} == {"1902198"}


def test_empty_input_yields_nothing():
    assert parse_profiles("") == []
    assert parse_profiles("platform_number,time\n,UTC\n") == []


def test_pressure_to_depth_accounts_for_latitude():
    """Same pressure, different gravity - the equator is very slightly deeper."""
    at_equator = pressure_to_depth(1000.0, 0.0)
    at_pole = pressure_to_depth(1000.0, 90.0)
    assert at_equator > at_pole
    assert at_equator - at_pole == pytest.approx(5.2, abs=0.5)


def test_pressure_to_depth_is_zero_at_the_surface():
    assert pressure_to_depth(0.0, 12.0) == pytest.approx(0.0)
