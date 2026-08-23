"""The Source Adapter seam, tested where it actually bends.

Two providers serve the same Argo programme in incompatible ways: Ifremer's GDAC mirror
populates the delayed-mode `*_adjusted` columns and INCOIS's archive leaves them entirely
empty while filling the raw ones. Absorbing that is the whole job of an adapter, so it is
worth a test rather than a hopeful comment.
"""

import numpy as np
import pytest

from samudra.sources.argo import GDAC_COLUMNS, INCOIS_COLUMNS, parse_profiles

GDAC = """platform_number,time,latitude,longitude,pres_adjusted,temp_adjusted,psal_adjusted
,UTC,degrees_north,degrees_east,decibar,degree_Celsius,PSU
1902198,2026-06-09T20:58:41Z,3.87,80.22,4.3,29.54,34.99
1902198,2026-06-09T20:58:41Z,3.87,80.22,25.0,29.20,35.00
1902198,2026-06-09T20:58:41Z,3.87,80.22,50.0,28.10,35.02
1902198,2026-06-09T20:58:41Z,3.87,80.22,100.0,24.30,35.10
1902198,2026-06-09T20:58:41Z,3.87,80.22,200.0,15.20,35.30
1902198,2026-06-09T20:58:41Z,3.87,80.22,500.0,9.10,35.05
"""

# INCOIS uses upper-case names, and ships the adjusted columns entirely empty.
INCOIS = """PLATFORM_NUMBER,time,latitude,longitude,PRES,TEMP,PSAL,PRES_ADJUSTED,TEMP_ADJUSTED,PSAL_ADJUSTED
,UTC,degrees_north,degrees_east,decibar,degree_Celsius,PSU,decibar,degree_Celsius,PSU
2903988,2025-03-07T13:54:55Z,13.08,85.10,0.0,29.976,33.557,NaN,NaN,NaN
2903988,2025-03-07T13:54:55Z,13.08,85.10,2.6,29.447,33.679,NaN,NaN,NaN
2903988,2025-03-07T13:54:55Z,13.08,85.10,50.0,28.100,34.020,NaN,NaN,NaN
2903988,2025-03-07T13:54:55Z,13.08,85.10,100.0,24.300,34.510,NaN,NaN,NaN
2903988,2025-03-07T13:54:55Z,13.08,85.10,200.0,15.200,35.010,NaN,NaN,NaN
2903988,2025-03-07T13:54:55Z,13.08,85.10,500.0,9.100,35.050,NaN,NaN,NaN
"""


def test_gdac_layout_parses():
    profiles = parse_profiles(GDAC, GDAC_COLUMNS)
    assert len(profiles) == 1
    assert profiles[0].platform_id == "1902198"
    assert len(profiles[0]) == 6


def test_incois_layout_parses_despite_different_column_names():
    profiles = parse_profiles(INCOIS, INCOIS_COLUMNS)
    assert len(profiles) == 1
    assert profiles[0].platform_id == "2903988"
    assert len(profiles[0]) == 6


def test_incois_falls_back_to_raw_when_adjusted_is_empty():
    """INCOIS ships *_ADJUSTED entirely NaN. Preferring it blindly would yield nothing."""
    profile = parse_profiles(INCOIS, INCOIS_COLUMNS)[0]
    assert np.isfinite(profile.values["temperature"]).all()
    assert profile.values["temperature"][0] == pytest.approx(29.976)
    assert profile.values["salinity"][0] == pytest.approx(33.557)


def test_adjusted_wins_when_both_are_present():
    """Delayed-mode adjusted values are the better science; raw is only a fallback."""
    both = INCOIS.replace(
        "0.0,29.976,33.557,NaN,NaN,NaN", "0.0,29.976,33.557,0.0,28.000,33.000"
    )
    profile = parse_profiles(both, INCOIS_COLUMNS)[0]
    assert profile.values["temperature"][0] == pytest.approx(28.000)
    assert profile.values["salinity"][0] == pytest.approx(33.000)


def test_the_two_layouts_produce_the_same_shape_of_object():
    """Downstream code must not be able to tell which provider a Profile came from."""
    a = parse_profiles(GDAC, GDAC_COLUMNS)[0]
    b = parse_profiles(INCOIS, INCOIS_COLUMNS)[0]
    assert set(a.values) == set(b.values) == {"temperature", "salinity"}
    assert a.depths.ndim == b.depths.ndim == 1
    assert type(a) is type(b)


def test_a_missing_optional_column_is_not_fatal():
    """A provider that serves no adjusted columns at all must still parse."""
    minimal = "\n".join(
        line.rsplit(",", 3)[0] if index > 1 else _trim_header(line, index)
        for index, line in enumerate(INCOIS.strip().splitlines())
    )
    profiles = parse_profiles(minimal + "\n", INCOIS_COLUMNS)
    assert len(profiles) == 1
    assert np.isfinite(profiles[0].values["temperature"]).all()


def _trim_header(line: str, index: int) -> str:
    return line.rsplit(",", 3)[0] if index in (0, 1) else line
