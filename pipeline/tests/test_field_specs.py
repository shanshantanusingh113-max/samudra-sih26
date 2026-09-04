"""Which Fields may be cut by an isosurface, asserted across every declaration at once.

`FieldSpec.isosurface` is the only thing standing between a reader and a surface of constant
value drawn through a quantity that has none worth looking at. It defaults to True, so a Field
that should refuse one refuses it by *remembering* to say so - and one of the fourteen had
forgotten. `incois_rmse` is the easiest to miss, because it is the one that looks most like
temperature: a smooth continuous field in degrees on exactly the same grid.

A surface of constant value is a real object in a continuous field - an isotherm, an isohaline,
an isopycnal, or the skin around water the two analyses disagree about by more than X. It is not
a real object in a count of casts, which steps in whole numbers so the surface traces the
boundary between "1" and "2" as a wall of flat slabs; nor in a published error estimate, which
draws a mess of disconnected blobs around the thermocline and teaches nothing; nor in a Field
that is not a Volume at all, where there is no water to cut.

Held in one file rather than in each adapter's own test because the rule is about the whole set:
"which Fields offer an isosurface" has one answer, and it is checked against every declaration
the bake can reach rather than against whichever adapter is being edited. Every spec here is a
module-level constant, so nothing in this file touches the network.
"""

from __future__ import annotations

from samudra.bake import (
    ANOMALY_FIELD,
    COVERAGE_FIELD,
    DENSITY_FIELD,
    HAZARD_FIELDS,
    SPREAD_FIELD,
)
from samudra.sources.base import FieldSpec
from samudra.sources.copernicus import CopernicusCurrentsSource
from samudra.sources.incois import IncoisErddapSource, IncoisMcCrearySource

# Every Field whose isosurface is a real object, and what that object is called. Anything not
# named here must refuse one. The names are the ones `web/src/guide.ts` prints, so a Field
# arriving here without an entry there would be offering a surface with no explanation.
ISOSURFACE_IS_MEANINGFUL = {
    "temperature": "isotherm",
    "salinity": "isohaline",
    "density": "isopycnal",
    "temperature_anomaly": "contour of departure",
    "analysis_spread": "contour of disagreement",
}


def all_specs() -> list[FieldSpec]:
    """Every FieldSpec the bake can put in the manifest."""
    return [
        *IncoisErddapSource().fields(),
        *IncoisMcCrearySource().fields(),
        *CopernicusCurrentsSource().fields(),
        DENSITY_FIELD,
        ANOMALY_FIELD,
        SPREAD_FIELD,
        COVERAGE_FIELD,
        *HAZARD_FIELDS,
    ]


def selectable() -> list[FieldSpec]:
    """The Fields a user can pick, which is every one above bar the ones only used internally.

    `mccreary_temperature` is fetched to be differenced against the Variational analysis and is
    never offered on its own, so it carries no group.
    """
    return [spec for spec in all_specs() if spec.group]


def test_exactly_the_five_continuous_fields_offer_an_isosurface():
    offered = {spec.key for spec in selectable() if spec.isosurface}
    assert offered == set(ISOSURFACE_IS_MEANINGFUL)


def test_the_published_error_estimate_refuses_one():
    """Regression: `incois_rmse` shipped with the True default and drew blobs nobody asked for."""
    rmse = next(spec for spec in all_specs() if spec.key == "incois_rmse")
    assert rmse.isosurface is False


def test_no_field_that_is_not_a_volume_offers_one():
    """There is no water to cut through a sheet, a drape or a set of arrows."""
    for spec in selectable():
        if (spec.render or "volume") != "volume":
            assert spec.isosurface is False, spec.key


def test_every_field_key_is_unique():
    keys = [spec.key for spec in all_specs()]
    assert len(keys) == len(set(keys))


def test_every_selectable_field_is_in_one_of_the_five_groups():
    """A Field with a group the panel does not know about gets no button at all."""
    groups = {"state", "hazard", "circulation", "evidence", "change"}
    for spec in selectable():
        assert spec.group in groups, (spec.key, spec.group)
