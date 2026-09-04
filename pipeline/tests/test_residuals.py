"""Where the model most disagrees with the instruments, ranked and mapped.

Every number here is hand-computable on purpose. A ranking is the easiest thing in this project
to get subtly wrong and still ship: a wrong scale factor reorders the list without producing a
single implausible number, and nothing on screen would admit it.
"""

import math

import pytest

from samudra.residuals import (
    BiasCell,
    ResidualEntry,
    bias_grid,
    field_bias,
    positions_from,
    rank_residuals,
)
from samudra.sources.base import BoundingBox

# Two Fields whose raw numbers are not comparable: 27.4 degC against 3.6 PSU. That is the whole
# reason `scaled_rms` exists, and it is why the fixtures below use both.
RANGES = {"temperature": (2.6, 30.0), "salinity": (32.9, 36.5)}

BOX = BoundingBox(south=-10.0, north=25.0, west=45.0, east=100.0)


def collocation(
    platform_id, *, lon, lat, time="2026-07-25T00:00:00+00:00", step=11, kind="float", fields
):
    """One entry shaped exactly as `bake.py` writes it, plus the float that carries its Fix."""
    entry = {
        "kind": kind,
        "timestepIndex": step,
        "time": time,
        "fields": {
            key: {
                "depths": [],
                "observed": [],
                "modelled": [],
                "residual": [],
                "matched": matched,
                "aboveModel": 0,
                "meanResidual": mean,
                "rmsResidual": rms,
            }
            for key, (mean, rms, matched) in fields.items()
        },
    }
    fix = {"lat": lat, "lon": lon, "time": time, "depthMax": 2000.0}
    ocean_float = {
        "id": platform_id,
        "kind": kind,
        "track": [fix],
        "latest": fix,
        "profileCount": 1,
    }
    return platform_id, entry, ocean_float


def build(*rows):
    collocations = {pid: entry for pid, entry, _ in rows}
    floats = [f for _, _, f in rows]
    return collocations, floats


# --------------------------------------------------------------------------------------------
# Ranking
# --------------------------------------------------------------------------------------------


def test_the_worst_disagreement_is_first():
    collocations, floats = build(
        collocation("A", lon=60.0, lat=10.0, fields={"temperature": (0.10, 0.20, 50)}),
        collocation("B", lon=61.0, lat=10.0, fields={"temperature": (-2.00, 2.40, 50)}),
        collocation("C", lon=62.0, lat=10.0, fields={"temperature": (0.50, 0.90, 50)}),
    )
    ranked = rank_residuals(collocations, positions_from(floats, collocations), RANGES)
    assert [e.platform_id for e in ranked] == ["B", "C", "A"]


def test_a_degree_and_a_psu_are_ranked_on_the_same_terms():
    """0.9 PSU is a quarter of salinity's whole range; 0.9 degC is a thirtieth of temperature's.

    Ranked on the raw number they tie. Ranked as a fraction of each Field's own encoded range -
    which is what the Collocation verdict already does - the salinity float is far worse, and
    that is the true statement.
    """
    collocations, floats = build(
        collocation("WARM", lon=60.0, lat=10.0, fields={"temperature": (0.0, 0.90, 50)}),
        collocation("SALT", lon=61.0, lat=10.0, fields={"salinity": (0.0, 0.90, 50)}),
    )
    ranked = rank_residuals(collocations, positions_from(floats, collocations), RANGES)
    assert [e.platform_id for e in ranked] == ["SALT", "WARM"]
    # 0.90 / 3.6 = 0.25 against 0.90 / 27.4 = 0.0328...
    assert ranked[0].scaled_rms == pytest.approx(0.90 / 3.6, rel=1e-9)
    assert ranked[1].scaled_rms == pytest.approx(0.90 / 27.4, rel=1e-9)


def test_one_instrument_carrying_two_fields_yields_two_entries():
    collocations, floats = build(
        collocation(
            "A",
            lon=60.0,
            lat=10.0,
            fields={"temperature": (0.1, 0.2, 50), "salinity": (0.02, 0.05, 50)},
        ),
    )
    ranked = rank_residuals(collocations, positions_from(floats, collocations), RANGES)
    assert sorted(e.field for e in ranked) == ["salinity", "temperature"]
    assert {e.platform_id for e in ranked} == {"A"}


def test_a_field_with_no_range_is_not_ranked_rather_than_ranked_wrongly():
    """Chlorophyll has no model side at all. Without a range there is no scale to rank on."""
    collocations, floats = build(
        collocation("A", lon=60.0, lat=10.0, fields={"chlorophyll": (0.1, 0.2, 50)}),
    )
    assert rank_residuals(collocations, positions_from(floats, collocations), RANGES) == []


def test_nothing_matched_means_nothing_to_rank():
    collocations, floats = build(
        collocation("A", lon=60.0, lat=10.0, fields={"temperature": (0.0, 0.0, 0)}),
    )
    assert rank_residuals(collocations, positions_from(floats, collocations), RANGES) == []


def test_a_missing_statistic_is_skipped_not_read_as_zero():
    """A null RMS is "we could not measure this", and zero is "the model was perfect"."""
    collocations, floats = build(
        collocation("A", lon=60.0, lat=10.0, fields={"temperature": (None, None, 40)}),
    )
    assert rank_residuals(collocations, positions_from(floats, collocations), RANGES) == []


def test_an_instrument_with_no_fix_at_all_is_dropped():
    """No position means it cannot go on a map, and this is a map."""
    collocations, floats = build(
        collocation("A", lon=60.0, lat=10.0, fields={"temperature": (0.1, 0.2, 50)}),
    )
    floats[0]["track"] = []
    floats[0].pop("latest")
    assert positions_from(floats, collocations) == {}
    assert rank_residuals(collocations, {}, RANGES) == []


def test_the_fix_used_is_the_cast_that_was_compared_not_the_newest_one():
    """`choose_cast` may not pick the last dive, and a float moves between dives."""
    pid, entry_, ocean_float = collocation(
        "A",
        lon=60.0,
        lat=10.0,
        time="2026-05-01T00:00:00+00:00",
        fields={"temperature": (0.1, 0.2, 50)},
    )
    ocean_float["track"] = [
        {"lat": 10.0, "lon": 60.0, "time": "2026-05-01T00:00:00+00:00", "depthMax": 2000.0},
        {"lat": 14.0, "lon": 70.0, "time": "2026-07-25T00:00:00+00:00", "depthMax": 2000.0},
    ]
    ocean_float["latest"] = ocean_float["track"][-1]
    positions = positions_from([ocean_float], {pid: entry_})
    assert positions["A"] == (60.0, 10.0)


def test_the_signed_bias_survives_the_ranking():
    """Rank on magnitude, report the sign. Which way round the model read is the finding."""
    collocations, floats = build(
        collocation("COOL", lon=60.0, lat=10.0, fields={"temperature": (-1.5, 1.8, 50)}),
    )
    ranked = rank_residuals(collocations, positions_from(floats, collocations), RANGES)
    assert ranked[0].mean_residual == -1.5
    assert ranked[0].scaled_bias == pytest.approx(-1.5 / 27.4, rel=1e-9)


def test_the_limit_cuts_the_tail_and_keeps_the_head():
    rows = [
        collocation(f"F{i}", lon=60.0 + i, lat=10.0, fields={"temperature": (0.0, i / 10, 50)})
        for i in range(1, 11)
    ]
    collocations, floats = build(*rows)
    ranked = rank_residuals(collocations, positions_from(floats, collocations), RANGES, limit=3)
    assert [e.platform_id for e in ranked] == ["F10", "F9", "F8"]


# --------------------------------------------------------------------------------------------
# The map
# --------------------------------------------------------------------------------------------


def entry(field, lon, lat, mean, rms, platform="X", kind="float"):
    span = RANGES[field][1] - RANGES[field][0]
    return ResidualEntry(
        platform_id=platform,
        kind=kind,
        field=field,
        longitude=lon,
        latitude=lat,
        timestep_index=11,
        time="2026-07-25T00:00:00+00:00",
        mean_residual=mean,
        rms_residual=rms,
        matched=50,
        scaled_bias=mean / span,
        scaled_rms=rms / span,
    )


def test_a_cell_averages_its_instruments_one_vote_each():
    """Weighting by depth count would let one 1000-level float outvote forty shallow ones."""
    cells = bias_grid(
        [
            entry("temperature", 46.0, -9.0, 1.0, 1.0, "A"),
            entry("temperature", 47.0, -8.0, 2.0, 2.0, "B"),
            entry("temperature", 48.0, -7.0, 3.0, 3.0, "C"),
        ],
        "temperature",
        BOX,
        cell_degrees=5.0,
        min_count=3,
    )
    assert len(cells) == 1
    assert cells[0].count == 3
    assert cells[0].mean_bias == pytest.approx(2.0)
    assert cells[0].west == 45.0 and cells[0].south == -10.0


def test_a_cell_with_too_little_behind_it_is_not_drawn_at_all():
    """Refuse rather than guess. Two floats is not a basin-wide statement."""
    cells = bias_grid(
        [
            entry("temperature", 46.0, -9.0, 1.0, 1.0, "A"),
            entry("temperature", 47.0, -8.0, 2.0, 2.0, "B"),
        ],
        "temperature",
        BOX,
        cell_degrees=5.0,
        min_count=3,
    )
    assert cells == []


def test_opposite_biases_in_one_cell_average_towards_zero_and_the_spread_says_so():
    """A cell reading zero because nothing disagreed and one reading zero because two large
    disagreements cancelled are different findings, so both figures are carried."""
    cells = bias_grid(
        [
            entry("temperature", 46.0, -9.0, 2.0, 2.0, "A"),
            entry("temperature", 47.0, -8.0, -2.0, 2.0, "B"),
            entry("temperature", 48.0, -7.0, 0.0, 0.0, "C"),
        ],
        "temperature",
        BOX,
        cell_degrees=5.0,
        min_count=3,
    )
    assert cells[0].mean_bias == pytest.approx(0.0)
    assert cells[0].mean_abs_bias == pytest.approx(4.0 / 3)


def test_cells_are_ranked_by_how_far_the_model_sat_from_the_instruments():
    cells = bias_grid(
        [entry("temperature", 46.0, -9.0, 0.1, 0.1, f"a{i}") for i in range(3)]
        + [entry("temperature", 51.0, -9.0, -3.0, 3.0, f"b{i}") for i in range(3)],
        "temperature",
        BOX,
        cell_degrees=5.0,
        min_count=3,
    )
    assert [c.west for c in cells] == [50.0, 45.0]


def test_a_point_outside_the_region_is_not_binned():
    cells = bias_grid(
        [entry("temperature", 120.0, -9.0, 3.0, 3.0, f"a{i}") for i in range(3)],
        "temperature",
        BOX,
        cell_degrees=5.0,
        min_count=3,
    )
    assert cells == []


def test_the_grid_only_ever_sees_one_field():
    cells = bias_grid(
        [
            entry("temperature", 46.0, -9.0, 1.0, 1.0, "A"),
            entry("salinity", 46.5, -9.0, 9.0, 9.0, "B"),
            entry("temperature", 47.0, -8.0, 3.0, 3.0, "C"),
            entry("temperature", 48.0, -7.0, 2.0, 2.0, "D"),
        ],
        "temperature",
        BOX,
        cell_degrees=5.0,
        min_count=3,
    )
    assert cells[0].count == 3
    assert cells[0].mean_bias == pytest.approx(2.0)


def test_the_northern_edge_of_the_region_still_lands_in_a_cell():
    """25 N is the region's north edge, so the last row falls off the end of a naive floor()."""
    cells = bias_grid(
        [entry("temperature", 99.9, 25.0, 1.0, 1.0, f"a{i}") for i in range(3)],
        "temperature",
        BOX,
        cell_degrees=5.0,
        min_count=3,
    )
    assert len(cells) == 1
    assert cells[0].south == 20.0 and cells[0].west == 95.0


# --------------------------------------------------------------------------------------------
# The one-line summary
# --------------------------------------------------------------------------------------------


def test_the_summary_is_the_plain_average_over_every_instrument():
    summary = field_bias(
        [
            entry("temperature", 46.0, -9.0, 1.0, 1.0, "A"),
            entry("temperature", 47.0, -8.0, -3.0, 3.0, "B"),
        ],
        "temperature",
    )
    assert summary.count == 2
    assert summary.mean_bias == pytest.approx(-1.0)
    assert summary.mean_abs_bias == pytest.approx(2.0)
    # RMS over the instruments, not the mean of their RMS values.
    assert summary.rms == pytest.approx(math.sqrt((1.0 + 9.0) / 2))


def test_a_field_nothing_measured_summarises_to_nothing():
    assert field_bias([], "temperature") is None


def test_the_cell_knows_the_box_it_averaged_over():
    cell = BiasCell(
        south=0.0,
        west=60.0,
        cell_degrees=5.0,
        count=4,
        mean_bias=0.5,
        mean_abs_bias=0.7,
        rms=0.8,
    )
    assert cell.north == 5.0 and cell.east == 65.0


def test_the_summary_carries_the_ninetieth_percentile_the_map_colours_by():
    """The scale the bias map saturates at, and the reason it is not the verdict threshold.

    Saturating at "large disagreement" - 1.5 degC of a 27.4 degC range - put the median
    instrument at 2% of the way along the palette and the whole map rendered white. Ten values,
    so the nearest-rank ninetieth percentile is the ninth of them.
    """
    rows = [
        entry("temperature", 46.0 + i, -9.0, (i + 1) / 10, (i + 1) / 10, f"f{i}")
        for i in range(10)
    ]
    summary = field_bias(rows, "temperature")
    span = RANGES["temperature"][1] - RANGES["temperature"][0]
    assert summary.p90_scaled_abs == pytest.approx(0.9 / span, rel=1e-9)


def test_the_percentile_ignores_the_sign_because_a_colour_scale_has_two_ends():
    rows = [
        entry("temperature", 46.0, -9.0, -2.0, 2.0, "cool"),
        entry("temperature", 47.0, -8.0, 0.1, 0.1, "a"),
        entry("temperature", 48.0, -7.0, 0.1, 0.1, "b"),
    ]
    span = RANGES["temperature"][1] - RANGES["temperature"][0]
    assert field_bias(rows, "temperature").p90_scaled_abs == pytest.approx(2.0 / span, rel=1e-9)


# --------------------------------------------------------------------------------------------
# The two disciplines that keep the ranking and the summary honest
# --------------------------------------------------------------------------------------------


def test_a_truncated_argo_cast_is_not_ranked_worst_in_the_basin_on_three_depths():
    """The failure this exists to stop: a float ranked worst on a cast that barely happened.

    Twenty depths for a float, because an Argo cast reports at a median 221 of this model's
    levels and one that matched three is a truncated dive rather than a finding.
    """
    collocations, floats = build(
        collocation("SHALLOW", lon=60.0, lat=10.0, fields={"temperature": (5.0, 5.0, 3)}),
        collocation("REAL", lon=61.0, lat=10.0, fields={"temperature": (0.5, 0.9, 200)}),
    )
    ranked = rank_residuals(
        collocations,
        positions_from(floats, collocations),
        RANGES,
        min_matched={"float": 20},
    )
    assert [e.platform_id for e in ranked] == ["REAL"]


def test_a_moored_buoy_keeps_its_nine_sensors_where_a_float_would_be_refused():
    """A buoy carries a handful of sensors on a wire. Nine is the whole instrument, not a stub.

    One flat threshold either keeps the truncated float casts or deletes every buoy, and the
    buoys are the only instruments in this bake INCOIS's analysis did not assimilate.
    """
    collocations, floats = build(
        collocation("BUOY", lon=60.0, lat=10.0, kind="mooring", fields={"temperature": (0.8, 0.9, 9)}),
        collocation("STUB", lon=61.0, lat=10.0, fields={"temperature": (0.8, 0.9, 9)}),
    )
    ranked = rank_residuals(
        collocations,
        positions_from(floats, collocations),
        RANGES,
        min_matched={"float": 20, "mooring": 1},
    )
    assert [e.platform_id for e in ranked] == ["BUOY"]


def test_the_summary_can_be_asked_for_one_kind_of_instrument():
    """The whole point of the split: nine unassimilated buoys do not vanish into 224 floats.

    Three floats sitting at 0.10 degC and one buoy at 1.00 degC. Pooled the mean magnitude is
    0.325 degC, which is mostly a statement about the floats; the buoy on its own says 1.00.
    """
    rows = [
        entry("temperature", 60.0, 10.0, 0.10, 0.10, "f1"),
        entry("temperature", 61.0, 10.0, 0.10, 0.10, "f2"),
        entry("temperature", 62.0, 10.0, 0.10, 0.10, "f3"),
        entry("temperature", 63.0, 10.0, 1.00, 1.00, "b1", kind="mooring"),
    ]
    assert field_bias(rows, "temperature").mean_abs_bias == pytest.approx(0.325)
    assert field_bias(rows, "temperature", kind="float").mean_abs_bias == pytest.approx(0.10)
    buoys = field_bias(rows, "temperature", kind="mooring")
    assert buoys.count == 1
    assert buoys.mean_abs_bias == pytest.approx(1.00)


def test_a_kind_nothing_reported_is_none_rather_than_a_zero():
    rows = [entry("temperature", 60.0, 10.0, 0.10, 0.10, "f1")]
    assert field_bias(rows, "temperature", kind="mooring") is None
