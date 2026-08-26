"""Argo's own quality flags, and the fallback chain that could not fire without them.

ADR 0008 describes this platform's salinity floor as *stricter* than the Argo standard. That was
true of the gross range check and it quietly implied the rest of Argo's tests were running. They
were not: the request asked for values and never for the `_qc` columns beside them, so a sensor
the Argo programme had already condemned arrived looking exactly like a good one.

The second half is the same mistake seen from the other side. `ProfileColumns` declares
`pressure=("pres_adjusted", "pres")` - prefer the delayed-mode value, fall back to the raw one -
but the request was a hand-written string that only ever asked for the adjusted columns, so the
fallback list had one entry and the "chain" could not fire for the provider the demo reads.
"""

from __future__ import annotations

import numpy as np
import pytest

from samudra.sources.argo import (
    GDAC_COLUMNS,
    INCOIS_COLUMNS,
    ArgoErddapSource,
    IncoisArgoSource,
    parse_profiles,
)

HEAD = (
    "platform_number,time,latitude,longitude,"
    "pres_adjusted,pres_adjusted_qc,pres,pres_qc,"
    "temp_adjusted,temp_adjusted_qc,temp,temp_qc,"
    "psal_adjusted,psal_adjusted_qc,psal,psal_qc\n"
    ",UTC,degrees_north,degrees_east,"
    "decibar,,decibar,,degree_Celsius,,degree_Celsius,,PSU,,PSU,\n"
)


def cast(rows: list[str]) -> str:
    return HEAD + "".join(rows)


def row(pressure, temp, temp_qc, psal, psal_qc, *, pres_qc="1", raw_temp="", raw_temp_qc=""):
    return (
        f"1900001,2026-06-09T20:58:41Z,3.87,80.22,"
        f"{pressure},{pres_qc},{pressure},{pres_qc},"
        f"{temp},{temp_qc},{raw_temp},{raw_temp_qc},"
        f"{psal},{psal_qc},,\n"
    )


def only(text):
    profiles = parse_profiles(text, GDAC_COLUMNS)
    assert len(profiles) == 1
    return profiles[0]


# ---------------------------------------------------------------- what gets asked for

def test_the_request_asks_for_every_variant_the_layout_declares():
    """The chain is only a chain if the raw columns are actually fetched."""
    asked = ArgoErddapSource().requested.split(",")
    for variant in (*GDAC_COLUMNS.pressure, *GDAC_COLUMNS.temperature, *GDAC_COLUMNS.salinity):
        assert variant in asked, f"{variant} is declared but never requested"


def test_the_request_asks_for_the_quality_flag_beside_every_value():
    asked = ArgoErddapSource().requested.split(",")
    for variant in (*GDAC_COLUMNS.temperature, *GDAC_COLUMNS.salinity):
        assert f"{variant}_qc" in asked, f"{variant} is requested without its flag"


def test_a_provider_with_upper_case_columns_gets_upper_case_flags():
    asked = IncoisArgoSource().requested.split(",")
    assert "TEMP_ADJUSTED_QC" in asked
    assert "PSAL_QC" in asked
    assert "TEMP_QC" in asked


def test_the_request_never_repeats_a_column():
    asked = ArgoErddapSource().requested.split(",")
    assert len(asked) == len(set(asked))


# ---------------------------------------------------------------- what gets rejected

@pytest.mark.parametrize("flag", ["3", "4", "9"])
def test_a_condemned_measurement_is_dropped(flag):
    """Argo flag 3 is probably bad, 4 is bad, 9 is missing. None of them is data."""
    text = cast([row(5.0 + 10 * i, 29.0, flag, 35.0, "1") for i in range(6)])
    assert np.isnan(only(text).values["temperature"]).all()


@pytest.mark.parametrize("flag", ["1", "2", "5", "8"])
def test_a_flag_that_is_not_a_rejection_is_kept(flag):
    """2 is probably good, 5 is a changed value, 8 is interpolated. All usable."""
    text = cast([row(5.0 + 10 * i, 29.0, flag, 35.0, "1") for i in range(6)])
    assert np.isfinite(only(text).values["temperature"]).all()


def test_a_bad_flag_on_one_channel_leaves_the_other_alone():
    """A failed salinity sensor must not cost the cast its perfectly good temperature - the same
    rule the plausible-range check already follows."""
    text = cast([row(5.0 + 10 * i, 29.0, "1", 35.0, "4") for i in range(6)])
    profile = only(text)
    assert np.isfinite(profile.values["temperature"]).all()
    assert np.isnan(profile.values["salinity"]).all()


def test_a_condemned_adjusted_value_falls_through_to_the_raw_one():
    """The chain firing, at last. Delayed mode flagged the adjusted value bad; the raw column
    beside it is flagged good and carries a number."""
    text = cast(
        [
            row(5.0 + 10 * i, 29.0, "4", 35.0, "1", raw_temp="28.5", raw_temp_qc="1")
            for i in range(6)
        ]
    )
    assert only(text).values["temperature"] == pytest.approx(28.5)


def test_it_does_not_fall_through_to_a_raw_value_that_is_also_condemned():
    text = cast(
        [
            row(5.0 + 10 * i, 29.0, "4", 35.0, "1", raw_temp="28.5", raw_temp_qc="4")
            for i in range(6)
        ]
    )
    assert np.isnan(only(text).values["temperature"]).all()


def test_a_provider_serving_no_flags_at_all_still_parses():
    """Backward compatibility is not optional: a provider that omits the flag columns is not
    thereby serving nothing."""
    plain = (
        "platform_number,time,latitude,longitude,pres_adjusted,temp_adjusted,psal_adjusted\n"
        ",UTC,degrees_north,degrees_east,decibar,degree_Celsius,PSU\n"
    ) + "".join(
        f"1900001,2026-06-09T20:58:41Z,3.87,80.22,{5.0 + 10 * i},29.0,35.0\n" for i in range(6)
    )
    profile = only(plain)
    assert np.isfinite(profile.values["temperature"]).all()


def test_a_flagged_pressure_drops_the_level_entirely():
    """Depth is the axis the whole Collocation is aligned on. A pressure Argo does not stand
    behind is not a level, whatever the thermometer said."""
    rows = [row(5.0 + 10 * i, 29.0, "1", 35.0, "1") for i in range(6)]
    rows.append(row(500.0, 9.0, "1", 35.0, "1", pres_qc="4"))
    profile = only(cast(rows))
    assert len(profile) == 6
    assert profile.depths.max() < 200
