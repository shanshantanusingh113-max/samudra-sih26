"""The glider Source Adapter, and the finding it produces.

PS 26067 names gliders three times - in the gaps it lists, in the core requirements and in the
dataset links - so "not built" is the wrong answer to give three times. The adapter reads
`ftp://ftp.ifremer.fr/ifremer/glider/v2/`, which is the archive the PS itself names.

What it finds is the point. Scanned against the complete 824,632-profile global index on
2026-09-01: **one glider in India's waters, two deployments, 2,876 profiles, newest cast
2022-10-14, and nothing at all in 2023 to 2026.** The gap is India's glider programme, not this
platform's ability to read one, and that is a far stronger sentence than a promise.

These tests hold the index parser, because the finding is only worth anything if it is
reproducible - and hold the region filter, because an off-by-one in a longitude comparison would
turn "one glider" into "none" and nobody would notice.
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from samudra.sources.base import BoundingBox
from samudra.sources.glider import (
    GliderSource,
    deployments_in,
    parse_index,
    scan_index,
)


HEADER = [
    "# Title : Profile directory file of the Gliders.",
    "# Date of update : 20260901063748",
    "# FTP root number 1 : ftp://ftp.ifremer.fr/ifremer/glider/v2",
    "# GDAC node : EGO GDAC",
    "file,wmo,date,latitude,longitude,pressure_max,n_levels,parameter,ocean,"
    "date_update,gdac_date_creation,gdac_date_update",
]

PARAMS = "MTIME/TEMP/CNDC/PRES/PSAL/CHLA/DOXY"

ARABIAN = (
    "/sea057/sea057_20220707/profiles/R2801950_20220707_002.nc,2801950,20220707051638,"
    f"24.001,57.693,294.7,34,{PARAMS},I,20241009095725,20221015010214,20241011125743"
)
ARABIAN_LATER = (
    "/sea057/sea057_20220707/profiles/R2801950_20221014_900.nc,2801950,20221014120000,"
    f"23.500,58.100,819.0,120,{PARAMS},I,20241009095725,20221015010214,20241011125743"
)
EARLIER_DEPLOYMENT = (
    "/sea057/sea057_20220128/profiles/R2801950_20211120_001.nc,2801950,20211120031500,"
    f"22.900,58.400,818.0,110,{PARAMS},I,20241009095725,20221015010214,20241011125743"
)
NORTH_SEA = (
    "/lovuse002/lovuse002_20140101/profiles/R6801234_20140101_001.nc,6801234,20140101000000,"
    f"58.100,3.200,90.0,44,{PARAMS},A,20241009095725,20221015010214,20241011125743"
)
BAD_ROW = "/broken/one.nc,notawmo,,,,,,,,,,"


DEMO = BoundingBox(south=-10.0, north=25.0, west=45.0, east=100.0)


def index(*rows):
    return HEADER + list(rows)


# ----------------------------------------------------------------- parsing


def test_the_header_is_skipped_and_a_row_becomes_a_cast():
    entries = parse_index(index(ARABIAN))
    assert len(entries) == 1
    entry = entries[0]
    assert entry.wmo == "2801950"
    assert entry.deployment == "sea057/sea057_20220707"
    assert entry.time == datetime(2022, 7, 7, 5, 16, 38, tzinfo=timezone.utc)
    assert entry.latitude == pytest.approx(24.001)
    assert entry.longitude == pytest.approx(57.693)
    assert entry.pressure_max == pytest.approx(294.7)
    assert entry.levels == 34
    assert "TEMP" in entry.parameters and "PSAL" in entry.parameters


def test_a_row_that_cannot_be_read_is_dropped_rather_than_stopping_the_scan():
    """824,641 lines of somebody else's archive. One malformed row must not cost the finding."""
    entries = parse_index(index(ARABIAN, BAD_ROW, NORTH_SEA))
    assert [e.wmo for e in entries] == ["2801950", "6801234"]


def test_the_column_order_is_read_from_the_header_and_not_assumed():
    """The EGO index declares its own columns. Positional parsing would break silently the day
    they add one, and the failure would look like an empty ocean."""
    reordered = [
        "# Date of update : 20260901063748",
        "wmo,file,latitude,longitude,date,pressure_max,n_levels,parameter",
        f"2801950,/sea057/sea057_20220707/profiles/a.nc,24.001,57.693,20220707051638,294.7,34,{PARAMS}",
    ]
    entry = parse_index(reordered)[0]
    assert entry.wmo == "2801950"
    assert entry.time.year == 2022
    assert entry.latitude == pytest.approx(24.001)


# ----------------------------------------------------------------- the region scan


def test_only_casts_inside_the_region_are_kept():
    found = scan_index(index(ARABIAN, NORTH_SEA), DEMO)
    assert [e.wmo for e in found] == ["2801950"]


def test_the_old_western_edge_would_still_have_found_this_glider():
    """Sanity: the 45 E widening is about currents, not about gliders. If moving the edge
    changed the glider finding, the finding was about the box and not about the ocean."""
    narrow = BoundingBox(south=-10.0, north=25.0, west=55.0, east=100.0)
    assert len(scan_index(index(ARABIAN, NORTH_SEA), narrow)) == 1


# ----------------------------------------------------------------- the finding


def test_deployments_are_grouped_with_their_own_span_and_channels():
    found = scan_index(index(EARLIER_DEPLOYMENT, ARABIAN, ARABIAN_LATER, NORTH_SEA), DEMO)
    summary = deployments_in(found)

    assert [d.name for d in summary] == ["sea057/sea057_20220128", "sea057/sea057_20220707"]
    later = summary[-1]
    assert later.casts == 2
    assert later.first.date() == datetime(2022, 7, 7).date()
    assert later.last.date() == datetime(2022, 10, 14).date()
    assert later.max_pressure == pytest.approx(819.0)
    assert later.wmo == "2801950"
    assert "TEMP" in later.parameters and "CHLA" in later.parameters


def test_a_window_the_archive_cannot_reach_returns_nothing_and_says_so():
    """The bake window is 2026. The newest glider cast in this box is 2022-10-14.

    An adapter that answers an impossible question with an empty list and no explanation is how a
    dead data source gets mistaken for a working one.
    """
    source = GliderSource(index_lines=index(EARLIER_DEPLOYMENT, ARABIAN, ARABIAN_LATER))
    got = source.fetch_profiles(
        DEMO,
        datetime(2026, 4, 1, tzinfo=timezone.utc),
        datetime(2026, 7, 30, tzinfo=timezone.utc),
    )
    assert got == []
    assert source.last_finding is not None
    assert source.last_finding["castsInRegion"] == 3
    assert source.last_finding["castsInWindow"] == 0
    assert source.last_finding["newestCast"].startswith("2022-10-14")
    assert source.last_finding["gliders"] == 1


def test_the_seam_carries_it():
    """The claim PS 26067 asks for - a new observational stream without re-engineering - is only
    worth anything if the new class satisfies the same Protocol as the existing four."""
    from samudra.sources.base import ProfileSource

    assert isinstance(GliderSource(index_lines=index(ARABIAN)), ProfileSource)
