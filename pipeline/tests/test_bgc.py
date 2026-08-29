"""BGC-Argo: the same programme, the same server, one more quantity.

Chlorophyll is named by PS 26067 in the same clause as Argo and glider profiles, and it turned
out to be reachable from a dataset sitting beside the one the demo already reads:
`ArgoFloats-synthetic-BGC` on Ifremer's ERDDAP. Measured over the demo region and the bake's
window, 10 Apr to 30 Jul 2026, it returns 635 casts from 59 floats, of which 532 casts from 49
floats carry chlorophyll good enough to draw.

The point of these tests is that absorbing it cost a `ProfileColumns` and a subclass - the same
seam ADR 0009 already exercised with a second Argo provider - and that the QC rules already in
place apply to the new channel per channel, exactly as they do to salinity.
"""

from __future__ import annotations

import numpy as np
import pytest

from samudra.sources.argo import (
    BGC_COLUMNS,
    GDAC_COLUMNS,
    BgcArgoSource,
    parse_profiles,
)

# One cast, four levels. `chla_adjusted` is the delayed-mode value and is preferred where it is
# populated, exactly as `temp_adjusted` is.
BGC = """platform_number,time,latitude,longitude,pres,pres_qc,pres_adjusted,pres_adjusted_qc,temp,temp_qc,temp_adjusted,temp_adjusted_qc,psal,psal_qc,psal_adjusted,psal_adjusted_qc,chla,chla_qc,chla_adjusted,chla_adjusted_qc
,UTC,degrees_north,degrees_east,decibar,,decibar,,degree_Celsius,,degree_Celsius,,PSU,,PSU,,mg/m3,,mg/m3,
1902367,2026-04-10T14:19:48Z,5.21,89.56,5.0,1,5.0,1,29.5,1,29.5,1,33.1,1,33.1,1,0.21,1,0.19,1
1902367,2026-04-10T14:19:48Z,5.21,89.56,25.0,1,25.0,1,29.1,1,29.1,1,33.4,1,33.4,1,0.34,1,0.31,1
1902367,2026-04-10T14:19:48Z,5.21,89.56,60.0,1,60.0,1,27.0,1,27.0,1,34.2,1,34.2,1,0.88,1,0.85,1
1902367,2026-04-10T14:19:48Z,5.21,89.56,150.0,1,150.0,1,18.0,1,18.0,1,35.0,1,35.0,1,0.05,1,0.04,1
1902367,2026-04-10T14:19:48Z,5.21,89.56,400.0,1,400.0,1,11.0,1,11.0,1,35.1,1,35.1,1,0.01,1,0.01,1
"""


def only(profiles):
    assert len(profiles) == 1
    return profiles[0]


def test_a_bgc_cast_carries_chlorophyll_beside_temperature_and_salinity():
    profile = only(parse_profiles(BGC, BGC_COLUMNS))
    assert profile.platform_id == "1902367"
    assert set(profile.values) >= {"temperature", "salinity", "chlorophyll"}
    assert np.isfinite(profile.values["chlorophyll"]).sum() == 5


def test_the_adjusted_chlorophyll_is_preferred_where_it_exists():
    """Same rule as temperature: delayed mode is the better science where it is populated."""
    profile = only(parse_profiles(BGC, BGC_COLUMNS))
    # The adjusted column, not the raw one: 0.19 rather than 0.21 at the top.
    assert profile.values["chlorophyll"][0] == pytest.approx(0.19)


def test_a_condemned_chlorophyll_value_falls_through_to_the_raw_column():
    """Per channel and per variant, which is what keeps one bad flag from costing a level."""
    flagged = BGC.replace("0.21,1,0.19,1", "0.21,1,0.19,4")
    profile = only(parse_profiles(flagged, BGC_COLUMNS))
    assert profile.values["chlorophyll"][0] == pytest.approx(0.21)


def test_a_failed_chlorophyll_sensor_does_not_cost_the_cast_its_temperature():
    """The rule ADR 0008 established for salinity, applied to the new channel."""
    dead = BGC.replace(",0.21,1,0.19,1", ",-99.0,1,-99.0,1").replace(",0.34,1,0.31,1", ",-99.0,1,-99.0,1")
    profile = only(parse_profiles(dead, BGC_COLUMNS))
    assert not np.isfinite(profile.values["chlorophyll"][:2]).any()
    assert np.isfinite(profile.values["temperature"]).all()


def test_chlorophyll_is_refused_above_a_plausible_ceiling():
    """A fluorometer that has failed high reports tens of mg/m3 in open ocean water that never
    exceeds about two. Argo publishes no gross-range test for chlorophyll, so this floor and
    ceiling are ours and are labelled as a judgement in the code."""
    wild = BGC.replace(",0.88,1,0.85,1", ",240.0,1,240.0,1")
    profile = only(parse_profiles(wild, BGC_COLUMNS))
    assert not np.isfinite(profile.values["chlorophyll"][2])


def test_a_layout_that_serves_no_chlorophyll_simply_has_none():
    """The Ifremer core dataset the demo already reads. Absence is a fact about the provider."""
    profile = only(parse_profiles(BGC, GDAC_COLUMNS))
    assert np.isfinite(profile.values["temperature"]).all()
    assert "chlorophyll" not in profile.values


def test_the_request_asks_for_every_chlorophyll_variant_and_its_flag():
    """The bug ADR 0009's update records: a fallback chain whose second link was never fetched."""
    requested = BGC_COLUMNS.request().split(",")
    for name in ("chla", "chla_qc", "chla_adjusted", "chla_adjusted_qc"):
        assert name in requested, f"{name} is declared but never asked for"


def test_the_bgc_source_is_a_registered_provider_reading_its_own_dataset():
    source = BgcArgoSource()
    assert "ArgoFloats-synthetic-BGC" in source.endpoint
    assert source.columns is BGC_COLUMNS
    assert "Argo" in source.attribution
