"""Source Adapters for INCOIS's own public ERDDAP.

Two datasets, one host, one protocol, one class shape.

**`incois_argo_10d_VAM`** is INCOIS's 10-day gridded Argo analysis produced by their Variational
Analysis Methodology. Temperature and salinity on 24 Levels from 5 m to 2000 m, 1 degree, over
the whole Indian Ocean, currently maintained.

This matters for the story: the gridded field and the Profiles we overlay on it are not
unrelated datasets that happen to share an ocean. The analysis is *derived from* Argo
profiles, so a Collocation is a genuine operational question - did the analysis reproduce the
observation that went into it? - and not a contrived apples-to-oranges comparison.

**`incois_argo_10day_McCreary`** is the second analysis of the same floats, by the
Kessler-McCreary method, and it was sitting on the same server unnoticed. Measured on
2026-09-01: 921 steps from 2001-01-10 to 2026-07-30, on **exactly the grid the VAM analysis
uses** - 24 x 60 x 90, 1 degree. Twelve variables instead of four, and three of them are worth
more than a third temperature field would be:

- `T_ROIOBS` - **INCOIS's own count of the observations** behind each cell. This platform
  computes its own Observation Coverage from the Argo casts; now it can be put beside the
  provider's own count instead of asking anyone to take our method on trust.
- `T_RMSE` - **INCOIS's own error estimate** against their analysed mean. Today the honest claim
  is "we show where there is no evidence". With this it becomes "and here is the provider's own
  error, beside ours".
- `T_ANALYZED` - a **second independent analysis of the same water**. Where two analyses of one
  set of floats disagree is a real uncertainty signal, and it costs no new source, no account
  and no new science.

Both classes read the same axes (`ZAX`, `latitude`, `longitude`) through the same request
builder, which is the point of the Source Adapter seam: a second provider dataset is a table of
variable names, not a second pipeline.
"""

from __future__ import annotations

import io
from datetime import datetime, timezone
from functools import lru_cache
from typing import Sequence

import numpy as np
import requests
import xarray as xr

from ..grid import Grid
from ..tls import ca_bundle
from .base import BoundingBox, FieldSpec

_SERVER = "https://erddap.incois.gov.in/erddap/griddap"
_TIMEOUT = 120

VAM_DATASET = "incois_argo_10d_VAM"
MCCREARY_DATASET = "incois_argo_10day_McCreary"

_FIELDS = (
    FieldSpec(
        key="temperature",
        label="Sea Water Temperature",
        units="°C",
        palette="thermal",
        display_min=2.0,
        display_max=31.0,
        group="state",
    ),
    FieldSpec(
        key="salinity",
        label="Sea Water Salinity",
        units="PSU",
        palette="haline",
        display_min=32.0,
        display_max=37.0,
        group="state",
    ),
)

_ERDDAP_VARIABLE = {"temperature": "TEMP", "salinity": "SAL"}


def _fetch(dataset: str, variable: str, timestep: datetime, bbox: BoundingBox) -> Grid:
    """One variable, one Timestep, subset server-side to the region. The only network call here.

    ERDDAP's griddap selector is `[time][depth][lat][lon]`, all in coordinate values rather than
    indices, so the same string works whatever either dataset's axes happen to be.
    """
    stamp = timestep.strftime("%Y-%m-%dT%H:%M:%SZ")
    selector = (
        f"{variable}"
        f"[({stamp}):({stamp})]"
        f"[(5.0):(2000.0)]"
        f"[({bbox.south}):({bbox.north})]"
        f"[({bbox.west}):({bbox.east})]"
    )
    response = requests.get(
        f"{_SERVER}/{dataset}.nc?{selector}", timeout=_TIMEOUT, verify=ca_bundle()
    )
    response.raise_for_status()

    with xr.open_dataset(io.BytesIO(response.content)) as ds:
        data = ds[variable].isel(time=0)
        return Grid(
            levels=ds["ZAX"].values.astype(float),
            latitudes=ds["latitude"].values.astype(float),
            longitudes=ds["longitude"].values.astype(float),
            values=data.values.astype(float),
        )


class IncoisErddapSource:
    """Reads gridded Fields from INCOIS's public ERDDAP - the VAM analysis."""

    name = "INCOIS ERDDAP"
    attribution = (
        "Indian National Centre for Ocean Information Services (INCOIS), Ministry of Earth "
        "Sciences - ARGO 10-day gridded analysis (Variational Analysis Methodology)"
    )
    dataset = VAM_DATASET
    endpoint = f"erddap.incois.gov.in/erddap/griddap/{VAM_DATASET}"

    def fields(self) -> Sequence[FieldSpec]:
        return _FIELDS

    def timesteps(self) -> Sequence[datetime]:
        return _fetch_timesteps(self.dataset)

    def fetch_grid(self, field_key: str, timestep: datetime, bbox: BoundingBox) -> Grid:
        return _fetch(self.dataset, _ERDDAP_VARIABLE[field_key], timestep, bbox)


# What the Kessler-McCreary dataset serves, and what each one is for. The keys are the Field keys
# the rest of the platform uses; the values are INCOIS's own variable names.
#
# `T_ROIOBS` rather than `T_BOXOBS`: the box count is observations inside one 1x1 degree cell,
# which is a very small number and mostly zero, while the region-of-influence count is what the
# analysis actually drew on at that cell. It is the honest counterpart to our own Observation
# Coverage, which also counts in a neighbourhood rather than per cell.
MCCREARY_VARIABLE = {
    "incois_casts": "T_ROIOBS",
    "incois_rmse": "T_RMSE",
    # Not a Field on its own. The bake subtracts it from the VAM analysis to build the spread.
    "mccreary_temperature": "T_ANALYZED",
}

_MCCREARY_FIELDS = (
    FieldSpec(
        key="incois_casts",
        label="INCOIS Cast Count",
        units="casts",
        palette="tempo",
        display_min=0.0,
        display_max=60.0,
        emphasis=0.0,
        opacity=0.05,
        isosurface=False,
        group="evidence",
        description=(
            "How many observations INCOIS's own analysis says it drew on at this point, from "
            "their Kessler-McCreary product. This is the provider's number, not ours. Put it "
            "beside Observation Coverage, which this platform counts itself from the Argo "
            "casts, and the two should agree about where the ocean is watched."
        ),
    ),
    FieldSpec(
        key="incois_rmse",
        label="INCOIS Error Estimate",
        units="°C",
        palette="matter",
        display_min=0.0,
        display_max=2.0,
        emphasis=0.3,
        opacity=0.05,
        # No isosurface. A surface of constant published error draws a mess of disconnected
        # blobs around the thermocline and teaches nothing; analysis_spread keeps its isosurface
        # because "the skin around water the two analyses disagree about by more than X" is a
        # real question.
        isosurface=False,
        group="evidence",
        description=(
            "INCOIS's own root-mean-square error for their temperature analysis at this point. "
            "Published by the provider alongside the analysis, not computed here. Large values "
            "mark water the analysis itself does not claim to know well."
        ),
    ),
)


class IncoisMcCrearySource:
    """Reads INCOIS's second analysis of the same Argo floats, and its evidence channels."""

    name = "INCOIS ERDDAP (Kessler-McCreary)"
    attribution = (
        "Indian National Centre for Ocean Information Services (INCOIS), Ministry of Earth "
        "Sciences - ARGO 10-day gridded analysis (Kessler-McCreary), with the provider's own "
        "observation counts, standard deviation and RMSE"
    )
    dataset = MCCREARY_DATASET
    endpoint = f"erddap.incois.gov.in/erddap/griddap/{MCCREARY_DATASET}"

    def fields(self) -> Sequence[FieldSpec]:
        return _MCCREARY_FIELDS

    def timesteps(self) -> Sequence[datetime]:
        return _fetch_timesteps(self.dataset)

    def fetch_grid(self, field_key: str, timestep: datetime, bbox: BoundingBox) -> Grid:
        return _fetch(self.dataset, MCCREARY_VARIABLE[field_key], timestep, bbox)


@lru_cache(maxsize=4)
def _fetch_timesteps(dataset: str) -> tuple[datetime, ...]:
    response = requests.get(
        f"{_SERVER}/{dataset}.json?time", timeout=_TIMEOUT, verify=ca_bundle()
    )
    response.raise_for_status()
    rows = response.json()["table"]["rows"]
    return tuple(
        datetime.strptime(row[0], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        for row in rows
    )
