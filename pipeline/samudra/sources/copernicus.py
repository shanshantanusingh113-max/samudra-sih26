"""Source Adapter for Copernicus Marine's near-real-time global analysis: current vectors.

This is the adapter that turns currents from a picture into numbers, and it supersedes ADR 0011.
ADR 0013 carries the decision; the short version is that three earlier attempts failed for good
reasons and this one was held to the same bar and passed.

- INCOIS publish geostrophic currents in `incois_valueadded_products_datasets`, properly derived
  and validated, and that series **stops at 2019-03-30** against an analysis running to
  2026-07-30. It cannot share this timeline.
- Deriving our own by thermal wind was prototyped and rejected on measurement: **0.16 m/s** for
  the Somali Current at the height of the southwest monsoon against a real 1.5 to 2.5, and the
  fastest water in the block sitting on the equator, where geostrophy does not hold. ADR 0010.
- Copernicus's own values are not anonymous - measured, the Zarr store answers 200 for
  `.zmetadata` and every coordinate array and **403** for `uo` and `vo`. Only their WMTS is
  anonymous, which is why this layer was a rendered image.

What changed is that a Copernicus Marine account is free and now exists, and the credential
lives in the **bake**, never in the browser. Nothing a visitor does needs an account; rebuilding
the data does. That is the whole cost, and it is stated on the provenance page rather than
buried.

**The measurement that settles it**, on 2026-07-30, our last Timestep, with our own credentials:
the fastest surface water in the block is **2.94 m/s at 9.5 N, 51.5 E** on the model's own grid
nodes. Right place - that is the Somali Current core - right magnitude, and faster in late July
than in June because that is when the monsoon peaks. The rejected geostrophic field gave 0.16 in
the wrong place. This is the same test, passed.

Which product, and why not the one the PS names
-----------------------------------------------
The PS names `GLOBAL_MULTIYEAR_PHY_001_030`, the reanalysis. It **ends 2026-06-23** and would
leave four of this bake's twelve Timesteps with no currents at all. The near-real-time analysis
and forecast product covers the whole window and is the same product family already behind the
baked current-picture overlay, so nothing becomes inconsistent. The reanalysis stays the right
choice for any historical work, 1993 to 2026.

Putting a 1/12 degree product on a 1 degree grid
------------------------------------------------
Copernicus publishes at 1/12 degree, twelve times finer than INCOIS. The adapter's job includes
landing it on the axes the rest of the platform uses, and it does that by **taking the value at
the nearest source node to each model node**, not by averaging the twelve-by-twelve block around
it. Averaging is the obvious choice and it is wrong here: a western boundary current is a jet
about two degrees wide, and box-averaging it reports a current that is real nowhere. Nearest
gives a value that the source actually published at a place 0.04 degrees away.

Depth is nearest too, and worth stating: the model's "5 m" Level carries Copernicus's 5.08 m
value, its "50 m" carries 47.37 m. Both are inside the vertical resolution of either product.
"""

from __future__ import annotations

from datetime import datetime, timezone
from functools import lru_cache
from typing import Sequence

import numpy as np

from ..grid import Grid
from .base import BoundingBox, FieldSpec

# The near-real-time analysis and forecast. Verified with our own credentials on 2026-09-01 at
# 2026-07-30, this bake's last Timestep.
DATASET = "cmems_mod_glo_phy-cur_anfc_0.083deg_P1D-m"

ATTRIBUTION = (
    "E.U. Copernicus Marine Service Information - Global Ocean Physics Analysis and Forecast "
    "(GLOBAL_ANALYSISFORECAST_PHY_001_024), horizontal current velocity at 1/12 degree. "
    "Read with a free Copernicus Marine account at bake time; no account is needed to view or "
    "use this platform."
)

# Fetched a little wider than the region so a nearest-node lookup at the very edge still has a
# source node on both sides of it.
_HALO_DEGREES = 1.0

_FIELDS = (
    FieldSpec(
        key="current_speed",
        label="Current Speed",
        units="m/s",
        palette="speed",
        display_min=0.0,
        display_max=1.5,
        emphasis=0.0,
        # A fifth of what every other Field asks for, and measured rather than chosen.
        #
        # Currents are surface-intensified - fast at 5 m, near nothing by 300 m - so the ray march
        # finds a thin slab of fast water near the top of the block and saturates on it. That is
        # what reads as a curtain rather than as water. Measured at 1400x800 inside the block,
        # against the same frame with the volume off:
        #
        #   opacity   frame covered   fully saturated   mean colour depth   arrows still visible
        #   0.05      27.49%          20.43%            213.5/255           0.463%
        #   0.01      27.43%          10.50%            181.3/255           0.543%
        #
        # The covered area is the same, because that is the shape of the block; what changes is
        # that half the saturated area stops being a solid wall, and the arrows gain 17%. The
        # arrows are the quantity here and the water is the setting, so the water gives way.
        #
        # The arrows were never *hidden* - an earlier measurement said they were, and it was
        # wrong: `updateArrows` re-shows them on any `push(state)`, so a store change between a
        # paired screenshot and its partner silently turned them back on. Anything measuring this
        # must move only the `visible` flag between the two frames.
        opacity=0.01,
        isosurface=False,
        render="vector",
        group="circulation",
        description=(
            "How fast the water is moving, and which way. Arrows sit on the depth you have "
            "sliced to and point the way the water goes; the colour is speed. Copernicus "
            "Marine's own analysis, at twelve times the horizontal resolution of the INCOIS "
            "grid, read at the nearest source node to each model node."
        ),
    ),
)


class CopernicusCurrentsSource:
    """Reads `uo` and `vo` from Copernicus Marine. Needs stored credentials at bake time."""

    name = "Copernicus Marine"
    attribution = ATTRIBUTION
    dataset = DATASET
    endpoint = f"data.marine.copernicus.eu/{DATASET}"

    def fields(self) -> Sequence[FieldSpec]:
        return _FIELDS

    def timesteps(self) -> Sequence[datetime]:
        return _time_axis()

    def fetch_grid(self, field_key: str, timestep: datetime, bbox: BoundingBox) -> Grid:
        """One velocity component on Copernicus's own axes, so the seam's contract is honoured.

        The bake does not use this - it wants both components on the model's axes and would pay
        for the region twice - but a GridSource that cannot serve a Grid is not a GridSource, and
        the API's adapter registry can hand this straight to the CF and OPeNDAP writers.
        """
        variable = {"current_u": "uo", "current_v": "vo"}[field_key]
        subset = _open(bbox, timestep)
        return Grid(
            levels=subset["depth"].values.astype(float),
            latitudes=subset["latitude"].values.astype(float),
            longitudes=subset["longitude"].values.astype(float),
            values=subset[variable].values.astype(float),
        )

    def fetch_on_axes(
        self,
        timestep: datetime,
        bbox: BoundingBox,
        levels: np.ndarray,
        latitudes: np.ndarray,
        longitudes: np.ndarray,
    ) -> tuple[Grid, Grid]:
        """Eastward and northward velocity on the model's own axes, as two Grids.

        Nearest node in all three dimensions - see the module docstring for why averaging is the
        wrong answer for a jet two degrees wide.
        """
        subset = _open(bbox, timestep).sel(
            depth=np.asarray(levels, dtype=float),
            latitude=np.asarray(latitudes, dtype=float),
            longitude=np.asarray(longitudes, dtype=float),
            method="nearest",
        )
        return (
            Grid(
                levels=np.asarray(levels, dtype=float),
                latitudes=np.asarray(latitudes, dtype=float),
                longitudes=np.asarray(longitudes, dtype=float),
                values=subset["uo"].values.astype(float),
            ),
            Grid(
                levels=np.asarray(levels, dtype=float),
                latitudes=np.asarray(latitudes, dtype=float),
                longitudes=np.asarray(longitudes, dtype=float),
                values=subset["vo"].values.astype(float),
            ),
        )


def speed(u: Grid, v: Grid) -> Grid:
    """Current speed from the two components, on the axes they share.

    A separate Field from the components because it is what a reader wants a colour for, and
    because a magnitude is the only part of a vector a scalar Volume can honestly carry. The
    direction is not thrown away - it is drawn as arrows, from the components, which is the only
    place a direction can be read without lying about it.
    """
    return Grid(
        levels=u.levels,
        latitudes=u.latitudes,
        longitudes=u.longitudes,
        values=np.hypot(u.values, v.values),
    )


def _open(bbox: BoundingBox, timestep: datetime):
    """One day of `uo` and `vo` over the region, already reduced to a single time step.

    `copernicusmarine` is imported here rather than at module scope. It pulls in 47 packages and
    a machine that only runs the API or the tests should never load them; a bake that needs
    currents will.
    """
    import copernicusmarine as cm

    day = timestep.strftime("%Y-%m-%d")
    dataset = cm.open_dataset(
        dataset_id=DATASET,
        minimum_longitude=bbox.west - _HALO_DEGREES,
        maximum_longitude=bbox.east + _HALO_DEGREES,
        minimum_latitude=bbox.south - _HALO_DEGREES,
        maximum_latitude=bbox.north + _HALO_DEGREES,
        start_datetime=day,
        end_datetime=day,
        variables=["uo", "vo"],
    )
    return dataset.isel(time=0)


@lru_cache(maxsize=1)
def _time_axis() -> tuple[datetime, ...]:
    import copernicusmarine as cm

    dataset = cm.open_dataset(dataset_id=DATASET, variables=["uo"])
    return tuple(
        datetime.utcfromtimestamp(int(t) / 1e9).replace(tzinfo=timezone.utc)
        for t in dataset["time"].values.astype("datetime64[ns]").astype("int64")
    )
