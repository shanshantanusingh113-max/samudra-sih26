"""Source Adapter for the World Ocean Atlas 2023: the 1991-2020 climatological normal.

PS 26067 names **climate monitoring** among the four operational mandates it says a missing 3D
platform impedes. The platform's existing Temperature Anomaly is a departure from the mean of
the twelve baked Timesteps - a seasonal swing, and it says so - so "warmer than usual" did not
yet mean what a forecaster means by it. This is the reference that fixes that.

**Why this fits and dissolved oxygen did not.** ADR 0010 refused oxygen because the only field
for this region was a decadal climatology with no date, and a value with no date cannot share a
ten-day 2026 timeline. That is the right rule for a *value* and the wrong one for a *baseline*:
a climatology having no year is exactly what makes it a climatology. WOA is never drawn as a
value here. It is the thing the 2026 analysis is differenced against.

**Measured, not assumed.** On 2026-09-02 from this machine, both routes answered anonymously:

    thredds-ocean/dodsC/woa23/.../woa23_decav91C0_t07_01.nc.dds   HTTP 200, 2,840 bytes, 1.53 s
    data/oceans/woa/WOA23/.../woa23_decav91C0_t07_01.nc           HTTP 206 on a range request

The OPeNDAP route is the one used, because it is the one that lets a **subset** be asked for.
The global 1-degree monthly field is 180 x 360 x 57; this region is 36 x 56 x 57, about 1.5% of
it, and pulling the whole file for twelve months would be hundreds of megabytes for four.

**The grids line up exactly.** WOA's one-degree nodes are at -89.5, -88.5 ... and 45.5, 46.5 ...
which are the same node centres INCOIS's analysis uses. That is not a happy accident - both
follow the same convention - and it is the entire reason this Field is cheap: no horizontal
regridding, so no chance of quietly differencing two different pieces of water.
`climatology.climatological_anomaly` refuses outright if the axes ever stop matching.
"""

from __future__ import annotations

from datetime import datetime, timezone
from functools import lru_cache

import numpy as np

from ..grid import Grid
from .base import BoundingBox, FieldSpec

#: The 1991-2020 normal, on a one-degree grid, monthly. `decav91C0` is NOAA's own name for that
#: averaging period; `01` in the filename is the grid resolution, not the month.
DECADE = "decav91C0"
RESOLUTION = "1.00"
ROOT = "https://www.ncei.noaa.gov/thredds-ocean/dodsC/woa23/DATA"

ATTRIBUTION = (
    "World Ocean Atlas 2023, NOAA National Centers for Environmental Information. "
    "Objectively analysed monthly climatological mean for 1991-2020 (decav91C0), one degree. "
    "Read anonymously over OPeNDAP at bake time; no account is needed at any point."
)

#: The two quantities this platform can difference, and how WOA names them. `t_an` and `s_an`
#: are the *objectively analysed* means - the gridded field - rather than `t_mn`, the statistical
#: mean of the observations in each cell, which is missing wherever nobody sampled.
VARIABLES = {
    "temperature": ("temperature", "t", "t_an"),
    "salinity": ("salinity", "s", "s_an"),
}

#: Anything at or beyond this is WOA's fill value (9.96921e36) rather than a measurement.
#: Read from the variable's own `_FillValue` where the server sends one; this is the floor.
_FILL_THRESHOLD = 1e30

_FIELDS = (
    FieldSpec(
        key="temperature_normal_anomaly",
        label="Temperature vs 1991-2020 Normal",
        units="°C",
        palette="balance",
        display_min=-3.0,
        display_max=3.0,
        description=(
            "How far this analysis sits from the World Ocean Atlas 2023 normal for the same "
            "calendar month, averaged over 1991-2020."
        ),
    ),
)


class WoaClimatologySource:
    """WOA 2023's monthly normal for one region, one variable at a time.

    A `GridSource` in shape but not in timeline: `fetch_grid` takes a **month**, not an instant,
    because a climatology has no year. That is the difference that makes it a baseline rather
    than a value, and the type signature says so.
    """

    name = "World Ocean Atlas 2023 (NOAA NCEI)"
    attribution = ATTRIBUTION
    endpoint = "ncei.noaa.gov/thredds-ocean/dodsC/woa23"
    dataset = f"woa23_{DECADE}"

    def fields(self) -> list[FieldSpec]:
        return list(_FIELDS)

    def url_for(self, variable: str, month: int) -> str:
        """The OPeNDAP address of one month's normal. Public, because it is worth being able to
        paste one into a browser and see the same numbers this read."""
        folder, letter, _ = VARIABLES[variable]
        name = f"woa23_{DECADE}_{letter}{month:02d}_01.nc"
        return f"{ROOT}/{folder}/netcdf/{DECADE}/{RESOLUTION}/{name}"

    def fetch_grid(self, variable: str, month: int, bbox: BoundingBox) -> Grid:
        """The normal for one calendar month over one region, on WOA's own 57 Levels.

        The fill value is turned into NaN here rather than downstream. WOA writes 9.96921e36 for
        "no ocean", and 9.96921e36 degrees Celsius differenced against a real analysis is an
        anomaly of about 1e36, which is finite, enormous and would flatten every colour scale it
        touched.
        """
        if variable not in VARIABLES:
            raise ValueError(f"WOA has no {variable}; it carries {', '.join(VARIABLES)}")
        if not 1 <= month <= 12:
            raise ValueError(f"month must be 1 to 12, got {month}")

        dataset = _open(self.url_for(variable, month))
        name = VARIABLES[variable][2]
        subset = dataset[name].isel(time=0).sel(
            lat=slice(bbox.south, bbox.north), lon=slice(bbox.west, bbox.east)
        )

        values = np.asarray(subset.values, dtype=float)
        fill = dataset[name].attrs.get("_FillValue", dataset[name].attrs.get("missing_value"))
        if fill is not None:
            values = np.where(np.isclose(values, float(fill)), np.nan, values)
        values[np.abs(values) >= _FILL_THRESHOLD] = np.nan

        return Grid(
            levels=np.asarray(dataset["depth"].values, dtype=float),
            latitudes=np.asarray(subset["lat"].values, dtype=float),
            longitudes=np.asarray(subset["lon"].values, dtype=float),
            values=values,
        )

    def months_for(self, timesteps) -> set[int]:
        """The calendar months a set of Timesteps needs, so a bake fetches four files and not
        twelve. April to July is four; the whole year would be three times the download."""
        return {when.month for when in timesteps}


@lru_cache(maxsize=8)
def _open(url: str):
    """Open one OPeNDAP dataset, once.

    `decode_times=False` on purpose: WOA's time axis is "months since 1955-01-01" with a value
    that is not a real instant, and xarray's decoder either refuses it or invents a date. There
    is no instant to decode - that is what a climatology is - and the month is in the filename.
    """
    import xarray as xr

    return xr.open_dataset(url, engine="pydap", decode_times=False)


def probe(month: int = 7) -> dict:
    """Ask the server what it holds, for the provenance page and for a bake that wants to say
    the source answered. Returns the shape rather than the data."""
    source = WoaClimatologySource()
    dataset = _open(source.url_for("temperature", month))
    return {
        "url": source.url_for("temperature", month),
        "levels": int(dataset["depth"].sizes["depth"]),
        "deepestMetres": float(dataset["depth"].values[-1]),
        "checked": datetime.now(timezone.utc).isoformat(),
    }
